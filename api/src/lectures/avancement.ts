// Handler de « Où en sont les textes » : le dépôt donne la position de chaque texte non abouti
// (DossiersRepository.positions) ; le cœur les range en files, calcule les attentes médianes et
// les délais fixés par la Constitution, filtre et pagine, puis demande au dépôt de quoi afficher
// les seuls textes rendus (textesEnAttente).
//
// Un délai dépassé d'après nos données n'est jamais présenté comme un fait : il est « à vérifier »
// (l'acte attendu peut manquer dans nos sources, le point de départ légal n'est pas publié).

import type {
  AttenteAdministrative,
  AttenteHorsParlement,
  AvancementDesTextes,
  DemandeAvancement,
  FileEtape,
  Lieu,
  TexteEnAttente,
} from '@contrat/domain/model';

import type { PositionTexte } from '../ports';
import { type Handlers, type LecturesDeps, borner, parmiFacultatif, texteFacultatif } from './commun';
import { LEGISLATURE, ORIGINES } from './dossiers';

/** Attentes hors du Parlement rendues au plus. */
export const LIMITE_HORS_PARLEMENT = 50;

/** Ordre des files : celui du parcours, l'Assemblée avant le Sénat à phase égale. */
export const ORDRE_FILES = [
  'Dépôt',
  'Commission AN',
  'Séance AN',
  '1re lecture AN',
  'Commission Sénat',
  'Séance Sénat',
  '1re lecture Sénat',
  '2e lecture AN',
  '2e lecture Sénat',
  'CMP',
  'Vote du texte de la CMP',
  'Nouvelle lecture',
  'Lecture définitive AN',
  'Conseil constit.',
  'Promulgation',
  'Journal officiel',
  'Promulgation et JO',
];

export const LIMITES = [
  'Seuls les dossiers de loi de la législature sont comptés, pas les résolutions.',
  'Le délai de promulgation court depuis la transmission du texte au Gouvernement, qui n’est pas publiée : nous comptons depuis l’adoption définitive, ou depuis la décision du Conseil constitutionnel quand il a été saisi (la saisine suspend le délai).',
  'Le Conseil constitutionnel statue en huit jours au lieu d’un mois si le Gouvernement déclare l’urgence : cette demande n’est pas publiée dans nos sources.',
  'Un délai dépassé d’après nos données reste à vérifier : l’acte attendu peut manquer dans nos sources.',
  'Les décrets d’application ne sont pas encore suivis.',
];

const MOTIF_DEPASSEMENT = 'Aucun acte publié dans nos sources après la date limite';
const AVERTISSEMENT_DEPASSEMENT = 'L’acte attendu peut manquer dans nos sources : ce n’est pas la preuve d’un retard.';

const QUI: Record<AttenteHorsParlement, Lieu> = { decision_cc: 'CC', promulgation: 'PR', publication_jo: 'GOUVERNEMENT' };

// ---------- Dates ----------

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const ajouterJours = (depuis: string, n: number) => {
  const d = jour(depuis);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** Même quantième le mois suivant, ramené au dernier jour du mois s'il n'existe pas (31 janvier → 28 février). */
export const ajouterUnMois = (depuis: string) => {
  const d = jour(depuis);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0));
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, Math.min(d.getUTCDate(), fin.getUTCDate()))));
};

export const joursEntre = (de: string, a: string) => Math.round((jour(a).getTime() - jour(de).getTime()) / 86_400_000);

/** Date limite fixée par la Constitution ; null sans point de départ ou sans délai (publication au JO). */
export function delai(attendu: AttenteHorsParlement, depuis: string | null): AttenteAdministrative['delai'] {
  if (!depuis) return null;
  switch (attendu) {
    case 'decision_cc':
      return { limite: ajouterUnMois(depuis), base: 'Constitution, art. 61 : un mois (huit jours si le Gouvernement déclare l’urgence)' };
    case 'promulgation':
      return { limite: ajouterJours(depuis, 15), base: 'Constitution, art. 10 : quinze jours après la transmission du texte au Gouvernement' };
    case 'publication_jo':
      return null;
  }
}

// ---------- Files ----------

/** Du plus ancien au plus récent ; non datés à la fin ; à égalité, par identifiant (ordre stable). */
const parAnciennete = (a: PositionTexte, b: PositionTexte) =>
  (b.jours ?? -1) - (a.jours ?? -1) || a.dossier.localeCompare(b.dossier);

export function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

const rangFile = (etape: string) => {
  const i = ORDRE_FILES.indexOf(etape);
  return i < 0 ? ORDRE_FILES.length : i;
};

