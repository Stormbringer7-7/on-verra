// Adaptateur Postgres du port InstitutionsRepository : composition de l'Assemblée et du Sénat par
// groupe (couleurs publiées), Gouvernement en fonction et gouvernements de la législature,
// décisions récentes du Conseil constitutionnel reliées à leur dossier. `canon` seulement.
//
// Ordre des groupes : canon ne garde pas le numéro de siège des votants (`numPlace` reste dans le
// brut), si bien que la gauche et la droite de l'hémicycle ne sont pas connues ; les groupes sont
// rangés par effectif décroissant, puis par sigle (ordre stable), et `rang` suit cet ordre.

import type { DecisionCC, GouvernementResume, Institution, MembreGouvernement, Provenance } from '@contrat/domain/model';
import type { InstitutionsRepository, SqlDatabase } from '../../ports';
import {
  actif,
  dossiersRef,
  gouvernementALaDateSql,
  groupe,
  groupeALaDateSql,
  jour,
  membreDuGouvernementSql,
  provenance,
  provenanceSql,
  titrePublie,
} from './personnes';

type Chambre = Extract<Institution, { type: 'an' | 'senat' }>;
type Gouvernement = Omit<Extract<Institution, { type: 'gouvernement' }>, 'textesDeposes'>;
type ConseilConstitutionnel = Extract<Institution, { type: 'cc' }>;

/** Qui a saisi le Conseil, d'après le code de l'acte publié par l'AN (CC-SAISIE-…). */
const SAISISSANTS: Record<string, string> = {
  'CC-SAISIE-AN': 'Députés',
  'CC-SAISIE-SN': 'Sénateurs',
  'CC-SAISIE-PM': 'Premier ministre',
  'CC-SAISIE-PAN': 'Président de l’Assemblée nationale',
  'CC-SAISIE-PSN': 'Président du Sénat',
  'CC-SAISIE-PR': 'Président de la République',
  'CC-SAISIE-DROIT': 'Saisine de droit',
};

/** Rang protocolaire, d'après la qualité publiée : Premier ministre d'abord, secrétaires d'État ensuite. */
function rangProtocolaire(qualite: string | null): number {
  const q = (qualite ?? '').toLowerCase();
  if (q.startsWith('premier ministre')) return 0;
  if (q.startsWith('ministre d') && q.includes('état')) return 1;
  if (q.includes('ministre délégué')) return 3;
  if (q.startsWith('ministre') || q.includes('garde des sceaux')) return 2;
  if (q.startsWith('secrétaire d')) return 4;
  if (q.startsWith('haut')) return 5;
  return 6;
}

