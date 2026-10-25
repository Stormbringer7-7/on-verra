// Adaptateur Postgres du DiscussionsRepository : prises de parole en séance et en commission, telles
// que publiées (`canon.intervention`, texte intégral). L'orateur est une personne seulement si
// `orateur_id` est posé (identifiant officiel du compte rendu, ou décision de revue) ; sinon le nom
// publié, jamais rapproché d'une personne par ressemblance. Sujet (dossier, amendement) par lien
// explicite seulement ; passage du compte rendu : `canon.provenance.pointeur` et le document de la réunion.

import type {
  AmendementRef,
  Ancre,
  CibleInterventions,
  CleCase,
  DossierRef,
  GroupeRef,
  Intervenant,
  Intervention,
  InterventionExtrait,
  Orateur,
  OrganisationRef,
  Page,
  Provenance,
  ReunionRef,
} from '@contrat/domain/model';
import type { DiscussionsRepository, Pagination, SqlDatabase, SqlParams } from '../../ports';
import {
  Projections,
  estUuid,
  estVivante,
  sqlDossierRef,
  sqlGroupe,
  sqlGroupeALaDate,
  sqlProvenance,
  vivante,
} from './scrutins';

/** Longueur d'un extrait (coupé sur un mot), comme les fixtures du contrat. */
const LONGUEUR_EXTRAIT = 160;
/** En deçà, une prise de parole n'est pas retenue comme extrait si l'orateur en a une plus longue. */
const SIGNIFICATIVE = 80;

/** La présidence de séance (« La parole est à… ») n'est pas une prise de position (cf. projection dit_et_vote). */
export const HORS_PRESIDENCE = `COALESCE(i.qualite, '') !~* '^présidente? de séance$'
  AND i.orateur_libelle !~* '^(M\\. le président|Mme la présidente)\\.?$'`;

/** Voix collective (« PA0 ») et didascalies (« (L'amendement est adopté.) ») : publiées sans orateur. */
export const UN_ORATEUR = `(i.orateur_id IS NOT NULL OR btrim(i.orateur_libelle) <> '')`;

/** Intervention reliée au dossier : par la colonne ou par un lien intervention → dossier (discussion commune). */
const SUR_LE_DOSSIER = `(i.dossier_id = $dossier::uuid OR EXISTS (
  SELECT 1 FROM canon.lien ld WHERE ld.de_id = i.entite_id AND ld.nature = 'dossier' AND ld.vers_id = $dossier::uuid))`;

/** Interventions reliées à un amendement (source) : la colonne, ou un lien (plusieurs amendements discutés). */
const SUR_L_AMENDEMENT = `SELECT entite_id FROM canon.intervention WHERE amendement_id = $amendement::uuid
  UNION SELECT de_id FROM canon.lien WHERE vers_id = $amendement::uuid AND nature = 'amendement'`;

/** Interventions des réunions d'une case du parcours (acte → réunion par `reunionRef`). */
const SUR_LA_CASE = `SELECT i.entite_id FROM canon.intervention i WHERE i.reunion_id IN (
  SELECT l.vers_id FROM lecture.parcours_acte pa
  JOIN canon.lien l ON l.de_id = pa.etape_id AND l.nature = 'reunion'
  WHERE pa.dossier_id = $dossier::uuid AND pa.cle = $cle)`;

const JOUR = `(r.debut AT TIME ZONE 'Europe/Paris')::date`;

interface LigneIntervention {
  id: string;
  ordre: number;
  horodatage: number | null;
  texte: string;
  article: string | null;
  point_titre: string | null;
  qualite: string | null;
  orateur_libelle: string;
  personne_id: string | null;
  personne_nom: string | null;
  groupe: GroupeRef | null;
  dossier: DossierRef | null;
  amendement: AmendementRef | null;
  reunion_id: string;
  reunion_type: ReunionRef['type'];
  reunion_chambre: ReunionRef['chambre'];
  reunion_debut: Date | null;
  jour: string | null;
  organe: OrganisationRef | null;
  pointeur: string | null;
  url_compte_rendu: string | null;
  provenance: Provenance;
}

