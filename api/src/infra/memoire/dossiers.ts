// Adaptateur mémoire de DossiersRepository : les dossiers des fixtures (Accueil, liste, fiches,
// étapes, articles, amendements), sans synthèses. Les listes gardent l'ordre des fixtures.

import type {
  AmendementResume,
  CaseCompacte,
  CleCase,
  DossierRef,
  DossierResume,
  FicheDossier,
  FiltreDossiers,
  SortAmendement,
} from '@contrat/domain/model';

import type { DossiersRepository, Pagination } from '../../ports';
import { type DonneesMemoire, paginer, premier } from './donnees';

export class DossiersMemoire implements DossiersRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  private async fiche(id: string): Promise<FicheDossier | null> {
    const { exemples } = await this.donnees;
    return premier(exemples.ConsulterDossier, (e) => e.output.entete.id === id)?.output ?? null;
  }

  /** Tous les résumés connus : la liste complète, l'Accueil, les textes du Gouvernement. */
  private async resumes(): Promise<DossierResume[]> {
    const { exemples } = await this.donnees;
    const tous = [
      ...exemples.ListerDossiers.flatMap((e) => e.output.dossiers.elements),
      ...exemples.ConsulterAccueil.flatMap((e) => e.output.dossiers),
      ...exemples.ConsulterInstitution.flatMap((e) => (e.output.type === 'gouvernement' ? e.output.textesDeposes.dossiers : [])),
    ];
    return tous.filter((d, i) => tous.findIndex((x) => x.id === d.id) === i);
  }

  async aSuivre(limite: number) {
    const { exemples } = await this.donnees;
    return (exemples.ConsulterAccueil[0]?.output.dossiers ?? []).slice(0, limite);
  }

  async lister(filtre: FiltreDossiers, pagination: Pagination) {
    const { exemples } = await this.donnees;
    // La liste complète : l'exemple sans filtre. Facettes : sur la législature, sans les filtres.
    const complet = premier(exemples.ListerDossiers, (e) => !e.input.etat && !e.input.origine && !e.input.theme)?.output;
    const legislature = filtre.legislature ?? '17';
    const dossiers = (legislature === (complet?.legislature ?? '17') ? (complet?.dossiers.elements ?? []) : []).filter(
      (d) =>
        (!filtre.etat || d.etat === filtre.etat) &&
        (!filtre.origine || d.origine === filtre.origine) &&
        (!filtre.theme || d.theme === filtre.theme),
    );
    return {
      facettes: complet?.facettes ?? { etats: [], origines: [], themes: [] },
      dossiers: paginer(dossiers, pagination),
    };
  }

  async entete(id: string) {
    return (await this.fiche(id))?.entete ?? null;
  }

  async parcours(id: string) {
    return (await this.fiche(id))?.parcours ?? null;
  }

  async barre(id: string): Promise<{ dossier: DossierRef; cases: CaseCompacte[] } | null> {
    const resume = premier(await this.resumes(), (d) => d.id === id);
    if (resume?.barre.length) return { dossier: { id, titre: resume.titre }, cases: resume.barre };
    const fiche = await this.fiche(id);
    if (!fiche?.parcours) return null;
    return {
      dossier: { id, titre: fiche.entete.titre },
      cases: fiche.parcours.cases.map(({ cle, libelle, etat, courante }) => ({ cle, libelle, etat, courante })),
    };
  }

  async etapes(id: string) {
    return (await this.fiche(id))?.etapes ?? [];
  }

  async articles(id: string) {
    const f = await this.fiche(id);
    return { articles: f?.articles ?? [], versionsDuTexte: f?.versionsDuTexte ?? 0 };
  }

  async ceQuiAChange(id: string) {
    return (await this.fiche(id))?.ceQuiAChange ?? [];
  }

  async amendements(id: string, filtre: { sort?: SortAmendement }, pagination: Pagination) {
    const f = await this.fiche(id);
    const liste: AmendementResume[] = (f?.amendements.liste.elements ?? []).filter((a) => !filtre.sort || a.sort === filtre.sort);
    return { parEtape: f?.amendements.parEtape ?? [], liste: paginer(liste, pagination) };
  }

  async acteurs(id: string) {
    return (await this.fiche(id))?.acteurs ?? [];
  }

  async chiffres(id: string) {
    return (await this.fiche(id))?.chiffres ?? [];
  }

  async sources(id: string) {
    return (await this.fiche(id))?.sources ?? [];
  }

  async etape(dossier: string, cle: CleCase) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ConsulterEtape, (x) => x.input.dossier === dossier && x.input.cle === cle)?.output;
    if (!e) return null;
    const { barre: _barre, votes: _votes, quiIntervient: _qui, ...reste } = e;
    return reste;
  }

  async article(id: string, version: string | null, comparaison: 'precedente' | 'depose') {
    const { exemples } = await this.donnees;
    // Le texte d'une version n'est connu que pour la version affichée par un exemple.
    const e = premier(
      exemples.ConsulterArticle,
      (x) =>
        x.input.article === id &&
        x.output.affichee.comparaison === comparaison &&
        (version === null ? x.input.version === undefined : version === x.output.affichee.version),
    )?.output;
    if (!e) return null;
    const { barre, ...reste } = e;
    return { ...reste, dossier: barre.dossier.id };
  }

  async amendement(id: string) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ConsulterAmendement, (x) => x.input.id === id)?.output;
    if (!e) return null;
    const { barre, discussions: _d, interets: _i, vote, ...reste } = e;
    // Le dépôt ne connaît pas les scrutins : le cœur remet `scrutin_public` (ScrutinsRepository).
    const sansScrutin = vote.type === 'scrutin_public' ? ({ type: 'main_levee' } as const) : vote;
    return { ...reste, vote: sansScrutin, dossier: barre.dossier.id };
  }

  async deposesParLeGouvernement(_depuis: string, limite: number) {
    const { exemples } = await this.donnees;
    const g = premier(exemples.ConsulterInstitution, (x) => x.output.type === 'gouvernement')?.output;
    const textes = g?.type === 'gouvernement' ? g.textesDeposes : { total: 0, dossiers: [] };
    return { total: textes.total, dossiers: textes.dossiers.slice(0, limite) };
  }
}
