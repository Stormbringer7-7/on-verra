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
import { DEP, P, comme } from './entites';
import { S } from './scrutins';



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
const LIMITE_CIRCONSCRIPTION =
  'La circonscription d’un député est celle que publie l’Assemblée ; une circonscription sans député ce jour-là est dite vacante.';
const LIMITE_SCRUTIN = 'Seuls les scrutins publics sont nominatifs : un vote à main levée n’a pas de carte.';
const LIMITE_PRESENCE =
  'La participation compte les scrutins publics de l’année en cours, pour les élus actuels, comparée à celle du groupe de chaque élu sur les mêmes scrutins.';

export const CARTE_SCRUTIN_1874: Carte = {
  demande: { mesure: 'scrutin', scrutin: S.an1874.id },
  niveau: 'departement',
  chambre: 'AN',
  scrutin: S.an1874,
  libelleValeur: 'Part des « pour » parmi les votes exprimés',
  departements: [
    { departement: DEP['33'], valeur: 100, votes: votes('pour'), presence: null },
    { departement: DEP['59'], valeur: 0, votes: votes('contre'), presence: null },
    { departement: DEP['69'], valeur: 0, votes: votes('abstention'), presence: null },
    { departement: DEP['91'], valeur: 0, votes: votes('contre'), presence: null },
  ],
  circonscriptions: [],
  horsDepartement: 0,
  limites: [...LIMITES_CARTE, LIMITE_SCRUTIN],
};

const circo = (dep: DepartementRef, numero: number) => ({ code: `${dep.code}-${String(numero).padStart(2, '0')}`, departement: dep, numero });

/** Les mêmes votes, député par député ; la 7e circonscription de Gironde, vacante ce jour-là. */
export const CARTE_SCRUTIN_1874_CIRCONSCRIPTIONS: Carte = {
  ...CARTE_SCRUTIN_1874,
  demande: { mesure: 'scrutin', scrutin: S.an1874.id, niveau: 'circonscription' },
  niveau: 'circonscription',
  circonscriptions: [
    { circonscription: circo(DEP['33'], 2), depute: comme(P.hugo, 'Député · Gironde, 2e circ.'), position: 'pour' },
    { circonscription: circo(DEP['33'], 7), depute: null, position: null },
    { circonscription: circo(DEP['59'], 1), depute: comme(P.ines, 'Députée · Nord, 1re circ.'), position: 'contre' },
    { circonscription: circo(DEP['69'], 3), depute: comme(P.louis, 'Député · Rhône, 3e circ.'), position: 'abstention' },
    { circonscription: circo(DEP['91'], 4), depute: comme(P.camille, 'Députée · Essonne, 4e circ.'), position: 'contre' },
  ],
  limites: [...CARTE_SCRUTIN_1874.limites, LIMITE_CIRCONSCRIPTION],
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
  niveau: 'departement',
  chambre: 'AN',
  scrutin: null,
  libelleValeur: 'Participation aux scrutins publics (année en cours)',
  departements: (['33', '59', '69', '91'] as const).map((c) => presenceDep(DEP[c], PRESENCE.AN[c])),
  circonscriptions: [],
  horsDepartement: 0,
  limites: [...LIMITES_CARTE, LIMITE_PRESENCE],
};

export const CARTE_PRESENCE_SENAT: Carte = {
  demande: { mesure: 'presence', chambre: 'SENAT' },
  niveau: 'departement',
  chambre: 'SENAT',
  scrutin: null,
  libelleValeur: 'Participation aux scrutins publics (année en cours)',
  departements: (['33', '44'] as const).map((c) => presenceDep(DEP[c], PRESENCE.SENAT[c])),
  circonscriptions: [],
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
