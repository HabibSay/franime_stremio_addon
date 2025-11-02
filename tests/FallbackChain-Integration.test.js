// tests/FallbackChain-Integration.test.js
const FallbackChain = require('../poster-system/services/FallbackChain');
const MetricsCollector = require('../poster-system/services/MetricsCollector');
const PosterSource = require('../poster-system/interfaces/PosterSource');

// Mock source avec métriques intégrées
class MockSourceWithMetrics extends PosterSource {
  constructor(name, priority, shouldSucceed = true, delay = 0, shouldThrow = false) {
    super(name, priority);
    this.shouldSucceed = shouldSucceed;
    this.delay = delay;
    this.shouldThrow = shouldThrow;
  }

  async fetchPoster(animeId, animeName) {
    return await this._executeWithMetrics(async () => {
      if (this.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
      
      if (this.shouldThrow) {
        throw new Error('Mock source error');
      }
      
      if (this.shouldSucceed) {
        return `https://example.com/poster-${this.name}-${animeId}.jpg`;
      }
      return null;
    });
  }

  async healthCheck() {
    return this.shouldSucceed && !this.shouldThrow;
  }
}

describe('FallbackChain Integration with Metrics', () => {
  let fallbackChain;
  let metricsCollector;

  beforeEach(() => {
    fallbackChain = new FallbackChain({
      source1: { enabled: true, priority: 1 },
      source2: { enabled: true, priority: 2 },
      source3: { enabled: true, priority: 3 }
    });
    metricsCollector = new MetricsCollector();
  });

  test('should track metrics when sources succeed', async () => {
    const source1 = new MockSourceWithMetrics('source1', 1, true, 100);
    const source2 = new MockSourceWithMetrics('source2', 2, true, 200);
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    // Simuler plusieurs requêtes
    await fallbackChain.fetchPoster('123', 'Test Anime 1');
    await fallbackChain.fetchPoster('456', 'Test Anime 2');

    // Vérifier les métriques de la source
    const source1Metrics = source1.getMetrics();
    expect(source1Metrics.totalRequests).toBe(2);
    expect(source1Metrics.successfulRequests).toBe(2);
    expect(source1Metrics.failedRequests).toBe(0);
    expect(source1Metrics.averageResponseTime).toBeGreaterThan(90);
  });

  test('should track metrics when sources fail and fallback occurs', async () => {
    const source1 = new MockSourceWithMetrics('source1', 1, false); // Échoue
    const source2 = new MockSourceWithMetrics('source2', 2, true);   // Réussit
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    const result = await fallbackChain.fetchPoster('123', 'Test Anime');

    // Vérifier que le fallback a fonctionné
    expect(result.source).toBe('source2');
    expect(result.url).toBe('https://example.com/poster-source2-123.jpg');

    // Vérifier les métriques de source1 (pas de poster trouvé, mais requête réussie)
    const source1Metrics = source1.getMetrics();
    expect(source1Metrics.totalRequests).toBe(1);
    expect(source1Metrics.successfulRequests).toBe(1); // La requête a réussi, mais pas de poster
    expect(source1Metrics.failedRequests).toBe(0);

    // Vérifier les métriques de source2 (succès)
    const source2Metrics = source2.getMetrics();
    expect(source2Metrics.totalRequests).toBe(1);
    expect(source2Metrics.successfulRequests).toBe(1);
    expect(source2Metrics.failedRequests).toBe(0);
  });

  test('should handle circuit breaker activation after consecutive failures', async () => {
    const source1 = new MockSourceWithMetrics('source1', 1, false, 0, true); // Lancer des erreurs
    fallbackChain.registerSource(source1);

    // Simuler plusieurs échecs consécutifs pour déclencher le circuit breaker
    for (let i = 0; i < 12; i++) {
      try {
        await fallbackChain.fetchPoster(`${i}`, `Test Anime ${i}`);
      } catch (error) {
        // Ignorer les erreurs pour ce test
      }
    }

    // Vérifier que la source a été temporairement désactivée
    const source1Metrics = source1.getMetrics();
    expect(source1Metrics.consecutiveFailures).toBeGreaterThanOrEqual(10);
    expect(source1Metrics.isTemporarilyDisabled).toBe(true);
  });

  test('should collect global metrics across multiple sources', async () => {
    const source1 = new MockSourceWithMetrics('source1', 1, true);
    const source2 = new MockSourceWithMetrics('source2', 2, false);
    const source3 = new MockSourceWithMetrics('source3', 3, true);
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);
    fallbackChain.registerSource(source3);

    // Simuler des requêtes avec différents résultats
    const result1 = await fallbackChain.fetchPoster('123', 'Test Anime 1');
    metricsCollector.recordSuccess(result1.source);

    const result2 = await fallbackChain.fetchPoster('456', 'Test Anime 2');
    metricsCollector.recordSuccess(result2.source);

    // Simuler un échec complet
    const source1Failed = new MockSourceWithMetrics('source1', 1, false);
    const source2Failed = new MockSourceWithMetrics('source2', 2, false);
    const source3Failed = new MockSourceWithMetrics('source3', 3, false);
    
    const failedChain = new FallbackChain();
    failedChain.registerSource(source1Failed);
    failedChain.registerSource(source2Failed);
    failedChain.registerSource(source3Failed);

    const result3 = await failedChain.fetchPoster('789', 'Test Anime 3');
    metricsCollector.recordFailure('all_sources_failed');

    // Vérifier les métriques globales
    const globalStats = metricsCollector.getStats();
    expect(globalStats.totalRequests).toBe(3);
    expect(globalStats.successfulRequests).toBe(2);
    expect(globalStats.failedRequests).toBe(1);
    expect(globalStats.successRate).toBeCloseTo(0.667, 2);

    const sourceStats = metricsCollector.getSourceStats();
    expect(sourceStats.source1.success).toBe(2); // source1 a réussi 2 fois
  });

  test('should provide comprehensive health check with metrics', async () => {
    const source1 = new MockSourceWithMetrics('source1', 1, true);
    const source2 = new MockSourceWithMetrics('source2', 2, false);
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    // Faire quelques requêtes pour générer des métriques
    await fallbackChain.fetchPoster('123', 'Test Anime');
    
    const healthResults = await fallbackChain.healthCheckAll();
    
    expect(healthResults.source1.healthy).toBe(true);
    expect(healthResults.source1.metrics).toBeDefined();
    expect(healthResults.source1.metrics.totalRequests).toBeGreaterThan(0);
    
    expect(healthResults.source2.healthy).toBe(false);
    expect(healthResults.source2.metrics).toBeDefined();
  });

  test('should handle timeout scenarios with proper metrics', async () => {
    // Source avec délai long pour simuler timeout
    const slowSource = new MockSourceWithMetrics('slow_source', 1, true, 5000);
    slowSource.timeout = 1000; // Timeout de 1 seconde
    
    fallbackChain.registerSource(slowSource);

    const startTime = Date.now();
    
    try {
      await fallbackChain.fetchPoster('123', 'Test Anime');
    } catch (error) {
      // Le timeout devrait se déclencher
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Vérifier que le timeout s'est bien déclenché (environ 1 seconde)
    expect(duration).toBeLessThan(2000);
    expect(duration).toBeGreaterThan(900);
    
    // Vérifier les métriques d'erreur
    const metrics = slowSource.getMetrics();
    expect(metrics.failedRequests).toBeGreaterThan(0);
  });
});