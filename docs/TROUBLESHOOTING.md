# Guide de Dépannage - Système de Fallback des Posters

Ce guide fournit des solutions détaillées pour diagnostiquer et résoudre les problèmes courants du système de fallback des posters.

## Table des Matières

1. [Diagnostic Rapide](#diagnostic-rapide)
2. [Problèmes de Configuration](#problèmes-de-configuration)
3. [Problèmes de Sources](#problèmes-de-sources)
4. [Problèmes de Performance](#problèmes-de-performance)
5. [Problèmes de Cache](#problèmes-de-cache)
6. [Analyse des Logs](#analyse-des-logs)
7. [Outils de Diagnostic](#outils-de-diagnostic)
8. [Solutions Avancées](#solutions-avancées)

## Diagnostic Rapide

### Commande de Diagnostic Express

```bash
# Diagnostic complet en une commande
npm run validate-config && npm run poster:validate && npm run poster:stats
```

### Vérifications de Base

1. **Serveur démarré** : `curl http://localhost:65094/manifest.json`
2. **Configuration valide** : `npm run validate-config`
3. **Sources actives** : `npm run poster:validate`
4. **Statistiques** : `npm run poster:stats`

### Indicateurs de Santé

✅ **Système sain** :
- Configuration validée
- Toutes les sources actives
- Taux de cache > 50%
- Temps de réponse < 3s

⚠️ **Attention requise** :
- 1-2 sources désactivées
- Taux de cache 20-50%
- Temps de réponse 3-5s

🚨 **Problème critique** :
- Configuration invalide
- Toutes les sources désactivées
- Taux de cache < 20%
- Temps de réponse > 5s

## Problèmes de Configuration

### Erreur : "TMDB_API_KEY manquante"

**Symptômes** :
```
❌ Erreur de configuration au démarrage: TMDB_API_KEY manquante
```

**Solutions** :
1. **Obtenir une clé API TMDB** :
   - Aller sur [themoviedb.org](https://www.themoviedb.org/)
   - Créer un compte gratuit
   - Demander une clé API dans Paramètres → API

2. **Configurer la clé** :
```bash
echo "TMDB_API_KEY=votre_cle_api_ici" >> .env
```

3. **Valider** :
```bash
npm run validate-config
```

### Erreur : "Configuration invalide"

**Diagnostic** :
```bash
npm run validate-config
```

**Solutions courantes** :
- Vérifier la syntaxe du fichier `.env`
- S'assurer que les valeurs numériques sont valides
- Vérifier les chemins de fichiers

### Variables d'Environnement Non Reconnues

**Diagnostic** :
```bash
node -e "console.log(process.env.TMDB_API_KEY)"
```

**Solutions** :
- Redémarrer le serveur après modification du `.env`
- Vérifier qu'il n'y a pas d'espaces autour du `=`
- Utiliser des guillemets pour les valeurs avec espaces

## Problèmes de Sources

### TMDB Désactivé

**Symptômes** :
```
🔴 Circuit breaker ouvert pour tmdb - 10 échecs consécutifs
```

**Diagnostic** :
```bash
# Tester la clé API directement
curl "https://api.themoviedb.org/3/configuration?api_key=VOTRE_CLE"
```

**Solutions** :
1. **Clé API invalide** :
```bash
# Vérifier et remplacer la clé
echo "TMDB_API_KEY=nouvelle_cle_valide" >> .env
```

2. **Quota dépassé** :
```bash
# Réduire les requêtes simultanées
echo "POSTER_MAX_CONCURRENT=2" >> .env
echo "TMDB_TIMEOUT=5000" >> .env
```

3. **Réactiver la source** :
```bash
npm run poster:reset-sources
```

### Kitsu Inaccessible

**Symptômes** :
```
❌ Erreur Kitsu pour "Naruto": Network timeout
```

**Diagnostic** :
```bash
# Tester la connectivité
curl -I "https://kitsu.io/api/edge/anime"
```

**Solutions** :
1. **Problème réseau temporaire** :
```bash
# Augmenter le timeout
echo "KITSU_TIMEOUT=8000" >> .env
```

2. **Proxy/Firewall** :
```bash
# Configurer un proxy si nécessaire
echo "HTTP_PROXY=http://proxy:port" >> .env
```

### Nautiljon Bloqué

**Symptômes** :
```
❌ Erreur Nautiljon pour "One Piece": Page not found
```

**Diagnostic** :
```bash
# Vérifier l'accessibilité
curl -I "https://www.nautiljon.com"
```

**Solutions** :
1. **Rate limiting trop agressif** :
```bash
# Réduire la fréquence
echo "NAUTILJON_TIMEOUT=10000" >> .env
```

2. **User-Agent bloqué** :
```bash
# Changer le User-Agent
echo "NAUTILJON_USER_AGENT=Mozilla/5.0 (compatible; Bot/1.0)" >> .env
```

3. **Désactiver temporairement** :
```bash
echo "NAUTILJON_ENABLED=false" >> .env
```

## Problèmes de Performance

### Chargement Lent des Posters

**Diagnostic** :
```bash
# Vérifier les métriques de performance
curl http://localhost:65094/monitoring/stats/performance
```

**Solutions** :
1. **Réduire la concurrence** :
```bash
echo "POSTER_MAX_CONCURRENT=3" >> .env
```

2. **Optimiser les timeouts** :
```bash
echo "KITSU_TIMEOUT=2000" >> .env
echo "TMDB_TIMEOUT=2000" >> .env
echo "NAUTILJON_TIMEOUT=3000" >> .env
```

3. **Améliorer le cache** :
```bash
echo "POSTER_CACHE_SIZE=2000" >> .env
echo "POSTER_CACHE_TTL=604800000" >> .env  # 7 jours
```

### Timeouts Fréquents

**Symptômes** :
```
⏳ Rate limit TMDB: attente de 5000ms
```

**Solutions** :
1. **Ajuster les limites** :
```bash
echo "POSTER_REQUEST_DELAY=200" >> .env
echo "POSTER_GLOBAL_TIMEOUT=15000" >> .env
```

2. **Échelonner les requêtes** :
```bash
echo "POSTER_MAX_CONCURRENT=2" >> .env
```

### Mémoire Élevée

**Diagnostic** :
```bash
# Surveiller l'utilisation mémoire
node -e "console.log(process.memoryUsage())"
```

**Solutions** :
1. **Réduire la taille du cache** :
```bash
echo "POSTER_CACHE_SIZE=500" >> .env
```

2. **Activer le nettoyage automatique** :
```bash
echo "POSTER_CACHE_AUTO_CLEANUP=true" >> .env
echo "POSTER_CACHE_CLEANUP_INTERVAL=1800000" >> .env  # 30 min
```

## Problèmes de Cache

### Cache Inefficace

**Diagnostic** :
```bash
curl http://localhost:65094/monitoring/stats/cache
```

**Symptômes** : Taux de hit < 30%

**Solutions** :
1. **Augmenter la taille** :
```bash
echo "POSTER_CACHE_SIZE=2000" >> .env
```

2. **Augmenter la durée de vie** :
```bash
echo "POSTER_CACHE_TTL=604800000" >> .env  # 7 jours
```

3. **Activer la persistance** :
```bash
echo "POSTER_CACHE_PERSIST=true" >> .env
echo "POSTER_CACHE_FILE=./cache/posters.json" >> .env
```

### Cache Corrompu

**Symptômes** :
```
❌ Erreur lors du chargement du cache: Invalid JSON
```

**Solutions** :
1. **Vider le cache** :
```bash
npm run poster:clear-cache
```

2. **Supprimer le fichier de cache** :
```bash
rm -f cache/poster-cache.json
```

3. **Redémarrer le serveur** :
```bash
npm start
```

### Cache Plein

**Symptômes** :
```
⚠️ Cache presque plein (95%)
```

**Solutions** :
1. **Augmenter la taille** :
```bash
echo "POSTER_CACHE_SIZE=2000" >> .env
```

2. **Forcer le nettoyage** :
```bash
npm run poster:clear-cache
```

## Analyse des Logs

### Activer les Logs Détaillés

```bash
# Configuration debug complète
echo "LOG_LEVEL=debug" >> .env
echo "DEBUG_POSTER_SYSTEM=true" >> .env
echo "LOG_PERFORMANCE_METRICS=true" >> .env
echo "LOG_TO_FILE=true" >> .env
```

### Analyser les Erreurs

```bash
# Erreurs récentes
grep "❌" logs/poster-system.log | tail -20

# Erreurs par source
grep "❌.*TMDB" logs/poster-system.log | wc -l
grep "❌.*Kitsu" logs/poster-system.log | wc -l
grep "❌.*Nautiljon" logs/poster-system.log | wc -l
```

### Analyser les Performances

```bash
# Temps de réponse moyens
grep "📊 Métriques" logs/poster-system.log | tail -10

# Opérations de cache
grep "Cache HIT\|Cache MISS" logs/poster-system.log | tail -20

# Circuit breakers
grep "Circuit breaker" logs/poster-system.log | tail -10
```

### Analyser les Patterns

```bash
# Animes problématiques
grep "Aucun poster trouvé" logs/poster-system.log | cut -d'"' -f2 | sort | uniq -c | sort -nr

# Sources les plus utilisées
grep "Poster trouvé via" logs/poster-system.log | cut -d' ' -f4 | sort | uniq -c | sort -nr
```

## Outils de Diagnostic

### Script de Diagnostic Automatisé

Créez le fichier `scripts/diagnose.sh` :

```bash
#!/bin/bash
echo "🔍 Diagnostic automatisé du système de posters"
echo "=============================================="

# 1. Configuration
echo -e "\n1. 📋 Configuration..."
npm run validate-config 2>&1 | grep -E "(✅|❌|⚠️)"

# 2. Connectivité réseau
echo -e "\n2. 🌐 Connectivité..."
curl -s -I https://kitsu.io/api/edge/anime | head -1
curl -s -I https://api.themoviedb.org/3/configuration | head -1
curl -s -I https://www.nautiljon.com | head -1

# 3. Santé des sources
echo -e "\n3. 🔗 Sources..."
npm run poster:validate 2>&1 | grep -E "(✅|❌|⚠️)"

# 4. Statistiques
echo -e "\n4. 📊 Statistiques..."
npm run poster:stats 2>&1 | grep -E "(Cache|Taux|Temps)"

# 5. Monitoring HTTP
echo -e "\n5. 🖥️ Monitoring..."
curl -s http://localhost:65094/monitoring/health | jq -r 'to_entries[] | "\(.key): \(.value.healthy)"'

echo -e "\n✅ Diagnostic terminé"
```

### Monitoring en Temps Réel

```bash
# Surveiller les logs en temps réel
tail -f logs/poster-system.log | grep -E "(❌|⚠️|✅|📊)"

# Surveiller les métriques
watch -n 5 'curl -s http://localhost:65094/monitoring/stats | jq ".cache, .global"'
```

### Tests de Charge

```bash
# Test de charge simple
for i in {1..10}; do
  curl -s "http://localhost:65094/catalog/anime.json" > /dev/null &
done
wait
echo "Test de charge terminé"
```

## Solutions Avancées

### Réinitialisation Complète

```bash
#!/bin/bash
echo "🔄 Réinitialisation complète du système..."

# 1. Arrêter le serveur
pkill -f "node server.js"

# 2. Vider le cache
npm run poster:clear-cache

# 3. Réactiver les sources
npm run poster:reset-sources

# 4. Remettre à zéro les métriques
npm run poster:reset-metrics

# 5. Supprimer les logs
rm -f logs/poster-system.log

# 6. Redémarrer
npm start

echo "✅ Réinitialisation terminée"
```

### Configuration de Secours

En cas de problème majeur, utilisez cette configuration minimale :

```bash
# .env de secours
TMDB_API_KEY=votre_cle_api
KITSU_ENABLED=true
TMDB_ENABLED=false
NAUTILJON_ENABLED=false
POSTER_CACHE_SIZE=100
POSTER_CACHE_TTL=3600000  # 1 heure
LOG_LEVEL=warn
CIRCUIT_BREAKER_ENABLED=false
```

### Migration de Configuration

Pour migrer d'une ancienne version :

```bash
#!/bin/bash
echo "🔄 Migration de configuration..."

# Sauvegarder l'ancienne config
cp .env .env.backup

# Appliquer les nouveaux paramètres par défaut
cat >> .env << EOF
# Nouveaux paramètres v2.0
POSTER_CACHE_AUTO_CLEANUP=true
POSTER_CACHE_CLEANUP_INTERVAL=3600000
LOG_PERFORMANCE_METRICS=true
CIRCUIT_BREAKER_TEST_DELAY=60000
EOF

echo "✅ Migration terminée"
```

### Optimisation pour Production

```bash
# Configuration optimisée pour production
cat > .env.production << EOF
NODE_ENV=production
TMDB_API_KEY=votre_cle_api
POSTER_CACHE_PERSIST=true
POSTER_CACHE_SIZE=5000
POSTER_CACHE_TTL=604800000  # 7 jours
POSTER_MAX_CONCURRENT=8
LOG_LEVEL=warn
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
CIRCUIT_BREAKER_THRESHOLD=15
CIRCUIT_BREAKER_DURATION=1800000  # 30 min
EOF
```

## Cas d'Usage Spécifiques

### Déploiement Docker

```dockerfile
# Dockerfile optimisé
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 65094

# Variables d'environnement pour Docker
ENV LOG_LEVEL=info
ENV POSTER_CACHE_PERSIST=false
ENV POSTER_CACHE_SIZE=1000

CMD ["npm", "start"]
```

### Déploiement Heroku

```bash
# Configuration Heroku
heroku config:set TMDB_API_KEY=votre_cle_api
heroku config:set LOG_LEVEL=warn
heroku config:set POSTER_CACHE_PERSIST=false
heroku config:set POSTER_MAX_CONCURRENT=3
```

### Environnement de Développement

```bash
# .env.development
NODE_ENV=development
TMDB_API_KEY=votre_cle_api
LOG_LEVEL=debug
DEBUG_POSTER_SYSTEM=true
LOG_PERFORMANCE_METRICS=true
LOG_TO_FILE=true
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_DURATION=60000  # 1 minute pour tests rapides
```

## Support et Escalade

### Collecte d'Informations pour Support

Avant de demander de l'aide, collectez ces informations :

```bash
#!/bin/bash
echo "📋 Informations système pour support"
echo "===================================="

echo "Version Node.js: $(node --version)"
echo "Version npm: $(npm --version)"
echo "OS: $(uname -a)"
echo "Mémoire: $(free -h 2>/dev/null || vm_stat 2>/dev/null || echo 'N/A')"

echo -e "\nConfiguration:"
npm run validate-config

echo -e "\nStatistiques:"
npm run poster:stats

echo -e "\nLogs récents:"
tail -20 logs/poster-system.log 2>/dev/null || echo "Pas de logs"

echo -e "\nMonitoring:"
curl -s http://localhost:65094/monitoring/health | jq '.' 2>/dev/null || echo "Monitoring inaccessible"
```

### Niveaux d'Escalade

1. **Niveau 1** : Problèmes de configuration
   - Vérifier la documentation
   - Utiliser les outils de diagnostic
   - Consulter les logs

2. **Niveau 2** : Problèmes de performance
   - Analyser les métriques
   - Optimiser la configuration
   - Tester différents paramètres

3. **Niveau 3** : Problèmes système
   - Collecter les informations complètes
   - Reproduire le problème
   - Contacter le support technique

Ce guide couvre la plupart des problèmes rencontrés. Pour des cas spécifiques non couverts, utilisez les outils de diagnostic et consultez les logs détaillés.