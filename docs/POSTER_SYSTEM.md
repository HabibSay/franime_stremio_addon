# Système de Fallback des Posters

Le système de fallback des posters permet de récupérer des images de posters d'anime depuis plusieurs sources pour garantir une couverture maximale. Il utilise une architecture en cascade qui tente automatiquement plusieurs sources jusqu'à trouver un poster valide.

## Architecture du Système

Le système utilise une approche modulaire avec les composants suivants :

- **PosterManager** : Orchestrateur principal qui coordonne toutes les opérations
- **CacheService** : Système de cache intelligent avec TTL et éviction LRU
- **FallbackChain** : Gestionnaire de la séquence de sources ordonnées
- **Sources** : Implémentations spécifiques pour chaque API/service
- **MetricsCollector** : Collecte des statistiques et métriques de performance

## Sources Disponibles

### 1. Kitsu (Source principale)
- **Type** : API REST publique
- **Authentification** : Aucune clé API requise
- **Rate limiting** : 30 requêtes par minute
- **Timeout** : 3 secondes
- **Priorité** : 1 (première tentative)
- **Avantages** : Rapide, fiable, spécialisé anime
- **Inconvénients** : Couverture limitée pour certains animes

### 2. TMDB (The Movie Database)
- **Type** : API REST avec authentification
- **Authentification** : Clé API gratuite requise
- **Rate limiting** : 40 requêtes par 10 secondes
- **Timeout** : 3 secondes
- **Priorité** : 2 (premier fallback)
- **Avantages** : Large base de données, haute qualité
- **Inconvénients** : Nécessite une clé API, mapping anime→TV/film

### 3. Nautiljon (Scraping web)
- **Type** : Scraping web avec Puppeteer
- **Authentification** : Aucune
- **Rate limiting** : 10 requêtes par minute
- **Timeout** : 5 secondes (plus lent)
- **Priorité** : 3 (dernier fallback)
- **Avantages** : Couverture spécialisée anime français
- **Inconvénients** : Plus lent, fragile aux changements de site

## Configuration Complète

### Variables d'Environnement

Le système utilise un fichier `.env` pour la configuration. Créez ce fichier à la racine du projet :

```bash
# === CONFIGURATION TMDB (Recommandée) ===
# Clé API TMDB - Améliore significativement la couverture des posters
TMDB_API_KEY=votre_cle_api_tmdb_ici

# === CONFIGURATION DU CACHE ===
# Durée de vie du cache en millisecondes (défaut: 24h)
POSTER_CACHE_TTL=86400000

# Taille maximale du cache (nombre d'entrées, défaut: 1000)
POSTER_CACHE_SIZE=1000

# Persistance du cache sur disque (true/false, défaut: false)
POSTER_CACHE_PERSIST=false

# === CONTRÔLE DES SOURCES ===
# Activation/désactivation des sources individuelles
KITSU_ENABLED=true
TMDB_ENABLED=true
NAUTILJON_ENABLED=true

# === CONFIGURATION DE PERFORMANCE ===
# Nombre maximum de requêtes simultanées (défaut: 5)
POSTER_MAX_CONCURRENT=5

# Timeouts personnalisés par source (en millisecondes)
KITSU_TIMEOUT=3000
TMDB_TIMEOUT=3000
NAUTILJON_TIMEOUT=5000

# === CIRCUIT BREAKER ===
# Nombre d'échecs avant désactivation temporaire (défaut: 10)
CIRCUIT_BREAKER_THRESHOLD=10

# Durée de désactivation en millisecondes (défaut: 30min)
CIRCUIT_BREAKER_DURATION=1800000

# === LOGGING ET DEBUG ===
# Niveau de log (error, warn, info, debug, défaut: info)
LOG_LEVEL=info

# Activation des logs détaillés pour le débogage (true/false)
DEBUG_POSTER_SYSTEM=false

# Logs des métriques de performance (true/false)
LOG_PERFORMANCE_METRICS=true
```

### Guide d'Obtention des Clés API

#### TMDB (The Movie Database) - Recommandé

