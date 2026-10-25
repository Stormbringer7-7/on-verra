// Adaptateur Postgres du ScrutinsRepository : scrutins publics de l'AN et du Sénat (`canon.scrutin`),
// votes nominatifs (`canon.vote`), positions de groupe recalculées depuis les votes, participation
// comparée au groupe le même jour (`lecture.participation_scrutin`) et mises au point de vote
// (`canon.lien` nature `mise_au_point` : un fait distinct, le vote enregistré n'est jamais modifié).
//
// Exporte aussi les fragments SQL communs aux adaptateurs de ce lot (discussions, recherche) :
// entité vivante (G2), provenance (G3), groupe, existence d'une projection `lecture.*`.

import type {
  AmendementRef,
  Ancre,
  ArticleRef,
  CleCase,
  Decompte,
  ExplicationVote,
  FicheScrutin,
  GroupeRef,
  NatureScrutin,
  ObjetScrutin,
  Position,
  PositionDeGroupe,
  PositionExprimee,
  Provenance,
  ScrutinResume,
  VoteDifferent,
  VoteIndividuel,
} from '@contrat/domain/model';
import { exprimes, majoritaire } from '@contrat/domain/votes';
import type { ScrutinsRepository, SqlDatabase, SqlParams } from '../../ports';

// ---------- Fragments communs (discussions.ts, recherche.ts) ----------

/** Début de la 17e législature (G6) : borne des données du Sénat, qui ne portent pas de législature. */
export const DEBUT_L17 = '2024-07-18';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant qui n'est pas un UUID ne désigne aucune entité (G5) : inutile d'interroger la base. */
export const estUuid = (id: string): boolean => UUID.test(id);

/** Jointure qui ne garde que les entités ni retirées de la source ni fusionnées (G2). */
export const vivante = (colonne: string, alias: string) =>
  `JOIN canon.entite ${alias} ON ${alias}.entite_id = ${colonne}
     AND ${alias}.retiree_de_la_source_le IS NULL AND ${alias}.fusionnee_dans IS NULL`;

/** Condition équivalente, pour un LEFT JOIN ou un EXISTS. */
export const estVivante = (colonne: string) =>
  `EXISTS (SELECT 1 FROM canon.entite x WHERE x.entite_id = ${colonne}
     AND x.retiree_de_la_source_le IS NULL AND x.fusionnee_dans IS NULL)`;

/**
 * Provenance (JSON) d'une entité : sa correspondance VERIFIED (G3). URL : celle de la
 * correspondance, sinon celle du document source (`canon.provenance`) quand c'est une page et pas
 * l'archive d'un jeu de données ; jamais inventée. Sans correspondance : identifiant CivicTrace.
 */
export const sqlProvenance = (colonne: string, type: string) => `COALESCE(
  (SELECT json_build_object('systeme', c.systeme, 'type', c.type_source, 'idNatif', c.id_source,
     'url', COALESCE(c.url, (SELECT p.url FROM canon.provenance p
                             WHERE p.entite_id = c.entite_id AND p.url IS NOT NULL AND p.url !~* '\\.zip$'
                             ORDER BY p.vu_le DESC LIMIT 1)))
   FROM canon.correspondance c WHERE c.entite_id = ${colonne} AND c.statut = 'VERIFIED'
   ORDER BY c.cree_le, c.systeme LIMIT 1),
  json_build_object('systeme', 'CIVICTRACE', 'type', '${type}', 'idNatif', ${colonne}::text, 'url', NULL))`;

/** GroupeRef (JSON) d'une organisation `o` (null si absente) ; abrégé : publié, sinon nom court, sinon nom. */
export const sqlGroupe = (o: string) =>
  `CASE WHEN ${o}.entite_id IS NULL THEN NULL ELSE json_build_object('id', ${o}.entite_id,
     'abrege', COALESCE(${o}.abrege, ${o}.nom_court, ${o}.nom), 'libelle', ${o}.nom, 'couleur', ${o}.couleur,
     'chambre', ${o}.chambre) END`;

