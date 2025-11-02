// tests/KitsuSource.test.js
// Tests unitaires pour KitsuSource refactorisée

const { KitsuSource } = require('../utils/kitsu');
const fetch = require('node-fetch');

// Mock de node-fetch
jest.mock('node-fetch');

describe('KitsuSource', () => {
  let kitsuSource;
  const mockFetch = fetch;

  beforeEach(() => {
    // Réinitialiser les mocks
    jest.clearAllMocks();
    
    // Créer une nouvelle instance pour chaque test
    kitsuSource = new KitsuSource({
      timeout: 3000,
      failureThreshold: 3, // Seuil plus bas pour les tests
      disableDuration: 1000 // 1 seconde pour les tests
    });
  });

  afterEach(() => {
    // Nettoyer les timers
    jest.clearAllTimers();
  });

  describe('Interface PosterSource', () => {
    test('devrait implémenter correctement l\'interface PosterSource', () => {
      expect(kitsuSource.name).toBe('kitsu');
      expect(kitsuSource.priority).toBe(1);
      expect(kitsuSource.isEnabled).toBe(true);
      expect(kitsuSource.timeout).toBe(3000);
      expect(typeof kitsuSource.fetchPoster).toBe('function');
      expect(typeof kitsuSource.healthCheck).toBe('function');
      expect(typeof kitsuSource.getMetrics).toBe('function');
    });

    test('devrait avoir les propriétés spécifiques à Kitsu', () => {
      expect(kitsuSource.baseUrl).toBe('https://kitsu.io/api/edge/anime');
      expect(kitsuSource.headers).toEqual({ 'Accept': 'application/vnd.api+json' });
      expect(kitsuSource.circuitState).toBe('CLOSED');
      expect(kitsuSource.failureThreshold).toBe(3);
    });

    test('devrait être disponible par défaut', () => {
      expect(kitsuSource.isAvailable()).toBe(true);
    });

    test('devrait pouvoir être désactivé', () => {
      kitsuSource.setEnabled(false);
      expect(kitsuSource.isEnabled).toBe(false);
      expect(kitsuSource.isAvailable()).toBe(false);
    });
  });

  describe('fetchPoster - Succès', () => {
    test('devrait récupérer un poster avec succès', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            attributes: {
              posterImage: {
                large: 'https://example.com/poster-large.jpg',
                medium: 'https://example.com/poster-medium.jpg'
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await kitsuSource.fetchPoster('123', 'Test Anime');

      expect(result).toBe('https://example.com/poster-large.jpg');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://kitsu.io/api/edge/anime/123',
        {
          headers: { 'Accept': 'application/vnd.api+json' },
          timeout: 3000
        }
      );
    });

    test('devrait utiliser medium si large n\'est pas disponible', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            attributes: {
              posterImage: {
                medium: 'https://example.com/poster-medium.jpg',
                original: 'https://example.com/poster-original.jpg'
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await kitsuSource.fetchPoster('123', 'Test Anime');

      expect(result).toBe('https://example.com/poster-medium.jpg');
    });

    test('devrait utiliser original si ni large ni medium ne sont disponibles', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            attributes: {
              posterImage: {
                original: 'https://example.com/poster-original.jpg'
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await kitsuSource.fetchPoster('123', 'Test Anime');

      expect(result).toBe('https://example.com/poster-original.jpg');
    });

    test('devrait retourner null si aucune image n\'est disponible', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            attributes: {
              posterImage: null
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await kitsuSource.fetchPoster('123', 'Test Anime');

      expect(result).toBeNull();
    });

    test('devrait enregistrer les métriques de succès', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            attributes: {
              posterImage: {
                large: 'https://example.com/poster.jpg'
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await kitsuSource.fetchPoster('123', 'Test Anime');

      const metrics = kitsuSource.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.consecutiveFailures).toBe(0);
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fetchPoster - Gestion d\'erreurs', () => {
    test('devrait valider l\'ID anime', async () => {
      await expect(kitsuSource.fetchPoster('', 'Test Anime'))
        .rejects.toThrow('ID anime invalide pour Kitsu');
      
      await expect(kitsuSource.fetchPoster('abc', 'Test Anime'))
        .rejects.toThrow('ID anime invalide pour Kitsu');
      
      await expect(kitsuSource.fetchPoster(null, 'Test Anime'))
        .rejects.toThrow('ID anime invalide pour Kitsu');
    });

    test('devrait retourner null pour un anime non trouvé (404)', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await kitsuSource.fetchPoster('999999', 'Test Anime');

      expect(result).toBeNull();
    });

    test('devrait lever une erreur pour les autres codes d\'erreur HTTP', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(kitsuSource.fetchPoster('123', 'Test Anime'))
        .rejects.toThrow('Erreur HTTP 500: Internal Server Error');
    });

    test('devrait gérer les erreurs de réseau', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(kitsuSource.fetchPoster('123', 'Test Anime'))
        .rejects.toThrow('Network error');
    });

    test('devrait enregistrer les métriques d\'échec', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      try {
        await kitsuSource.fetchPoster('123', 'Test Anime');
      } catch (error) {
        // Erreur attendue
      }

      const metrics = kitsuSource.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.consecutiveFailures).toBe(1);
      expect(metrics.lastError).toBe('Network error');
    });

    test('devrait respecter le timeout', async () => {
      // Mock d'une requête qui prend trop de temps
      mockFetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 5000))
      );

      await expect(kitsuSource.fetchPoster('123', 'Test Anime'))
        .rejects.toThrow('Timeout');
    });
  });

  describe('Circuit Breaker', () => {
    test('devrait commencer en état CLOSED', () => {
      expect(kitsuSource.circuitState).toBe('CLOSED');
      expect(kitsuSource._canMakeRequest()).toBe(true);
    });

    test('devrait passer en OPEN après le seuil d\'échecs', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Déclencher 3 échecs consécutifs (seuil configuré)
      for (let i = 0; i < 3; i++) {
        try {
          await kitsuSource.fetchPoster('123', 'Test Anime');
        } catch (error) {
          // Erreur attendue
        }
      }

      expect(kitsuSource.circuitState).toBe('OPEN');
      expect(kitsuSource.metrics.isTemporarilyDisabled).toBe(true);
      expect(kitsuSource._canMakeRequest()).toBe(false);
    });

    test('devrait bloquer les requêtes en état OPEN', async () => {
      // Forcer l'ouverture du circuit
      kitsuSource.openCircuitBreaker(1000);

      await expect(kitsuSource.fetchPoster('123', 'Test Anime'))
        .rejects.toThrow('Circuit breaker ouvert pour kitsu');
    });

    test('devrait passer en HALF_OPEN après la durée de désactivation', async () => {
      jest.useFakeTimers();
      
      // Forcer l'ouverture du circuit
      kitsuSource.openCircuitBreaker(1000);
      expect(kitsuSource.circuitState).toBe('OPEN');

      // Avancer le temps
      jest.advanceTimersByTime(1001);

      expect(kitsuSource._canMakeRequest()).toBe(true);
      expect(kitsuSource.circuitState).toBe('HALF_OPEN');
      
      jest.useRealTimers();
    });

    test('devrait fermer le circuit après un succès en HALF_OPEN', async () => {
      // Mettre le circuit en HALF_OPEN
      kitsuSource.circuitState = 'HALF_OPEN';
      kitsuSource.metrics.consecutiveFailures = 3;

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            attributes: {
              posterImage: {
                large: 'https://example.com/poster.jpg'
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await kitsuSource.fetchPoster('123', 'Test Anime');

      expect(kitsuSource.circuitState).toBe('CLOSED');
      expect(kitsuSource.metrics.consecutiveFailures).toBe(0);
      expect(kitsuSource.metrics.isTemporarilyDisabled).toBe(false);
    });

    test('devrait rouvrir le circuit après un échec en HALF_OPEN', async () => {
      // Mettre le circuit en HALF_OPEN
      kitsuSource.circuitState = 'HALF_OPEN';

      mockFetch.mockRejectedValue(new Error('Still failing'));

      try {
        await kitsuSource.fetchPoster('123', 'Test Anime');
      } catch (error) {
        // Erreur attendue
      }

      expect(kitsuSource.circuitState).toBe('OPEN');
      expect(kitsuSource.metrics.isTemporarilyDisabled).toBe(true);
    });

    test('devrait permettre la réinitialisation manuelle du circuit', () => {
      // Forcer l'ouverture
      kitsuSource.openCircuitBreaker();
      expect(kitsuSource.circuitState).toBe('OPEN');

      // Réinitialiser
      kitsuSource.resetCircuitBreaker();
      
      expect(kitsuSource.circuitState).toBe('CLOSED');
      expect(kitsuSource.metrics.consecutiveFailures).toBe(0);
      expect(kitsuSource.metrics.isTemporarilyDisabled).toBe(false);
      expect(kitsuSource.nextAttemptTime).toBe(0);
    });

    test('devrait fournir l\'état détaillé du circuit breaker', () => {
      kitsuSource.circuitState = 'OPEN';
      kitsuSource.metrics.consecutiveFailures = 5;
      kitsuSource.metrics.isTemporarilyDisabled = true;
      kitsuSource.nextAttemptTime = Date.now() + 5000;

      const state = kitsuSource.getCircuitBreakerState();

      expect(state.state).toBe('OPEN');
      expect(state.consecutiveFailures).toBe(5);
      expect(state.failureThreshold).toBe(3);
      expect(state.timeUntilNextAttempt).toBeGreaterThan(0);
      expect(state.isTemporarilyDisabled).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    test('devrait respecter l\'intervalle minimum entre requêtes', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            attributes: {
              posterImage: {
                large: 'https://example.com/poster.jpg'
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const startTime = Date.now();
      
      // Faire deux requêtes consécutives
      await kitsuSource.fetchPoster('123', 'Test Anime 1');
      await kitsuSource.fetchPoster('456', 'Test Anime 2');
      
      const endTime = Date.now();
      const elapsed = endTime - startTime;
      
      // Devrait avoir attendu au moins l'intervalle minimum
      expect(elapsed).toBeGreaterThanOrEqual(kitsuSource.minRequestInterval);
    });
  });

  describe('Health Check', () => {
    test('devrait retourner true si l\'API est opérationnelle', async () => {
      const mockResponse = {
        ok: true
      };
      mockFetch.mockResolvedValue(mockResponse);

      const isHealthy = await kitsuSource.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://kitsu.io/api/edge/anime/1',
        {
          headers: { 'Accept': 'application/vnd.api+json' },
          timeout: 5000
        }
      );
    });

    test('devrait retourner false si l\'API n\'est pas opérationnelle', async () => {
      const mockResponse = {
        ok: false,
        status: 500
      };
      mockFetch.mockResolvedValue(mockResponse);

      const isHealthy = await kitsuSource.healthCheck();

      expect(isHealthy).toBe(false);
    });

    test('devrait retourner false en cas d\'erreur réseau', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const isHealthy = await kitsuSource.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Métriques étendues', () => {
    test('devrait inclure les métriques du circuit breaker', () => {
      const metrics = kitsuSource.getMetrics();

      expect(metrics.circuitBreaker).toBeDefined();
      expect(metrics.circuitBreaker.state).toBe('CLOSED');
      expect(metrics.circuitBreaker.consecutiveFailures).toBe(0);
      expect(metrics.circuitBreaker.failureThreshold).toBe(3);
    });

    test('devrait inclure les métriques de rate limiting', () => {
      const metrics = kitsuSource.getMetrics();

      expect(metrics.rateLimit).toBeDefined();
      expect(metrics.rateLimit.limit).toBe(30);
      expect(metrics.rateLimit.interval).toBe(2000); // 60000ms / 30 req
    });

    test('devrait inclure la configuration', () => {
      const metrics = kitsuSource.getMetrics();

      expect(metrics.configuration).toBeDefined();
      expect(metrics.configuration.timeout).toBe(3000);
      expect(metrics.configuration.baseUrl).toBe('https://kitsu.io/api/edge/anime');
      expect(metrics.configuration.failureThreshold).toBe(3);
    });
  });

  describe('Configuration personnalisée', () => {
    test('devrait accepter une configuration personnalisée', () => {
      const customSource = new KitsuSource({
        timeout: 5000,
        enabled: false,
        failureThreshold: 5,
        disableDuration: 60000,
        rateLimit: 20
      });

      expect(customSource.timeout).toBe(5000);
      expect(customSource.isEnabled).toBe(false);
      expect(customSource.failureThreshold).toBe(5);
      expect(customSource.disableDuration).toBe(60000);
      expect(customSource.config.rateLimit).toBe(20);
    });

    test('devrait utiliser les valeurs par défaut', () => {
      const defaultSource = new KitsuSource();

      expect(defaultSource.timeout).toBe(3000);
      expect(defaultSource.isEnabled).toBe(true);
      expect(defaultSource.failureThreshold).toBe(10);
      expect(defaultSource.disableDuration).toBe(30 * 60 * 1000);
      expect(defaultSource.config.rateLimit).toBe(30);
    });
  });
});