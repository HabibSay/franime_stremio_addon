#!/usr/bin/env node
// scripts/analyze-logs.js
// Script d'analyse avancée des logs du système de posters

const fs = require('fs').promises;
const path = require('path');

/**
 * Classe pour l'analyse des logs
 */
class LogAnalyzer {
  constructor(logFilePath = './logs/poster-system.log') {
    this.logFilePath = logFilePath;
    this.logs = [];
    this.stats = {
      total: 0,
      byLevel: { error: 0, warn: 0, info: 0, debug: 0 },
      byCategory: {},
      timeRange: { start: null, end: null },
      sources: {},
      errors: [],
      performance: []
    };
  }

  /**
   * Lance l'analyse complète des logs
   */
  async analyze() {
    console.log('📊 Analyse des logs du système de posters');
    console.log('=========================================');
    
    try {
      await this.loadLogs();
      this.parseStats();
      this.analyzeErrors();
      this.analyzePerformance();
      this.analyzeSources();
      this.generateReport();
    } catch (error) {
      console.error('❌ Erreur lors de l\'analyse:', error.message);
    }
  }

  /**
   * Charge les logs depuis le fichier
   */
  async loadLogs() {
    console.log(`📂 Chargement des logs depuis ${this.logFilePath}...`);
    
    try {
      const logContent = await fs.readFile(this.logFilePath, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      this.logs = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          // Ligne de log non-JSON (anciens logs)
          return this.parseOldLogFormat(line);
        }
      }).filter(log => log !== null);
      
