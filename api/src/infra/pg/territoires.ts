// Adaptateur Postgres du port TerritoiresRepository : projections `lecture.departement`,
// `lecture.elu_departement`, `lecture.carte_scrutin`, `lecture.presence_departement` et
// `lecture.presence_elu` (opendata, projections/65_territoires.sql). Tant qu'elles ne sont pas en
// base, listes vides et fiches null (pas d'erreur).
//
// Fonction affichée d'un élu : « Député · Gironde, 2e circ. » / « Sénatrice · Gironde », composée de
// la chambre, de la civilité publiée et du département publié par la chambre.

import type {
  Chambre,
  DepartementRef,
  EluDuDepartement,
  FicheDepartement,
  Indicateur,
  PersonneRef,
  Position,
  ValeurCirconscription,
  VotesDepartement,
} from '@contrat/domain/model';

import type { SqlDatabase, TerritoiresRepository } from '../../ports';
import { type GroupeLu, groupe, groupeALaDateSql } from './personnes';
import { PgScrutins, Projections, estUuid } from './scrutins';

const NE_DIT_PAS = [
  'Les votes à main levée ne sont pas nominatifs : ils ne comptent pas.',
  'Une délégation de vote compte comme une participation.',
  'La présence en commission ou en séance sans scrutin public n’est pas mesurée.',
];

const TABLES = ['lecture.departement', 'lecture.elu_departement', 'lecture.carte_scrutin', 'lecture.presence_departement', 'lecture.presence_elu'];

interface LignePresence {
  taux: number;
  taux_attendu: number | null;
  occasions: number;
  debut: string;
  fin: string;
}

/** Participation des élus d'un département, comparée à celle de leurs groupes sur les mêmes scrutins. */
export const presenceDepartement = (l: LignePresence): Indicateur => ({
  libelle: 'Participation aux scrutins publics',
  valeur: l.taux,
  unite: 'pourcentage',
  denominateur: { valeur: l.occasions, libelle: 'votes possibles des élus du département' },
  reference: { libelle: 'Attendu : la participation de leurs groupes sur les mêmes scrutins', valeur: l.taux_attendu },
  ceQueLaDonneeNeDitPas: NE_DIT_PAS,
  periode: { debut: l.debut, fin: l.fin },
  calcul: 'lecture.presence_departement',
});

/** La même mesure pour un élu. */
export const presenceElu = (l: LignePresence): Indicateur => ({
  libelle: 'Participation aux scrutins publics',
  valeur: l.taux,
  unite: 'pourcentage',
  denominateur: { valeur: l.occasions, libelle: 'scrutins publics de sa chambre' },
  reference: { libelle: 'Attendu : la participation de son groupe sur les mêmes scrutins', valeur: l.taux_attendu },
  ceQueLaDonneeNeDitPas: NE_DIT_PAS,
  periode: { debut: l.debut, fin: l.fin },
  calcul: 'lecture.presence_elu',
});

const feminin = (civilite: string | null) => !!civilite && /^(mme|mlle|madame)/i.test(civilite.trim());

/** « Député · Gironde, 2e circ. », « Sénatrice · Gironde ». */
export function fonctionTerritoriale(chambre: Chambre, civilite: string | null, departement: string, circonscription: string | null): string {
  const f = feminin(civilite);
  const titre = chambre === 'AN' ? (f ? 'Députée' : 'Député') : f ? 'Sénatrice' : 'Sénateur';
  const circo = circonscription ? `, ${circonscription}${circonscription === '1' ? 're' : 'e'} circ.` : '';
  return `${titre} · ${departement}${circo}`;
}

const chambreDe = (v: string): Chambre => (v === 'SENAT' ? 'SENAT' : 'AN');

export class PgTerritoires implements TerritoiresRepository {
  private readonly projections: Projections;
  private readonly scrutins: PgScrutins;

  constructor(private readonly db: SqlDatabase) {
    this.projections = new Projections(db);
    this.scrutins = new PgScrutins(db);
  }

  private async charge(): Promise<boolean> {
    return (await Promise.all(TABLES.map((t) => this.projections.existe(t)))).every(Boolean);
  }

  async carteScrutin(scrutin: string) {
    if (!estUuid(scrutin)) return null;
    const [resume] = await this.scrutins.resumes([scrutin]);
    if (!resume) return null;
    if (!(await this.charge())) return { scrutin: resume, departements: [], horsDepartement: 0 };
    const [lignes, total] = await Promise.all([
      this.db.all<{ code: string; nom: string } & Record<'membres' | 'pour' | 'contre' | 'abstention' | 'non_votants' | 'absents', number>>(
        `SELECT c.code, d.nom, c.membres, c.pour, c.contre, c.abstention, c.non_votants, c.absents
         FROM lecture.carte_scrutin c JOIN lecture.departement d ON d.code = c.code
         WHERE c.scrutin_id = $scrutin::uuid ORDER BY c.code`,
        { scrutin },
      ),
      this.db.first<{ n: number }>(`SELECT count(*)::int AS n FROM lecture.participation_scrutin WHERE scrutin_id = $scrutin::uuid`, { scrutin }),
    ]);
    const departements = lignes.map((l) => ({
      departement: { code: l.code, nom: l.nom },
      votes: { membres: l.membres, pour: l.pour, contre: l.contre, abstention: l.abstention, nonVotants: l.non_votants, absents: l.absents },
    }));
    const localises = lignes.reduce((n, l) => n + l.membres, 0);
    return { scrutin: resume, departements, horsDepartement: Math.max(0, (total?.n ?? 0) - localises) };
  }

