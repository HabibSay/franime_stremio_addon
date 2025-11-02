# Monitoring et Maintenance - Système de Posters FRAnime

Ce document décrit les fonctionnalités de monitoring et de maintenance du système de fallback des posters.

## Endpoints de Monitoring

Le serveur FRAnime expose plusieurs endpoints HTTP pour le monitoring du système de posters :

### Endpoints Disponibles

- **GET `/monitoring/stats`** - Statistiques globales du système
- **GET `/monitoring/stats/sources`** - Statistiques détaillées des sources
- **GET `/monitoring/stats/cache`** - État et statistiques du cache
- **GET `/monitoring/stats/performance`** - Métriques de performance
- **GET `/monitoring/stats/sources/:sourceName`** - Statistiques d'une source spécifique
- **GET `/monitoring/health`** - Health check de toutes les sources

### Endpoints de Maintenance

- **POST `/monitoring/maintenance/clear-cache`** - Vide le cache des posters
- **POST `/monitoring/maintenance/reset-sources`** - Réactive les sources désactivées
- **POST `/monitoring/maintenance/validate-sources`** - Valide la santé des sources
- **POST `/monitoring/maintenance/reset-metrics`** - Remet à zéro les métriques

### Exemple d'Utilisation

```bash
# Vérifier les statistiques globales
curl http://localhost:65094/monitoring/stats

# Vérifier la santé des sources
curl http://localhost:65094/monitoring/health

# Vider le cache (POST)
curl -X POST http://localhost:65094/monitoring/maintenance/clear-cache
```

## Commandes de Maintenance CLI

Le système fournit un script CLI pour les opérations de maintenance :

### Commandes Disponibles

```bash
# Afficher l'aide
npm run poster:help

# Afficher les statistiques détaillées
npm run poster:stats

# Vider le cache des posters
npm run poster:clear-cache

# Réactiver les sources désactivées
npm run poster:reset-sources

# Valider la santé des sources
npm run poster:validate

# Remettre à zéro les métriques
npm run poster:reset-metrics
```

### Utilisation Directe

```bash
# Utilisation directe du script
node scripts/poster-maintenance.js --stats
node scripts/poster-maintenance.js --validate-sources
node scripts/poster-maintenance.js --clear-cache
```

## Métriques Collectées

### Métriques Globales
- Nombre total de requêtes
- Nombre d'erreurs
- Temps de fonctionnement du système
- Utilisation mémoire

### Métriques par Source
- Nombre de requêtes totales/réussies/échouées
- Taux de réussite
- Temps de réponse moyen
- Échecs consécutifs
- État du circuit breaker
- État d'activation/désactivation

### Métriques du Cache
- Taille actuelle/maximale
- Nombre de hits/misses
- Taux de réussite du cache
- TTL configuré

## Maintenance Automatique

### Circuit Breaker
- Désactivation automatique après 10 échecs consécutifs
- Réactivation automatique après 30 minutes
- Test périodique en mode HALF_OPEN

### Rate Limiting
- Respect automatique des limites des APIs externes
- Ajustement dynamique en cas de dépassement
- Queue de requêtes avec priorités

## Surveillance Recommandée

### Alertes à Configurer
1. **Taux d'erreur élevé** (> 50% sur 5 minutes)
2. **Sources désactivées** (circuit breaker ouvert)
3. **Cache plein** (> 90% de la capacité)
4. **Temps de réponse élevé** (> 5 secondes en moyenne)

### Vérifications Périodiques
- Health check des sources (toutes les 5 minutes)
- Validation de la configuration (au démarrage)
- Nettoyage du cache (quotidien)
- Réinitialisation des métriques (hebdomadaire)

## Dépannage

### Sources Désactivées
```bash
# Vérifier l'état des sources
npm run poster:validate

# Réactiver les sources
npm run poster:reset-sources
```

### Cache Plein
```bash
# Vérifier l'état du cache
curl http://localhost:65094/monitoring/stats/cache

# Vider le cache si nécessaire
npm run poster:clear-cache
```

### Performance Dégradée
```bash
# Analyser les métriques de performance
curl http://localhost:65094/monitoring/stats/performance

# Remettre à zéro les métriques pour un nouveau départ
npm run poster:reset-metrics
```