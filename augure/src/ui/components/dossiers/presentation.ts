// Présentation des écrans de la famille Dossier, sans React : entrées des commandes (au format
// exact du contrat, clés absentes plutôt qu'indéfinies), libellés, sièges de l'hémicycle, phrases
// de « Pourquoi ce vote ». Testé seul (tests/dossiers.test.ts).
//
// Deux règles de fond passent par ici :
//   - un changement d'article dont l'origine est « à vérifier » ou « non établie » n'est jamais
//     présenté comme l'œuvre d'un amendement (`titreOrigine`, `amendementEtabli`) ;
//   - « Pourquoi ce vote » rassemble des faits, sans phrase de causalité (`faitsDuVote`).

import type {
  AmendementResume,
  ArticleResume,
  Auteur,
  CaseCompacte,
  CibleInterventions,
  CleCase,
  EtatCase,
  EtatDossier,
  ExplicationVote,
  FiltreDossiers,
  GroupeRef,
  Lieu,
  Orateur,
  Origine,
  OrigineModification,
  PersonneRef,
  Position,
  PositionDeGroupe,
  PositionExprimee,
  SortAmendement,
  TypeDocument,
} from '../../../core';
import type { ParamsDiscussions } from '../../../navigation';
import { etatFinal } from '../commun/statuts';

// ---------- Libellés ----------

export const ETAT_DOSSIER: Record<EtatDossier, string> = {
  en_cours: 'En cours',
  adopte: 'Adopté',
  promulgue: 'Promulgué',
  rejete: 'Rejeté',
  retire: 'Retiré',
  caduc: 'Caduc',
};

/** État d'un dossier ; null : la donnée ne permet pas de conclure. */
export const etatDossier = (e: EtatDossier | null) => (e ? ETAT_DOSSIER[e] : 'État non établi');

export const ORIGINE: Record<Origine, string> = { gouvernement: 'Gouvernement', parlementaire: 'Parlementaires' };

export const SORT: Record<SortAmendement, string> = {
  adopte: 'Adopté',
  rejete: 'Rejeté',
  retire: 'Retiré',
  tombe: 'Tombé',
  non_soutenu: 'Non soutenu',
  irrecevable: 'Irrecevable',
  en_attente: 'En attente',
};

export const sortAmendement = (s: SortAmendement | null) => (s ? SORT[s] : 'Sort non publié');

export const ETAT_CASE: Record<EtatCase, string> = {
  faite: 'Faite',
  en_cours: 'En cours',
  a_venir: 'À venir',
  sans_objet: 'Sans objet',
  inconnu: 'Donnée insuffisante',
};

export const LIEU: Record<Lieu, string> = {
  AN: 'Assemblée nationale',
  SENAT: 'Sénat',
  CMP: 'Commission mixte paritaire',
  CC: 'Conseil constitutionnel',
  PR: 'Présidence de la République',
  JO: 'Journal officiel',
  GOUVERNEMENT: 'Gouvernement',
};

export const CHAMBRE_COURTE: Record<Lieu, string> = { AN: 'AN', SENAT: 'Sénat', CMP: 'CMP', CC: 'CC', PR: 'PR', JO: 'JO', GOUVERNEMENT: 'Gouv.' };

export const TYPE_DOCUMENT: Record<TypeDocument, string> = {
  projet: 'Projet',
  proposition: 'Proposition',
  rapport: 'Rapport',
  avis: 'Avis',
  texte_commission: 'Texte de la commission',
  texte_adopte: 'Texte adopté',
  etude_impact: 'Étude d’impact',
  avis_ce: 'Avis du Conseil d’État',
  compte_rendu: 'Compte rendu',
  saisine: 'Saisine',
  decision: 'Décision',
  loi: 'Loi',
  accord: 'Accord',
  motion: 'Motion',
  autre: 'Document',
};

/** Glyphe + libellé : lisible sans la couleur. */
export const POSITION: Record<Position, string> = {
  pour: '+ POUR',
  contre: '− CONTRE',
  abstention: 'Ø ABST.',
  non_votant: '· NON-VOTANT',
  absent: '· ABSENT',
};

export const ETAT_ARTICLE: Record<ArticleResume['etat'], string> = {
  inchange: 'Inchangé',
  modifie: 'Modifié',
  ajoute: 'Ajouté',
  supprime: 'Supprimé',
};

/** Faits d'un article : « Modifié · 2 modif. », « Ajouté · Sénat » ; null si l'article n'est pas listé. */
export const faitsArticle = (a: ArticleResume | undefined): string | null =>
  a
    ? `${ETAT_ARTICLE[a.etat]}${a.ajoutePar ? ` · ${CHAMBRE_COURTE[a.ajoutePar]}` : ''}${a.modifications ? ` · ${a.modifications} modif.` : ''}`
    : null;

// ---------- Barre ----------

