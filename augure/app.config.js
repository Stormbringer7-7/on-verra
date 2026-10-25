// Complète app.json pour le prebuild : version (version.json) et identifiant de l'app (APP_ID du
// fichier .env choisi par scripts/app.mjs). Sans APP_ID, le prebuild le demande.

const { lireVersion, texteVersion, codeVersion } = require('./version');

module.exports = ({ config }) => {
  const v = lireVersion();
  const id = process.env.APP_ID;
  return {
    ...config,
    version: texteVersion(v),
    ios: { ...config.ios, buildNumber: texteVersion(v), ...(id && { bundleIdentifier: id }) },
    android: { ...config.android, versionCode: codeVersion(v), ...(id && { package: id }) },
  };
};
