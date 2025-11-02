// poster-system/utils/Logger.js
// Système de logging centralisé pour le système de fallback des posters

const fs = require('fs').promises;
const path = require('path');

/**
 * Niveaux de log avec priorités
 */
const LOG_LEVELS = {
  ERROR: { priority: 0, emoji: '❌', color: '\x1b[31m' },
  WARN: { priority: 1, emoji: '⚠️', color: '\x1b[33m' },
  INFO: { priority: 2, emoji: 'ℹ️', color: '\x1b[36m' },
  DEBUG: { priority: 3, emoji: '🔍', color: '\x1b[37m' }
};

/**
 * Catégories de logs avec emojis spécifiques
 */
const LOG_CATEGORIES = {
  CACHE: '💾',
  FALLBACK: '🔄',
  CIRCUIT_BREAKER: '🔴',
  RATE_LIMIT: '⏳',
  PERFORMANCE: '📊',
  CONFIG: '⚙️',
  MAINTENANCE: '🔧',
  NETWORK: '🌐',
  SUCCESS: '✅',
  INIT: '🚀'
};

/**
 * Logger centralisé pour le système de posters
 */
class Logger {
  constructor(options = {}) {
    this.logLevel = this._parseLogLevel(options.logLevel || process.env.LOG_LEVEL || 'info');
    this.debugMode = options.debugMode || process.env.DEBUG_POSTER_SYSTEM === 'true';
    this.logPerformance = options.logPerformance || process.env.LOG_PERFORMANCE_METRICS !== 'false';
    this.logToFile = options.logToFile || false;
    this.logFilePath = options.logFilePath || path.join(__dirname, '../../logs/poster-system.log');
    
    // Couleurs pour la console
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m'
    };
    
    // Buffer pour les logs de performance
    this.performanceBuffer = [];
    this.maxBufferSize = 100;
    
