// poster-system/sources/TMDBSource.js
const https = require('https');
const { URL } = require('url');
const PosterSource = require('../interfaces/PosterSource');

/**
 * Source de posters utilisant l'API TMDB (The Movie Database)
 * Recherche les animes en tant que TV shows ou films
 */
class TMDBSource extends PosterSource {
  constructor(config = {}) {
    super('tmdb', 2, {
      timeout: 3000,
      enabled: true,
      rateLimit: 40, // 40 requêtes par 10 secondes
      apiKey: '07ffec2df46c7ed63e0f39b8d85e705e',
      ...config
    });
    
    // Configuration spécifique à TMDB
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.imageBaseUrl = 'https://image.tmdb.org/t/p/w500';
    this.apiKey = config.apiKey || process.env.TMDB_API_KEY;
    
    if (!this.apiKey) {
      console.warn('⚠️ TMDB API Key manquante - source désactivée');
      this.setEnabled(false);
    }
    
    // Circuit breaker state
    this.circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureThreshold = config.failureThreshold || 10;
    this.disableDuration = config.disableDuration || 30 * 60 * 1000; // 30 minutes
    this.nextAttemptTime = 0;
    
    // Rate limiting - TMDB permet 40 req/10sec
    this.requestQueue = [];
    this.requestTimes = [];
    this.maxRequestsPer10Sec = 40;
    this.rateLimitWindow = 10000; // 10 secondes
  }

  /**
   * Récupère un poster depuis l'API TMDB
   * @param {string} animeId - ID de l'anime (non utilisé pour TMDB)
   * @param {string} animeName - Nom de l'anime à rechercher
   * @returns {Promise<string|null>} URL du poster ou null
   */
  async fetchPoster(animeId, animeName) {
    // Vérification du circuit breaker
    if (!this._canMakeRequest()) {
      throw new Error(`Circuit breaker ouvert pour ${this.name}`);
    }

    // Validation des paramètres
    if (!animeName || typeof animeName !== 'string') {
      throw new Error('Nom d\'anime requis pour TMDB');
    }

    if (!this.apiKey) {
      throw new Error('Clé API TMDB manquante');
    }

    return await this._executeWithMetrics(async () => {
      // Respect du rate limiting
      await this._waitForRateLimit();
      
      // Nettoyer le nom de l'anime pour la recherche
      const cleanAnimeName = this._cleanAnimeName(animeName);
      
      // Essayer d'abord comme TV show, puis comme film
      let posterUrl = await this._searchAsTVShow(cleanAnimeName);
      if (!posterUrl) {
        posterUrl = await this._searchAsMovie(cleanAnimeName);
      }
      
      if (posterUrl) {
        this._onSuccess();
        return posterUrl;
      }
      
      return null;
    });
  }

