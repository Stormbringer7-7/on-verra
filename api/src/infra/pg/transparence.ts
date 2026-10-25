// Adaptateur Postgres du port TransparenceRepository : déclarations HATVP publiées (par rubrique,
// lien vers le PDF), représentants d'intérêts (dernier exercice clos, actions déclarées) et
// rapprochements lobbying. Seul ce que la HATVP publie, tel quel : un intérêt déclaré n'est pas un
// conflit d'intérêts, une action déclarée ne prouve ni une rencontre, ni une influence.
//
// Rapprochements : aucun n'est produit aujourd'hui (`analytique.affirmation` vide). Forme lue,
// proposée à la future règle qui les produira : sujet `action_representation` (l'action), prédicat
// `concerne`, objet `{"type": "dossier" | "amendement" | "article", "id": "<entite_id>"}`, toute
// vérification sauf REJETE. Un rapprochement est toujours « à vérifier », sauf preuve explicite
// relue ici dans `canon` : l'objet ou les décisions concernées de l'action citent le titre officiel
// exact du dossier (alors « vérifié · l'action cite le texte », preuve : l'action elle-même).

import type {
  ActionRepresentation,
  CibleInteret,
  DeclarationHatvp,
  DeclarationResume,
  FicheRepresentant,
  Lien,
  LienInteret,
  Provenance,
  RubriqueDeclaree,
} from '@contrat/domain/model';
import type { Pagination, SqlDatabase, TransparenceRepository } from '../../ports';
import { actif, estUuid, jour, page, provenance, provenanceSql } from './personnes';

/** Libellés des rubriques publiées (codes `*Dto` de la HATVP). */
const RUBRIQUES: Record<string, string> = {
  activProfCinqDerniereDto: 'Activités professionnelles (5 dernières années)',
  activConsultantDto: 'Activités de consultant (5 dernières années)',
  participationDirigeantDto: 'Participations aux organes dirigeants d’organismes publics ou privés',
  participationFinanciereDto: 'Participations financières dans des sociétés',
  activProfConjointDto: 'Activités professionnelles du conjoint',
  fonctionBenevoleDto: 'Fonctions bénévoles',
  mandatElectifDto: 'Mandats électifs',
  activCollaborateursDto: 'Activités des collaborateurs',
  observationInteretDto: 'Observations',
  revenuMandatDto: 'Revenus du mandat',
  evenementMajeurDto: 'Événements majeurs',
  immeubleDto: 'Biens immobiliers',
  sciDto: 'Parts de sociétés civiles immobilières',
  valeursEnBourseDto: 'Valeurs mobilières cotées',
  valeursNonEnBourseDto: 'Valeurs mobilières non cotées',
  assuranceVieDto: 'Assurances vie',
  comptesBancaireDto: 'Comptes bancaires',
  bienDiverDto: 'Biens divers',
  vehiculeDto: 'Véhicules',
  fondDto: 'Fonds de commerce',
  bienEtrangerDto: 'Biens à l’étranger',
  autreBienDto: 'Autres biens',
  passifDto: 'Passif',
  observationPatrimoineDto: 'Observations',
};

const AVERTISSEMENT =
  'Ce rapprochement n’établit ni une rencontre, ni une influence sur le texte : seulement une action déclarée sur ce sujet.';

/**
 * Éléments déclarés d'une rubrique : le contenu publié imbrique des listes (`items`) ; chaque
 * élément est aplati en champs « a.b » tels que publiés (les clés privées sont déjà retirées au
 * chargement).
 */
export function elementsDeclares(contenu: unknown): Record<string, string | null>[] {
  const elements: Record<string, string | null>[] = [];
  const aplatir = (valeur: unknown, prefixe: string, sortie: Record<string, string | null>) => {
    if (valeur === null || valeur === undefined) sortie[prefixe] = null;
    else if (Array.isArray(valeur)) valeur.forEach((v, i) => aplatir(v, prefixe ? `${prefixe}.${i}` : String(i), sortie));
    else if (typeof valeur === 'object') {
      for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) aplatir(v, prefixe ? `${prefixe}.${cle}` : cle, sortie);
    } else sortie[prefixe] = String(valeur);
  };
  const parcourir = (noeud: unknown) => {
    if (Array.isArray(noeud)) noeud.forEach(parcourir);
    else if (noeud && typeof noeud === 'object') {
      const objet = noeud as Record<string, unknown>;
      if (Array.isArray(objet.items)) objet.items.forEach(parcourir);
      else {
        const sortie: Record<string, string | null> = {};
        aplatir(objet, '', sortie);
        if (Object.keys(sortie).length) elements.push(sortie);
      }
    }
  };
  parcourir(contenu);
  return elements;
}

