// poster-system/index.js
// Point d'entrée principal du système de fallback des posters

const PosterManager = require('./PosterManager');
const PosterSource = require('./interfaces/PosterSource');
const CacheService = require('./services/CacheService');
const FallbackChain = require('./services/FallbackChain');
const MetricsCollector = require('./services/MetricsCollector');

module.exports = {
  PosterManager,
  PosterSource,
  CacheService,
  FallbackChain,
  MetricsCollector
};