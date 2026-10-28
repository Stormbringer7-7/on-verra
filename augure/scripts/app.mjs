#!/usr/bin/env node
// Configurer, lancer et construire l'app par environnement : .env.<env> (défaut : .env).
// Seul ce fichier est lu (EXPO_NO_DOTENV) : aucune variable d'un autre .env ne s'y mêle.
// Les dossiers ios/ et android/ sont générés (prebuild), jamais modifiés à la main, sauf la
// version qu'écrit `apply`. Voir `node scripts/app.mjs aide`.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { lireVersion, ecrireVersion, texteVersion, nomVersion, codeVersion } = createRequire(import.meta.url)('../version.js');
const ETAT = path.join(RACINE, '.expo', 'augure.json');
/** Port de Metro : pas 8081, pris par le service Docker « publication » (127.0.0.1:8081), sur
 * lequel l'émulateur Android (10.0.2.2, IPv4) tomberait au lieu de Metro. */
const PORT = Number(process.env.METRO_PORT) || 8090;
const CIBLES = ['ios', 'android', 'web'];
/** Builds acceptés, et la cible qu'ils construisent ; `ios` et `android` valent leur build de publication. */
const BUILDS = { aab: 'android', apk: 'android', xcarchive: 'ios', web: 'web' };
/** Tâche Gradle et fichier produit (sous android/app/build/outputs) de chaque build Android. */
const GRADLE = {
  aab: { tache: 'bundleRelease', fichier: ['bundle', 'release', 'app-release.aab'] },
  apk: { tache: 'assembleRelease', fichier: ['apk', 'release', 'app-release.apk'] },
};
const ALIAS_BUILDS = { android: 'aab', ios: 'xcarchive' };

const AIDE = `Usage : npm run app -- <commande> [--env=<env>] …

  serve   --env=<env>                         lance seulement Expo (Metro)
  devices [ios|android] [--all]               appareils physiques, simulateurs et émulateurs
                                              (--all : simulateurs de toutes les versions d'iOS)
  run     --env=<env> <ios|android|web> [--device=<nom|id>] [--all]
                                              lance l'app sur la cible (Expo démarré si besoin) ;
                                              sans --device : choix dans la liste des appareils
  prebuild --env=<env> [ios|android]          régénère ios/ et android/
  apply   --env=<env> version                 écrit la version et applique la version dans version.json
  apply   --env=<env> patch                   devpatch + 1, écrit la version (version.json, ios/, android/)
  apply   --env=<env> minor                   mineure + 1, devpatch à 0
  apply   --env=<env> major                   majeure + 1, mineure et devpatch à 0
  build   --env=<env> <aab|apk|xcarchive|web>…
                                              apply version, puis chaque build dans dist/<env>/<version>/

<env> : fichier .env.<env> ; sans --env, .env. Versions : x.X.D, versionName Android x.X.D-<env>.`;

// ── Arguments ────────────────────────────────────────────────────────────────────────────────

function lireArguments(argv) {
  const options = {};
  const positions = [];
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) options[m[1]] = m[2] ?? true;
    else positions.push(a);
  }
  return { commande: positions[0], positions: positions.slice(1), options };
}