type LigneDeclaration = DeclarationResume & {
  qualite: string | null;
  mandat: string | null;
  provenance: Provenance | null;
};

/** Catégories de responsables publics visées qui correspondent à la chambre du scrutin (texte publié). */
const CATEGORIE: Record<string, string> = { AN: 'député', SENAT: 'sénateur' };

export class PgTransparence implements TransparenceRepository {
  constructor(private readonly db: SqlDatabase) {}

  private resumes(personne: string): Promise<LigneDeclaration[]> {
    return this.db.all<LigneDeclaration>(
      `SELECT d.entite_id::text AS id, d.type, COALESCE(d.type_libelle, d.type) AS libelle,
              COALESCE(d.modificative, false) AS modificative, ${jour('d.date_depot')} AS "dateDepot",
              ${jour('d.date_publication')} AS "datePublication", d.url, d.qualite, d.mandat,
              ${provenanceSql('d.entite_id')} AS provenance
       FROM canon.declaration d
       WHERE d.personne_id = $personne AND ${actif('d.entite_id')}
       ORDER BY d.date_depot DESC NULLS LAST, d.date_publication DESC NULLS LAST, d.entite_id`,
      { personne },
    );
  }

  async declarations(personne: string): Promise<DeclarationHatvp[]> {
    if (!estUuid(personne)) return [];
    const lignes = await this.resumes(personne);
    if (!lignes.length) return [];
    const rubriques = await this.db.all<{ declaration: string; rubrique: string; neant: boolean; contenu: unknown }>(
      `SELECT r.declaration_id::text AS declaration, r.rubrique, r.neant, r.contenu
       FROM canon.rubrique_declaree r WHERE r.declaration_id = ANY($ids::uuid[])
       ORDER BY r.declaration_id, r.ordre, r.rubrique`,
      { ids: lignes.map((l) => l.id) },
    );
    const parDeclaration = new Map<string, RubriqueDeclaree[]>();
    for (const r of rubriques) {
      const liste = parDeclaration.get(r.declaration) ?? [];
      liste.push({
        rubrique: r.rubrique,
        libelle: RUBRIQUES[r.rubrique] ?? r.rubrique,
        neant: r.neant,
        elements: r.neant ? [] : elementsDeclares(r.contenu),
      });
      parDeclaration.set(r.declaration, liste);
    }
    return lignes.map(({ provenance: p, ...d }) => ({
      ...d,
      rubriques: parDeclaration.get(d.id) ?? [],
      provenance: provenance(p, 'declaration', d.id),
    }));
  }

  async declarationsResumees(personne: string): Promise<DeclarationResume[]> {
    if (!estUuid(personne)) return [];
    return (await this.resumes(personne)).map(({ id, type, libelle, modificative, dateDepot, datePublication, url }) => ({
      id,
      type,
      libelle,
      modificative,
      dateDepot,
      datePublication,
      url,
    }));
  }

