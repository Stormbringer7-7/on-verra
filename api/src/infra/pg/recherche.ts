// Adaptateur Postgres du RechercheRepository : recherche plein texte (FTS `french`, préfixes) dans
// les dossiers, personnes, amendements, scrutins et organisations (représentants d'intérêts, aussi
// par l'objet de leurs actions déclarées, et groupes politiques). Sans accents ni casse : les textes
// sans index sont comparés sans accents des deux côtés ; les colonnes indexées (`objet_recherche`)
// le sont avec la requête telle que saisie et sans accents.
// Les interventions (`canon.intervention.texte_recherche`) ne sont pas un type de résultat du contrat.

import type { DeclinaisonRecherche, DemandeRecherche, NumeroOfficiel, ResultatRecherche, Trouve, TypeRecherche } from '@contrat/domain/model';
import type { FiltresRecherche } from '@contrat/domain/familles';
import { normaliser } from '@contrat/domain/texte';
import type { Pagination, RechercheRepository, SqlDatabase, SqlParams } from '../../ports';
import { PgFamilles } from './familles';
import { DEBUT_L17, estVivante, sqlGroupe, sqlGroupeALaDate, vivante } from './scrutins';

const TYPES: readonly TypeRecherche[] = ['dossiers', 'personnes', 'amendements', 'scrutins', 'organisations'];

const ACCENTS = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ';
const SANS_ACCENTS = 'aaaaaaceeeeiiiinooooouuuuyy';
const sansAccents = (sql: string) => `translate(lower(${sql}), '${ACCENTS}', '${SANS_ACCENTS}')`;

/** Vecteur sans accents d'un texte non indexé, comparé à la requête sans accents ($qa). */
const correspond = (texte: string) => `to_tsvector('french', ${sansAccents(texte)}) @@ to_tsquery('french', $qa)`;
const rang = (texte: string) => `ts_rank(to_tsvector('french', ${sansAccents(texte)}), to_tsquery('french', $qa))`;

/** Requête tsquery : chaque mot en préfixe, tous requis (« souverain agri » → souverain:* & agri:*). */
const VOYELLES: Record<string, string> = {
  a: '[aàâäáãå]', c: '[cç]', e: '[eéèêë]', i: '[iíìîï]', n: '[nñ]', o: '[oóòôöõ]', u: '[uúùûü]', y: '[yýÿ]',
};

/** Début (4 lettres) de chaque mot de la requête sans accents ($qa), accents indifférents : « souv », « [aàâ…]gr[iíì…] ». */
export function prefixes(qa: string): string[] {
  return (qa.match(/[\p{L}\p{N}]+/gu) ?? []).map((m) => [...m.slice(0, 4)].map((c) => VOYELLES[c] ?? c).join(''));
}

export function tsquery(texte: string): string | null {
  const mots = texte.match(/[\p{L}\p{N}]+/gu) ?? [];
  return mots.length ? mots.map((m) => `${m}:*`).join(' & ') : null;
}

const SORTS: Record<string, string> = {
  adopte: 'Adopté',
  rejete: 'Rejeté',
  retire: 'Retiré',
  tombe: 'Tombé',
  non_soutenu: 'Non soutenu',
  irrecevable: 'Irrecevable',
  en_attente: 'En attente',
};

