// poster-system/sources/NautiljonSource.js
const puppeteer = require('puppeteer');
const PosterSource = require('../interfaces/PosterSource');

/**
 * Source de posters utilisant le scraping du site Nautiljon
 * Implémente la recherche fuzzy et l'extraction d'images depuis les pages de détail
 */
class NautiljonSource extends PosterSource {
  constructor(config = {}) {
    super('Nautiljon', 3, {
      timeout: 5000, // 5 secondes pour le scraping
      enabled: config.enabled !== false,
      ...config
    });
    
    this.baseUrl = 'https://www.nautiljon.com';
    this.searchUrl = `${this.baseUrl}/animes/`;
    this.browser = null;
    this.lastRequestTime = 0;
    this.minRequestInterval = 6000; // 10 req/min = 6 secondes entre les requêtes
  }

  /**
   * Récupère un poster pour un anime donné via scraping Nautiljon
   * @param {string} animeId - ID de l'anime (non utilisé pour Nautiljon)
   * @param {string} animeName - Nom de l'anime à rechercher
   * @returns {Promise<string|null>} URL du poster ou null si non trouvé
   */
  async fetchPoster(animeId, animeName) {
    return this._executeWithMetrics(async () => {
      await this._ensureRateLimit();
      
      const browser = await this._getBrowser();
      const page = await browser.newPage();
      
      try {
        // Configuration de la page avec timeout global
        await page.setDefaultTimeout(this.timeout);
        await page.setDefaultNavigationTimeout(this.timeout);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 720 });
        
        // Recherche de l'anime avec timeout
        const searchResults = await Promise.race([
          this._searchAnime(page, animeName),
          this._createTimeoutPromise(this.timeout, 'Search timeout')
        ]);
        
        if (!searchResults || searchResults.length === 0) {
          return null;
        }
        
        // Trouve le meilleur match avec recherche fuzzy
        const bestMatch = this._findBestMatch(animeName, searchResults);
        if (!bestMatch) {
          return null;
        }
        
        // Récupère le poster depuis la page de détail avec timeout
        const posterUrl = await Promise.race([
          this._extractPosterFromDetailPage(page, bestMatch.url),
          this._createTimeoutPromise(this.timeout, 'Poster extraction timeout')
        ]);
        
        return posterUrl;
        
      } finally {
        await page.close();
      }
    });
  }

  /**
   * Vérifie l'état de santé de la source Nautiljon
   * @returns {Promise<boolean>} true si le site est accessible
   */
  async healthCheck() {
    try {
      const browser = await this._getBrowser();
      const page = await browser.newPage();
      
      try {
        // Configuration de la page pour le health check
        await page.setDefaultTimeout(this.timeout);
        await page.setDefaultNavigationTimeout(this.timeout);
        
        // Test avec timeout strict
        await Promise.race([
          page.goto(this.baseUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: this.timeout 
          }),
          this._createTimeoutPromise(this.timeout, 'Health check timeout')
        ]);
        
        const title = await page.title();
        const isNautiljon = title.toLowerCase().includes('nautiljon');
        
        // Test supplémentaire : vérifier la présence d'éléments caractéristiques
        if (isNautiljon) {
          const hasSearchForm = await page.$('form[action*="search"], input[name="q"], .search-form');
          return !!hasSearchForm;
        }
        
        return false;
      } finally {
        await page.close();
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Recherche un anime sur Nautiljon
   * @private
   * @param {Page} page - Page Puppeteer
   * @param {string} animeName - Nom de l'anime à rechercher
   * @returns {Promise<Array>} Liste des résultats de recherche
   */
  async _searchAnime(page, animeName) {
    const searchQuery = this._normalizeSearchQuery(animeName);
    const searchUrl = `${this.searchUrl}?q=${encodeURIComponent(searchQuery)}`;
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: this.timeout 
    });
    
    // Sélecteurs robustes pour les résultats de recherche
    const resultSelectors = [
      '.anime_list',
      '.search-results',
      '.results',
      '[class*="anime"]',
      '[class*="result"]'
    ];
    
    const noResultSelectors = [
      '.no-result',
      '.no-results',
      '.empty-results',
      '[class*="no-result"]',
      '[class*="empty"]'
    ];
    
    // Attend que les résultats se chargent avec sélecteurs multiples
    let resultsFound = false;
    for (const selector of resultSelectors.concat(noResultSelectors)) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        resultsFound = true;
        break;
      } catch (error) {
        // Continue avec le sélecteur suivant
        continue;
      }
    }
    
    if (!resultsFound) {
      return [];
    }
    
    // Vérifie s'il n'y a pas de résultats avec sélecteurs robustes
    for (const selector of noResultSelectors) {
      const noResults = await page.$(selector);
      if (noResults) {
        return [];
      }
    }
    
    // Extrait les résultats de recherche avec sélecteurs robustes
    const results = await page.evaluate(() => {
      // Sélecteurs robustes pour les éléments de résultats
      const itemSelectors = [
        '.anime_list .anime_item',
        '.anime_list .item',
        '.search-results .item',
        '.results .anime',
        '[class*="anime"] [class*="item"]',
        '[class*="result"] [class*="item"]',
        'article',
        '.card'
      ];
      
      let items = [];
      for (const selector of itemSelectors) {
        items = document.querySelectorAll(selector);
        if (items.length > 0) break;
      }
      
      return Array.from(items).map(item => {
        // Sélecteurs robustes pour le titre
        const titleSelectors = [
          'a[title]',
          '.title a',
          'h3 a',
          'h2 a',
          '.name a',
          '[class*="title"] a',
          '[class*="name"] a'
        ];
        
        let titleElement = null;
        for (const selector of titleSelectors) {
          titleElement = item.querySelector(selector);
          if (titleElement) break;
        }
        
        // Sélecteurs robustes pour le lien
        const linkSelectors = [
          'a[href*="anime"]',
          'a[href*="/"]',
          'a'
        ];
        
        let linkElement = null;
        for (const selector of linkSelectors) {
          linkElement = item.querySelector(selector);
          if (linkElement && linkElement.href) break;
        }
        
        if (!titleElement || !linkElement) return null;
        
        const title = titleElement.textContent?.trim() || 
                     titleElement.getAttribute('title') || 
                     titleElement.getAttribute('alt') || '';
        
        return {
          title: title,
          url: linkElement.href,
          element: item.outerHTML
        };
      }).filter(result => result && result.title && result.url);
    });
    
    return results;
  }

  /**
   * Extrait l'URL du poster depuis une page de détail
   * @private
   * @param {Page} page - Page Puppeteer
   * @param {string} detailUrl - URL de la page de détail
   * @returns {Promise<string|null>} URL du poster ou null
   */
  async _extractPosterFromDetailPage(page, detailUrl) {
    await page.goto(detailUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: this.timeout 
    });
    
    // Sélecteurs robustes et étendus pour l'image du poster
    const posterSelectors = [
      // Sélecteurs spécifiques à Nautiljon
      '.anime_image img',
      '.anime_fiche img',
      '.fiche_image img',
      '#anime_image img',
      
      // Sélecteurs génériques courants
      '.poster img',
      '.cover img',
      '.anime-cover img',
      '.main-image img',
      '.primary-image img',
      
      // Sélecteurs par attributs
      'img[alt*="poster"]',
      'img[alt*="cover"]',
      'img[alt*="anime"]',
      'img[src*="poster"]',
      'img[src*="cover"]',
      'img[src*="anime"]',
      
      // Sélecteurs par classes partielles
      '[class*="poster"] img',
      '[class*="cover"] img',
      '[class*="image"] img',
      '[class*="anime"] img',
      
      // Sélecteurs de fallback
      'article img',
      '.content img',
      '.main img',
      'img[width="200"]',
      'img[height="300"]',
      
      // Dernier recours - première image significative
      'img[src*=".jpg"]',
      'img[src*=".png"]',
      'img[src*=".webp"]'
    ];
    
    // Attend que les images se chargent
    try {
      await page.waitForSelector('img', { timeout: 3000 });
    } catch (error) {
      // Continue même si aucune image n'est trouvée immédiatement
    }
    
    for (const selector of posterSelectors) {
      try {
        const posterUrl = await page.evaluate((sel) => {
          const img = document.querySelector(sel);
          if (img) {
            // Priorité aux attributs d'image
            const url = img.src || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-original') ||
                       img.getAttribute('data-lazy') ||
                       img.getAttribute('data-srcset')?.split(' ')[0];
            
            // Vérifie que l'image a une taille raisonnable (évite les icônes)
            if (url && (img.naturalWidth > 100 || img.width > 100)) {
              return url;
            }
          }
          return null;
        }, selector);
        
        if (posterUrl && this._isValidImageUrl(posterUrl)) {
          // Convertit les URLs relatives en URLs absolues
          const finalUrl = posterUrl.startsWith('http') ? posterUrl : `${this.baseUrl}${posterUrl}`;
          
          // Vérifie que l'URL finale est accessible
          if (await this._validateImageUrl(page, finalUrl)) {
            return finalUrl;
          }
        }
      } catch (error) {
        // Continue avec le sélecteur suivant
        continue;
      }
    }
    
    return null;
  }

  /**
   * Trouve le meilleur match parmi les résultats de recherche
   * @private
   * @param {string} searchTerm - Terme de recherche original
   * @param {Array} results - Résultats de recherche
   * @returns {Object|null} Meilleur résultat ou null
   */
  _findBestMatch(searchTerm, results) {
    if (!results || results.length === 0) return null;
    
    const normalizedSearch = this._normalizeForComparison(searchTerm);
    
    // Calcule le score de similarité pour chaque résultat
    const scoredResults = results.map(result => ({
      ...result,
      score: this._calculateSimilarity(normalizedSearch, this._normalizeForComparison(result.title))
    }));
    
    // Trie par score décroissant
    scoredResults.sort((a, b) => b.score - a.score);
    
    // Retourne le meilleur match si le score est suffisant
    const bestMatch = scoredResults[0];
    return bestMatch.score > 0.3 ? bestMatch : null; // Seuil de similarité minimum
  }

  /**
   * Calcule la similarité entre deux chaînes (algorithme de Jaro-Winkler simplifié)
   * @private
   * @param {string} str1 - Première chaîne
   * @param {string} str2 - Deuxième chaîne
   * @returns {number} Score de similarité entre 0 et 1
   */
  _calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    // Recherche de sous-chaînes communes
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    
    let commonWords = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.length > 2 && word2.length > 2) {
          if (word1 === word2) {
            commonWords += 2;
          } else if (word1.includes(word2) || word2.includes(word1)) {
            commonWords += 1;
          }
        }
      }
    }
    
    const maxWords = Math.max(words1.length, words2.length);
    return maxWords > 0 ? commonWords / (maxWords * 2) : 0;
  }

  /**
   * Normalise une requête de recherche
   * @private
   * @param {string} query - Requête à normaliser
   * @returns {string} Requête normalisée
   */
  _normalizeSearchQuery(query) {
    return query
      .replace(/[^\w\s\-]/g, ' ') // Supprime la ponctuation sauf tirets
      .replace(/\s+/g, ' ')       // Normalise les espaces
      .trim();
  }

  /**
   * Normalise une chaîne pour la comparaison
   * @private
   * @param {string} str - Chaîne à normaliser
   * @returns {string} Chaîne normalisée
   */
  _normalizeForComparison(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')   // Supprime toute ponctuation
      .replace(/\s+/g, ' ')       // Normalise les espaces
      .trim();
  }

  /**
   * Vérifie si une URL est une URL d'image valide
   * @private
   * @param {string} url - URL à vérifier
   * @returns {boolean} true si l'URL semble être une image
   */
  _isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const lowerUrl = url.toLowerCase();
    
    return imageExtensions.some(ext => lowerUrl.includes(ext)) || 
           lowerUrl.includes('image') || 
           lowerUrl.includes('poster') ||
           lowerUrl.includes('cover');
  }

  /**
   * Assure le respect du rate limiting (10 req/min)
   * @private
   */
  async _ensureRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Crée une promesse de timeout
   * @private
   * @param {number} timeout - Timeout en millisecondes
   * @param {string} message - Message d'erreur
   * @returns {Promise} Promesse qui rejette après le timeout
   */
  _createTimeoutPromise(timeout, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }

  /**
   * Valide qu'une URL d'image est accessible
   * @private
   * @param {Page} page - Page Puppeteer
   * @param {string} imageUrl - URL de l'image à valider
   * @returns {Promise<boolean>} true si l'image est accessible
   */
  async _validateImageUrl(page, imageUrl) {
    try {
      const response = await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get('content-type')
          };
        } catch (error) {
          return { ok: false, status: 0, contentType: null };
        }
      }, imageUrl);
      
      return response.ok && 
             response.status < 400 && 
             response.contentType && 
             response.contentType.startsWith('image/');
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtient une instance de navigateur Puppeteer
   * @private
   * @returns {Promise<Browser>} Instance du navigateur
   */
  async _getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        timeout: this.timeout,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-field-trial-config',
          '--disable-back-forward-cache',
          '--disable-ipc-flooding-protection',
          '--enable-features=NetworkService,NetworkServiceLogging',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--use-mock-keychain'
        ]
      });
      
      // Gestion des erreurs du navigateur
      if (this.browser.on) {
        this.browser.on('disconnected', () => {
          this.browser = null;
        });
      }
    }
    return this.browser;
  }

  /**
   * Ferme le navigateur Puppeteer
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = NautiljonSource;