  async representant(id: string, pagination: Pagination): Promise<Omit<FicheRepresentant, 'rapprochements'> | null> {
    if (!estUuid(id)) return null;
    const r = await this.db.first<{
      id: string;
      denomination: string;
      nom_usage: string | null;
      categorie: string | null;
      identifiant: string | null;
      type_identifiant: string | null;
      inscrit: string | null;
      secteurs: string[] | null;
      provenance: Provenance | null;
    }>(
      `SELECT r.entite_id::text AS id, r.denomination, r.nom_usage, r.categorie, r.identifiant_national AS identifiant,
              r.type_identifiant, ${jour('r.premiere_publication')} AS inscrit, r.secteurs,
              ${provenanceSql('r.entite_id')} AS provenance
       FROM canon.representant_interets r WHERE r.entite_id = $id AND ${actif('r.entite_id')}`,
      { id },
    );
    if (!r) return null;
    const [exercice, actions] = await Promise.all([
      // Dernier exercice clos ; à défaut (premier exercice en cours), le plus récent.
      this.db.first<{ debut: string; fin: string; actions: number | null; depenses: string | null; salaries: number | null }>(
        `SELECT ${jour('e.debut')} AS debut, ${jour('e.fin')} AS fin, e.nombre_actions AS actions,
                e.montant_depense AS depenses, e.nombre_salaries::float8 AS salaries
         FROM canon.exercice_representation e WHERE e.representant_id = $id
         ORDER BY (e.fin < current_date) DESC, e.debut DESC LIMIT 1`,
        { id },
      ),
      this.db.all<{
        id: string;
        debut: string | null;
        fin: string | null;
        objet: string;
        domaines: string[] | null;
        actions: string[] | null;
        responsables: string[] | null;
        decisions: string[] | null;
        publiee: string | null;
        total: number;
      }>(
        `SELECT a.entite_id::text AS id, ${jour('a.exercice_debut')} AS debut, ${jour('a.exercice_fin')} AS fin, a.objet,
                a.domaines, a.actions_menees AS actions, a.responsables_publics AS responsables,
                a.decisions_concernees AS decisions, ${jour('a.publiee_le')} AS publiee, count(*) OVER ()::int AS total
         FROM canon.action_representation a
         WHERE a.representant_id = $id AND ${actif('a.entite_id')}
         ORDER BY a.exercice_debut DESC NULLS LAST, a.publiee_le DESC NULLS LAST, a.entite_id
         LIMIT $taille OFFSET $decalage`,
        { id, taille: pagination.taille, decalage: (pagination.page - 1) * pagination.taille },
      ),
    ]);
    const elements: ActionRepresentation[] = actions.map((a) => ({
      id: a.id,
      periode: { debut: a.debut ?? a.fin ?? '', fin: a.fin },
      objet: a.objet,
      domaines: a.domaines ?? [],
      actions: a.actions ?? [],
      responsables: a.responsables ?? [],
      decisions: a.decisions ?? [],
      publieeLe: a.publiee,
    }));
    return {
      id: r.id,
      denomination: r.denomination,
      nomUsage: r.nom_usage,
      categorie: r.categorie,
      identifiant: r.identifiant ? { valeur: r.identifiant, type: r.type_identifiant ?? 'HATVP' } : null,
      inscritDepuis: r.inscrit,
      secteurs: r.secteurs ?? [],
      exercice: exercice
        ? {
            periode: { debut: exercice.debut, fin: exercice.fin },
            actions: exercice.actions,
            depenses: exercice.depenses,
            salaries: exercice.salaries,
            personnesDeclarees: null,
          }
        : null,
      actions: page(elements, pagination, actions[0]?.total ?? 0),
      provenance: provenance(r.provenance, 'representant', r.id),
    };
  }

