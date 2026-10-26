// Recherche par familles sur Postgres : une requête par déclinaison (colonnes id, titre, contexte,
// groupe, fiche, filtres, pertinence, date), sans requête (q null) les objets les plus récents de
// la législature, avec requête le plein texte (FTS `french`, préfixes, accents indifférents) des
// colonnes déjà cherchées par `rechercher` (recherche.ts). Les numéros officiels se comparent à la
// forme publiée (majuscules, sans espaces).
//
// Règles propres à l'adaptateur :
//   - Personnes : la fonction (député, sénateur, membre du Gouvernement) en cours depuis le début
//     de la législature ; une personne qui en a eu deux paraît dans les deux déclinaisons.
//   - Chambres : les deux assemblées, fixes (pas de requête).
//   - Interventions : l'index plein texte `texte_recherche` ; sans requête, les plus récentes.
//   - Amendements : par numéro ou par le titre du dossier, tant que leur texte n'a pas d'index
//     plein texte (proposé : colonne `texte_recherche` tsvector + GIN, comme canon.intervention).
//   - Comptes : plafonnés (PLAFOND_COMPTE) en comptant au plus PLAFOND_COMPTE + 1 lignes.

import { PLAFOND_COMPTE, numeroComparable } from '@contrat/domain/familles';
import type { CompteRecherche, DeclinaisonRecherche, NumeroOfficiel, Page, ResultatFamille } from '@contrat/domain/model';
import { famillesDe } from '@contrat/domain/familles';
import { normaliser } from '@contrat/domain/texte';

import type { Pagination, SqlDatabase, SqlParams } from '../../ports';
import { type GroupeLu, groupe } from './personnes';
import { tsquery } from './recherche';
import { DEBUT_L17, estVivante, sqlGroupe, sqlGroupeALaDate } from './scrutins';

/**
 * Entité ni retirée ni fusionnée (G2), vérifiée ligne à ligne par la clé primaire : une jointure
 * avec canon.entite (1,4 million de lignes) la parcourrait en entier à chaque recherche.
 */
const vivanteParLigne = (colonne: string, alias: string) =>
  `JOIN LATERAL (SELECT WHERE NOT EXISTS (SELECT 1 FROM canon.entite e_ WHERE e_.entite_id = ${colonne}
     AND (e_.retiree_de_la_source_le IS NOT NULL OR e_.fusionnee_dans IS NOT NULL))) ${alias} ON true`;

const ACCENTS = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ';
const SANS_ACCENTS = 'aaaaaaceeeeiiiinooooouuuuyy';
const sansAccents = (sql: string) => `translate(lower(${sql}), '${ACCENTS}', '${SANS_ACCENTS}')`;

/** Condition et pertinence d'un texte non indexé, ou vrai / 0 sans requête. */
const correspond = (avecQ: boolean, texte: string) => (avecQ ? `to_tsvector('french', ${sansAccents(texte)}) @@ to_tsquery('french', $qa)` : 'true');
const rang = (avecQ: boolean, texte: string) => (avecQ ? `ts_rank(to_tsvector('french', ${sansAccents(texte)}), to_tsquery('french', $qa))` : '0');
/** La requête telle que saisie ou sans accents, pour une colonne tsvector indexée. */
const QT = `(to_tsquery('french', $q) || to_tsquery('french', $qa))`;

