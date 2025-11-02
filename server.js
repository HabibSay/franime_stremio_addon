#!/usr/bin/env node

// Charger les variables d'environnement depuis le fichier .env
require('dotenv').config();

const { serveHTTP, publishToCentral } = require("stremio-addon-sdk");
const { validateConfiguration } = require("./scripts/validate-config");
const express = require("express");
const { exec } = require('child_process');

// Validation de la configuration au démarrage
console.log('🚀 Démarrage du serveur FRAnime...');
try {
  validateConfiguration();
  console.log('✅ Configuration validée, démarrage du serveur...\n');
} catch (error) {
  console.error('❌ Erreur de configuration au démarrage:', error.message);
  console.error('🔧 Corrigez la configuration avant de redémarrer le serveur');
  process.exit(1);
}

const addonInterface = require("./addon");
const port = process.env.PORT || 65094;
const monitoringPort = port + 1; // Port séparé pour le monitoring

// Démarrage du serveur principal Stremio avec serveHTTP
console.log(`🌐 Démarrage du serveur Stremio sur le port ${port}...`);

// Démarrage du serveur de monitoring séparé
const monitoringApp = express();
monitoringApp.use(express.json());

// Intégration des endpoints de monitoring sur un serveur séparé
try {
  const { PosterManager } = require('./poster-system');
  const MonitoringService = require('./poster-system/services/MonitoringService');
  const { loadConfig } = require('./config/poster-config');
  
  const posterConfig = loadConfig();
  const posterManager = new PosterManager(posterConfig);
  const monitoringService = new MonitoringService(posterManager);
  
  // Ajout des routes de monitoring
  monitoringApp.use('/monitoring', monitoringService.getRouter());
  
  // Route racine pour rediriger vers les stats
  monitoringApp.get('/', (req, res) => {
    res.redirect('/monitoring/stats');
  });
  
  // Démarrage du serveur de monitoring
  monitoringApp.listen(monitoringPort, () => {
    console.log(`📊 Serveur de monitoring démarré sur le port ${monitoringPort}`);
    console.log(`📈 Monitoring disponible sur: http://localhost:${monitoringPort}/monitoring/stats`);
  });
  
} catch (error) {
  console.warn('⚠️ Impossible d\'initialiser le monitoring:', error.message);
}

// Attendre que le serveur soit prêt puis ouvrir Stremio
setTimeout(() => {
  console.log(`\n📋 ===== INFORMATIONS DU SERVEUR =====`);
  console.log(`🎯 Addon Stremio: http://127.0.0.1:${port}/manifest.json`);
  console.log(`📊 Monitoring: http://localhost:${monitoringPort}/monitoring/stats`);
  console.log(`📈 Health Check: http://localhost:${monitoringPort}/monitoring/health`);
  console.log(`=====================================\n`);
  
  serveHTTP(addonInterface)
}, 2000);

// when you've deployed your addon, un-comment this line
// publishToCentral("https://my-addon.awesome/manifest.json")
// for more information on deploying, see: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/deploying/README.md