  async interetsDe(
    cible:
      | { type: 'dossier'; id: string }
      | { type: 'amendement'; id: string }
      | { type: 'article'; id: string }
      | { type: 'representant'; id: string }
      | { type: 'vote'; scrutin: string; personne: string },
  ): Promise<LienInteret[]> {
    const ids = cible.type === 'vote' ? [cible.scrutin, cible.personne] : [cible.id];
    if (!ids.every(estUuid)) return [];
    let filtre: string;
    const params: Record<string, string> = {};
    if (cible.type === 'vote') {
      const s = await this.db.first<{ dossier_id: string | null; amendement_id: string | null; chambre: string }>(
        `SELECT s.dossier_id::text, s.amendement_id::text, s.chambre FROM canon.scrutin s
         WHERE s.entite_id = $scrutin AND ${actif('s.entite_id')}`,
        { scrutin: cible.scrutin },
      );
      if (!s || (!s.dossier_id && !s.amendement_id)) return [];
      // Les responsables visés sont des catégories : celle de la personne pour ce scrutin, jamais elle-même.
      filtre = `(c.dossier_id = $dossier OR (c.type = 'amendement' AND c.cible_id = $amendement))
                AND EXISTS (SELECT 1 FROM unnest(ac.responsables_publics) rp WHERE strpos(lower(rp), $categorie) > 0)`;
      params.dossier = s.dossier_id ?? '';
      params.amendement = s.amendement_id ?? '';
      params.categorie = CATEGORIE[s.chambre] ?? 'député';
    } else if (cible.type === 'representant') {
      filtre = 'ri.entite_id::text = $id';
      params.id = cible.id;
    } else if (cible.type === 'dossier') {
      filtre = 'c.dossier_id = $id';
      params.id = cible.id;
    } else {
      filtre = `c.type = '${cible.type}' AND c.cible_id = $id`;
      params.id = cible.id;
    }
    const lignes = await this.db.all<{
      type: 'dossier' | 'amendement' | 'article';
      cible_id: string;
      dossier_id: string;
      dossier_titre: string;
      amendement_numero: string | null;
      amendement_chambre: string | null;
      article_numero: string | null;
      methode: string | null;
      cite: boolean;
      action_id: string;
      debut: string | null;
      fin: string | null;
      objet: string;
      responsables: string[] | null;
      representant_id: string;
      denomination: string;
      categorie: string | null;
      actions_declarees: number;
      provenance_action: Provenance | null;
    }>(
      `WITH a AS (
         SELECT af.sujet_id AS action_id, af.objet->>'type' AS type, af.objet->>'id' AS cible_id, af.objet->>'methode' AS methode
         FROM analytique.affirmation af
         WHERE af.sujet_type = 'action_representation' AND af.predicat = 'concerne' AND af.verification <> 'REJETE'
           AND af.objet->>'type' IN ('dossier', 'amendement', 'article')),
       c AS (
         SELECT a.*, COALESCE(d.entite_id, am.dossier_id, ar.dossier_id)::text AS dossier_id,
                am.numero AS amendement_numero, am.chambre AS amendement_chambre,
                (SELECT va.numero FROM canon.version_article va JOIN canon.version_texte vt ON vt.entite_id = va.version_texte_id
                 WHERE va.article_suivi_id = ar.entite_id ORDER BY vt.date DESC NULLS LAST, va.ordre LIMIT 1) AS article_numero
         FROM a
         LEFT JOIN canon.dossier d ON a.type = 'dossier' AND d.entite_id::text = a.cible_id
         LEFT JOIN canon.amendement am ON a.type = 'amendement' AND am.entite_id::text = a.cible_id
         LEFT JOIN canon.article_suivi ar ON a.type = 'article' AND ar.entite_id::text = a.cible_id
         WHERE COALESCE(d.entite_id, am.entite_id, ar.entite_id) IS NOT NULL
           AND ${actif('COALESCE(d.entite_id, am.entite_id, ar.entite_id)')})
       SELECT c.type, c.cible_id, c.dossier_id, dos.titre AS dossier_titre, c.amendement_numero, c.amendement_chambre,
              c.article_numero, c.methode,
              (c.type = 'dossier' AND strpos(lower(ac.objet || ' ' || COALESCE(array_to_string(ac.decisions_concernees, ' '), '')),
                                             lower(dos.titre)) > 0) AS cite,
              ac.entite_id::text AS action_id, ${jour('ac.exercice_debut')} AS debut, ${jour('ac.exercice_fin')} AS fin,
              ac.objet, ac.responsables_publics AS responsables,
              ri.entite_id::text AS representant_id, ri.denomination, ri.categorie,
              (SELECT count(*) FROM canon.action_representation x WHERE x.representant_id = ri.entite_id
                 AND extract(year FROM x.exercice_debut) = extract(year FROM ac.exercice_debut))::int AS actions_declarees,
              ${provenanceSql('ac.entite_id')} AS provenance_action
       FROM c
       JOIN canon.dossier dos ON dos.entite_id::text = c.dossier_id
       JOIN canon.action_representation ac ON ac.entite_id = c.action_id
       JOIN canon.representant_interets ri ON ri.entite_id = ac.representant_id
       WHERE ${filtre} AND ${actif('ac.entite_id')} AND ${actif('ri.entite_id')} AND ${actif('dos.entite_id')}
       ORDER BY ac.exercice_debut DESC NULLS LAST, ri.denomination, ac.entite_id
       LIMIT 50`,
      params,
    );
    return lignes.map((l): LienInteret => {
      const dossier = { id: l.dossier_id, titre: l.dossier_titre };
      const candidat: CibleInteret =
        l.type === 'amendement'
          ? {
              type: 'amendement',
              amendement: { id: l.cible_id, numero: l.amendement_numero ?? '', chambre: l.amendement_chambre === 'SENAT' ? 'SENAT' : 'AN' },
              dossier,
            }
          : l.type === 'article'
            ? { type: 'article', article: { id: l.cible_id, numero: l.article_numero ?? '' }, dossier }
            : { type: 'dossier', dossier };
      const vers: Lien<CibleInteret> = l.cite
        ? {
            statut: 'verifie',
            cible: candidat,
            rapprochement: {
              statut: 'verifie',
              methode: 'reference_explicite',
              motif: 'l’action cite le texte',
              preuve: provenance(l.provenance_action, 'action', l.action_id),
            },
          }
        : {
            statut: 'a_verifier',
            candidat,
            rapprochement: {
              statut: 'a_verifier',
              methode: l.methode === 'meme_sujet' ? 'meme_sujet' : 'meme_sujet_meme_periode',
              motif: l.methode === 'meme_sujet' ? 'même sujet' : 'même sujet, même période',
              avertissement: AVERTISSEMENT,
            },
          };
      return {
        representant: { id: l.representant_id, denomination: l.denomination, categorie: l.categorie },
        action: {
          id: l.action_id,
          periode: { debut: l.debut ?? l.fin ?? '', fin: l.fin },
          objet: l.objet,
          responsables: l.responsables ?? [],
        },
        actionsDeclarees: l.actions_declarees,
        vers,
      };
    });
  }
}
