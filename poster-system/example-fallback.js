// poster-system/example-fallback.js
// Exemple d'utilisation de la chaîne de fallback avec métriques

const FallbackChain = require('./services/FallbackChain');
const MetricsCollector = require('./services/MetricsCollector');
const TMDBSource = require('./sources/TMDBSource');

// Configuration d'exemple
const config = {
  tmdb: {
    enabled: true,
    priority: 2,
    timeout: 3000,
    apiKey: process.env.TMDB_API_KEY || '07ffec2df46c7ed63e0f39b8d85e705e'
  }
};

async function demonstrateFallbackChain() {
  console.log('🚀 Démonstration de la chaîne de fallback avec métriques\n');

  // Initialiser les composants
  const fallbackChain = new FallbackChain(config);
  const metricsCollector = new MetricsCollector();

  // Créer et enregistrer une source TMDB
  const tmdbSource = new TMDBSource(config.tmdb);
  fallbackChain.registerSource(tmdbSource);

  console.log('📊 État initial des métriques:');
  console.log('- Métriques globales:', metricsCollector.getStats());
  console.log('- Statistiques des sources:', fallbackChain.getSourcesStats());
  console.log();

  // Test 1: Recherche d'un anime populaire
  console.log('🔍 Test 1: Recherche d\'Attack on Titan...');
  try {
    const result1 = await fallbackChain.fetchPoster('aot', 'Attack on Titan');
    if (result1.url) {
      metricsCollector.recordSuccess(result1.source, 1500);
      console.log(`✅ Poster trouvé: ${result1.url.substring(0, 50)}...`);
      console.log(`📍 Source utilisée: ${result1.source}`);
    } else {
      metricsCollector.recordFailure('not_found');
      console.log('❌ Aucun poster trouvé');
    }
  } catch (error) {
    metricsCollector.recordError(error);
    console.log(`❌ Erreur: ${error.message}`);
  }
  console.log();

  // Test 2: Recherche d'un anime moins connu
  console.log('🔍 Test 2: Recherche de "Anime Inexistant"...');
  try {
    const result2 = await fallbackChain.fetchPoster('fake', 'Anime Inexistant XYZ 123');
    if (result2.url) {
      metricsCollector.recordSuccess(result2.source, 2000);
      console.log(`✅ Poster trouvé: ${result2.url.substring(0, 50)}...`);
    } else {
      metricsCollector.recordFailure('not_found');
      console.log('❌ Aucun poster trouvé (attendu)');
    }
  } catch (error) {
    metricsCollector.recordError(error);
    console.log(`❌ Erreur: ${error.message}`);
  }
  console.log();

  // Test 3: Health check
  console.log('🏥 Test 3: Health check des sources...');
  const healthResults = await fallbackChain.healthCheckAll();
  for (const [sourceName, health] of Object.entries(healthResults)) {
    console.log(`- ${sourceName}: ${health.healthy ? '✅ Sain' : '❌ Défaillant'}`);
    if (health.error) {
      console.log(`  Erreur: ${health.error}`);
    }
  }
  console.log();

  // Affichage des métriques finales
  console.log('📊 Métriques finales:');
  
  console.log('\n🌐 Métriques globales:');
  const globalStats = metricsCollector.getStats();
  console.log(`- Total requêtes: ${globalStats.totalRequests}`);
  console.log(`- Requêtes réussies: ${globalStats.successfulRequests}`);
  console.log(`- Requêtes échouées: ${globalStats.failedRequests}`);
  console.log(`- Taux de succès: ${(globalStats.successRate * 100).toFixed(1)}%`);
  console.log(`- Temps de réponse moyen: ${globalStats.averageResponseTime.toFixed(0)}ms`);

  console.log('\n📈 Métriques par source:');
  const sourceStats = fallbackChain.getSourcesStats();
  for (const [sourceName, stats] of Object.entries(sourceStats)) {
    console.log(`- ${sourceName}:`);
    console.log(`  • Total: ${stats.totalRequests} requêtes`);
    console.log(`  • Succès: ${stats.successfulRequests}`);
    console.log(`  • Échecs: ${stats.failedRequests}`);
    console.log(`  • Temps moyen: ${stats.averageResponseTime.toFixed(0)}ms`);
    console.log(`  • Activée: ${stats.enabled ? 'Oui' : 'Non'}`);
    console.log(`  • Disponible: ${stats.available ? 'Oui' : 'Non'}`);
  }

  console.log('\n🔧 Configuration actuelle:');
  console.log('- Sources configurées:', Object.keys(config).length);
  console.log('- Sources enregistrées:', fallbackChain.sources.size);

  console.log('\n✅ Démonstration terminée!');
}

// Exécuter la démonstration si le script est appelé directement
if (require.main === module) {
  demonstrateFallbackChain().catch(error => {
    console.error('❌ Erreur lors de la démonstration:', error);
    process.exit(1);
  });
}

module.exports = { demonstrateFallbackChain };