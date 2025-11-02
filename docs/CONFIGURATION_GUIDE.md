# Guide de Configuration - Système de Fallback des Posters

Ce guide détaille toutes les options de configuration disponibles pour le système de fallback des posters de FRAnime.

## Table des Matières

1. [Configuration Rapide](#configuration-rapide)
2. [Variables d'Environnement](#variables-denvironnement)
3. [Configuration des Sources](#configuration-des-sources)
4. [Configuration du Cache](#configuration-du-cache)
5. [Configuration du Logging](#configuration-du-logging)
6. [Configuration Avancée](#configuration-avancée)
7. [Validation et Tests](#validation-et-tests)
8. [Dépannage](#dépannage)

## Configuration Rapide

### Installation Minimale

Pour une installation rapide avec les paramètres par défaut :

1. **Créer le fichier `.env`** :
```bash
# Configuration minimale - seule TMDB nécessite une clé
TMDB_API_KEY=votre_cle_api_tmdb
```

2. **Valider la configuration** :
```bash
npm run validate-config
```

3. **Démarrer le serveur** :
```bash
npm start
```

### Installation Complète

Pour une installation avec toutes les options :

```bash
# Copier le template de configuration
cp .env.example .env

# Éditer le fichier avec vos paramètres
nano .env

# Valider la configuration
npm run validate-config

# Tester les sources
npm run poster:validate
```

## Variables d'Environnement

### Sources et APIs

#### TMDB (The Movie Database)
```bash
# Clé API TMDB (fortement recommandée)
TMDB_API_KEY=1234567890abcdef1234567890abcdef

# Activation de la source TMDB (défaut: true si clé présente)
TMDB_ENABLED=true

# Timeout pour les requêtes TMDB en millisecondes (défaut: 3000)
TMDB_TIMEOUT=3000

# URL de base personnalisée (défaut: https://api.themoviedb.org/3)
TMDB_BASE_URL=https://api.themoviedb.org/3

# URL de base pour les images (défaut: https://image.tmdb.org/t/p/w500)
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p/w500
```

#### Kitsu
```bash
# Activation de la source Kitsu (défaut: true)
KITSU_ENABLED=true

# Timeout pour les requêtes Kitsu en millisecondes (défaut: 3000)
KITSU_TIMEOUT=3000

# URL de base personnalisée (défaut: https://kitsu.io/api/edge)
KITSU_BASE_URL=https://kitsu.io/api/edge
```

#### Nautiljon
```bash
# Activation de la source Nautiljon (défaut: true)
NAUTILJON_ENABLED=true

# Timeout pour les requêtes Nautiljon en millisecondes (défaut: 5000)
NAUTILJON_TIMEOUT=5000

# URL de base personnalisée (défaut: https://www.nautiljon.com)
NAUTILJON_BASE_URL=https://www.nautiljon.com

# Mode headless pour Puppeteer (défaut: true)
NAUTILJON_HEADLESS=true
```

### Configuration du Cache

```bash
# Durée de vie du cache en millisecondes (défaut: 86400000 = 24h)
POSTER_CACHE_TTL=86400000

# Taille maximale du cache (nombre d'entrées, défaut: 1000)
POSTER_CACHE_SIZE=1000

# Persistance du cache sur disque (défaut: false)
POSTER_CACHE_PERSIST=false

# Chemin du fichier de cache (défaut: ./cache/poster-cache.json)
POSTER_CACHE_FILE=./cache/poster-cache.json

# Nettoyage automatique du cache expiré (défaut: true)
POSTER_CACHE_AUTO_CLEANUP=true

# Intervalle de nettoyage en millisecondes (défaut: 3600000 = 1h)
POSTER_CACHE_CLEANUP_INTERVAL=3600000
```

### Configuration de Performance

```bash
# Nombre maximum de requêtes simultanées (défaut: 5)
POSTER_MAX_CONCURRENT=5

# Délai entre les requêtes en millisecondes (défaut: 100)
POSTER_REQUEST_DELAY=100

# Timeout global pour toutes les sources en millisecondes (défaut: 10000)
POSTER_GLOBAL_TIMEOUT=10000

# Nombre de tentatives par source (défaut: 2)
POSTER_MAX_RETRIES=2
```

### Circuit Breaker

```bash
# Nombre d'échecs consécutifs avant ouverture (défaut: 10)
CIRCUIT_BREAKER_THRESHOLD=10

# Durée de désactivation en millisecondes (défaut: 1800000 = 30min)
CIRCUIT_BREAKER_DURATION=1800000

# Délai avant test en mode HALF_OPEN (défaut: 60000 = 1min)
CIRCUIT_BREAKER_TEST_DELAY=60000

# Activation du circuit breaker (défaut: true)
CIRCUIT_BREAKER_ENABLED=true
```

### Configuration du Logging

```bash
# Niveau de log (error, warn, info, debug, défaut: info)
LOG_LEVEL=info

# Activation des logs détaillés (défaut: false)
DEBUG_POSTER_SYSTEM=false

# Logs des métriques de performance (défaut: true)
LOG_PERFORMANCE_METRICS=true

# Sauvegarde des logs dans un fichier (défaut: false)
LOG_TO_FILE=false

# Chemin du fichier de log (défaut: ./logs/poster-system.log)
LOG_FILE_PATH=./logs/poster-system.log

# Rotation des logs (défaut: false)
LOG_ROTATION_ENABLED=false

# Taille maximale du fichier de log en MB (défaut: 10)
LOG_MAX_FILE_SIZE=10
```

## Configuration des Sources

### Ordre de Priorité

Les sources sont tentées dans l'ordre de priorité suivant :

1. **Cache** (toujours en premier)
2. **Kitsu** (priorité 1 - source principale)
3. **TMDB** (priorité 2 - premier fallback)
4. **Nautiljon** (priorité 3 - dernier fallback)

### Personnalisation de l'Ordre

```bash
# Modifier les priorités (plus bas = plus prioritaire)
KITSU_PRIORITY=1
TMDB_PRIORITY=2
NAUTILJON_PRIORITY=3

# Ou désactiver certaines sources
KITSU_ENABLED=false  # Commencer directement par TMDB
```

### Configuration Avancée par Source

#### TMDB Avancé
```bash
# Langue de recherche (défaut: fr-FR)
TMDB_LANGUAGE=fr-FR

# Région de recherche (défaut: FR)
TMDB_REGION=FR

# Inclure le contenu adulte (défaut: false)
TMDB_INCLUDE_ADULT=false

# Taille des images de poster (défaut: w500)
TMDB_POSTER_SIZE=w500

# Nombre maximum de résultats de recherche (défaut: 5)
TMDB_MAX_SEARCH_RESULTS=5
```

#### Nautiljon Avancé
```bash
# User-Agent pour les requêtes (défaut: générique)
NAUTILJON_USER_AGENT=Mozilla/5.0 (compatible; FRAnime-Bot/1.0)

# Délai entre les pages en millisecondes (défaut: 1000)
NAUTILJON_PAGE_DELAY=1000

# Nombre maximum de pages à parcourir (défaut: 3)
NAUTILJON_MAX_PAGES=3

# Sélecteurs CSS personnalisés
NAUTILJON_POSTER_SELECTOR=.poster img
NAUTILJON_TITLE_SELECTOR=.title h1
```

## Configuration du Cache

### Types de Cache

#### Cache Mémoire (par défaut)
```bash
POSTER_CACHE_PERSIST=false
POSTER_CACHE_SIZE=1000
POSTER_CACHE_TTL=86400000
```

#### Cache Persistant
```bash
POSTER_CACHE_PERSIST=true
POSTER_CACHE_FILE=./cache/poster-cache.json
POSTER_CACHE_SIZE=5000
POSTER_CACHE_TTL=604800000  # 7 jours
```

### Stratégies d'Éviction

```bash
# Stratégie LRU (Least Recently Used) - défaut
POSTER_CACHE_EVICTION=lru

# Nettoyage automatique des entrées expirées
POSTER_CACHE_AUTO_CLEANUP=true
POSTER_CACHE_CLEANUP_INTERVAL=3600000  # 1 heure
```

## Configuration du Logging

### Niveaux de Log

```bash
# Production - logs minimaux
LOG_LEVEL=warn
DEBUG_POSTER_SYSTEM=false
LOG_PERFORMANCE_METRICS=false

# Développement - logs détaillés
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_PERFORMANCE_METRICS=true

# Débogage - tous les logs
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
```

### Logs Personnalisés

```bash
# Logs spécifiques par catégorie
LOG_CACHE_OPERATIONS=true
LOG_FALLBACK_CHAINS=true
LOG_CIRCUIT_BREAKER=true
LOG_RATE_LIMITING=true
LOG_NETWORK_REQUESTS=true
```

## Configuration Avancée

### Mode Développement

```bash
# Configuration complète pour le développement
NODE_ENV=development
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
POSTER_CACHE_PERSIST=false
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_DURATION=60000
```

### Mode Production

```bash
# Configuration optimisée pour la production
NODE_ENV=production
LOG_LEVEL=warn
DEBUG_POSTER_SYSTEM=false
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
POSTER_CACHE_PERSIST=true
POSTER_CACHE_SIZE=5000
POSTER_CACHE_TTL=604800000
CIRCUIT_BREAKER_THRESHOLD=10
CIRCUIT_BREAKER_DURATION=1800000
```

### Configuration de Test

```bash
# Configuration pour les tests automatisés
NODE_ENV=test
LOG_LEVEL=error
DEBUG_POSTER_SYSTEM=false
LOG_PERFORMANCE_METRICS=false
POSTER_CACHE_PERSIST=false
POSTER_CACHE_SIZE=100
CIRCUIT_BREAKER_ENABLED=false
```

## Validation et Tests

### Commandes de Validation

```bash
# Valider la configuration complète
npm run validate-config

# Tester les sources individuellement
npm run poster:test-kitsu
npm run poster:test-tmdb
npm run poster:test-nautiljon

# Tester la chaîne de fallback complète
npm run poster:test-fallback

# Vérifier les performances
npm run poster:benchmark
```

### Scripts de Diagnostic

```bash
# Diagnostiquer les problèmes de configuration
npm run poster:diagnose

# Afficher les statistiques actuelles
npm run poster:stats

# Tester la connectivité réseau
npm run poster:network-test
```

## Dépannage

### Problèmes Courants

#### TMDB ne fonctionne pas
```bash
# Vérifier la clé API
curl "https://api.themoviedb.org/3/configuration?api_key=VOTRE_CLE"

# Variables à vérifier
TMDB_API_KEY=votre_cle_valide
TMDB_ENABLED=true
TMDB_TIMEOUT=5000  # Augmenter si nécessaire
```

#### Cache inefficace
```bash
# Augmenter la taille du cache
POSTER_CACHE_SIZE=2000

# Augmenter la durée de vie
POSTER_CACHE_TTL=604800000  # 7 jours

# Activer la persistance
POSTER_CACHE_PERSIST=true
```

#### Performance lente
```bash
# Réduire les requêtes simultanées
POSTER_MAX_CONCURRENT=3

# Augmenter les timeouts
KITSU_TIMEOUT=5000
TMDB_TIMEOUT=5000
NAUTILJON_TIMEOUT=8000

# Désactiver les sources lentes
NAUTILJON_ENABLED=false
```

#### Circuit breakers ouverts
```bash
# Réduire le seuil d'échec
CIRCUIT_BREAKER_THRESHOLD=5

# Réduire la durée de désactivation
CIRCUIT_BREAKER_DURATION=300000  # 5 minutes

# Forcer la réinitialisation
npm run poster:reset-sources
```

### Logs de Diagnostic

```bash
# Activer tous les logs pour diagnostic
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_TO_FILE=true

# Analyser les logs
tail -f logs/poster-system.log | grep ERROR
grep "Circuit breaker" logs/poster-system.log
grep "Cache HIT\|Cache MISS" logs/poster-system.log
```

### Support et Aide

Pour obtenir de l'aide supplémentaire :

1. **Vérifier les logs** : `npm run poster:stats`
2. **Tester la configuration** : `npm run validate-config`
3. **Consulter la documentation** : `docs/POSTER_SYSTEM.md`
4. **Diagnostiquer les problèmes** : `npm run poster:diagnose`

## Exemples de Configuration

### Configuration Minimale
```bash
# .env minimal
TMDB_API_KEY=votre_cle_api
```

### Configuration Équilibrée
```bash
# .env équilibré
TMDB_API_KEY=votre_cle_api
POSTER_CACHE_SIZE=2000
POSTER_CACHE_TTL=172800000  # 2 jours
LOG_LEVEL=info
LOG_PERFORMANCE_METRICS=true
```

### Configuration Haute Performance
```bash
# .env haute performance
TMDB_API_KEY=votre_cle_api
POSTER_CACHE_PERSIST=true
POSTER_CACHE_SIZE=10000
POSTER_CACHE_TTL=604800000  # 7 jours
POSTER_MAX_CONCURRENT=10
LOG_LEVEL=warn
CIRCUIT_BREAKER_THRESHOLD=20
```