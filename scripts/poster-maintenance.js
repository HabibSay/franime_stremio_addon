#!/usr/bin/env node
// scripts/poster-maintenance.js
// Script CLI pour les commandes de maintenance du système de posters

const { PosterManager } = require('../poster-system');
const { loadConfig } = require('../config/poster-config');

/**
 * Classe pour les commandes de maintenance du système de posters
 */
class PosterMaintenanceCLI {
  constructor() {
    this.posterManager = null;
  }

  /**
   * Initialise le gestionnaire de posters
   */
  async initialize() {
    try {
      const config = loadConfig();
      this.posterManager = new PosterManager(config);
      await this.posterManager.initialize();
      console.log('✅ Système de posters initialisé');
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation:', error.message);
      process.exit(1);
    }
  }

  /**
   * Vide le cache manuellement
   */
  async clearCache() {
    console.log('🗑️ Vidage du cache en cours...');
    try {
      await this.posterManager.clearCache();
      const stats = this.posterManager.getStats();
      console.log(`✅ Cache vidé avec succès`);
      console.log(`📊 Taille du cache: ${stats.cache.size}/${stats.config.cacheSize}`);
    } catch (error) {
      console.error('❌ Erreur lors du vidage du cache:', error.message);
    }
  }

  /**
   * Réactive toutes les sources désactivées
   */
  async resetSources() {
    console.log('🔄 Réactivation des sources désactivées...');
    try {
      const stats = this.posterManager.getStats();
      const disabledSources = Object.keys(stats.sources).filter(
        name => stats.sources[name].isTemporarilyDisabled
      );

      if (disabledSources.length === 0) {
        console.log('ℹ️ Aucune source temporairement désactivée');
        return;
      }

      disabledSources.forEach(sourceName => {
        this.posterManager.setSourceEnabled(sourceName, true);
      });

      // Remet à zéro les métriques pour un nouveau départ
      this.posterManager.resetMetrics();

      console.log(`✅ ${disabledSources.length} source(s) réactivée(s):`);
      disabledSources.forEach(name => console.log(`   - ${name}`));
    } catch (error) {
      console.error('❌ Erreur lors de la réactivation des sources:', error.message);
    }
  }

