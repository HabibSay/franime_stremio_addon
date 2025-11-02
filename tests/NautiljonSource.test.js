// tests/NautiljonSource.test.js
// Tests unitaires pour NautiljonSource

const NautiljonSource = require('../poster-system/sources/NautiljonSource');

// Mock de puppeteer
jest.mock('puppeteer');
const puppeteer = require('puppeteer');

describe('NautiljonSource', () => {
  let nautiljonSource;
  let mockBrowser;
  let mockPage;

  beforeEach(() => {
    // Réinitialiser les mocks
    jest.clearAllMocks();
    
    // Mock des objets Puppeteer
    mockPage = {
      setUserAgent: jest.fn(),
      setViewport: jest.fn(),
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
      goto: jest.fn(),
      waitForSelector: jest.fn(),
      $: jest.fn(),
      evaluate: jest.fn(),
      title: jest.fn(),
      close: jest.fn()
    };
    
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn(),
      on: jest.fn()
    };
    
    puppeteer.launch = jest.fn().mockResolvedValue(mockBrowser);
    
    // Créer une nouvelle instance pour chaque test
    nautiljonSource = new NautiljonSource({
      timeout: 5000
    });
  });

  afterEach(async () => {
    // Nettoyer les ressources
    await nautiljonSource.close();
    jest.clearAllTimers();
  });

  describe('Interface PosterSource', () => {
    test('devrait implémenter correctement l\'interface PosterSource', () => {
      expect(nautiljonSource.name).toBe('Nautiljon');
      expect(nautiljonSource.priority).toBe(3);
      expect(nautiljonSource.isEnabled).toBe(true);
      expect(nautiljonSource.timeout).toBe(5000);
      expect(typeof nautiljonSource.fetchPoster).toBe('function');
      expect(typeof nautiljonSource.healthCheck).toBe('function');
      expect(typeof nautiljonSource.getMetrics).toBe('function');
    });

    test('devrait avoir les propriétés spécifiques à Nautiljon', () => {
      expect(nautiljonSource.baseUrl).toBe('https://www.nautiljon.com');
      expect(nautiljonSource.searchUrl).toBe('https://www.nautiljon.com/animes/');
      expect(nautiljonSource.minRequestInterval).toBe(6000); // 10 req/min
    });

    test('devrait être disponible par défaut', () => {
      expect(nautiljonSource.isAvailable()).toBe(true);
    });
  });

  describe('Normalisation et recherche fuzzy', () => {
    test('devrait normaliser les requêtes de recherche', () => {
      const result = nautiljonSource._normalizeSearchQuery('Attack on Titan: Season 2!');
      expect(result).toBe('Attack on Titan Season 2');
    });

    test('devrait normaliser pour la comparaison', () => {
      const result = nautiljonSource._normalizeForComparison('Attack on Titan: Season 2!');
      expect(result).toBe('attack on titan season 2');
    });

    test('devrait calculer la similarité entre chaînes', () => {
      const similarity1 = nautiljonSource._calculateSimilarity('attack on titan', 'attack on titan');
      expect(similarity1).toBe(1);

      const similarity2 = nautiljonSource._calculateSimilarity('attack on titan', 'shingeki no kyojin');
      expect(similarity2).toBeGreaterThanOrEqual(0);

      const similarity3 = nautiljonSource._calculateSimilarity('', '');
      expect(similarity3).toBe(0);
    });

    test('devrait trouver le meilleur match', () => {
      const results = [
        { title: 'Attack on Titan Season 1', url: 'url1' },
        { title: 'Attack on Titan Season 2', url: 'url2' },
        { title: 'Different Anime', url: 'url3' }
      ];

      const bestMatch = nautiljonSource._findBestMatch('Attack on Titan Season 2', results);
      expect(bestMatch).toBeTruthy();
      expect(bestMatch.title).toBe('Attack on Titan Season 2');
    });

    test('devrait retourner null si aucun match suffisant', () => {
      const results = [
        { title: 'Completely Different Anime', url: 'url1' }
      ];

      const bestMatch = nautiljonSource._findBestMatch('Attack on Titan', results);
      expect(bestMatch).toBeNull();
    });
  });

  describe('Validation d\'URLs d\'images', () => {
    test('devrait valider les URLs d\'images correctes', () => {
      expect(nautiljonSource._isValidImageUrl('https://example.com/image.jpg')).toBe(true);
      expect(nautiljonSource._isValidImageUrl('https://example.com/poster.png')).toBe(true);
      expect(nautiljonSource._isValidImageUrl('https://example.com/cover.gif')).toBe(true);
      expect(nautiljonSource._isValidImageUrl('https://example.com/anime-poster.webp')).toBe(true);
    });

    test('devrait rejeter les URLs invalides', () => {
      expect(nautiljonSource._isValidImageUrl('')).toBe(false);
      expect(nautiljonSource._isValidImageUrl(null)).toBe(false);
      expect(nautiljonSource._isValidImageUrl('https://example.com/page.html')).toBe(false);
    });

    test('devrait accepter les URLs avec mots-clés d\'image', () => {
      expect(nautiljonSource._isValidImageUrl('https://example.com/image/123')).toBe(true);
      expect(nautiljonSource._isValidImageUrl('https://example.com/poster/anime')).toBe(true);
      expect(nautiljonSource._isValidImageUrl('https://example.com/cover/show')).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    test('devrait respecter l\'intervalle minimum entre requêtes', async () => {
      jest.useFakeTimers();
      
      const startTime = Date.now();
      nautiljonSource.lastRequestTime = startTime - 3000; // 3 secondes avant
      
      const rateLimitPromise = nautiljonSource._ensureRateLimit();
      
      // Avancer le temps de 3 secondes (il devrait attendre 3 secondes de plus)
      jest.advanceTimersByTime(3000);
      
      await rateLimitPromise;
      
      expect(nautiljonSource.lastRequestTime).toBeGreaterThan(startTime);
      
      jest.useRealTimers();
    });
  });

  describe('Health Check', () => {
    test('devrait retourner true si le site est accessible', async () => {
      mockPage.title.mockResolvedValue('Nautiljon - Anime, Manga, Drama');
      mockPage.$.mockResolvedValue({}); // Mock search form element

      const isHealthy = await nautiljonSource.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.nautiljon.com',
        { waitUntil: 'domcontentloaded', timeout: 5000 }
      );
    });

    test('devrait retourner false si le site n\'est pas accessible', async () => {
      mockPage.goto.mockRejectedValue(new Error('Network error'));

      const isHealthy = await nautiljonSource.healthCheck();

      expect(isHealthy).toBe(false);
    });

    test('devrait retourner false si le titre ne contient pas "nautiljon"', async () => {
      mockPage.title.mockResolvedValue('Different Site');

      const isHealthy = await nautiljonSource.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Gestion du navigateur', () => {
    test('devrait créer un navigateur avec les bonnes options', async () => {
      await nautiljonSource._getBrowser();

      expect(puppeteer.launch).toHaveBeenCalledWith({
        headless: 'new',
        timeout: 5000,
        args: expect.arrayContaining([
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ])
      });
    });

    test('devrait réutiliser le même navigateur', async () => {
      const browser1 = await nautiljonSource._getBrowser();
      const browser2 = await nautiljonSource._getBrowser();

      expect(browser1).toBe(browser2);
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    });

    test('devrait fermer le navigateur correctement', async () => {
      await nautiljonSource._getBrowser();
      await nautiljonSource.close();

      expect(mockBrowser.close).toHaveBeenCalled();
      expect(nautiljonSource.browser).toBeNull();
    });
  });

  describe('Configuration personnalisée', () => {
    test('devrait accepter une configuration personnalisée', () => {
      const customSource = new NautiljonSource({
        timeout: 8000,
        enabled: false
      });

      expect(customSource.timeout).toBe(8000);
      expect(customSource.isEnabled).toBe(false);
    });

    test('devrait utiliser les valeurs par défaut', () => {
      const defaultSource = new NautiljonSource();

      expect(defaultSource.timeout).toBe(5000);
      expect(defaultSource.isEnabled).toBe(true);
      expect(defaultSource.priority).toBe(3);
    });
  });

  describe('Scraping avec pages mockées', () => {
    test('devrait rechercher un anime avec succès', async () => {
      // Mock de la page de recherche
      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue();
      mockPage.$.mockResolvedValue(null); // Pas de "no results"
      mockPage.evaluate.mockResolvedValue([
        { title: 'Attack on Titan', url: 'https://www.nautiljon.com/animes/attack-on-titan.html' },
        { title: 'Attack on Titan Season 2', url: 'https://www.nautiljon.com/animes/attack-on-titan-s2.html' }
      ]);

      const results = await nautiljonSource._searchAnime(mockPage, 'Attack on Titan');

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Attack on Titan');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.nautiljon.com/animes/?q=Attack%20on%20Titan',
        { waitUntil: 'domcontentloaded', timeout: 5000 }
      );
    });

    test('devrait retourner un tableau vide si aucun résultat', async () => {
      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue();
      mockPage.$.mockResolvedValue({}); // Mock "no results" element
      mockPage.evaluate.mockResolvedValue([]);

      const results = await nautiljonSource._searchAnime(mockPage, 'Anime Inexistant');

      expect(results).toHaveLength(0);
    });

    test('devrait extraire le poster depuis une page de détail', async () => {
      const mockPosterUrl = 'https://www.nautiljon.com/images/anime/poster.jpg';
      
      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue();
      // Mock multiple evaluate calls for the poster extraction loop
      mockPage.evaluate
        .mockResolvedValueOnce(null) // First selector fails
        .mockResolvedValueOnce(mockPosterUrl) // Second selector succeeds
        .mockResolvedValue({ ok: true, status: 200, contentType: 'image/jpeg' }); // URL validation

      const posterUrl = await nautiljonSource._extractPosterFromDetailPage(
        mockPage, 
        'https://www.nautiljon.com/animes/attack-on-titan.html'
      );

      expect(posterUrl).toBe(mockPosterUrl);
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.nautiljon.com/animes/attack-on-titan.html',
        { waitUntil: 'domcontentloaded', timeout: 5000 }
      );
    });

    test('devrait retourner null si aucun poster trouvé', async () => {
      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue();
      mockPage.evaluate.mockResolvedValue(null);

      const posterUrl = await nautiljonSource._extractPosterFromDetailPage(
        mockPage, 
        'https://www.nautiljon.com/animes/no-poster.html'
      );

      expect(posterUrl).toBeNull();
    });
  });

  describe('Recherche fuzzy et extraction d\'images', () => {
    test('devrait effectuer une recherche complète avec fallback fuzzy', async () => {
      // Mock de la recherche
      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue();
      mockPage.$.mockResolvedValue(null);
      mockPage.evaluate
        .mockResolvedValueOnce([
          { title: 'Shingeki no Kyojin', url: 'https://www.nautiljon.com/animes/snk.html' },
          { title: 'Attack on Titan Season 2', url: 'https://www.nautiljon.com/animes/aot-s2.html' }
        ])
        .mockResolvedValueOnce(null) // First poster selector fails
        .mockResolvedValueOnce('https://www.nautiljon.com/images/snk-poster.jpg') // Second succeeds
        .mockResolvedValue({ ok: true, status: 200, contentType: 'image/jpeg' }); // URL validation

      const posterUrl = await nautiljonSource.fetchPoster('123', 'Attack on Titan');

      expect(posterUrl).toBe('https://www.nautiljon.com/images/snk-poster.jpg');
      expect(mockPage.goto).toHaveBeenCalledTimes(2); // Recherche + page de détail
    });

    test('devrait utiliser le meilleur match fuzzy', async () => {
      const results = [
        { title: 'Shingeki no Kyojin', url: 'url1' },
        { title: 'Attack on Titan', url: 'url2' },
        { title: 'Different Anime', url: 'url3' }
      ];

      const bestMatch = nautiljonSource._findBestMatch('Attack on Titan', results);
      
      expect(bestMatch).toBeTruthy();
      expect(bestMatch.title).toBe('Attack on Titan');
    });

    test('devrait extraire des images avec différents sélecteurs', async () => {
      const testCases = [
        { selector: '.anime_image img', url: 'https://www.nautiljon.com/poster1.jpg' },
        { selector: '.poster img', url: 'https://www.nautiljon.com/poster2.jpg' },
        { selector: 'img[alt*="poster"]', url: 'https://www.nautiljon.com/poster3.jpg' }
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockPage.goto.mockResolvedValue();
        mockPage.waitForSelector.mockResolvedValue();
        mockPage.evaluate
          .mockResolvedValueOnce(testCase.url) // First selector succeeds
          .mockResolvedValue({ ok: true, status: 200, contentType: 'image/jpeg' }); // URL validation

        const posterUrl = await nautiljonSource._extractPosterFromDetailPage(
          mockPage, 
          'https://test.com'
        );

        expect(posterUrl).toBe(testCase.url);
      }
    });
  });

  describe('Gestion des timeouts et erreurs', () => {
    test('devrait gérer les timeouts de recherche', async () => {
      // Create a new source instance to avoid mock interference
      const testSource = new NautiljonSource({ timeout: 5000 });
      
      // Mock the browser to return our mocked page
      const testMockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
        on: jest.fn()
      };
      puppeteer.launch.mockResolvedValue(testMockBrowser);
      
      // Mock page methods for this specific test
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));
      mockPage.close.mockResolvedValue();

      const posterUrl = await testSource.fetchPoster('123', 'Test Anime');

      expect(posterUrl).toBeNull();
      expect(testSource.getMetrics().failedRequests).toBe(1);
      
      await testSource.close();
    });

    test('devrait gérer les timeouts d\'extraction de poster', async () => {
      const testSource = new NautiljonSource({ timeout: 5000 });
      
      const testMockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
        on: jest.fn()
      };
      puppeteer.launch.mockResolvedValue(testMockBrowser);
      
      // Mock réussite de la recherche mais échec de l'extraction
      mockPage.goto
        .mockResolvedValueOnce() // Recherche réussie
        .mockRejectedValueOnce(new Error('Navigation timeout')); // Extraction échoue
      
      mockPage.waitForSelector.mockResolvedValue();
      mockPage.$.mockResolvedValue(null);
      mockPage.evaluate.mockResolvedValue([
        { title: 'Test Anime', url: 'https://test.com/anime' }
      ]);
      mockPage.close.mockResolvedValue();

      const posterUrl = await testSource.fetchPoster('123', 'Test Anime');

      expect(posterUrl).toBeNull();
      
      await testSource.close();
    });

    test('devrait gérer les erreurs de scraping', async () => {
      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockRejectedValue(new Error('Selector not found'));
      mockPage.evaluate.mockRejectedValue(new Error('Evaluation failed'));

      const results = await nautiljonSource._searchAnime(mockPage, 'Test Anime');

      expect(results).toHaveLength(0);
    });

    test('devrait gérer les erreurs de navigateur', async () => {
      const testSource = new NautiljonSource({ timeout: 5000 });
      
      puppeteer.launch.mockRejectedValue(new Error('Browser launch failed'));

      const posterUrl = await testSource.fetchPoster('123', 'Test Anime');

      expect(posterUrl).toBeNull();
      expect(testSource.getMetrics().failedRequests).toBe(1);
      
      await testSource.close();
    });

    test('devrait respecter le timeout global', async () => {
      const testSource = new NautiljonSource({ timeout: 100 }); // Very short timeout
      
      const testMockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
        on: jest.fn()
      };
      puppeteer.launch.mockResolvedValue(testMockBrowser);
      
      // Mock d'une opération qui prend plus de temps que le timeout
      mockPage.goto.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200)) // Takes longer than timeout
      );
      mockPage.close.mockResolvedValue();

      const result = await testSource.fetchPoster('123', 'Test Anime');
      expect(result).toBeNull();
      expect(testSource.getMetrics().failedRequests).toBe(1);
      
      await testSource.close();
    });

    test('devrait fermer les pages même en cas d\'erreur', async () => {
      const testSource = new NautiljonSource({ timeout: 5000 });
      
      const testMockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
        on: jest.fn()
      };
      puppeteer.launch.mockResolvedValue(testMockBrowser);
      
      mockPage.goto.mockRejectedValue(new Error('Test error'));
      mockPage.close.mockResolvedValue();

      await testSource.fetchPoster('123', 'Test Anime');

      expect(mockPage.close).toHaveBeenCalled();
      
      await testSource.close();
    });

    test('devrait gérer les erreurs de validation d\'URL d\'image', async () => {
      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue();
      mockPage.$.mockResolvedValue(null);
      mockPage.evaluate
        .mockResolvedValueOnce([{ title: 'Test', url: 'test.com' }])
        .mockResolvedValueOnce('invalid-url')
        .mockResolvedValueOnce({ ok: false, status: 404 });

      const posterUrl = await nautiljonSource.fetchPoster('123', 'Test Anime');

      expect(posterUrl).toBeNull();
    });
  });
});