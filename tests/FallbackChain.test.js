// tests/FallbackChain.test.js
const FallbackChain = require('../poster-system/services/FallbackChain');
const PosterSource = require('../poster-system/interfaces/PosterSource');

// Mock source pour les tests
class MockSource extends PosterSource {
  constructor(name, priority, shouldSucceed = true, delay = 0) {
    super(name, priority);
    this.shouldSucceed = shouldSucceed;
    this.delay = delay;
  }

  async fetchPoster(animeId, animeName) {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }
    
    if (this.shouldSucceed) {
      return `https://example.com/poster-${this.name}-${animeId}.jpg`;
    }
    return null;
  }

  async healthCheck() {
    return this.shouldSucceed;
  }
}

describe('FallbackChain', () => {
  let fallbackChain;

  beforeEach(() => {
    fallbackChain = new FallbackChain({
      source1: { enabled: true, priority: 1 },
      source2: { enabled: true, priority: 2 },
      source3: { enabled: true, priority: 3 }
    });
  });

  test('should register sources correctly', () => {
    const source1 = new MockSource('source1', 1);
    fallbackChain.registerSource(source1);
    
    expect(fallbackChain.sources.has('source1')).toBe(true);
    expect(fallbackChain.sources.get('source1')).toBe(source1);
  });

  test('should fetch poster from first available source', async () => {
    const source1 = new MockSource('source1', 1, true);
    const source2 = new MockSource('source2', 2, true);
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    const result = await fallbackChain.fetchPoster('123', 'Test Anime');
    
    expect(result.url).toBe('https://example.com/poster-source1-123.jpg');
    expect(result.source).toBe('source1');
  });

  test('should fallback to next source when first fails', async () => {
    const source1 = new MockSource('source1', 1, false); // Échoue
    const source2 = new MockSource('source2', 2, true);  // Réussit
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    const result = await fallbackChain.fetchPoster('123', 'Test Anime');
    
    expect(result.url).toBe('https://example.com/poster-source2-123.jpg');
    expect(result.source).toBe('source2');
  });

  test('should return null when all sources fail', async () => {
    const source1 = new MockSource('source1', 1, false);
    const source2 = new MockSource('source2', 2, false);
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    const result = await fallbackChain.fetchPoster('123', 'Test Anime');
    
    expect(result.url).toBe(null);
    expect(result.source).toBe('all_sources_failed');
  });

  test('should respect source priority order', async () => {
    const source1 = new MockSource('source1', 3, true); // Priorité basse
    const source2 = new MockSource('source2', 1, true); // Priorité haute
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    const result = await fallbackChain.fetchPoster('123', 'Test Anime');
    
    // source2 devrait être utilisé en premier car priorité plus haute (1 < 3)
    expect(result.source).toBe('source2');
  });

  test('should skip disabled sources', async () => {
    const source1 = new MockSource('source1', 1, true);
    const source2 = new MockSource('source2', 2, true);
    
    source1.setEnabled(false); // Désactiver source1
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    const result = await fallbackChain.fetchPoster('123', 'Test Anime');
    
    expect(result.source).toBe('source2');
  });

  test('should perform health check on all sources', async () => {
    const source1 = new MockSource('source1', 1, true);
    const source2 = new MockSource('source2', 2, false);
    
    fallbackChain.registerSource(source1);
    fallbackChain.registerSource(source2);

    const healthResults = await fallbackChain.healthCheckAll();
    
    expect(healthResults.source1.healthy).toBe(true);
    expect(healthResults.source2.healthy).toBe(false);
  });
});