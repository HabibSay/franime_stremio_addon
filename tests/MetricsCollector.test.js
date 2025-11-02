// tests/MetricsCollector.test.js
const MetricsCollector = require('../poster-system/services/MetricsCollector');

describe('MetricsCollector', () => {
  let metrics;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  test('should initialize with zero metrics', () => {
    const stats = metrics.getStats();
    
    expect(stats.totalRequests).toBe(0);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(0);
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
  });

  test('should record cache hits correctly', () => {
    metrics.recordCacheHit();
    metrics.recordCacheHit();
    
    const stats = metrics.getStats();
    expect(stats.cacheHits).toBe(2);
  });

  test('should record cache misses correctly', () => {
    metrics.recordCacheMiss();
    metrics.recordCacheMiss();
    metrics.recordCacheMiss();
    
    const stats = metrics.getStats();
    expect(stats.cacheMisses).toBe(3);
  });

  test('should record successful requests with source tracking', () => {
    metrics.recordSuccess('kitsu', 150);
    metrics.recordSuccess('tmdb', 200);
    metrics.recordSuccess('kitsu', 100);
    
    const stats = metrics.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.successfulRequests).toBe(3);
    expect(stats.failedRequests).toBe(0);
    
    const sourceStats = metrics.getSourceStats();
    expect(sourceStats.kitsu.success).toBe(2);
    expect(sourceStats.tmdb.success).toBe(1);
  });

  test('should record failed requests with error tracking', () => {
    metrics.recordFailure('NetworkError', 'kitsu');
    metrics.recordFailure('TimeoutError', 'tmdb');
    metrics.recordFailure('NetworkError');
    
    const stats = metrics.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(3);
    
    const errorStats = metrics.getErrorStats();
    expect(errorStats.NetworkError.count).toBe(2);
    expect(errorStats.TimeoutError.count).toBe(1);
  });

  test('should calculate success rate correctly', () => {
    metrics.recordSuccess('kitsu');
    metrics.recordSuccess('tmdb');
    metrics.recordFailure('NetworkError', 'nautiljon');
    
    const stats = metrics.getStats();
    expect(stats.successRate).toBeCloseTo(0.667, 2); // 2/3
  });

  test('should calculate cache hit rate correctly', () => {
    metrics.recordCacheHit();
    metrics.recordCacheHit();
    metrics.recordCacheMiss();
    
    const stats = metrics.getStats();
    expect(stats.cacheHitRate).toBeCloseTo(0.667, 2); // 2/3
  });

  test('should update average response time correctly', () => {
    metrics.recordSuccess('kitsu', 100);
    metrics.recordSuccess('tmdb', 200);
    metrics.recordSuccess('nautiljon', 300);
    
    const stats = metrics.getStats();
    expect(stats.averageResponseTime).toBe(200); // (100+200+300)/3
  });

  test('should reset metrics correctly', () => {
    metrics.recordSuccess('kitsu', 100);
    metrics.recordFailure('NetworkError');
    metrics.recordCacheHit();
    
    metrics.reset();
    
    const stats = metrics.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(0);
    expect(stats.cacheHits).toBe(0);
    expect(stats.averageResponseTime).toBe(0);
  });

  test('should track source statistics correctly', () => {
    metrics.recordSuccess('kitsu');
    metrics.recordSuccess('kitsu');
    metrics.recordFailure('NetworkError', 'kitsu');
    metrics.recordSuccess('tmdb');
    
    const sourceStats = metrics.getSourceStats();
    
    expect(sourceStats.kitsu.success).toBe(2);
    expect(sourceStats.kitsu.failure).toBe(1);
    expect(sourceStats.kitsu.total).toBe(3);
    expect(sourceStats.kitsu.successRate).toBeCloseTo(0.667, 2);
    
    expect(sourceStats.tmdb.success).toBe(1);
    expect(sourceStats.tmdb.failure).toBe(0);
    expect(sourceStats.tmdb.total).toBe(1);
    expect(sourceStats.tmdb.successRate).toBe(1);
  });

  test('should handle error objects correctly', () => {
    const error = new Error('Test error');
    error.name = 'TestError';
    
    metrics.recordError(error);
    
    const errorStats = metrics.getErrorStats();
    expect(errorStats.TestError.count).toBe(1);
  });
});