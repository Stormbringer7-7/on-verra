// Lit la publication on-verra hébergée publiquement (service docker « donnees », GitHub Pages,
// bucket S3/R2…). Pas d'API : des fichiers statiques, vérifiés par leur SHA-256.
//
//   <url>/index.json   <url>/17/manifest.json   <url>/17/on_verra-3.db.gz   <url>/17/maj-2-3.sql.gz

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { gunzipSync } from 'fflate';

import {
  dossierPartition,
  lireIndex,
  lireManifeste,
  type FichierPublie,
  type IndexPublication,
  type Manifeste,
  type PartitionPubliee,
} from '../../core/domain/publication';
import type { PublicationSource } from '../../core/ports';

const TAILLE_MAX_JSON = 1_000_000;

export class HttpPublicationSource implements PublicationSource {
  private readonly racine: string;

  // `fetch` enveloppé : appelé comme méthode, il perdrait son `this` dans les navigateurs.
  constructor(
    url: string | undefined,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.racine = (url ?? '').trim().replace(/\/+$/, '');
    // Une adresse relative (« /donnees ») vise le même hôte que la version web.
    const local = this.racine.startsWith('/') || /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/|$)/.test(this.racine);
    if (this.racine && !this.racine.startsWith('https://') && !local) {
      throw new Error("L'adresse de publication doit être en HTTPS");
    }
  }

  get configured(): boolean {
    return this.racine !== '';
  }

  async index(): Promise<IndexPublication> {
    // Pas de cache HTTP : l'index et les manifestes annoncent les nouvelles versions.
    return lireIndex(await this.json('index.json'));
  }

  async manifeste(p: PartitionPubliee): Promise<Manifeste> {
    return lireManifeste(await this.json(p.manifeste));
  }

  async telecharger(p: PartitionPubliee, f: FichierPublie): Promise<Uint8Array> {
    return gunzipSync(await this.telechargerCompresse(p, f));
  }

  async telechargerCompresse(p: PartitionPubliee, f: FichierPublie): Promise<Uint8Array> {
    const octets = await this.lire(`${dossierPartition(p)}${f.fichier}`, f.taille);
    if (octets.length !== f.taille || bytesToHex(sha256(octets)) !== f.sha256) {
      throw new Error(`Fichier ${f.fichier} corrompu (empreinte SHA-256 différente)`);
    }
    return octets;
  }

  private async json(chemin: string): Promise<unknown> {
    return JSON.parse(new TextDecoder().decode(await this.lire(chemin, TAILLE_MAX_JSON, { cache: 'no-store' })));
  }

  private async lire(chemin: string, tailleMax: number, init?: RequestInit): Promise<Uint8Array> {
    const reponse = await this.fetcher(`${this.racine}/${chemin}`, init);
    if (!reponse.ok) throw new Error(`${chemin} : HTTP ${reponse.status}`);
    const annoncee = Number(reponse.headers.get('content-length') ?? 0);
    if (annoncee > tailleMax) throw new Error(`${chemin} : taille inattendue`);
    const octets = new Uint8Array(await reponse.arrayBuffer());
    if (octets.length > tailleMax) throw new Error(`${chemin} : taille inattendue`);
    return octets;
  }
}
