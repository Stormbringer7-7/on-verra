// Suite de tests de contrat, la même pour tous les adaptateurs des ports (mémoire, Postgres) :
// elle vérifie des règles, pas des valeurs. Le cœur est joué sur les dépôts fournis, à partir de
// commandes de départ (fixtures pour la mémoire) puis en suivant les identifiants rendus
// (dossier → étapes, articles, amendements, scrutins → « Pourquoi ce vote »…).
//
// Règles : réponse ou erreur propre (400, 404), provenance présente et complète, lien « à vérifier »
// sans cible, pagination cohérente et bornée, identifiant inconnu → 404 (fiche) ou null / vide
// (dépôt), synthèses null avec SansSynthese et toutes demandées au synthétiseur, entités retirées
// absentes, sortie JSON sans perte.

import { beforeAll, describe, expect, it } from 'vitest';

import type { Command } from '@contrat/commands/bus';
import type { Synthese, Systeme } from '@contrat/domain/model';

import { cleSujet } from '../../src/infra/memoire/donnees';
import { HorlogeFixe } from '../../src/infra/memoire/horloge';
import type { Depots, Horloge, SujetSynthese, Synthetiseur } from '../../src/ports';
import { NOMS, type NomCommande, a, chaines, commande, coreDeTest, differences, visiter } from '../support';

export interface Retiree {
  id: string;
  type: 'dossier' | 'personne' | 'amendement' | 'scrutin' | 'representant';
}

export interface OptionsSuite {
  /** Commandes jouées en plus de la navigation (les fixtures, pour l'adaptateur mémoire). */
  exemples?: Command[];
  /** Entités retirées de la source ou fusionnées, connues de l'adaptateur. */
  retirees?: () => Promise<Retiree[]>;
  horloge?: Horloge;
  /** Nombre de commandes jouées au plus. */
  max?: number;
}

/** Identifiant qui n'existe nulle part (UUID valide pour Postgres). */
export const INCONNU = '00000000-0000-4000-8000-000000000000';

const SYSTEMES: Record<Systeme, true> = { AN: true, SENAT: true, LEGIFRANCE: true, CONSTIT: true, HATVP: true, RNE: true, INSEE: true, CIVICTRACE: true };
const CERTAINES = ['identifiant_officiel', 'reference_explicite', 'revue_humaine'];
const INDICES = ['nom_et_dates', 'meme_sujet', 'meme_sujet_meme_periode', 'attribution_en_revue'];

/** Synthétiseur qui marque chaque champ demandé : la sortie dit où sont les synthèses. */
class Marqueur implements Synthetiseur {
  readonly demandes: SujetSynthese[] = [];
  async synthese(sujet: SujetSynthese): Promise<Synthese> {
    this.demandes.push(sujet);
    return `⟦${cleSujet(sujet)}⟧`;
  }
}

interface Resultat {
  nom: NomCommande;
  commande: Command;
  sortie?: unknown;
  erreur?: { statut?: number; message: string };
}