/**
 * Groupe d'une personne à une date, dans une chambre : appartenance datée publiée
 * (`lecture.appartenance_groupe`), la plus récente si deux se chevauchent. Rend `groupe_id`.
 */
export const sqlGroupeALaDate = (personne: string, chambre: string, date: string) =>
  `(SELECT a.groupe_id FROM lecture.appartenance_groupe a
     WHERE a.personne_id = ${personne} AND a.chambre = ${chambre} AND ${date} BETWEEN a.debut AND a.fin
       AND ${estVivante('a.groupe_id')}
     ORDER BY a.debut DESC LIMIT 1)`;

/**
 * Les projections `lecture.*` sont recréées en fin de chargement : une table peut manquer un temps
 * (ou n'avoir jamais été projetée). Leur présence est relue au plus toutes les minutes.
 */
export class Projections {
  private readonly vues = new Map<string, { le: number; existe: Promise<boolean> }>();

  constructor(private readonly db: SqlDatabase) {}

  existe(table: string): Promise<boolean> {
    const vue = this.vues.get(table);
    if (vue && Date.now() - vue.le < 60_000) return vue.existe;
    const existe = this.db
      .first<{ oid: string | null }>('SELECT to_regclass($table)::text AS oid', { $table: table })
      .then((r) => r?.oid != null)
      .catch(() => false);
    this.vues.set(table, { le: Date.now(), existe });
    return existe;
  }
}

/** Case du parcours (JSON { cle, libelle }) où a eu lieu l'acte `etape` du dossier `dossier`. */
export const sqlCaseDeLEtape = (dossier: string, etape: string) =>
  `(SELECT json_build_object('cle', pa.cle, 'libelle', pd.libelle)
    FROM lecture.parcours_acte pa
    JOIN lecture.parcours_dossier pd ON pd.dossier_id = pa.dossier_id AND pd.cle = pa.cle
    WHERE pa.dossier_id = ${dossier} AND pa.etape_id = ${etape} AND pa.cle IS NOT NULL LIMIT 1)`;

/**
 * DossierRef (JSON) d'un dossier `d` vivant, sinon null. Titre : `titre` publié ; `titre_court` n'est
 * pas un titre affichable en base (chemin AN « projet_loi_urgence_… », fragment Sénat « (délit de) »).
 */
export const sqlDossierRef = (d: string) =>
  `CASE WHEN ${d}.entite_id IS NOT NULL AND ${estVivante(`${d}.entite_id`)}
     THEN json_build_object('id', ${d}.entite_id, 'titre', ${d}.titre) END`;

/** Numéro d'un article suivi dans sa version la plus récente, sinon son numéro initial. */
export const sqlNumeroArticle = (articleSuivi: string) =>
  `COALESCE((SELECT va.numero FROM canon.version_article va
              JOIN canon.version_texte vt ON vt.entite_id = va.version_texte_id
              WHERE va.article_suivi_id = ${articleSuivi}
              ORDER BY vt.date DESC NULLS LAST, va.ordre DESC LIMIT 1),
            (SELECT ars.numero_initial FROM canon.article_suivi ars WHERE ars.entite_id = ${articleSuivi}))`;

// ---------- Scrutins ----------

/** 17e législature : l'AN publie la législature ; le Sénat, non (G6). */
const EN_L17 = `(s.legislature = '17' OR (s.legislature IS NULL AND s.chambre = 'SENAT' AND s.date >= DATE '${DEBUT_L17}'))`;

/**
 * Participation du jour (`lecture.participation_scrutin`) : une ligne par mandat en cours, donc
 * parfois deux pour une même personne (mandats publiés qui se chevauchent) : une seule est gardée.
 */
const participationDe = (scrutin: string, personne: string) =>
  `LEFT JOIN LATERAL (SELECT ps.personne_id, ps.groupe_id FROM lecture.participation_scrutin ps
     WHERE ps.scrutin_id = ${scrutin} AND ps.personne_id = ${personne}
     ORDER BY ps.groupe_id IS NULL, ps.groupe_id LIMIT 1) ps ON true`;