1. **Création du compte**
   - Allez sur [themoviedb.org](https://www.themoviedb.org/)
   - Cliquez sur "S'inscrire" et créez un compte gratuit
   - Confirmez votre email

2. **Demande de clé API**
   - Connectez-vous et allez dans "Paramètres" → "API"
   - Cliquez sur "Demander une clé API"
   - Choisissez "Developer" (gratuit)
   - Remplissez le formulaire avec les informations de votre projet

3. **Configuration**
   - Copiez la clé API v3 (format : `1234567890abcdef1234567890abcdef`)
   - Ajoutez-la dans votre fichier `.env` : `TMDB_API_KEY=votre_cle_ici`

4. **Vérification**
   - Utilisez `npm run validate-config` pour tester la clé
   - La clé est valide si le test de connexion réussit

#### Autres Sources

- **Kitsu** : Aucune configuration requise (API publique)
- **Nautiljon** : Aucune configuration requise (scraping web)

## Validation de Configuration

Utilisez les scripts npm pour valider votre configuration:

```bash
# Valide la configuration actuelle
npm run validate-config

# Génère un fichier .env.example
npm run generate-env
```

## Fonctionnalités

### Cache Intelligent
- Cache automatique des posters récupérés (24h par défaut)
- Éviction LRU quand la limite est atteinte
- Persistance optionnelle sur disque

### Circuit Breaker
- Désactivation automatique des sources défaillantes
- Réactivation progressive après récupération
- Seuil configurable (10 échecs par défaut)

### Gestion Asynchrone
- Affichage immédiat avec placeholders
- Mise à jour dynamique des posters
- Limitation des requêtes simultanées

### Métriques et Monitoring
- Statistiques par source (succès/échecs)
- Métriques de cache (hits/misses)
- Temps de réponse moyens

## Utilisation

Le système est automatiquement intégré dans l'addon. Les posters sont récupérés de manière transparente lors de l'affichage du catalogue.

### Ordre de Fallback

1. **Cache** - Vérification du cache local
2. **Kitsu** - Source principale
3. **TMDB** - Premier fallback (si configuré)
4. **Nautiljon** - Second fallback
5. **Placeholder** - Image par défaut si tout échoue

### Gestion des Erreurs

- Timeout automatique par source (3-5 secondes)
- Retry intelligent selon le type d'erreur
- Logs détaillés pour le débogage
- Fallback gracieux vers l'image placeholder
- Circuit breaker pour éviter les appels répétés vers des services défaillants

## Système de Logging et Débogage

### Niveaux de Log

Le système utilise différents niveaux de log pour faciliter le débogage :

- **ERROR** : Erreurs critiques qui empêchent le fonctionnement
- **WARN** : Avertissements et problèmes non-critiques
- **INFO** : Informations générales sur le fonctionnement
- **DEBUG** : Informations détaillées pour le débogage

### Configuration du Logging

```bash
# Dans votre fichier .env
LOG_LEVEL=info                    # Niveau minimum des logs
DEBUG_POSTER_SYSTEM=false        # Logs détaillés du système
LOG_PERFORMANCE_METRICS=true     # Logs des métriques de performance
```

### Types de Logs Générés

#### 1. Logs d'Initialisation
```
✅ PosterManager initialisé avec succès
📊 Endpoints de monitoring activés sur /monitoring
💾 Cache chargé depuis le disque: 245 entrées valides, 12 expirées
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

#### 5. Logs de Maintenance
```
🔧 Circuit breaker tmdb réinitialisé manuellement
⚙️ Configuration des sources mise à jour
📊 Métriques remises à zéro
🔌 PosterManager fermé
```

### Activation du Mode Debug

Pour activer les logs détaillés :

```bash
# Dans .env
DEBUG_POSTER_SYSTEM=true
LOG_LEVEL=debug
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
grep "timeout" logs/franime.log

# Analyser les échecs par source
grep "❌.*TMDB" logs/franime.log | wc -l

# Vérifier l'efficacité du cache
grep "Cache HIT\|Cache MISS" logs/franime.log
```

#### Surveiller la Santé des Sources
```bash
# État des circuit breakers
grep "Circuit breaker" logs/franime.log | tail -10

# Taux de succès par source
grep "📊 Métriques" logs/franime.log | tail -5
```

## Dépannage

### Problèmes Courants

1. **TMDB désactivé**
   - Vérifiez que `TMDB_API_KEY` est définie
   - Validez la clé sur le site TMDB

2. **Posters manquants**
   - Vérifiez les logs pour les erreurs de sources
   - Utilisez `npm run validate-config` pour diagnostiquer

3. **Performance lente**
   - Réduisez `POSTER_MAX_CONCURRENT` si nécessaire
   - Vérifiez la connectivité réseau
   - Augmentez `POSTER_CACHE_TTL` pour plus de cache

### Logs de Débogage

Les logs incluent:
- Statistiques de cache et sources
- Erreurs de récupération par anime
- Métriques de performance
- État des circuit breakers

## Architecture

Le système utilise une architecture modulaire:

- **PosterManager**: Orchestrateur principal
- **CacheService**: Gestion du cache avec TTL
- **FallbackChain**: Chaîne de sources ordonnées
- **Sources**: Implémentations spécifiques (Kitsu, TMDB, Nautiljon)
- **MetricsCollector**: Collecte des statistiques

Cette architecture permet d'ajouter facilement de nouvelles sources de posters à l'avenir.