  /**
   * Valide la santé de toutes les sources
   */
  async validateSources() {
    console.log('🔍 Validation de la santé des sources...');
    try {
      const healthResults = await this.posterManager.healthCheck();
      
      console.log('\n📋 Résultats de la validation:');
      console.log('================================');
      
      let healthySources = 0;
      const totalSources = Object.keys(healthResults).length;

      for (const [sourceName, result] of Object.entries(healthResults)) {
        const status = result.healthy ? '✅' : '❌';
        const responseTime = result.responseTime ? `(${result.responseTime}ms)` : '';
        const error = result.error ? ` - ${result.error}` : '';
        
        console.log(`${status} ${sourceName} ${responseTime}${error}`);
        
        if (result.healthy) healthySources++;
      }

      console.log('================================');
      console.log(`📊 Résumé: ${healthySources}/${totalSources} sources saines (${(healthySources/totalSources*100).toFixed(1)}%)`);

      if (healthySources < totalSources) {
        console.log('\n⚠️ Certaines sources présentent des problèmes.');
        console.log('💡 Utilisez --reset-sources pour réactiver les sources désactivées.');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la validation des sources:', error.message);
    }
  }

  /**
   * Affiche les statistiques détaillées du système
   */
  async showStats() {
    console.log('📊 Statistiques du système de posters');
    console.log('=====================================');
    
    try {
      const stats = this.posterManager.getStats();
      
      // Statistiques du cache
      console.log('\n🗄️ Cache:');
      console.log(`   Taille: ${stats.cache.size}/${stats.config.cacheSize}`);
      console.log(`   Hits: ${stats.cache.hits}`);
      console.log(`   Misses: ${stats.cache.misses}`);
      const hitRate = stats.cache.hits + stats.cache.misses > 0 
        ? (stats.cache.hits / (stats.cache.hits + stats.cache.misses) * 100).toFixed(1)
        : 0;
      console.log(`   Taux de réussite: ${hitRate}%`);
      
      // Statistiques des sources
      console.log('\n🔗 Sources:');
      Object.keys(stats.sources).forEach(sourceName => {
        const source = stats.sources[sourceName];
        const successRate = source.totalRequests > 0 
          ? (source.successfulRequests / source.totalRequests * 100).toFixed(1)
          : 0;
        const status = source.enabled ? (source.isTemporarilyDisabled ? '⏸️' : '✅') : '❌';
        
        console.log(`   ${status} ${sourceName}:`);
        console.log(`      Requêtes: ${source.totalRequests} (${source.successfulRequests} réussies)`);
        console.log(`      Taux de réussite: ${successRate}%`);
        console.log(`      Temps de réponse moyen: ${source.averageResponseTime}ms`);
        console.log(`      Échecs consécutifs: ${source.consecutiveFailures}`);
      });

      // Statistiques globales
      console.log('\n🌐 Global:');
      console.log(`   Requêtes totales: ${stats.global.totalRequests}`);
      console.log(`   Erreurs: ${stats.global.errors}`);
      console.log(`   Temps de fonctionnement: ${Math.floor(process.uptime())}s`);
      
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des statistiques:', error.message);
    }
  }

  /**
   * Remet à zéro toutes les métriques
   */
  async resetMetrics() {
    console.log('🔄 Remise à zéro des métriques...');
    try {
      this.posterManager.resetMetrics();
      console.log('✅ Métriques remises à zéro avec succès');
    } catch (error) {
      console.error('❌ Erreur lors de la remise à zéro des métriques:', error.message);
    }
  }

  /**
   * Affiche l'aide
   */
  showHelp() {
    console.log('🛠️ Commandes de maintenance du système de posters FRAnime');
    console.log('=========================================================');
    console.log('');
    console.log('Usage: node scripts/poster-maintenance.js [commande]');
    console.log('');
    console.log('Commandes disponibles:');
    console.log('  --clear-cache      Vide complètement le cache des posters');
    console.log('  --reset-sources    Réactive toutes les sources temporairement désactivées');
    console.log('  --validate-sources Valide la santé de toutes les sources');
    console.log('  --stats           Affiche les statistiques détaillées du système');
    console.log('  --reset-metrics   Remet à zéro toutes les métriques');
    console.log('  --help            Affiche cette aide');
    console.log('');
    console.log('Exemples:');
    console.log('  node scripts/poster-maintenance.js --clear-cache');
    console.log('  node scripts/poster-maintenance.js --validate-sources');
    console.log('  node scripts/poster-maintenance.js --stats');
  }

  /**
   * Ferme proprement le système
   */
  async shutdown() {
    if (this.posterManager) {
      await this.posterManager.shutdown();
    }
  }
}

/**
 * Point d'entrée principal du script
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    const cli = new PosterMaintenanceCLI();
    cli.showHelp();
    return;
  }

  const cli = new PosterMaintenanceCLI();
  
  try {
    await cli.initialize();

    // Traitement des commandes
    if (args.includes('--clear-cache')) {
      await cli.clearCache();
    }
    
    if (args.includes('--reset-sources')) {
      await cli.resetSources();
    }
    
    if (args.includes('--validate-sources')) {
      await cli.validateSources();
    }
    
    if (args.includes('--stats')) {
      await cli.showStats();
    }
    
    if (args.includes('--reset-metrics')) {
      await cli.resetMetrics();
    }

    // Si aucune commande reconnue
    const validCommands = ['--clear-cache', '--reset-sources', '--validate-sources', '--stats', '--reset-metrics', '--help'];
    const hasValidCommand = args.some(arg => validCommands.includes(arg));
    
    if (!hasValidCommand) {
      console.error('❌ Commande non reconnue');
      cli.showHelp();
    }

  } catch (error) {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
  } finally {
    await cli.shutdown();
  }
}

// Gestion propre de l'arrêt du processus
process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt du script de maintenance...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Arrêt du script de maintenance...');
  process.exit(0);
});

// Exécution du script si appelé directement
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erreur non gérée:', error);
    process.exit(1);
  });
}

module.exports = PosterMaintenanceCLI;