  async circonscriptionsScrutin(scrutin: string): Promise<ValeurCirconscription[] | null> {
    if (!estUuid(scrutin)) return null;
    const [resume] = await this.scrutins.resumes([scrutin]);
    if (!resume) return null;
    if (resume.chambre !== 'AN' || !(await this.charge())) return [];
    // Circonscriptions du découpage de 2010 (en vigueur depuis juin 2012) : celles des mandats qui
    // finissent après le 20/06/2012 ; le député du jour, le plus récent si deux mandats se chevauchent.
    const lignes = await this.db.all<{
      code: string;
      departement: string;
      numero: number;
      id: string | null;
      nom: string | null;
      civilite: string | null;
      position: string | null;
      groupe: GroupeLu | null;
    }>(
      `WITH s AS (SELECT entite_id, date FROM canon.scrutin WHERE entite_id = $scrutin::uuid),
       circos AS (
         SELECT DISTINCT e.code, e.circonscription::int AS numero FROM lecture.elu_departement e
         WHERE e.chambre = 'AN' AND e.fin >= DATE '2012-06-20' AND e.circonscription ~ '^[0-9]+$'
       ), depute AS (
         SELECT DISTINCT ON (e.code, e.circonscription::int) e.code, e.circonscription::int AS numero, e.personne_id
         FROM lecture.elu_departement e JOIN s ON s.date BETWEEN e.debut AND e.fin
         WHERE e.chambre = 'AN' AND e.circonscription ~ '^[0-9]+$'
         ORDER BY e.code, e.circonscription::int, e.debut DESC
       )
       SELECT c.code, d.nom AS departement, c.numero, p.entite_id AS id, p.nom_affiche AS nom, p.civilite, v.position,
              CASE WHEN p.entite_id IS NOT NULL THEN (${groupeALaDateSql('p.entite_id', "'AN'", 's.date')})::jsonb END AS groupe
       FROM circos c CROSS JOIN s
       JOIN lecture.departement d ON d.code = c.code
       LEFT JOIN depute dp ON dp.code = c.code AND dp.numero = c.numero
       LEFT JOIN canon.personne p ON p.entite_id = dp.personne_id
       LEFT JOIN canon.vote v ON v.scrutin_id = s.entite_id AND v.personne_id = dp.personne_id
       ORDER BY c.code, c.numero`,
      { scrutin },
    );
    const positions: Position[] = ['pour', 'contre', 'abstention', 'non_votant'];
    return lignes.map((l) => {
      const circonscription = { code: `${l.code}-${String(l.numero).padStart(2, '0')}`, departement: { code: l.code, nom: l.departement }, numero: l.numero };
      if (!l.id || !l.nom) return { circonscription, depute: null, position: null };
      return {
        circonscription,
        depute: { id: l.id, nom: l.nom, fonction: fonctionTerritoriale('AN', l.civilite, l.departement, String(l.numero)), groupe: groupe(l.groupe) },
        position: (positions.includes(l.position as Position) ? l.position : 'absent') as Position,
      };
    });
  }

  async cartePresence(chambre: Chambre) {
    if (!(await this.charge())) return { departements: [], horsDepartement: 0 };
    const [lignes, hors] = await Promise.all([
      this.db.all<LignePresence & { code: string; nom: string }>(
        `SELECT p.code, d.nom, p.taux, p.taux_attendu, p.occasions::int AS occasions, p.debut::text AS debut, p.fin::text AS fin
         FROM lecture.presence_departement p JOIN lecture.departement d ON d.code = p.code
         WHERE p.chambre = $chambre ORDER BY p.code`,
        { chambre },
      ),
      this.db.first<{ n: number }>(
        `SELECT count(DISTINCT m.personne_id)::int AS n FROM lecture.mandat_parlementaire m
         WHERE m.chambre = $chambre AND CURRENT_DATE BETWEEN m.debut AND m.fin
           AND NOT EXISTS (SELECT 1 FROM lecture.elu_departement e WHERE e.personne_id = m.personne_id
                           AND e.chambre = m.chambre AND CURRENT_DATE BETWEEN e.debut AND e.fin)`,
        { chambre },
      ),
    ]);
    return {
      departements: lignes.map((l) => ({ departement: { code: l.code, nom: l.nom }, presence: presenceDepartement(l) })),
      horsDepartement: hors?.n ?? 0,
    };
  }

  private async departementRef(code: string): Promise<DepartementRef | null> {
    if (!(await this.charge())) return null;
    return this.db.first<DepartementRef>(`SELECT code, nom FROM lecture.departement WHERE code = $code`, { code });
  }

