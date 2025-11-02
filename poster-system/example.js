// poster-system/example.js
// Exemple d'utilisation du système de fallback des posters

const { PosterManager, PosterSource } = require('./index');

// Exemple de configuration
const config = {
  sources: {
    kitsu: {
      enabled: true,
      timeout: 3000,
      priority: 1
    },
    tmdb: {
      enabled: true,
      timeout: 3000,
      priority: 2,
      apiKey: process.env.TMDB_API_KEY
    },
    nautiljon: {
      enabled: true,
      timeout: 5000,
      priority: 3
    }
  },
  cache: {
    ttl: 24 * 60 * 60 * 1000, // 24 heures
    maxSize: 1000,
    persistToDisk: false
  },
  circuitBreaker: {
    failureThreshold: 10,
    disableDuration: 30 * 60 * 1000 // 30 minutes
  }
};

// Exemple d'utilisation
async function example() {
  // Initialisation du gestionnaire
  const posterManager = new PosterManager(config);
  await posterManager.initialize();

  // Note: Les sources réelles (KitsuSource, TMDBSource, etc.) 
  // seront implémentées dans les tâches suivantes
  
  try {
    // Récupération d'un poster
    const result = await posterManager.getPoster('12345', 'One Piece');
    console.log('Résultat:', result);
    
    // Statistiques
    const stats = posterManager.getStats();
    console.log('Statistiques:', stats);
    
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    // Nettoyage
    await posterManager.shutdown();
  }
}

// Exemple de source personnalisée (pour démonstration)
class ExampleSource extends PosterSource {
  constructor() {
    super('example', 1, { enabled: true, timeout: 3000 });
  }

  async fetchPoster(animeId, animeName) {
    return await this._executeWithMetrics(async () => {
      // Simulation d'une requête
      await new Promise(resolve => setTimeout(resolve, 100));
      return `https://example.com/poster/${animeId}.jpg`;
    });
  }

  async healthCheck() {
    return true;
  }
}

module.exports = { example, ExampleSource };

// Exécution de l'exemple si le fichier est lancé directement
if (require.main === module) {
  example().catch(console.error);
}