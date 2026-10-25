// Fixtures « Où en sont les textes », au 24 octobre 2026 : les quatre dossiers non aboutis de la
// liste (médecins et IA sont promulgués, vidéoprotection rejetée).
//   - budget : 1re lecture AN en examen ;
//   - épargne : conclusions de la CMP adoptées le 1er octobre, pas encore promulgué (délai dépassé,
//     à vérifier) ;
//   - location : nouvelle lecture faite, lecture définitive inscrite le 5 novembre ;
//   - énergie : Conseil constitutionnel saisi le 17 octobre.

import type { AttenteAdministrative, AvancementDesTextes, FileEtape, TexteEnAttente } from '../../core/domain/model';
import { RESUMES } from './dossiers';

const texte = (
  r: (typeof RESUMES)[keyof typeof RESUMES],
  etape: TexteEnAttente['etape'],
  situation: TexteEnAttente['situation'],
  depuis: string,
  jours: number,
): TexteEnAttente => ({
  dossier: { id: r.id, titre: r.titre },
  origine: r.origine,
  etape,
  situation,
  depuis,
  jours,
  dernierActe: r.dernierEvenement,
  prochaineEcheance: r.prochaineEcheance,
});

const T = {
  epargne: texte(RESUMES.epargne, { cle: 'conclusions_cmp', libelle: 'Vote du texte de la CMP', lieu: null }, 'en_attente', '2026-10-01', 23),
  budget: texte(RESUMES.budget, { cle: 'lecture_1_o', libelle: '1re lecture AN', lieu: 'AN' }, 'en_examen', '2026-10-08', 16),
  location: texte(RESUMES.location, { cle: 'nouvelle_lecture', libelle: 'Nouvelle lecture', lieu: null }, 'en_attente', '2026-10-14', 10),
  energie: texte(RESUMES.energie, { cle: 'cc', libelle: 'Conseil constit.', lieu: 'CC' }, 'en_examen', '2026-10-17', 7),
};

const file = (t: TexteEnAttente): FileEtape => ({
  etape: t.etape.libelle,
  lieu: t.etape.lieu,
  enExamen: t.situation === 'en_examen' ? 1 : 0,
  enAttente: t.situation === 'en_attente' ? 1 : 0,
  parOrigine: { gouvernement: t.origine === 'gouvernement' ? 1 : 0, parlementaire: t.origine === 'parlementaire' ? 1 : 0, inconnue: 0 },
  attenteMediane: t.jours,
  plusAncien: t,
});

const HORS_PARLEMENT: AttenteAdministrative[] = [
  {
    texte: T.epargne,
    attendu: 'promulgation',
    qui: 'PR',
    delai: { limite: '2026-10-16', base: 'Constitution, art. 10 : quinze jours après la transmission du texte au Gouvernement' },
    depassement: {
      jours: 8,
      statut: 'a_verifier',
      motif: 'Aucun acte publié dans nos sources après la date limite',
      avertissement: 'L’acte attendu peut manquer dans nos sources : ce n’est pas la preuve d’un retard.',
    },
  },
  {
    texte: T.energie,
    attendu: 'decision_cc',
    qui: 'CC',
    delai: { limite: '2026-11-17', base: 'Constitution, art. 61 : un mois (huit jours si le Gouvernement déclare l’urgence)' },
    depassement: null,
  },
];

const LIMITES = [
  'Seuls les dossiers de loi de la législature sont comptés, pas les résolutions.',
  'Le délai de promulgation court depuis la transmission du texte au Gouvernement, qui n’est pas publiée : nous comptons depuis l’adoption définitive, ou depuis la décision du Conseil constitutionnel quand il a été saisi (la saisine suspend le délai).',
  'Le Conseil constitutionnel statue en huit jours au lieu d’un mois si le Gouvernement déclare l’urgence : cette demande n’est pas publiée dans nos sources.',
  'Un délai dépassé d’après nos données reste à vérifier : l’acte attendu peut manquer dans nos sources.',
  'Les décrets d’application ne sont pas encore suivis.',
];

const avancement = (demande: AvancementDesTextes['demande'], textes: TexteEnAttente[]): AvancementDesTextes => ({
  legislature: '17',
  dateReference: '2026-10-24',
  total: 4,
  indetermines: 0,
  files: [file(T.budget), file(T.epargne), file(T.location), file(T.energie)],
  horsParlement: HORS_PARLEMENT,
  demande,
  textes: { elements: textes, page: 1, taille: 20, total: textes.length, suivante: null },
  limites: LIMITES,
});

/** Tous les textes, du plus ancien au plus récent. */
export const AVANCEMENT = avancement({}, [T.epargne, T.budget, T.location, T.energie]);

/** Seulement ceux qui attendent hors du Parlement. */
export const AVANCEMENT_HORS_PARLEMENT = avancement({ horsParlement: true }, [T.epargne, T.energie]);

/** Une file : la nouvelle lecture. */
export const AVANCEMENT_NOUVELLE_LECTURE = avancement({ etape: 'Nouvelle lecture' }, [T.location]);
