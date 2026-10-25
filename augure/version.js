// Version de l'app : version.json donne majeure.mineure.devpatch (x.X.D). Lue par app.config.js
// (prebuild) et par scripts/app.mjs (apply, build), pour que les deux écrivent les mêmes numéros.

const fs = require('node:fs');
const path = require('node:path');

const FICHIER = path.join(__dirname, 'version.json');

function lireVersion() {
  const { version } = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  const morceaux = String(version).split('.').map(Number);
  if (morceaux.length !== 3 || morceaux.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`version.json : « ${version} » n'est pas de la forme majeure.mineure.devpatch`);
  }
  const [majeure, mineure, devpatch] = morceaux;
  return { majeure, mineure, devpatch };
}

function ecrireVersion({ majeure, mineure, devpatch }) {
  fs.writeFileSync(FICHIER, `${JSON.stringify({ version: `${majeure}.${mineure}.${devpatch}` })}\n`);
}

/** x.X.D : version iOS (CFBundleShortVersionString et CFBundleVersion, chiffres seulement). */
const texteVersion = ({ majeure, mineure, devpatch }) => `${majeure}.${mineure}.${devpatch}`;

/** versionName Android : x.X.D, suivi de l'environnement s'il n'est pas celui par défaut (.env). */
const nomVersion = (v, env) => (env ? `${texteVersion(v)}-${env}` : texteVersion(v));

/** versionCode Android, croissant : MMmmDDDD (mineure < 100, devpatch < 10 000). */
function codeVersion({ majeure, mineure, devpatch }) {
  if (mineure >= 100 || devpatch >= 10000) throw new Error('versionCode : mineure < 100 et devpatch < 10 000');
  return majeure * 1000000 + mineure * 10000 + devpatch;
}

module.exports = { lireVersion, ecrireVersion, texteVersion, nomVersion, codeVersion };