      console.log(`✅ ${this.logs.length} entrées de log chargées`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️ Aucun fichier de log trouvé');
        console.log('💡 Activez LOG_TO_FILE=true pour générer des logs');
        return;
      }
      throw error;
    }
  }

  /**
   * Parse les anciens formats de logs
   */
  parseOldLogFormat(line) {
    // Format: timestamp emoji message
    const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+([^\s]+)\s+(.+)$/);
    if (!match) return null;
    
    const [, time, emoji, message] = match;
    const today = new Date().toISOString().split('T')[0];
    
    return {
      timestamp: `${today}T${time}.000Z`,
      level: this.emojiToLevel(emoji),
      message,
      category: this.messageToCategory(message)
    };
  }

  /**
   * Convertit un emoji en niveau de log
   */
  emojiToLevel(emoji) {
    const mapping = {
      '❌': 'error',
      '⚠️': 'warn',
      'ℹ️': 'info',
      '🔍': 'debug',
      '✅': 'info',
      '📊': 'info',
      '💾': 'debug',
      '🔄': 'info'
    };
    return mapping[emoji] || 'info';
  }

  /**
   * Détermine la catégorie depuis le message
   */
  messageToCategory(message) {
    if (message.includes('Cache')) return 'CACHE';
    if (message.includes('Fallback')) return 'FALLBACK';
    if (message.includes('Circuit breaker')) return 'CIRCUIT_BREAKER';
    if (message.includes('Rate limit')) return 'RATE_LIMIT';
    if (message.includes('Métriques')) return 'PERFORMANCE';
    if (message.includes('Maintenance')) return 'MAINTENANCE';
    return 'GENERAL';
  }

  /**
   * Parse les statistiques générales
   */
  parseStats() {
    console.log('\n📈 Analyse des statistiques générales...');
    
    this.stats.total = this.logs.length;
    
    // Statistiques par niveau
    this.logs.forEach(log => {
      const level = log.level?.toLowerCase() || 'unknown';
      this.stats.byLevel[level] = (this.stats.byLevel[level] || 0) + 1;
    });
    
    // Statistiques par catégorie
    this.logs.forEach(log => {
      const category = log.category || 'UNKNOWN';
      this.stats.byCategory[category] = (this.stats.byCategory[category] || 0) + 1;
    });
    
    // Plage temporelle
    const timestamps = this.logs
      .map(log => new Date(log.timestamp))
      .filter(date => !isNaN(date.getTime()))
      .sort((a, b) => a - b);
    
    if (timestamps.length > 0) {
      this.stats.timeRange.start = timestamps[0];
      this.stats.timeRange.end = timestamps[timestamps.length - 1];
    }
  }

  /**
   * Analyse les erreurs
   */
  analyzeErrors() {
    console.log('🔍 Analyse des erreurs...');
    
    const errorLogs = this.logs.filter(log => log.level === 'error');
    
    // Groupement des erreurs par type
    const errorGroups = {};
    errorLogs.forEach(log => {
      const errorType = this.extractErrorType(log.message);
      if (!errorGroups[errorType]) {
        errorGroups[errorType] = [];
      }
      errorGroups[errorType].push(log);
    });
    
    // Top 10 des erreurs les plus fréquentes
    this.stats.errors = Object.entries(errorGroups)
      .map(([type, logs]) => ({
        type,
        count: logs.length,
        lastOccurrence: logs[logs.length - 1].timestamp,
        examples: logs.slice(0, 3).map(l => l.message)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Extrait le type d'erreur depuis le message
   */
  extractErrorType(message) {
    // Patterns d'erreurs communes
    if (message.includes('timeout')) return 'Network Timeout';
    if (message.includes('API key') || message.includes('authentication')) return 'Authentication Error';
    if (message.includes('not found') || message.includes('404')) return 'Not Found';
    if (message.includes('rate limit')) return 'Rate Limit Exceeded';
    if (message.includes('JSON')) return 'JSON Parse Error';
    if (message.includes('connection')) return 'Connection Error';
    if (message.includes('cache')) return 'Cache Error';
    
    // Extraction du nom de source si présent
    const sourceMatch = message.match(/(TMDB|Kitsu|Nautiljon)/i);
    if (sourceMatch) {
      return `${sourceMatch[1]} Error`;
    }
    
    return 'Unknown Error';
  }

  /**
   * Analyse les performances
   */
  analyzePerformance() {
    console.log('⚡ Analyse des performances...');
    
    const performanceLogs = this.logs.filter(log => 
      log.message?.includes('Métriques') || 
      log.message?.includes('temps moyen') ||
      log.category === 'PERFORMANCE'
    );
    
    // Extraction des métriques par source
    const sourceMetrics = {};
    performanceLogs.forEach(log => {
      const sourceMatch = log.message?.match(/(TMDB|Kitsu|Nautiljon)/i);
      const timeMatch = log.message?.match(/(\d+(?:\.\d+)?)ms/);
      const successMatch = log.message?.match(/(\d+(?:\.\d+)?)%\s+succès/);
      
      if (sourceMatch) {
        const source = sourceMatch[1].toLowerCase();
        if (!sourceMetrics[source]) {
          sourceMetrics[source] = { responseTimes: [], successRates: [] };
        }
        
        if (timeMatch) {
          sourceMetrics[source].responseTimes.push(parseFloat(timeMatch[1]));
        }
        
        if (successMatch) {
          sourceMetrics[source].successRates.push(parseFloat(successMatch[1]));
        }
      }
    });
    
    // Calcul des moyennes
    this.stats.performance = Object.entries(sourceMetrics).map(([source, metrics]) => {
      const avgResponseTime = metrics.responseTimes.length > 0
        ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length
        : 0;
      
      const avgSuccessRate = metrics.successRates.length > 0
        ? metrics.successRates.reduce((a, b) => a + b, 0) / metrics.successRates.length
        : 0;
      
      return {
        source,
        avgResponseTime: Math.round(avgResponseTime),
        avgSuccessRate: Math.round(avgSuccessRate * 10) / 10,
        dataPoints: metrics.responseTimes.length
      };
    }).sort((a, b) => a.avgResponseTime - b.avgResponseTime);
  }

  /**
   * Analyse par source
   */
  analyzeSources() {
    console.log('🔗 Analyse par source...');
    
    const sources = ['TMDB', 'Kitsu', 'Nautiljon'];
    
    sources.forEach(source => {
      const sourceLogs = this.logs.filter(log => 
        log.message?.includes(source) || 
        log.context?.sourceName === source.toLowerCase()
      );
      
      const errors = sourceLogs.filter(log => log.level === 'error').length;
      const warnings = sourceLogs.filter(log => log.level === 'warn').length;
      const successes = sourceLogs.filter(log => 
        log.message?.includes('Poster trouvé via ' + source.toLowerCase()) ||
        log.message?.includes('✅') && log.message?.includes(source)
      ).length;
      
      this.stats.sources[source.toLowerCase()] = {
        totalLogs: sourceLogs.length,
        errors,
        warnings,
        successes,
        errorRate: sourceLogs.length > 0 ? Math.round(errors / sourceLogs.length * 100) : 0
      };
    });
  }

  /**
   * Génère le rapport d'analyse
   */
  generateReport() {
    console.log('\n📋 RAPPORT D\'ANALYSE DES LOGS');
    console.log('==============================');
    
    // Informations générales
    console.log(`📊 Total des entrées: ${this.stats.total}`);
    
    if (this.stats.timeRange.start && this.stats.timeRange.end) {
      const duration = this.stats.timeRange.end - this.stats.timeRange.start;
      const hours = Math.round(duration / (1000 * 60 * 60));
      console.log(`⏰ Période analysée: ${hours}h (${this.stats.timeRange.start.toLocaleString()} - ${this.stats.timeRange.end.toLocaleString()})`);
    }
    
    // Répartition par niveau
    console.log('\n📈 Répartition par niveau:');
    Object.entries(this.stats.byLevel).forEach(([level, count]) => {
      if (count > 0) {
        const percentage = (count / this.stats.total * 100).toFixed(1);
        const emoji = { error: '❌', warn: '⚠️', info: 'ℹ️', debug: '🔍' }[level] || '📝';
        console.log(`   ${emoji} ${level.toUpperCase()}: ${count} (${percentage}%)`);
      }
    });
    
    // Répartition par catégorie
    console.log('\n🏷️ Répartition par catégorie:');
    Object.entries(this.stats.byCategory)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .forEach(([category, count]) => {
        const percentage = (count / this.stats.total * 100).toFixed(1);
        console.log(`   📂 ${category}: ${count} (${percentage}%)`);
      });
    
    // Top des erreurs
    if (this.stats.errors.length > 0) {
      console.log('\n❌ Top des erreurs:');
      this.stats.errors.slice(0, 5).forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.type}: ${error.count} occurrences`);
        console.log(`      Dernière: ${new Date(error.lastOccurrence).toLocaleString()}`);
        if (error.examples.length > 0) {
          console.log(`      Exemple: ${error.examples[0].substring(0, 80)}...`);
        }
      });
    }
    
    // Performances par source
    if (this.stats.performance.length > 0) {
      console.log('\n⚡ Performances par source:');
      this.stats.performance.forEach(perf => {
        const status = perf.avgResponseTime < 2000 ? '🟢' : perf.avgResponseTime < 5000 ? '🟡' : '🔴';
        console.log(`   ${status} ${perf.source.toUpperCase()}: ${perf.avgResponseTime}ms (${perf.avgSuccessRate}% succès)`);
        console.log(`      Basé sur ${perf.dataPoints} mesures`);
      });
    }
    
    // Analyse par source
    console.log('\n🔗 Analyse par source:');
    Object.entries(this.stats.sources).forEach(([source, stats]) => {
      if (stats.totalLogs > 0) {
        const health = stats.errorRate < 5 ? '🟢' : stats.errorRate < 15 ? '🟡' : '🔴';
        console.log(`   ${health} ${source.toUpperCase()}:`);
        console.log(`      Logs: ${stats.totalLogs}, Erreurs: ${stats.errors} (${stats.errorRate}%)`);
        console.log(`      Succès: ${stats.successes}, Warnings: ${stats.warnings}`);
      }
    });
    
    // Recommandations
    console.log('\n💡 RECOMMANDATIONS:');
    
    const errorRate = this.stats.byLevel.error / this.stats.total * 100;
    if (errorRate > 10) {
      console.log('   🔧 Taux d\'erreur élevé - investiguer les causes principales');
    }
    
    const worstSource = Object.entries(this.stats.sources)
      .filter(([, stats]) => stats.totalLogs > 10)
      .sort(([, a], [, b]) => b.errorRate - a.errorRate)[0];
    
    if (worstSource && worstSource[1].errorRate > 20) {
      console.log(`   🔧 Source ${worstSource[0].toUpperCase()} problématique (${worstSource[1].errorRate}% erreurs)`);
    }
    
    const slowestSource = this.stats.performance
      .filter(p => p.dataPoints > 5)
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)[0];
    
    if (slowestSource && slowestSource.avgResponseTime > 3000) {
      console.log(`   🔧 Source ${slowestSource.source.toUpperCase()} lente (${slowestSource.avgResponseTime}ms)`);
    }
    
    // Commandes utiles
    console.log('\n🛠️ COMMANDES UTILES:');
    console.log('   npm run logs:errors           - Voir les erreurs récentes');
    console.log('   npm run logs:performance      - Voir les métriques de performance');
    console.log('   npm run poster:validate       - Tester les sources');
    console.log('   npm run poster:stats          - Statistiques en temps réel');
    
    console.log('\n✅ Analyse terminée');
  }

  /**
   * Génère un rapport au format JSON
   */
  async exportReport(outputPath = './logs/analysis-report.json') {
    const report = {
      timestamp: new Date().toISOString(),
      logFile: this.logFilePath,
      stats: this.stats,
      summary: {
        totalLogs: this.stats.total,
        errorRate: this.stats.total > 0 ? (this.stats.byLevel.error / this.stats.total * 100).toFixed(2) : 0,
        timeSpan: this.stats.timeRange.start && this.stats.timeRange.end 
          ? Math.round((this.stats.timeRange.end - this.stats.timeRange.start) / (1000 * 60 * 60))
          : 0
      }
    };
    
    try {
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
      console.log(`📄 Rapport exporté vers ${outputPath}`);
    } catch (error) {
      console.error(`❌ Erreur lors de l'export: ${error.message}`);
    }
  }
}

/**
 * Point d'entrée principal
 */
async function main() {
  const args = process.argv.slice(2);
  const logPath = args[0] || './logs/poster-system.log';
  
  const analyzer = new LogAnalyzer(logPath);
  await analyzer.analyze();
  
  // Export optionnel
  if (args.includes('--export')) {
    await analyzer.exportReport();
  }
}

// Exécution si appelé directement
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = LogAnalyzer;