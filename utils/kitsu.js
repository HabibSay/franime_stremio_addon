// utils/kitsu.js
const fetch = require('node-fetch');
const PosterSource = require('../poster-system/interfaces/PosterSource');

/**
 * Source de posters utilisant l'API Kitsu
 * Implémente l'interface PosterSource avec gestion des métriques et circuit breaker
 */
class KitsuSource extends PosterSource {
  constructor(config = {}) {
    super('kitsu', 1, {
      timeout: 3000,
      enabled: true,
      rateLimit: 30, // 30 requêtes par minute
      ...config
    });
    
    // Configuration spécifique à Kitsu
    this.baseUrl = 'https://kitsu.io/api/edge/anime';
    this.headers = { 'Accept': 'application/vnd.api+json' };
    
    // Circuit breaker state
    this.circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureThreshold = config.failureThreshold || 10;
    this.disableDuration = config.disableDuration || 30 * 60 * 1000; // 30 minutes
    this.nextAttemptTime = 0;
    
    // Rate limiting
    this.requestQueue = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = 60000 / this.config.rateLimit; // ms entre requêtes
  }

  /**
   * Récupère un poster depuis l'API Kitsu
   * @param {string} animeId - ID de l'anime sur Kitsu
   * @param {string} animeName - Nom de l'anime (non utilisé pour Kitsu)
   * @returns {Promise<string|null>} URL du poster ou null
   */
  async fetchPoster(animeId, animeName) {
    // Vérification du circuit breaker
    if (!this._canMakeRequest()) {
      throw new Error(`Circuit breaker ouvert pour ${this.name}`);
    }

    // Validation des paramètres
    if (!animeId || isNaN(animeId)) {
      throw new Error('ID anime invalide pour Kitsu');
    }

    return await this._executeWithMetrics(async () => {
      // Respect du rate limiting
      await this._waitForRateLimit();
      
      const url = `${this.baseUrl}/${animeId}`;
      const response = await fetch(url, {
        headers: this.headers,
        timeout: this.timeout
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // Anime non trouvé, pas une erreur
        }
        throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const poster = data?.data?.attributes?.posterImage;
      const posterUrl = poster?.large || poster?.medium || poster?.original || null;
      
      if (posterUrl) {
        this._onSuccess();
        return posterUrl;
      }
      
      return null;
    });
  }

  /**
   * Vérifie l'état de santé de l'API Kitsu
   * @returns {Promise<boolean>} true si l'API est opérationnelle
   */
  async healthCheck() {
    try {
      // Test avec un anime connu (ID 1 = Cowboy Bebop)
      const testUrl = `${this.baseUrl}/1`;
      const response = await fetch(testUrl, {
        headers: this.headers,
        timeout: 5000 // Timeout plus court pour health check
      });
      
      return response.ok;
    } catch (error) {
      console.warn(`❌ Health check échoué pour ${this.name}:`, error.message);
      return false;
    }
  }

  /**
   * Vérifie si une requête peut être effectuée selon l'état du circuit breaker
   * @private
   * @returns {boolean}
   */
  _canMakeRequest() {
    const now = Date.now();
    
    switch (this.circuitState) {
      case 'CLOSED':
        return true;
        
      case 'OPEN':
        if (now >= this.nextAttemptTime) {
          this.circuitState = 'HALF_OPEN';
          console.log(`🟡 Circuit breaker ${this.name} passe en HALF_OPEN pour test`);
          return true;
        }
        return false;
        
      case 'HALF_OPEN':
        return true;
        
      default:
        return false;
    }
  }

  /**
   * Gère le succès d'une requête pour le circuit breaker
   * @private
   */
  _onSuccess() {
    if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'CLOSED';
      this.metrics.consecutiveFailures = 0;
      this.metrics.isTemporarilyDisabled = false;
      console.log(`🟢 Circuit breaker ${this.name} fermé - service rétabli`);
    }
  }