/** Files non vides, dans l'ordre du parcours (libellé inconnu : à la fin, dans l'ordre d'arrivée). */
export function files(positions: PositionTexte[]): (Omit<FileEtape, 'plusAncien'> & { plusAncien: PositionTexte })[] {
  const parEtape = new Map<string, PositionTexte[]>();
  for (const p of positions) parEtape.set(p.etape.libelle, [...(parEtape.get(p.etape.libelle) ?? []), p]);
  return [...parEtape.entries()]
    .map(([etape, liste], arrivee) => ({ etape, liste, arrivee }))
    .sort((a, b) => rangFile(a.etape) - rangFile(b.etape) || a.arrivee - b.arrivee)
    .map(({ etape, liste }) => ({
      etape,
      lieu: liste[0].etape.lieu,
      enExamen: liste.filter((p) => p.situation === 'en_examen').length,
      enAttente: liste.filter((p) => p.situation === 'en_attente').length,
      parOrigine: {
        gouvernement: liste.filter((p) => p.origine === 'gouvernement').length,
        parlementaire: liste.filter((p) => p.origine === 'parlementaire').length,
        inconnue: liste.filter((p) => p.origine === null).length,
      },
      attenteMediane: mediane(liste.flatMap((p) => (p.jours === null ? [] : [p.jours]))),
      plusAncien: [...liste].sort(parAnciennete)[0],
    }));
}

/** Attentes hors du Parlement, dépassements d'abord (le plus grand en tête), puis par ancienneté. */
export function horsParlement(positions: PositionTexte[], dateReference: string) {
  return positions
    .flatMap((p) => {
      if (!p.horsParlement) return [];
      const d = delai(p.horsParlement, p.depuis);
      const retard = d ? joursEntre(d.limite, dateReference) : 0;
      return [{ position: p, attendu: p.horsParlement, qui: QUI[p.horsParlement], delai: d, retard: retard > 0 ? retard : 0 }];
    })
    .sort((a, b) => b.retard - a.retard || parAnciennete(a.position, b.position))
    .slice(0, LIMITE_HORS_PARLEMENT);
}

// ---------- Handler ----------

export function lecturesAvancement({ depots, horloge }: LecturesDeps): Pick<Handlers, 'ConsulterAvancement'> {
  const { dossiers } = depots;

  return {
    ConsulterAvancement: async (demande: DemandeAvancement) => {
      const etape = texteFacultatif(demande.etape, 'Étape', 80);
      const origine = parmiFacultatif(demande.origine, ORIGINES, 'Origine');
      const seulementHorsParlement = demande.horsParlement === true;
      const pagination = borner(demande);

      const lues = await dossiers.positions(LEGISLATURE);
      const dateReference = lues?.dateReference ?? horloge.aujourdhui();
      const positions = lues?.positions ?? [];

      const lesFiles = files(positions);
      const attentes = horsParlement(positions, dateReference);
      const choisies = positions
        .filter(
          (p) =>
            (etape === undefined || p.etape.libelle === etape) &&
            (origine === undefined || p.origine === origine) &&
            (!seulementHorsParlement || p.horsParlement !== null),
        )
        .sort(parAnciennete);
      const debut = (pagination.page - 1) * pagination.taille;
      const page = choisies.slice(debut, debut + pagination.taille);

      // Un seul appel au dépôt pour tout ce qui s'affiche : la page, les plus anciens, les attentes.
      const montrees = [...new Map([...page, ...lesFiles.map((f) => f.plusAncien), ...attentes.map((a) => a.position)].map((p) => [p.dossier, p])).values()];
      const textes = new Map((await dossiers.textesEnAttente(montrees)).map((t) => [t.dossier.id, t]));
      const texte = (p: PositionTexte): TexteEnAttente[] => {
        const t = textes.get(p.dossier);
        return t ? [t] : [];
      };

      const sortie: AvancementDesTextes = {
        legislature: LEGISLATURE,
        dateReference,
        total: positions.length,
        indetermines: lues?.indetermines ?? 0,
        files: lesFiles.map(({ plusAncien, ...f }) => ({ ...f, plusAncien: texte(plusAncien)[0] ?? null })),
        horsParlement: attentes.flatMap((a) =>
          texte(a.position).map((t) => ({
            texte: t,
            attendu: a.attendu,
            qui: a.qui,
            delai: a.delai,
            depassement:
              a.retard > 0
                ? { jours: a.retard, statut: 'a_verifier' as const, motif: MOTIF_DEPASSEMENT, avertissement: AVERTISSEMENT_DEPASSEMENT }
                : null,
          })),
        ),
        demande,
        textes: {
          elements: page.flatMap(texte),
          page: pagination.page,
          taille: pagination.taille,
          total: choisies.length,
          suivante: debut + pagination.taille < choisies.length ? pagination.page + 1 : null,
        },
        limites: LIMITES,
      };
      return sortie;
    },
  };
}