const json = (paires: Record<string, string>) => `json_build_object(${Object.entries(paires).map(([k, v]) => `'${k}', ${v}`).join(', ')})`;
const fiche = (type: string, id: string) => json({ type: `'${type}'`, id });
const L17 = `DATE '${DEBUT_L17}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fonction = (types: string) => (avecQ: boolean) => `
  SELECT p.entite_id::text AS id, p.entite_id AS cle, p.nom_affiche AS titre,
         concat_ws(' · ', CASE f.type
             WHEN 'depute' THEN CASE WHEN p.civilite ~* '^(mme|madame)' THEN 'Députée' ELSE 'Député' END
             WHEN 'senateur' THEN CASE WHEN p.civilite ~* '^(mme|madame)' THEN 'Sénatrice' ELSE 'Sénateur' END
             ELSE f.titre END,
           f.territoire, CASE WHEN f.fin < CURRENT_DATE THEN 'jusqu’au ' || to_char(f.fin, 'DD/MM/YYYY') END) AS contexte,
         ${sqlGroupe('g')} AS groupe, ${fiche('personne', 'p.entite_id')} AS fiche, ${json({ personne: 'p.entite_id' })} AS filtres,
         ${rang(avecQ, 'p.nom_affiche')} AS pertinence, f.debut AS date
  FROM canon.personne p ${vivanteParLigne('p.entite_id', 'xp')}
  JOIN LATERAL (
    SELECT f.type, f.titre, f.territoire, f.debut, f.fin, CASE f.type WHEN 'depute' THEN 'AN' WHEN 'senateur' THEN 'SENAT' END AS chambre
    FROM canon.fonction f
    WHERE f.personne_id = p.entite_id AND f.type IN (${types}) AND (f.fin IS NULL OR f.fin >= ${L17}) AND ${estVivante('f.entite_id')}
    ORDER BY (f.fin IS NULL OR f.fin >= CURRENT_DATE) DESC, f.debut DESC NULLS LAST LIMIT 1) f ON true
  LEFT JOIN LATERAL (SELECT CASE WHEN f.chambre IS NOT NULL THEN ${sqlGroupeALaDate('p.entite_id', 'f.chambre', 'CURRENT_DATE')} END AS id) gi ON true
  LEFT JOIN canon.organisation g ON g.entite_id = gi.id
  WHERE ${correspond(avecQ, 'p.nom_affiche')}`;

const organe = (type: string) => (avecQ: boolean) => `
  SELECT o.entite_id::text AS id, o.entite_id AS cle, o.nom AS titre,
         concat_ws(' · ', CASE o.chambre WHEN 'SENAT' THEN 'Sénat' ELSE 'Assemblée nationale' END,
                   CASE WHEN o.fin IS NOT NULL THEN 'jusqu’au ' || to_char(o.fin, 'DD/MM/YYYY') END) AS contexte,
         NULL::json AS groupe, NULL::json AS fiche, ${json({ chambre: 'o.chambre', organe: 'o.entite_id' })} AS filtres,
         ${rang(avecQ, "o.nom || ' ' || COALESCE(o.abrege, '')")} AS pertinence, o.debut AS date
  FROM canon.organisation o ${vivanteParLigne('o.entite_id', 'xo')}
  WHERE o.type = '${type}' AND o.chambre IN ('AN', 'SENAT') AND (o.fin IS NULL OR o.fin >= ${L17})
    AND ${correspond(avecQ, "o.nom || ' ' || COALESCE(o.abrege, '')")}`;

/** Une requête par déclinaison cherchable. */
const REQUETES_FAMILLES: Partial<Record<DeclinaisonRecherche, (avecQ: boolean) => string>> = {
  dossiers: (avecQ) => `
    SELECT d.entite_id::text AS id, d.entite_id AS cle, d.titre AS titre,
           concat_ws(' · ', d.type_procedure, 'déposé le ' || to_char(d.date_depot, 'DD/MM/YYYY')) AS contexte,
           NULL::json AS groupe, ${fiche('dossier', 'd.entite_id')} AS fiche, ${json({ dossier: 'd.entite_id' })} AS filtres,
           ${rang(avecQ, 'd.titre')} AS pertinence, d.date_depot AS date
    FROM canon.dossier d ${vivanteParLigne('d.entite_id', 'xd')}
    WHERE (d.legislature = '17' OR (d.legislature IS NULL AND d.date_depot >= ${L17})) AND ${correspond(avecQ, 'd.titre')}`,

  articles: (avecQ) => `
    SELECT a.entite_id::text AS id, a.entite_id AS cle, concat_ws(' · ', 'Art. ' || a.numero_initial, a.intitule) AS titre, d.titre AS contexte,
           NULL::json AS groupe, ${fiche('article', 'a.entite_id')} AS fiche, ${json({ dossier: 'd.entite_id', article: 'a.entite_id' })} AS filtres,
           ${rang(avecQ, "concat_ws(' ', 'article', a.numero_initial, a.intitule, d.titre)")} AS pertinence, d.date_depot AS date
    FROM canon.article_suivi a ${vivanteParLigne('a.entite_id', 'xa')}
    JOIN canon.dossier d ON d.entite_id = a.dossier_id AND ${estVivante('d.entite_id')}
    WHERE (d.legislature = '17' OR (d.legislature IS NULL AND d.date_depot >= ${L17}))
      AND ${correspond(avecQ, "concat_ws(' ', 'article', a.numero_initial, a.intitule, d.titre)")}`,

  groupes: (avecQ) => `
    SELECT o.entite_id::text AS id, o.entite_id AS cle, o.nom AS titre,
           concat_ws(' · ', 'Groupe politique', CASE o.chambre WHEN 'SENAT' THEN 'Sénat' ELSE 'Assemblée nationale' END) AS contexte,
           ${sqlGroupe('o')} AS groupe,
           ${json({ type: "'institution'", institution: "CASE o.chambre WHEN 'SENAT' THEN 'senat' ELSE 'an' END" })} AS fiche,
           ${json({ groupe: 'o.entite_id' })} AS filtres,
           ${rang(avecQ, "o.nom || ' ' || COALESCE(o.abrege, '')")} AS pertinence, o.debut AS date
    FROM canon.organisation o ${vivanteParLigne('o.entite_id', 'xo')}
    WHERE o.type = 'groupe_politique' AND o.chambre IN ('AN', 'SENAT')
      AND EXISTS (SELECT 1 FROM canon.fonction f WHERE f.organisation_id = o.entite_id AND f.type = 'membre_groupe'
                    AND (f.fin IS NULL OR f.fin >= ${L17}))
      AND (${avecQ ? `upper(o.abrege) = upper($brut) OR ` : ''}${correspond(avecQ, "o.nom || ' ' || COALESCE(o.abrege, '')")})`,

  deputes: fonction(`'depute'`),
  senateurs: fonction(`'senateur'`),
  ministres: fonction(`'membre_gouvernement'`),

  chambres: (avecQ) => `
    SELECT c.id, NULL::uuid AS cle, c.titre, c.contexte, NULL::json AS groupe,
           ${json({ type: "'institution'", institution: 'c.institution' })} AS fiche, ${json({ chambre: 'c.id' })} AS filtres,
           ${rang(avecQ, 'c.titre')} AS pertinence, NULL::date AS date
    FROM (VALUES ('AN', 'Assemblée nationale', 'Chambre · 577 sièges', 'an'), ('SENAT', 'Sénat', 'Chambre · 348 sièges', 'senat'))
         AS c (id, titre, contexte, institution)
    WHERE ${correspond(avecQ, "c.titre || ' assemblee parlement chambre'")}`,

  commissions: organe('commission'),
  enquetes: organe('commission_enquete'),

  departements: (avecQ) => `
    SELECT o.entite_id::text AS id, o.entite_id AS cle, o.nom AS titre, 'Département · ' || c.id_source AS contexte, NULL::json AS groupe, NULL::json AS fiche,
           ${json({ departement: 'c.id_source' })} AS filtres,
           CASE WHEN c.id_source = $brut THEN 1 ELSE 0 END + ${rang(avecQ, 'o.nom')} AS pertinence, NULL::date AS date
    FROM canon.organisation o ${vivanteParLigne('o.entite_id', 'xo')}
    JOIN canon.correspondance c ON c.entite_id = o.entite_id AND c.systeme = 'INSEE' AND c.statut = 'VERIFIED'
    WHERE o.type = 'departement' AND (${avecQ ? `c.id_source = $brut OR ` : ''}${correspond(avecQ, "o.nom || ' ' || c.id_source")})`,

  votes: (avecQ) => `
    SELECT s.entite_id::text AS id, s.entite_id AS cle, 'Scrutin n° ' || s.numero AS titre,
           concat_ws(' · ', CASE s.chambre WHEN 'SENAT' THEN 'Sénat' ELSE s.chambre END, to_char(s.date, 'DD/MM/YYYY'),
                     CASE WHEN s.sort ~* '^adopt' THEN 'Adopté' WHEN s.sort ~* '^rejet' THEN 'Rejeté' END, s.titre) AS contexte,
           NULL::json AS groupe, ${fiche('scrutin', 's.entite_id')} AS fiche, ${json({ scrutin: 's.entite_id' })} AS filtres,
           ${avecQ ? `CASE WHEN s.numero = $brut THEN 1 ELSE 0 END + ` : ''}${rang(avecQ, 's.titre')} AS pertinence, s.date
    FROM canon.scrutin s ${vivanteParLigne('s.entite_id', 'xs')}
    WHERE (s.legislature = '17' OR (s.legislature IS NULL AND s.chambre = 'SENAT' AND s.date >= ${L17}))
      AND (${avecQ ? `s.numero = $brut OR ` : ''}${correspond(avecQ, 's.titre')})`,

  // Le texte des amendements n'a pas d'index plein texte (5 s par recherche sur le dispositif) :
  // en attendant, un amendement se trouve par son numéro ou par le titre de son dossier.
  amendements: (avecQ) => `
    SELECT a.entite_id::text AS id, a.entite_id AS cle, 'Amendement ' || a.numero AS titre,
           concat_ws(' · ', d.titre, a.division, CASE a.chambre WHEN 'SENAT' THEN 'Sénat' ELSE 'AN' END,
                     CASE a.sort WHEN 'adopte' THEN 'Adopté' WHEN 'rejete' THEN 'Rejeté' WHEN 'retire' THEN 'Retiré' WHEN 'tombe' THEN 'Tombé'
                                 WHEN 'non_soutenu' THEN 'Non soutenu' WHEN 'irrecevable' THEN 'Irrecevable' END) AS contexte,
           NULL::json AS groupe, ${fiche('amendement', 'a.entite_id')} AS fiche, ${json({ amendement: 'a.entite_id' })} AS filtres,
           ${avecQ ? `CASE WHEN upper(a.numero) = upper($brut) THEN 1 ELSE 0 END + ${rang(true, 'd.titre')}` : '0'} AS pertinence,
           a.date_depot AS date
    FROM canon.amendement a ${vivanteParLigne('a.entite_id', 'xa')}
    LEFT JOIN canon.dossier d ON d.entite_id = a.dossier_id AND ${estVivante('d.entite_id')}
    WHERE a.date_depot >= ${L17}
      ${avecQ ? `AND (upper(a.numero) = upper($brut) OR a.dossier_id IN (
        SELECT dq.entite_id FROM canon.dossier dq WHERE (dq.legislature = '17' OR dq.date_depot >= ${L17}) AND ${correspond(true, 'dq.titre')}))` : ''}`,

  interventions: (avecQ) => `
    SELECT i.entite_id::text AS id, i.entite_id AS cle, '« ' || left(regexp_replace(i.texte, '\\s+', ' ', 'g'), 140) || CASE WHEN length(i.texte) > 140 THEN '… »' ELSE ' »' END AS titre,
           concat_ws(' · ', i.orateur_libelle, to_char(r.debut AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY')) AS contexte,
           NULL::json AS groupe, NULL::json AS fiche,
           CASE WHEN i.orateur_id IS NULL AND i.dossier_id IS NULL THEN NULL
                ELSE json_strip_nulls(${json({ personne: 'i.orateur_id', dossier: 'i.dossier_id' })}) END AS filtres,
           ${avecQ ? `ts_rank(i.texte_recherche, ${QT})` : '0'} AS pertinence, r.debut AS date
    FROM canon.intervention i ${vivanteParLigne('i.entite_id', 'xi')}
    JOIN canon.reunion r ON r.entite_id = i.reunion_id
    WHERE r.debut >= ${L17} ${avecQ ? `AND i.texte_recherche @@ ${QT}` : ''}`,

  questions: (avecQ) => `
    SELECT q.entite_id::text AS id, q.entite_id AS cle, concat_ws(' : ', 'Question n° ' || q.numero, q.titre) AS titre,
           concat_ws(' · ', p.nom_affiche, CASE q.chambre WHEN 'SENAT' THEN 'Sénat' ELSE 'AN' END, q.type,
                     CASE WHEN q.date_reponse IS NULL THEN 'sans réponse' ELSE 'répondue le ' || to_char(q.date_reponse, 'DD/MM/YYYY') END) AS contexte,
           ${sqlGroupe('g')} AS groupe, NULL::json AS fiche,
           CASE WHEN q.auteur_id IS NULL THEN NULL ELSE ${json({ personne: 'q.auteur_id' })} END AS filtres,
           ${avecQ ? `CASE WHEN q.numero = $brut THEN 1 ELSE 0 END + ` : ''}${rang(avecQ, "concat_ws(' ', q.titre, q.rubrique)")} AS pertinence, q.date
    FROM canon.question q ${vivanteParLigne('q.entite_id', 'xq')}
    LEFT JOIN canon.personne p ON p.entite_id = q.auteur_id
    LEFT JOIN canon.organisation g ON g.entite_id = q.groupe_auteur_id
    WHERE (q.legislature = '17' OR q.date >= ${L17})
      AND (${avecQ ? `q.numero = $brut OR ` : ''}${correspond(avecQ, "concat_ws(' ', q.titre, q.rubrique)")})`,

  lobbying: (avecQ) => `
    SELECT ri.entite_id::text AS id, ri.entite_id AS cle, COALESCE(ri.nom_usage, ri.denomination) AS titre,
           concat_ws(' · ', 'Représentant d''intérêts', ri.categorie,
                     CASE WHEN act.n > 0 THEN act.n || CASE WHEN act.n > 1 THEN ' actions déclarées' ELSE ' action déclarée' END
                          || ${avecQ ? `' sur ce sujet'` : `''`} END) AS contexte,
           NULL::json AS groupe, ${fiche('representant', 'ri.entite_id')} AS fiche, NULL::json AS filtres,
           ${avecQ ? `CASE WHEN ${correspond(true, "ri.denomination || ' ' || COALESCE(ri.nom_usage, '')")} THEN 1 ELSE 0 END + COALESCE(act.pertinence, 0)` : '0'} AS pertinence,
           act.derniere AS date
    FROM canon.representant_interets ri ${vivanteParLigne('ri.entite_id', 'xr')}
    LEFT JOIN ${
      avecQ
        ? // actions qui correspondent à la requête (index plein texte), agrégées par représentant
          `(SELECT ar.representant_id, count(*) AS n, max(ts_rank(ar.objet_recherche, ${QT})) AS pertinence, max(ar.publiee_le)::date AS derniere
            FROM canon.action_representation ar WHERE ar.objet_recherche @@ ${QT} AND ${estVivante('ar.entite_id')}
            GROUP BY ar.representant_id) act ON act.representant_id = ri.entite_id`
        : // sans requête, seulement pour les représentants montrés (l'identifiant descend jusqu'ici)
          `LATERAL (SELECT count(*) AS n, 0 AS pertinence, max(ar.publiee_le)::date AS derniere
            FROM canon.action_representation ar WHERE ar.representant_id = ri.entite_id AND ${estVivante('ar.entite_id')}) act ON true`
    }
    ${avecQ ? `WHERE act.n > 0 OR ${correspond(true, "ri.denomination || ' ' || COALESCE(ri.nom_usage, '')")}` : ''}`,

  interets: (avecQ) => `
    SELECT dc.entite_id::text AS id, dc.entite_id AS cle,
           concat_ws(' ', COALESCE(dc.type_libelle, 'Déclaration'), 'de', COALESCE(p.nom_affiche, dc.declarant_libelle)) AS titre,
           concat_ws(' · ', 'HATVP', dc.qualite, 'publiée le ' || to_char(dc.date_publication, 'DD/MM/YYYY')) AS contexte,
           NULL::json AS groupe,
           CASE WHEN p.entite_id IS NULL THEN NULL ELSE ${fiche('personne', 'p.entite_id')} END AS fiche,
           CASE WHEN p.entite_id IS NULL THEN NULL ELSE ${json({ personne: 'p.entite_id' })} END AS filtres,
           ${rang(avecQ, "concat_ws(' ', p.nom_affiche, dc.declarant_libelle, dc.type_libelle)")} AS pertinence, dc.date_publication AS date
    FROM canon.declaration dc ${vivanteParLigne('dc.entite_id', 'xdc')}
    LEFT JOIN canon.personne p ON p.entite_id = dc.personne_id AND ${estVivante('p.entite_id')}
    WHERE ${correspond(avecQ, "concat_ws(' ', p.nom_affiche, dc.declarant_libelle, dc.type_libelle)")}`,
};

/**
 * Sans requête, l'ordre de parcours des grandes tables, écrit pour suivre un index de date (la
 * requête générale trierait toute la table) : identifiants seulement, `$limite` et `$decalage`.
 */
const PARCOURIR: Partial<Record<DeclinaisonRecherche, string>> = {
  interventions: `
    SELECT i.entite_id::text AS id FROM canon.reunion r JOIN canon.intervention i ON i.reunion_id = r.entite_id
    WHERE r.debut >= ${L17} AND ${estVivante('i.entite_id')}
    ORDER BY r.debut DESC, i.ordre DESC LIMIT $limite OFFSET $decalage`,
  amendements: `
    SELECT a.entite_id::text AS id FROM canon.amendement a
    WHERE a.date_depot >= ${L17} AND ${estVivante('a.entite_id')}
    ORDER BY a.date_depot DESC, a.entite_id DESC LIMIT $limite OFFSET $decalage`,
  lobbying: `
    SELECT ar.representant_id::text AS id FROM canon.action_representation ar
    WHERE ${estVivante('ar.representant_id')}
    GROUP BY ar.representant_id ORDER BY max(ar.publiee_le) DESC NULLS LAST, ar.representant_id DESC LIMIT $limite OFFSET $decalage`,
  questions: `
    SELECT q.entite_id::text AS id FROM canon.question q
    WHERE (q.legislature = '17' OR q.date >= ${L17}) AND ${estVivante('q.entite_id')}
    ORDER BY q.date DESC NULLS LAST, q.entite_id DESC LIMIT $limite OFFSET $decalage`,
};

interface Ligne {
  id: string;
  titre: string;
  contexte: string;
  groupe: GroupeLu | null;
  fiche: ResultatFamille['fiche'];
  filtres: ResultatFamille['filtres'];
}

export class PgFamilles {
  constructor(private readonly db: SqlDatabase) {}

  /** Paramètres et requête d'une déclinaison ; null si elle n'est pas cherchable ici. */
  private requete(q: string | null, declinaison: DeclinaisonRecherche): { sql: string; params: SqlParams } | null {
    const f = REQUETES_FAMILLES[declinaison];
    if (!f) return null;
    if (!q) return { sql: f(false), params: { $brut: '' } };
    const tq = tsquery(q);
    const qa = tsquery(normaliser(q));
    if (!tq || !qa) return null;
    return { sql: f(true), params: { $brut: q, $q: tq, $qa: qa } };
  }

  async compter(q: string | null, declinaisons: DeclinaisonRecherche[]): Promise<Partial<Record<DeclinaisonRecherche, CompteRecherche>>> {
    const comptes = await Promise.all(
      declinaisons.map(async (d) => {
        const r = this.requete(q, d);
        if (!r) return [d, { nombre: 0, plafonne: false }] as const;
        const l = await this.db.first<{ n: number }>(`SELECT count(*)::int AS n FROM (${r.sql} LIMIT ${PLAFOND_COMPTE + 1}) t`, r.params);
        const n = l?.n ?? 0;
        return [d, { nombre: Math.min(n, PLAFOND_COMPTE), plafonne: n > PLAFOND_COMPTE }] as const;
      }),
    );
    return Object.fromEntries(comptes);
  }

  /**
   * Une page : les identifiants triés (sans requête : les plus récents), puis le détail de ces
   * seuls identifiants (par l'uuid, pour l'index). Avec requête, `total` est compté dans la même
   * lecture (exact) ; sans requête, null : le cœur le compte à part.
   */
  async chercher(q: string | null, declinaison: DeclinaisonRecherche, { page, taille }: Pagination): Promise<Page<ResultatFamille>> {
    const r = this.requete(q, declinaison);
    if (!r) return { elements: [], page, taille, total: 0, suivante: null };
    const pagination = { $limite: taille + 1, $decalage: (page - 1) * taille };
    const ids = await this.db.all<{ id: string; n?: number }>(
      q
        ? `SELECT t.id, count(*) OVER ()::int AS n FROM (${r.sql}) t ORDER BY t.pertinence DESC, t.date DESC NULLS LAST, t.id LIMIT $limite OFFSET $decalage`
        : (PARCOURIR[declinaison] ?? `SELECT t.id FROM (${r.sql}) t ORDER BY t.date DESC NULLS LAST, t.id LIMIT $limite OFFSET $decalage`),
      { ...r.params, ...pagination },
    );
    const montres = ids.slice(0, taille).map((l) => l.id);
    const uuids = montres.filter((id) => UUID.test(id));
    const lignes = montres.length
      ? await this.db.all<Ligne>(
          `SELECT t.id, t.titre, t.contexte, t.groupe, t.fiche, t.filtres FROM (${r.sql}) t
           WHERE ${declinaison === 'chambres' ? 't.id = ANY($ids)' : 't.cle = ANY($uuids::uuid[])'}`,
          { ...r.params, $ids: montres, $uuids: uuids },
        )
      : [];
    const parId = new Map(lignes.map((l) => [l.id, l]));
    return {
      elements: montres.flatMap((id) => (parId.has(id) ? [this.resultat(declinaison, parId.get(id)!)] : [])),
      page,
      taille,
      total: q ? (ids[0]?.n ?? (page === 1 ? 0 : null)) : null,
      suivante: ids.length > taille ? page + 1 : null,
    };
  }

  async candidats(numero: NumeroOfficiel, limite: number): Promise<ResultatFamille[]> {
    const params: SqlParams = { $num: numeroComparable(numero.numero), $limite: limite };
    const requetes: string[] = [];
    if (numero.cibles.includes('amendements')) {
      requetes.push(`SELECT 'amendements' AS declinaison, t.* FROM (${REQUETES_FAMILLES.amendements!(false)}) t
        WHERE t.cle IN (SELECT a.entite_id FROM canon.amendement a
                       WHERE upper(replace(a.numero, ' ', '')) = $num AND a.date_depot >= ${L17})`);
    }
    if (numero.cibles.includes('votes')) {
      requetes.push(`SELECT 'votes' AS declinaison, t.* FROM (${REQUETES_FAMILLES.votes!(false)}) t
        WHERE t.cle IN (SELECT s.entite_id FROM canon.scrutin s WHERE s.numero = $num)`);
    }
    if (numero.cibles.includes('questions')) {
      requetes.push(`SELECT 'questions' AS declinaison, t.* FROM (${REQUETES_FAMILLES.questions!(false)}) t
        WHERE t.cle IN (SELECT q.entite_id FROM canon.question q WHERE q.numero = $num)`);
    }
    if (!requetes.length) return [];
    const lignes = await this.db.all<Ligne & { declinaison: DeclinaisonRecherche }>(
      `SELECT u.declinaison, u.id, u.titre, u.contexte, u.groupe, u.fiche, u.filtres
       FROM (${requetes.join(' UNION ALL ')}) u ORDER BY u.date DESC NULLS LAST, u.id LIMIT $limite`,
      params,
    );
    return lignes.map((l) => this.resultat(l.declinaison, l));
  }

  private resultat(declinaison: DeclinaisonRecherche, l: Ligne): ResultatFamille {
    return {
      famille: famillesDe.get(declinaison)!,
      declinaison,
      id: l.id,
      titre: l.titre,
      contexte: l.contexte,
      groupe: groupe(l.groupe),
      fiche: l.fiche,
      filtres: l.filtres,
    };
  }
}
