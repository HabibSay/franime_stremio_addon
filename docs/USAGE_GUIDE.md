# Guide d'Utilisation - Système de Fallback des Posters

Ce guide explique comment utiliser efficacement le système de fallback des posters de FRAnime, depuis l'installation jusqu'à l'utilisation avancée.

## Table des Matières

1. [Installation et Configuration](#installation-et-configuration)
2. [Utilisation de Base](#utilisation-de-base)
3. [Monitoring et Maintenance](#monitoring-et-maintenance)
4. [Débogage et Logs](#débogage-et-logs)
5. [Commandes CLI](#commandes-cli)
6. [Intégration avec Stremio](#intégration-avec-stremio)
7. [Dépannage Avancé](#dépannage-avancé)
8. [Exemples Pratiques](#exemples-pratiques)

## Installation et Configuration

### Prérequis

- Node.js 16+ installé
- Accès internet pour les APIs externes
- (Optionnel) Clé API TMDB pour une meilleure couverture

### Installation Rapide

1. **Cloner le projet et installer les dépendances**
```bash
git clone <repository-url>
cd fr-anime
npm install
```

2. **Configuration minimale**
```bash
# Créer le fichier .env avec la configuration minimale
echo "TMDB_API_KEY=votre_cle_api_tmdb" > .env
```

3. **Valider la configuration**
```bash
npm run validate-config
```

4. **Démarrer le serveur**
```bash
npm start
```

### Configuration Avancée

Pour une configuration complète, copiez le fichier d'exemple :

```bash
cp .env.example .env
```

Puis éditez le fichier `.env` selon vos besoins. Consultez le [Guide de Configuration](CONFIGURATION_GUIDE.md) pour tous les détails.

## Utilisation de Base

### Démarrage du Système

Le système de fallback des posters s'initialise automatiquement au démarrage du serveur :

```bash
npm start
```

Vous devriez voir ces messages de confirmation :
```
🚀 Démarrage du serveur FRAnime...
✅ Configuration validée, démarrage du serveur...
✅ Système de fallback des posters initialisé avec succès
📊 Endpoints de monitoring activés sur /monitoring
🌐 Serveur FRAnime démarré sur le port 65094
```

### Fonctionnement Automatique

Une fois démarré, le système fonctionne de manière transparente :

1. **Récupération automatique** : Les posters sont récupérés automatiquement lors de l'affichage du catalogue
2. **Cache intelligent** : Les posters récupérés sont mis en cache pour 24h par défaut
3. **Fallback automatique** : Si une source échoue, le système tente automatiquement la suivante
4. **Gestion des erreurs** : Les erreurs sont gérées gracieusement avec des placeholders

### Ordre de Fallback

Le système tente les sources dans cet ordre :

1. **Cache local** (instantané)
2. **Kitsu API** (source principale, 3s timeout)
3. **TMDB API** (premier fallback, 3s timeout)
4. **Nautiljon scraping** (dernier fallback, 5s timeout)
5. **Image placeholder** (si tout échoue)

## Monitoring et Maintenance

### Endpoints de Monitoring

Le serveur expose plusieurs endpoints pour surveiller le système :

```bash
# Statistiques globales
curl http://localhost:65094/monitoring/stats

# Santé des sources
curl http://localhost:65094/monitoring/health

# Statistiques du cache
curl http://localhost:65094/monitoring/stats/cache

# Métriques de performance
curl http://localhost:65094/monitoring/stats/performance
```

### Commandes de Maintenance

Utilisez les commandes npm pour la maintenance :

```bash
# Afficher les statistiques
npm run poster:stats

# Vider le cache
npm run poster:clear-cache

# Réactiver les sources désactivées
npm run poster:reset-sources

# Valider la santé des sources
npm run poster:validate

# Remettre à zéro les métriques
npm run poster:reset-metrics
```

## Débogage et Logs

### Configuration des Logs

Le système utilise un système de logging avancé avec plusieurs niveaux :

```bash
# Dans votre fichier .env
LOG_LEVEL=info                    # error, warn, info, debug
DEBUG_POSTER_SYSTEM=false        # true pour logs détaillés
LOG_PERFORMANCE_METRICS=true     # logs des métriques
LOG_TO_FILE=false                # sauvegarde dans un fichier
```

### Types de Logs

#### 1. Logs d'Initialisation
```
🚀 PosterManager créé
✅ PosterManager initialisé avec succès
💾 Cache chargé depuis le disque: 245 entrées valides
📊 Endpoints de monitoring activés sur /monitoring
```

#### 2. Logs de Récupération de Posters
```
🔍 Recherche poster pour "Attack on Titan" (ID: 16498)
💾 Cache HIT pour "16498:Attack on Titan" (source: tmdb)
🔄 Fallback Kitsu → TMDB pour "One Piece" (Kitsu: timeout)
✅ Poster trouvé via TMDB: https://image.tmdb.org/t/p/w500/poster.jpg
```

#### 3. Logs d'Erreurs et Circuit Breaker
```
❌ Erreur TMDB pour "Naruto": Clé API invalide ou expirée
🔴 Circuit breaker ouvert pour tmdb - 10 échecs consécutifs
🟡 Circuit breaker tmdb passe en HALF_OPEN pour test
🟢 Circuit breaker tmdb fermé - service rétabli
```

#### 4. Logs de Performance et Rate Limiting
```
⏳ Rate limit TMDB: attente de 2500ms (40/40 requêtes)
📊 Métriques TMDB: 95% succès, 1.2s temps moyen
🗑️ Cache des posters vidé (maintenance)
```

### Mode Debug

Pour activer le mode debug complet :

```bash
# Dans .env
DEBUG_POSTER_SYSTEM=true
LOG_LEVEL=debug
LOG_TO_FILE=true
```

En mode debug, vous verrez :
- Détails des requêtes HTTP (URLs, headers, temps de réponse)
- État interne du cache (hits/misses, évictions)
- Métriques en temps réel par source
- Détails des algorithmes de fallback

### Analyse des Logs

#### Identifier les Problèmes de Performance
```bash
# Rechercher les timeouts
grep "timeout" logs/poster-system.log

# Analyser les échecs par source
grep "❌.*TMDB" logs/poster-system.log | wc -l

# Vérifier l'efficacité du cache
grep "Cache HIT\|Cache MISS" logs/poster-system.log
```

#### Surveiller la Santé des Sources
```bash
# État des circuit breakers
grep "Circuit breaker" logs/poster-system.log | tail -10

# Taux de succès par source
grep "📊 Métriques" logs/poster-system.log | tail -5
```

## Commandes CLI

### Commandes Disponibles

```bash
# Aide complète
npm run poster:help

# Statistiques détaillées
npm run poster:stats

# Maintenance du cache
npm run poster:clear-cache

# Gestion des sources
npm run poster:reset-sources
npm run poster:validate

# Métriques
npm run poster:reset-metrics
```

### Utilisation Directe

Vous pouvez aussi utiliser le script directement :

```bash
# Utilisation directe
node scripts/poster-maintenance.js --stats
node scripts/poster-maintenance.js --validate-sources
node scripts/poster-maintenance.js --clear-cache
```

### Exemples d'Utilisation

#### Diagnostic Complet
```bash
# 1. Vérifier la configuration
npm run validate-config

# 2. Vérifier la santé des sources
npm run poster:validate

# 3. Afficher les statistiques
npm run poster:stats
```

#### Maintenance Préventive
```bash
# 1. Vider le cache ancien
npm run poster:clear-cache

# 2. Réactiver les sources désactivées
npm run poster:reset-sources

# 3. Remettre à zéro les métriques
npm run poster:reset-metrics
```

## Intégration avec Stremio

### Installation dans Stremio

1. **Démarrer le serveur**
```bash
npm start
```

2. **Ajouter l'addon dans Stremio**
   - Ouvrir Stremio
   - Aller dans "Addons"
   - Cliquer sur "Community Addons"
   - Entrer l'URL : `http://localhost:65094/manifest.json`
   - Installer l'addon

### Utilisation dans Stremio

Une fois installé, l'addon apparaît dans la section "Anime" de Stremio :

- **Catalogue** : Affiche tous les animes avec leurs posters
- **Recherche** : Recherche par nom d'anime
- **Métadonnées** : Informations détaillées avec poster haute qualité

### Gestion des Posters dans Stremio

- **Chargement progressif** : Les posters se chargent progressivement
- **Placeholders** : Images temporaires pendant le chargement
- **Mise à jour automatique** : Les posters se mettent à jour une fois récupérés
- **Cache persistant** : Les posters restent en cache entre les sessions

## Dépannage Avancé

### Problèmes Courants et Solutions

#### 1. Posters Manquants
**Symptômes** : Placeholders au lieu des posters
**Diagnostic** :
```bash
npm run poster:validate
npm run poster:stats
```
**Solutions** :
- Vérifier la clé API TMDB
- Vérifier la connectivité internet
- Réactiver les sources désactivées

#### 2. Performance Lente
**Symptômes** : Chargement lent des posters
**Diagnostic** :
```bash
# Vérifier les métriques de performance
curl http://localhost:65094/monitoring/stats/performance
```
**Solutions** :
```bash
# Réduire les requêtes simultanées
echo "POSTER_MAX_CONCURRENT=3" >> .env

# Augmenter les timeouts
echo "KITSU_TIMEOUT=5000" >> .env
echo "TMDB_TIMEOUT=5000" >> .env
```

#### 3. Sources Désactivées
**Symptômes** : Circuit breakers ouverts
**Diagnostic** :
```bash
npm run poster:validate
```
**Solutions** :
```bash
# Réactiver les sources
npm run poster:reset-sources

# Ajuster les seuils
echo "CIRCUIT_BREAKER_THRESHOLD=5" >> .env
echo "CIRCUIT_BREAKER_DURATION=300000" >> .env
```

#### 4. Cache Inefficace
**Symptômes** : Taux de cache hit faible
**Diagnostic** :
```bash
curl http://localhost:65094/monitoring/stats/cache
```
**Solutions** :
```bash
# Augmenter la taille du cache
echo "POSTER_CACHE_SIZE=2000" >> .env

# Augmenter la durée de vie
echo "POSTER_CACHE_TTL=604800000" >> .env  # 7 jours

# Activer la persistance
echo "POSTER_CACHE_PERSIST=true" >> .env
```

### Diagnostic Automatisé

Utilisez ce script pour un diagnostic complet :

```bash
#!/bin/bash
echo "🔍 Diagnostic du système de posters FRAnime"
echo "=========================================="

echo "1. Configuration..."
npm run validate-config

echo -e "\n2. Santé des sources..."
npm run poster:validate

echo -e "\n3. Statistiques..."
npm run poster:stats

echo -e "\n4. Monitoring HTTP..."
curl -s http://localhost:65094/monitoring/health | jq '.'

echo -e "\n✅ Diagnostic terminé"
```

## Exemples Pratiques

### Exemple 1 : Configuration Minimale

Pour un déploiement simple avec TMDB uniquement :

```bash
# .env minimal
TMDB_API_KEY=votre_cle_api
KITSU_ENABLED=true
TMDB_ENABLED=true
NAUTILJON_ENABLED=false
LOG_LEVEL=warn
```

### Exemple 2 : Configuration Haute Performance

Pour un déploiement avec cache persistant et monitoring :

```bash
# .env haute performance
TMDB_API_KEY=votre_cle_api
POSTER_CACHE_PERSIST=true
POSTER_CACHE_SIZE=10000
POSTER_CACHE_TTL=604800000  # 7 jours
POSTER_MAX_CONCURRENT=10
LOG_LEVEL=info
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
```

### Exemple 3 : Configuration Debug

Pour le développement et le débogage :

```bash
# .env debug
TMDB_API_KEY=votre_cle_api
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_DURATION=60000  # 1 minute
```

### Exemple 4 : Monitoring Automatisé

Script de monitoring avec alertes :

```bash
#!/bin/bash
# monitoring.sh - Script de monitoring automatisé

STATS=$(curl -s http://localhost:65094/monitoring/stats)
HEALTH=$(curl -s http://localhost:65094/monitoring/health)

# Vérifier le taux d'erreur
ERROR_RATE=$(echo $STATS | jq '.global.errors / .global.totalRequests * 100')
if (( $(echo "$ERROR_RATE > 50" | bc -l) )); then
    echo "🚨 ALERTE: Taux d'erreur élevé ($ERROR_RATE%)"
fi

# Vérifier les sources désactivées
DISABLED_SOURCES=$(echo $HEALTH | jq '[.[] | select(.healthy == false)] | length')
if [ "$DISABLED_SOURCES" -gt 0 ]; then
    echo "🚨 ALERTE: $DISABLED_SOURCES source(s) désactivée(s)"
fi

# Vérifier le cache
CACHE_SIZE=$(echo $STATS | jq '.cache.size')
CACHE_MAX=$(echo $STATS | jq '.config.cacheSize')
CACHE_USAGE=$(echo "scale=1; $CACHE_SIZE / $CACHE_MAX * 100" | bc)
if (( $(echo "$CACHE_USAGE > 90" | bc -l) )); then
    echo "⚠️ Cache presque plein ($CACHE_USAGE%)"
fi

echo "✅ Monitoring terminé"
```

## Support et Ressources

### Documentation Complémentaire

- [Guide de Configuration](CONFIGURATION_GUIDE.md) - Configuration détaillée
- [Documentation Technique](POSTER_SYSTEM.md) - Architecture et API
- [Guide de Monitoring](MONITORING.md) - Surveillance et maintenance

### Commandes de Diagnostic

```bash
# Diagnostic rapide
npm run validate-config && npm run poster:validate

# Diagnostic complet
npm run poster:stats && curl http://localhost:65094/monitoring/health

# Réinitialisation complète
npm run poster:clear-cache && npm run poster:reset-sources && npm run poster:reset-metrics
```

### Logs Utiles

```bash
# Suivre les logs en temps réel (si LOG_TO_FILE=true)
tail -f logs/poster-system.log

# Analyser les erreurs
grep "❌" logs/poster-system.log | tail -20

# Analyser les performances
grep "📊" logs/poster-system.log | tail -10
```

Ce guide couvre l'utilisation complète du système de fallback des posters. Pour des questions spécifiques ou des problèmes non couverts, consultez les logs détaillés et utilisez les commandes de diagnostic.