/** Colonnes d'une intervention et de son contexte (alias i, r). */
const COLONNES = `
  i.entite_id AS id, i.ordre, i.horodatage_s::float8 AS horodatage, i.texte, i.article, i.point_titre,
  i.qualite, i.orateur_libelle, p.entite_id AS personne_id, p.nom_affiche AS personne_nom,
  ${sqlGroupe('g')} AS groupe, ${sqlDossierRef('d')} AS dossier,
  (SELECT json_build_object('id', a.entite_id, 'numero', a.numero, 'chambre', a.chambre)
     FROM canon.amendement a
    WHERE ${estVivante('a.entite_id')} AND a.entite_id = COALESCE(i.amendement_id,
          (SELECT CASE WHEN count(*) = 1 THEN min(la.vers_id::text)::uuid END
             FROM canon.lien la WHERE la.de_id = i.entite_id AND la.nature = 'amendement'))) AS amendement,
  r.entite_id AS reunion_id, r.type AS reunion_type, r.chambre AS reunion_chambre, r.debut AS reunion_debut,
  ${JOUR}::text AS jour,
  CASE WHEN org.entite_id IS NOT NULL THEN json_build_object('id', org.entite_id, 'nom', org.nom) END AS organe,
  (SELECT pv.pointeur FROM canon.provenance pv WHERE pv.entite_id = i.entite_id AND pv.pointeur <> ''
    ORDER BY pv.vu_le DESC LIMIT 1) AS pointeur,
  COALESCE(cr.url, (SELECT pv.url FROM canon.provenance pv WHERE pv.entite_id = i.entite_id
                     AND pv.url IS NOT NULL AND pv.url !~* '\\.zip$' ORDER BY pv.vu_le DESC LIMIT 1)) AS url_compte_rendu,
  ${sqlProvenance('i.entite_id', 'intervention')} AS provenance`;

/** Jointures du contexte : réunion, organe, orateur certain, groupe du jour, dossier, compte rendu. */
const JOINTURES = `
  ${vivante('i.entite_id', 'xi')}
  JOIN canon.reunion r ON r.entite_id = i.reunion_id
  LEFT JOIN canon.organisation org ON org.entite_id = r.organe_id AND ${estVivante('org.entite_id')}
  LEFT JOIN canon.personne p ON p.entite_id = i.orateur_id AND ${estVivante('p.entite_id')}
  LEFT JOIN LATERAL (SELECT COALESCE(i.groupe_id,
    CASE WHEN p.entite_id IS NOT NULL THEN ${sqlGroupeALaDate('p.entite_id', 'r.chambre', JOUR)} END) AS id) gi ON true
  LEFT JOIN canon.organisation g ON g.entite_id = gi.id AND ${estVivante('g.entite_id')}
  LEFT JOIN canon.dossier d ON d.entite_id = i.dossier_id
  LEFT JOIN canon.document cr ON cr.entite_id = r.compte_rendu_id AND ${estVivante('cr.entite_id')}`;

const ORDRE = `r.debut, r.entite_id, i.ordre`;

/** Présidence de séance publiée sans qualité (AN : « M. le président ») : le libellé publié en tient lieu. */
const PRESIDENCE = /^(M\. le président|Mme la présidente)\.?$/i;

const orateur = (l: LigneIntervention): Orateur => {
  const qualite = l.qualite ?? (PRESIDENCE.test(l.orateur_libelle) ? l.orateur_libelle : null);
  return l.personne_id
    ? { type: 'personne', personne: { id: l.personne_id, nom: l.personne_nom!, fonction: null, groupe: l.groupe }, qualite }
    : { type: 'nom_publie', nom: l.orateur_libelle, qualite };
};

const compteRendu = (l: LigneIntervention): Ancre => ({ url: l.url_compte_rendu, ancre: l.pointeur, provenance: l.provenance });

const intervention = (l: LigneIntervention): Intervention => ({
  id: l.id,
  reunion: {
    id: l.reunion_id,
    type: l.reunion_type,
    chambre: l.reunion_chambre,
    organe: l.organe,
    debut: l.reunion_debut ? l.reunion_debut.toISOString() : null,
  },
  ordre: l.ordre,
  horodatage: l.horodatage,
  orateur: orateur(l),
  groupe: l.groupe,
  texte: l.texte,
  sujet: { dossier: l.dossier, article: l.article, amendement: l.amendement, point: l.point_titre },
  compteRendu: compteRendu(l),
  synthese: null,
});

/** Début du texte publié, coupé sur un mot. */
export function couper(texte: string, longueur = LONGUEUR_EXTRAIT): { extrait: string; tronque: boolean } {
  if (texte.length <= longueur) return { extrait: texte, tronque: false };
  const espace = texte.lastIndexOf(' ', longueur);
  return { extrait: texte.slice(0, espace > 0 ? espace : longueur).trimEnd(), tronque: true };
}

