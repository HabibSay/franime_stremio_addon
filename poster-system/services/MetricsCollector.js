// poster-system/services/MetricsCollector.js
// Collecteur de métriques globales pour le système de posters

/**
 * Collecteur de métriques globales du système
 */
class MetricsCollector {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      sourceUsage: {}, // Compteurs par source
      errorTypes: {}, // Compteurs par type d'erreur
      startTime: Date.now()
    };
    
    this._responseTimes = [];
  }

  /**
   * Enregistre un hit de cache
   */
  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  /**
   * Enregistre un miss de cache
   */
  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  /**
   * Enregistre une requête réussie
   * @param {string} source - Source qui a fourni le résultat
   * @param {number} [responseTime] - Temps de réponse en millisecondes
   */
  recordSuccess(source, responseTime = 0) {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    
    // Compteur par source
    if (!this.metrics.sourceUsage[source]) {
      this.metrics.sourceUsage[source] = { success: 0, failure: 0 };
    }
    this.metrics.sourceUsage[source].success++;
    
    if (responseTime > 0) {
      this._updateAverageResponseTime(responseTime);
    }
  }

  /**
   * Enregistre une requête échouée
   * @param {string} errorType - Type d'erreur
   * @param {string} [source] - Source qui a échoué
   */
  recordFailure(errorType, source = null) {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    
    // Compteur par type d'erreur
    if (!this.metrics.errorTypes[errorType]) {
      this.metrics.errorTypes[errorType] = 0;
    }
    this.metrics.errorTypes[errorType]++;
    
    // Compteur par source si spécifié
    if (source) {
      if (!this.metrics.sourceUsage[source]) {
        this.metrics.sourceUsage[source] = { success: 0, failure: 0 };
      }
      this.metrics.sourceUsage[source].failure++;
    }
  }

  /**
   * Enregistre une erreur générale
   * @param {Error} error - Erreur rencontrée
   */
  recordError(error) {
    this.recordFailure(error.name || 'UnknownError');
  }

  /**
   * Récupère toutes les métriques
   * @returns {Object} Métriques complètes
   */
  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    const totalCacheRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    
    return {
      ...this.metrics,
      uptime,
      successRate: this.metrics.totalRequests > 0 
        ? this.metrics.successfulRequests / this.metrics.totalRequests 
        : 0,
      cacheHitRate: totalCacheRequests > 0 
        ? this.metrics.cacheHits / totalCacheRequests 
        : 0,
      requestsPerMinute: this.metrics.totalRequests / (uptime / 60000) || 0
    };
  }

  /**
   * Récupère les métriques par source
   * @returns {Object} Métriques détaillées par source
   */
  getSourceStats() {
    const stats = {};
    
    for (const [source, usage] of Object.entries(this.metrics.sourceUsage)) {
      const total = usage.success + usage.failure;
      stats[source] = {
        ...usage,
        total,
        successRate: total > 0 ? usage.success / total : 0
      };
    }
    
    return stats;
  }

  /**
   * Récupère les statistiques d'erreurs
   * @returns {Object} Statistiques par type d'erreur
   */
  getErrorStats() {
    const totalErrors = Object.values(this.metrics.errorTypes)
      .reduce((sum, count) => sum + count, 0);
    
    const stats = {};
    for (const [errorType, count] of Object.entries(this.metrics.errorTypes)) {
      stats[errorType] = {
        count,
        percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0
      };
    }
    
    return stats;
  }

  /**
   * Remet à zéro toutes les métriques
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      sourceUsage: {},
      errorTypes: {},
      startTime: Date.now()
    };
    
    this._responseTimes = [];
  }

  /**
   * Met à jour le temps de réponse moyen
   * @private
   * @param {number} responseTime - Nouveau temps de réponse
   */
  _updateAverageResponseTime(responseTime) {
    this._responseTimes.push(responseTime);
    
    // Garde seulement les 1000 derniers temps de réponse
    if (this._responseTimes.length > 1000) {
      this._responseTimes.shift();
    }
    
    this.metrics.averageResponseTime = 
      this._responseTimes.reduce((sum, time) => sum + time, 0) / this._responseTimes.length;
  }
}

module.exports = MetricsCollector;