# Documentation - Système de Fallback des Posters FRAnime

Bienvenue dans la documentation complète du système de fallback des posters pour l'addon FRAnime. Cette documentation couvre tous les aspects du système, de l'installation au débogage avancé.

## 📚 Table des Matières

### Guides Principaux
- **[Guide d'Utilisation](USAGE_GUIDE.md)** - Installation, configuration et utilisation quotidienne
- **[Guide de Configuration](CONFIGURATION_GUIDE.md)** - Configuration détaillée de toutes les options
- **[Guide de Dépannage](TROUBLESHOOTING.md)** - Solutions aux problèmes courants
- **[Guide de Logging](LOGGING_GUIDE.md)** - Système de logs et débogage avancé

### Documentation Technique
- **[Documentation du Système](POSTER_SYSTEM.md)** - Architecture et fonctionnement technique
- **[Guide de Monitoring](MONITORING.md)** - Surveillance et maintenance du système

## 🚀 Démarrage Rapide

### Installation Express (5 minutes)

1. **Prérequis**
   ```bash
   # Node.js 16+ requis
   node --version
   ```

2. **Configuration minimale**
   ```bash
   # Créer le fichier de configuration
   echo "TMDB_API_KEY=votre_cle_api_tmdb" > .env
   ```

3. **Validation et démarrage**
   ```bash
   npm run validate-config
   npm start
   ```

4. **Vérification**
   ```bash
   # Le serveur doit être accessible
   curl http://localhost:65094/manifest.json
   ```

### Obtenir une Clé API TMDB (Gratuit)

1. Créer un compte sur [themoviedb.org](https://www.themoviedb.org/)
2. Aller dans Paramètres → API
3. Demander une clé API (gratuite)
4. Ajouter la clé dans votre fichier `.env`

## 📖 Guides par Cas d'Usage

### 👤 Utilisateur Final
**Objectif** : Utiliser l'addon dans Stremio

1. **[Guide d'Utilisation](USAGE_GUIDE.md)** - Installation et utilisation de base
2. **[Guide de Configuration](CONFIGURATION_GUIDE.md)** - Configuration minimale
3. **[Guide de Dépannage](TROUBLESHOOTING.md)** - Résoudre les problèmes courants

### 🔧 Administrateur Système
**Objectif** : Déployer et maintenir le système

1. **[Guide de Configuration](CONFIGURATION_GUIDE.md)** - Configuration complète
2. **[Guide de Monitoring](MONITORING.md)** - Surveillance et maintenance
3. **[Guide de Logging](LOGGING_GUIDE.md)** - Analyse des logs
4. **[Guide de Dépannage](TROUBLESHOOTING.md)** - Diagnostic avancé

### 👨‍💻 Développeur
**Objectif** : Comprendre et modifier le système

1. **[Documentation du Système](POSTER_SYSTEM.md)** - Architecture technique
2. **[Guide de Logging](LOGGING_GUIDE.md)** - Système de logs
3. **[Guide de Monitoring](MONITORING.md)** - APIs et endpoints

## 🛠️ Commandes Utiles

### Diagnostic et Maintenance
```bash
# Diagnostic complet automatisé
npm run poster:diagnose

# Statistiques détaillées
npm run poster:stats

# Validation des sources
npm run poster:validate

# Analyse des logs
npm run logs:analyze
```

### Configuration
```bash
# Valider la configuration
npm run validate-config

# Générer un fichier .env d'exemple
npm run generate-env

# Voir la documentation
npm run docs:usage
npm run docs:config
```

### Logs et Débogage
```bash
# Suivre les logs en temps réel
npm run logs:tail

# Voir les erreurs récentes
npm run logs:errors

# Voir les métriques de performance
npm run logs:performance
```

### Maintenance
```bash
# Vider le cache
npm run poster:clear-cache

# Réactiver les sources désactivées
npm run poster:reset-sources

# Remettre à zéro les métriques
npm run poster:reset-metrics
```

## 🔍 Diagnostic Rapide

### Vérification de Santé (30 secondes)
```bash
# Test complet en une commande
npm run validate-config && npm run poster:validate && npm run poster:stats
```

### Indicateurs de Santé
- ✅ **Système sain** : Configuration OK, sources actives, cache efficace
- ⚠️ **Attention** : 1-2 sources désactivées, performances correctes
- 🚨 **Problème** : Configuration invalide, toutes sources désactivées

### Résolution Express des Problèmes
```bash
# Problème de configuration
npm run validate-config

# Sources désactivées
npm run poster:reset-sources

# Cache inefficace
npm run poster:clear-cache

# Performance lente
# Voir TROUBLESHOOTING.md section "Performance"
```

## 📊 Architecture du Système

### Vue d'Ensemble
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Stremio       │───▶│  PosterManager   │───▶│  FallbackChain  │
│   (Client)      │    │  (Orchestrateur) │    │  (Sources)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   CacheService   │    │     Sources     │
                       │   (Cache TTL)    │    │ Kitsu│TMDB│Naut │
                       └──────────────────┘    └─────────────────┘
```

### Flux de Récupération
1. **Requête** → Vérification cache
2. **Cache Miss** → Chaîne de fallback
3. **Kitsu** → TMDB → Nautiljon
4. **Succès** → Mise en cache
5. **Échec** → Image placeholder

## 🔧 Configuration par Environnement

### Développement
```bash
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_TO_FILE=true
CIRCUIT_BREAKER_THRESHOLD=3
```

### Production
```bash
LOG_LEVEL=warn
POSTER_CACHE_PERSIST=true
POSTER_CACHE_SIZE=5000
CIRCUIT_BREAKER_THRESHOLD=15
```

### Test
```bash
LOG_LEVEL=error
POSTER_CACHE_SIZE=100
CIRCUIT_BREAKER_ENABLED=false
```

## 📈 Métriques et Monitoring

### Endpoints de Monitoring
- `GET /monitoring/stats` - Statistiques globales
- `GET /monitoring/health` - Santé des sources
- `GET /monitoring/stats/cache` - État du cache
- `GET /monitoring/stats/performance` - Métriques de performance

### Métriques Clés
- **Taux de succès** : % de posters récupérés avec succès
- **Temps de réponse** : Temps moyen par source
- **Efficacité du cache** : Ratio hits/misses
- **Disponibilité des sources** : Sources actives vs désactivées

## 🚨 Alertes Recommandées

### Critiques
- Taux d'erreur > 50%
- Toutes les sources désactivées
- Configuration invalide

### Avertissements
- Taux d'erreur > 20%
- Cache plein (> 90%)
- Temps de réponse > 5s

### Informatives
- Source temporairement désactivée
- Cache hit rate < 50%
- Nouvelle version disponible

## 📞 Support et Ressources

### Auto-Diagnostic
```bash
# Diagnostic automatisé complet
npm run poster:diagnose

# Analyse des logs
npm run logs:analyze --export

# Test de performance
npm run poster:validate
```

### Informations pour le Support
Avant de demander de l'aide, collectez :
1. Sortie de `npm run poster:diagnose`
2. Configuration (sans clés API)
3. Logs récents (`npm run logs:errors`)
4. Version Node.js et OS

### Ressources Externes
- [TMDB API Documentation](https://developers.themoviedb.org/3)
- [Kitsu API Documentation](https://kitsu.docs.apiary.io/)
- [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)

## 🔄 Mises à Jour et Maintenance

### Maintenance Préventive (Hebdomadaire)
```bash
# Nettoyage du cache
npm run poster:clear-cache

# Réactivation des sources
npm run poster:reset-sources

# Remise à zéro des métriques
npm run poster:reset-metrics

# Analyse des logs
npm run logs:analyze
```

### Surveillance Continue
- Monitoring des endpoints HTTP
- Alertes sur taux d'erreur
- Surveillance de l'utilisation mémoire
- Rotation des logs

## 📝 Changelog et Versions

### Version Actuelle
- Système de fallback multi-sources
- Cache intelligent avec TTL
- Circuit breakers automatiques
- Logging avancé avec catégories
- Monitoring HTTP intégré
- Scripts de maintenance CLI

### Fonctionnalités Prévues
- Support de nouvelles sources
- Cache distribué
- Interface web de monitoring
- Métriques Prometheus
- Auto-scaling des requêtes

---

## 🎯 Navigation Rapide

| Besoin | Document | Temps |
|--------|----------|-------|
| **Installer rapidement** | [Guide d'Utilisation](USAGE_GUIDE.md) | 5 min |
| **Configurer en détail** | [Guide de Configuration](CONFIGURATION_GUIDE.md) | 15 min |
| **Résoudre un problème** | [Guide de Dépannage](TROUBLESHOOTING.md) | Variable |
| **Comprendre les logs** | [Guide de Logging](LOGGING_GUIDE.md) | 10 min |
| **Architecture technique** | [Documentation du Système](POSTER_SYSTEM.md) | 20 min |
| **Monitoring avancé** | [Guide de Monitoring](MONITORING.md) | 15 min |

---

**💡 Conseil** : Commencez par le [Guide d'Utilisation](USAGE_GUIDE.md) pour une installation rapide, puis consultez les autres guides selon vos besoins spécifiques.

**🔧 Maintenance** : Utilisez `npm run poster:diagnose` régulièrement pour surveiller la santé du système.

**📊 Performance** : Activez `LOG_PERFORMANCE_METRICS=true` pour surveiller les performances en continu.