/** Cases montrées : les `sans_objet` (n'auront pas lieu, d'après un fait publié) sont masquées. */
export const casesVisibles = <C extends { etat: EtatCase }>(cases: C[]) => cases.filter((c) => c.etat !== 'sans_objet');

/**
 * « Étape actuelle » et « vous êtes » d'une barre de dossier ; `final` : l'état final d'un dossier
 * terminé (« Promulgué »), à la place d'une étape courante qui n'existe plus.
 */
export function reperesBarre(cases: CaseCompacte[], ici: CleCase | null) {
  const courante = cases.find((c) => c.courante) ?? null;
  const vous = ici ? (cases.find((c) => c.cle === ici) ?? null) : null;
  return { courante: courante?.libelle ?? null, final: courante ? null : etatFinal(cases), ici: vous?.libelle ?? null };
}

/** Ligne sous la barre : étape actuelle, sinon état final, sinon « non établie » (dossier en cours). */
export function legendeReperes(r: ReturnType<typeof reperesBarre>): string {
  const ou = r.courante ? `Étape actuelle : ${r.courante}` : (r.final ?? 'Étape actuelle : non établie');
  return `${ou}${r.ici ? ` · vous êtes : ${r.ici}` : ''}`;
}

// ---------- Entrées des commandes ----------

/** Retire les clés indéfinies : l'entrée a exactement le format du contrat. */
export function sansVide<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** `ListerDossiers` : page 1 implicite. */
export const entreeDossiers = (f: FiltreDossiers): FiltreDossiers => sansVide({ ...f, page: f.page && f.page > 1 ? f.page : undefined });

/** `ConsulterDossier` : la liste d'amendements n'est demandée que si elle est filtrée ou paginée. */
export function entreeDossier(id: string, sort: SortAmendement | null, page: number) {
  const amendements = sansVide({ sort: sort ?? undefined, page: page > 1 ? page : undefined });
  return Object.keys(amendements).length ? { id, amendements } : { id };
}

/** `ListerInterventions` : la cible dans l'ordre du contrat (paramètres de lien profond compris). */
export function entreeDiscussions(p: ParamsDiscussions, page: number): { cible: CibleInterventions; page?: number } {
  const cible: CibleInterventions =
    p.type === 'etape'
      ? { type: 'etape', dossier: p.dossier, cle: p.cle }
      : p.type === 'personne'
        ? p.dossier
          ? { type: 'personne', id: p.id, dossier: p.dossier }
          : { type: 'personne', id: p.id }
        : { type: p.type, id: p.id };
  return page > 1 ? { cible, page } : { cible };
}

/** `ConsulterArticle` : la comparaison à la version précédente est celle par défaut. */
export function entreeArticle(article: string, version: string | undefined, comparaison: 'precedente' | 'depose') {
  return sansVide({ article, version, comparaison: comparaison === 'depose' ? ('depose' as const) : undefined });
}

// ---------- Changements d'article ----------

/**
 * Titre de l'origine d'un changement. Seule une attribution vérifiée nomme l'amendement ; une
 * attribution à vérifier ou absente ne le nomme jamais en titre.
 */
export function titreOrigine(o: OrigineModification | null): string {
  if (!o) return 'Texte déposé';
  switch (o.type) {
    case 'amendement':
      return o.amendement.statut === 'verifie' ? `Amendement ${o.amendement.cible.numero}` : 'Origine à vérifier';
    case 'compromis_cmp':
      return 'Compromis de la CMP';
    case 'non_etablie':
      return 'Origine non établie';
  }
}

/** L'amendement à l'origine d'un changement, seulement si l'attribution est vérifiée. */
export const amendementEtabli = (o: OrigineModification | null): AmendementResume | null =>
  o?.type === 'amendement' && o.amendement.statut === 'verifie' ? o.amendement.cible : null;

// ---------- Personnes ----------

/** Nom affiché d'un orateur : la personne reliée, ou le nom tel que publié. */
export const nomOrateur = (o: Orateur) => (o.type === 'personne' ? o.personne.nom : o.nom);

/** Personne reliée de façon certaine ; null pour un nom publié (jamais rapproché par le nom). */
export const personneOrateur = (o: Orateur): PersonneRef | null => (o.type === 'personne' ? o.personne : null);

export function nomAuteur(a: Auteur | null): string {
  if (!a) return 'Auteur non publié';
  switch (a.type) {
    case 'personne':
      return a.personne.nom;
    case 'gouvernement':
      return a.ministre ? `${a.ministre.nom} (Gouvernement)` : 'Gouvernement';
    case 'commission':
      return a.organisation.nom;
  }
}

export const personneAuteur = (a: Auteur | null): PersonneRef | null =>
  a?.type === 'personne' ? a.personne : a?.type === 'gouvernement' ? a.ministre : null;

// ---------- Scrutin ----------