  async departement(code: string): Promise<Omit<FicheDepartement, 'scrutin' | 'limites'> | null> {
    const departement = await this.departementRef(code);
    if (!departement) return null;
    const [elus, presence] = await Promise.all([
      this.db.all<{
        id: string;
        nom: string;
        civilite: string | null;
        chambre: string;
        circonscription: string | null;
        groupe: GroupeLu | null;
        taux: number | null;
        taux_attendu: number | null;
        occasions: number | null;
        debut: string | null;
        fin: string | null;
      }>(
        `SELECT p.entite_id AS id, p.nom_affiche AS nom, p.civilite, e.chambre, e.circonscription,
                (${groupeALaDateSql('p.entite_id', 'e.chambre', 'CURRENT_DATE')})::jsonb AS groupe,
                pe.taux, pe.taux_attendu, pe.occasions::int AS occasions, pe.debut::text AS debut, pe.fin::text AS fin
         FROM lecture.elu_departement e
         JOIN canon.personne p ON p.entite_id = e.personne_id
         LEFT JOIN lecture.presence_elu pe ON pe.personne_id = e.personne_id AND pe.chambre = e.chambre
         WHERE e.code = $code AND CURRENT_DATE BETWEEN e.debut AND e.fin
           AND NOT EXISTS (SELECT 1 FROM canon.entite x WHERE x.entite_id = p.entite_id
                           AND (x.retiree_de_la_source_le IS NOT NULL OR x.fusionnee_dans IS NOT NULL))
         ORDER BY e.chambre, NULLIF(e.circonscription, '')::int NULLS LAST, p.nom_affiche`,
        { code },
      ),
      this.db.all<LignePresence & { chambre: string }>(
        `SELECT chambre, taux, taux_attendu, occasions::int AS occasions, debut::text AS debut, fin::text AS fin
         FROM lecture.presence_departement WHERE code = $code ORDER BY chambre`,
        { code },
      ),
    ]);
    const vus = new Set<string>();
    const liste: EluDuDepartement[] = [];
    for (const l of elus) {
      if (vus.has(`${l.id}|${l.chambre}`)) continue;
      vus.add(`${l.id}|${l.chambre}`);
      const chambre = chambreDe(l.chambre);
      const personne: PersonneRef = {
        id: l.id,
        nom: l.nom,
        fonction: fonctionTerritoriale(chambre, l.civilite, departement.nom, l.circonscription),
        groupe: groupe(l.groupe),
      };
      const participation =
        l.taux !== null && l.occasions !== null && l.debut && l.fin
          ? presenceElu({ taux: l.taux, taux_attendu: l.taux_attendu, occasions: l.occasions, debut: l.debut, fin: l.fin })
          : null;
      liste.push({ personne, chambre, circonscription: l.circonscription, participation });
    }
    return {
      departement,
      elus: liste,
      presence: presence.map((p) => ({ chambre: chambreDe(p.chambre), indicateur: presenceDepartement(p) })),
    };
  }

  async votesDepartement(code: string, scrutin: string): Promise<FicheDepartement['scrutin']> {
    if (!estUuid(scrutin)) return null;
    const [resume] = await this.scrutins.resumes([scrutin]);
    const departement = await this.departementRef(code);
    if (!resume || !departement) return null;
    const lignes = await this.db.all<{ id: string; nom: string; civilite: string | null; circonscription: string | null; position: string | null; groupe: GroupeLu | null }>(
      `SELECT pe.entite_id AS id, pe.nom_affiche AS nom, pe.civilite, e.circonscription, v.position,
              (${groupeALaDateSql('pe.entite_id', 'p.chambre', 'p.date')})::jsonb AS groupe
       FROM lecture.participation_scrutin p
       JOIN lecture.elu_departement e ON e.personne_id = p.personne_id AND e.chambre = p.chambre
            AND p.date BETWEEN e.debut AND e.fin AND e.code = $code
       JOIN canon.personne pe ON pe.entite_id = p.personne_id
       LEFT JOIN canon.vote v ON v.scrutin_id = p.scrutin_id AND v.personne_id = p.personne_id
       WHERE p.scrutin_id = $scrutin::uuid
       ORDER BY NULLIF(e.circonscription, '')::int NULLS LAST, pe.nom_affiche`,
      { code, scrutin },
    );
    const positions: Position[] = ['pour', 'contre', 'abstention', 'non_votant'];
    const elus = lignes.map((l) => ({
      personne: {
        id: l.id,
        nom: l.nom,
        fonction: fonctionTerritoriale(resume.chambre, l.civilite, departement.nom, l.circonscription),
        groupe: groupe(l.groupe),
      },
      position: (positions.includes(l.position as Position) ? l.position : 'absent') as Position,
    }));
    const compte = (p: Position) => elus.filter((e) => e.position === p).length;
    const votes: VotesDepartement = {
      membres: elus.length,
      pour: compte('pour'),
      contre: compte('contre'),
      abstention: compte('abstention'),
      nonVotants: compte('non_votant'),
      absents: compte('absent'),
    };
    return { scrutin: resume, votes, elus };
  }
}
