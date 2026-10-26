// Handlers des territoires : carte d'un scrutin ou de la présence d'une chambre, fiche Département.
// Le dépôt donne les votes et les indicateurs déjà comparés ; le cœur calcule la valeur qui colore
// chaque département, ajoute ce que la carte ne dit pas, et remplit les synthèses du scrutin.

import type { Carte, Chambre, DemandeCarte, VotesDepartement } from '@contrat/domain/model';

import { type Handlers, type LecturesDeps, Introuvable, RequeteInvalide, parmi, remplirPar, texte, trouve } from './commun';
import { REMPLIR } from './syntheses';

const CHAMBRES: Record<Chambre, true> = { AN: true, SENAT: true };

/** Codes du COG : département métropolitain (« 01 », « 2A »), d'outre-mer ou collectivité (« 971 », « 987 »). */
const CODE = /^(\d{2}|2[AB]|9[78]\d)$/;

export const LIMITES_CARTE = [
  'Le département d’un élu est celui que publie sa chambre ; les élus des Français établis hors de France n’ont pas de département et ne sont pas sur la carte.',
];
export const LIMITE_SCRUTIN = 'Seuls les scrutins publics sont nominatifs : un vote à main levée n’a pas de carte.';
export const LIMITE_PRESENCE =
  'La participation compte les scrutins publics de l’année en cours, pour les élus actuels, comparée à celle du groupe de chaque élu sur les mêmes scrutins.';

/** Part des « pour » parmi les votes exprimés, sur 100, à une décimale ; null sans vote exprimé. */
export function partPour(v: VotesDepartement): number | null {
  const exprimes = v.pour + v.contre + v.abstention;
  return exprimes ? Math.round((1000 * v.pour) / exprimes) / 10 : null;
}

export function lecturesTerritoires({ depots, synthetiseur }: LecturesDeps): Pick<Handlers, 'ConsulterCarte' | 'ConsulterDepartement'> {
  const r = remplirPar(synthetiseur);
  const { territoires } = depots;

  return {
    ConsulterCarte: async (demande: DemandeCarte) => {
      if (demande?.mesure === 'scrutin') {
        texte(demande.scrutin, 'Identifiant du scrutin');
        const c = trouve(await territoires.carteScrutin(demande.scrutin), 'Scrutin');
        const carte: Carte = {
          demande,
          chambre: c.scrutin.chambre,
          scrutin: c.scrutin,
          libelleValeur: 'Part des « pour » parmi les votes exprimés',
          departements: c.departements.map((d) => ({ departement: d.departement, valeur: partPour(d.votes), votes: d.votes, presence: null })),
          horsDepartement: c.horsDepartement,
          limites: [...LIMITES_CARTE, LIMITE_SCRUTIN],
        };
        return REMPLIR.ConsulterCarte(r, carte);
      }
      if (demande?.mesure !== 'presence') {
        throw new RequeteInvalide(`Mesure inconnue : ${String((demande as { mesure?: unknown } | undefined)?.mesure)}`);
      }
      const chambre = parmi(demande.chambre, CHAMBRES, 'Chambre');
      const c = await territoires.cartePresence(chambre);
      return {
        demande,
        chambre,
        scrutin: null,
        libelleValeur: 'Participation aux scrutins publics (année en cours)',
        departements: c.departements.map((d) => ({ departement: d.departement, valeur: d.presence.valeur, votes: null, presence: d.presence })),
        horsDepartement: c.horsDepartement,
        limites: [...LIMITES_CARTE, LIMITE_PRESENCE],
      };
    },

    ConsulterDepartement: async ({ code, scrutin }) => {
      texte(code, 'Code du département', 3);
      if (!CODE.test(code)) throw new RequeteInvalide(`Code de département inconnu : ${code}`);
      const fiche = trouve(await territoires.departement(code), 'Département');
      let votes = null;
      if (scrutin !== undefined && scrutin !== null) {
        texte(scrutin, 'Identifiant du scrutin');
        votes = await territoires.votesDepartement(code, scrutin);
        if (!votes) throw new Introuvable('Scrutin introuvable');
      }
      return REMPLIR.ConsulterDepartement(r, { ...fiche, scrutin: votes, limites: [...LIMITES_CARTE, LIMITE_PRESENCE] });
    },
  };
}