/** « LECORNU II » → « Lecornu II » (chiffres romains gardés). */
function nomDeGouvernement(nom: string, nomCourt: string | null): string {
  if (!nomCourt) return nom;
  const mots = nomCourt
    .split(/\s+/)
    .map((m) => (/^[IVX]+$/.test(m) ? m : m.toLowerCase().replace(/(^|[-'’])\p{L}/gu, (c) => c.toUpperCase())));
  return `${nom} ${mots.join(' ')}`;
}

const annee = (date: string | null) => (date ? date.slice(0, 4) : '?');

export class PgInstitutions implements InstitutionsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async chambre(chambre: 'an' | 'senat', date: string): Promise<Chambre> {
    const ch = chambre === 'an' ? 'AN' : 'SENAT';
    const params = { type: chambre === 'an' ? 'depute' : 'senateur', chambre: ch, date };
    const [lignes, legislature] = await Promise.all([
      this.db.all<{ groupe: Parameters<typeof groupe>[0]; sieges: number }>(
        `WITH m AS (
           SELECT DISTINCT f.personne_id FROM canon.fonction f
           WHERE f.type = $type AND f.debut <= $date::date AND (f.fin IS NULL OR f.fin >= $date::date)
             AND ${actif('f.entite_id')} AND ${actif('f.personne_id')}),
         g AS (SELECT (${groupeALaDateSql('m.personne_id', '$chambre', '$date::date')})::jsonb AS groupe FROM m)
         SELECT groupe, count(*)::int AS sieges FROM g GROUP BY groupe
         ORDER BY count(*) DESC, groupe->>'abrege'`,
        params,
      ),
      ch === 'AN'
        ? this.db.first<{ legislature: string | null }>(
            `SELECT o.legislature FROM canon.organisation o
             WHERE o.type = 'assemblee' AND o.chambre = 'AN' AND o.debut <= $date::date AND (o.fin IS NULL OR o.fin >= $date::date)
               AND ${actif('o.entite_id')}
             ORDER BY o.debut DESC LIMIT 1`,
            { date },
          )
        : Promise.resolve(null),
    ]);
    const groupes = lignes
      .filter((l) => l.groupe)
      .map((l, rang) => ({ groupe: groupe(l.groupe)!, sieges: l.sieges, rang }));
    return {
      type: chambre,
      libelle: chambre === 'an' ? 'Assemblée nationale' : 'Sénat',
      legislature: legislature?.legislature ?? null,
      date,
      sieges: lignes.reduce((s, l) => s + l.sieges, 0),
      groupes,
      sansGroupe: lignes.filter((l) => !l.groupe).reduce((s, l) => s + l.sieges, 0),
    };
  }

  async gouvernement(date: string): Promise<Gouvernement> {
    const gouvernements = await this.db.all<GouvernementResume & { nom_court: string | null }>(
      `SELECT o.entite_id::text AS id, o.nom, o.nom_court, ${jour('o.debut')} AS debut, ${jour('o.fin')} AS fin
       FROM canon.organisation o
       WHERE o.type = 'gouvernement' AND o.debut <= $date::date AND ${actif('o.entite_id')}
         AND (o.fin IS NULL OR o.fin >= (
           SELECT l.debut FROM canon.organisation l
           WHERE l.type = 'assemblee' AND l.chambre = 'AN' AND l.legislature = '17' LIMIT 1))
       ORDER BY o.debut DESC`,
      { date },
    );
    const resumes: GouvernementResume[] = gouvernements.map((g) => ({
      id: g.id,
      nom: nomDeGouvernement(g.nom, g.nom_court),
      debut: g.debut,
      fin: g.fin,
    }));
    const actuel = await this.db.first<{ id: string }>(`SELECT (${gouvernementALaDateSql('$date::date')})::text AS id`, { date });
    const enFonction = actuel?.id ? resumes.find((g) => g.id === actuel.id) : undefined;
    return {
      type: 'gouvernement',
      libelle: 'Gouvernement',
      actuel: enFonction ? { ...enFonction, membres: await this.membres(enFonction.id, date) } : null,
      gouvernements: resumes,
    };
  }

  /** Membres en fonction à la date : fonction ministérielle telle que publiée, ancien mandat parlementaire. */
  private async membres(gouvernement: string, date: string): Promise<MembreGouvernement[]> {
    const lignes = await this.db.all<{
      personne: string;
      nom: string;
      civilite: string | null;
      titre: string;
      qualite: string | null;
      ministere: boolean;
      debut: string | null;
    }>(
      `SELECT f.personne_id::text AS personne, p.nom_affiche AS nom, p.civilite, f.titre, f.qualite,
              (o.type = 'ministere') AS ministere, ${jour('f.debut')} AS debut
       FROM canon.fonction f
       JOIN canon.organisation o ON o.entite_id = f.organisation_id
       JOIN canon.personne p ON p.entite_id = f.personne_id
       WHERE ${membreDuGouvernementSql('f', 'o', '$gouvernement::uuid')}
         AND f.debut <= $date::date AND (f.fin IS NULL OR f.fin >= $date::date)
         AND ${actif('f.entite_id')} AND ${actif('f.personne_id')}
       ORDER BY f.personne_id, f.debut DESC`,
      { gouvernement, date },
    );
    const parPersonne = new Map<string, typeof lignes>();
    for (const l of lignes) parPersonne.set(l.personne, [...(parPersonne.get(l.personne) ?? []), l]);
    const ids = [...parPersonne.keys()];
    const anciens = ids.length
      ? await this.db.all<{ personne: string; type: string; debut: string | null; fin: string | null }>(
          `SELECT DISTINCT ON (f.personne_id) f.personne_id::text AS personne, f.type, ${jour('f.debut')} AS debut, ${jour('f.fin')} AS fin
           FROM canon.fonction f
           WHERE f.personne_id = ANY($ids::uuid[]) AND f.type IN ('depute', 'senateur') AND f.fin < $date::date
             AND ${actif('f.entite_id')}
           ORDER BY f.personne_id, f.fin DESC`,
          { ids, date },
        )
      : [];
    const ancien = new Map(anciens.map((a) => [a.personne, a]));
    const membres = [...parPersonne.values()].map((fs) => {
      // La fonction ministérielle la plus récente, sinon l'appartenance au Gouvernement.
      const f = fs.find((x) => x.ministere) ?? fs[0];
      const femme = f.civilite === 'Mme';
      const a = ancien.get(f.personne);
      const fonction = f.ministere ? titrePublie(f.titre) : 'Membre du Gouvernement';
      const depuis = fs.map((x) => x.debut).filter((d): d is string => !!d).sort()[0] ?? null;
      const membre: MembreGouvernement = {
        personne: { id: f.personne, nom: f.nom, fonction, groupe: null },
        fonction,
        depuis,
        ancienne: a
          ? `${a.type === 'depute' ? (femme ? 'ancienne députée' : 'ancien député') : femme ? 'ancienne sénatrice' : 'ancien sénateur'} (${annee(a.debut)}-${annee(a.fin)})`
          : null,
      };
      return { membre, rang: rangProtocolaire(f.ministere ? f.qualite : null) };
    });
    return membres
      .sort((a, b) => a.rang - b.rang || (a.membre.depuis ?? '').localeCompare(b.membre.depuis ?? '') || a.membre.personne.nom.localeCompare(b.membre.personne.nom))
      .map((m) => m.membre);
  }

  async conseilConstitutionnel(limite: number): Promise<ConseilConstitutionnel> {
    const [decisions, saisines] = await Promise.all([
      this.db.all<Omit<DecisionCC, 'dossier' | 'provenance'> & { dossier_id: string | null; provenance: Provenance | null }>(
        `SELECT d.entite_id::text AS id, d.numero, d.type, ${jour('d.date')} AS date, d.solution, d.dossier_id::text, d.url,
                ${provenanceSql('d.entite_id')} AS provenance
         FROM canon.decision_cc d
         WHERE d.type IN ('DC', 'QPC') AND ${actif('d.entite_id')}
         ORDER BY d.date DESC NULLS LAST, d.numero DESC
         LIMIT $limite`,
        { limite: Math.min(Math.max(limite, 1), 100) },
      ),
      this.db.all<{ dossier_id: string; date: string | null; codes: string[] }>(
        `SELECT e.dossier_id::text, ${jour('min(e.debut)')} AS date, array_agg(DISTINCT e.code_source) AS codes
         FROM canon.etape e
         WHERE e.type = 'saisine_cc' AND ${actif('e.entite_id')} AND ${actif('e.dossier_id')}
           AND NOT EXISTS (SELECT 1 FROM canon.etape x WHERE x.dossier_id = e.dossier_id AND x.type = 'decision_cc'
                           AND ${actif('x.entite_id')})
           AND NOT EXISTS (SELECT 1 FROM canon.decision_cc dc WHERE dc.dossier_id = e.dossier_id AND ${actif('dc.entite_id')})
           -- promulguée depuis : la décision existe, mais n'est pas reliée au dossier (pas « en cours »)
           AND NOT EXISTS (SELECT 1 FROM canon.etape x WHERE x.dossier_id = e.dossier_id AND x.type = 'promulgation'
                           AND x.debut >= e.debut AND ${actif('x.entite_id')})
         GROUP BY e.dossier_id
         ORDER BY min(e.debut) DESC NULLS LAST`,
      ),
    ]);
    const dossiers = await dossiersRef(this.db, [...decisions.map((d) => d.dossier_id), ...saisines.map((s) => s.dossier_id)]);
    return {
      type: 'cc',
      libelle: 'Conseil constitutionnel',
      saisinesEnCours: saisines
        .filter((s) => dossiers.has(s.dossier_id))
        .map((s) => ({
          dossier: dossiers.get(s.dossier_id)!,
          date: s.date,
          saisissants: s.codes.filter(Boolean).map((c) => SAISISSANTS[c] ?? c).join(', ') || null,
        })),
      decisions: decisions.map(({ dossier_id, provenance: p, ...d }) => ({
        ...d,
        numero: d.type && !d.numero.endsWith(d.type) ? `${d.numero} ${d.type}` : d.numero,
        dossier: dossier_id ? (dossiers.get(dossier_id) ?? null) : null,
        provenance: provenance(p, 'decision', d.id),
      })),
    };
  }
}
