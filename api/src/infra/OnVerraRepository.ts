// Adapter du ParlementRepository sur le schéma opendata (opendata/src/schema/*.sql) chargé dans
// Postgres, un schéma par législature : chaque instance lit une seule législature. C'est le seul
// fichier qui connaît ce schéma : quand opendata évoluera, on écrira un autre adapter.

import type {
  Alliance,
  DeputeTrouve,
  FicheGroupe,
  Groupe,
  MembreAssemblee,
  Nature,
  Niveau,
  PeriodeGroupe,
  Position,
  PositionDeGroupe,
  PositionExprimee,
  ScrutinResume,
  VoteDepute,
} from '@contrat/domain/model';
import { SEUIL_VOTE_UNI } from '@contrat/domain/votes';
import type {
  ActiviteBrute,
  EntreeRecherche,
  FiltreScrutins,
  IndicateursDepute,
  MetaBase,
  ParlementRepository,
  SqlDatabase,
  SqlParams,
} from '../ports';

// Un scrutin sans texte rattaché (résolution, déclaration…) prend son intitulé pour titre.
const COLONNES_SCRUTIN = `
  s.uid, s.numero, s.legislature, s.date, s.nature, l.titre AS titre_loi, s.titre AS intitule, s.lecture,
  s.sort, l.niveau, s.loi_id, s.pour, s.contre, s.abstentions`;

interface LigneScrutin {
  uid: string;
  numero: number;
  legislature: string;
  date: string;
  nature: Nature;
  titre_loi: string | null;
  intitule: string;
  lecture: string | null;
  sort: string | null;
  niveau: Niveau | null;
  loi_id: string | null;
  pour: number | null;
  contre: number | null;
  abstentions: number | null;
}

interface LigneGroupe {
  organe_ref: string;
  abrege: string | null;
  libelle: string;
  couleur: string | null;
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const scrutin = (r: LigneScrutin): ScrutinResume => ({
  uid: r.uid,
  numero: r.numero,
  legislature: r.legislature,
  date: r.date,
  nature: r.nature,
  titre: r.titre_loi ?? majuscule(r.intitule.replace(/\s*\([^()]*\)\.?\s*$/, '').replace(/\.$/, '')),
  intitule: r.intitule,
  lecture: r.lecture,
  sort: r.sort,
  niveau: r.niveau,
  loiId: r.loi_id,
  decompte: { pour: r.pour ?? 0, contre: r.contre ?? 0, abstention: r.abstentions ?? 0 },
});

const groupe = (r: LigneGroupe): Groupe => ({
  ref: r.organe_ref,
  abrege: r.abrege ?? r.libelle,
  libelle: r.libelle,
  couleur: r.couleur,
});

const ligne = (l: string | null): PositionExprimee | null =>
  l === 'pour' || l === 'contre' || l === 'abstention' ? l : null;

/** Paramètres nommés pour une liste : `IN ($p0, $p1…)`. */
function liste(prefixe: string, valeurs: readonly string[]): { sql: string; params: SqlParams } {
  const params: SqlParams = {};
  valeurs.forEach((v, i) => (params[`$${prefixe}${i}`] = v));
  return { sql: valeurs.length ? Object.keys(params).join(', ') : 'NULL', params };
}


export class OnVerraRepository implements ParlementRepository {
  constructor(private readonly db: SqlDatabase) {}

  async meta(): Promise<MetaBase> {
    const rows = await this.db.all<{ cle: string; valeur: string }>('SELECT cle, valeur FROM meta');
    const m = Object.fromEntries(rows.map((r) => [r.cle, r.valeur]));
    return { version: Number(m.version ?? 0), date: m.date ?? '', schema: m.schema ?? '' };
  }

  async dernierScrutin(): Promise<ScrutinResume | null> {
    const r = await this.db.first<LigneScrutin>(
      `SELECT ${COLONNES_SCRUTIN} FROM scrutins s LEFT JOIN lois l ON l.id = s.loi_id
       ORDER BY s.date DESC, s.numero DESC LIMIT 1`,
    );
    return r && scrutin(r);
  }

