// Complète app.json pour le prebuild : version (version.json) et identifiant de l'app (APP_ID du
// fichier .env choisi par scripts/app.mjs). Sans APP_ID, le prebuild le demande.

const { withAndroidManifest } = require('expo/config-plugins');
const { lireVersion, texteVersion, codeVersion } = require('./version');

// API en http:// (serveur de test sur le réseau local) : Android refuse le trafic non chiffré en
// release sans usesCleartextTraffic. Jamais pour une API en https://.
const avecHttpClair = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return c;
  });

module.exports = ({ config }) => {
  const v = lireVersion();
  const id = process.env.APP_ID;
  const complete = {
    ...config,
    version: texteVersion(v),
    ios: { ...config.ios, buildNumber: texteVersion(v), ...(id && { bundleIdentifier: id }) },
    android: { ...config.android, versionCode: codeVersion(v), ...(id && { package: id }) },
  };
  return process.env.EXPO_PUBLIC_API_URL?.startsWith('http://') ? avecHttpClair(complete) : complete;
};