/** Une requête par type : colonnes (id, titre, contexte, groupe, pertinence) et la condition. */
const REQUETES: Record<TypeRecherche, string> = {
  dossiers: `
    SELECT d.entite_id AS id, d.titre AS titre,
           concat_ws(' · ', d.type_procedure, 'déposé le ' || to_char(d.date_depot, 'DD/MM/YYYY')) AS contexte,
           NULL::json AS groupe, ${rang('d.titre')} AS pertinence,
           d.date_depot AS date
    FROM canon.dossier d ${vivante('d.entite_id', 'xd')}
    WHERE (d.legislature = '17' OR (d.legislature IS NULL AND d.date_depot >= DATE '${DEBUT_L17}'))
      AND ${correspond('d.titre')}`,

  // Personnes en fonction depuis le début de la législature (député, sénateur, Gouvernement).
  personnes: `
    SELECT p.entite_id AS id, p.nom_affiche AS titre,
           concat_ws(' · ', CASE f.type
               WHEN 'depute' THEN CASE WHEN p.civilite ~* '^(mme|madame)' THEN 'Députée' ELSE 'Député' END
               WHEN 'senateur' THEN CASE WHEN p.civilite ~* '^(mme|madame)' THEN 'Sénatrice' ELSE 'Sénateur' END
               ELSE f.titre END,
             f.territoire,
             CASE WHEN f.fin < CURRENT_DATE THEN 'jusqu’au ' || to_char(f.fin, 'DD/MM/YYYY') END) AS contexte,
           ${sqlGroupe('g')} AS groupe, ${rang('p.nom_affiche')} AS pertinence, f.debut AS date
    FROM canon.personne p ${vivante('p.entite_id', 'xp')}
    JOIN LATERAL (
      SELECT f.type, f.titre, f.territoire, f.debut, f.fin, CASE f.type WHEN 'depute' THEN 'AN' WHEN 'senateur' THEN 'SENAT' END AS chambre
      FROM canon.fonction f
      WHERE f.personne_id = p.entite_id AND f.type IN ('depute', 'senateur', 'membre_gouvernement')
        AND (f.fin IS NULL OR f.fin >= DATE '${DEBUT_L17}') AND ${estVivante('f.entite_id')}
      ORDER BY (f.fin IS NULL OR f.fin >= CURRENT_DATE) DESC, f.debut DESC NULLS LAST LIMIT 1) f ON true
    LEFT JOIN LATERAL (SELECT CASE WHEN f.chambre IS NOT NULL
      THEN ${sqlGroupeALaDate('p.entite_id', 'f.chambre', 'CURRENT_DATE')} END AS id) gi ON true
    LEFT JOIN canon.organisation g ON g.entite_id = gi.id
    WHERE ${correspond('p.nom_affiche')}`,

  // Numéro tel que publié, division visée, dispositif (HTML : les balises ne sont pas des mots).
  // Aucun index plein texte sur le dispositif : un préfiltre par expression régulière (début de
  // chaque mot, accents indifférents) évite de calculer le vecteur des 170 000 amendements.
  amendements: `
    SELECT a.entite_id AS id, 'Amendement ' || a.numero AS titre,
           concat_ws(' · ', a.numero, CASE a.chambre WHEN 'SENAT' THEN 'Sénat' END, a.division,
                     CASE a.sort ${Object.entries(SORTS).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(' ')} ELSE a.sort END,
                     d.titre) AS contexte,
           NULL::json AS groupe,
           CASE WHEN upper(a.numero) = upper($brut) THEN 1 ELSE 0 END
             + ts_rank(to_tsvector('french', concat_ws(' ', a.numero, a.division, a.dispositif)), $qt) AS pertinence,
           a.date_depot AS date
    FROM canon.amendement a ${vivante('a.entite_id', 'xa')}
    LEFT JOIN canon.dossier d ON d.entite_id = a.dossier_id AND ${estVivante('d.entite_id')}
    WHERE upper(a.numero) = upper($brut)
       OR ($prefiltre AND to_tsvector('french', concat_ws(' ', a.numero, a.division, a.dispositif)) @@ $qt)`,

  // Intitulé officiel ; « 7259 » trouve le scrutin n° 7259. Le Sénat ne publie pas le sort : pas de verdict.
  scrutins: `
    SELECT s.entite_id AS id, 'Scrutin n° ' || s.numero AS titre,
           concat_ws(' · ', CASE s.chambre WHEN 'SENAT' THEN 'Sénat' ELSE s.chambre END, to_char(s.date, 'DD/MM/YYYY'),
                     CASE WHEN s.sort ~* '^adopt' THEN 'Adopté ' WHEN s.sort ~* '^rejet' THEN 'Rejeté ' ELSE 'Pour ' END
                       || COALESCE(s.pour, 0) || ' – ' || COALESCE(s.contre, 0)) AS contexte,
           NULL::json AS groupe,
           CASE WHEN s.numero = $brut THEN 1 ELSE 0 END + ${rang('s.titre')} AS pertinence, s.date
    FROM canon.scrutin s ${vivante('s.entite_id', 'xs')}
    WHERE (s.legislature = '17' OR (s.legislature IS NULL AND s.chambre = 'SENAT' AND s.date >= DATE '${DEBUT_L17}'))
      AND (s.numero = $brut OR ${correspond('s.titre')})`,

  // Représentants d'intérêts (nom, ou objet d'une action déclarée) et groupes politiques de la législature.
  organisations: `
    SELECT ri.entite_id AS id, COALESCE(ri.nom_usage, ri.denomination) AS titre,
           concat_ws(' · ', 'Représentant d''intérêts', ri.categorie,
                     CASE WHEN act.n > 0 THEN act.n || CASE WHEN act.n > 1 THEN ' actions déclarées' ELSE ' action déclarée' END
                          || ' sur ce sujet' END) AS contexte,
           NULL::json AS groupe,
           CASE WHEN ${correspond("ri.denomination || ' ' || COALESCE(ri.nom_usage, '')")} THEN 1 ELSE 0 END
             + COALESCE(act.pertinence, 0) AS pertinence,
           act.derniere AS date
    FROM canon.representant_interets ri ${vivante('ri.entite_id', 'xr')}
    LEFT JOIN (
      SELECT ar.representant_id, count(*) AS n, max(ts_rank(ar.objet_recherche, $qt)) AS pertinence,
             max(ar.publiee_le)::date AS derniere
      FROM canon.action_representation ar ${vivante('ar.entite_id', 'xar')}
      WHERE ar.objet_recherche @@ $qt GROUP BY ar.representant_id) act ON act.representant_id = ri.entite_id
    WHERE act.n > 0 OR ${correspond("ri.denomination || ' ' || COALESCE(ri.nom_usage, '')")}
    UNION ALL
    SELECT o.entite_id, o.nom, concat_ws(' · ', 'Groupe politique', CASE o.chambre WHEN 'SENAT' THEN 'Sénat' ELSE o.chambre END),
           ${sqlGroupe('o')}, 1 + ${rang("o.nom || ' ' || COALESCE(o.abrege, '')")}, o.debut
    FROM canon.organisation o ${vivante('o.entite_id', 'xo')}
    WHERE o.type = 'groupe_politique' AND o.chambre IN ('AN', 'SENAT')
      AND EXISTS (SELECT 1 FROM canon.fonction f WHERE f.organisation_id = o.entite_id AND f.type = 'membre_groupe'
                    AND (f.fin IS NULL OR f.fin >= DATE '${DEBUT_L17}'))
      AND (upper(o.abrege) = upper($brut) OR ${correspond("o.nom || ' ' || COALESCE(o.abrege, '')")})`,
};