/** Commandes à jouer d'après une sortie : ce que l'écran permet d'ouvrir. */
function suivantes(nom: NomCommande, s: any): Command[] {
  const ids = (liste: { id: string }[] | undefined, n = 2) => (liste ?? []).slice(0, n).map((x) => x.id);
  switch (nom) {
    case 'ConsulterAccueil':
      return [...ids(s.dossiers).map((id) => commande('ConsulterDossier', { id })), ...ids(s.votes).map((id) => commande('ConsulterScrutin', { id }))];
    case 'ListerDossiers':
      return ids(s.dossiers.elements, 3).map((id) => commande('ConsulterDossier', { id }));
    case 'ConsulterDossier': {
      const id = s.entete.id as string;
      const cles = (s.etapes as { cle: string }[]).slice(0, 2).map((e) => e.cle);
      return [
        ...cles.map((cle) => commande('ConsulterEtape', { dossier: id, cle: cle as never })),
        ...cles.slice(0, 1).map((cle) => commande('ListerInterventions', { cible: { type: 'etape', dossier: id, cle: cle as never }, taille: 5 })),
        ...(s.articles as { article: { id: string } }[]).slice(0, 1).map((x) => commande('ConsulterArticle', { article: x.article.id })),
        ...ids(s.amendements.liste.elements, 1).map((x) => commande('ConsulterAmendement', { id: x })),
        commande('ConsulterDossier', { id, amendements: { sort: 'adopte', taille: 2 } }),
        ...ids(s.scrutins).map((x) => commande('ConsulterScrutin', { id: x })),
        ...(s.interets as { representant: { id: string } }[]).slice(0, 1).map((x) => commande('ConsulterRepresentant', { id: x.representant.id })),
      ];
    }
    case 'ConsulterAmendement':
      return [commande('ListerInterventions', { cible: { type: 'amendement', id: s.amendement.id } })];
    case 'ConsulterScrutin':
      return (s.votesDifferents.personnes as { personne: { id: string } }[])
        .slice(0, 1)
        .map((v) => commande('ExpliquerVote', { scrutin: s.scrutin.id, personne: v.personne.id }));
    case 'ListerPersonnes':
      return ids(s.personnes.elements).flatMap((id) =>
        (['parcours', 'choix', 'dossiers', 'declarations'] as const).map((onglet) => commande('ConsulterPersonne', { id, onglet })),
      );
    case 'Rechercher':
      return (s.sections as { type: string; resultats: { elements: { id: string }[] } }[]).flatMap((section): Command[] => {
        const id = section.resultats.elements[0]?.id;
        if (!id) return [];
        if (section.type === 'dossiers') return [commande('ConsulterDossier', { id })];
        if (section.type === 'personnes') return [commande('ConsulterPersonne', { id })];
        if (section.type === 'amendements') return [commande('ConsulterAmendement', { id })];
        if (section.type === 'scrutins') return [commande('ConsulterScrutin', { id })];
        return [commande('ConsulterRepresentant', { id })];
      });
    default:
      return [];
  }
}

const DEPART: Command[] = [
  commande('ConsulterAccueil', {}),
  commande('ListerDossiers', {}),
  commande('ListerDossiers', { origine: 'parlementaire', taille: 3 }),
  commande('ListerPersonnes', {}),
  commande('ListerPersonnes', { role: 'elu_local' }),
  commande('ClasserPersonnes', { chambre: 'AN', critere: 'ecarts', ordre: 'desc' }),
  commande('ConsulterInstitution', { institution: 'an' }),
  commande('ConsulterInstitution', { institution: 'senat' }),
  commande('ConsulterInstitution', { institution: 'gouvernement' }),
  commande('ConsulterInstitution', { institution: 'cc' }),
  commande('Rechercher', { q: 'énergie' }),
];

const cle = (c: Command) => `${c.type}:${JSON.stringify(c.input)}`;

/** Joue les commandes de départ puis celles qu'ouvrent leurs sorties, jusqu'à `max`. */
async function explorer(execute: (c: Command) => Promise<unknown>, depart: Command[], max: number): Promise<Resultat[]> {
  const file = [...depart];
  const vues = new Set<string>();
  const resultats: Resultat[] = [];
  while (file.length && resultats.length < max) {
    const c = file.shift()!;
    if (vues.has(cle(c))) continue;
    vues.add(cle(c));
    const nom = NOMS.get(c.type)!;
    try {
      const sortie = await execute(c);
      resultats.push({ nom, commande: c, sortie });
      file.push(...suivantes(nom, sortie));
    } catch (e) {
      resultats.push({ nom, commande: c, erreur: { statut: (e as { statut?: number }).statut, message: (e as Error).message } });
    }
  }
  return resultats;
}

