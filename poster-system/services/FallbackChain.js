// poster-system/services/FallbackChain.js
// Gestionnaire de la chaîne de fallback des sources de posters

const { getLogger } = require('../utils/Logger');

/**
 * Gestionnaire de la chaîne de fallback
 * Coordonne les tentatives séquentielles sur les différentes sources
 */
class FallbackChain {
  /**
   * @param {Object.<string, SourceConfig>} sourcesConfig - Configuration des sources
   */
  constructor(sourcesConfig = {}) {
    this.sourcesConfig = sourcesConfig;
    this.sources = new Map(); // Map<string, PosterSource>
    this.isInitialized = false;
    this.logger = getLogger();
  }

  /**
   * Enregistre une source de poster
   * @param {PosterSource} source - Instance de source à enregistrer
   */
  registerSource(source) {
    this.sources.set(source.name, source);
    this.logger.info(`Source ${source.name} enregistrée`, { 
      sourceName: source.name, 
      priority: source.priority,
      enabled: source.isEnabled 
    }, 'CONFIG');
  }

  /**
   * Valide que toutes les sources configurées sont disponibles
   * @returns {Promise<void>}
   */
  async validateSources() {
    const configuredSources = Object.keys(this.sourcesConfig);
    const registeredSources = Array.from(this.sources.keys());
    
    const missingSources = [];
    for (const sourceName of configuredSources) {
      if (!registeredSources.includes(sourceName)) {
        missingSources.push(sourceName);
        this.logger.warn(`Source configurée '${sourceName}' non enregistrée`, {
          sourceName,
          configuredSources,
          registeredSources
        }, 'CONFIG');
      }
    }
    
    this.logger.info(`${registeredSources.length} sources validées`, {
      registeredSources,
      configuredSources,
      missingSources: missingSources.length > 0 ? missingSources : undefined
    }, 'CONFIG');
  }

  /**
   * Récupère un poster en utilisant la chaîne de fallback
   * @param {string} animeId - ID de l'anime
   * @param {string} animeName - Nom de l'anime
   * @returns {Promise<{url: string|null, source: string}>} Résultat de la recherche
   */
  async fetchPoster(animeId, animeName) {
    const orderedSources = this._getOrderedSources();
    const startTime = Date.now();
    
    this.logger.debug(`Début de la chaîne de fallback pour "${animeName}"`, {
      animeId,
      animeName,
      availableSources: orderedSources.map(s => s.name)
    }, 'FALLBACK');
    
    if (orderedSources.length === 0) {
      this.logger.warn(`Aucune source disponible pour "${animeName}"`, {
        animeId,
        animeName,
        totalSources: this.sources.size
      }, 'FALLBACK');
      return { url: null, source: 'no_sources_available' };
    }

    let lastSource = null;
    for (const source of orderedSources) {
      if (!source.isAvailable()) {
        this.logger.debug(`Source ${source.name} indisponible, passage à la suivante`, {
          sourceName: source.name,
          animeName,
          reason: 'source_unavailable'
        }, 'FALLBACK');
        continue;
      }

      try {
        this.logger.debug(`Tentative de récupération via ${source.name}`, {
          sourceName: source.name,
          animeName,
          animeId,
          attempt: orderedSources.indexOf(source) + 1,
          totalSources: orderedSources.length
        }, 'FALLBACK');
        
        const sourceStartTime = Date.now();
        const posterUrl = await source.fetchPoster(animeId, animeName);
        const sourceResponseTime = Date.now() - sourceStartTime;
        
        if (posterUrl) {
          const totalResponseTime = Date.now() - startTime;
          this.logger.posterSuccess(animeName, source.name, posterUrl, totalResponseTime);
          this.logger.debug(`Chaîne de fallback réussie`, {
            animeName,
            successfulSource: source.name,
            totalResponseTime,
            sourceResponseTime,
            attemptsCount: orderedSources.indexOf(source) + 1
          }, 'FALLBACK');
          return { url: posterUrl, source: source.name };
        } else {
          this.logger.debug(`Aucun poster trouvé via ${source.name}`, {
            sourceName: source.name,
            animeName,
            responseTime: sourceResponseTime
          }, 'FALLBACK');
          
          if (lastSource) {
            this.logger.fallback(animeName, lastSource, source.name, 'no_poster_found');
          }
        }
      } catch (error) {
        this.logger.posterFailure(animeName, source.name, error);
        
        // Circuit breaker: désactive temporairement si trop d'échecs
        const failureThreshold = this._getFailureThreshold();
        if (source.metrics && source.metrics.consecutiveFailures >= failureThreshold) {
          if (typeof source.temporarilyDisable === 'function') {
            source.temporarilyDisable();
          }
          this.logger.circuitBreaker(source.name, 'OPEN', {
            consecutiveFailures: source.metrics.consecutiveFailures,
            threshold: failureThreshold,
            animeName
          });
        }
        
        if (lastSource) {
          this.logger.fallback(animeName, lastSource, source.name, error.message);
        }
      }
      
      lastSource = source.name;
    }

    const totalResponseTime = Date.now() - startTime;
    this.logger.warn(`Échec de toutes les sources pour "${animeName}"`, {
      animeId,
      animeName,
      totalResponseTime,
      sourcesAttempted: orderedSources.map(s => s.name),
      totalSources: orderedSources.length
    }, 'FALLBACK');

    return { url: null, source: 'all_sources_failed' };
  }

