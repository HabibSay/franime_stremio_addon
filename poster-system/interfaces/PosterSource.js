// poster-system/interfaces/PosterSource.js
// Interface commune pour toutes les sources de posters

/**
 * Interface commune que toutes les sources de posters doivent implémenter
 * @abstract
 */
class PosterSource {
  /**
   * @param {string} name - Nom de la source
   * @param {number} priority - Priorité de la source (1 = plus haute)
   * @param {Object} config - Configuration de la source
   */
  constructor(name, priority, config = {}) {
    if (this.constructor === PosterSource) {
      throw new Error('PosterSource est une classe abstraite et ne peut pas être instanciée directement');
    }
    
    this.name = name;
    this.priority = priority;
    this.isEnabled = config.enabled !== false;
    this.timeout = config.timeout || 3000;
    this.config = config;
    
    // Métriques internes
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastError: null,
      consecutiveFailures: 0,
      isTemporarilyDisabled: false,
      lastSuccessTime: 0
    };
    
    // Historique des temps de réponse pour calcul de la moyenne
    this._responseTimes = [];
  }

  /**
   * Récupère un poster pour un anime donné
   * @abstract
   * @param {string} animeId - ID de l'anime
   * @param {string} animeName - Nom de l'anime
   * @returns {Promise<string|null>} URL du poster ou null si non trouvé
   */
  async fetchPoster(animeId, animeName) {
    throw new Error('fetchPoster doit être implémentée par les classes filles');
  }

  /**
   * Vérifie l'état de santé de la source
   * @abstract
   * @returns {Promise<boolean>} true si la source est opérationnelle
   */
  async healthCheck() {
    throw new Error('healthCheck doit être implémentée par les classes filles');
  }

  /**
   * Récupère les métriques de performance de la source
   * @returns {SourceMetrics} Métriques actuelles
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Remet à zéro les métriques
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastError: null,
      consecutiveFailures: 0,
      isTemporarilyDisabled: false,
      lastSuccessTime: 0
    };
    this._responseTimes = [];
  }

  /**
   * Active ou désactive la source
   * @param {boolean} enabled - État d'activation
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (enabled) {
      this.metrics.isTemporarilyDisabled = false;
    }
  }

  /**
   * Désactive temporairement la source
   * @param {number} duration - Durée de désactivation en millisecondes
   */
  temporarilyDisable(duration = 30 * 60 * 1000) { // 30 minutes par défaut
    this.metrics.isTemporarilyDisabled = true;
    setTimeout(() => {
      this.metrics.isTemporarilyDisabled = false;
      this.metrics.consecutiveFailures = 0;
    }, duration);
  }

  /**
   * Enregistre une requête réussie
   * @protected
   * @param {number} responseTime - Temps de réponse en millisecondes
   */
  _recordSuccess(responseTime) {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.consecutiveFailures = 0;
    this.metrics.lastSuccessTime = Date.now();
    this._updateAverageResponseTime(responseTime);
  }

  /**
   * Enregistre une requête échouée
   * @protected
   * @param {Error} error - Erreur rencontrée
   * @param {number} responseTime - Temps de réponse en millisecondes
   */
  _recordFailure(error, responseTime = 0) {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    this.metrics.consecutiveFailures++;
    this.metrics.lastError = error.message;
    if (responseTime > 0) {
      this._updateAverageResponseTime(responseTime);
    }
  }

  /**
   * Met à jour le temps de réponse moyen
   * @private
   * @param {number} responseTime - Nouveau temps de réponse
   */
  _updateAverageResponseTime(responseTime) {
    this._responseTimes.push(responseTime);
    // Garde seulement les 100 derniers temps de réponse
    if (this._responseTimes.length > 100) {
      this._responseTimes.shift();
    }
    this.metrics.averageResponseTime = 
      this._responseTimes.reduce((sum, time) => sum + time, 0) / this._responseTimes.length;
  }

  /**
   * Vérifie si la source est disponible pour une requête
   * @returns {boolean} true si la source peut être utilisée
   */
  isAvailable() {
    return this.isEnabled && !this.metrics.isTemporarilyDisabled;
  }

  /**
   * Exécute une requête avec gestion des métriques et timeout
   * @protected
   * @param {Function} requestFn - Fonction de requête à exécuter
   * @returns {Promise<string|null>} Résultat de la requête
   */
  async _executeWithMetrics(requestFn) {
    if (!this.isAvailable()) {
      throw new Error(`Source ${this.name} n'est pas disponible`);
    }

    const startTime = Date.now();
    
    try {
      // Applique le timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), this.timeout);
      });
      
      const result = await Promise.race([requestFn(), timeoutPromise]);
      const responseTime = Date.now() - startTime;
      
      this._recordSuccess(responseTime);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this._recordFailure(error, responseTime);
      throw error;
    }
  }
}

module.exports = PosterSource;