function echec(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

// ── Environnement ────────────────────────────────────────────────────────────────────────────

/** Variables du fichier .env choisi, plus EXPO_NO_DOTENV et APP_ENV (nom de l'env, vide par défaut). */
function chargerEnv(env) {
  const fichier = env ? `.env.${env}` : '.env';
  const chemin = path.join(RACINE, fichier);
  if (!fs.existsSync(chemin)) {
    if (env) echec(`${fichier} introuvable (modèle : .env.example)`);
    console.warn('! .env absent : variables de l’environnement du shell seulement (modèle : .env.example)');
  }
  const variables = {};
  if (fs.existsSync(chemin)) {
    for (const ligne of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(ligne);
      if (!m || ligne.trimStart().startsWith('#')) continue;
      variables[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  console.log(`● env ${env ?? '(défaut)'} : ${fichier}${variables.EXPO_PUBLIC_API_URL ? ` · API ${variables.EXPO_PUBLIC_API_URL}` : ''}`);
  return { ...process.env, ...variables, EXPO_NO_DOTENV: '1', APP_ENV: env ?? '' };
}

// ── Utilitaires ──────────────────────────────────────────────────────────────────────────────

function lancer(commande, args, { env, cwd = RACINE } = {}) {
  console.log(`$ ${[commande, ...args].join(' ')}`);
  const r = spawnSync(commande, args, { stdio: 'inherit', env, cwd });
  if (r.error) echec(`${commande} : ${r.error.message}`);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const lireEtat = () => (fs.existsSync(ETAT) ? JSON.parse(fs.readFileSync(ETAT, 'utf8')) : {});
function ecrireEtat(modif) {
  fs.mkdirSync(path.dirname(ETAT), { recursive: true });
  fs.writeFileSync(ETAT, `${JSON.stringify({ ...lireEtat(), ...modif }, null, 2)}\n`);
}

async function metroActif() {
  try {
    const r = await fetch(`http://localhost:${PORT}/status`, { signal: AbortSignal.timeout(1000) });
    return (await r.text()).includes('packager-status:running');
  } catch {
    return false;
  }
}

/** Seul fichier d'un motif dans un dossier (ex. le .xcworkspace de ios/). */
function trouver(dossier, filtre) {
  const noms = fs.existsSync(dossier) ? fs.readdirSync(dossier).filter(filtre) : [];
  return noms.length === 1 ? path.join(dossier, noms[0]) : undefined;
}

// ── Appareils ────────────────────────────────────────────────────────────────────────────────

const SDK_ANDROID = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), 'Library', 'Android', 'sdk');
const outilAndroid = (dossier, nom) => {
  const chemin = path.join(SDK_ANDROID, dossier, nom);
  return fs.existsSync(chemin) ? chemin : nom;
};

/** Sortie d'une commande, ou '' si elle manque ou échoue (outil absent : aucun appareil de ce type). */
function lire(commande, args) {
  const r = spawnSync(commande, args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}

/**
 * Appareils iOS : physiques (devicectl, Xcode 15+), simulateurs démarrés, puis éteints : ceux de
 * l'iOS le plus récent seulement, sauf `tous`. `id` est l'UDID, accepté par `expo run:ios --device`.
 */
function appareilsIos(tous) {
  const physiques = [];
  const fichier = path.join(os.tmpdir(), `augure-devicectl-${process.pid}.json`);
  if (spawnSync('xcrun', ['devicectl', 'list', 'devices', '--json-output', fichier], { stdio: 'ignore' }).status === 0) {
    for (const d of JSON.parse(fs.readFileSync(fichier, 'utf8')).result?.devices ?? []) {
      if (d.hardwareProperties?.platform !== 'iOS' || !d.hardwareProperties?.udid) continue;
      const c = d.connectionProperties ?? {};
      const etat = c.tunnelState === 'connected' ? (c.transportType === 'wired' ? 'branché' : 'réseau') : 'non connecté';
      physiques.push({ id: d.hardwareProperties.udid, nom: d.deviceProperties?.name ?? d.hardwareProperties.udid, type: 'appareil', etat });
    }
    fs.rmSync(fichier, { force: true });
  }
  const simulateurs = [];
  const liste = lire('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  for (const [runtime, ds] of Object.entries(liste ? JSON.parse(liste).devices : {})) {
    const version = /iOS-(\d+)-(\d+)/.exec(runtime);
    if (!version) continue;
    const ordre = Number(version[1]) * 100 + Number(version[2]);
    for (const d of ds) {
      simulateurs.push({ id: d.udid, nom: `${d.name} (iOS ${version[1]}.${version[2]})`, type: 'simulateur', etat: d.state === 'Booted' ? 'démarré' : 'éteint', ordre });
    }
  }
  const recent = Math.max(0, ...simulateurs.map((s) => s.ordre));
  const demarres = simulateurs.filter((s) => s.etat === 'démarré');
  const eteints = simulateurs.filter((s) => s.etat !== 'démarré' && (tous || s.ordre === recent));
  return [...physiques, ...demarres, ...eteints];
}

/**
 * Appareils Android : branchés et émulateurs démarrés (adb), puis AVD éteints (Expo les démarre).
 * `id` est le numéro de série adb, ou le nom de l'AVD : les deux acceptés par `expo run:android --device`.
 */
function appareilsAndroid() {
  const adb = outilAndroid('platform-tools', 'adb');
  const branches = [];
  const demarres = new Set();
  for (const ligne of lire(adb, ['devices', '-l']).split('\n').slice(1)) {
    const [serie, etat] = ligne.trim().split(/\s+/);
    if (!serie) continue;
    if (serie.startsWith('emulator-')) {
      const avd = lire(adb, ['-s', serie, 'emu', 'avd', 'name']).split('\n')[0].trim();
      demarres.add(avd);
      branches.push({ id: serie, nom: avd || serie, type: 'émulateur', etat: etat === 'device' ? 'démarré' : etat });
    } else {
      const modele = /model:(\S+)/.exec(ligne)?.[1]?.replaceAll('_', ' ') ?? serie;
      branches.push({ id: serie, nom: modele, type: 'appareil', etat: etat === 'device' ? 'branché' : etat });
    }
  }
  const eteints = lire(outilAndroid('emulator', 'emulator'), ['-list-avds'])
    .split('\n').map((l) => l.trim()).filter((avd) => avd && !demarres.has(avd) && !avd.startsWith('INFO'))
    .map((avd) => ({ id: avd, nom: avd, type: 'émulateur', etat: 'éteint' }));
  // Appareils physiques d'abord, puis émulateurs démarrés, puis éteints.
  branches.sort((a, b) => (a.type === 'appareil' ? 0 : 1) - (b.type === 'appareil' ? 0 : 1));
  return [...branches, ...eteints];
}

const appareils = (cible, tous) => (cible === 'ios' ? appareilsIos(tous) : appareilsAndroid());
const ligneAppareil = (a, i) => `  ${String(i + 1).padStart(2)}. ${a.nom.padEnd(42)} ${a.type}, ${a.etat}`;

function devices(cibles, tous) {
  for (const cible of cibles) {
    const liste = appareils(cible, tous);
    console.log(`${cible} :`);
    console.log(liste.length ? liste.map(ligneAppareil).join('\n') : '  (aucun)');
  }
}

/** Appareil de `run` : celui de --device=<nom|id>, le seul disponible, ou celui choisi dans la liste. */
async function choisirAppareil(cible, device, tous) {
  if (typeof device === 'string') return device;
  const liste = appareils(cible, tous);
  if (!liste.length) echec(`aucun appareil ${cible} : brancher un appareil, ou créer un simulateur / émulateur`);
  if (liste.length === 1) return liste[0].id;
  console.log(`Appareils ${cible} :\n${liste.map(ligneAppareil).join('\n')}`);
  if (!process.stdin.isTTY) echec('plusieurs appareils : préciser --device=<nom ou identifiant>');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const reponse = (await rl.question(`Numéro [1] : `)).trim() || '1';
      const choisi = liste[Number(reponse) - 1];
      if (choisi) return choisi.id;
    }
  } finally {
    rl.close();
  }
}

// ── Prebuild et version ──────────────────────────────────────────────────────────────────────

/** Régénère le dossier natif s'il manque ou vient d'un autre env (identifiant d'app différent). */
function assurerPrebuild(cible, env, variables) {
  const fait = lireEtat().prebuild?.[cible];
  if (fs.existsSync(path.join(RACINE, cible)) && fait === (env ?? '')) return;
  prebuild([cible], env, variables);
}

function prebuild(cibles, env, variables) {
  const inconnue = cibles.find((c) => c !== 'ios' && c !== 'android');
  if (inconnue) echec(`prebuild : « ${inconnue} » inconnue (ios, android)`);
  // Le prebuild réécrit les scripts « android » et « ios » de package.json : on le remet tel quel.
  const paquet = fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8');
  try {
    for (const cible of cibles) {
      lancer('npx', ['expo', 'prebuild', '--platform', cible], { env: variables });
      ecrireEtat({ prebuild: { ...lireEtat().prebuild, [cible]: env ?? '' } });
    }
  } finally {
    fs.writeFileSync(path.join(RACINE, 'package.json'), paquet);
  }
  appliquerVersion(lireVersion(), env);
}

function remplacer(fichier, remplacements) {
  if (!fs.existsSync(fichier)) return false;
  let texte = fs.readFileSync(fichier, 'utf8');
  for (const [motif, valeur] of remplacements) texte = texte.replace(motif, valeur);
  fs.writeFileSync(fichier, texte);
  return true;
}

/** Écrit la version dans les dossiers natifs présents (le prebuild la reprend de app.config.js). */
function appliquerVersion(v, env) {
  const ios = texteVersion(v);
  const android = { nom: nomVersion(v, env), code: codeVersion(v) };
  const gradle = path.join(RACINE, 'android', 'app', 'build.gradle');
  if (remplacer(gradle, [[/versionCode \d+/, `versionCode ${android.code}`], [/versionName "[^"]*"/, `versionName "${android.nom}"`]])) {
    console.log(`  android : versionName ${android.nom}, versionCode ${android.code}`);
  }
  const dossierIos = path.join(RACINE, 'ios');
  const projet = trouver(dossierIos, (n) => n.endsWith('.xcodeproj'));
  if (projet) {
    const nom = path.basename(projet, '.xcodeproj');
    const cle = (k) => new RegExp(`(<key>${k}</key>\\s*<string>)[^<]*(</string>)`);
    remplacer(path.join(dossierIos, nom, 'Info.plist'), [
      [cle('CFBundleShortVersionString'), `$1${ios}$2`],
      [cle('CFBundleVersion'), `$1${ios}$2`],
    ]);
    // Si l'Info.plist renvoie à $(MARKETING_VERSION) et $(CURRENT_PROJECT_VERSION).
    remplacer(path.join(projet, 'project.pbxproj'), [
      [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${ios};`],
      [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${ios};`],
    ]);
    console.log(`  ios : ${ios}`);
  }
}

function apply(quoi, env) {
  const avant = lireVersion();
  let v = avant;

  if (!quoi || quoi === 'version') {
    // Appliquer uniquement
  } else {
    if (quoi === 'patch') quoi = 'devpatch';
    const suivante = {
      devpatch: { ...v, devpatch: v.devpatch + 1 },
      minor: { ...v, mineure: v.mineure + 1, devpatch: 0 },
      major: { majeure: v.majeure + 1, mineure: 0, devpatch: 0 },
    }[quoi];

    if (!suivante) echec(`apply : « ${quoi ?? ''} » inconnu (version, minor ou major)`);
    v = suivante;
  }

  ecrireVersion(v);
  console.log(`● version ${texteVersion(avant)} → ${texteVersion(v)}`);
  appliquerVersion(v, env);
  return v;
}

// ── Commandes ────────────────────────────────────────────────────────────────────────────────

function serve(env, variables, extra = []) {
  ecrireEtat({ serve: env ?? '' });
  try {
    lancer('npx', ['expo', 'start', '--port', String(PORT), ...extra], { env: variables });
  } finally {
    ecrireEtat({ serve: null });
  }
}

async function run(cible, env, variables, device, tous) {
  if (!CIBLES.includes(cible)) echec(`run : cible « ${cible ?? ''} » inconnue (${CIBLES.join(', ')})`);
  const actif = await metroActif();
  if (actif) {
    const servi = lireEtat().serve;
    if (servi != null && servi !== (env ?? '')) {
      echec(`Expo tourne déjà avec l’env « ${servi || '(défaut)'} » : l’arrêter, ou relancer avec --env=${servi}`);
    }
  }
  if (cible === 'web') {
    if (actif) lancer('open', [`http://localhost:${PORT}`]);
    else serve(env, variables, ['--web']);
    return;
  }
  const appareil = await choisirAppareil(cible, device, tous);
  assurerPrebuild(cible, env, variables);
  const args = ['expo', `run:${cible}`, '--port', String(PORT), '--device', appareil];
  if (actif) args.push('--no-bundler');
  else ecrireEtat({ serve: env ?? '' });
  try {
    lancer('npx', args, { env: variables });
  } finally {
    if (!actif) ecrireEtat({ serve: null });
  }
}

function build(demandes, env, variables) {
  const builds = demandes.map((b) => ALIAS_BUILDS[b] ?? b);
  const inconnu = builds.find((b) => !BUILDS[b]);
  if (!builds.length || inconnu) echec(`build : « ${inconnu ?? ''} » inconnu (${Object.keys(BUILDS).join(', ')})`);
  for (const b of builds) if (BUILDS[b] !== 'web') assurerPrebuild(BUILDS[b], env, variables);
  const v = apply('version', env);
  const nom = nomVersion(v, env);
  const sortie = path.join(RACINE, 'dist', env ?? 'defaut', nom);
  fs.mkdirSync(sortie, { recursive: true });

  for (const b of builds) {
    if (b === 'web') {
      lancer('npx', ['expo', 'export', '--platform', 'web', '--output-dir', path.join(sortie, 'web')], { env: variables });
    } else if (GRADLE[b]) {
      // .aab pour le Play Store, .apk à installer directement (adb install, partage) ; signés avec la
      // clé de debug du modèle Expo tant qu'aucune clé de publication n'est configurée.
      const { tache, fichier } = GRADLE[b];
      lancer('./gradlew', [tache], { env: variables, cwd: path.join(RACINE, 'android') });
      fs.copyFileSync(path.join(RACINE, 'android', 'app', 'build', 'outputs', ...fichier), path.join(sortie, `augure-${nom}.${b}`));
    } else if (b === 'xcarchive') {
      const espace = trouver(path.join(RACINE, 'ios'), (n) => n.endsWith('.xcworkspace'));
      if (!espace) echec('ios/*.xcworkspace introuvable : relancer `prebuild --env=… ios`');
      const equipe = variables.APPLE_TEAM_ID ? [`DEVELOPMENT_TEAM=${variables.APPLE_TEAM_ID}`, '-allowProvisioningUpdates'] : [];
      const archive = path.join(sortie, `augure-${nom}.xcarchive`);
      lancer(
        'xcodebuild',
        ['-workspace', espace, '-scheme', path.basename(espace, '.xcworkspace'), '-configuration', 'Release',
          '-destination', 'generic/platform=iOS', '-archivePath', archive, 'archive', ...equipe],
        { env: variables },
      );
      // L'organiseur de Xcode (Window › Organizer : valider, distribuer) ne lit que ce dossier.
      const organiseur = path.join(os.homedir(), 'Library', 'Developer', 'Xcode', 'Archives', new Date().toISOString().slice(0, 10));
      fs.mkdirSync(organiseur, { recursive: true });
      lancer('ditto', [archive, path.join(organiseur, path.basename(archive))]);
    }
  }
  console.log(`✔ ${builds.join(', ')} → ${path.relative(RACINE, sortie)}`);
}

// ── Entrée ───────────────────────────────────────────────────────────────────────────────────

const { commande, positions, options } = lireArguments(process.argv.slice(2));
const env = typeof options.env === 'string' && options.env ? options.env : undefined;
if (!commande || ['aide', 'help', '-h'].includes(commande) || options.help) {
  console.log(AIDE);
  process.exit(0);
}
const variables = chargerEnv(env);

switch (commande) {
  case 'serve':
    serve(env, variables);
    break;
  case 'run':
    await run(positions[0], env, variables, options.device, Boolean(options.all));
    break;
  case 'devices':
    devices(positions.length ? positions : ['ios', 'android'], Boolean(options.all));
    break;
  case 'prebuild':
    prebuild(positions.length ? positions : ['ios', 'android'], env, variables);
    break;
  case 'apply':
    apply(positions[0], env);
    break;
  case 'build':
    build(positions, env, variables);
    break;
  default:
    echec(`commande « ${commande} » inconnue\n\n${AIDE}`);
}