/** Part (0 à 100) de la ligne du groupe parmi ses votes exprimés ; null sans ligne. */
export function partLigne(g: PositionDeGroupe): number | null {
  const exprimes = g.decompte.pour + g.decompte.contre + g.decompte.abstention;
  return g.ligne && exprimes ? Math.round((g.decompte[g.ligne] / exprimes) * 100) : null;
}

export interface SiegeVote {
  position: Position;
  groupe: GroupeRef;
}

/**
 * Sièges de l'hémicycle, de la gauche vers la droite : groupes dans l'ordre de `rang`, puis dans
 * chaque groupe pour, contre, abstention, non-votants, absents. Le contrat ne donne pas les votes
 * nominatifs du scrutin : ce n'est pas la place réelle de chacun.
 */
export function siegesScrutin(groupes: PositionDeGroupe[]): SiegeVote[] {
  return [...groupes]
    .sort((a, b) => a.rang - b.rang)
    .flatMap((g) =>
      (
        [
          ['pour', g.decompte.pour],
          ['contre', g.decompte.contre],
          ['abstention', g.decompte.abstention],
          ['non_votant', g.nonVotants],
          ['absent', g.absents],
        ] as [Position, number][]
      ).flatMap(([position, n]) => Array.from({ length: n }, () => ({ position, groupe: g.groupe }))),
    );
}

// ---------- Pourquoi ce vote ----------

const VERBE: Record<Position, string> = {
  pour: 'a voté pour',
  contre: 'a voté contre',
  abstention: 'a choisi l’abstention',
  non_votant: 'n’a pas pris part au vote',
  absent: 'n’a pas de vote publié',
};

const LIGNE: Record<PositionExprimee, string> = { pour: 'pour', contre: 'contre', abstention: 'abstention' };

/** Avertissement en tête de l'écran (canevas). */
export const AVERTISSEMENT_POURQUOI =
  'Nous rassemblons ce qui est public et sourcé autour de ce vote. Nous ne déduisons pas la raison du vote : à vous de lire.';

/** Tournures de causalité interdites dans « Pourquoi ce vote » (vérifiées par les tests). */
export const CAUSALITE = /parce que|parce qu’|parce qu'|\bcar\b|à cause|en raison|du fait de|c’est pourquoi|donc\b/i;

/**
 * Les faits du vote, phrase par phrase : la position, la ligne du groupe, combien de membres ont la
 * même position. Chaque phrase dit un fait publié ; aucune ne relie deux faits.
 */
export function faitsDuVote(e: ExplicationVote) {
  const nom = e.personne.nom;
  const g = e.groupe;
  return {
    titre: `Pourquoi ${nom} ${VERBE[e.vote.position]} ?`,
    vote: `${nom} ${VERBE[e.vote.position]}${e.vote.parDelegation ? ' (vote par délégation)' : ''}.`,
    miseAuPoint: e.vote.miseAuPoint
      ? `Mise au point publiée : « ${e.vote.miseAuPoint} ». Le vote enregistré n’est pas modifié.`
      : null,
    groupe: g
      ? g.ligne
        ? `Son groupe au moment du vote, ${g.groupe.libelle} : ${LIGNE[g.ligne]}${g.partLigne !== null ? ` à ${g.partLigne} %` : ''} des votes exprimés.`
        : `Son groupe au moment du vote, ${g.groupe.libelle} : pas de position majoritaire.`
      : null,
    memePosition:
      g && (e.vote.position === 'pour' || e.vote.position === 'contre' || e.vote.position === 'abstention')
        ? `${g.memePosition} membre${g.memePosition > 1 ? 's' : ''} du ${g.groupe.libelle} sur ${g.exprimes} votes exprimés ${g.memePosition > 1 ? 'ont' : 'a'} eu la même position.`
        : null,
  };
}

// ---------- Divers ----------

const ENTITES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: '’', rsquo: '’', lsquo: '‘',
  laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', oelig: 'œ', OElig: 'Œ',
};

/** Entité HTML → caractère : numérique (« &#x00E9; », « &#233; ») ou nommée ; inconnue : laissée telle quelle. */
const entite = (brute: string, nom: string) => {
  const code = /^#x([0-9a-f]+)$/i.exec(nom)?.[1];
  const point = code ? parseInt(code, 16) : /^#(\d+)$/.exec(nom) ? Number(nom.slice(1)) : NaN;
  if (Number.isInteger(point)) return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : brute;
  return ENTITES[nom] ?? brute;
};

/** Dispositif ou exposé publié en HTML → texte lisible (balises retirées, entités décodées, espaces resserrés). */
export const texteDuHtml = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, entite)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Adresse du passage d'un compte rendu (document + ancre). */
export const adresseAncre = (a: { url: string | null; ancre: string | null }) =>
  a.url ? (a.ancre ? `${a.url}#${a.ancre}` : a.url) : null;

/** Secondes depuis l'ouverture de la réunion → « +1 h 02 min ». */
export function decalage(secondes: number): string {
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  return h ? `+${h} h ${String(m).padStart(2, '0')} min` : `+${m} min`;
}
