// poster-system/services/CacheService.js
// Service de cache pour les posters avec support TTL et LRU

const fs = require('fs').promises;
const path = require('path');
const { getLogger } = require('../utils/Logger');

/**
 * Service de cache avec TTL et éviction LRU
 */
class CacheService {
  /**
   * @param {Object} config - Configuration du cache
   */
  constructor(config = {}) {
    this.maxSize = config.maxSize || 1000;
    this.defaultTTL = config.ttl || 24 * 60 * 60 * 1000; // 24h
    this.persistToDisk = config.persistToDisk || false;
    this.cacheFilePath = config.cacheFilePath || path.join(__dirname, '../../cache/poster-cache.json');
    this.logger = getLogger();
    
    // Cache principal (Map maintient l'ordre d'insertion pour LRU)
    this.cache = new Map();
    
    // Statistiques
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      size: 0
    };
    
    this.isInitialized = false;
    this._saveTimeout = null; // Pour débouncer les sauvegardes
    
    this.logger.debug('CacheService créé', {
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
      persistToDisk: this.persistToDisk
    }, 'CACHE');
  }

  /**
   * Initialise le service de cache
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) return;
    
    // TODO: Restauration depuis disque si configuré
    if (this.persistToDisk) {
      await this._loadFromDisk();
    }
    
    this.isInitialized = true;
  }

  /**
   * Récupère une entrée du cache
   * @param {string} key - Clé de cache
   * @returns {Promise<PosterCacheEntry|null>} Entrée ou null si expirée/inexistante
   */
  async get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Vérification TTL
    if (this._isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      return null;
    }
    
    // Mise à jour LRU (déplace à la fin) et incrémentation des hits
    this.cache.delete(key);
    const updatedEntry = { ...entry, hits: entry.hits + 1 };
    this.cache.set(key, updatedEntry);
    
    this.stats.hits++;
    return updatedEntry;
  }

  /**
   * Stocke une entrée dans le cache
   * @param {string} key - Clé de cache
   * @param {PosterCacheEntry} entry - Entrée à stocker
   * @returns {Promise<void>}
   */
  async set(key, entry) {
    // Éviction LRU si nécessaire
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
      this.logger.debug(`Éviction LRU: ${firstKey}`, { 
        evictedKey: firstKey, 
        cacheSize: this.cache.size,
        maxSize: this.maxSize
      }, 'CACHE');
    }
    
    // Supprime l'ancienne entrée si elle existe (pour LRU)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Ajoute la nouvelle entrée
    this.cache.set(key, {
      ...entry,
      timestamp: entry.timestamp || Date.now(),
      ttl: entry.ttl || this.defaultTTL,
      hits: entry.hits || 0
    });
    
    this.stats.sets++;
    this.stats.size = this.cache.size;
    
    // Persistance sur disque si configuré (avec débouncing)
    if (this.persistToDisk) {
      this._saveToDisk(); // Appel asynchrone avec débouncing
    }
  }

  /**
   * Invalide une entrée spécifique
   * @param {string} key - Clé à invalider
   * @returns {Promise<boolean>} true si l'entrée existait
   */
  async invalidate(key) {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.stats.size = this.cache.size;
    return existed;
  }

  /**
   * Vide complètement le cache
   * @returns {Promise<void>}
   */
  async clear() {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    this.stats.evictions += previousSize;
    
    // Sauvegarder le cache vide si persistance activée
    if (this.persistToDisk) {
      this._saveToDisk();
    }
  }

  /**
   * Nettoie les entrées expirées
   * @returns {Promise<number>} Nombre d'entrées supprimées
   */
  async cleanup() {
    let cleaned = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (this._isExpired(entry, now)) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    this.stats.size = this.cache.size;
    return cleaned;
  }

  /**
   * Récupère les statistiques du cache
   * @returns {Object} Statistiques actuelles
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      currentSize: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Ferme le service de cache
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Annuler le timeout de sauvegarde en cours
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    
    // Sauvegarder immédiatement si configuré
    if (this.persistToDisk) {
      try {
        // Créer le répertoire si nécessaire
        const cacheDir = path.dirname(this.cacheFilePath);
        await fs.mkdir(cacheDir, { recursive: true });
        
        // Préparer et sauvegarder les données
        const cacheData = {
          version: '1.0',
          timestamp: Date.now(),
          entries: Object.fromEntries(this.cache),
          stats: {
            sets: this.stats.sets,
            evictions: this.stats.evictions,
            size: this.stats.size
          }
        };
        
        await fs.writeFile(this.cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
        console.log(`💾 Cache final sauvegardé: ${this.cache.size} entrées`);
        
      } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde finale du cache:', error.message);
      }
    }
    
    this.cache.clear();
    this.isInitialized = false;
  }

  /**
   * Vérifie si une entrée est expirée
   * @private
   * @param {PosterCacheEntry} entry - Entrée à vérifier
   * @param {number} [now] - Timestamp actuel
   * @returns {boolean} true si expirée
   */
  _isExpired(entry, now = Date.now()) {
    return (entry.timestamp + entry.ttl) < now;
  }

  /**
   * Charge le cache depuis le disque
   * @private
   * @returns {Promise<void>}
   */
  async _loadFromDisk() {
    try {
      // Vérifier si le fichier existe
      await fs.access(this.cacheFilePath);
      
      // Lire et parser le fichier
      const data = await fs.readFile(this.cacheFilePath, 'utf8');
      const cacheData = JSON.parse(data);
      
      // Restaurer les entrées valides (non expirées)
      const now = Date.now();
      let loadedCount = 0;
      let expiredCount = 0;
      
      for (const [key, entry] of Object.entries(cacheData.entries || {})) {
        if (!this._isExpired(entry, now)) {
          this.cache.set(key, entry);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }
      
      // Restaurer les statistiques (partiellement)
      if (cacheData.stats) {
        this.stats.sets = cacheData.stats.sets || 0;
        this.stats.evictions = cacheData.stats.evictions || 0;
      }
      
      this.stats.size = this.cache.size;
      
      this.logger.info(`Cache chargé depuis le disque: ${loadedCount} entrées valides, ${expiredCount} expirées`, {
        loadedCount, expiredCount, totalSize: this.cache.size
      }, 'CACHE');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.info('Aucun fichier de cache trouvé, démarrage avec un cache vide', null, 'CACHE');
      } else {
        this.logger.error('Erreur lors du chargement du cache', error, 'CACHE');
      }
    }
  }

  /**
   * Sauvegarde le cache sur disque avec débouncing
   * @private
   * @returns {Promise<void>}
   */
  async _saveToDisk() {
    // Débouncer les sauvegardes pour éviter trop d'écritures
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }
    
    this._saveTimeout = setTimeout(async () => {
      try {
        // Créer le répertoire si nécessaire
        const cacheDir = path.dirname(this.cacheFilePath);
        await fs.mkdir(cacheDir, { recursive: true });
        
        // Préparer les données à sauvegarder
        const cacheData = {
          version: '1.0',
          timestamp: Date.now(),
          entries: Object.fromEntries(this.cache),
          stats: {
            sets: this.stats.sets,
            evictions: this.stats.evictions,
            size: this.stats.size
          }
        };
        
        // Écrire le fichier de manière atomique (fichier temporaire puis rename)
        const tempFilePath = this.cacheFilePath + '.tmp';
        await fs.writeFile(tempFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
        await fs.rename(tempFilePath, this.cacheFilePath);
        
        console.log(`💾 Cache sauvegardé sur disque: ${this.cache.size} entrées`);
        
      } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde du cache:', error.message);
      }
    }, 1000); // Débounce de 1 seconde
  }
}

module.exports = CacheService;