const extrait = (l: LigneIntervention): InterventionExtrait => ({
  id: l.id,
  orateur: orateur(l),
  groupe: l.groupe,
  date: l.jour,
  ...couper(l.texte),
  compteRendu: compteRendu(l),
});

const jourFr = (jour: string | null) => (jour ? jour.split('-').reverse().join('/') : null);

const page = <T>(elements: T[], { page, taille }: Pagination, total: number): Page<T> => ({
  elements,
  page,
  taille,
  total,
  suivante: page * taille < total ? page + 1 : null,
});

/**
 * Interventions choisies : `source` rend les `entite_id` candidats par une colonne indexée
 * (réunion, orateur, amendement, liste d'identifiants) ; `filtre` porte sur i et r. Les candidats
 * sont matérialisés d'abord : l'état des entités (G2) n'est vérifié que sur eux, pour que le
 * planificateur ne parte pas de toute la table (statistiques de `canon.entite` faussées en cours
 * de chargement).
 */
interface Selection {
  source: string;
  filtre?: string;
}

const candidates = ({ source, filtre }: Selection, ordre: string, fin: string) => `
  WITH source AS MATERIALIZED (${source}),
  candidates AS MATERIALIZED (
    SELECT i.entite_id FROM source c
    JOIN canon.intervention i ON i.entite_id = c.entite_id
    JOIN canon.reunion r ON r.entite_id = i.reunion_id
    WHERE NOT EXISTS (SELECT 1 FROM canon.entite x WHERE x.entite_id = i.entite_id
                        AND (x.retiree_de_la_source_le IS NOT NULL OR x.fusionnee_dans IS NOT NULL))
      ${filtre ? `AND ${filtre}` : ''}
    ORDER BY ${ordre} ${fin})`;

export class PgDiscussions implements DiscussionsRepository {
  private readonly projections: Projections;

  constructor(private readonly db: SqlDatabase) {
    this.projections = new Projections(db);
  }

  private lignes(selection: Selection, params: SqlParams, ordre = ORDRE, fin = ''): Promise<LigneIntervention[]> {
    return this.db.all<LigneIntervention>(
      `${candidates(selection, ordre, fin)}
       SELECT ${COLONNES} FROM candidates c JOIN canon.intervention i ON i.entite_id = c.entite_id ${JOINTURES}
       ORDER BY ${ordre}`,
      params,
    );
  }

  private async compter({ source, filtre }: Selection, params: SqlParams): Promise<number> {
    const r = await this.db.first<{ n: number }>(
      `WITH source AS MATERIALIZED (${source})
       SELECT count(*) AS n FROM source c
       JOIN canon.intervention i ON i.entite_id = c.entite_id
       JOIN canon.reunion r ON r.entite_id = i.reunion_id
       WHERE NOT EXISTS (SELECT 1 FROM canon.entite x WHERE x.entite_id = i.entite_id
                           AND (x.retiree_de_la_source_le IS NOT NULL OR x.fusionnee_dans IS NOT NULL))
         ${filtre ? `AND ${filtre}` : ''}`,
      params,
    );
    return r?.n ?? 0;
  }

  /** Interventions par identifiants (Explorer), dans l'ordre des réunions ; inconnues ou retirées omises. */
  async parIds(ids: string[]): Promise<Intervention[]> {
    const uniques = [...new Set(ids.filter(estUuid))];
    if (!uniques.length) return [];
    return (await this.lignes({ source: 'SELECT unnest($ids::uuid[]) AS entite_id' }, { $ids: uniques })).map(intervention);
  }

