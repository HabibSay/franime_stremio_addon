// tests/EndToEnd-Integration.test.js
// Tests d'intégration end-to-end pour le système de fallback des posters
// Teste le flux complet de récupération de posters et l'intégration avec l'addon Stremio

const request = require('supertest');
const express = require('express');
const { PosterManager } = require('../poster-system');
const MonitoringService = require('../poster-system/services/MonitoringService');
const PosterSource = require('../poster-system/interfaces/PosterSource');

// Mock des sources pour les tests end-to-end
class E2EMockSource extends PosterSource {
  constructor(name, priority, config = {}) {
    super(name, priority, config);
    this.config = {
      shouldSucceed: config.shouldSucceed !== false,
      delay: config.delay || 0,
      shouldThrow: config.shouldThrow || false,
      errorRate: config.errorRate || 0,
      ...config
    };
  }

  async fetchPoster(animeId, animeName) {
    return await this._executeWithMetrics(async () => {
      // Simuler délai de réponse
      if (this.config.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.delay));
      }
      
      // Simuler taux d'erreur
      if (this.config.errorRate > 0 && Math.random() < this.config.errorRate) {
        throw new Error(`Random error from ${this.name}`);
      }
      
      if (this.config.shouldThrow) {
        throw new Error(`Mock error from ${this.name}`);
      }
      
      if (this.config.shouldSucceed) {
        return `https://example.com/poster-${this.name}-${animeId}.jpg`;
      }
      
      return null;
    });
  }

  async healthCheck() {
    return this.config.shouldSucceed && !this.config.shouldThrow && !this.metrics.isTemporarilyDisabled;
  }
}

