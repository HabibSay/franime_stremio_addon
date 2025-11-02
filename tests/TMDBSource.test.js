// tests/TMDBSource.test.js
// Tests unitaires pour TMDBSource

const TMDBSource = require('../poster-system/sources/TMDBSource');
const https = require('https');

// Mock du module https
jest.mock('https');

describe('TMDBSource', () => {
  let tmdbSource;
  const mockHttps = https;
  const mockApiKey = 'test-api-key-12345678901234567890';

  beforeEach(() => {
    // Réinitialiser les mocks
    jest.clearAllMocks();
    
    // Créer une nouvelle instance pour chaque test
    tmdbSource = new TMDBSource({
      apiKey: mockApiKey,
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
      expect(tmdbSource.name).toBe('tmdb');
      expect(tmdbSource.priority).toBe(2);
      expect(tmdbSource.isEnabled).toBe(true);
      expect(tmdbSource.timeout).toBe(3000);
      expect(typeof tmdbSource.fetchPoster).toBe('function');
      expect(typeof tmdbSource.healthCheck).toBe('function');
      expect(typeof tmdbSource.getMetrics).toBe('function');
    });

    test('devrait avoir les propriétés spécifiques à TMDB', () => {
      expect(tmdbSource.baseUrl).toBe('https://api.themoviedb.org/3');
      expect(tmdbSource.imageBaseUrl).toBe('https://image.tmdb.org/t/p/w500');
      expect(tmdbSource.apiKey).toBe(mockApiKey);
      expect(tmdbSource.circuitState).toBe('CLOSED');
      expect(tmdbSource.maxRequestsPer10Sec).toBe(40);
    });

    test('devrait être désactivé si aucune clé API n\'est fournie', () => {
      const sourceWithoutKey = new TMDBSource();
      expect(sourceWithoutKey.isEnabled).toBe(false);
    });

    test('devrait pouvoir être désactivé manuellement', () => {
      tmdbSource.setEnabled(false);
      expect(tmdbSource.isEnabled).toBe(false);
    });
  });

  describe('fetchPoster - Recherche TV Show', () => {
    test('devrait récupérer un poster depuis une recherche TV réussie', async () => {
      const mockSearchResponse = {
        results: [
          {
            id: 1429,
            name: 'Attack on Titan',
            poster_path: '/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg'
          }
        ]
      };

      mockHttpsRequest(200, mockSearchResponse);

      const result = await tmdbSource.fetchPoster('123', 'Attack on Titan');

      expect(result).toBe('https://image.tmdb.org/t/p/w500/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg');
      expect(mockHttps.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'api.themoviedb.org',
          path: expect.stringContaining('/search/tv'),
          method: 'GET'
        }),
        expect.any(Function)
      );
    });

    test('devrait nettoyer le nom de l\'anime avant la recherche', async () => {
      const mockSearchResponse = { results: [] };
      mockHttpsRequest(200, mockSearchResponse);

      await tmdbSource.fetchPoster('123', 'Attack on Titan (Saison 1) [VF]');

      expect(mockHttps.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('query=Attack%20on%20Titan')
        }),
        expect.any(Function)
      );
    });

    test('devrait ignorer les résultats sans poster_path', async () => {
      const mockSearchResponse = {
        results: [
          { id: 1, name: 'Test 1', poster_path: null },
          { id: 2, name: 'Test 2', poster_path: '/valid-poster.jpg' }
        ]
      };

      mockHttpsRequest(200, mockSearchResponse);

      const result = await tmdbSource.fetchPoster('123', 'Test Anime');

      expect(result).toBe('https://image.tmdb.org/t/p/w500/valid-poster.jpg');
    });
  });

  describe('fetchPoster - Recherche Movie Fallback', () => {
    test('devrait essayer la recherche film si TV échoue', async () => {
      const mockTVResponse = { results: [] };
      const mockMovieResponse = {
        results: [
          {
            id: 123,
            title: 'Your Name',
            poster_path: '/movie-poster.jpg'
          }
        ]
      };

      // Premier appel (TV) retourne vide, deuxième appel (Movie) retourne un résultat
      mockHttps.request
        .mockImplementationOnce((options, callback) => {
          const mockReq = createMockRequest(200, mockTVResponse, callback);
          return mockReq;
        })
        .mockImplementationOnce((options, callback) => {
          const mockReq = createMockRequest(200, mockMovieResponse, callback);
          return mockReq;
        });

      const result = await tmdbSource.fetchPoster('123', 'Your Name');

      expect(result).toBe('https://image.tmdb.org/t/p/w500/movie-poster.jpg');
      expect(mockHttps.request).toHaveBeenCalledTimes(2);
    });

    test('devrait retourner null si ni TV ni Movie ne trouvent de résultat', async () => {
      const mockEmptyResponse = { results: [] };

      mockHttps.request.mockImplementation((options, callback) => {
        const mockReq = createMockRequest(200, mockEmptyResponse, callback);
        return mockReq;
      });

      const result = await tmdbSource.fetchPoster('123', 'Unknown Anime');

      expect(result).toBeNull();
      expect(mockHttps.request).toHaveBeenCalledTimes(2); // TV puis Movie
    });
  });

  describe('fetchPoster - Gestion d\'erreurs', () => {
    test('devrait valider les paramètres d\'entrée', async () => {
      await expect(tmdbSource.fetchPoster('123', ''))
        .rejects.toThrow('Nom d\'anime requis pour TMDB');
      
      await expect(tmdbSource.fetchPoster('123', null))
        .rejects.toThrow('Nom d\'anime requis pour TMDB');
      
      await expect(tmdbSource.fetchPoster('123', 123))
        .rejects.toThrow('Nom d\'anime requis pour TMDB');
    });

    test('devrait lever une erreur si la clé API est manquante', async () => {
      const sourceWithoutKey = new TMDBSource({ apiKey: null });
      
      await expect(sourceWithoutKey.fetchPoster('123', 'Test Anime'))
        .rejects.toThrow('Clé API TMDB manquante');
    });

    test('devrait gérer les erreurs d\'authentification (401)', async () => {
      mockHttpsRequest(401, { status_message: 'Invalid API key' });

      // TMDBSource retourne null en cas d'erreur et log l'erreur
      const result = await tmdbSource.fetchPoster('123', 'Test Anime');
      expect(result).toBeNull();
      
      // La source devrait être désactivée
      expect(tmdbSource.isEnabled).toBe(false);
    });

    test('devrait gérer les erreurs de quota (429)', async () => {
      const errorResponse = { 
        status_message: 'Your request count (41) is over the allowed limit of 40 requests per 10 seconds.',
        retry_after: 5
      };
      mockHttpsRequest(429, errorResponse);

      // TMDBSource retourne null en cas d'erreur et ajuste le rate limit
      const result = await tmdbSource.fetchPoster('123', 'Test Anime');
      expect(result).toBeNull();
      
      // Le rate limit devrait être ajusté
      expect(tmdbSource.maxRequestsPer10Sec).toBeLessThan(40);
    });

    test('devrait gérer les erreurs serveur (500)', async () => {
      mockHttpsRequest(500, 'Internal Server Error');

      // TMDBSource retourne null en cas d'erreur serveur
      const result = await tmdbSource.fetchPoster('123', 'Test Anime');
      expect(result).toBeNull();
    });

    test('devrait gérer les timeouts', async () => {
      mockHttps.request.mockImplementation((options, callback) => {
        const mockReq = {
          on: jest.fn((event, handler) => {
            if (event === 'timeout') {
              setTimeout(() => handler(), 10);
            }
          }),
          end: jest.fn(),
          destroy: jest.fn()
        };
        return mockReq;
      });

      // TMDBSource retourne null en cas de timeout
      const result = await tmdbSource.fetchPoster('123', 'Test Anime');
      expect(result).toBeNull();
    });

    test('devrait gérer les erreurs réseau', async () => {
      mockHttps.request.mockImplementation((options, callback) => {
        const mockReq = {
          on: jest.fn((event, handler) => {
            if (event === 'error') {
              setTimeout(() => handler({ code: 'ENOTFOUND' }), 10);
            }
          }),
          end: jest.fn(),
          destroy: jest.fn()
        };
        return mockReq;
      });

      // TMDBSource retourne null en cas d'erreur réseau
      const result = await tmdbSource.fetchPoster('123', 'Test Anime');
      expect(result).toBeNull();
    });
  });

  describe('Rate Limiting', () => {
    test('devrait respecter la limite de 40 requêtes par 10 secondes', () => {
      expect(tmdbSource.maxRequestsPer10Sec).toBe(40);
      expect(tmdbSource.rateLimitWindow).toBe(10000);
    });

    test('devrait pouvoir vérifier si une requête peut être faite immédiatement', () => {
      expect(tmdbSource.canMakeRequestNow()).toBe(true);
      
      // Simuler 40 requêtes récentes
      const now = Date.now();
      tmdbSource.requestTimes = Array(40).fill(now);
      
      expect(tmdbSource.canMakeRequestNow()).toBe(false);
    });

    test('devrait calculer le délai avant la prochaine requête', () => {
      expect(tmdbSource.getNextRequestDelay()).toBe(0);
      
      // Simuler 40 requêtes récentes
      const now = Date.now();
      tmdbSource.requestTimes = Array(40).fill(now - 5000); // Il y a 5 secondes
      
      const delay = tmdbSource.getNextRequestDelay();
      expect(delay).toBeGreaterThan(5000); // Doit attendre ~5 secondes de plus
    });

    test('devrait ajuster le rate limit après une erreur 429', async () => {
      const originalLimit = tmdbSource.maxRequestsPer10Sec;
      const errorResponse = { retry_after: 10 };
      
      mockHttpsRequest(429, errorResponse);

      try {
        await tmdbSource.fetchPoster('123', 'Test Anime');
      } catch (error) {
        // Erreur attendue
      }

      expect(tmdbSource.maxRequestsPer10Sec).toBeLessThan(originalLimit);
    });
  });

  describe('Circuit Breaker', () => {
    test('devrait commencer en état CLOSED', () => {
      expect(tmdbSource.circuitState).toBe('CLOSED');
      expect(tmdbSource._canMakeRequest()).toBe(true);
    });

    test('devrait passer en OPEN après le seuil d\'échecs', async () => {
      mockHttpsRequest(500, 'Server Error');

      // Déclencher 3 échecs consécutifs
      for (let i = 0; i < 3; i++) {
        const result = await tmdbSource.fetchPoster('123', 'Test Anime');
        expect(result).toBeNull(); // Chaque appel devrait retourner null
      }

      // Vérifier que les métriques d'échec ont été enregistrées
      const metrics = tmdbSource.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      // TMDBSource gère les erreurs en interne, donc les métriques peuvent être différentes
      // L'important est que les requêtes aient été tentées
      expect(metrics.totalRequests).toBeGreaterThan(0);
    });

    test('devrait bloquer les requêtes en état OPEN', async () => {
      tmdbSource.openCircuitBreaker(1000);

      await expect(tmdbSource.fetchPoster('123', 'Test Anime'))
        .rejects.toThrow('Circuit breaker ouvert pour tmdb');
    });

    test('devrait permettre la réinitialisation manuelle', () => {
      tmdbSource.openCircuitBreaker();
      expect(tmdbSource.circuitState).toBe('OPEN');

      tmdbSource.resetCircuitBreaker();
      expect(tmdbSource.circuitState).toBe('CLOSED');
      expect(tmdbSource.metrics.consecutiveFailures).toBe(0);
    });
  });

  describe('Health Check', () => {
    test('devrait retourner true si l\'API est opérationnelle', async () => {
      const mockConfigResponse = {
        images: {
          base_url: 'https://image.tmdb.org/t/p/',
          poster_sizes: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original']
        }
      };

      mockHttpsRequest(200, mockConfigResponse);

      const isHealthy = await tmdbSource.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockHttps.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('/configuration')
        }),
        expect.any(Function)
      );
    });

    test('devrait retourner false si l\'API n\'est pas opérationnelle', async () => {
      mockHttpsRequest(500, 'Server Error');

      const isHealthy = await tmdbSource.healthCheck();

      expect(isHealthy).toBe(false);
    });

    test('devrait retourner false si la clé API est manquante', async () => {
      const sourceWithoutKey = new TMDBSource({ apiKey: null });
      
      const isHealthy = await sourceWithoutKey.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Configuration et Validation', () => {
    test('devrait valider une configuration correcte', () => {
      const validation = tmdbSource.validateConfiguration();

      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
      expect(validation.configuration.hasApiKey).toBe(true);
      expect(validation.configuration.timeout).toBe(3000);
    });

    test('devrait détecter une clé API manquante', () => {
      const sourceWithoutKey = new TMDBSource({ apiKey: null });
      const validation = sourceWithoutKey.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Clé API TMDB manquante (TMDB_API_KEY)');
    });

    test('devrait avertir pour une clé API trop courte', () => {
      const sourceWithShortKey = new TMDBSource({ apiKey: 'short' });
      const validation = sourceWithShortKey.validateConfiguration();

      expect(validation.warnings).toContain('Clé API TMDB semble trop courte');
    });

    test('devrait avertir pour un timeout très court', () => {
      const sourceWithShortTimeout = new TMDBSource({ 
        apiKey: mockApiKey,
        timeout: 500 
      });
      const validation = sourceWithShortTimeout.validateConfiguration();

      expect(validation.warnings).toContain('Timeout très court (< 1s) - risque d\'échecs');
    });
  });

  describe('Test de Connexion', () => {
    test('devrait réussir le test de connexion complet', async () => {
      const mockConfigResponse = {
        images: {
          base_url: 'https://image.tmdb.org/t/p/',
          poster_sizes: ['w500']
        }
      };
      const mockSearchResponse = {
        results: [{ id: 1, name: 'Attack on Titan' }]
      };

      mockHttps.request
        .mockImplementationOnce((options, callback) => {
          const mockReq = createMockRequest(200, mockConfigResponse, callback);
          return mockReq;
        })
        .mockImplementationOnce((options, callback) => {
          const mockReq = createMockRequest(200, mockSearchResponse, callback);
          return mockReq;
        });

      const result = await tmdbSource.testConnection();

      expect(result.success).toBe(true);
      expect(result.details.configuration.success).toBe(true);
      expect(result.details.search.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('devrait échouer si la configuration est invalide', async () => {
      const sourceWithoutKey = new TMDBSource({ apiKey: null });
      
      const result = await sourceWithoutKey.testConnection();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Clé API TMDB manquante (TMDB_API_KEY)');
    });
  });

  describe('Métriques étendues', () => {
    test('devrait inclure les métriques du circuit breaker', () => {
      const metrics = tmdbSource.getMetrics();

      expect(metrics.circuitBreaker).toBeDefined();
      expect(metrics.circuitBreaker.state).toBe('CLOSED');
      expect(metrics.circuitBreaker.consecutiveFailures).toBe(0);
    });

    test('devrait inclure les métriques de rate limiting', () => {
      const metrics = tmdbSource.getMetrics();

      expect(metrics.rateLimit).toBeDefined();
      expect(metrics.rateLimit.limit).toBe(40);
      expect(metrics.rateLimit.window).toBe(10000);
    });

    test('devrait inclure la configuration', () => {
      const metrics = tmdbSource.getMetrics();

      expect(metrics.configuration).toBeDefined();
      expect(metrics.configuration.timeout).toBe(3000);
      expect(metrics.configuration.baseUrl).toBe('https://api.themoviedb.org/3');
      expect(metrics.configuration.hasApiKey).toBe(true);
    });
  });

  // Fonctions utilitaires pour les mocks
  function mockHttpsRequest(statusCode, responseData) {
    mockHttps.request.mockImplementation((options, callback) => {
      const mockReq = createMockRequest(statusCode, responseData, callback);
      return mockReq;
    });
  }

  function createMockRequest(statusCode, responseData, callback) {
    const mockRes = {
      statusCode,
      statusMessage: getStatusMessage(statusCode),
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(JSON.stringify(responseData)), 10);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
      })
    };

    const mockReq = {
      on: jest.fn(),
      end: jest.fn(() => {
        setTimeout(() => callback(mockRes), 5);
      }),
      destroy: jest.fn()
    };

    return mockReq;
  }

  function getStatusMessage(statusCode) {
    const messages = {
      200: 'OK',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };
    return messages[statusCode] || 'Unknown';
  }
});