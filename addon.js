// addon.js
const { addonBuilder } = require('stremio-addon-sdk');
const scrapeAnimeCatalog = require('./utils/scrapeCatalog');
const { PosterManager } = require('./poster-system');
const { loadConfig, displayConfig } = require('./config/poster-config');
const { KitsuSource } = require('./utils/kitsu');
const TMDBSource = require('./poster-system/sources/TMDBSource');
const NautiljonSource = require('./poster-system/sources/NautiljonSource');

// Mapping global slug → anime_id (pour les streams plus tard)
const ANIME_ID_MAP = {};

// Catalogue en cache
let CACHED_CATALOG = [];
let LAST_FETCH = 0;

// Validation et chargement de la configuration
let posterConfig;
let posterManager;

async function initializePosterSystem() {
  try {
    posterConfig = loadConfig();
    displayConfig(posterConfig);
    posterManager = new PosterManager(posterConfig);
    
    // Enregistrer toutes les sources disponibles dans FallbackChain
    const kitsuSource = new KitsuSource(posterConfig.sources.kitsu);
    const tmdbSource = new TMDBSource(posterConfig.sources.tmdb);
    const nautiljonSource = new NautiljonSource(posterConfig.sources.nautiljon);
    
    // Enregistrer les sources dans l'ordre de priorité
    posterManager.fallbackChain.registerSource(kitsuSource);
    posterManager.fallbackChain.registerSource(tmdbSource);
    posterManager.fallbackChain.registerSource(nautiljonSource);
    
    console.log('✅ Système de fallback des posters initialisé avec succès');
    console.log(`📋 Sources enregistrées: ${[kitsuSource.name, tmdbSource.name, nautiljonSource.name].join(', ')}`);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation du système de posters:', error.message);
    console.error('🔧 Vérifiez votre configuration et les variables d\'environnement');
    
    // Configuration de fallback minimale (Kitsu seulement)
    console.warn('⚠️ Utilisation de la configuration de fallback (Kitsu uniquement)');
    posterConfig = {
      sources: {
        kitsu: { enabled: true, timeout: 3000, priority: 1 }
      },
      cache: { ttl: 24 * 60 * 60 * 1000, maxSize: 1000, persistToDisk: false },
      circuitBreaker: { failureThreshold: 10, disableDuration: 30 * 60 * 1000 }
    };
    posterManager = new PosterManager(posterConfig);
    
    // Enregistrer au moins Kitsu en fallback
    const kitsuSource = new KitsuSource(posterConfig.sources.kitsu);
    posterManager.fallbackChain.registerSource(kitsuSource);
    console.log('✅ Configuration de fallback initialisée avec Kitsu uniquement');
  }
}

// Initialiser le système de posters de manière asynchrone
initializePosterSystem();

// === 1. Manifeste (obligatoire) ===
const manifest = {
	"id": "community.FRAnime",
	"version": "0.0.1",
	"name": "FRAnime | VOSTFR",
	"description": "non-official Addon to stream from Fr-Anime",
	"logo": "https://raw.githubusercontent.com/Dydhzo/astream/refs/heads/main/astream/assets/astream-logo.jpg",
	"background": "https://raw.githubusercontent.com/Dydhzo/astream/refs/heads/main/astream/assets/astream-background.png",
	"catalogs": [
		{
			"id": "franime_catalog",
			"type": "anime",
			"name": "FR-Anime",
			"extra": [
				{
					"name": "skip",
					"isRequired": false,
					"options": [],
					"optionsLimit": 1
				},
				{
					"name": "search",
          			"isRequired": false,
          			"options": [],
          			"optionsLimit": 1
				},
				{
					"name": "genre",
					"isRequired": false,
					"options": [],
					"optionsLimit": 1
				}
			]
		}
	],
	"resources": [
		"catalog",
		{
			"name": "meta",
			"types": ["anime"],
			"idPrefixes": ["fra"]
		},
		{
			"name": "stream",
			"types": ["anime"],
			"idPrefixes": ["fra"]
		}
	],
	"types": ["anime"],
	"addonCatalogs": [],
	"idPrefixes": ['franime:'],
	"behaviorHints": {
		"adult": false,
		"p2p": false,
		"configurable": false,
		"configurationRequired": false
	}
}
const builder = new addonBuilder(manifest)


// Fonction utilitaire pour récupérer le catalogue en cache (utilisée par les métadonnées)
function getCachedCatalog() {
  return CACHED_CATALOG;
}

// Limitation des requêtes simultanées pour les posters
const MAX_CONCURRENT_POSTER_REQUESTS = 5;
let currentPosterRequests = 0;
const posterRequestQueue = [];