  async scrutin(uid: string): Promise<ScrutinResume | null> {
    const r = await this.db.first<LigneScrutin>(
      `SELECT ${COLONNES_SCRUTIN} FROM scrutins s LEFT JOIN lois l ON l.id = s.loi_id WHERE s.uid = $uid`,
      { $uid: uid },
    );
    return r && scrutin(r);
  }

  async scrutins(f: FiltreScrutins): Promise<ScrutinResume[]> {
    const natures = f.natures ? liste('n', f.natures) : null;
    const rows = await this.db.all<LigneScrutin>(
      `SELECT ${COLONNES_SCRUTIN} FROM scrutins s LEFT JOIN lois l ON l.id = s.loi_id
       WHERE ${natures ? `s.nature IN (${natures.sql})` : 'TRUE'}
         AND (CAST($niveau AS text) IS NULL OR l.niveau = $niveau)
         AND (CAST($resultat AS text) IS NULL OR s.sort LIKE $resultat || '%')
       ORDER BY s.date DESC, s.numero DESC
       LIMIT $limite`,
      {
        ...natures?.params,
        $niveau: f.niveau ?? null,
        $resultat: f.resultat === 'adopte' ? 'adopt' : f.resultat === 'rejete' ? 'rejet' : null,
        $limite: f.limite,
      },
    );
    return rows.map(scrutin);
  }

  entreesRecherche(): Promise<EntreeRecherche[]> {
    return this.db.all(
      `SELECT s.uid, s.date, s.nature, s.sort, l.niveau, COALESCE(l.titre, s.titre) AS titre, s.titre AS intitule
       FROM scrutins s LEFT JOIN lois l ON l.id = s.loi_id
       ORDER BY s.date DESC, s.numero DESC`,
    );
  }

  async scrutinsParUid(uids: string[]): Promise<ScrutinResume[]> {
    if (!uids.length) return [];
    const l = liste('u', uids);
    const rows = await this.db.all<LigneScrutin>(
      `SELECT ${COLONNES_SCRUTIN} FROM scrutins s LEFT JOIN lois l ON l.id = s.loi_id WHERE s.uid IN (${l.sql})`,
      l.params,
    );
    const parUid = new Map(rows.map((r) => [r.uid, scrutin(r)]));
    return uids.flatMap((uid) => parUid.get(uid) ?? []);
  }

  async membres(date: string): Promise<MembreAssemblee[]> {
    // Groupe : appartenance du jour. Siège : celui de son dernier vote du mois écoulé (publié depuis
    // la 17e), sinon le dernier connu du mandat. Un numéro de siège sert à ordonner, pas à dessiner.
    const depuis = new Date(Date.parse(date) - 30 * 86_400_000).toISOString().slice(0, 10);
    return this.db.all<MembreAssemblee>(
      `WITH dernieres AS (
         SELECT DISTINCT ON (v.acteur_ref) v.acteur_ref, v.num_place
         FROM scrutins s JOIN votes v ON v.scrutin_uid = s.uid
         WHERE s.date BETWEEN $depuis AND $date AND v.num_place IS NOT NULL
         ORDER BY v.acteur_ref, s.date DESC
       )
       SELECT DISTINCT ON (m.acteur_ref) m.acteur_ref AS acteur, d.prenom, d.nom, d.civilite, d.departement, d.num_circo AS circonscription,
         (SELECT a.groupe_ref FROM appartenances a
           WHERE a.acteur_ref = m.acteur_ref AND a.date_debut <= $date
             AND (a.date_fin IS NULL OR a.date_fin >= $date)
           ORDER BY a.date_debut DESC LIMIT 1) AS groupe,
         COALESCE(p.num_place, m.place) AS place,
         NULL AS position
       FROM mandats m
       JOIN deputes d ON d.acteur_ref = m.acteur_ref
       LEFT JOIN dernieres p ON p.acteur_ref = m.acteur_ref
       WHERE m.date_debut <= $date AND (m.date_fin IS NULL OR m.date_fin >= $date)
       ORDER BY m.acteur_ref, m.date_debut DESC`,
      { $date: date, $depuis: depuis },
    );
  }