  /**
   * Recherche l'anime comme une série TV
   * @private
   * @param {string} animeName - Nom nettoyé de l'anime
   * @returns {Promise<string|null>} URL du poster ou null
   */
  async _searchAsTVShow(animeName) {
    try {
      const searchUrl = `${this.baseUrl}/search/tv?api_key=${this.apiKey}&query=${encodeURIComponent(animeName)}&language=fr-FR`;
      const searchResults = await this._makeRequest(searchUrl);
      
      if (searchResults.results && searchResults.results.length > 0) {
        // Prendre le premier résultat avec un poster
        for (const result of searchResults.results) {
          if (result.poster_path) {
            return `${this.imageBaseUrl}${result.poster_path}`;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️ Erreur recherche TV TMDB pour "${animeName}":`, error.message);
      return null;
    }
  }

  /**
   * Recherche l'anime comme un film
   * @private
   * @param {string} animeName - Nom nettoyé de l'anime
   * @returns {Promise<string|null>} URL du poster ou null
   */
  async _searchAsMovie(animeName) {
    try {
      const searchUrl = `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(animeName)}&language=fr-FR`;
      const searchResults = await this._makeRequest(searchUrl);
      
      if (searchResults.results && searchResults.results.length > 0) {
        // Prendre le premier résultat avec un poster
        for (const result of searchResults.results) {
          if (result.poster_path) {
            return `${this.imageBaseUrl}${result.poster_path}`;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️ Erreur recherche film TMDB pour "${animeName}":`, error.message);
      return null;
    }
  }

  /**
   * Nettoie le nom de l'anime pour améliorer la recherche
   * @private
   * @param {string} animeName - Nom original de l'anime
   * @returns {string} Nom nettoyé
   */
  _cleanAnimeName(animeName) {
    return animeName
      .replace(/\s*\([^)]*\)/g, '') // Supprime les parenthèses et leur contenu
      .replace(/\s*\[[^\]]*\]/g, '') // Supprime les crochets et leur contenu
      .replace(/\s*saison\s*\d+/gi, '') // Supprime "saison X"
      .replace(/\s*season\s*\d+/gi, '') // Supprime "season X"
      .replace(/\s*s\d+/gi, '') // Supprime "S1", "S2", etc.
      .replace(/\s+/g, ' ') // Normalise les espaces
      .trim();
  }

  /**
   * Effectue une requête HTTP vers l'API TMDB avec gestion d'erreurs complète
   * @private
   * @param {string} url - URL de la requête
   * @returns {Promise<Object>} Réponse JSON parsée
   */
  async _makeRequest(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FRAnime-Stremio-Addon/1.0'
        },
        timeout: this.timeout
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const jsonData = JSON.parse(data);
              resolve(jsonData);
            } else {
              this._handleHttpError(res.statusCode, res.statusMessage, data, resolve, reject);
            }
          } catch (parseError) {
            reject(new Error(`Erreur parsing JSON: ${parseError.message}`));
          }
        });
      });

      req.on('error', (error) => {
        // Gestion spécifique des erreurs réseau
        if (error.code === 'ENOTFOUND') {
          reject(new Error('Serveur TMDB introuvable - vérifiez votre connexion internet'));
        } else if (error.code === 'ECONNREFUSED') {
          reject(new Error('Connexion refusée par le serveur TMDB'));
        } else if (error.code === 'ECONNRESET') {
          reject(new Error('Connexion interrompue par le serveur TMDB'));
        } else {
          reject(new Error(`Erreur réseau: ${error.message}`));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout de la requête (${this.timeout}ms) - serveur TMDB trop lent`));
      });

      req.end();
    });
  }

  /**
   * Gère les erreurs HTTP spécifiques à l'API TMDB
   * @private
   * @param {number} statusCode - Code de statut HTTP
   * @param {string} statusMessage - Message de statut HTTP
   * @param {string} responseData - Données de réponse brutes
   * @param {Function} resolve - Fonction de résolution de la promesse
   * @param {Function} reject - Fonction de rejet de la promesse
   */
  _handleHttpError(statusCode, statusMessage, responseData, resolve, reject) {
    let errorMessage;
    let shouldResolveEmpty = false;

    switch (statusCode) {
      case 401:
        errorMessage = 'Clé API TMDB invalide ou expirée - vérifiez votre configuration';
        // Désactiver la source si l'authentification échoue
        this.setEnabled(false);
        break;
        
      case 403:
        errorMessage = 'Accès interdit à l\'API TMDB - vérifiez vos permissions';
        break;
        
      case 404:
        // 404 n'est pas une erreur pour les recherches, juste aucun résultat
        shouldResolveEmpty = true;
        break;
        
      case 429:
        // Gestion spéciale du rate limiting
        const retryAfter = this._parseRetryAfter(responseData);
        errorMessage = `Limite de taux TMDB dépassée${retryAfter ? ` - réessayer dans ${retryAfter}s` : ''}`;
        
        // Ajuster le rate limiting si nécessaire
        if (retryAfter) {
          this._adjustRateLimit(retryAfter);
        }
        break;
        
      case 500:
        errorMessage = 'Erreur interne du serveur TMDB - service temporairement indisponible';
        break;
        
      case 502:
      case 503:
      case 504:
        errorMessage = `Serveur TMDB indisponible (${statusCode}) - réessayez plus tard`;
        break;
        
      default:
        errorMessage = `Erreur HTTP ${statusCode}: ${statusMessage}`;
        
        // Tenter de parser la réponse pour plus de détails
        try {
          const errorData = JSON.parse(responseData);
          if (errorData.status_message) {
            errorMessage += ` - ${errorData.status_message}`;
          }
        } catch (e) {
          // Ignorer les erreurs de parsing pour les messages d'erreur
        }
    }

    if (shouldResolveEmpty) {
      resolve({ results: [] });
    } else {
      reject(new Error(errorMessage));
    }
  }

  /**
   * Parse l'en-tête Retry-After de la réponse TMDB
   * @private
   * @param {string} responseData - Données de réponse
   * @returns {number|null} Délai en secondes ou null
   */
  _parseRetryAfter(responseData) {
    try {
      const errorData = JSON.parse(responseData);
      if (errorData.retry_after) {
        return parseInt(errorData.retry_after, 10);
      }
    } catch (e) {
      // Ignorer les erreurs de parsing
    }
    return null;
  }

  /**
   * Ajuste le rate limiting basé sur la réponse du serveur
   * @private
   * @param {number} retryAfter - Délai suggéré par le serveur
   */
  _adjustRateLimit(retryAfter) {
    // Réduire temporairement le nombre de requêtes autorisées
    const originalLimit = this.maxRequestsPer10Sec;
    this.maxRequestsPer10Sec = Math.max(1, Math.floor(this.maxRequestsPer10Sec * 0.5));
    
    console.warn(`⚠️ Rate limit TMDB ajusté: ${originalLimit} → ${this.maxRequestsPer10Sec} req/10sec`);
    
    // Restaurer la limite originale après le délai
    setTimeout(() => {
      this.maxRequestsPer10Sec = originalLimit;
      console.log(`✅ Rate limit TMDB restauré: ${this.maxRequestsPer10Sec} req/10sec`);
    }, retryAfter * 1000 + 5000); // +5s de marge
  }

  /**
   * Vérifie l'état de santé de l'API TMDB
   * @returns {Promise<boolean>} true si l'API est opérationnelle
   */
  async healthCheck() {
    if (!this.apiKey) {
      console.warn(`❌ Health check ${this.name}: Clé API manquante`);
      return false;
    }

    try {
      // Test avec une requête de configuration (plus légère qu'une recherche)
      const testUrl = `${this.baseUrl}/configuration?api_key=${this.apiKey}`;
      const result = await this._makeRequest(testUrl);
      
      // Vérifier que la réponse contient les données attendues
      if (result && result.images && result.images.base_url) {
        console.log(`✅ Health check ${this.name}: API opérationnelle`);
        return true;
      } else {
        console.warn(`❌ Health check ${this.name}: Réponse API invalide`);
        return false;
      }
    } catch (error) {
      console.warn(`❌ Health check échoué pour ${this.name}:`, error.message);
      
      // Si c'est une erreur d'authentification, désactiver la source
      if (error.message.includes('invalide') || error.message.includes('401')) {
        this.setEnabled(false);
        console.error(`🔒 Source ${this.name} désactivée suite à une erreur d'authentification`);
      }
      
      return false;
    }
  }

  /**
   * Valide la configuration de la source TMDB
   * @returns {Object} Résultat de validation avec détails
   */
  validateConfiguration() {
    const issues = [];
    const warnings = [];

    // Vérification de la clé API
    if (!this.apiKey) {
      issues.push('Clé API TMDB manquante (TMDB_API_KEY)');
    } else if (this.apiKey.length < 30) {
      warnings.push('Clé API TMDB semble trop courte');
    }

    // Vérification de la configuration du timeout
    if (this.timeout < 1000) {
      warnings.push('Timeout très court (< 1s) - risque d\'échecs');
    } else if (this.timeout > 10000) {
      warnings.push('Timeout très long (> 10s) - impact sur les performances');
    }

    // Vérification du rate limiting
    if (this.maxRequestsPer10Sec > 40) {
      warnings.push('Rate limit supérieur à la limite TMDB (40 req/10s)');
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      configuration: {
        hasApiKey: !!this.apiKey,
        timeout: this.timeout,
        rateLimit: this.maxRequestsPer10Sec,
        enabled: this.isEnabled
      }
    };
  }

  /**
   * Teste la connectivité et l'authentification TMDB
   * @returns {Promise<Object>} Résultat détaillé du test
   */
  async testConnection() {
    const result = {
      success: false,
      details: {},
      errors: [],
      warnings: []
    };

    // Test de validation de configuration
    const configValidation = this.validateConfiguration();
    if (!configValidation.isValid) {
      result.errors.push(...configValidation.issues);
      return result;
    }
    result.warnings.push(...configValidation.warnings);

    try {
      // Test 1: Configuration API
      console.log('🔍 Test TMDB: Vérification de la configuration...');
      const configUrl = `${this.baseUrl}/configuration?api_key=${this.apiKey}`;
      const configData = await this._makeRequest(configUrl);
      
      result.details.configuration = {
        success: true,
        baseUrl: configData.images?.base_url,
        posterSizes: configData.images?.poster_sizes
      };

      // Test 2: Recherche d'un anime connu
      console.log('🔍 Test TMDB: Recherche d\'un anime test...');
      const searchUrl = `${this.baseUrl}/search/tv?api_key=${this.apiKey}&query=Attack on Titan`;
      const searchData = await this._makeRequest(searchUrl);
      
      result.details.search = {
        success: true,
        resultsCount: searchData.results?.length || 0,
        hasResults: (searchData.results?.length || 0) > 0
      };

      if (result.details.search.resultsCount === 0) {
        result.warnings.push('Aucun résultat pour la recherche test');
      }

      result.success = true;
      console.log('✅ Test TMDB: Tous les tests réussis');

    } catch (error) {
      result.errors.push(error.message);
      console.error('❌ Test TMDB échoué:', error.message);
    }

    return result;
  }  /*
*
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
   * Attend le délai nécessaire pour respecter le rate limiting TMDB (40 req/10sec)
   * @private
   * @returns {Promise<void>}
   */
  async _waitForRateLimit() {
    const now = Date.now();
    
    // Nettoyer les anciennes requêtes (plus de 10 secondes)
    this.requestTimes = this.requestTimes.filter(time => now - time < this.rateLimitWindow);
    
    // Si on a atteint la limite, attendre
    if (this.requestTimes.length >= this.maxRequestsPer10Sec) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = this.rateLimitWindow - (now - oldestRequest) + 100; // +100ms de marge
      
      if (waitTime > 0) {
        console.log(`⏳ Rate limit TMDB: attente de ${waitTime}ms (${this.requestTimes.length}/${this.maxRequestsPer10Sec} requêtes)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Re-nettoyer après l'attente
        this.requestTimes = this.requestTimes.filter(time => Date.now() - time < this.rateLimitWindow);
      }
    }
    
    // Enregistrer cette requête
    this.requestTimes.push(Date.now());
  }

  /**
   * Vérifie si on peut faire une requête sans dépasser le quota
   * @returns {boolean} true si une requête peut être faite immédiatement
   */
  canMakeRequestNow() {
    const now = Date.now();
    const recentRequests = this.requestTimes.filter(time => now - time < this.rateLimitWindow);
    return recentRequests.length < this.maxRequestsPer10Sec;
  }

  /**
   * Estime le délai avant de pouvoir faire la prochaine requête
   * @returns {number} Délai en millisecondes (0 si immédiat)
   */
  getNextRequestDelay() {
    if (this.canMakeRequestNow()) {
      return 0;
    }

    const now = Date.now();
    const recentRequests = this.requestTimes.filter(time => now - time < this.rateLimitWindow);
    
    if (recentRequests.length === 0) {
      return 0;
    }

    const oldestRequest = Math.min(...recentRequests);
    return Math.max(0, this.rateLimitWindow - (now - oldestRequest) + 100);
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
        limit: this.maxRequestsPer10Sec,
        window: this.rateLimitWindow,
        currentRequests: this.requestTimes.length,
        requestTimes: [...this.requestTimes]
      },
      configuration: {
        timeout: this.timeout,
        baseUrl: this.baseUrl,
        imageBaseUrl: this.imageBaseUrl,
        hasApiKey: !!this.apiKey,
        failureThreshold: this.failureThreshold,
        disableDuration: this.disableDuration
      }
    };
  }
}

module.exports = TMDBSource;