  async intervenants(dossier: string, cle: CleCase, limite: number): Promise<{ intervenants: Intervenant[]; total: number }> {
    if (!estUuid(dossier) || !(await this.projections.existe('lecture.parcours_acte'))) return { intervenants: [], total: 0 };
    // Un orateur : la personne si elle est certaine, sinon le nom publié tel quel.
    const orateurs = await this.db.all<{ n: number; premiere: string; total: number }>(
      `${candidates({ source: SUR_LA_CASE, filtre: `${SUR_LE_DOSSIER} AND ${HORS_PRESIDENCE} AND ${UN_ORATEUR}` }, 'i.entite_id', '')}
       SELECT count(*) AS n, count(*) OVER () AS total,
              (array_agg(i.entite_id ORDER BY (length(i.texte) < ${SIGNIFICATIVE}), r.debut, i.ordre))[1] AS premiere
       FROM candidates c
       JOIN canon.intervention i ON i.entite_id = c.entite_id
       JOIN canon.reunion r ON r.entite_id = i.reunion_id
       LEFT JOIN canon.personne p ON p.entite_id = i.orateur_id AND ${estVivante('p.entite_id')}
       GROUP BY COALESCE(p.entite_id::text, 'nom:' || i.orateur_libelle)
       ORDER BY n DESC, min(r.debut), min(i.ordre)
       LIMIT $limite`,
      { $dossier: dossier, $cle: cle, $limite: limite },
    );
    if (!orateurs.length) return { intervenants: [], total: 0 };
    const premieres = new Map(
      (await this.lignes({ source: 'SELECT unnest($ids::uuid[]) AS entite_id' }, { $ids: orateurs.map((o) => o.premiere) }))
        .map((l) => [l.id, l]),
    );
    const intervenants = orateurs.flatMap((o): Intervenant[] => {
      const l = premieres.get(o.premiere);
      return l ? [{ orateur: orateur(l), groupe: l.groupe, interventions: o.n, extrait: extrait(l) }] : [];
    });
    return { intervenants, total: orateurs[0].total };
  }

  async interventions(
    cible: CibleInterventions,
    pagination: Pagination,
  ): Promise<{ libelle: string; interventions: Page<Intervention> } | null> {
    const ciblee = await this.cible(cible);
    if (!ciblee) return null;
    const { selection, params, libelle } = ciblee;
    const [total, lignes] = await Promise.all([
      selection ? this.compter(selection, params) : Promise.resolve(0),
      selection
        ? this.lignes(selection, { ...params, $limite: pagination.taille, $decalage: (pagination.page - 1) * pagination.taille },
            ORDRE, 'LIMIT $limite OFFSET $decalage')
        : Promise.resolve([]),
    ]);
    return { libelle, interventions: page(lignes.map(intervention), pagination, total) };
  }

  /** Sélection et libellé d'une cible ; null si la cible n'existe pas (G5). `selection` null : liste vide. */
  private async cible(
    cible: CibleInterventions,
  ): Promise<{ selection: Selection | null; params: SqlParams; libelle: string } | null> {
    switch (cible.type) {
      case 'etape': {
        if (!estUuid(cible.dossier)) return null;
        const params = { $dossier: cible.dossier, $cle: cible.cle };
        const parcours = await this.projections.existe('lecture.parcours_dossier');
        const r = await this.db.first<{ titre: string; case_libelle: string | null }>(
          `SELECT d.titre AS titre,
                  ${parcours ? `(SELECT pd.libelle FROM lecture.parcours_dossier pd WHERE pd.dossier_id = d.entite_id AND pd.cle = $cle)` : 'NULL'} AS case_libelle
           FROM canon.dossier d ${vivante('d.entite_id', 'xd')} WHERE d.entite_id = $dossier::uuid`,
          params,
        );
        if (!r) return null;
        const libelle = r.case_libelle ? `${r.case_libelle} · ${r.titre}` : r.titre;
        if (!(await this.projections.existe('lecture.parcours_acte'))) return { selection: null, params, libelle };
        return { selection: { source: SUR_LA_CASE, filtre: SUR_LE_DOSSIER }, params, libelle };
      }
      case 'reunion': {
        if (!estUuid(cible.id)) return null;
        const r = await this.db.first<{ type: string; chambre: string; organe: string | null; jour: string | null }>(
          `SELECT r.type, r.chambre, o.nom AS organe, ${JOUR}::text AS jour
           FROM canon.reunion r ${vivante('r.entite_id', 'xr')}
           LEFT JOIN canon.organisation o ON o.entite_id = r.organe_id
           WHERE r.entite_id = $id::uuid`,
          { $id: cible.id },
        );
        if (!r) return null;
        const nature = r.type === 'seance' ? 'Séance' : r.type === 'commission' ? 'Commission' : 'Réunion';
        const libelle = [`${nature} ${r.chambre === 'SENAT' ? 'Sénat' : r.chambre}`, r.type === 'seance' ? null : r.organe, jourFr(r.jour)]
          .filter(Boolean)
          .join(' · ');
        return {
          selection: { source: 'SELECT entite_id FROM canon.intervention WHERE reunion_id = $id::uuid' },
          params: { $id: cible.id },
          libelle,
        };
      }
      case 'amendement': {
        if (!estUuid(cible.id)) return null;
        const a = await this.db.first<{ numero: string; organe: string | null }>(
          `SELECT a.numero, o.nom AS organe FROM canon.amendement a ${vivante('a.entite_id', 'xa')}
           LEFT JOIN canon.organisation o ON o.entite_id = a.organe_examen_id
           WHERE a.entite_id = $amendement::uuid`,
          { $amendement: cible.id },
        );
        if (!a) return null;
        return {
          selection: { source: SUR_L_AMENDEMENT },
          params: { $amendement: cible.id },
          libelle: [`Amendement ${a.numero}`, a.organe].filter(Boolean).join(' · '),
        };
      }
      case 'personne': {
        if (!estUuid(cible.id) || (cible.dossier !== undefined && !estUuid(cible.dossier))) return null;
        const r = await this.db.first<{ nom: string; dossier: string | null }>(
          `SELECT p.nom_affiche AS nom,
                  ${cible.dossier ? `(SELECT d.titre FROM canon.dossier d WHERE d.entite_id = $dossier::uuid AND ${estVivante('d.entite_id')})` : 'NULL'} AS dossier
           FROM canon.personne p ${vivante('p.entite_id', 'xp')} WHERE p.entite_id = $id::uuid`,
          cible.dossier ? { $id: cible.id, $dossier: cible.dossier } : { $id: cible.id },
        );
        if (!r || (cible.dossier && !r.dossier)) return null;
        const source = 'SELECT entite_id FROM canon.intervention WHERE orateur_id = $id::uuid';
        return cible.dossier
          ? { selection: { source, filtre: SUR_LE_DOSSIER }, params: { $id: cible.id, $dossier: cible.dossier }, libelle: `${r.nom} · ${r.dossier}` }
          : { selection: { source }, params: { $id: cible.id }, libelle: r.nom };
      }
    }
  }