  async groupes(refs: string[]): Promise<Groupe[]> {
    const l = liste('g', refs);
    const rows = await this.db.all<LigneGroupe>(
      `SELECT organe_ref, abrege, libelle, couleur FROM groupes WHERE organe_ref IN (${l.sql})`,
      l.params,
    );
    return rows.map(groupe);
  }

  async positionsDuScrutin(uid: string) {
    const rows = await this.db.all<{ acteur_ref: string; position: Position; groupe_ref: string | null }>(
      'SELECT acteur_ref, position, groupe_ref FROM votes WHERE scrutin_uid = $uid',
      { $uid: uid },
    );
    return new Map(rows.map((r) => [r.acteur_ref, { position: r.position, groupe: r.groupe_ref }]));
  }

  async positionsDesGroupes(uid: string): Promise<PositionDeGroupe[]> {
    const rows = await this.db.all<LigneGroupe & { ligne: string | null; membres: number; pour: number; contre: number; abstentions: number }>(
      `SELECT g.organe_ref, g.abrege, g.libelle, g.couleur, pg.ligne, pg.membres, pg.pour, pg.contre, pg.abstentions
       FROM positions_groupes pg JOIN groupes g ON g.organe_ref = pg.groupe_ref
       WHERE pg.scrutin_uid = $uid`,
      { $uid: uid },
    );
    return rows.map((r) => ({
      groupe: groupe(r),
      ligne: r.abrege === 'NI' ? null : ligne(r.ligne),
      decompte: { pour: r.pour, contre: r.contre, abstention: r.abstentions },
      membres: r.membres,
    }));
  }

  async sansVote(uid: string): Promise<string[]> {
    const rows = await this.db.all<{ acteur_ref: string }>(
      'SELECT DISTINCT acteur_ref FROM sans_vote WHERE scrutin_uid = $uid',
      { $uid: uid },
    );
    return rows.map((r) => r.acteur_ref);
  }

  async groupe(ref: string): Promise<(Groupe & { fin: string | null }) | null> {
    // Fin : dernier jour d'appartenance d'un de ses membres, NULL tant que le groupe existe.
    const r = await this.db.first<LigneGroupe & { fin: string | null }>(
      `SELECT g.organe_ref, g.abrege, g.libelle, g.couleur,
         (SELECT CASE WHEN COUNT(*) = COUNT(a.date_fin) THEN MAX(a.date_fin) END
           FROM appartenances a WHERE a.groupe_ref = g.organe_ref) AS fin
       FROM groupes g WHERE g.organe_ref = $ref`,
      { $ref: ref },
    );
    return r && { ...groupe(r), fin: r.fin };
  }

  async derniersVotesDuGroupe(ref: string, limite: number): Promise<FicheGroupe['derniersVotes']> {
    const rows = await this.db.all<LigneScrutin & { ligne: string | null; membres: number; gp: number; gc: number; ga: number }>(
      `SELECT ${COLONNES_SCRUTIN}, pg.ligne, pg.membres, pg.pour AS gp, pg.contre AS gc, pg.abstentions AS ga
       FROM positions_groupes pg
       JOIN scrutins s ON s.uid = pg.scrutin_uid
       LEFT JOIN lois l ON l.id = s.loi_id
       WHERE pg.groupe_ref = $ref
       ORDER BY s.date DESC, s.numero DESC LIMIT $limite`,
      { $ref: ref, $limite: limite },
    );
    return rows.map((r) => ({
      scrutin: scrutin(r),
      ligne: ligne(r.ligne),
      decompte: { pour: r.gp, contre: r.gc, abstention: r.ga },
      membres: r.membres,
    }));
  }

  async presence(acteurs: string[]): Promise<number | null> {
    if (!acteurs.length) return null;
    const l = liste('a', acteurs);
    // Participation = votes exprimés / scrutins en fonction, hors non-votes statutaires (opendata).
    const r = await this.db.first<{ presence: number | null }>(
      `SELECT AVG(1.0 * exprimes / (scrutins - empeches)) AS presence
       FROM indicateurs_deputes
       WHERE scrutins - empeches > 0 AND acteur_ref IN (${l.sql})`,
      l.params,
    );
    return r?.presence ?? null;
  }

