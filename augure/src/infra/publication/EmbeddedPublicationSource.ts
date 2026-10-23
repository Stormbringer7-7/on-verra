// Publication on-verra embarquée dans l'app (assets/donnees, `npm run donnees`) : rien à héberger,
// l'app fonctionne dès l'installation. Même contrat que la publication HTTP : SHA-256, gzip.

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { gunzipSync } from 'fflate';

import {
  lireIndex,
  lireManifeste,
  type FichierPublie,
  type IndexPublication,
  type Manifeste,
  type PartitionPubliee,
} from '../../core/domain/publication';
import type { PublicationSource } from '../../core/ports';

export interface PartitionEmbarquee {
  manifeste: unknown;
  /** Octets de la base compressée (lecture dépendante de la plateforme). */
  base: () => Promise<Uint8Array>;
}

export class EmbeddedPublicationSource implements PublicationSource {
  readonly configured = true;
  private readonly i: IndexPublication;

  constructor(
    index: unknown,
    private readonly partitions: Record<string, PartitionEmbarquee>,
  ) {
    const lu = lireIndex(index);
    this.i = { ...lu, legislatures: lu.legislatures.filter((p) => p.legislature in partitions) };
  }

  async index(): Promise<IndexPublication> {
    return this.i;
  }

  async manifeste(p: PartitionPubliee): Promise<Manifeste> {
    // Seule la base complète est embarquée : jamais de correctif à appliquer.
    return { ...lireManifeste(this.embarquee(p).manifeste), correctifs: [] };
  }

  async telecharger(p: PartitionPubliee, f: FichierPublie): Promise<Uint8Array> {
    return gunzipSync(await this.telechargerCompresse(p, f));
  }

  async telechargerCompresse(p: PartitionPubliee, f: FichierPublie): Promise<Uint8Array> {
    const m = lireManifeste(this.embarquee(p).manifeste);
    if (f.fichier !== m.base.fichier) throw new Error(`${f.fichier} n'est pas embarqué dans l'app`);
    const octets = await this.embarquee(p).base();
    if (octets.length !== f.taille || bytesToHex(sha256(octets)) !== f.sha256) {
      throw new Error('Base embarquée corrompue (empreinte SHA-256 différente) : relancez `npm run donnees`');
    }
    return octets;
  }

  private embarquee(p: PartitionPubliee): PartitionEmbarquee {
    const e = this.partitions[p.legislature];
    if (!e) throw new Error(`La ${p.legislature}e législature n'est pas embarquée dans l'app`);
    return e;
  }
}