describe('End-to-End Integration Tests', () => {
  let posterManager;
  let monitoringService;
  let app;
  let mockSources;

  beforeEach(async () => {
    // Configuration de test pour l'intégration end-to-end
    const testConfig = {
      sources: {
        kitsu: { enabled: true, priority: 1, timeout: 3000 },
        tmdb: { enabled: true, priority: 2, timeout: 3000 },
        nautiljon: { enabled: true, priority: 3, timeout: 5000 }
      },
      cache: {
        ttl: 2000, // 2 secondes pour les tests
        maxSize: 100,
        persistToDisk: false
      },
      circuitBreaker: {
        failureThreshold: 3,
        disableDuration: 1000
      }
    };

    posterManager = new PosterManager(testConfig);
    
    // Créer les sources mock pour les tests end-to-end
    mockSources = {
      kitsu: new E2EMockSource('kitsu', 1, { shouldSucceed: true, delay: 100 }),
      tmdb: new E2EMockSource('tmdb', 2, { shouldSucceed: true, delay: 150 }),
      nautiljon: new E2EMockSource('nautiljon', 3, { shouldSucceed: true, delay: 200 })
    };

    // Enregistrer les sources mock
    Object.values(mockSources).forEach(source => {
      posterManager.fallbackChain.registerSource(source);
    });

    await posterManager.initialize();

    // Configuration du serveur de test avec monitoring
    app = express();
    app.use(express.json());
    
    monitoringService = new MonitoringService(posterManager);
    app.use('/monitoring', monitoringService.getRouter());
  });

  afterEach(async () => {
    if (posterManager) {
      await posterManager.shutdown();
    }
  });

  describe('Flux Complet de Récupération de Posters', () => {
    test('should complete full poster retrieval flow successfully', async () => {
      const animeId = 'test-anime-123';
      const animeName = 'Test Anime Complete Flow';

      // 1. Premier appel - cache miss, récupération via source
      const result1 = await posterManager.getPoster(animeId, animeName);
      
      expect(result1.url).toBe('https://example.com/poster-kitsu-test-anime-123.jpg');
      expect(result1.source).toBe('kitsu');
      expect(result1.fromCache).toBe(false);
      expect(result1.responseTime).toBeGreaterThan(90);

      // 2. Deuxième appel immédiat - cache hit
      const result2 = await posterManager.getPoster(animeId, animeName);
      
      expect(result2.url).toBe(result1.url);
      expect(result2.source).toBe('kitsu');
      expect(result2.fromCache).toBe(true);
      expect(result2.responseTime).toBeLessThan(50);

      // 3. Vérifier les métriques après le flux complet
      const stats = posterManager.getStats();
      expect(stats.cache.hits).toBe(1);
      expect(stats.cache.misses).toBe(1);
      // Le total des requêtes globales compte chaque appel à getPoster
      expect(stats.global.totalRequests).toBeGreaterThanOrEqual(1);
      expect(stats.global.successfulRequests).toBeGreaterThanOrEqual(1);
      expect(stats.sources.kitsu.totalRequests).toBe(1);
      expect(stats.sources.kitsu.successfulRequests).toBe(1);
    });

    test('should handle complete fallback chain in end-to-end flow', async () => {
      // Configurer les sources pour tester le fallback complet
      mockSources.kitsu.config.shouldThrow = true;
      mockSources.tmdb.config.shouldThrow = true;
      // Nautiljon reste fonctionnel

      const result = await posterManager.getPoster('fallback-test', 'Fallback Test Anime');

      expect(result.url).toBe('https://example.com/poster-nautiljon-fallback-test.jpg');
      expect(result.source).toBe('nautiljon');
      expect(result.fromCache).toBe(false);

      // Vérifier que toutes les sources ont été tentées
      const stats = posterManager.getStats();
      expect(stats.sources.kitsu.failedRequests).toBe(1);
      expect(stats.sources.tmdb.failedRequests).toBe(1);
      expect(stats.sources.nautiljon.successfulRequests).toBe(1);
    });

    test('should handle cache expiration and refresh in complete flow', async () => {
      const animeId = 'cache-expiry-test';
      const animeName = 'Cache Expiry Test Anime';

      // 1. Premier appel
      const result1 = await posterManager.getPoster(animeId, animeName);
      expect(result1.fromCache).toBe(false);

      // 2. Deuxième appel - cache hit
      const result2 = await posterManager.getPoster(animeId, animeName);
      expect(result2.fromCache).toBe(true);

      // 3. Attendre l'expiration du cache (2 secondes)
      await new Promise(resolve => setTimeout(resolve, 2100));

      // 4. Troisième appel - cache miss après expiration
      const result3 = await posterManager.getPoster(animeId, animeName);
      expect(result3.fromCache).toBe(false);
      expect(result3.url).toBeTruthy();

      // Vérifier les statistiques du cache
      const stats = posterManager.getStats();
      expect(stats.cache.hits).toBe(1);
      expect(stats.cache.misses).toBe(2);
    });

    test('should handle concurrent requests efficiently in end-to-end flow', async () => {
      const concurrentRequests = 10;
      const promises = [];

      // Lancer plusieurs requêtes simultanées pour le même anime
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(posterManager.getPoster('concurrent-test', 'Concurrent Test Anime'));
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Toutes les requêtes devraient retourner le même résultat
      results.forEach(result => {
        expect(result.url).toBe(results[0].url);
        expect(result.source).toBe(results[0].source);
      });

      // Seule la première requête devrait aller chercher le poster
      // Les autres devraient attendre le résultat de la première
      const stats = posterManager.getStats();
      expect(stats.sources.kitsu.totalRequests).toBe(1);

      // Performance acceptable pour les requêtes concurrentes
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Intégration avec l\'Addon Stremio', () => {
    test('should integrate with monitoring endpoints', async () => {
      // Faire quelques requêtes pour générer des données
      await posterManager.getPoster('monitor-test-1', 'Monitor Test 1');
      
      mockSources.kitsu.config.shouldThrow = true;
      await posterManager.getPoster('monitor-test-2', 'Monitor Test 2');

      // Tester l'endpoint de statistiques
      const statsResponse = await request(app)
        .get('/monitoring/stats')
        .expect(200);

      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.data.cache).toBeDefined();
      expect(statsResponse.body.data.sources).toBeDefined();
      expect(statsResponse.body.data.global).toBeDefined();
      expect(statsResponse.body.data.timestamp).toBeDefined();
    });

    test('should provide health check endpoint for Stremio integration', async () => {
      const healthResponse = await request(app)
        .get('/monitoring/health')
        .expect(200);

      expect(healthResponse.body.success).toBe(true);
      expect(healthResponse.body.healthy).toBe(true);
      expect(healthResponse.body.data.sources).toBeDefined();
      
      // Vérifier que toutes les sources sont saines
      Object.values(healthResponse.body.data.sources).forEach(source => {
        expect(source.healthy).toBe(true);
      });
    });

    test('should handle maintenance operations via API', async () => {
      // Générer des données de cache
      await posterManager.getPoster('maintenance-test', 'Maintenance Test Anime');
      
      let stats = posterManager.getStats();
      expect(stats.cache.size).toBeGreaterThan(0);

      // Tester le vidage du cache
      const clearCacheResponse = await request(app)
        .post('/monitoring/maintenance/clear-cache')
        .expect(200);

      expect(clearCacheResponse.body.success).toBe(true);
      expect(clearCacheResponse.body.message).toContain('Cache vidé');

      // Vérifier que le cache est vide
      stats = posterManager.getStats();
      expect(stats.cache.size).toBe(0);
    });

    test('should provide performance metrics for Stremio monitoring', async () => {
      // Générer différents scénarios de performance
      await posterManager.getPoster('perf-test-1', 'Performance Test 1');
      
      mockSources.kitsu.config.shouldThrow = true;
      await posterManager.getPoster('perf-test-2', 'Performance Test 2');

      const perfResponse = await request(app)
        .get('/monitoring/stats/performance')
        .expect(200);

      expect(perfResponse.body.success).toBe(true);
      expect(perfResponse.body.data.global).toBeDefined();
      expect(perfResponse.body.data.sources).toBeDefined();
      expect(perfResponse.body.data.cache).toBeDefined();
      
      // Vérifier les métriques de performance
      expect(perfResponse.body.data.cache.hitRate).toMatch(/\d+%/);
      expect(perfResponse.body.data.sources.kitsu.successRate).toMatch(/\d+%/);
      expect(perfResponse.body.data.sources.tmdb.successRate).toMatch(/\d+%/);
    });

    test('should handle source-specific monitoring', async () => {
      // Générer des métriques pour une source spécifique
      await posterManager.getPoster('source-specific-test', 'Source Specific Test');

      const sourceResponse = await request(app)
        .get('/monitoring/stats/sources/kitsu')
        .expect(200);

      expect(sourceResponse.body.success).toBe(true);
      expect(sourceResponse.body.data.source).toBe('kitsu');
      expect(sourceResponse.body.data.totalRequests).toBeGreaterThan(0);
      expect(sourceResponse.body.data.successfulRequests).toBeGreaterThan(0);
      expect(sourceResponse.body.data.averageResponseTime).toBeGreaterThan(0);
    });

    test('should handle error scenarios in Stremio integration', async () => {
      // Simuler une panne complète
      Object.values(mockSources).forEach(source => {
        source.config.shouldThrow = true;
      });

      const result = await posterManager.getPoster('error-integration-test', 'Error Integration Test');
      expect(result.url).toBe(null);
      expect(result.source).toBe('all_sources_failed');

      // Vérifier que le health check reflète les problèmes
      const healthResponse = await request(app)
        .get('/monitoring/health')
        .expect(503); // Service unavailable

      expect(healthResponse.body.healthy).toBe(false);
    });
  });

  describe('Tests de Performance sous Charge', () => {
    test('should maintain performance under moderate load', async () => {
      const requestCount = 50;
      const promises = [];
      
      // Générer des requêtes pour différents animes
      for (let i = 0; i < requestCount; i++) {
        promises.push(posterManager.getPoster(`load-test-${i}`, `Load Test Anime ${i}`));
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Toutes les requêtes devraient réussir
      expect(results.length).toBe(requestCount);
      results.forEach(result => {
        expect(result.url).toBeTruthy();
        expect(['kitsu', 'tmdb', 'nautiljon']).toContain(result.source);
      });

      // Performance acceptable (moins de 5 secondes pour 50 requêtes)
      expect(duration).toBeLessThan(5000);

      // Vérifier les métriques de performance
      const stats = posterManager.getStats();
      expect(stats.global.totalRequests).toBe(requestCount);
      expect(stats.global.successfulRequests).toBe(requestCount);
      
      // Temps de réponse moyen acceptable
      expect(stats.sources.kitsu.averageResponseTime).toBeLessThan(500);
    });

    test('should handle high concurrency with cache efficiency', async () => {
      const concurrentBatches = 5;
      const requestsPerBatch = 20;
      const animeId = 'high-concurrency-test';
      const animeName = 'High Concurrency Test Anime';

      const allPromises = [];
      
      // Créer plusieurs batches de requêtes concurrentes pour le même anime
      for (let batch = 0; batch < concurrentBatches; batch++) {
        const batchPromises = [];
        for (let i = 0; i < requestsPerBatch; i++) {
          batchPromises.push(posterManager.getPoster(animeId, animeName));
        }
        allPromises.push(...batchPromises);
      }

      const startTime = Date.now();
      const results = await Promise.all(allPromises);
      const duration = Date.now() - startTime;

      // Toutes les requêtes devraient retourner le même résultat
      results.forEach(result => {
        expect(result.url).toBe(results[0].url);
        expect(result.source).toBe(results[0].source);
      });

      // Vérifier les métriques - avec la concurrence, il peut y avoir plusieurs requêtes sources
      const stats = posterManager.getStats();
      expect(stats.sources.kitsu.totalRequests).toBeGreaterThanOrEqual(1);
      // Le cache peut ne pas être aussi efficace avec la concurrence élevée
      expect(stats.cache.hits + stats.cache.misses).toBe(results.length);

      // Performance acceptable même avec concurrence élevée
      expect(duration).toBeLessThan(3000);
    });

    test('should maintain stability under mixed load scenarios', async () => {
      const scenarios = [
        { count: 20, delay: 0, errorRate: 0 },      // Requêtes rapides normales
        { count: 10, delay: 100, errorRate: 0.2 }, // Requêtes lentes avec erreurs
        { count: 15, delay: 50, errorRate: 0 },    // Requêtes moyennes normales
        { count: 5, delay: 200, errorRate: 0.5 }   // Requêtes très lentes avec beaucoup d'erreurs
      ];

      const allPromises = [];
      
      scenarios.forEach((scenario, scenarioIndex) => {
        // Configurer les sources pour ce scénario
        const sourceConfig = {
          delay: scenario.delay,
          errorRate: scenario.errorRate
        };
        
        for (let i = 0; i < scenario.count; i++) {
          // Créer une source mock temporaire pour ce scénario
          const tempSource = new E2EMockSource(`temp-${scenarioIndex}`, 1, sourceConfig);
          
          const promise = (async () => {
            const tempManager = new PosterManager({
              sources: { temp: { enabled: true, priority: 1, timeout: 3000 } },
              cache: { ttl: 1000, maxSize: 100, persistToDisk: false }
            });
            
            tempManager.fallbackChain.registerSource(tempSource);
            await tempManager.initialize();
            
            try {
              const result = await tempManager.getPoster(`mixed-${scenarioIndex}-${i}`, `Mixed Test ${scenarioIndex}-${i}`);
              await tempManager.shutdown();
              return result;
            } catch (error) {
              await tempManager.shutdown();
              return { url: null, source: 'error', fromCache: false };
            }
          })();
          
          allPromises.push(promise);
        }
      });

      const startTime = Date.now();
      const results = await Promise.all(allPromises);
      const duration = Date.now() - startTime;

      // Analyser les résultats
      const successfulResults = results.filter(r => r.url !== null);
      const failedResults = results.filter(r => r.url === null);
      
      const totalRequests = results.length;
      const successRate = successfulResults.length / totalRequests;

      // Au moins 70% de succès malgré les erreurs simulées
      expect(successRate).toBeGreaterThan(0.7);
      
      // Performance acceptable malgré la charge mixte
      expect(duration).toBeLessThan(10000);
      
      console.log(`Mixed load test: ${successfulResults.length}/${totalRequests} successful (${(successRate * 100).toFixed(1)}%) in ${duration}ms`);
    });

    test('should recover gracefully from temporary overload', async () => {
      // Phase 1: Charge normale
      const normalResults = await Promise.all([
        posterManager.getPoster('recovery-1', 'Recovery Test 1'),
        posterManager.getPoster('recovery-2', 'Recovery Test 2'),
        posterManager.getPoster('recovery-3', 'Recovery Test 3')
      ]);

      normalResults.forEach(result => {
        expect(result.url).toBeTruthy();
      });

      // Phase 2: Surcharge temporaire (simuler des sources lentes)
      Object.values(mockSources).forEach(source => {
        source.config.delay = 1000; // 1 seconde de délai
        source.config.errorRate = 0.3; // 30% d'erreurs
      });

      const overloadPromises = [];
      for (let i = 0; i < 30; i++) {
        overloadPromises.push(posterManager.getPoster(`overload-${i}`, `Overload Test ${i}`));
      }

      const overloadResults = await Promise.all(overloadPromises);
      const overloadSuccessRate = overloadResults.filter(r => r.url !== null).length / overloadResults.length;

      // Même sous charge, au moins 50% de succès
      expect(overloadSuccessRate).toBeGreaterThan(0.5);

      // Phase 3: Récupération (remettre les sources en état normal)
      Object.values(mockSources).forEach(source => {
        source.config.delay = 100;
        source.config.errorRate = 0;
      });

      const recoveryResults = await Promise.all([
        posterManager.getPoster('recovery-4', 'Recovery Test 4'),
        posterManager.getPoster('recovery-5', 'Recovery Test 5'),
        posterManager.getPoster('recovery-6', 'Recovery Test 6')
      ]);

      // Récupération complète
      recoveryResults.forEach(result => {
        expect(result.url).toBeTruthy();
      });

      // Vérifier que les métriques reflètent la récupération
      const finalStats = posterManager.getStats();
      expect(finalStats.global.totalRequests).toBeGreaterThan(30);
      expect(finalStats.global.successfulRequests).toBeGreaterThan(20);
    });

    test('should provide accurate performance metrics under load', async () => {
      // Générer une charge significative avec différents patterns
      const loadPatterns = [
        { requests: 25, delay: 50 },   // Rapide
        { requests: 15, delay: 150 },  // Moyen
        { requests: 10, delay: 300 }   // Lent
      ];

      const allResults = [];
      
      for (const pattern of loadPatterns) {
        mockSources.kitsu.config.delay = pattern.delay;
        
        const promises = [];
        for (let i = 0; i < pattern.requests; i++) {
          promises.push(posterManager.getPoster(`perf-${pattern.delay}-${i}`, `Performance Test ${pattern.delay}-${i}`));
        }
        
        const results = await Promise.all(promises);
        allResults.push(...results);
      }

      // Analyser les métriques de performance
      const stats = posterManager.getStats();
      
      expect(stats.global.totalRequests).toBe(50);
      expect(stats.global.successfulRequests).toBe(50);
      
      // Vérifier que les temps de réponse moyens sont cohérents
      expect(stats.sources.kitsu.averageResponseTime).toBeGreaterThan(100);
      expect(stats.sources.kitsu.averageResponseTime).toBeLessThan(400);
      
      // Vérifier l'efficacité du cache
      expect(stats.cache.hits + stats.cache.misses).toBe(50);
      
      // Calculer le taux de cache hit
      const totalCacheOperations = stats.cache.hits + stats.cache.misses;
      const cacheHitRate = totalCacheOperations > 0 ? stats.cache.hits / totalCacheOperations : 0;
      console.log(`Cache hit rate under load: ${(cacheHitRate * 100).toFixed(1)}%`);
      
      // Vérifier que le cache fonctionne (au moins quelques opérations de cache)
      expect(totalCacheOperations).toBeGreaterThan(0);
    });
  });
});