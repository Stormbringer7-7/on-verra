// Sert le dossier de publication on-verra en local, comme le ferait l'hébergement public
// (fichiers statiques + CORS pour la version web). Pour le développement uniquement.
//
//   npm run publication              # http://localhost:8787 → ../../on-verra/publication
//   PORT=9000 npm run publication -- /autre/dossier

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = fileURLToPath(new URL('.', import.meta.url));
const dossier = resolve(process.argv[2] ?? join(ici, '../../on-verra/publication'));
const port = Number(process.env.PORT ?? 8787);
// courante.db sert à calculer le prochain correctif : on-verra recommande de ne pas l'héberger.
const servis = /^(manifest\.json|on_verra-\d+\.db\.gz|maj-\d+-\d+\.sql\.gz)$/;

if (!existsSync(join(dossier, 'manifest.json'))) {
  console.error(`Pas de manifest.json dans ${dossier}.\nDans on-verra/ : python3 -m on_verra importer && python3 -m on_verra publier`);
  process.exit(1);
}

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const nom = basename(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  const chemin = join(dossier, nom);
  if (req.method !== 'GET' || !servis.test(nom) || !existsSync(chemin)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': nom.endsWith('.json') ? 'application/json' : 'application/gzip',
    'Content-Length': statSync(chemin).size,
    'Cache-Control': nom === 'manifest.json' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(chemin).pipe(res);
}).listen(port, () => console.log(`Publication on-verra : http://localhost:${port} (${dossier})`));
