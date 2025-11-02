// config/poster-config.js
// Configuration centralisée pour le système de fallback des posters

/**
 * Configuration par défaut du système de fallback des posters
 */
const DEFAULT_CONFIG = {
  sources: {
    kitsu: {
      enabled: true,
      timeout: 3000,
      priority: 1,
      rateLimit: {
        requests: 30,
        window: 60000 // 1 minute
      }
    },
    tmdb: {
      enabled: true,
      timeout: 3000,
      priority: 2,
      apiKey: '', // Sera défini via variable d'environnement
      rateLimit: {
        requests: 40,
        window: 10000 // 10 secondes
      }
    },
    nautiljon: {
      enabled: true,
      timeout: 5000,
      priority: 3,
      rateLimit: {
        requests: 10,
        window: 60000 // 1 minute
      }
    }
  },
  cache: {
    ttl: 24 * 60 * 60 * 1000, // 24 heures
    maxSize: 1000,
    persistToDisk: true,
    diskPath: './cache/posters.json'
  },
  circuitBreaker: {
    failureThreshold: 10,
    disableDuration: 30 * 60 * 1000, // 30 minutes
    halfOpenRetryDelay: 5 * 60 * 1000 // 5 minutes
  },
  concurrency: {
    maxSimultaneousRequests: 5,
    queueTimeout: 30000 // 30 secondes
  },
  fallback: {
    defaultPlaceholder: 'https://via.placeholder.com/300x450?text=Pas+de+poster',
    errorPlaceholder: 'https://via.placeholder.com/300x450?text=Erreur+poster',
    loadingPlaceholder: 'https://via.placeholder.com/300x450?text=Chargement...'
  }
};

/**
 * Variables d'environnement requises
 */
const REQUIRED_ENV_VARS = [
  {
    name: 'TMDB_API_KEY',
    description: 'Clé API pour The Movie Database (TMDB)',
    required: false, // Optionnel car TMDB est une source de fallback
    validation: (value) => {
      if (value && (typeof value !== 'string' || value.length < 10)) {
        throw new Error('TMDB_API_KEY doit être une chaîne d\'au moins 10 caractères');
      }
      return true;
    }
  }
];

/**
 * Variables d'environnement optionnelles avec valeurs par défaut
 */
const OPTIONAL_ENV_VARS = [
  {
    name: 'POSTER_CACHE_TTL',
    description: 'Durée de vie du cache des posters en millisecondes',
    defaultValue: DEFAULT_CONFIG.cache.ttl,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 60000) { // Minimum 1 minute
        throw new Error('POSTER_CACHE_TTL doit être un nombre >= 60000 (1 minute)');
      }
      return num;
    }
  },
  {
    name: 'POSTER_CACHE_SIZE',
    description: 'Taille maximale du cache des posters',
    defaultValue: DEFAULT_CONFIG.cache.maxSize,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 10) {
        throw new Error('POSTER_CACHE_SIZE doit être un nombre >= 10');
      }
      return num;
    }
  },
  {
    name: 'POSTER_MAX_CONCURRENT',
    description: 'Nombre maximum de requêtes simultanées pour les posters',
    defaultValue: DEFAULT_CONFIG.concurrency.maxSimultaneousRequests,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 1 || num > 20) {
        throw new Error('POSTER_MAX_CONCURRENT doit être un nombre entre 1 et 20');
      }
      return num;
    }
  },
  {
    name: 'KITSU_ENABLED',
    description: 'Active ou désactive la source Kitsu',
    defaultValue: DEFAULT_CONFIG.sources.kitsu.enabled,
    validation: (value) => {
      return value === 'true' || value === '1';
    }
  },
  {
    name: 'TMDB_ENABLED',
    description: 'Active ou désactive la source TMDB',
    defaultValue: DEFAULT_CONFIG.sources.tmdb.enabled,
    validation: (value) => {
      return value === 'true' || value === '1';
    }
  },
  {
    name: 'NAUTILJON_ENABLED',
    description: 'Active ou désactive la source Nautiljon',
    defaultValue: DEFAULT_CONFIG.sources.nautiljon.enabled,
    validation: (value) => {
      return value === 'true' || value === '1';
    }
  }
];

/**
 * Valide et charge la configuration depuis les variables d'environnement
 * @returns {Object} Configuration validée
 * @throws {Error} Si la validation échoue
 */