  async voteUni(ref: string): Promise<number | null> {
    const r = await this.db.first<{ uni: number | null }>(
      `SELECT AVG(CASE WHEN GREATEST(pour, contre, abstentions) >= CAST($seuil AS float8) * (pour + contre + abstentions)
                  THEN 1.0 ELSE 0.0 END) AS uni
       FROM positions_groupes WHERE groupe_ref = $ref AND pour + contre + abstentions > 0`,
      { $ref: ref, $seuil: SEUIL_VOTE_UNI },
    );
    return r?.uni ?? null;
  }

  depute(acteur: string) {
    return this.db.first<{
      acteur: string;
      civilite: string | null;
      prenom: string;
      nom: string;
      departement: string | null;
      circonscription: string | null;
    }>(
      `SELECT acteur_ref AS acteur, civilite, prenom, nom, departement, num_circo AS circonscription
       FROM deputes WHERE acteur_ref = $acteur`,
      { $acteur: acteur },
    );
  }

  async dernierVoteDuDepute(acteur: string): Promise<string | null> {
    const r = await this.db.first<{ date: string | null }>(
      `SELECT MAX(s.date) AS date FROM scrutins s
       JOIN mandats m ON m.date_debut <= s.date AND (m.date_fin IS NULL OR m.date_fin >= s.date)
       WHERE m.acteur_ref = $acteur`,
      { $acteur: acteur },
    );
    return r?.date ?? null;
  }

  async votesDuDepute(acteur: string, debut: string, fin: string): Promise<Omit<VoteDepute, 'theme' | 'ecart'>[]> {
    // Chaque scrutin où le député était en fonction : son vote, ou « absent » s'il n'en a pas.
    // Le groupe est celui du moment du vote, et la ligne celle de ce groupe sur ce scrutin.
    const rows = await this.db.all<LigneScrutin & LigneGroupe & { position: Position; ligne: string | null }>(
      `WITH en_fonction AS (
         SELECT DISTINCT ON (s.uid) ${COLONNES_SCRUTIN},
           COALESCE(v.position, 'absent') AS position,
           COALESCE(v.groupe_ref,
             (SELECT a.groupe_ref FROM appartenances a
               WHERE a.acteur_ref = $acteur AND a.date_debut <= s.date
                 AND (a.date_fin IS NULL OR a.date_fin >= s.date)
               ORDER BY a.date_debut DESC LIMIT 1)) AS groupe_ref
         FROM scrutins s
         LEFT JOIN lois l ON l.id = s.loi_id
         JOIN mandats m ON m.acteur_ref = $acteur
           AND m.date_debut <= s.date AND (m.date_fin IS NULL OR m.date_fin >= s.date)
         LEFT JOIN votes v ON v.scrutin_uid = s.uid AND v.acteur_ref = $acteur
         WHERE s.date BETWEEN $debut AND $fin
         ORDER BY s.uid
       )
       SELECT f.*, g.organe_ref, g.abrege, g.libelle, g.couleur,
         CASE WHEN g.abrege != 'NI' THEN pg.ligne END AS ligne
       FROM en_fonction f
       LEFT JOIN groupes g ON g.organe_ref = f.groupe_ref
       LEFT JOIN positions_groupes pg ON pg.scrutin_uid = f.uid AND pg.groupe_ref = f.groupe_ref
       ORDER BY f.date, f.numero`,
      { $acteur: acteur, $debut: debut, $fin: fin },
    );
    return rows.map((r) => ({
      scrutin: scrutin(r),
      position: r.position,
      groupe: r.organe_ref ? groupe(r) : null,
      ligneGroupe: ligne(r.ligne),
    }));
  }

  async parcours(acteur: string): Promise<PeriodeGroupe[]> {
    const rows = await this.db.all<LigneGroupe & { date_debut: string; date_fin: string | null }>(
      `SELECT g.organe_ref, g.abrege, g.libelle, g.couleur, a.date_debut, a.date_fin
       FROM appartenances a JOIN groupes g ON g.organe_ref = a.groupe_ref
       WHERE a.acteur_ref = $acteur
       ORDER BY a.date_debut`,
      { $acteur: acteur },
    );
    return rows.map((r) => ({ groupe: groupe(r), debut: r.date_debut, fin: r.date_fin }));
  }

