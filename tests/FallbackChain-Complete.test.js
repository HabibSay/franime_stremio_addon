// tests/FallbackChain-Complete.test.js
// Tests complets de la chaîne de fallback avec différents scénarios de panne

const PosterManager = require('../poster-system/PosterManager');
const FallbackChain = require('../poster-system/services/FallbackChain');
const CacheService = require('../poster-system/services/CacheService');
const MetricsCollector = require('../poster-system/services/MetricsCollector');
const PosterSource = require('../poster-system/interfaces/PosterSource');

// Mock source configurable pour simuler différents scénarios
class ConfigurableMockSource extends PosterSource {
  constructor(name, priority, config = {}) {
    super(name, priority);
    this.config = {
      shouldSucceed: config.shouldSucceed !== false,
      delay: config.delay || 0,
      shouldThrow: config.shouldThrow || false,
      errorType: config.errorType || 'generic',
      intermittentFailure: config.intermittentFailure || false,
      failureRate: config.failureRate || 0,
      ...config
    };
    this.requestCount = 0;
  }

  async fetchPoster(animeId, animeName) {
    return await this._executeWithMetrics(async () => {
      this.requestCount++;
      
      // Simuler délai de réponse
      if (this.config.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.delay));
      }
      
      // Simuler échecs intermittents
      if (this.config.intermittentFailure && this.requestCount % 3 === 0) {
        throw new Error(`Intermittent failure from ${this.name}`);
      }
      
      // Simuler taux d'échec configurable
      if (this.config.failureRate > 0 && Math.random() < this.config.failureRate) {
        throw new Error(`Random failure from ${this.name}`);
      }
      
      // Simuler différents types d'erreurs
      if (this.config.shouldThrow) {
        switch (this.config.errorType) {
          case 'timeout':
            throw new Error('Request timeout');
          case 'network':
            throw new Error('Network error');
          case 'auth':
            throw new Error('Authentication failed');
          case 'rate_limit':
            throw new Error('Rate limit exceeded');
          default:
            throw new Error(`Mock error from ${this.name}`);
        }
      }
      
      if (this.config.shouldSucceed) {
        return `https://example.com/poster-${this.name}-${animeId}.jpg`;
      }
      
      return null; // Pas de poster trouvé
    });
  }

  async healthCheck() {
    return this.config.shouldSucceed && !this.config.shouldThrow;
  }

  // Méthodes pour modifier le comportement pendant les tests
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  simulateRecovery() {
    this.config.shouldThrow = false;
    this.config.shouldSucceed = true;
    this.resetMetrics();
  }

  simulateFailure(errorType = 'generic') {
    this.config.shouldThrow = true;
    this.config.shouldSucceed = false;
    this.config.errorType = errorType;
  }
}

