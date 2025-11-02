#!/usr/bin/env node
// scripts/diagnose-system.js
// Script de diagnostic automatisé du système de posters

const { PosterManager } = require('../poster-system');
const { loadConfig } = require('../config/poster-config');
const { validateConfiguration } = require('./validate-config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Classe pour le diagnostic automatisé du système
 */
class SystemDiagnostic {
  constructor() {
    this.posterManager = null;
    this.results = {
      configuration: null,
      connectivity: null,
      sources: null,
      cache: null,
      performance: null,
      logs: null,
      overall: 'unknown'
    };
  }

  /**
   * Lance le diagnostic complet
   */
  async runDiagnostic() {
    console.log('🔍 Diagnostic automatisé du système de posters FRAnime');
    console.log('======================================================');
    console.log('');

    try {
      // 1. Diagnostic de configuration
      await this.checkConfiguration();
      
      // 2. Test de connectivité réseau
      await this.checkConnectivity();
      
      // 3. Initialisation du système
      await this.initializeSystem();
      
      // 4. Diagnostic des sources
      await this.checkSources();
      
      // 5. Diagnostic du cache
      await this.checkCache();
      
      // 6. Diagnostic de performance
      await this.checkPerformance();
      
      // 7. Analyse des logs
      await this.analyzeLogs();
      
      // 8. Résumé et recommandations
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Erreur fatale lors du diagnostic:', error.message);
      this.results.overall = 'critical';
    } finally {
      if (this.posterManager) {
        await this.posterManager.shutdown();
      }
    }
  }

  /**
   * Vérifie la configuration
   */
  async checkConfiguration() {
    console.log('1. 📋 Vérification de la configuration...');
    
    try {
      validateConfiguration();
      console.log('   ✅ Configuration valide');
      this.results.configuration = 'valid';
    } catch (error) {
      console.log(`   ❌ Configuration invalide: ${error.message}`);
      this.results.configuration = 'invalid';
      
      // Suggestions de correction
      if (error.message.includes('TMDB_API_KEY')) {
        console.log('   💡 Suggestion: Configurez TMDB_API_KEY dans le fichier .env');
      }
    }
  }

  /**
   * Teste la connectivité réseau
   */
  async checkConnectivity() {
    console.log('\n2. 🌐 Test de connectivité réseau...');
    
    const endpoints = [
      { name: 'Kitsu', url: 'https://kitsu.io/api/edge/anime' },
      { name: 'TMDB', url: 'https://api.themoviedb.org/3/configuration' },
      { name: 'Nautiljon', url: 'https://www.nautiljon.com' }
    ];

    const results = {};
    
    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await fetch(endpoint.url, { 
          method: 'HEAD',
          timeout: 5000 
        });
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
          console.log(`   ✅ ${endpoint.name}: OK (${responseTime}ms)`);
          results[endpoint.name.toLowerCase()] = { status: 'ok', responseTime };
        } else {
          console.log(`   ⚠️ ${endpoint.name}: ${response.status} ${response.statusText}`);
          results[endpoint.name.toLowerCase()] = { status: 'warning', code: response.status };
        }
      } catch (error) {
        console.log(`   ❌ ${endpoint.name}: ${error.message}`);
        results[endpoint.name.toLowerCase()] = { status: 'error', error: error.message };
      }
    }
    
    this.results.connectivity = results;
  }

  /**
   * Initialise le système de posters
   */
  async initializeSystem() {
    console.log('\n3. 🚀 Initialisation du système...');
    
    try {
      const config = loadConfig();
      this.posterManager = new PosterManager(config);
      await this.posterManager.initialize();
      console.log('   ✅ Système initialisé avec succès');
    } catch (error) {
      console.log(`   ❌ Erreur d'initialisation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vérifie l'état des sources
   */
  async checkSources() {
    console.log('\n4. 🔗 Diagnostic des sources...');
    
    try {
      const healthResults = await this.posterManager.healthCheck();
      const stats = this.posterManager.getStats();
      
      let healthySources = 0;
      const totalSources = Object.keys(healthResults).length;
      
      for (const [sourceName, result] of Object.entries(healthResults)) {
        const status = result.healthy ? '✅' : '❌';
        const responseTime = result.responseTime ? `(${result.responseTime}ms)` : '';
        const error = result.error ? ` - ${result.error}` : '';
        const sourceStats = stats.sources[sourceName];
        const successRate = sourceStats && sourceStats.totalRequests > 0 
          ? (sourceStats.successfulRequests / sourceStats.totalRequests * 100).toFixed(1)
          : 'N/A';
        
        console.log(`   ${status} ${sourceName} ${responseTime}${error}`);
        if (sourceStats) {
          console.log(`      Requêtes: ${sourceStats.totalRequests}, Succès: ${successRate}%`);
          if (sourceStats.isTemporarilyDisabled) {
            console.log(`      ⏸️ Temporairement désactivée (${sourceStats.consecutiveFailures} échecs)`);
          }
        }
        
        if (result.healthy) healthySources++;
      }
      
      console.log(`   📊 Résumé: ${healthySources}/${totalSources} sources saines (${(healthySources/totalSources*100).toFixed(1)}%)`);
      
      this.results.sources = {
        healthy: healthySources,
        total: totalSources,
        details: healthResults
      };
      
    } catch (error) {
      console.log(`   ❌ Erreur lors du diagnostic des sources: ${error.message}`);
      this.results.sources = { error: error.message };
    }
  }

  /**
   * Vérifie l'état du cache
   */
  async checkCache() {
    console.log('\n5. 💾 Diagnostic du cache...');
    
    try {
      const stats = this.posterManager.getStats();
      const cacheStats = stats.cache;
      
      const usage = (cacheStats.size / stats.config.cacheSize * 100).toFixed(1);
      const hitRate = cacheStats.hits + cacheStats.misses > 0 
        ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1)
        : 0;
      
      console.log(`   📊 Taille: ${cacheStats.size}/${stats.config.cacheSize} (${usage}%)`);
      console.log(`   📊 Hits: ${cacheStats.hits}, Misses: ${cacheStats.misses}`);
      console.log(`   📊 Taux de réussite: ${hitRate}%`);
      console.log(`   📊 TTL configuré: ${Math.floor(stats.config.cacheTTL / 1000 / 60)} minutes`);
      
      // Évaluation de l'efficacité
      let cacheHealth = 'good';
      if (hitRate < 30) {
        cacheHealth = 'poor';
        console.log('   ⚠️ Taux de hit faible - considérez augmenter la taille ou le TTL');
      } else if (usage > 90) {
        cacheHealth = 'warning';
        console.log('   ⚠️ Cache presque plein - considérez augmenter la taille');
      } else {
        console.log('   ✅ Cache fonctionnel');
      }
      
      this.results.cache = {
        health: cacheHealth,
        usage: parseFloat(usage),
        hitRate: parseFloat(hitRate),
        stats: cacheStats
      };
      
    } catch (error) {
      console.log(`   ❌ Erreur lors du diagnostic du cache: ${error.message}`);
      this.results.cache = { error: error.message };
    }
  }

  /**
   * Vérifie les performances
   */
  async checkPerformance() {
    console.log('\n6. 📊 Test de performance...');
    
    try {
      // Test avec quelques animes populaires
      const testAnimes = [
        { id: 'test1', name: 'Naruto' },
        { id: 'test2', name: 'One Piece' },
        { id: 'test3', name: 'Attack on Titan' }
      ];
      
      const results = [];
      console.log('   🔍 Test de récupération de posters...');
      
      for (const anime of testAnimes) {
        const startTime = Date.now();
        try {
          const result = await this.posterManager.getPoster(anime.id, anime.name);
          const responseTime = Date.now() - startTime;
          
          results.push({
            anime: anime.name,
            success: !!result.url,
            responseTime,
            source: result.source,
            fromCache: result.fromCache
          });
          
          const status = result.url ? '✅' : '❌';
          const cache = result.fromCache ? '(cache)' : '';
          console.log(`      ${status} ${anime.name}: ${responseTime}ms ${cache}`);
          
        } catch (error) {
          results.push({
            anime: anime.name,
            success: false,
            responseTime: Date.now() - startTime,
            error: error.message
          });
          console.log(`      ❌ ${anime.name}: Erreur - ${error.message}`);
        }
      }
      
      // Calcul des métriques
      const successfulTests = results.filter(r => r.success).length;
      const averageTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      const successRate = (successfulTests / results.length * 100).toFixed(1);
      
      console.log(`   📊 Résultats: ${successfulTests}/${results.length} réussis (${successRate}%)`);
      console.log(`   📊 Temps moyen: ${averageTime.toFixed(0)}ms`);
      
      let performanceHealth = 'good';
      if (successRate < 70) {
        performanceHealth = 'poor';
        console.log('   ⚠️ Taux de réussite faible');
      } else if (averageTime > 5000) {
        performanceHealth = 'slow';
        console.log('   ⚠️ Temps de réponse élevé');
      } else {
        console.log('   ✅ Performances correctes');
      }
      
      this.results.performance = {
        health: performanceHealth,
        successRate: parseFloat(successRate),
        averageTime: Math.round(averageTime),
        results
      };
      
    } catch (error) {
      console.log(`   ❌ Erreur lors du test de performance: ${error.message}`);
      this.results.performance = { error: error.message };
    }
  }

  /**
   * Analyse les logs
   */
  async analyzeLogs() {
    console.log('\n7. 📄 Analyse des logs...');
    
    const logPath = path.join(__dirname, '../logs/poster-system.log');
    
    try {
      const logExists = await fs.access(logPath).then(() => true).catch(() => false);
      
      if (!logExists) {
        console.log('   ℹ️ Aucun fichier de log trouvé (LOG_TO_FILE=false)');
        this.results.logs = { status: 'no_file' };
        return;
      }
      
      const logContent = await fs.readFile(logPath, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // Analyse des dernières 24h
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentLines = lines.filter(line => {
        try {
          const logEntry = JSON.parse(line);
          return new Date(logEntry.timestamp).getTime() > oneDayAgo;
        } catch {
          return false;
        }
      });
      
      // Comptage par niveau
      const levels = { error: 0, warn: 0, info: 0, debug: 0 };
      recentLines.forEach(line => {
        try {
          const logEntry = JSON.parse(line);
          if (levels.hasOwnProperty(logEntry.level.toLowerCase())) {
            levels[logEntry.level.toLowerCase()]++;
          }
        } catch {}
      });
      
      console.log(`   📊 Logs des dernières 24h: ${recentLines.length} entrées`);
      console.log(`   📊 Erreurs: ${levels.error}, Warnings: ${levels.warn}`);
      console.log(`   📊 Info: ${levels.info}, Debug: ${levels.debug}`);
      
      // Évaluation de la santé des logs
      let logHealth = 'good';
      const errorRate = recentLines.length > 0 ? (levels.error / recentLines.length * 100) : 0;
      
      if (errorRate > 10) {
        logHealth = 'high_errors';
        console.log('   ⚠️ Taux d\'erreur élevé dans les logs');
      } else if (levels.error > 0) {
        logHealth = 'some_errors';
        console.log('   ⚠️ Quelques erreurs détectées');
      } else {
        console.log('   ✅ Logs sains');
      }
      
      this.results.logs = {
        status: 'analyzed',
        health: logHealth,
        totalLines: recentLines.length,
        levels,
        errorRate: Math.round(errorRate * 10) / 10
      };
      
    } catch (error) {
      console.log(`   ❌ Erreur lors de l'analyse des logs: ${error.message}`);
      this.results.logs = { error: error.message };
    }
  }

  /**
   * Génère le rapport final
   */
  generateReport() {
    console.log('\n📋 RAPPORT DE DIAGNOSTIC');
    console.log('========================');
    
    // Calcul du score global
    let score = 0;
    let maxScore = 0;
    
    // Configuration (20 points)
    maxScore += 20;
    if (this.results.configuration === 'valid') score += 20;
    
    // Connectivité (15 points)
    maxScore += 15;
    if (this.results.connectivity) {
      const okCount = Object.values(this.results.connectivity)
        .filter(c => c.status === 'ok').length;
      score += Math.round(okCount / 3 * 15);
    }
    
    // Sources (25 points)
    maxScore += 25;
    if (this.results.sources && this.results.sources.healthy) {
      score += Math.round(this.results.sources.healthy / this.results.sources.total * 25);
    }
    
    // Cache (15 points)
    maxScore += 15;
    if (this.results.cache && this.results.cache.health) {
      if (this.results.cache.health === 'good') score += 15;
      else if (this.results.cache.health === 'warning') score += 10;
      else if (this.results.cache.health === 'poor') score += 5;
    }
    
    // Performance (15 points)
    maxScore += 15;
    if (this.results.performance && this.results.performance.health) {
      if (this.results.performance.health === 'good') score += 15;
      else if (this.results.performance.health === 'slow') score += 10;
      else if (this.results.performance.health === 'poor') score += 5;
    }
    
    // Logs (10 points)
    maxScore += 10;
    if (this.results.logs && this.results.logs.health) {
      if (this.results.logs.health === 'good') score += 10;
      else if (this.results.logs.health === 'some_errors') score += 7;
      else if (this.results.logs.health === 'high_errors') score += 3;
    }
    
    const percentage = Math.round(score / maxScore * 100);
    
    // Détermination du statut global
    if (percentage >= 90) {
      this.results.overall = 'excellent';
      console.log('🟢 STATUT GLOBAL: EXCELLENT');
    } else if (percentage >= 75) {
      this.results.overall = 'good';
      console.log('🟡 STATUT GLOBAL: BON');
    } else if (percentage >= 50) {
      this.results.overall = 'warning';
      console.log('🟠 STATUT GLOBAL: ATTENTION REQUISE');
    } else {
      this.results.overall = 'critical';
      console.log('🔴 STATUT GLOBAL: CRITIQUE');
    }
    
    console.log(`📊 Score: ${score}/${maxScore} (${percentage}%)`);
    
    // Recommandations
    console.log('\n💡 RECOMMANDATIONS:');
    
    if (this.results.configuration === 'invalid') {
      console.log('   🔧 Corriger la configuration (voir npm run validate-config)');
    }
    
    if (this.results.sources && this.results.sources.healthy < this.results.sources.total) {
      console.log('   🔧 Réactiver les sources désactivées (npm run poster:reset-sources)');
    }
    
    if (this.results.cache && this.results.cache.health === 'poor') {
      console.log('   🔧 Optimiser le cache (augmenter taille ou TTL)');
    }
    
    if (this.results.performance && this.results.performance.health !== 'good') {
      console.log('   🔧 Optimiser les performances (réduire concurrence, augmenter timeouts)');
    }
    
    if (this.results.logs && this.results.logs.health === 'high_errors') {
      console.log('   🔧 Analyser les erreurs dans les logs (npm run logs:errors)');
    }
    
    // Commandes utiles
    console.log('\n🛠️ COMMANDES UTILES:');
    console.log('   npm run poster:stats          - Statistiques détaillées');
    console.log('   npm run poster:validate       - Valider les sources');
    console.log('   npm run logs:errors           - Voir les erreurs récentes');
    console.log('   npm run poster:clear-cache    - Vider le cache');
    console.log('   npm run poster:reset-sources  - Réactiver les sources');
    
    console.log('\n✅ Diagnostic terminé');
  }
}

/**
 * Point d'entrée principal
 */
async function main() {
  const diagnostic = new SystemDiagnostic();
  await diagnostic.runDiagnostic();
}

// Gestion des signaux d'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Diagnostic interrompu');
  process.exit(0);
});

// Exécution si appelé directement
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = SystemDiagnostic;