  async deputes(): Promise<DeputeTrouve[]> {
    const rows = await this.db.all<LigneGroupe & {
      acteur: string;
      prenom: string;
      nom: string;
      departement: string | null;
      num_departement: string | null;
      circonscription: string | null;
      legislature: string;
    }>(
      `WITH d AS (
         SELECT d.acteur_ref AS acteur, d.prenom, d.nom, d.departement, d.num_departement,
           d.num_circo AS circonscription,
           (SELECT MAX(m.legislature) FROM mandats m WHERE m.acteur_ref = d.acteur_ref) AS legislature,
           (SELECT a.groupe_ref FROM appartenances a WHERE a.acteur_ref = d.acteur_ref
             ORDER BY a.date_debut DESC LIMIT 1) AS groupe_ref
         FROM deputes d
       )
       SELECT d.*, g.organe_ref, g.abrege, g.libelle, g.couleur
       FROM d LEFT JOIN groupes g ON g.organe_ref = d.groupe_ref
       ORDER BY d.nom, d.prenom`,
    );
    return rows.map((r) => ({
      acteur: r.acteur,
      prenom: r.prenom,
      nom: r.nom,
      legislature: r.legislature,
      departement: r.departement,
      numDepartement: r.num_departement,
      circonscription: r.circonscription,
      groupe: r.organe_ref ? groupe(r) : null,
    }));
  }

  async alliances(ref: string): Promise<Alliance[]> {
    // Scrutins où les deux groupes ont une ligne (position la plus fréquente, sans égalité).
    const rows = await this.db.all<LigneGroupe & { scrutins: number; accords: number }>(
      `SELECT g.organe_ref, g.abrege, g.libelle, g.couleur, COUNT(*) AS scrutins,
         COUNT(*) FILTER (WHERE a.ligne = b.ligne) AS accords
       FROM positions_groupes a
       JOIN positions_groupes b ON b.scrutin_uid = a.scrutin_uid AND b.groupe_ref != a.groupe_ref
       JOIN groupes g ON g.organe_ref = b.groupe_ref
       WHERE a.groupe_ref = $ref AND a.ligne IS NOT NULL AND b.ligne IS NOT NULL AND g.abrege != 'NI'
       GROUP BY g.organe_ref, g.abrege, g.libelle, g.couleur`,
      { $ref: ref },
    );
    return rows
      .map((r) => ({ groupe: groupe(r), accord: r.accords / r.scrutins, scrutins: r.scrutins }))
      .sort((a, b) => b.accord - a.accord);
  }

  presenceMensuelle(ref: string, mois: number): Promise<{ mois: string; presence: number }[]> {
    // Votes exprimés du groupe / membres du groupe, sur tous ses scrutins du mois.
    return this.db.all(
      `SELECT substr(s.date, 1, 7) AS mois,
         1.0 * SUM(pg.pour + pg.contre + pg.abstentions) / SUM(pg.membres) AS presence
       FROM positions_groupes pg JOIN scrutins s ON s.uid = pg.scrutin_uid
       WHERE pg.groupe_ref = $ref AND pg.membres > 0
       GROUP BY 1 ORDER BY 1 DESC LIMIT $mois`,
      { $ref: ref, $mois: mois },
    );
  }

  async motionsSoutenues(ref: string, seuil: number): Promise<{ soutenues: number; total: number }> {
    const r = await this.db.first<{ soutenues: number; total: number }>(
      `SELECT COUNT(*) AS total,
         COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM votes_censure v
                                 WHERE v.scrutin_uid = m.scrutin_uid AND v.groupe_ref = $ref) >= CAST($seuil AS float8))
           AS soutenues
       FROM motions_censure m`,
      { $ref: ref, $seuil: seuil },
    );
    return { soutenues: r?.soutenues ?? 0, total: r?.total ?? 0 };
  }

