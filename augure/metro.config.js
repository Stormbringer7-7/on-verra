// expo-sqlite sur le web : SQLite en WebAssembly (wa-sqlite) dans un worker,
// qui a besoin de SharedArrayBuffer, donc d'une page isolée (COOP/COEP).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
// Base on-verra embarquée (assets/donnees/on_verra.db.gz).
config.resolver.assetExts.push('gz');

config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