// Gestionnaire de queue pour les requêtes de posters
async function processPosterQueue() {
  while (posterRequestQueue.length > 0 && currentPosterRequests < MAX_CONCURRENT_POSTER_REQUESTS) {
    const { anime, resolve, reject } = posterRequestQueue.shift();
    currentPosterRequests++;
    
    try {
      const posterResult = await posterManager.getPoster(anime.anime_id, anime.name);
      resolve({
        ...anime,
        posterUrl: posterResult.url || 'https://via.placeholder.com/300x450?text=Pas+de+poster',
        posterSource: posterResult.source,
        fromCache: posterResult.fromCache
      });
    } catch (error) {
      console.error(`❌ Erreur poster pour ${anime.name}:`, error);
      resolve({
        ...anime,
        posterUrl: 'https://via.placeholder.com/300x450?text=Erreur+poster',
        posterSource: 'error',
        fromCache: false
      });
    } finally {
      currentPosterRequests--;
      // Continue le traitement de la queue
      setImmediate(processPosterQueue);
    }
  }
}

// Fonction pour récupérer un poster de manière asynchrone avec limitation
function getPosterAsync(anime) {
  return new Promise((resolve, reject) => {
    posterRequestQueue.push({ anime, resolve, reject });
    processPosterQueue();
  });
}

// Catalogue avec gestion asynchrone des posters
builder.defineCatalogHandler(async ({ type }) => {
  if (type !== 'anime') return { metas: [] };
  
  // Récupère le catalogue de base (sans posters)
  const now = Date.now();
  let rawCatalog = [];
  
  if (now - LAST_FETCH > 10 * 60 * 1000) { // toutes les 10 min
    rawCatalog = await scrapeAnimeCatalog();
    LAST_FETCH = now;
    
    // Met à jour le mapping des IDs
    rawCatalog.forEach(anime => {
      ANIME_ID_MAP[anime.slug] = anime.anime_id;
    });
  } else {
    // Utilise le catalogue en cache
    rawCatalog = CACHED_CATALOG.map(anime => ({
      anime_id: anime.anime_id,
      name: anime.name,
      slug: anime.slug
    }));
  }

  // Initialise le gestionnaire de posters (s'assurer qu'il est prêt)
  if (posterManager && !posterManager.isInitialized) {
    await posterManager.initialize();
  }

  // Prépare les metas avec placeholders temporaires
  const metas = rawCatalog.map(anime => ({
    id: `franime:${anime.slug}`,
    anime_id: anime.anime_id,
    type: 'anime',
    name: anime.name,
    poster: 'https://via.placeholder.com/300x450?text=Chargement...'
  }));

  // Lance la récupération asynchrone des posters en arrière-plan
  if (now - LAST_FETCH > 10 * 60 * 1000 || CACHED_CATALOG.length === 0) {
    setImmediate(async () => {
      try {
        const enrichedAnimes = await Promise.all(
          rawCatalog.map(anime => getPosterAsync(anime))
        );
        
        CACHED_CATALOG = enrichedAnimes;
        
        // Affiche les statistiques
        const stats = posterManager.getStats();
        console.log(`🖼️ ${enrichedAnimes.length} posters traités de manière asynchrone`);
        console.log(`📊 Cache: ${stats.cache.hits} hits, ${stats.cache.misses} misses`);
        console.log(`📈 Sources actives: ${Object.keys(stats.sources).filter(s => stats.sources[s].enabled).length}`);
      } catch (error) {
        console.error('❌ Erreur lors du traitement asynchrone des posters:', error);
      }
    });
  } else {
    // Utilise les posters en cache et met à jour les metas
    metas.forEach((meta, index) => {
      const cachedAnime = CACHED_CATALOG.find(a => a.slug === rawCatalog[index].slug);
      if (cachedAnime && cachedAnime.posterUrl) {
        meta.poster = cachedAnime.posterUrl;
      }
    });
  }

  console.log(`📤 Envoi de ${metas.length} animes à Stremio (posters: ${metas.filter(m => !m.poster.includes('placeholder')).length} réels, ${metas.filter(m => m.poster.includes('placeholder')).length} placeholders)`);
  return { metas };
});

// Métadonnées
builder.defineMetaHandler(({ id }) => {
  if (!id.startsWith('franime:')) return { meta: null };
  const slug = id.replace('franime:', '');
  const anime_id = ANIME_ID_MAP[slug];
  if (!anime_id) return { meta: null };

  const cachedCatalog = getCachedCatalog();
  const cachedAnime = cachedCatalog.find(a => a.slug === slug);

  return {
    meta: {
      id,
      type: 'anime',
      name: slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      poster: cachedAnime?.posterUrl || 'https://via.placeholder.com/300x450?text=Pas+de+poster',
	  releaseInfo: 'Release Date goes here',
	  posterShape: 'poster',
	  description: 'Description goes here'
    }
  };
});

// Streams (à compléter plus tard pour Sibnet/Sendvid)
builder.defineStreamHandler(({ id, videoId }) => {
  return { streams: [] }; // placeholder
});

module.exports = builder.getInterface()