/** Parlementaires en mandat le jour du scrutin $scrutin, une ligne par personne (alias ps). */
const EN_MANDAT = `(SELECT DISTINCT ON (ps.personne_id) ps.scrutin_id, ps.personne_id, ps.groupe_id
  FROM lecture.participation_scrutin ps WHERE ps.scrutin_id = $scrutin::uuid
  ORDER BY ps.personne_id, ps.groupe_id IS NULL, ps.groupe_id) ps`;

const NATURES: readonly NatureScrutin[] = ['ensemble', 'article_unique', 'article', 'amendement', 'motion', 'motion_censure', 'autre'];

interface LigneScrutin {
  id: string;
  chambre: 'AN' | 'SENAT';
  numero: string;
  date: string;
  nature: string | null;
  titre: string;
  sort: string | null;
  pour: number | null;
  contre: number | null;
  abstentions: number | null;
  dossier: ScrutinResume['dossier'];
  etape: { cle: CleCase; libelle: string } | null;
}

const colonnesScrutin = (avecParcours: boolean) => `
  s.entite_id AS id, s.chambre, s.numero, s.date::text AS date, s.nature, s.titre, s.sort,
  s.pour, s.contre, s.abstentions,
  ${sqlDossierRef('d')} AS dossier,
  ${avecParcours ? `CASE WHEN s.etape_id IS NOT NULL THEN ${sqlCaseDeLEtape('s.dossier_id', 's.etape_id')} END` : 'NULL'} AS etape`;

const FROM_SCRUTIN = `FROM canon.scrutin s ${vivante('s.entite_id', 'xs')}
  LEFT JOIN canon.dossier d ON d.entite_id = s.dossier_id`;

/** Tri du plus récent au plus ancien ; même jour : numéro décroissant (numérique). */
const ORDRE_SCRUTIN = `s.date DESC, length(s.numero) DESC, s.numero DESC`;

/** « adopté », « rejeté » publiés ; le Sénat ne publie pas de sort dans `scr` : null. */
const adopte = (sort: string | null): boolean | null =>
  sort == null ? null : /^adopt/i.test(sort) ? true : /^rejet/i.test(sort) ? false : null;

export const resumeScrutin = (r: LigneScrutin): ScrutinResume => ({
  id: r.id,
  chambre: r.chambre,
  numero: r.numero,
  date: r.date,
  nature: NATURES.includes(r.nature as NatureScrutin) ? (r.nature as NatureScrutin) : 'autre',
  intitule: r.titre,
  enClair: null,
  sort: r.sort,
  adopte: adopte(r.sort),
  decompte: { pour: r.pour ?? 0, contre: r.contre ?? 0, abstention: r.abstentions ?? 0 },
  dossier: r.dossier,
  etape: r.etape,
});

