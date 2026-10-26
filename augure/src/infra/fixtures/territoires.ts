// Fixtures Territoires : carte d'un scrutin, carte de présence et fiche Département, cohérentes avec
// l'annuaire (départements des élus) et le scrutin n° 1874 (votes de Camille, Louis, Hugo, Inès).
//   - Gironde (33) : Hugo Fictif, député (2e circ.), Paul Fictif, sénateur ;
//   - Nord (59) : Inès Modèle ; Rhône (69) : Louis Prototype ; Essonne (91) : Camille Exemple ;
//   - Loire-Atlantique (44) : Pierre Modèle, sénateur.
// Un seul élu par département : la maquette ne compte que les élus qu'elle connaît.

import type {
  Carte,
  Chambre,
  DepartementRef,
  EluDuDepartement,
  FicheDepartement,
  Indicateur,
  PersonneRef,
  VotesDepartement,
} from '../../core/domain/model';
import { P, comme } from './entites';
import { S } from './scrutins';

const DEP = {
  '33': { code: '33', nom: 'Gironde' },
  '44': { code: '44', nom: 'Loire-Atlantique' },
  '59': { code: '59', nom: 'Nord' },
  '69': { code: '69', nom: 'Rhône' },
  '91': { code: '91', nom: 'Essonne' },
} satisfies Record<string, DepartementRef>;

const PERIODE = { debut: '2026-01-01', fin: '2026-10-24' };

const NE_DIT_PAS = [
  'Les votes à main levée ne sont pas nominatifs : ils ne comptent pas.',
  'Une délégation de vote compte comme une participation.',
  'La présence en commission ou en séance sans scrutin public n’est pas mesurée.',
];

/** Participation des élus d'un département, comparée à celle de leurs groupes sur les mêmes scrutins. */
const presence = (taux: number, attendu: number, occasions: number): Indicateur => ({
  libelle: 'Participation aux scrutins publics',
  valeur: taux,
  unite: 'pourcentage',
  denominateur: { valeur: occasions, libelle: 'votes possibles des élus du département' },
  reference: { libelle: 'Attendu : la participation de leurs groupes sur les mêmes scrutins', valeur: attendu },
  ceQueLaDonneeNeDitPas: NE_DIT_PAS,
  periode: PERIODE,
  calcul: 'lecture.presence_departement',
});

/** La même mesure pour un élu. */
const participation = (taux: number, attendu: number, scrutins: number): Indicateur => ({
  libelle: 'Participation aux scrutins publics',
  valeur: taux,
  unite: 'pourcentage',
  denominateur: { valeur: scrutins, libelle: 'scrutins publics de sa chambre' },
  reference: { libelle: 'Attendu : la participation de son groupe sur les mêmes scrutins', valeur: attendu },
  ceQueLaDonneeNeDitPas: NE_DIT_PAS,
  periode: PERIODE,
  calcul: 'lecture.presence_elu',
});

const votes = (position: 'pour' | 'contre' | 'abstention'): VotesDepartement => ({
  membres: 1,
  pour: position === 'pour' ? 1 : 0,
  contre: position === 'contre' ? 1 : 0,
  abstention: position === 'abstention' ? 1 : 0,
  nonVotants: 0,
  absents: 0,
});

export const LIMITES_CARTE = [
  'Le département d’un élu est celui que publie sa chambre ; les élus des Français établis hors de France n’ont pas de département et ne sont pas sur la carte.',
];
const LIMITE_SCRUTIN = 'Seuls les scrutins publics sont nominatifs : un vote à main levée n’a pas de carte.';
const LIMITE_PRESENCE =
  'La participation compte les scrutins publics de l’année en cours, pour les élus actuels, comparée à celle du groupe de chaque élu sur les mêmes scrutins.';

export const CARTE_SCRUTIN_1874: Carte = {
  demande: { mesure: 'scrutin', scrutin: S.an1874.id },
  chambre: 'AN',
  scrutin: S.an1874,
  libelleValeur: 'Part des « pour » parmi les votes exprimés',
  departements: [
    { departement: DEP['33'], valeur: 100, votes: votes('pour'), presence: null },
    { departement: DEP['59'], valeur: 0, votes: votes('contre'), presence: null },
    { departement: DEP['69'], valeur: 0, votes: votes('abstention'), presence: null },
    { departement: DEP['91'], valeur: 0, votes: votes('contre'), presence: null },
  ],
  horsDepartement: 0,
  limites: [...LIMITES_CARTE, LIMITE_SCRUTIN],
};

const presenceDep = (d: DepartementRef, i: Indicateur) => ({ departement: d, valeur: i.valeur, votes: null, presence: i });

const PRESENCE = {
  AN: {
    '33': presence(71.4, 76.0, 840),
    '59': presence(83.1, 79.5, 840),
    '69': presence(64.2, 77.8, 840),
    '91': presence(88.6, 77.8, 840),
  },
  SENAT: {
    '33': presence(58.3, 61.0, 216),
    '44': presence(66.7, 63.4, 216),
  },
};

export const CARTE_PRESENCE_AN: Carte = {
  demande: { mesure: 'presence', chambre: 'AN' },
  chambre: 'AN',
  scrutin: null,
  libelleValeur: 'Participation aux scrutins publics (année en cours)',
  departements: (['33', '59', '69', '91'] as const).map((c) => presenceDep(DEP[c], PRESENCE.AN[c])),
  horsDepartement: 0,
  limites: [...LIMITES_CARTE, LIMITE_PRESENCE],
};

export const CARTE_PRESENCE_SENAT: Carte = {
  demande: { mesure: 'presence', chambre: 'SENAT' },
  chambre: 'SENAT',
  scrutin: null,
  libelleValeur: 'Participation aux scrutins publics (année en cours)',
  departements: (['33', '44'] as const).map((c) => presenceDep(DEP[c], PRESENCE.SENAT[c])),
  horsDepartement: 0,
  limites: [...LIMITES_CARTE, LIMITE_PRESENCE],
};

const elu = (personne: PersonneRef, chambre: Chambre, circonscription: string | null, i: Indicateur): EluDuDepartement => ({
  personne,
  chambre,
  circonscription,
  participation: i,
});

/** Fonction composée par l'API : chambre, département publié, circonscription. */
const HUGO = comme(P.hugo, 'Député · Gironde, 2e circ.');
const PAUL = comme(P.paul, 'Sénateur · Gironde');

const GIRONDE: Omit<FicheDepartement, 'scrutin'> = {
  departement: DEP['33'],
  elus: [elu(HUGO, 'AN', '2', participation(71.4, 76.0, 840)), elu(PAUL, 'SENAT', null, participation(58.3, 61.0, 216))],
  presence: [
    { chambre: 'AN', indicateur: PRESENCE.AN['33'] },
    { chambre: 'SENAT', indicateur: PRESENCE.SENAT['33'] },
  ],
  limites: [...LIMITES_CARTE, LIMITE_PRESENCE],
};

export const DEPARTEMENT_GIRONDE: FicheDepartement = { ...GIRONDE, scrutin: null };

export const DEPARTEMENT_GIRONDE_1874: FicheDepartement = {
  ...GIRONDE,
  scrutin: { scrutin: S.an1874, votes: votes('pour'), elus: [{ personne: HUGO, position: 'pour' }] },
};