function provenanceInvalide(p: unknown): string | null {
  if (!p || typeof p !== 'object') return 'absente';
  const { systeme, type, idNatif, url } = p as Record<string, unknown>;
  if (typeof systeme !== 'string' || !Object.hasOwn(SYSTEMES, systeme)) return `système inconnu (${String(systeme)})`;
  if (typeof type !== 'string' || !type) return 'type vide';
  if (typeof idNatif !== 'string' || !idNatif) return 'identifiant natif vide';
  if (url !== null && (typeof url !== 'string' || !/^https?:\/\//.test(url))) return `url invalide (${String(url)})`;
  return null;
}

export function suiteContrat(nom: string, fabrique: () => Depots, options: OptionsSuite = {}) {
  describe(`contrat · ${nom}`, () => {
    const horloge = options.horloge ?? new HorlogeFixe();
    let depots: Depots;
    let resultats: Resultat[];
    let reussis: (Resultat & { sortie: unknown })[];

    beforeAll(async () => {
      depots = fabrique();
      const bus = coreDeTest(depots, { horloge });
      resultats = await explorer((c) => bus.execute(c), [...(options.exemples ?? []), ...DEPART], options.max ?? 120);
      // TRACE_SUITE=1 : liste des commandes jouées et de leur statut.
      if (process.env.TRACE_SUITE) console.log(resultats.map((r) => `${r.erreur ? r.erreur.statut : 'ok '} ${r.commande.type} ${JSON.stringify(r.commande.input)}`).join('\n'));
      reussis = resultats.filter((r): r is Resultat & { sortie: unknown } => 'sortie' in r);
    });

    it('chaque commande répond, ou rend une erreur propre (400, 404)', () => {
      expect(reussis.length).toBeGreaterThan(10);
      for (const r of resultats.filter((x) => x.erreur)) {
        expect([400, 404], `${r.commande.type} ${JSON.stringify(r.commande.input)} : ${r.erreur!.message}`).toContain(r.erreur!.statut);
      }
      // Toutes les commandes de lecture ont été jouées au moins une fois avec succès.
      const jouees = new Set(reussis.map((r) => r.nom));
      for (const n of ['ConsulterAccueil', 'ListerDossiers', 'ConsulterDossier', 'ListerPersonnes', 'ConsulterPersonne', 'ConsulterInstitution', 'Rechercher'] as const) {
        expect(jouees, n).toContain(n);
      }
    });

    it('chaque fait porte une provenance complète', () => {
      for (const r of reussis) {
        visiter(r.sortie, (o, chemin) => {
          const ici = `${r.commande.type} ${chemin}`;
          if ('provenance' in o) {
            const liste = Array.isArray(o.provenance) ? o.provenance : [o.provenance];
            liste.forEach((p, i) => expect(provenanceInvalide(p), `${ici}.provenance[${i}]`).toBeNull());
          }
          if ('preuve' in o && o.preuve !== null) expect(provenanceInvalide(o.preuve), `${ici}.preuve`).toBeNull();
          if ('compteRendu' in o && o.compteRendu !== null) expect(provenanceInvalide(a(o, 'compteRendu.provenance')), `${ici}.compteRendu`).toBeNull();
          // Une case faite ou en cours du parcours est établie par au moins un acte publié.
          if ('facultative' in o && (o.etat === 'faite' || o.etat === 'en_cours')) expect((o.provenance as unknown[]).length, `${ici} (case ${String(o.cle)})`).toBeGreaterThan(0);
        });
        const s = r.sortie as Record<string, any>;
        if (r.nom === 'ConsulterDossier') expect(s.sources.length, 'sources du dossier').toBeGreaterThan(0);
        if (r.nom === 'ConsulterPersonne') expect(s.entete.provenance.length, 'provenance de la personne').toBeGreaterThan(0);
      }
    });

    it("un lien « à vérifier » n'expose jamais de cible, un lien vérifié dit comment", () => {
      for (const r of reussis) {
        visiter(r.sortie, (o, chemin) => {
          const ici = `${r.commande.type} ${chemin}`;
          if (o.statut === 'a_verifier') {
            expect(o, ici).not.toHaveProperty('cible');
            if ('rapprochement' in o) {
              expect(o, ici).toHaveProperty('candidat');
              expect(a(o, 'rapprochement.statut'), ici).toBe('a_verifier');
              expect(INDICES, ici).toContain(a(o, 'rapprochement.methode'));
              expect(String(a(o, 'rapprochement.avertissement') ?? ''), `${ici} : avertissement`).not.toBe('');
            }
          }
          if (o.statut === 'verifie') {
            expect(o, ici).not.toHaveProperty('candidat');
            if ('rapprochement' in o) {
              expect(o, ici).toHaveProperty('cible');
              expect(a(o, 'rapprochement.statut'), ici).toBe('verifie');
            }
            if ('methode' in o) expect(CERTAINES, ici).toContain(o.methode);
          }
        });
      }
    });

    it('pagination cohérente', () => {
      let pages = 0;
      for (const r of reussis) {
        visiter(r.sortie, (o, chemin) => {
          if (!Array.isArray(o.elements) || !('suivante' in o)) return;
          pages++;
          const ici = `${r.commande.type} ${chemin}`;
          const { page, taille, total, suivante, elements } = o as { page: number; taille: number; total: number | null; suivante: number | null; elements: unknown[] };
          expect(Number.isInteger(page) && page >= 1, `${ici} page`).toBe(true);
          expect(Number.isInteger(taille) && taille >= 1 && taille <= 100, `${ici} taille`).toBe(true);
          expect(elements.length, `${ici} éléments`).toBeLessThanOrEqual(taille);
          if (suivante !== null) expect(suivante, `${ici} suivante`).toBe(page + 1);
          if (total !== null) {
            expect(total, `${ici} total`).toBeGreaterThanOrEqual((page - 1) * taille + elements.length);
            expect(suivante !== null, `${ici} suivante ⇔ il reste des éléments`).toBe(page * taille < total);
          }
        });
      }
      expect(pages).toBeGreaterThan(0);
    });

    it('pagination bornée par le cœur (page ≥ 1, taille ≤ 100)', async () => {
      const bus = coreDeTest(depots, { horloge });
      const representant = reussis.find((r) => r.nom === 'ConsulterRepresentant')?.commande.input as { id: string } | undefined;
      const dossier = reussis.find((r) => r.nom === 'ConsulterDossier')?.commande.input as { id: string } | undefined;
      const demandes: Command[] = [
        commande('ListerDossiers', { page: 0, taille: 1000 }),
        commande('ListerPersonnes', { page: -3, taille: 0 }),
        commande('Rechercher', { q: 'énergie', type: 'dossiers', taille: 1000 }),
        ...(dossier ? [commande('ConsulterDossier', { id: dossier.id, amendements: { page: 0, taille: 1000 } })] : []),
        ...(representant ? [commande('ConsulterRepresentant', { id: representant.id, page: 0, taille: 1000 })] : []),
      ];
      for (const c of demandes) {
        const sortie = await bus.execute(c);
        visiter(sortie, (o, chemin) => {
          if (!Array.isArray(o.elements) || !('suivante' in o)) return;
          expect(o.page, `${c.type} ${chemin}`).toBeGreaterThanOrEqual(1);
          expect(o.taille, `${c.type} ${chemin}`).toBeGreaterThanOrEqual(1);
          expect(o.taille, `${c.type} ${chemin}`).toBeLessThanOrEqual(100);
        });
      }
    });

    it('identifiant inconnu : 404 pour une fiche, null ou vide pour un dépôt', async () => {
      const bus = coreDeTest(depots, { horloge });
      const fiches: Command[] = [
        commande('ConsulterDossier', { id: INCONNU }),
        commande('ConsulterEtape', { dossier: INCONNU, cle: 'depot' }),
        commande('ConsulterArticle', { article: INCONNU }),
        commande('ConsulterAmendement', { id: INCONNU }),
        commande('ConsulterScrutin', { id: INCONNU }),
        commande('ExpliquerVote', { scrutin: INCONNU, personne: INCONNU }),
        commande('ConsulterPersonne', { id: INCONNU }),
        commande('ConsulterRepresentant', { id: INCONNU }),
        commande('ListerInterventions', { cible: { type: 'amendement', id: INCONNU } }),
      ];
      for (const c of fiches) await expect(bus.execute(c), c.type).rejects.toMatchObject({ statut: 404 });

      const { dossiers, scrutins, discussions, personnes, transparence } = depots;
      const pagination = { page: 1, taille: 20 };
      for (const fiche of [
        dossiers.entete(INCONNU),
        dossiers.parcours(INCONNU),
        dossiers.barre(INCONNU),
        dossiers.etape(INCONNU, 'depot'),
        dossiers.article(INCONNU, null, 'precedente'),
        dossiers.amendement(INCONNU),
        scrutins.fiche(INCONNU),
        scrutins.vote(INCONNU, INCONNU),
        scrutins.surAmendement(INCONNU),
        personnes.entete(INCONNU),
        transparence.representant(INCONNU, pagination),
        discussions.interventions({ type: 'reunion', id: INCONNU }, pagination),
      ]) {
        expect(await fiche).toBeNull();
      }
      for (const liste of [
        dossiers.etapes(INCONNU),
        dossiers.ceQuiAChange(INCONNU),
        dossiers.acteurs(INCONNU),
        dossiers.chiffres(INCONNU),
        dossiers.sources(INCONNU),
        scrutins.duDossier(INCONNU),
        scrutins.derniersEcarts(INCONNU, 5),
        personnes.fonctions(INCONNU),
        personnes.roles(INCONNU),
        personnes.actesSurLeDossier(INCONNU, INCONNU),
        transparence.declarations(INCONNU),
        transparence.declarationsResumees(INCONNU),
        transparence.interetsDe({ type: 'dossier', id: INCONNU }),
        discussions.avantLeVote(INCONNU, INCONNU, 5),
      ]) {
        expect(await liste).toEqual([]);
      }
      expect((await dossiers.articles(INCONNU)).articles).toEqual([]);
      expect((await dossiers.amendements(INCONNU, {}, pagination)).liste.elements).toEqual([]);
      expect((await discussions.surAmendement(INCONNU, 5)).extraits).toEqual([]);
      expect((await discussions.intervenants(INCONNU, 'depot', 5)).intervenants).toEqual([]);
    });

    it('entrée mal formée : 400', async () => {
      const bus = coreDeTest(depots, { horloge });
      const mauvaises: Command[] = [
        commande('ConsulterDossier', {} as never),
        commande('ConsulterEtape', { dossier: INCONNU, cle: 'nulle_part' as never }),
        commande('ListerDossiers', { etat: 'oublie' as never }),
        commande('ConsulterInstitution', { institution: 'elysee' as never }),
        commande('ListerInterventions', { cible: { type: 'rumeur' } as never }),
        commande('SignalerErreur', { cible: { type: 'dossier', id: null }, message: '   ' }),
      ];
      for (const c of mauvaises) {
        await expect(bus.execute(c), c.type).rejects.toMatchObject({ statut: 400 });
      }
    });

    it('synthèses : null avec SansSynthese, et chacune demandée au synthétiseur', async () => {
      const marqueur = new Marqueur();
      const bus = coreDeTest(depots, { horloge, synthetiseur: marqueur });
      let marquees = 0;
      for (const r of reussis) {
        if (r.nom === 'SignalerErreur') continue;
        const marquee = await bus.execute(r.commande);
        for (const chemin of differences(r.sortie, marquee)) {
          expect(a(r.sortie, chemin), `${r.commande.type} ${chemin}`).toBeNull();
          expect(String(a(marquee, chemin)), `${r.commande.type} ${chemin}`).toMatch(/^⟦.*⟧$/);
          marquees++;
        }
        expect(chaines(r.sortie).some((t) => t.startsWith('⟦')), r.commande.type).toBe(false);
      }
      expect(marquees).toBeGreaterThan(0);
      expect(marqueur.demandes.length).toBe(marquees);
    });

    it('entités retirées ou fusionnées : ni rendues, ni consultables', async () => {
      const retirees = (await options.retirees?.()) ?? [];
      const ids = new Set(retirees.map((r) => r.id));
      for (const r of reussis) {
        for (const t of chaines(r.sortie)) expect(ids.has(t), `${r.commande.type} cite ${t}`).toBe(false);
      }
      const bus = coreDeTest(depots, { horloge });
      const fiche = ({ id, type }: Retiree): Command =>
        type === 'dossier'
          ? commande('ConsulterDossier', { id })
          : type === 'personne'
            ? commande('ConsulterPersonne', { id })
            : type === 'amendement'
              ? commande('ConsulterAmendement', { id })
              : type === 'scrutin'
                ? commande('ConsulterScrutin', { id })
                : commande('ConsulterRepresentant', { id });
      for (const r of retirees) await expect(bus.execute(fiche(r)), `${r.type} ${r.id}`).rejects.toMatchObject({ statut: 404 });
    });

    it('sorties sérialisables en JSON sans perte (ni undefined, ni Date)', () => {
      for (const r of reussis) expect(JSON.parse(JSON.stringify(r.sortie)), r.commande.type).toStrictEqual(r.sortie);
    });
  });
}