/** « l'article 7 », « l'article 5 quater A » dans l'intitulé publié : la division votée, telle quelle. */
const DIVISION = /\bl['’]article (\d+(?:er)?(?: (?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?(?: [A-Z]{1,3})?)\b/i;

const POSITIONS_EXPRIMEES = ['pour', 'contre', 'abstention'] as const;
const estExprimee = (p: string): p is PositionExprimee => (POSITIONS_EXPRIMEES as readonly string[]).includes(p);

/** Mise au point publiée (attributs du lien), en clair : ce que le député a fait savoir, à côté du vote. */
const VOULAIT: Record<string, string> = {
  pour: 'voter pour',
  contre: 'voter contre',
  abstention: 's’abstenir',
  non_votant: 'ne pas prendre part au vote',
  non_votant_volontaire: 'ne pas prendre part au vote, volontairement',
};

export const libelleMiseAuPoint = (attributs: { position?: string; dysfonctionnement?: boolean } | null): string | null => {
  if (!attributs?.position) return null;
  const voulait = VOULAIT[attributs.position] ?? attributs.position;
  return `Selon la mise au point publiée, voulait ${voulait}${attributs.dysfonctionnement ? ' (dysfonctionnement du vote signalé)' : ''}`;
};

interface LigneVote {
  personne_id: string;
  nom: string;
  position: Exclude<Position, 'absent'>;
  groupe_id: string | null;
}

/**
 * Ordre « de la gauche vers la droite » : le siège de chaque votant (numPlace) n'est pas chargé dans
 * `canon`, donc le rang suit un ordre stable (abrégé), les non-inscrits en dernier. Ce n'est pas
 * une position politique : la donnée ne la donne pas.
 */
const NON_INSCRITS = /^(NI|NIPOL|AUCUN)$/;
const rangDeGroupe = (a: GroupeRef, b: GroupeRef) =>
  Number(NON_INSCRITS.test(a.abrege)) - Number(NON_INSCRITS.test(b.abrege)) || a.abrege.localeCompare(b.abrege, 'fr');

export class PgScrutins implements ScrutinsRepository {
  private readonly projections: Projections;

  constructor(private readonly db: SqlDatabase) {
    this.projections = new Projections(db);
  }

  private async liste(where: string, params: SqlParams, limite: number | null) {
    const avecParcours = await this.parcoursCharge();
    const lignes = await this.db.all<LigneScrutin>(
      `SELECT ${colonnesScrutin(avecParcours)} ${FROM_SCRUTIN}
       WHERE ${EN_L17} AND ${where} ORDER BY ${ORDRE_SCRUTIN}${limite == null ? '' : ' LIMIT $limite'}`,
      limite == null ? params : { ...params, $limite: limite },
    );
    return lignes.map(resumeScrutin);
  }

  private async parcoursCharge(): Promise<boolean> {
    const [acte, dossier] = await Promise.all([
      this.projections.existe('lecture.parcours_acte'),
      this.projections.existe('lecture.parcours_dossier'),
    ]);
    return acte && dossier;
  }

  async entre(debut: string, fin: string, limite: number): Promise<ScrutinResume[]> {
    return this.liste('s.date BETWEEN $debut::date AND $fin::date', { $debut: debut, $fin: fin }, limite);
  }

  async duDossier(dossier: string, cle?: CleCase): Promise<ScrutinResume[]> {
    if (!estUuid(dossier)) return [];
    if (!cle) return this.liste('s.dossier_id = $dossier::uuid', { $dossier: dossier }, null);
    // Une case : par l'étape que le scrutin cite (AN). Le Sénat ne publie pas l'étape d'un scrutin.
    if (!(await this.projections.existe('lecture.parcours_acte'))) return [];
    return this.liste(
      `s.dossier_id = $dossier::uuid AND s.etape_id IN (
         SELECT pa.etape_id FROM lecture.parcours_acte pa WHERE pa.dossier_id = $dossier::uuid AND pa.cle = $cle)`,
      { $dossier: dossier, $cle: cle },
      null,
    );
  }

  async surAmendement(amendement: string): Promise<ScrutinResume | null> {
    if (!estUuid(amendement)) return null;
    return (await this.liste('s.amendement_id = $amendement::uuid', { $amendement: amendement }, 1))[0] ?? null;
  }

  async fiche(id: string): Promise<Omit<FicheScrutin, 'barre'> | null> {
    if (!estUuid(id)) return null;
    const avecParcours = await this.parcoursCharge();
    const ligne = await this.db.first<
      LigneScrutin & {
        etape_id: string | null;
        non_votants: number | null;
        provenance: Provenance;
        amendement: (AmendementRef & { article: ArticleRef | null }) | null;
      }
    >(
      `SELECT ${colonnesScrutin(avecParcours)}, s.etape_id, s.non_votants,
              ${sqlProvenance('s.entite_id', 'scrutin')} AS provenance,
              (SELECT json_build_object('id', a.entite_id, 'numero', a.numero, 'chambre', a.chambre,
                        'article', CASE WHEN a.article_suivi_id IS NOT NULL AND ${estVivante('a.article_suivi_id')}
                                        THEN json_build_object('id', a.article_suivi_id,
                                               'numero', ${sqlNumeroArticle('a.article_suivi_id')}) END)
                 FROM canon.amendement a WHERE a.entite_id = s.amendement_id AND ${estVivante('a.entite_id')}) AS amendement
       ${FROM_SCRUTIN}
       WHERE s.entite_id = $id::uuid AND ${EN_L17}`,
      { $id: id },
    );
    if (!ligne) return null;
    const scrutin = resumeScrutin(ligne);

    const [votes, absents, compteRendu] = await Promise.all([
      this.votes(id),
      this.absentsParGroupe(id),
      this.compteRendu(ligne.etape_id, ligne.date),
    ]);
    const groupes = await this.groupes([...new Set([...votes.map((v) => v.groupe_id), ...absents.keys()])]);

    const parGroupe = new Map<string, { decompte: Decompte; nonVotants: number; votes: LigneVote[] }>();
    for (const v of votes) {
      if (!v.groupe_id || !groupes.has(v.groupe_id)) continue;
      const g = parGroupe.get(v.groupe_id) ?? { decompte: { pour: 0, contre: 0, abstention: 0 }, nonVotants: 0, votes: [] };
      if (estExprimee(v.position)) g.decompte[v.position]++;
      else g.nonVotants++;
      g.votes.push(v);
      parGroupe.set(v.groupe_id, g);
    }
    const ordre = [...new Set([...parGroupe.keys(), ...[...absents.keys()].filter((g): g is string => g !== null)])]
      .filter((g) => groupes.has(g))
      .map((g) => groupes.get(g)!)
      .sort(rangDeGroupe);

    const positions: PositionDeGroupe[] = ordre.map((groupe, rang) => {
      const g = parGroupe.get(groupe.id) ?? { decompte: { pour: 0, contre: 0, abstention: 0 }, nonVotants: 0, votes: [] };
      const abs = absents.get(groupe.id) ?? 0;
      return {
        groupe,
        rang,
        ligne: majoritaire(g.decompte),
        decompte: g.decompte,
        nonVotants: g.nonVotants,
        absents: abs,
        membres: exprimes(g.decompte) + g.nonVotants + abs,
      };
    });

    // Votes exprimés différents de la ligne : seulement dans un groupe à majorité nette.
    const differents: VoteDifferent[] = [];
    for (const p of positions) {
      if (!p.ligne) continue;
      for (const v of parGroupe.get(p.groupe.id)?.votes ?? []) {
        if (estExprimee(v.position) && v.position !== p.ligne) {
          differents.push({
            personne: { id: v.personne_id, nom: v.nom, fonction: null, groupe: p.groupe },
            position: v.position,
            ligneDuGroupe: p.ligne,
          });
        }
      }
    }

    return {
      scrutin,
      objet: objetDuScrutin(scrutin.nature, ligne.amendement, ligne.titre),
      sens: { pour: null, contre: null },
      nonVotants: ligne.non_votants ?? votes.filter((v) => v.position === 'non_votant').length,
      absents: [...absents.values()].reduce((a, b) => a + b, 0),
      groupes: positions,
      votesDifferents: { total: differents.length, personnes: differents },
      compteRendu,
      provenance: ligne.provenance,
    };
  }

  /** Votes nominatifs ; groupe : celui publié avec le vote (AN), sinon l'appartenance du jour (Sénat). */
  private async votes(scrutin: string): Promise<LigneVote[]> {
    const participation = await this.projections.existe('lecture.participation_scrutin');
    return this.db.all<LigneVote>(
      `SELECT v.personne_id, p.nom_affiche AS nom, v.position,
              COALESCE(v.groupe_id, ${participation ? 'ps.groupe_id' : 'NULL'}) AS groupe_id
       FROM canon.vote v
       JOIN canon.personne p ON p.entite_id = v.personne_id ${vivante('v.personne_id', 'xp')}
       ${participation ? participationDe('v.scrutin_id', 'v.personne_id') : ''}
       WHERE v.scrutin_id = $scrutin::uuid
       ORDER BY p.nom, p.prenom`,
      { $scrutin: scrutin },
    );
  }

  /** Parlementaires en mandat ce jour-là sans vote publié, par groupe du jour (null : sans groupe). */
  private async absentsParGroupe(scrutin: string): Promise<Map<string | null, number>> {
    if (!(await this.projections.existe('lecture.participation_scrutin'))) return new Map();
    const lignes = await this.db.all<{ groupe_id: string | null; absents: number }>(
      `SELECT ps.groupe_id, count(*) AS absents
       FROM ${EN_MANDAT} ${vivante('ps.personne_id', 'xp')}
       WHERE NOT EXISTS (SELECT 1 FROM canon.vote v WHERE v.scrutin_id = ps.scrutin_id AND v.personne_id = ps.personne_id)
       GROUP BY ps.groupe_id`,
      { $scrutin: scrutin },
    );
    return new Map(lignes.map((l) => [l.groupe_id, l.absents]));
  }

  private async groupes(ids: (string | null)[]): Promise<Map<string, GroupeRef>> {
    const connus = ids.filter((g): g is string => g !== null);
    if (!connus.length) return new Map();
    const lignes = await this.db.all<{ groupe: GroupeRef }>(
      `SELECT ${sqlGroupe('o')} AS groupe FROM canon.organisation o ${vivante('o.entite_id', 'xo')}
       WHERE o.entite_id = ANY($ids::uuid[])`,
      { $ids: connus },
    );
    return new Map(lignes.map((l) => [l.groupe.id, l.groupe]));
  }

  /**
   * Compte rendu de la séance du vote : la réunion que cite l'acte du scrutin (AN, `reunionRef`),
   * le jour du scrutin, si elle est unique. Le Sénat ne publie pas l'étape d'un scrutin : null.
   */
  private async compteRendu(etape: string | null, date: string): Promise<Ancre | null> {
    if (!etape) return null;
    const lignes = await this.db.all<{ url: string | null; provenance: Provenance }>(
      `SELECT d.url, ${sqlProvenance('d.entite_id', 'compte_rendu')} AS provenance
       FROM canon.document d ${vivante('d.entite_id', 'xd')}
       WHERE d.entite_id IN (
         SELECT r.compte_rendu_id FROM canon.lien l
         JOIN canon.reunion r ON r.entite_id = l.vers_id ${vivante('r.entite_id', 'xr')}
         WHERE l.de_id = $etape::uuid AND l.nature = 'reunion'
           AND (r.debut AT TIME ZONE 'Europe/Paris')::date = $date::date)`,
      { $etape: etape, $date: date },
    );
    return lignes.length === 1 ? { url: lignes[0].url, ancre: null, provenance: lignes[0].provenance } : null;
  }

  async vote(scrutin: string, personne: string): Promise<{ vote: VoteIndividuel; groupe: ExplicationVote['groupe'] } | null> {
    if (!estUuid(scrutin) || !estUuid(personne)) return null;
    const participation = await this.projections.existe('lecture.participation_scrutin');
    const ligne = await this.db.first<{
      position: Exclude<Position, 'absent'> | null;
      par_delegation: boolean | null;
      en_mandat: boolean;
      groupe_id: string | null;
      mise_au_point: { position?: string; dysfonctionnement?: boolean } | null;
    }>(
      `SELECT v.position, v.par_delegation,
              ${participation ? 'ps.personne_id IS NOT NULL' : 'false'} AS en_mandat,
              COALESCE(v.groupe_id, ${participation ? 'ps.groupe_id' : 'NULL'},
                       ${sqlGroupeALaDate('$personne::uuid', 's.chambre', 's.date')}) AS groupe_id,
              (SELECT l.attributs FROM canon.lien l
                WHERE l.de_id = s.entite_id AND l.nature = 'mise_au_point' AND l.vers_id = $personne::uuid) AS mise_au_point
       FROM canon.scrutin s ${vivante('s.entite_id', 'xs')}
       JOIN canon.personne p ON p.entite_id = $personne::uuid ${vivante('p.entite_id', 'xp')}
       LEFT JOIN canon.vote v ON v.scrutin_id = s.entite_id AND v.personne_id = p.entite_id
       ${participation ? participationDe('s.entite_id', 'p.entite_id') : ''}
       WHERE s.entite_id = $scrutin::uuid AND ${EN_L17}`,
      { $scrutin: scrutin, $personne: personne },
    );
    if (!ligne || (!ligne.position && !ligne.en_mandat && !ligne.mise_au_point)) return null;
    const position: Position = ligne.position ?? 'absent';
    const vote: VoteIndividuel = {
      position,
      parDelegation: ligne.par_delegation ?? false,
      miseAuPoint: libelleMiseAuPoint(ligne.mise_au_point),
    };
    if (!ligne.groupe_id) return { vote, groupe: null };

    const [groupe] = [...(await this.groupes([ligne.groupe_id])).values()];
    if (!groupe) return { vote, groupe: null };
    const comptes = await this.db.all<{ position: Position; n: number }>(
      `SELECT v.position, count(*) AS n
       FROM canon.vote v ${vivante('v.personne_id', 'xp')}
       ${participation ? participationDe('v.scrutin_id', 'v.personne_id') : ''}
       WHERE v.scrutin_id = $scrutin::uuid AND COALESCE(v.groupe_id, ${participation ? 'ps.groupe_id' : 'NULL'}) = $groupe::uuid
       GROUP BY v.position
       ${participation ? `UNION ALL
       SELECT 'absent', count(*) FROM ${EN_MANDAT} ${vivante('ps.personne_id', 'xa')}
       WHERE ps.groupe_id = $groupe::uuid
         AND NOT EXISTS (SELECT 1 FROM canon.vote v WHERE v.scrutin_id = ps.scrutin_id AND v.personne_id = ps.personne_id)` : ''}`,
      { $scrutin: scrutin, $groupe: ligne.groupe_id },
    );
    const n = (p: Position) => comptes.filter((c) => c.position === p).reduce((a, c) => a + c.n, 0);
    const decompte: Decompte = { pour: n('pour'), contre: n('contre'), abstention: n('abstention') };
    const ligneGroupe = majoritaire(decompte);
    const total = exprimes(decompte);
    return {
      vote,
      groupe: {
        groupe,
        ligne: ligneGroupe,
        partLigne: ligneGroupe && total ? Math.round((100 * decompte[ligneGroupe]) / total) : null,
        memePosition: n(position),
        exprimes: total,
      },
    };
  }

  /**
   * Derniers votes exprimés à l'inverse de la ligne du groupe (position majoritaire recalculée,
   * `canon.position_groupe`) : même règle que `lecture.vote_et_groupe.ecart`, lue par les index de
   * `canon.vote` (la projection n'est pas indexée par personne).
   */
  async derniersEcarts(personne: string, limite: number): Promise<ScrutinResume[]> {
    if (!estUuid(personne)) return [];
    return this.liste(
      `s.entite_id IN (
         SELECT v.scrutin_id FROM canon.vote v
         JOIN canon.position_groupe pg ON pg.scrutin_id = v.scrutin_id AND pg.groupe_id = v.groupe_id
         WHERE v.personne_id = $personne::uuid AND v.position IN ('pour', 'contre', 'abstention')
           AND pg.position_majoritaire IS NOT NULL AND v.position <> pg.position_majoritaire)`,
      { $personne: personne },
      limite,
    );
  }
}

/** Ce que le scrutin met aux voix : l'amendement relié (lien explicite), la division citée, le texte, une motion. */
function objetDuScrutin(
  nature: NatureScrutin,
  amendement: (AmendementRef & { article: ArticleRef | null }) | null,
  titre: string,
): ObjetScrutin {
  if (amendement) {
    const { article, ...ref } = amendement;
    return { type: 'amendement', amendement: ref, article };
  }
  switch (nature) {
    case 'ensemble':
    case 'article_unique':
      return { type: 'texte' };
    case 'motion':
    case 'motion_censure':
      return { type: 'motion' };
    case 'article': {
      const division = DIVISION.exec(titre);
      return { type: 'article', article: null, division: division ? `Article ${division[1]}` : null };
    }
    default:
      // Amendement sans lien certain (plusieurs amendements identiques, numéro ambigu) : on ne choisit pas.
      return { type: 'autre' };
  }
}
