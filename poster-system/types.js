// poster-system/types.js
// Types et interfaces pour le système de fallback des posters

/**
 * @typedef {Object} SourceMetrics
 * @property {number} totalRequests - Nombre total de requêtes
 * @property {number} successfulRequests - Nombre de requêtes réussies
 * @property {number} failedRequests - Nombre de requêtes échouées
 * @property {number} averageResponseTime - Temps de réponse moyen en ms
 * @property {string|null} lastError - Dernière erreur rencontrée
 * @property {number} consecutiveFailures - Nombre d'échecs consécutifs
 * @property {boolean} isTemporarilyDisabled - Source temporairement désactivée
 * @property {number} lastSuccessTime - Timestamp du dernier succès
 */

/**
 * @typedef {Object} PosterCacheEntry
 * @property {string} animeId - ID de l'anime
 * @property {string} posterUrl - URL du poster
 * @property {string} source - Source qui a fourni le poster
 * @property {number} timestamp - Timestamp de mise en cache
 * @property {number} ttl - Time to live en millisecondes
 * @property {number} hits - Nombre d'accès à cette entrée
 */

/**
 * @typedef {Object} SourceConfig
 * @property {boolean} enabled - Source activée
 * @property {number} timeout - Timeout en millisecondes
 * @property {number} priority - Priorité (1 = plus haute)
 * @property {string} [apiKey] - Clé API si nécessaire
 * @property {number} [rateLimit] - Limite de requêtes par minute
 */

/**
 * @typedef {Object} FallbackConfig
 * @property {Object.<string, SourceConfig>} sources - Configuration des sources
 * @property {Object} cache - Configuration du cache
 * @property {number} cache.ttl - TTL par défaut en millisecondes
 * @property {number} cache.maxSize - Taille maximale du cache
 * @property {Object} circuitBreaker - Configuration du circuit breaker
 * @property {number} circuitBreaker.failureThreshold - Seuil d'échecs pour ouvrir le circuit
 * @property {number} circuitBreaker.disableDuration - Durée de désactivation en millisecondes
 */

/**
 * @typedef {Object} PosterResult
 * @property {string|null} url - URL du poster ou null si non trouvé
 * @property {string} source - Source qui a fourni le poster
 * @property {boolean} fromCache - Indique si le résultat vient du cache
 * @property {number} responseTime - Temps de réponse en millisecondes
 */

module.exports = {
  // Les types sont définis via JSDoc pour compatibilité avec le code existant
  // Pas d'export direct car ce sont des définitions de types
};