  async surAmendement(amendement: string, limite: number): Promise<{ extraits: InterventionExtrait[]; total: number }> {
    if (!estUuid(amendement)) return { extraits: [], total: 0 };
    const params = { $amendement: amendement };
    const selection = { source: SUR_L_AMENDEMENT };
    const [total, lignes] = await Promise.all([
      this.compter(selection, params),
      // Commission d'abord, puis séance ; chaque réunion dans l'ordre des prises de parole.
      this.lignes(selection, { ...params, $limite: limite }, `(r.type <> 'commission'), ${ORDRE}`, 'LIMIT $limite'),
    ]);
    return { extraits: lignes.map(extrait), total };
  }

  /**
   * Ses interventions sur l'amendement voté, ou sur le dossier dont le scrutin vote l'ensemble, le jour
   * du vote ou avant : `lecture.dit_et_vote` quand la projection est chargée, sinon la même règle sur
   * `canon` (lien explicite seulement, présidence de séance exclue). La plus proche du vote d'abord.
   */
  async avantLeVote(scrutin: string, personne: string, limite: number): Promise<InterventionExtrait[]> {
    if (!estUuid(scrutin) || !estUuid(personne)) return [];
    const projection = await this.projections.existe('lecture.dit_et_vote');
    const avant = `${JOUR} <= (SELECT s.date FROM canon.scrutin s WHERE s.entite_id = $scrutin::uuid)`;
    const selection: Selection = projection
      ? {
          source: `SELECT DISTINCT unnest(dv.intervention_ids) AS entite_id FROM lecture.dit_et_vote dv
                   WHERE dv.scrutin_id = $scrutin::uuid AND dv.personne_id = $personne::uuid`,
          filtre: avant,
        }
      : {
          source: 'SELECT entite_id FROM canon.intervention WHERE orateur_id = $personne::uuid',
          filtre: `${avant} AND ${HORS_PRESIDENCE} AND EXISTS (
            SELECT 1 FROM canon.scrutin s WHERE s.entite_id = $scrutin::uuid
               AND (i.amendement_id = s.amendement_id
                    OR (s.nature IN ('ensemble', 'article_unique') AND i.dossier_id = s.dossier_id)))`,
        };
    const ordre = 'r.debut DESC, i.ordre DESC';
    const lignes = await this.lignes(selection, { $scrutin: scrutin, $personne: personne, $limite: limite }, ordre, 'LIMIT $limite');
    return lignes.map(extrait);
  }
}
