// poster-system/PosterManager.js
// Orchestrateur principal du système de fallback des posters

const CacheService = require('./services/CacheService');
const FallbackChain = require('./services/FallbackChain');
const MetricsCollector = require('./services/MetricsCollector');
const { getLogger } = require('./utils/Logger');

/**
 * Gestionnaire principal du système de fallback des posters
 * Coordonne le cache, la chaîne de fallback et les métriques
 */
class PosterManager {
  /**
   * @param {FallbackConfig} config - Configuration du système
   */
  constructor(config = {}) {
    this.config = this._mergeDefaultConfig(config);
    this.logger = getLogger();
    
    // Initialisation des services
    this.cache = new CacheService(this.config.cache);
    this.fallbackChain = new FallbackChain(this.config.sources);
    this.metrics = new MetricsCollector();
    
    // État interne
    this.isInitialized = false;
    this.concurrentRequests = new Map(); // Évite les requêtes dupliquées
    
    this.logger.info('PosterManager créé', { 
      sourcesCount: Object.keys(this.config.sources).length,
      cacheSize: this.config.cache.maxSize,
      cacheTTL: this.config.cache.ttl
    }, 'INIT');
  }

  /**
   * Initialise le gestionnaire de posters
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Initialise le cache (restauration depuis disque si configuré)
      await this.cache.initialize();
      
      // Valide les sources configurées
      await this.fallbackChain.validateSources();
      
      this.isInitialized = true;
      this.logger.info('PosterManager initialisé avec succès', {
        cacheInitialized: true,
        sourcesValidated: true
      }, 'INIT');
    } catch (error) {
      this.logger.error('Erreur lors de l\'initialisation du PosterManager', error, 'INIT');
      throw error;
    }
  }

  /**
   * Récupère un poster pour un anime donné
   * Point d'entrée principal du système
   * @param {string} animeId - ID de l'anime
   * @param {string} animeName - Nom de l'anime
   * @returns {Promise<PosterResult>} Résultat avec URL du poster et métadonnées
   */
  async getPoster(animeId, animeName) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const cacheKey = `${animeId}:${animeName}`;
    const startTime = Date.now();

    // Évite les requêtes dupliquées simultanées
    if (this.concurrentRequests.has(cacheKey)) {
      return await this.concurrentRequests.get(cacheKey);
    }