    // Statistiques des logs
    this.stats = {
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      startTime: Date.now()
    };
  }

  /**
   * Log d'erreur
   * @param {string} message - Message d'erreur
   * @param {Error|Object} error - Erreur ou contexte additionnel
   * @param {string} category - Catégorie du log
   */
  error(message, error = null, category = null) {
    this._log('ERROR', message, error, category);
  }

  /**
   * Log d'avertissement
   * @param {string} message - Message d'avertissement
   * @param {Object} context - Contexte additionnel
   * @param {string} category - Catégorie du log
   */
  warn(message, context = null, category = null) {
    this._log('WARN', message, context, category);
  }

  /**
   * Log d'information
   * @param {string} message - Message d'information
   * @param {Object} context - Contexte additionnel
   * @param {string} category - Catégorie du log
   */
  info(message, context = null, category = null) {
    this._log('INFO', message, context, category);
  }

  /**
   * Log de débogage
   * @param {string} message - Message de débogage
   * @param {Object} context - Contexte additionnel
   * @param {string} category - Catégorie du log
   */
  debug(message, context = null, category = null) {
    if (this.debugMode) {
      this._log('DEBUG', message, context, category);
    }
  }

  /**
   * Log spécialisé pour les opérations de cache
   * @param {string} operation - Type d'opération (HIT, MISS, SET, EVICT)
   * @param {string} key - Clé de cache
   * @param {Object} details - Détails additionnels
   */
  cache(operation, key, details = {}) {
    const message = `Cache ${operation} pour "${key}"`;
    const context = { operation, key, ...details };
    
    if (operation === 'HIT') {
      this.debug(message, context, 'CACHE');
    } else if (operation === 'MISS') {
      this.debug(message, context, 'CACHE');
    } else {
      this.info(message, context, 'CACHE');
    }
  }

  /**
   * Log spécialisé pour les opérations de fallback
   * @param {string} animeName - Nom de l'anime
   * @param {string} fromSource - Source qui a échoué
   * @param {string} toSource - Source de fallback
   * @param {string} reason - Raison du fallback
   */
  fallback(animeName, fromSource, toSource, reason) {
    const message = `Fallback ${fromSource} → ${toSource} pour "${animeName}"`;
    const context = { animeName, fromSource, toSource, reason };
    this.info(message, context, 'FALLBACK');
  }

  /**
   * Log spécialisé pour le circuit breaker
   * @param {string} sourceName - Nom de la source
   * @param {string} state - État du circuit breaker (OPEN, CLOSED, HALF_OPEN)
   * @param {Object} details - Détails additionnels
   */
  circuitBreaker(sourceName, state, details = {}) {
    const stateEmojis = { OPEN: '🔴', CLOSED: '🟢', HALF_OPEN: '🟡' };
    const emoji = stateEmojis[state] || '⚪';
    
    const message = `${emoji} Circuit breaker ${sourceName} ${state.toLowerCase()}`;
    const context = { sourceName, state, ...details };
    
    if (state === 'OPEN') {
      this.warn(message, context, 'CIRCUIT_BREAKER');
    } else {
      this.info(message, context, 'CIRCUIT_BREAKER');
    }
  }

  /**
   * Log spécialisé pour le rate limiting
   * @param {string} sourceName - Nom de la source
   * @param {number} waitTime - Temps d'attente en ms
   * @param {Object} details - Détails additionnels
   */
  rateLimit(sourceName, waitTime, details = {}) {
    const message = `Rate limit ${sourceName}: attente de ${waitTime}ms`;
    const context = { sourceName, waitTime, ...details };
    this.info(message, context, 'RATE_LIMIT');
  }

  /**
   * Log spécialisé pour les métriques de performance
   * @param {string} sourceName - Nom de la source
   * @param {Object} metrics - Métriques de performance
   */
  performance(sourceName, metrics) {
    if (!this.logPerformance) return;
    
    const successRate = ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1);
    const avgTime = metrics.averageResponseTime.toFixed(0);
    
    const message = `Métriques ${sourceName}: ${successRate}% succès, ${avgTime}ms temps moyen`;
    const context = { sourceName, ...metrics };
    
    this.info(message, context, 'PERFORMANCE');
    
    // Ajouter au buffer de performance
    this._addToPerformanceBuffer(sourceName, metrics);
  }

  /**
   * Log spécialisé pour les succès de récupération de posters
   * @param {string} animeName - Nom de l'anime
   * @param {string} source - Source qui a fourni le poster
   * @param {string} posterUrl - URL du poster
   * @param {number} responseTime - Temps de réponse
   */
  posterSuccess(animeName, source, posterUrl, responseTime) {
    const message = `Poster trouvé via ${source} pour "${animeName}"`;
    const context = { animeName, source, posterUrl, responseTime };
    this.info(message, context, 'SUCCESS');
  }

  /**
   * Log spécialisé pour les échecs de récupération de posters
   * @param {string} animeName - Nom de l'anime
   * @param {string} source - Source qui a échoué
   * @param {Error} error - Erreur rencontrée
   */
  posterFailure(animeName, source, error) {
    const message = `Échec ${source} pour "${animeName}": ${error.message}`;
    const context = { animeName, source, error: error.message };
    this.warn(message, context, 'NETWORK');
  }

  /**
   * Log spécialisé pour les opérations de maintenance
   * @param {string} operation - Type d'opération
   * @param {Object} details - Détails de l'opération
   */
  maintenance(operation, details = {}) {
    const message = `Maintenance: ${operation}`;
    const context = { operation, ...details };
    this.info(message, context, 'MAINTENANCE');
  }

  /**
   * Récupère les statistiques des logs
   * @returns {Object} Statistiques complètes
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const total = this.stats.error + this.stats.warn + this.stats.info + this.stats.debug;
    
    return {
      ...this.stats,
      total,
      uptime,
      uptimeFormatted: this._formatUptime(uptime),
      performanceBufferSize: this.performanceBuffer.length,
      config: {
        logLevel: this.logLevel,
        debugMode: this.debugMode,
        logPerformance: this.logPerformance,
        logToFile: this.logToFile
      }
    };
  }

  /**
   * Récupère les métriques de performance récentes
   * @param {number} limit - Nombre d'entrées à retourner
   * @returns {Array} Métriques récentes
   */
  getRecentPerformanceMetrics(limit = 10) {
    return this.performanceBuffer.slice(-limit);
  }

  /**
   * Vide le buffer de performance
   */
  clearPerformanceBuffer() {
    this.performanceBuffer = [];
    this.maintenance('Performance buffer cleared');
  }

  /**
   * Sauvegarde les logs dans un fichier
   * @param {boolean} force - Forcer la sauvegarde même si logToFile est false
   * @returns {Promise<void>}
   */
  async saveToFile(force = false) {
    if (!this.logToFile && !force) return;
    
    try {
      const logDir = path.dirname(this.logFilePath);
      await fs.mkdir(logDir, { recursive: true });
      
      const stats = this.getStats();
      const logData = {
        timestamp: new Date().toISOString(),
        stats,
        recentPerformance: this.getRecentPerformanceMetrics(20)
      };
      
      await fs.writeFile(
        this.logFilePath,
        JSON.stringify(logData, null, 2),
        'utf8'
      );
      
      this.debug(`Logs sauvegardés dans ${this.logFilePath}`);
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des logs:', error.message);
    }
  }

  /**
   * Méthode interne pour effectuer le logging
   * @private
   */
  _log(level, message, context, category) {
    const levelConfig = LOG_LEVELS[level];
    if (levelConfig.priority > this.logLevel) return;
    
    // Incrémenter les statistiques
    this.stats[level.toLowerCase()]++;
    
    // Construire le message formaté
    const timestamp = new Date().toISOString();
    const categoryEmoji = category ? LOG_CATEGORIES[category] || '' : '';
    const emoji = categoryEmoji || levelConfig.emoji;
    
    // Message pour la console
    const consoleMessage = this._formatConsoleMessage(
      timestamp, level, emoji, message, context
    );
    
    // Afficher dans la console
    console.log(consoleMessage);
    
    // Sauvegarder si configuré
    if (this.logToFile) {
      this._appendToFile(timestamp, level, message, context, category);
    }
  }

  /**
   * Formate un message pour la console
   * @private
   */
  _formatConsoleMessage(timestamp, level, emoji, message, context) {
    const levelConfig = LOG_LEVELS[level];
    const timeStr = timestamp.substring(11, 19); // HH:MM:SS
    
    let formatted = `${this.colors.dim}${timeStr}${this.colors.reset} `;
    formatted += `${emoji} ${message}`;
    
    // Ajouter le contexte en mode debug
    if (this.debugMode && context) {
      formatted += `${this.colors.dim} ${JSON.stringify(context)}${this.colors.reset}`;
    }
    
    return formatted;
  }

  /**
   * Ajoute une entrée au buffer de performance
   * @private
   */
  _addToPerformanceBuffer(sourceName, metrics) {
    this.performanceBuffer.push({
      timestamp: Date.now(),
      source: sourceName,
      metrics: { ...metrics }
    });
    
    // Limiter la taille du buffer
    if (this.performanceBuffer.length > this.maxBufferSize) {
      this.performanceBuffer.shift();
    }
  }

  /**
   * Parse le niveau de log depuis une string
   * @private
   */
  _parseLogLevel(levelStr) {
    const level = levelStr.toUpperCase();
    return LOG_LEVELS[level] ? LOG_LEVELS[level].priority : LOG_LEVELS.INFO.priority;
  }

  /**
   * Formate la durée de fonctionnement
   * @private
   */
  _formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Ajoute une entrée au fichier de log
   * @private
   */
  async _appendToFile(timestamp, level, message, context, category) {
    try {
      const logEntry = {
        timestamp,
        level,
        category,
        message,
        context
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.logFilePath, logLine, 'utf8');
    } catch (error) {
      // Éviter les boucles infinies en cas d'erreur de logging
      console.error('❌ Erreur lors de l\'écriture du log:', error.message);
    }
  }
}

// Instance singleton du logger
let loggerInstance = null;

/**
 * Récupère l'instance singleton du logger
 * @param {Object} options - Options de configuration
 * @returns {Logger} Instance du logger
 */
function getLogger(options = {}) {
  if (!loggerInstance) {
    loggerInstance = new Logger(options);
  }
  return loggerInstance;
}

/**
 * Réinitialise l'instance du logger (pour les tests)
 */
function resetLogger() {
  loggerInstance = null;
}

module.exports = {
  Logger,
  getLogger,
  resetLogger,
  LOG_LEVELS,
  LOG_CATEGORIES
};