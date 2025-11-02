// tests/CacheService.test.js
// Tests unitaires pour CacheService

const CacheService = require('../poster-system/services/CacheService');
const fs = require('fs').promises;
const path = require('path');

// Mock du système de fichiers pour les tests de persistance
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    rename: jest.fn()
  }
}));

describe('CacheService', () => {
  let cacheService;
  const testCacheDir = path.join(__dirname, 'test-cache');
  const testCacheFile = path.join(testCacheDir, 'test-cache.json');

  beforeEach(() => {
    // Réinitialiser les mocks
    jest.clearAllMocks();
    
    // Créer une nouvelle instance pour chaque test
    cacheService = new CacheService({
      maxSize: 3, // Petite taille pour tester l'éviction LRU
      ttl: 1000, // 1 seconde pour tester l'expiration
      persistToDisk: false, // Désactivé par défaut
      cacheFilePath: testCacheFile
    });
  });

  afterEach(async () => {
    // Nettoyer après chaque test
    if (cacheService) {
      await cacheService.shutdown();
    }
  });

  describe('Opérations CRUD du cache', () => {
    beforeEach(async () => {
      await cacheService.initialize();
    });

    test('devrait stocker et récupérer une entrée', async () => {
      const key = 'anime-123';
      const entry = {
        animeId: 'anime-123',
        posterUrl: 'https://example.com/poster.jpg',
        source: 'kitsu',
        timestamp: Date.now(),
        ttl: 5000
      };

      await cacheService.set(key, entry);
      const retrieved = await cacheService.get(key);

      expect(retrieved).toBeTruthy();
      expect(retrieved.animeId).toBe(entry.animeId);
      expect(retrieved.posterUrl).toBe(entry.posterUrl);
      expect(retrieved.source).toBe(entry.source);
      expect(retrieved.hits).toBe(1); // Hits counter is incremented on get()
    });

    test('devrait retourner null pour une clé inexistante', async () => {
      const result = await cacheService.get('inexistant');
      expect(result).toBeNull();
    });

    test('devrait invalider une entrée spécifique', async () => {
      const key = 'anime-456';
      const entry = {
        animeId: 'anime-456',
        posterUrl: 'https://example.com/poster2.jpg',
        source: 'tmdb'
      };

      await cacheService.set(key, entry);
      expect(await cacheService.get(key)).toBeTruthy();

      const wasInvalidated = await cacheService.invalidate(key);
      expect(wasInvalidated).toBe(true);
      expect(await cacheService.get(key)).toBeNull();
    });

    test('devrait retourner false lors de l\'invalidation d\'une clé inexistante', async () => {
      const wasInvalidated = await cacheService.invalidate('inexistant');
      expect(wasInvalidated).toBe(false);
    });

    test('devrait vider complètement le cache', async () => {
      // Ajouter plusieurs entrées
      await cacheService.set('key1', { animeId: '1', posterUrl: 'url1', source: 'kitsu' });
      await cacheService.set('key2', { animeId: '2', posterUrl: 'url2', source: 'tmdb' });
      
      expect(await cacheService.get('key1')).toBeTruthy();
      expect(await cacheService.get('key2')).toBeTruthy();

      await cacheService.clear();

      expect(await cacheService.get('key1')).toBeNull();
      expect(await cacheService.get('key2')).toBeNull();
      
      const stats = cacheService.getStats();
      expect(stats.currentSize).toBe(0);
    });

    test('devrait incrémenter le compteur de hits lors des accès', async () => {
      const key = 'anime-hits';
      const entry = { animeId: 'anime-hits', posterUrl: 'url', source: 'kitsu' };

      await cacheService.set(key, entry);
      
      // Premier accès - l'entrée commence avec hits: 0, puis est incrémentée à 1
      let retrieved = await cacheService.get(key);
      expect(retrieved.hits).toBe(1);
      
      // Deuxième accès - incrémentée à 2
      retrieved = await cacheService.get(key);
      expect(retrieved.hits).toBe(2);
    });
  });

  describe('Expiration TTL et éviction LRU', () => {
    beforeEach(async () => {
      await cacheService.initialize();
    });

    test('devrait expirer les entrées après le TTL', async () => {
      const key = 'anime-expire';
      const entry = {
        animeId: 'anime-expire',
        posterUrl: 'url',
        source: 'kitsu',
        ttl: 100 // 100ms
      };

      await cacheService.set(key, entry);
      expect(await cacheService.get(key)).toBeTruthy();

      // Attendre l'expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(await cacheService.get(key)).toBeNull();
    });

    test('devrait utiliser le TTL par défaut si non spécifié', async () => {
      const key = 'anime-default-ttl';
      const entry = {
        animeId: 'anime-default-ttl',
        posterUrl: 'url',
        source: 'kitsu'
        // Pas de TTL spécifié
      };

      await cacheService.set(key, entry);
      const retrieved = await cacheService.get(key);
      
      expect(retrieved.ttl).toBe(1000); // TTL par défaut configuré
    });

    test('devrait éviter les entrées les plus anciennes (LRU)', async () => {
      // Remplir le cache à sa capacité maximale (3 entrées)
      await cacheService.set('key1', { animeId: '1', posterUrl: 'url1', source: 'kitsu' });
      await cacheService.set('key2', { animeId: '2', posterUrl: 'url2', source: 'tmdb' });
      await cacheService.set('key3', { animeId: '3', posterUrl: 'url3', source: 'nautiljon' });

      // Toutes les entrées doivent être présentes
      expect(await cacheService.get('key1')).toBeTruthy();
      expect(await cacheService.get('key2')).toBeTruthy();
      expect(await cacheService.get('key3')).toBeTruthy();

      // Ajouter une quatrième entrée devrait évincer la première (LRU)
      await cacheService.set('key4', { animeId: '4', posterUrl: 'url4', source: 'kitsu' });

      expect(await cacheService.get('key1')).toBeNull(); // Évincée
      expect(await cacheService.get('key2')).toBeTruthy();
      expect(await cacheService.get('key3')).toBeTruthy();
      expect(await cacheService.get('key4')).toBeTruthy();
    });

    test('devrait maintenir l\'ordre LRU lors des accès', async () => {
      // Remplir le cache
      await cacheService.set('key1', { animeId: '1', posterUrl: 'url1', source: 'kitsu' });
      await cacheService.set('key2', { animeId: '2', posterUrl: 'url2', source: 'tmdb' });
      await cacheService.set('key3', { animeId: '3', posterUrl: 'url3', source: 'nautiljon' });

      // Accéder à key1 pour la rendre plus récente
      await cacheService.get('key1');

      // Ajouter une nouvelle entrée devrait évincer key2 (maintenant la plus ancienne)
      await cacheService.set('key4', { animeId: '4', posterUrl: 'url4', source: 'kitsu' });

      expect(await cacheService.get('key1')).toBeTruthy(); // Toujours présente
      expect(await cacheService.get('key2')).toBeNull(); // Évincée
      expect(await cacheService.get('key3')).toBeTruthy();
      expect(await cacheService.get('key4')).toBeTruthy();
    });

    test('devrait nettoyer les entrées expirées avec cleanup()', async () => {
      // Ajouter des entrées avec différents TTL
      await cacheService.set('expire-fast', { 
        animeId: '1', 
        posterUrl: 'url1', 
        source: 'kitsu',
        ttl: 50 
      });
      await cacheService.set('expire-slow', { 
        animeId: '2', 
        posterUrl: 'url2', 
        source: 'tmdb',
        ttl: 1000 
      });

      // Attendre que la première expire
      await new Promise(resolve => setTimeout(resolve, 100));

      const cleanedCount = await cacheService.cleanup();
      expect(cleanedCount).toBe(1);
      
      expect(await cacheService.get('expire-fast')).toBeNull();
      expect(await cacheService.get('expire-slow')).toBeTruthy();
    });
  });

  describe('Persistance et restauration', () => {
    test('devrait sauvegarder le cache sur disque quand configuré', async () => {
      // Configurer la persistance
      cacheService = new CacheService({
        maxSize: 10,
        ttl: 5000,
        persistToDisk: true,
        cacheFilePath: testCacheFile
      });

      await cacheService.initialize();

      // Ajouter des données
      await cacheService.set('persist-test', {
        animeId: 'persist-test',
        posterUrl: 'https://example.com/poster.jpg',
        source: 'kitsu'
      });

      // Déclencher la sauvegarde
      await cacheService.shutdown();

      // Vérifier que les méthodes de fichier ont été appelées
      expect(fs.mkdir).toHaveBeenCalledWith(testCacheDir, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        testCacheFile,
        expect.stringContaining('persist-test'),
        'utf8'
      );
    });

    test('devrait charger le cache depuis le disque au démarrage', async () => {
      // Mock des données de cache existantes
      const mockCacheData = {
        version: '1.0',
        timestamp: Date.now(),
        entries: {
          'loaded-key': {
            animeId: 'loaded-key',
            posterUrl: 'https://example.com/loaded.jpg',
            source: 'tmdb',
            timestamp: Date.now(),
            ttl: 10000,
            hits: 5
          }
        },
        stats: {
          sets: 10,
          evictions: 2,
          size: 1
        }
      };

      // Mock des appels de fichier
      fs.access.mockResolvedValue(); // Fichier existe
      fs.readFile.mockResolvedValue(JSON.stringify(mockCacheData));

      // Configurer la persistance
      cacheService = new CacheService({
        maxSize: 10,
        ttl: 5000,
        persistToDisk: true,
        cacheFilePath: testCacheFile
      });

      await cacheService.initialize();

      // Vérifier que les données ont été chargées
      const retrieved = await cacheService.get('loaded-key');
      expect(retrieved).toBeTruthy();
      expect(retrieved.animeId).toBe('loaded-key');
      expect(retrieved.posterUrl).toBe('https://example.com/loaded.jpg');
      expect(retrieved.source).toBe('tmdb');

      // Vérifier que les statistiques ont été restaurées
      const stats = cacheService.getStats();
      expect(stats.sets).toBe(10);
      expect(stats.evictions).toBe(2);
    });

    test('devrait ignorer les entrées expirées lors du chargement', async () => {
      const now = Date.now();
      const mockCacheData = {
        version: '1.0',
        timestamp: now,
        entries: {
          'valid-key': {
            animeId: 'valid-key',
            posterUrl: 'https://example.com/valid.jpg',
            source: 'kitsu',
            timestamp: now,
            ttl: 10000 // Valide
          },
          'expired-key': {
            animeId: 'expired-key',
            posterUrl: 'https://example.com/expired.jpg',
            source: 'tmdb',
            timestamp: now - 20000, // Timestamp ancien
            ttl: 1000 // TTL court = expiré
          }
        }
      };

      fs.access.mockResolvedValue();
      fs.readFile.mockResolvedValue(JSON.stringify(mockCacheData));

      cacheService = new CacheService({
        maxSize: 10,
        ttl: 5000,
        persistToDisk: true,
        cacheFilePath: testCacheFile
      });

      await cacheService.initialize();

      // Seule l'entrée valide devrait être chargée
      expect(await cacheService.get('valid-key')).toBeTruthy();
      expect(await cacheService.get('expired-key')).toBeNull();
    });

    test('devrait gérer l\'absence de fichier de cache', async () => {
      // Mock d'erreur ENOENT (fichier non trouvé)
      fs.access.mockRejectedValue({ code: 'ENOENT' });

      cacheService = new CacheService({
        maxSize: 10,
        ttl: 5000,
        persistToDisk: true,
        cacheFilePath: testCacheFile
      });

      // Ne devrait pas lever d'erreur
      await expect(cacheService.initialize()).resolves.not.toThrow();
      
      // Le cache devrait être vide
      const stats = cacheService.getStats();
      expect(stats.currentSize).toBe(0);
    });
  });

  describe('Statistiques et métriques', () => {
    beforeEach(async () => {
      await cacheService.initialize();
    });

    test('devrait suivre les statistiques de base', async () => {
      const initialStats = cacheService.getStats();
      expect(initialStats.hits).toBe(0);
      expect(initialStats.misses).toBe(0);
      expect(initialStats.sets).toBe(0);
      expect(initialStats.evictions).toBe(0);

      // Ajouter une entrée
      await cacheService.set('stats-test', {
        animeId: 'stats-test',
        posterUrl: 'url',
        source: 'kitsu'
      });

      // Accéder à l'entrée (hit)
      await cacheService.get('stats-test');

      // Accéder à une entrée inexistante (miss)
      await cacheService.get('inexistant');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.currentSize).toBe(1);
      expect(stats.maxSize).toBe(3);
    });

    test('devrait calculer le taux de hit correctement', async () => {
      // Ajouter une entrée
      await cacheService.set('hit-rate-test', {
        animeId: 'hit-rate-test',
        posterUrl: 'url',
        source: 'kitsu'
      });

      // 2 hits, 1 miss
      await cacheService.get('hit-rate-test');
      await cacheService.get('hit-rate-test');
      await cacheService.get('inexistant');

      const stats = cacheService.getStats();
      expect(stats.hitRate).toBeCloseTo(2/3, 2); // 66.67%
    });

    test('devrait compter les évictions LRU', async () => {
      // Remplir le cache au maximum
      await cacheService.set('evict1', { animeId: '1', posterUrl: 'url1', source: 'kitsu' });
      await cacheService.set('evict2', { animeId: '2', posterUrl: 'url2', source: 'tmdb' });
      await cacheService.set('evict3', { animeId: '3', posterUrl: 'url3', source: 'nautiljon' });

      let stats = cacheService.getStats();
      expect(stats.evictions).toBe(0);

      // Ajouter une entrée supplémentaire pour déclencher l'éviction
      await cacheService.set('evict4', { animeId: '4', posterUrl: 'url4', source: 'kitsu' });

      stats = cacheService.getStats();
      expect(stats.evictions).toBe(1);
    });

    test('devrait compter les évictions lors du clear', async () => {
      // Ajouter plusieurs entrées
      await cacheService.set('clear1', { animeId: '1', posterUrl: 'url1', source: 'kitsu' });
      await cacheService.set('clear2', { animeId: '2', posterUrl: 'url2', source: 'tmdb' });

      await cacheService.clear();

      const stats = cacheService.getStats();
      expect(stats.evictions).toBe(2); // Les 2 entrées supprimées comptent comme évictions
    });
  });

  describe('Configuration et initialisation', () => {
    test('devrait utiliser les valeurs par défaut', () => {
      const defaultCache = new CacheService();
      
      expect(defaultCache.maxSize).toBe(1000);
      expect(defaultCache.defaultTTL).toBe(24 * 60 * 60 * 1000); // 24h
      expect(defaultCache.persistToDisk).toBe(false);
    });

    test('devrait accepter une configuration personnalisée', () => {
      const customCache = new CacheService({
        maxSize: 500,
        ttl: 3600000, // 1h
        persistToDisk: true,
        cacheFilePath: '/custom/path/cache.json'
      });

      expect(customCache.maxSize).toBe(500);
      expect(customCache.defaultTTL).toBe(3600000);
      expect(customCache.persistToDisk).toBe(true);
      expect(customCache.cacheFilePath).toBe('/custom/path/cache.json');
    });

    test('ne devrait pas permettre l\'initialisation multiple', async () => {
      await cacheService.initialize();
      expect(cacheService.isInitialized).toBe(true);

      // La deuxième initialisation ne devrait rien faire
      await cacheService.initialize();
      expect(cacheService.isInitialized).toBe(true);
    });
  });
});