  /**
   * Gère l'échec d'une requête pour le circuit breaker
   * @private
   */
  _onFailure() {
    if (this.circuitState === 'HALF_OPEN') {
      // En mode HALF_OPEN, un échec remet immédiatement en OPEN
      this.circuitState = 'OPEN';
      this.nextAttemptTime = Date.now() + this.disableDuration;
      this.metrics.isTemporarilyDisabled = true;
      console.warn(`🔴 Circuit breaker ${this.name} réouvert après échec en HALF_OPEN`);
    } else if (this.metrics.consecutiveFailures >= this.failureThreshold) {
      this.circuitState = 'OPEN';
      this.nextAttemptTime = Date.now() + this.disableDuration;
      this.metrics.isTemporarilyDisabled = true;
      
      console.warn(`🔴 Circuit breaker ouvert pour ${this.name} - ${this.metrics.consecutiveFailures} échecs consécutifs`);
      
      // Programmer la réactivation automatique
      setTimeout(() => {
        if (this.circuitState === 'OPEN') {
          this.metrics.isTemporarilyDisabled = false;
        }
      }, this.disableDuration);
    }
  }

  /**
   * Force la fermeture du circuit breaker (pour maintenance)
   * @public
   */
  resetCircuitBreaker() {
    this.circuitState = 'CLOSED';
    this.metrics.consecutiveFailures = 0;
    this.metrics.isTemporarilyDisabled = false;
    this.nextAttemptTime = 0;
    console.log(`🔧 Circuit breaker ${this.name} réinitialisé manuellement`);
  }

  /**
   * Force l'ouverture du circuit breaker (pour maintenance)
   * @public
   * @param {number} duration - Durée de désactivation en millisecondes
   */
  openCircuitBreaker(duration = this.disableDuration) {
    this.circuitState = 'OPEN';
    this.nextAttemptTime = Date.now() + duration;
    this.metrics.isTemporarilyDisabled = true;
    console.log(`🔧 Circuit breaker ${this.name} ouvert manuellement pour ${duration}ms`);
  }

  /**
   * Récupère l'état détaillé du circuit breaker
   * @returns {Object} État complet du circuit breaker
   */
  getCircuitBreakerState() {
    return {
      state: this.circuitState,
      consecutiveFailures: this.metrics.consecutiveFailures,
      failureThreshold: this.failureThreshold,
      nextAttemptTime: this.nextAttemptTime,
      timeUntilNextAttempt: Math.max(0, this.nextAttemptTime - Date.now()),
      isTemporarilyDisabled: this.metrics.isTemporarilyDisabled,
      disableDuration: this.disableDuration
    };
  }

  /**
   * Attend le délai nécessaire pour respecter le rate limiting
   * @private
   * @returns {Promise<void>}
   */
  async _waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Override de la méthode parent pour ajouter la gestion du circuit breaker
   * @protected
   * @param {Error} error - Erreur rencontrée
   * @param {number} responseTime - Temps de réponse
   */
  _recordFailure(error, responseTime = 0) {
    super._recordFailure(error, responseTime);
    this._onFailure();
  }

  /**
   * Récupère les métriques étendues avec l'état du circuit breaker
   * @returns {Object} Métriques complètes
   */
  getMetrics() {
    const baseMetrics = super.getMetrics();
    return {
      ...baseMetrics,
      circuitBreaker: this.getCircuitBreakerState(),
      rateLimit: {
        limit: this.config.rateLimit,
        interval: this.minRequestInterval,
        lastRequestTime: this.lastRequestTime
      },
      configuration: {
        timeout: this.timeout,
        baseUrl: this.baseUrl,
        failureThreshold: this.failureThreshold,
        disableDuration: this.disableDuration
      }
    };
  }
}

// Fonction de compatibilité avec l'ancien code
async function fetchKitsuPoster(animeId) {
  const kitsuSource = new KitsuSource();
  try {
    return await kitsuSource.fetchPoster(animeId, '');
  } catch (error) {
    console.warn(`⚠️ Poster Kitsu indisponible pour ID ${animeId}:`, error.message);
    return null;
  }
}

module.exports = {
  KitsuSource,
  fetchKitsuPoster // Maintient la compatibilité
};