    const requestPromise = this._getPosterInternal(animeId, animeName, cacheKey, startTime);
    this.concurrentRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.concurrentRequests.delete(cacheKey);
    }
  }

  /**
   * Implémentation interne de la récupération de poster
   * @private
   */
  async _getPosterInternal(animeId, animeName, cacheKey, startTime) {
    try {
      // 1. Vérification du cache
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        this.metrics.recordCacheHit();
        this.logger.cache('HIT', cacheKey, { 
          source: cachedResult.source,
          age: Date.now() - cachedResult.timestamp
        });
        return {
          url: cachedResult.posterUrl,
          source: cachedResult.source,
          fromCache: true,
          responseTime: Date.now() - startTime
        };
      }

      this.metrics.recordCacheMiss();
      this.logger.cache('MISS', cacheKey);

      // 2. Tentative via la chaîne de fallback
      const fallbackResult = await this.fallbackChain.fetchPoster(animeId, animeName);
      
      if (fallbackResult.url) {
        // 3. Mise en cache du résultat
        await this.cache.set(cacheKey, {
          animeId,
          posterUrl: fallbackResult.url,
          source: fallbackResult.source,
          timestamp: Date.now(),
          ttl: this.config.cache.ttl,
          hits: 1
        });

        this.metrics.recordSuccess(fallbackResult.source);
        this.logger.posterSuccess(animeName, fallbackResult.source, fallbackResult.url, Date.now() - startTime);
        this.logger.cache('SET', cacheKey, { source: fallbackResult.source });
      } else {
        this.metrics.recordFailure('all_sources_failed');
        this.logger.warn(`Aucun poster trouvé pour "${animeName}" après tentative de toutes les sources`, {
          animeId, animeName, responseTime: Date.now() - startTime
        });
      }

      return {
        url: fallbackResult.url,
        source: fallbackResult.source,
        fromCache: false,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      this.metrics.recordError(error);
      this.logger.error(`Erreur lors de la récupération du poster pour "${animeName}"`, error);
      
      return {
        url: null,
        source: 'error',
        fromCache: false,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Invalide le cache pour un anime spécifique
   * @param {string} animeId - ID de l'anime
   * @param {string} animeName - Nom de l'anime
   * @returns {Promise<boolean>} true si l'invalidation a réussi
   */
  async invalidateCache(animeId, animeName) {
    const cacheKey = `${animeId}:${animeName}`;
    return await this.cache.invalidate(cacheKey);
  }

  /**
   * Vide complètement le cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    const sizeBefore = this.cache.cache.size;
    await this.cache.clear();
    this.logger.maintenance('Cache vidé', { entriesRemoved: sizeBefore });
  }

  /**
   * Récupère les statistiques globales du système
   * @returns {Object} Statistiques complètes
   */
  getStats() {
    return {
      cache: this.cache.getStats(),
      sources: this.fallbackChain.getSourcesStats(),
      global: this.metrics.getStats(),
      config: {
        cacheSize: this.config.cache.maxSize,
        cacheTTL: this.config.cache.ttl,
        sourcesCount: Object.keys(this.config.sources).length
      }
    };
  }

  /**
   * Met à jour la configuration des sources
   * @param {Object} sourceConfig - Nouvelle configuration des sources
   * @returns {Promise<void>}
   */
  async updateSourceConfig(sourceConfig) {
    this.config.sources = { ...this.config.sources, ...sourceConfig };
    await this.fallbackChain.updateConfig(this.config.sources);
    this.logger.info('Configuration des sources mise à jour', sourceConfig, 'CONFIG');
  }

  /**
   * Active ou désactive une source spécifique
   * @param {string} sourceName - Nom de la source
   * @param {boolean} enabled - État d'activation
   */
  setSourceEnabled(sourceName, enabled) {
    if (this.config.sources[sourceName]) {
      this.config.sources[sourceName].enabled = enabled;
      this.fallbackChain.setSourceEnabled(sourceName, enabled);
      this.logger.info(`Source ${sourceName} ${enabled ? 'activée' : 'désactivée'}`, {
        sourceName, enabled
      }, 'CONFIG');
    }
  }

  /**
   * Force un health check de toutes les sources
   * @returns {Promise<Object>} Résultats des health checks
   */
  async healthCheck() {
    return await this.fallbackChain.healthCheckAll();
  }

  /**
   * Remet à zéro toutes les métriques
   */
  resetMetrics() {
    this.metrics.reset();
    this.fallbackChain.resetMetrics();
    this.logger.maintenance('Métriques remises à zéro');
  }

  /**
   * Ferme proprement le gestionnaire
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.cache) {
      await this.cache.shutdown();
    }
    if (this.fallbackChain) {
      await this.fallbackChain.shutdown();
    }
    this.isInitialized = false;
    this.logger.info('PosterManager fermé', null, 'INIT');
  }

  /**
   * Fusionne la configuration par défaut avec celle fournie
   * @private
   * @param {FallbackConfig} config - Configuration utilisateur
   * @returns {FallbackConfig} Configuration complète
   */
  _mergeDefaultConfig(config) {
    const defaultConfig = {
      sources: {},
      cache: {
        ttl: 24 * 60 * 60 * 1000, // 24 heures
        maxSize: 1000,
        persistToDisk: false
      },
      circuitBreaker: {
        failureThreshold: 10,
        disableDuration: 30 * 60 * 1000 // 30 minutes
      },
      concurrency: {
        maxSimultaneousRequests: 5
      }
    };

    return {
      sources: { ...defaultConfig.sources, ...config.sources },
      cache: { ...defaultConfig.cache, ...config.cache },
      circuitBreaker: { ...defaultConfig.circuitBreaker, ...config.circuitBreaker },
      concurrency: { ...defaultConfig.concurrency, ...config.concurrency }
    };
  }
}

module.exports = PosterManager;