function loadConfig() {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep copy
  const errors = [];
  const warnings = [];

  // Validation des variables requises
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];
    
    if (!value && envVar.required) {
      errors.push(`Variable d'environnement requise manquante: ${envVar.name} - ${envVar.description}`);
      continue;
    }

    if (value) {
      try {
        envVar.validation(value);
      } catch (error) {
        errors.push(`Variable d'environnement invalide ${envVar.name}: ${error.message}`);
      }
    }
  }

  // Traitement des variables optionnelles
  for (const envVar of OPTIONAL_ENV_VARS) {
    const value = process.env[envVar.name];
    
    if (value) {
      try {
        const validatedValue = envVar.validation(value);
        
        // Application de la valeur selon le nom de la variable
        switch (envVar.name) {
          case 'POSTER_CACHE_TTL':
            config.cache.ttl = validatedValue;
            break;
          case 'POSTER_CACHE_SIZE':
            config.cache.maxSize = validatedValue;
            break;
          case 'POSTER_MAX_CONCURRENT':
            config.concurrency.maxSimultaneousRequests = validatedValue;
            break;
          case 'KITSU_ENABLED':
            config.sources.kitsu.enabled = validatedValue;
            break;
          case 'TMDB_ENABLED':
            config.sources.tmdb.enabled = validatedValue;
            break;
          case 'NAUTILJON_ENABLED':
            config.sources.nautiljon.enabled = validatedValue;
            break;
        }
      } catch (error) {
        warnings.push(`Variable d'environnement invalide ${envVar.name}: ${error.message}, utilisation de la valeur par défaut`);
      }
    }
  }

  // Configuration de la clé API TMDB
  if (process.env.TMDB_API_KEY) {
    config.sources.tmdb.apiKey = process.env.TMDB_API_KEY;
  } else {
    warnings.push('TMDB_API_KEY non définie, la source TMDB sera désactivée');
    config.sources.tmdb.enabled = false;
  }

  // Vérification qu'au moins une source est activée
  const enabledSources = Object.values(config.sources).filter(source => source.enabled);
  if (enabledSources.length === 0) {
    errors.push('Aucune source de poster n\'est activée. Au moins une source doit être disponible.');
  }

  // Gestion des erreurs
  if (errors.length > 0) {
    const errorMessage = 'Erreurs de configuration:\n' + errors.map(e => `  - ${e}`).join('\n');
    throw new Error(errorMessage);
  }

  // Affichage des avertissements
  if (warnings.length > 0) {
    console.warn('⚠️ Avertissements de configuration:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  return config;
}

/**
 * Affiche la configuration actuelle (sans les clés sensibles)
 * @param {Object} config - Configuration à afficher
 */
function displayConfig(config) {
  const safeConfig = JSON.parse(JSON.stringify(config));
  
  // Masque les clés sensibles
  if (safeConfig.sources.tmdb.apiKey) {
    safeConfig.sources.tmdb.apiKey = '***MASKED***';
  }

  console.log('📋 Configuration du système de fallback des posters:');
  console.log('  Sources activées:', Object.keys(safeConfig.sources).filter(s => safeConfig.sources[s].enabled));
  console.log('  Cache TTL:', Math.round(safeConfig.cache.ttl / 1000 / 60), 'minutes');
  console.log('  Cache taille max:', safeConfig.cache.maxSize, 'entrées');
  console.log('  Requêtes simultanées max:', safeConfig.concurrency.maxSimultaneousRequests);
  console.log('  Circuit breaker seuil:', safeConfig.circuitBreaker.failureThreshold, 'échecs');
}

/**
 * Génère un fichier .env.example avec toutes les variables disponibles
 * @returns {string} Contenu du fichier .env.example
 */
function generateEnvExample() {
  const lines = [
    '# Configuration du système de fallback des posters FRAnime',
    '# Copiez ce fichier vers .env et configurez les valeurs selon vos besoins',
    '',
    '# Variables requises',
    ...REQUIRED_ENV_VARS.map(env => `# ${env.description}\n${env.name}=${env.required ? 'YOUR_VALUE_HERE' : ''}`),
    '',
    '# Variables optionnelles (avec valeurs par défaut)',
    ...OPTIONAL_ENV_VARS.map(env => `# ${env.description}\n# ${env.name}=${env.defaultValue}`)
  ];
  
  return lines.join('\n');
}

module.exports = {
  DEFAULT_CONFIG,
  REQUIRED_ENV_VARS,
  OPTIONAL_ENV_VARS,
  loadConfig,
  displayConfig,
  generateEnvExample
};