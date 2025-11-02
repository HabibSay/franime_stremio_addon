# Guide de Logging - Système de Fallback des Posters

Ce guide détaille le système de logging avancé du système de fallback des posters, incluant la configuration, l'analyse et le débogage.

## Table des Matières

1. [Vue d'Ensemble du Système de Logging](#vue-densemble-du-système-de-logging)
2. [Configuration des Logs](#configuration-des-logs)
3. [Types de Logs](#types-de-logs)
4. [Niveaux de Log](#niveaux-de-log)
5. [Catégories de Logs](#catégories-de-logs)
6. [Analyse des Logs](#analyse-des-logs)
7. [Logs de Performance](#logs-de-performance)
8. [Débogage Avancé](#débogage-avancé)
9. [Sauvegarde et Rotation](#sauvegarde-et-rotation)
10. [Monitoring et Alertes](#monitoring-et-alertes)

## Vue d'Ensemble du Système de Logging

Le système de logging utilise une architecture centralisée avec :

- **Logger centralisé** : Instance singleton pour tous les composants
- **Niveaux hiérarchiques** : ERROR, WARN, INFO, DEBUG
- **Catégories spécialisées** : Cache, Fallback, Circuit Breaker, etc.
- **Formatage intelligent** : Emojis et couleurs pour la lisibilité
- **Sauvegarde optionnelle** : Logs persistants sur disque
- **Métriques intégrées** : Statistiques de logging en temps réel

## Configuration des Logs

### Variables d'Environnement

```bash
# Niveau de log minimum (error, warn, info, debug)
LOG_LEVEL=info

# Mode debug détaillé (true/false)
DEBUG_POSTER_SYSTEM=false

# Logs des métriques de performance (true/false)
LOG_PERFORMANCE_METRICS=true

# Sauvegarde des logs dans un fichier (true/false)
LOG_TO_FILE=false

# Chemin du fichier de log
LOG_FILE_PATH=./logs/poster-system.log

# Rotation des logs (true/false)
LOG_ROTATION_ENABLED=false

# Taille maximale du fichier de log en MB
LOG_MAX_FILE_SIZE=10
```

### Configuration Programmatique

```javascript
const { getLogger } = require('./poster-system/utils/Logger');

// Configuration personnalisée
const logger = getLogger({
  logLevel: 'debug',
  debugMode: true,
  logPerformance: true,
  logToFile: true,
  logFilePath: './logs/custom.log'
});
```

## Types de Logs

### 1. Logs d'Initialisation

**Objectif** : Tracer le démarrage et l'initialisation des composants

```
🚀 PosterManager créé
✅ PosterManager initialisé avec succès
📝 Source kitsu enregistrée (priorité: 1)
📝 Source tmdb enregistrée (priorité: 2)
📝 Source nautiljon enregistrée (priorité: 3)
💾 Cache chargé depuis le disque: 245 entrées valides, 12 expirées
```

**Configuration** :
```bash
LOG_LEVEL=info  # Minimum pour voir ces logs
```

### 2. Logs de Récupération de Posters

**Objectif** : Tracer le processus de récupération des posters

```
🔍 Début de la chaîne de fallback pour "Attack on Titan"
💾 Cache HIT pour "16498:Attack on Titan" (source: tmdb)
🔄 Fallback Kitsu → TMDB pour "One Piece" (Kitsu: timeout)
✅ Poster trouvé via TMDB: https://image.tmdb.org/t/p/w500/poster.jpg
```

**Configuration** :
```bash
LOG_LEVEL=info
DEBUG_POSTER_SYSTEM=true  # Pour les détails
```

### 3. Logs d'Erreurs et Exceptions

**Objectif** : Capturer et diagnostiquer les erreurs

```
❌ Erreur TMDB pour "Naruto": Clé API invalide ou expirée
❌ Erreur lors de la récupération du poster pour "One Piece": Network timeout
❌ Erreur lors du chargement du cache: Invalid JSON in cache file
```

**Configuration** :
```bash
LOG_LEVEL=error  # Toujours visible
```

### 4. Logs de Circuit Breaker

**Objectif** : Surveiller l'état des circuit breakers

```
🔴 Circuit breaker ouvert pour tmdb - 10 échecs consécutifs
🟡 Circuit breaker tmdb passe en HALF_OPEN pour test
🟢 Circuit breaker tmdb fermé - service rétabli
```

**Configuration** :
```bash
LOG_LEVEL=warn  # Pour les changements d'état
```

### 5. Logs de Performance

**Objectif** : Analyser les performances du système

```
📊 Métriques TMDB: 95% succès, 1.2s temps moyen
⏳ Rate limit TMDB: attente de 2500ms (40/40 requêtes)
📊 Cache: 850 hits, 150 misses (85% taux de réussite)
```

**Configuration** :
```bash
LOG_PERFORMANCE_METRICS=true
LOG_LEVEL=info
```

### 6. Logs de Maintenance

**Objectif** : Tracer les opérations de maintenance

```
🔧 Cache vidé (maintenance) - 245 entrées supprimées
🔧 Circuit breaker tmdb réinitialisé manuellement
🔧 Métriques remises à zéro
🔧 Configuration des sources mise à jour
```

**Configuration** :
```bash
LOG_LEVEL=info
```

## Niveaux de Log

### ERROR (Priorité 0)
- **Usage** : Erreurs critiques qui empêchent le fonctionnement
- **Exemples** : Échec d'initialisation, erreurs de configuration fatales
- **Toujours affiché** : Oui, quel que soit le niveau configuré

### WARN (Priorité 1)
- **Usage** : Avertissements et problèmes non-critiques
- **Exemples** : Sources temporairement désactivées, cache plein
- **Affiché si** : LOG_LEVEL = warn, info, ou debug

### INFO (Priorité 2)
- **Usage** : Informations générales sur le fonctionnement
- **Exemples** : Posters récupérés, statistiques, état du système
- **Affiché si** : LOG_LEVEL = info ou debug

### DEBUG (Priorité 3)
- **Usage** : Informations détaillées pour le débogage
- **Exemples** : Détails des requêtes HTTP, état interne du cache
- **Affiché si** : LOG_LEVEL = debug ET DEBUG_POSTER_SYSTEM = true

## Catégories de Logs

### CACHE 💾
```javascript
logger.cache('HIT', 'anime123:Naruto', { source: 'tmdb', age: 3600000 });
logger.cache('MISS', 'anime456:OnePiece');
logger.cache('SET', 'anime789:Bleach', { source: 'kitsu' });
logger.cache('EVICT', 'anime101:DragonBall', { reason: 'lru' });
```

### FALLBACK 🔄
```javascript
logger.fallback('Attack on Titan', 'kitsu', 'tmdb', 'timeout');
logger.fallback('One Piece', 'tmdb', 'nautiljon', 'not_found');
```

### CIRCUIT_BREAKER 🔴
```javascript
logger.circuitBreaker('tmdb', 'OPEN', { consecutiveFailures: 10 });
logger.circuitBreaker('kitsu', 'HALF_OPEN', { testAttempt: true });
logger.circuitBreaker('nautiljon', 'CLOSED', { recovered: true });
```

### RATE_LIMIT ⏳
```javascript
logger.rateLimit('tmdb', 2500, { currentRequests: 40, maxRequests: 40 });
logger.rateLimit('nautiljon', 6000, { reason: 'scraping_limit' });
```

### PERFORMANCE 📊
```javascript
logger.performance('tmdb', {
  totalRequests: 100,
  successfulRequests: 95,
  averageResponseTime: 1200
});
```

### MAINTENANCE 🔧
```javascript
logger.maintenance('Cache vidé', { entriesRemoved: 245 });
logger.maintenance('Sources réactivées', { sources: ['tmdb', 'kitsu'] });
```

## Analyse des Logs

### Commandes d'Analyse Utiles

#### Analyser les Erreurs
```bash
# Erreurs récentes
grep "❌" logs/poster-system.log | tail -20

# Erreurs par source
grep "❌.*TMDB" logs/poster-system.log | wc -l
grep "❌.*Kitsu" logs/poster-system.log | wc -l
grep "❌.*Nautiljon" logs/poster-system.log | wc -l

# Types d'erreurs les plus fréquents
grep "❌" logs/poster-system.log | cut -d':' -f3 | sort | uniq -c | sort -nr
```

#### Analyser les Performances
```bash
# Métriques de performance
grep "📊 Métriques" logs/poster-system.log | tail -10

# Temps de réponse moyens
grep "temps moyen" logs/poster-system.log | grep -o '[0-9.]*ms' | sort -n

# Rate limiting
grep "⏳ Rate limit" logs/poster-system.log | tail -10
```

#### Analyser le Cache
```bash
# Efficacité du cache
grep "Cache HIT\|Cache MISS" logs/poster-system.log | tail -50

# Calcul du taux de hit
hits=$(grep "Cache HIT" logs/poster-system.log | wc -l)
misses=$(grep "Cache MISS" logs/poster-system.log | wc -l)
total=$((hits + misses))
rate=$(echo "scale=2; $hits * 100 / $total" | bc)
echo "Taux de hit du cache: $rate%"
```

#### Analyser les Circuit Breakers
```bash
# État des circuit breakers
grep "Circuit breaker" logs/poster-system.log | tail -20

# Fréquence d'ouverture par source
grep "🔴.*ouvert" logs/poster-system.log | cut -d' ' -f4 | sort | uniq -c
```

### Scripts d'Analyse Automatisée

#### Script de Rapport Quotidien
```bash
#!/bin/bash
# daily-report.sh - Rapport quotidien des logs

LOG_FILE="logs/poster-system.log"
TODAY=$(date +%Y-%m-%d)

echo "📊 Rapport quotidien - $TODAY"
echo "================================"

# Statistiques générales
echo -e "\n📈 Statistiques générales:"
total_requests=$(grep "Poster trouvé\|Aucun poster trouvé" $LOG_FILE | grep $TODAY | wc -l)
successful_requests=$(grep "✅ Poster trouvé" $LOG_FILE | grep $TODAY | wc -l)
success_rate=$(echo "scale=1; $successful_requests * 100 / $total_requests" | bc 2>/dev/null || echo "0")

echo "  Requêtes totales: $total_requests"
echo "  Requêtes réussies: $successful_requests"
echo "  Taux de réussite: $success_rate%"

# Erreurs par source
echo -e "\n❌ Erreurs par source:"
grep "❌.*pour" $LOG_FILE | grep $TODAY | cut -d' ' -f2 | sort | uniq -c | sort -nr

# Cache
echo -e "\n💾 Efficacité du cache:"
cache_hits=$(grep "Cache HIT" $LOG_FILE | grep $TODAY | wc -l)
cache_misses=$(grep "Cache MISS" $LOG_FILE | grep $TODAY | wc -l)
cache_total=$((cache_hits + cache_misses))
cache_rate=$(echo "scale=1; $cache_hits * 100 / $cache_total" | bc 2>/dev/null || echo "0")

echo "  Hits: $cache_hits"
echo "  Misses: $cache_misses"
echo "  Taux de hit: $cache_rate%"

# Circuit breakers
echo -e "\n🔴 Circuit breakers ouverts:"
grep "🔴.*ouvert" $LOG_FILE | grep $TODAY | cut -d' ' -f4 | sort | uniq -c || echo "  Aucun"

echo -e "\n✅ Rapport terminé"
```

#### Script de Monitoring en Temps Réel
```bash
#!/bin/bash
# realtime-monitor.sh - Monitoring en temps réel

LOG_FILE="logs/poster-system.log"

echo "🔍 Monitoring en temps réel des logs"
echo "===================================="
echo "Appuyez sur Ctrl+C pour arrêter"
echo ""

# Suivre les logs avec filtrage
tail -f $LOG_FILE | while read line; do
  # Colorier selon le type de log
  if [[ $line == *"❌"* ]]; then
    echo -e "\033[31m$line\033[0m"  # Rouge pour erreurs
  elif [[ $line == *"⚠️"* ]]; then
    echo -e "\033[33m$line\033[0m"  # Jaune pour warnings
  elif [[ $line == *"✅"* ]]; then
    echo -e "\033[32m$line\033[0m"  # Vert pour succès
  elif [[ $line == *"📊"* ]]; then
    echo -e "\033[36m$line\033[0m"  # Cyan pour métriques
  else
    echo "$line"
  fi
done
```

## Logs de Performance

### Métriques Collectées

Le système collecte automatiquement ces métriques :

```javascript
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "source": "tmdb",
  "metrics": {
    "totalRequests": 150,
    "successfulRequests": 142,
    "failedRequests": 8,
    "averageResponseTime": 1250,
    "consecutiveFailures": 0,
    "isTemporarilyDisabled": false
  }
}
```

### Configuration des Métriques

```bash
# Activer les logs de performance
LOG_PERFORMANCE_METRICS=true

# Fréquence des rapports (en millisecondes)
PERFORMANCE_REPORT_INTERVAL=300000  # 5 minutes

# Taille du buffer de métriques
PERFORMANCE_BUFFER_SIZE=100
```

### Analyse des Métriques

```bash
# Temps de réponse par source
grep "📊 Métriques" logs/poster-system.log | \
  grep -o '[a-z]*: [0-9.]*ms' | \
  sort | uniq -c

# Sources les plus lentes
grep "temps moyen" logs/poster-system.log | \
  sort -k4 -nr | head -10

# Évolution des performances
grep "📊 Métriques" logs/poster-system.log | \
  tail -20 | grep -o '[0-9.]*ms temps moyen'
```

## Débogage Avancé

### Mode Debug Complet

```bash
# Configuration debug maximale
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/debug.log
```

### Logs de Debug Détaillés

En mode debug, vous verrez :

```
🔍 Début de la chaîne de fallback pour "Attack on Titan"
🔍 Tentative de récupération via kitsu (attempt: 1/3)
🔍 Requête HTTP: GET https://kitsu.io/api/edge/anime?filter[text]=Attack%20on%20Titan
🔍 Réponse HTTP: 200 OK (1.2s)
🔍 Parsing de la réponse: 5 résultats trouvés
🔍 Sélection du meilleur match: "Attack on Titan" (score: 0.95)
✅ Poster trouvé via kitsu: https://media.kitsu.io/anime/poster_images/7442/large.jpg
💾 Cache SET pour "16498:Attack on Titan" (source: kitsu)
```

### Débogage par Composant

```bash
# Logs spécifiques au cache
grep "💾" logs/debug.log | tail -20

# Logs spécifiques au fallback
grep "🔄" logs/debug.log | tail -20

# Logs spécifiques aux circuit breakers
grep "🔴\|🟡\|🟢" logs/debug.log | tail -20
```

### Débogage des Requêtes HTTP

```bash
# Activer les logs de requêtes HTTP détaillés
DEBUG_HTTP_REQUESTS=true

# Logs générés
🌐 HTTP Request: GET https://api.themoviedb.org/3/search/tv?query=Naruto
🌐 HTTP Headers: {"Authorization": "Bearer xxx", "User-Agent": "FRAnime/1.0"}
🌐 HTTP Response: 200 OK (850ms)
🌐 HTTP Body: {"page": 1, "results": [...]}
```

## Sauvegarde et Rotation

### Configuration de la Sauvegarde

```bash
# Activer la sauvegarde
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/poster-system.log

# Rotation automatique
LOG_ROTATION_ENABLED=true
LOG_MAX_FILE_SIZE=10  # MB
LOG_MAX_FILES=5       # Nombre de fichiers à conserver
```

### Rotation Manuelle

```bash
# Script de rotation manuelle
#!/bin/bash
LOG_DIR="./logs"
LOG_FILE="$LOG_DIR/poster-system.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ -f "$LOG_FILE" ]; then
  mv "$LOG_FILE" "$LOG_DIR/poster-system_$TIMESTAMP.log"
  gzip "$LOG_DIR/poster-system_$TIMESTAMP.log"
  echo "Log archivé: poster-system_$TIMESTAMP.log.gz"
fi

# Nettoyer les anciens logs (garder 30 jours)
find "$LOG_DIR" -name "poster-system_*.log.gz" -mtime +30 -delete
```

### Sauvegarde Automatique

```javascript
// Configuration dans le code
const logger = getLogger({
  logToFile: true,
  logFilePath: './logs/poster-system.log',
  rotationEnabled: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});

// Sauvegarde périodique
setInterval(() => {
  logger.saveToFile(true);
}, 5 * 60 * 1000); // Toutes les 5 minutes
```

## Monitoring et Alertes

### Métriques de Monitoring

Le système expose ces métriques pour le monitoring :

```javascript
// Statistiques des logs
{
  "error": 5,
  "warn": 23,
  "info": 1250,
  "debug": 5670,
  "total": 6948,
  "uptime": 3600000,
  "uptimeFormatted": "1h 0m 0s",
  "performanceBufferSize": 50
}
```

### Alertes Recommandées

#### Alerte sur Taux d'Erreur Élevé
```bash
#!/bin/bash
# check-error-rate.sh
LOG_FILE="logs/poster-system.log"
THRESHOLD=10  # Pourcentage

# Calculer le taux d'erreur sur la dernière heure
errors=$(grep "❌" $LOG_FILE | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" | wc -l)
total=$(grep -E "(✅|❌)" $LOG_FILE | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" | wc -l)

if [ $total -gt 0 ]; then
  error_rate=$(echo "scale=1; $errors * 100 / $total" | bc)
  if (( $(echo "$error_rate > $THRESHOLD" | bc -l) )); then
    echo "🚨 ALERTE: Taux d'erreur élevé ($error_rate%)"
    # Envoyer notification (email, Slack, etc.)
  fi
fi
```

#### Alerte sur Circuit Breaker Ouvert
```bash
#!/bin/bash
# check-circuit-breakers.sh
LOG_FILE="logs/poster-system.log"

# Vérifier les circuit breakers ouverts dans la dernière heure
open_breakers=$(grep "🔴.*ouvert" $LOG_FILE | grep "$(date '+%Y-%m-%d %H')" | wc -l)

if [ $open_breakers -gt 0 ]; then
  echo "🚨 ALERTE: $open_breakers circuit breaker(s) ouvert(s)"
  # Lister les sources affectées
  grep "🔴.*ouvert" $LOG_FILE | grep "$(date '+%Y-%m-%d %H')" | cut -d' ' -f4
fi
```

### Intégration avec des Outils de Monitoring

#### Prometheus/Grafana
```javascript
// Exposition des métriques pour Prometheus
const promClient = require('prom-client');

const errorCounter = new promClient.Counter({
  name: 'poster_system_errors_total',
  help: 'Total number of errors',
  labelNames: ['source', 'type']
});

const responseTimeHistogram = new promClient.Histogram({
  name: 'poster_system_response_time_seconds',
  help: 'Response time histogram',
  labelNames: ['source']
});

// Dans le logger
logger.on('error', (data) => {
  errorCounter.inc({ source: data.source, type: data.type });
});

logger.on('performance', (data) => {
  responseTimeHistogram.observe(
    { source: data.source },
    data.responseTime / 1000
  );
});
```

#### ELK Stack (Elasticsearch, Logstash, Kibana)
```json
// Configuration Logstash
{
  "input": {
    "file": {
      "path": "/app/logs/poster-system.log",
      "codec": "json"
    }
  },
  "filter": {
    "if": "[level] == 'ERROR'",
    "mutate": {
      "add_tag": ["error"]
    }
  },
  "output": {
    "elasticsearch": {
      "hosts": ["elasticsearch:9200"],
      "index": "poster-system-logs"
    }
  }
}
```

Ce guide couvre tous les aspects du système de logging. Pour des besoins spécifiques, consultez la documentation technique ou utilisez les outils de diagnostic intégrés.