  async indicateurs(acteurs: string[]): Promise<Map<string, IndicateursDepute>> {
    const l = liste('a', acteurs);
    const rows = await this.db.all<IndicateursDepute & { acteur_ref: string; exprimes_en_groupe: number }>(
      `SELECT acteur_ref, scrutins, empeches, exprimes, exprimes_en_groupe, dissidences
       FROM indicateurs_deputes WHERE acteur_ref IN (${l.sql})`,
      l.params,
    );
    return new Map(rows.map((r) => [r.acteur_ref, { ...r, exprimesEnGroupe: r.exprimes_en_groupe }]));
  }

  async mouvements(ref: string): Promise<{ arrivees: number; departs: number }> {
    // Arrivées : appartenances commencées plus d'un mois après la création du groupe.
    const r = await this.db.first<{ arrivees: number; departs: number }>(
      `WITH a AS (SELECT * FROM appartenances WHERE groupe_ref = $ref)
       SELECT COUNT(*) FILTER (WHERE date_debut >
                to_char(CAST((SELECT MIN(date_debut) FROM a) AS date) + interval '1 month', 'YYYY-MM-DD')) AS arrivees,
              COUNT(date_fin) AS departs
       FROM a`,
      { $ref: ref },
    );
    return { arrivees: r?.arrivees ?? 0, departs: r?.departs ?? 0 };
  }

  async votesDuGroupe(ref: string, debut: string, fin: string): Promise<FicheGroupe['derniersVotes']> {
    const rows = await this.db.all<LigneScrutin & { ligne: string | null; membres: number; gp: number; gc: number; ga: number }>(
      `SELECT ${COLONNES_SCRUTIN}, pg.ligne, pg.membres, pg.pour AS gp, pg.contre AS gc, pg.abstentions AS ga
       FROM positions_groupes pg
       JOIN scrutins s ON s.uid = pg.scrutin_uid
       LEFT JOIN lois l ON l.id = s.loi_id
       WHERE pg.groupe_ref = $ref AND s.date BETWEEN $debut AND $fin
       ORDER BY s.date DESC, s.numero DESC`,
      { $ref: ref, $debut: debut, $fin: fin },
    );
    return rows.map((r) => ({
      scrutin: scrutin(r),
      ligne: ligne(r.ligne),
      decompte: { pour: r.gp, contre: r.gc, abstention: r.ga },
      membres: r.membres,
    }));
  }

  titres(): Promise<{ titre: string; scrutins: number }[]> {
    return this.db.all(
      `SELECT COALESCE(l.titre, s.titre) AS titre, COUNT(*) AS scrutins
       FROM scrutins s LEFT JOIN lois l ON l.id = s.loi_id GROUP BY 1`,
    );
  }

  activite(debut: string, fin: string): Promise<ActiviteBrute[]> {
    // Agrégats calculés par opendata (table activite_deputes, par député, mois et texte visé).
    return this.db.all(
      `SELECT a.acteur_ref AS acteur, a.cle, MAX(COALESCE(l.titre, s.titre)) AS titre,
         SUM(a.votes) AS votes, SUM(a.exprimes) AS exprimes, SUM(a.pour) AS pour, SUM(a.ecarts) AS ecarts
       FROM activite_deputes a
       LEFT JOIN lois l ON l.id = a.cle
       LEFT JOIN scrutins s ON s.uid = a.cle
       WHERE a.mois BETWEEN substr($debut, 1, 7) AND substr($fin, 1, 7)
       GROUP BY a.acteur_ref, a.cle`,
      { $debut: debut, $fin: fin },
    );
  }

  scrutinsEntre(debut: string, fin: string): Promise<{ date: string; cle: string; titre: string }[]> {
    return this.db.all(
      `SELECT s.date, COALESCE(s.loi_id, s.uid) AS cle, COALESCE(l.titre, s.titre) AS titre
       FROM scrutins s LEFT JOIN lois l ON l.id = s.loi_id
       WHERE s.date BETWEEN $debut AND $fin ORDER BY s.date`,
      { $debut: debut, $fin: fin },
    );
  }

  mandats(): Promise<{ acteur: string; debut: string; fin: string | null }[]> {
    return this.db.all('SELECT acteur_ref AS acteur, date_debut AS debut, date_fin AS fin FROM mandats');
  }
}