  /**
   * Effectue un health check sur toutes les sources
   * @returns {Promise<Object>} Résultats des health checks
   */
  async healthCheckAll() {
    const results = {};
    
    for (const [name, source] of this.sources) {
      const startTime = Date.now();
      try {
        const isHealthy = await source.healthCheck();
        const responseTime = Date.now() - startTime;
        
        results[name] = {
          healthy: isHealthy,
          enabled: source.isEnabled,
          available: source.isAvailable(),
          responseTime,
          metrics: source.getMetrics()
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        results[name] = {
          healthy: false,
          enabled: source.isEnabled,
          available: false,
          responseTime,
          error: error.message,
          metrics: source.getMetrics()
        };
      }
    }
    
    return results;
  }

  /**
   * Met à jour la configuration des sources
   * @param {Object.<string, SourceConfig>} newConfig - Nouvelle configuration
   * @returns {Promise<void>}
   */
  async updateConfig(newConfig) {
    this.sourcesConfig = newConfig;
    
    // Met à jour la configuration de chaque source
    for (const [name, source] of this.sources) {
      if (newConfig[name]) {
        source.setEnabled(newConfig[name].enabled !== false);
        source.timeout = newConfig[name].timeout || source.timeout;
        source.priority = newConfig[name].priority || source.priority;
      }
    }
  }

  /**
   * Active ou désactive une source spécifique
   * @param {string} sourceName - Nom de la source
   * @param {boolean} enabled - État d'activation
   */
  setSourceEnabled(sourceName, enabled) {
    const source = this.sources.get(sourceName);
    if (source) {
      source.setEnabled(enabled);
    }
  }

  /**
   * Récupère les statistiques de toutes les sources
   * @returns {Object} Statistiques par source
   */
  getSourcesStats() {
    const stats = {};
    
    for (const [name, source] of this.sources) {
      stats[name] = {
        ...source.getMetrics(),
        priority: source.priority,
        enabled: source.isEnabled,
        available: source.isAvailable()
      };
    }
    
    return stats;
  }

  /**
   * Remet à zéro les métriques de toutes les sources
   */
  resetMetrics() {
    for (const source of this.sources.values()) {
      source.resetMetrics();
    }
  }

  /**
   * Ferme toutes les sources
   * @returns {Promise<void>}
   */
  async shutdown() {
    for (const source of this.sources.values()) {
      if (typeof source.shutdown === 'function') {
        await source.shutdown();
      }
    }
    this.sources.clear();
  }

  /**
   * Récupère les sources triées par priorité
   * @private
   * @returns {PosterSource[]} Sources triées
   */
  _getOrderedSources() {
    return Array.from(this.sources.values())
      .filter(source => source.isEnabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Récupère le seuil d'échecs pour le circuit breaker
   * @private
   * @returns {number} Seuil d'échecs
   */
  _getFailureThreshold() {
    // TODO: Récupérer depuis la configuration globale
    return 10;
  }
}

module.exports = FallbackChain;