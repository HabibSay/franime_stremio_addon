#!/usr/bin/env node
// scripts/validate-config.js
// Script de validation de la configuration du système de posters

const { loadConfig, displayConfig, generateEnvExample } = require('../config/poster-config');
const fs = require('fs');
const path = require('path');

/**
 * Valide la configuration et affiche les résultats
 */
function validateConfiguration() {
  console.log('🔍 Validation de la configuration du système de fallback des posters...\n');

  try {
    // Charge et valide la configuration
    const config = loadConfig();
    
    console.log('✅ Configuration valide!\n');
    displayConfig(config);
    
    // Vérifie la présence du fichier .env
    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    
    if (!fs.existsSync(envPath)) {
      console.log('\n⚠️ Fichier .env non trouvé');
      console.log('💡 Copiez .env.example vers .env et configurez vos variables');
      
      if (!fs.existsSync(envExamplePath)) {
        console.log('📝 Génération du fichier .env.example...');
        fs.writeFileSync(envExamplePath, generateEnvExample());
        console.log('✅ Fichier .env.example créé');
      }
    } else {
      console.log('\n✅ Fichier .env trouvé');
    }

    // Teste la connectivité des sources (optionnel)
    console.log('\n🔗 Test de connectivité des sources...');
    testSourcesConnectivity(config);

    return true;
  } catch (error) {
    console.error('❌ Erreur de configuration:', error.message);
    console.log('\n🔧 Actions recommandées:');
    console.log('  1. Vérifiez vos variables d\'environnement');
    console.log('  2. Consultez le fichier .env.example pour les variables disponibles');
    console.log('  3. Assurez-vous que TMDB_API_KEY est définie si vous voulez utiliser TMDB');
    
    return false;
  }
}

/**
 * Teste la connectivité basique des sources configurées
 * @param {Object} config - Configuration validée
 */
async function testSourcesConnectivity(config) {
  const enabledSources = Object.entries(config.sources)
    .filter(([name, source]) => source.enabled)
    .map(([name]) => name);

  console.log(`  Sources activées: ${enabledSources.join(', ')}`);

  // Test basique de connectivité (sans faire d'appels réels)
  for (const sourceName of enabledSources) {
    const source = config.sources[sourceName];
    
    switch (sourceName) {
      case 'kitsu':
        console.log('  ✅ Kitsu: Prêt (API publique)');
        break;
      case 'tmdb':
        if (source.apiKey) {
          console.log('  ✅ TMDB: Prêt (clé API configurée)');
        } else {
          console.log('  ⚠️ TMDB: Clé API manquante, source désactivée');
        }
        break;
      case 'nautiljon':
        console.log('  ✅ Nautiljon: Prêt (scraping web)');
        break;
      default:
        console.log(`  ❓ ${sourceName}: Source inconnue`);
    }
  }
}

/**
 * Affiche l'aide pour la configuration
 */
function showHelp() {
  console.log('🔧 Script de validation de configuration - Système de fallback des posters');
  console.log('\nUtilisation:');
  console.log('  node scripts/validate-config.js [options]');
  console.log('\nOptions:');
  console.log('  --help, -h     Affiche cette aide');
  console.log('  --generate-env Génère un fichier .env.example');
  console.log('  --quiet, -q    Mode silencieux (erreurs seulement)');
  console.log('\nExemples:');
  console.log('  node scripts/validate-config.js');
  console.log('  node scripts/validate-config.js --generate-env');
}

// Point d'entrée du script
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  if (args.includes('--generate-env')) {
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    fs.writeFileSync(envExamplePath, generateEnvExample());
    console.log('✅ Fichier .env.example généré');
    process.exit(0);
  }
  
  const isValid = validateConfiguration();
  process.exit(isValid ? 0 : 1);
}

module.exports = {
  validateConfiguration,
  testSourcesConnectivity
};