describe('Fallback Chain - Tests Complets', () => {
  let posterManager;
  let fallbackChain;
  let mockSources;

  beforeEach(() => {
    // Configuration de test
    const config = {
      sources: {
        kitsu: { enabled: true, priority: 1, timeout: 3000 },
        tmdb: { enabled: true, priority: 2, timeout: 3000 },
        nautiljon: { enabled: true, priority: 3, timeout: 5000 }
      },
      cache: {
        ttl: 1000, // 1 seconde pour les tests
        maxSize: 100,
        persistToDisk: false
      },
      circuitBreaker: {
        failureThreshold: 3, // Seuil bas pour les tests
        disableDuration: 1000 // 1 seconde pour les tests
      }
    };

    posterManager = new PosterManager(config);
    fallbackChain = posterManager.fallbackChain;

    // Créer les sources mock
    mockSources = {
      kitsu: new ConfigurableMockSource('kitsu', 1, { shouldSucceed: true }),
      tmdb: new ConfigurableMockSource('tmdb', 2, { shouldSucceed: true }),
      nautiljon: new ConfigurableMockSource('nautiljon', 3, { shouldSucceed: true })
    };

    // Enregistrer les sources
    Object.values(mockSources).forEach(source => {
      fallbackChain.registerSource(source);
    });
  });

  afterEach(async () => {
    if (posterManager) {
      await posterManager.shutdown();
    }
  });

  describe('Scénarios de Fallback avec Différentes Pannes', () => {
    test('should fallback when primary source fails', async () => {
      // Kitsu échoue, TMDB réussit
      mockSources.kitsu.simulateFailure('network');
      
      const result = await posterManager.getPoster('123', 'Test Anime');
      
      expect(result.url).toBe('https://example.com/poster-tmdb-123.jpg');
      expect(result.source).toBe('tmdb');
      expect(result.fromCache).toBe(false);
      
      // Vérifier les métriques
      const kitsuMetrics = mockSources.kitsu.getMetrics();
      const tmdbMetrics = mockSources.tmdb.getMetrics();
      
      expect(kitsuMetrics.failedRequests).toBe(1);
      expect(tmdbMetrics.successfulRequests).toBe(1);
    });

    test('should cascade through all sources when multiple fail', async () => {
      // Kitsu et TMDB échouent, Nautiljon réussit
      mockSources.kitsu.simulateFailure('timeout');
      mockSources.tmdb.simulateFailure('auth');
      
      const result = await posterManager.getPoster('456', 'Another Anime');
      
      expect(result.url).toBe('https://example.com/poster-nautiljon-456.jpg');
      expect(result.source).toBe('nautiljon');
      
      // Vérifier que toutes les sources ont été tentées
      expect(mockSources.kitsu.getMetrics().failedRequests).toBe(1);
      expect(mockSources.tmdb.getMetrics().failedRequests).toBe(1);
      expect(mockSources.nautiljon.getMetrics().successfulRequests).toBe(1);
    });

    test('should return null when all sources fail', async () => {
      // Toutes les sources échouent
      mockSources.kitsu.simulateFailure('network');
      mockSources.tmdb.simulateFailure('rate_limit');
      mockSources.nautiljon.simulateFailure('timeout');
      
      const result = await posterManager.getPoster('789', 'Failed Anime');
      
      expect(result.url).toBe(null);
      expect(result.source).toBe('all_sources_failed');
      
      // Vérifier que toutes les sources ont échoué
      Object.values(mockSources).forEach(source => {
        expect(source.getMetrics().failedRequests).toBe(1);
      });
    });

    test('should handle intermittent failures correctly', async () => {
      // Source avec échecs intermittents
      mockSources.kitsu.setConfig({ intermittentFailure: true });
      
      const results = [];
      
      // Faire plusieurs requêtes
      for (let i = 0; i < 6; i++) {
        const result = await posterManager.getPoster(`${i}`, `Anime ${i}`);
        results.push(result);
      }
      
      // Vérifier que certaines requêtes ont réussi via Kitsu, d'autres via TMDB
      const kitsuSuccesses = results.filter(r => r.source === 'kitsu').length;
      const tmdbSuccesses = results.filter(r => r.source === 'tmdb').length;
      
      expect(kitsuSuccesses).toBeGreaterThan(0);
      expect(tmdbSuccesses).toBeGreaterThan(0);
      expect(kitsuSuccesses + tmdbSuccesses).toBe(6);
    });

    test('should activate circuit breaker after consecutive failures', async () => {
      // Configurer Kitsu pour échouer systématiquement
      mockSources.kitsu.simulateFailure('network');
      
      // Faire plusieurs requêtes pour déclencher le circuit breaker
      for (let i = 0; i < 4; i++) {
        await posterManager.getPoster(`${i}`, `Anime ${i}`);
      }
      
      // Vérifier que Kitsu a accumulé des échecs consécutifs
      const kitsuMetrics = mockSources.kitsu.getMetrics();
      expect(kitsuMetrics.consecutiveFailures).toBeGreaterThanOrEqual(3);
      expect(kitsuMetrics.failedRequests).toBeGreaterThanOrEqual(3);
      
      // Toutes les requêtes devraient maintenant utiliser TMDB
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await posterManager.getPoster(`circuit-test-${i}`, `Circuit Test ${i}`);
        results.push(result);
      }
      
      // Vérifier que TMDB est utilisé pour toutes les requêtes
      results.forEach(result => {
        expect(result.source).toBe('tmdb');
      });
    });

    test('should recover from circuit breaker after timeout', async () => {
      // Déclencher des échecs consécutifs
      mockSources.kitsu.simulateFailure('network');
      
      for (let i = 0; i < 4; i++) {
        await posterManager.getPoster(`${i}`, `Anime ${i}`);
      }
      
      // Vérifier les échecs consécutifs
      expect(mockSources.kitsu.getMetrics().consecutiveFailures).toBeGreaterThanOrEqual(3);
      
      // Attendre un peu puis simuler la récupération de la source
      await new Promise(resolve => setTimeout(resolve, 100));
      mockSources.kitsu.simulateRecovery();
      
      // La prochaine requête devrait réessayer Kitsu et réussir
      const result = await posterManager.getPoster('recovery-test', 'Recovery Test Anime');
      expect(result.source).toBe('kitsu');
      expect(result.url).toContain('kitsu');
      
      // Vérifier que les échecs consécutifs ont été remis à zéro
      const recoveredMetrics = mockSources.kitsu.getMetrics();
      expect(recoveredMetrics.consecutiveFailures).toBe(0);
    });
  });

  describe('Tests de Timeout et Gestion d\'Erreurs Globale', () => {
    test('should handle source timeouts correctly', async () => {
      // Configurer une source lente
      mockSources.kitsu.setConfig({ delay: 4000 }); // 4 secondes
      mockSources.kitsu.timeout = 2000; // Timeout de 2 secondes
      
      const startTime = Date.now();
      const result = await posterManager.getPoster('timeout-test', 'Timeout Test Anime');
      const duration = Date.now() - startTime;
      
      // Devrait fallback vers TMDB rapidement
      expect(result.source).toBe('tmdb');
      expect(duration).toBeLessThan(3000); // Moins de 3 secondes total
      
      // Vérifier les métriques de timeout
      const kitsuMetrics = mockSources.kitsu.getMetrics();
      expect(kitsuMetrics.failedRequests).toBeGreaterThan(0);
    });

    test('should handle global timeout for entire fallback chain', async () => {
      // Toutes les sources sont lentes
      Object.values(mockSources).forEach(source => {
        source.setConfig({ delay: 2000 });
      });
      
      const startTime = Date.now();
      const result = await posterManager.getPoster('global-timeout', 'Global Timeout Anime');
      const duration = Date.now() - startTime;
      
      // Devrait se terminer dans un délai raisonnable
      expect(duration).toBeLessThan(10000); // Moins de 10 secondes
      
      // Peut réussir ou échouer selon les timeouts
      expect(['kitsu', 'tmdb', 'nautiljon', 'all_sources_failed']).toContain(result.source);
    });

    test('should handle different error types appropriately', async () => {
      const errorTypes = ['network', 'auth', 'rate_limit', 'timeout'];
      const results = [];
      
      for (let i = 0; i < errorTypes.length; i++) {
        const errorType = errorTypes[i];
        
        // Réinitialiser les sources
        Object.values(mockSources).forEach(source => source.simulateRecovery());
        
        // Faire échouer Kitsu avec un type d'erreur spécifique
        mockSources.kitsu.simulateFailure(errorType);
        
        const result = await posterManager.getPoster(`error-${i}`, `Error Test ${errorType}`);
        results.push({ errorType, result });
      }
      
      // Toutes les requêtes devraient fallback vers TMDB
      results.forEach(({ errorType, result }) => {
        expect(result.source).toBe('tmdb');
        expect(result.url).toContain('tmdb');
      });
    });

    test('should maintain error logs and debugging information', async () => {
      // Simuler différents types d'erreurs
      mockSources.kitsu.simulateFailure('network');
      mockSources.tmdb.simulateFailure('auth');
      
      const result = await posterManager.getPoster('debug-test', 'Debug Test Anime');
      
      // Vérifier les métriques détaillées
      const stats = posterManager.getStats();
      
      expect(stats.sources.kitsu.failedRequests).toBeGreaterThan(0);
      expect(stats.sources.tmdb.failedRequests).toBeGreaterThan(0);
      expect(stats.sources.nautiljon.successfulRequests).toBeGreaterThan(0);
      
      // Vérifier les métriques globales
      expect(stats.global.totalRequests).toBeGreaterThan(0);
      expect(stats.global.successfulRequests).toBeGreaterThan(0); // Au moins Nautiljon a réussi
      
      // Vérifier que les erreurs sont enregistrées
      expect(stats.sources.kitsu.lastError).toContain('Network error');
      expect(stats.sources.tmdb.lastError).toContain('Authentication failed');
    });
  });

  describe('Tests de Collecte de Métriques et Statistiques', () => {
    test('should collect comprehensive metrics during fallback scenarios', async () => {
      // Scénario mixte: succès, échecs, fallbacks
      const scenarios = [
        { kitsu: true, tmdb: true, nautiljon: true },    // Succès Kitsu
        { kitsu: false, tmdb: true, nautiljon: true },   // Fallback vers TMDB
        { kitsu: false, tmdb: false, nautiljon: true },  // Fallback vers Nautiljon
        { kitsu: false, tmdb: false, nautiljon: false }, // Échec complet
        { kitsu: true, tmdb: true, nautiljon: true }     // Succès Kitsu
      ];
      
      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        
        // Configurer les sources selon le scénario
        mockSources.kitsu.setConfig({ shouldSucceed: scenario.kitsu, shouldThrow: !scenario.kitsu });
        mockSources.tmdb.setConfig({ shouldSucceed: scenario.tmdb, shouldThrow: !scenario.tmdb });
        mockSources.nautiljon.setConfig({ shouldSucceed: scenario.nautiljon, shouldThrow: !scenario.nautiljon });
        
        await posterManager.getPoster(`scenario-${i}`, `Scenario ${i} Anime`);
      }
      
      // Analyser les métriques collectées
      const stats = posterManager.getStats();
      
      expect(stats.global.totalRequests).toBe(5);
      expect(stats.global.successfulRequests).toBe(4); // 4 succès sur 5
      expect(stats.global.failedRequests).toBe(1);     // 1 échec complet
      
      // Vérifier les métriques par source
      expect(stats.sources.kitsu.totalRequests).toBe(5);
      expect(stats.sources.kitsu.successfulRequests).toBe(2); // 2 succès Kitsu
      
      expect(stats.sources.tmdb.totalRequests).toBeGreaterThanOrEqual(2); // Appelé quand Kitsu échoue
      expect(stats.sources.tmdb.successfulRequests).toBeGreaterThanOrEqual(1); // Au moins 1 succès TMDB
      
      expect(stats.sources.nautiljon.totalRequests).toBeGreaterThanOrEqual(0); // Peut être appelé
      expect(stats.sources.nautiljon.successfulRequests).toBeGreaterThanOrEqual(0); // Peut réussir
    });

    test('should track response times accurately', async () => {
      // Configurer des délais différents pour chaque source
      mockSources.kitsu.setConfig({ delay: 100 });
      mockSources.tmdb.setConfig({ delay: 200 });
      mockSources.nautiljon.setConfig({ delay: 300 });
      
      // Test avec succès Kitsu (rapide)
      const result1 = await posterManager.getPoster('speed-1', 'Speed Test 1');
      expect(result1.responseTime).toBeGreaterThan(90);
      expect(result1.responseTime).toBeLessThan(200);
      
      // Test avec fallback vers TMDB
      mockSources.kitsu.simulateFailure();
      const result2 = await posterManager.getPoster('speed-2', 'Speed Test 2');
      expect(result2.responseTime).toBeGreaterThan(290); // 100ms (Kitsu fail) + 200ms (TMDB success)
      
      // Vérifier les métriques de temps de réponse
      const kitsuMetrics = mockSources.kitsu.getMetrics();
      const tmdbMetrics = mockSources.tmdb.getMetrics();
      
      expect(kitsuMetrics.averageResponseTime).toBeGreaterThan(90);
      expect(tmdbMetrics.averageResponseTime).toBeGreaterThan(190);
    });

    test('should provide detailed health check with metrics', async () => {
      // Faire quelques requêtes pour générer des métriques
      await posterManager.getPoster('health-1', 'Health Test 1');
      
      mockSources.kitsu.simulateFailure();
      await posterManager.getPoster('health-2', 'Health Test 2');
      
      // Effectuer un health check complet
      const healthResults = await posterManager.healthCheck();
      
      // Vérifier les résultats pour chaque source
      expect(healthResults.kitsu.healthy).toBe(false);
      expect(healthResults.kitsu.metrics.totalRequests).toBe(2);
      expect(healthResults.kitsu.metrics.failedRequests).toBe(1);
      
      expect(healthResults.tmdb.healthy).toBe(true);
      expect(healthResults.tmdb.metrics.totalRequests).toBe(1);
      expect(healthResults.tmdb.metrics.successfulRequests).toBe(1);
      
      expect(healthResults.nautiljon.healthy).toBe(true);
      expect(healthResults.nautiljon.metrics.totalRequests).toBe(0);
    });

    test('should reset metrics correctly', async () => {
      // Générer des métriques
      await posterManager.getPoster('reset-1', 'Reset Test 1');
      mockSources.kitsu.simulateFailure();
      await posterManager.getPoster('reset-2', 'Reset Test 2');
      
      // Vérifier que les métriques existent
      let stats = posterManager.getStats();
      expect(stats.global.totalRequests).toBeGreaterThan(0);
      
      // Réinitialiser les métriques
      posterManager.resetMetrics();
      
      // Vérifier que les métriques sont remises à zéro
      stats = posterManager.getStats();
      expect(stats.global.totalRequests).toBe(0);
      expect(stats.global.successfulRequests).toBe(0);
      expect(stats.global.failedRequests).toBe(0);
      
      // Vérifier les métriques des sources
      Object.values(mockSources).forEach(source => {
        const metrics = source.getMetrics();
        expect(metrics.totalRequests).toBe(0);
        expect(metrics.successfulRequests).toBe(0);
        expect(metrics.failedRequests).toBe(0);
      });
    });

    test('should track cache hit/miss ratios', async () => {
      // Premier appel - cache miss
      const result1 = await posterManager.getPoster('cache-test', 'Cache Test Anime');
      expect(result1.fromCache).toBe(false);
      
      // Deuxième appel immédiat - cache hit
      const result2 = await posterManager.getPoster('cache-test', 'Cache Test Anime');
      expect(result2.fromCache).toBe(true);
      expect(result2.url).toBe(result1.url);
      
      // Attendre l'expiration du cache
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Troisième appel - cache miss après expiration
      const result3 = await posterManager.getPoster('cache-test', 'Cache Test Anime');
      expect(result3.fromCache).toBe(false);
      
      // Vérifier les statistiques du cache
      const stats = posterManager.getStats();
      expect(stats.cache.hits).toBe(1);
      expect(stats.cache.misses).toBe(2);
    });
  });

  describe('Tests d\'Intégration Complète', () => {
    test('should handle complex real-world scenario', async () => {
      // Scénario complexe simulant des conditions réelles
      
      // 1. Kitsu fonctionne normalement au début
      let result = await posterManager.getPoster('complex-1', 'Complex Test 1');
      expect(result.source).toBe('kitsu');
      
      // 2. Kitsu commence à avoir des problèmes intermittents
      mockSources.kitsu.setConfig({ failureRate: 0.5 }); // 50% d'échec
      
      const results = [];
      for (let i = 2; i <= 10; i++) {
        const res = await posterManager.getPoster(`complex-${i}`, `Complex Test ${i}`);
        results.push(res);
      }
      
      // 3. Vérifier la distribution des sources utilisées
      const sourceDistribution = results.reduce((acc, res) => {
        acc[res.source] = (acc[res.source] || 0) + 1;
        return acc;
      }, {});
      
      // Devrait y avoir un mélange de sources
      expect(Object.keys(sourceDistribution).length).toBeGreaterThan(1);
      
      // 4. Simuler une panne complète de Kitsu
      mockSources.kitsu.simulateFailure('network');
      
      // 5. Les requêtes suivantes devraient utiliser TMDB
      for (let i = 11; i <= 15; i++) {
        const res = await posterManager.getPoster(`complex-${i}`, `Complex Test ${i}`);
        expect(res.source).toBe('tmdb');
      }
      
      // 6. Vérifier les métriques finales
      const finalStats = posterManager.getStats();
      expect(finalStats.global.totalRequests).toBe(15);
      expect(finalStats.global.successfulRequests).toBe(15);
      expect(finalStats.sources.kitsu.failedRequests).toBeGreaterThan(0);
      expect(finalStats.sources.tmdb.successfulRequests).toBeGreaterThan(0);
    });

    test('should maintain performance under concurrent load', async () => {
      // Test de charge avec requêtes simultanées
      const concurrentRequests = 20;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(posterManager.getPoster(`concurrent-${i}`, `Concurrent Test ${i}`));
      }
      
      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // Toutes les requêtes devraient réussir
      expect(results.length).toBe(concurrentRequests);
      results.forEach(result => {
        expect(result.url).toBeTruthy();
        expect(['kitsu', 'tmdb', 'nautiljon']).toContain(result.source);
      });
      
      // Performance acceptable (moins de 5 secondes pour 20 requêtes)
      expect(duration).toBeLessThan(5000);
      
      // Vérifier les métriques de concurrence
      const stats = posterManager.getStats();
      expect(stats.global.totalRequests).toBe(concurrentRequests);
    });
  });
});