export class PgRecherche implements RechercheRepository {
  private readonly familles: PgFamilles;

  constructor(private readonly db: SqlDatabase) {
    this.familles = new PgFamilles(db);
  }

  compterFamilles(q: string | null, declinaisons: DeclinaisonRecherche[], filtres?: FiltresRecherche) {
    return this.familles.compter(q, declinaisons, filtres);
  }

  chercherDeclinaison(q: string | null, declinaison: DeclinaisonRecherche, pagination: Pagination, filtres?: FiltresRecherche) {
    return this.familles.chercher(q, declinaison, pagination, filtres);
  }

  nommerPersonne(id: string) {
    return this.familles.personne(id);
  }

  candidatsNumero(numero: NumeroOfficiel, limite: number) {
    return this.familles.candidats(numero, limite);
  }

  async rechercher(demande: DemandeRecherche, pagination: Pagination): Promise<ResultatRecherche> {
    const type = demande.type ?? null;
    const brut = demande.q.trim();
    const q = tsquery(brut);
    const qa = tsquery(normaliser(brut));
    if (!q || !qa) return { q: demande.q, type, sections: [] };
    // Sans type : la première page de chaque type, sans compte exact.
    const types = type ? [type] : TYPES;
    const params: SqlParams = { $brut: brut, $q: q, $qa: qa };
    const sections = await Promise.all(
      types.map(async (t) => ({ type: t, resultats: await this.section(t, params, type ? pagination : { page: 1, taille: pagination.taille }, type !== null) })),
    );
    return { q: demande.q, type, sections: sections.filter((s) => s.resultats.elements.length > 0) };
  }

  private async section(type: TypeRecherche, params: SqlParams, { page, taille }: Pagination, compter: boolean) {
    // $qt : la requête telle que saisie ou sans accents, pour les textes indexés ou non normalisés.
    const motifs = prefixes(String(params.$qa));
    const sql = REQUETES[type]
      .replaceAll('$qt', `(to_tsquery('french', $q) || to_tsquery('french', $qa))`)
      .replaceAll('$prefiltre', `(${motifs.map((_, i) => `concat_ws(' ', a.numero, a.division, a.dispositif) ~* $motif${i}`).join(' AND ')})`);
    for (const [i, m] of motifs.entries()) params = { ...params, [`$motif${i}`]: m };
    const lignes = await this.db.all<{ id: string; titre: string; contexte: string; groupe: Trouve['groupe']; total: number }>(
      `SELECT t.id, t.titre, t.contexte, t.groupe${compter ? ', count(*) OVER () AS total' : ''}
       FROM (${sql}) t
       ORDER BY t.pertinence DESC, t.date DESC NULLS LAST, t.titre, t.id
       LIMIT $limite OFFSET $decalage`,
      { ...params, $limite: taille + 1, $decalage: (page - 1) * taille },
    );
    const elements: Trouve[] = lignes.slice(0, taille).map((l) => ({
      type,
      id: l.id,
      titre: l.titre,
      contexte: l.contexte,
      groupe: l.groupe,
      ...(type === 'personnes' ? { identite: 'personne' as const } : {}),
    }));
    return {
      elements,
      page,
      taille,
      total: compter ? (lignes[0]?.total ?? (page === 1 ? 0 : null)) : null,
      suivante: lignes.length > taille ? page + 1 : null,
    };
  }
}
