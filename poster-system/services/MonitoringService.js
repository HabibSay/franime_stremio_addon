// poster-system/services/MonitoringService.js
// Service de monitoring pour les endpoints de statistiques et maintenance

const express = require('express');

/**
 * Service de monitoring pour le système de fallback des posters
 * Fournit des endpoints HTTP pour les statistiques et la maintenance
 */
class MonitoringService {
  /**
   * @param {PosterManager} posterManager - Instance du gestionnaire de posters
   */
  constructor(posterManager) {
    this.posterManager = posterManager;
    this.router = express.Router();
    this.setupRoutes();
  }

  /**
   * Configure les routes de monitoring
   * @private
   */
  setupRoutes() {
    // Endpoint pour les statistiques globales
    this.router.get('/stats', (req, res) => {
      try {
        const stats = this.posterManager.getStats();
        const enrichedStats = {
          ...stats,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage()
        };
        
        res.json({
          success: true,
          data: enrichedStats
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour les statistiques des sources
    this.router.get('/stats/sources', (req, res) => {
      try {
        const stats = this.posterManager.getStats();
        res.json({
          success: true,
          data: {
            sources: stats.sources,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour l'état du cache
    this.router.get('/stats/cache', (req, res) => {
      try {
        const stats = this.posterManager.getStats();
        res.json({
          success: true,
          data: {
            cache: stats.cache,
            config: {
              maxSize: stats.config.cacheSize,
              ttl: stats.config.cacheTTL
            },
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour les métriques de performance globales
    this.router.get('/stats/performance', (req, res) => {
      try {
        const stats = this.posterManager.getStats();
        const performanceMetrics = {
          global: stats.global,
          sources: Object.keys(stats.sources).reduce((acc, sourceName) => {
            const source = stats.sources[sourceName];
            acc[sourceName] = {
              averageResponseTime: source.averageResponseTime,
              successRate: source.totalRequests > 0 
                ? (source.successfulRequests / source.totalRequests * 100).toFixed(2) + '%'
                : '0%',
              totalRequests: source.totalRequests,
              enabled: source.enabled,
              isTemporarilyDisabled: source.isTemporarilyDisabled
            };
            return acc;
          }, {}),
          cache: {
            hitRate: stats.cache.hits + stats.cache.misses > 0
              ? (stats.cache.hits / (stats.cache.hits + stats.cache.misses) * 100).toFixed(2) + '%'
              : '0%',
            size: stats.cache.size,
            maxSize: stats.config.cacheSize
          },
          timestamp: new Date().toISOString()
        };

        res.json({
          success: true,
          data: performanceMetrics
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour le health check des sources
    this.router.get('/health', async (req, res) => {
      try {
        const healthResults = await this.posterManager.healthCheck();
        const overallHealth = Object.values(healthResults).every(result => result.healthy);
        
        res.status(overallHealth ? 200 : 503).json({
          success: true,
          healthy: overallHealth,
          data: {
            sources: healthResults,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour vider le cache (commande de maintenance)
    this.router.post('/maintenance/clear-cache', async (req, res) => {
      try {
        await this.posterManager.clearCache();
        res.json({
          success: true,
          message: 'Cache vidé avec succès',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour réactiver les sources désactivées
    this.router.post('/maintenance/reset-sources', async (req, res) => {
      try {
        const stats = this.posterManager.getStats();
        const reactivatedSources = [];

        // Réactive toutes les sources temporairement désactivées
        Object.keys(stats.sources).forEach(sourceName => {
          const source = stats.sources[sourceName];
          if (source.isTemporarilyDisabled) {
            this.posterManager.setSourceEnabled(sourceName, true);
            reactivatedSources.push(sourceName);
          }
        });

        // Remet à zéro les métriques pour un nouveau départ
        this.posterManager.resetMetrics();

        res.json({
          success: true,
          message: `${reactivatedSources.length} source(s) réactivée(s)`,
          reactivatedSources,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour valider la santé des sources
    this.router.post('/maintenance/validate-sources', async (req, res) => {
      try {
        const healthResults = await this.posterManager.healthCheck();
        const validationResults = {};
        
        for (const [sourceName, result] of Object.entries(healthResults)) {
          validationResults[sourceName] = {
            healthy: result.healthy,
            responseTime: result.responseTime,
            error: result.error || null,
            lastCheck: new Date().toISOString()
          };
        }

        const healthySources = Object.values(validationResults).filter(r => r.healthy).length;
        const totalSources = Object.keys(validationResults).length;

        res.json({
          success: true,
          message: `Validation terminée: ${healthySources}/${totalSources} sources saines`,
          data: {
            summary: {
              healthy: healthySources,
              total: totalSources,
              healthRate: totalSources > 0 ? (healthySources / totalSources * 100).toFixed(2) + '%' : '0%'
            },
            sources: validationResults,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour réinitialiser les métriques
    this.router.post('/maintenance/reset-metrics', (req, res) => {
      try {
        this.posterManager.resetMetrics();
        res.json({
          success: true,
          message: 'Métriques remises à zéro',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint pour obtenir des informations détaillées sur une source spécifique
    this.router.get('/stats/sources/:sourceName', (req, res) => {
      try {
        const { sourceName } = req.params;
        const stats = this.posterManager.getStats();
        
        if (!stats.sources[sourceName]) {
          return res.status(404).json({
            success: false,
            error: `Source '${sourceName}' non trouvée`
          });
        }

        res.json({
          success: true,
          data: {
            source: sourceName,
            ...stats.sources[sourceName],
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Retourne le router Express configuré
   * @returns {express.Router} Router avec les endpoints de monitoring
   */
  getRouter() {
    return this.router;
  }

  /**
   * Génère un rapport de monitoring complet
   * @returns {Object} Rapport détaillé du système
   */
  generateReport() {
    try {
      const stats = this.posterManager.getStats();
      const report = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version
        },
        poster_system: {
          cache: {
            ...stats.cache,
            hitRate: stats.cache.hits + stats.cache.misses > 0
              ? (stats.cache.hits / (stats.cache.hits + stats.cache.misses) * 100).toFixed(2) + '%'
              : '0%'
          },
          sources: Object.keys(stats.sources).map(name => ({
            name,
            ...stats.sources[name],
            successRate: stats.sources[name].totalRequests > 0
              ? (stats.sources[name].successfulRequests / stats.sources[name].totalRequests * 100).toFixed(2) + '%'
              : '0%'
          })),
          global: stats.global,
          config: stats.config
        }
      };

      return report;
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = MonitoringService;