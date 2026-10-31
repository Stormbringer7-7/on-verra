// Règles de l'Actualité (maquette v3, planches « Main », « Calendrier » et « CarteDossier »), sans
// React (testées sous Node) : jours de la bande et du calendrier, filtres, chiffres et libellés du
// jour choisi, ce que montre la carte d'un dossier (résumé de l'étape, nœuds du parcours regroupés
// par lieu, déviations, « depuis le … », vote clé, rendez-vous suivant). Dates : chaînes « AAAA-MM-JJ », calculées en UTC.

import type {
  Accueil,
  CaseCompacte,
  Chambre,
  DemandeAccueil,
  DossierResume,
  EtatDossier,
  JourAccueil,
  Lieu as LieuCase,
  NatureScrutin,
  ReunionsDuJour,
  ScrutinResume,
} from "@/core";
import { capitale, jourMois, pluriel } from "../../format";
import type { NomIcone } from "../Icone";
import { dureeLisible, joursEntre } from "../commun/statuts";

// ---------- Jours ----------

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
export const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
export const JOURS_COURTS = [
  "lun.",
  "mar.",
  "mer.",
  "jeu.",
  "ven.",
  "sam.",
  "dim.",
];
const JOURS_LONGS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/** Semaines montrées avant et après celle du jour choisi (comme la fenêtre du service). */
export const SEMAINES_AUTOUR = 3;

const utc = (jour: string) => new Date(`${jour}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function decaler(jour: string, n: number): string {
  const d = utc(jour);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Rang dans la semaine, lundi = 0. */
export const rangSemaine = (jour: string) => (utc(jour).getUTCDay() + 6) % 7;
export const lundiDe = (jour: string) => decaler(jour, -rangSemaine(jour));

/** Jour civil de l'appareil, faute de jour de référence du service. */
export function aujourdhuiLocal(maintenant = new Date()): string {
  const m = String(maintenant.getMonth() + 1).padStart(2, "0");
  const j = String(maintenant.getDate()).padStart(2, "0");
  return `${maintenant.getFullYear()}-${m}-${j}`;
}

/** Jours de la bande : du lundi trois semaines avant celle du jour au dimanche trois semaines après. */
export function joursDeLaBande(jour: string): string[] {
  const debut = decaler(lundiDe(jour), -7 * SEMAINES_AUTOUR);
  return Array.from({ length: 7 * (2 * SEMAINES_AUTOUR + 1) }, (_, i) =>
    decaler(debut, i),
  );
}

const numero = (jour: string) => Number(jour.slice(8, 10));
const moisDe = (jour: string) => MOIS[Number(jour.slice(5, 7)) - 1];
const quantieme = (jour: string) =>
  numero(jour) === 1 ? "1er" : String(numero(jour));

/** « lun. » et « 26 », pour la bande. */
export const jourCourt = (jour: string) => ({
  jour: JOURS_COURTS[rangSemaine(jour)],
  numero: numero(jour),
});

/** « Lundi 26 octobre », « Dimanche 1er novembre ». */
export const titreJour = (jour: string) =>
  `${JOURS_LONGS[rangSemaine(jour)]} ${quantieme(jour)} ${moisDe(jour)}`;

/** « Lundi 26 octobre 2026 », pour les lecteurs d'écran. */
export const jourLong = (jour: string) =>
  `${titreJour(jour)} ${jour.slice(0, 4)}`;

/** « Aujourd’hui · 2026 », « Hier · 2026 », « Il y a 5 jours · 2026 », « Dans 3 jours · 2026 ». */
export function relatif(jour: string, aujourdhui: string): string {
  const ecart = joursEntre(aujourdhui, jour);
  const mot =
    ecart === 0
      ? "Aujourd’hui"
      : ecart === -1
        ? "Hier"
        : ecart === 1
          ? "Demain"
          : ecart < 0
            ? `Il y a ${-ecart} jours`
            : `Dans ${ecart} jours`;
  return `${mot} · ${jour.slice(0, 4)}`;
}

/** « Semaine du 19 au 25 octobre », « Semaine du 26 octobre au 1er novembre », années différentes données. */
export function libelleSemaine(jour: string): string {
  const debut = lundiDe(jour);
  const fin = decaler(debut, 6);
  const memeAnnee = debut.slice(0, 4) === fin.slice(0, 4);
  const de =
    moisDe(debut) === moisDe(fin) && memeAnnee
      ? quantieme(debut)
      : `${quantieme(debut)} ${moisDe(debut)}${memeAnnee ? "" : ` ${debut.slice(0, 4)}`}`;
  return `Semaine du ${de} au ${quantieme(fin)} ${moisDe(fin)}${memeAnnee ? "" : ` ${fin.slice(0, 4)}`}`;
}

/** Cases d'un mois du calendrier : `null` avant le 1er (le lundi commence la ligne). */
export function grilleMois(annee: number, mois: number): (string | null)[] {
  const premier = `${annee}-${String(mois + 1).padStart(2, "0")}-01`;
  const nb = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return [
    ...Array<null>(rangSemaine(premier)).fill(null),
    ...Array.from({ length: nb }, (_, i) => decaler(premier, i)),
  ];
}

export const nomMois = (mois: number) => MOIS[mois];

// ---------- Jours connus (points) ----------

/** Ce que l'app sait des jours qui ont un élément : les fenêtres reçues et leurs jours. */
export interface JoursConnus {
  fenetres: { debut: string; fin: string }[];
  jours: string[];
}

export const AUCUN_JOUR_CONNU: JoursConnus = { fenetres: [], jours: [] };

/** Ajoute le calendrier d'une réponse (sans doublon) ; rend le même objet s'il n'apporte rien. */
export function ajouterCalendrier(
  connus: JoursConnus,
  a: Accueil | undefined,
): JoursConnus {
  const c = a?.calendrier;
  if (
    !c ||
    connus.fenetres.some(
      (f) => f.debut === c.fenetre.debut && f.fin === c.fenetre.fin,
    )
  )
    return connus;
  return {
    fenetres: [...connus.fenetres, c.fenetre],
    jours: [...new Set([...connus.jours, ...c.jours])].sort(),
  };
}

/** Point sous un jour : `oui` (un élément publié), `non` (fenêtre connue, rien), `inconnu` (hors fenêtre). */
export function pointDuJour(
  connus: JoursConnus,
  jour: string,
): "oui" | "non" | "inconnu" {
  if (connus.jours.includes(jour)) return "oui";
  return connus.fenetres.some((f) => jour >= f.debut && jour <= f.fin)
    ? "non"
    : "inconnu";
}

// ---------- Le jour choisi ----------

/**
 * Le jour choisi d'après la réponse : `jour` du service s'il porte sur ce jour ; un service sans
 * `jour` (version antérieure du contrat) : filtré ici sur les dossiers à suivre et les votes de la
 * semaine (un état final ce jour-là = décidé). null : la réponse porte sur un autre jour.
 */
export function jourChoisi(a: Accueil, jour: string): JourAccueil | null {
  if (a.jour) return a.jour.date === jour ? a.jour : null;
  const du = (d: DossierResume) => d.dernierEvenement?.date === jour;
  return {
    date: jour,
    decides: a.dossiers.filter(
      (d) => du(d) && d.etat !== null && d.etat !== "en_cours",
    ),
    avancent: a.dossiers.filter(
      (d) =>
        (du(d) && (d.etat === null || d.etat === "en_cours")) ||
        d.prochaineEcheance?.date === jour,
    ),
    votes: a.votes.filter((v) => v.date === jour),
  };
}

/** Seuls les dossiers orphelins ont leur carte : un 49.3, une motion vont dans celle de leur dossier. */
export const orphelins = (dossiers: DossierResume[]) =>
  dossiers.filter((d) => d.parent === null);

/**
 * Réunions du jour (commissions et séances publiques) : le total de ce qui est publié, le détail
 * par chambre ; un type que la source ne publie pas (commissions du Sénat) est dit, jamais compté
 * zéro. `[n]` : service sans le compte, ou rien de publié pour aucune chambre.
 */
export function chiffreReunions(reunions: ReunionsDuJour[] | undefined): {
  valeur: string;
  libelle: string;
  detail: string | null;
} {
  const connus = (reunions ?? []).flatMap((r) =>
    [r.commissions, r.seances].filter((n): n is number => n !== null),
  );
  if (!reunions || !connus.length)
    return { valeur: "[n]", libelle: "réunions et séances", detail: null };
  const total = connus.reduce((a, b) => a + b, 0);
  const nom = (c: Chambre) => (c === "AN" ? "Assemblée" : "Sénat");
  const compte = (n: number | null, un: string, plusieurs: string) =>
    n === null ? `${plusieurs} non publiées` : pluriel(n, un, plusieurs);
  const detail = reunions
    .map(
      (r) =>
        `${nom(r.chambre)} : ${compte(r.commissions, "commission", "commissions")}, ${compte(r.seances, "séance", "séances")}`,
    )
    .join(" · ");
  return {
    valeur: String(total),
    libelle: total > 1 ? "réunions et séances" : "réunion ou séance",
    detail,
  };
}

// ---------- Filtres du calendrier ----------

/** Filtres de l'Actualité (planche « Calendrier ») : chambres choisies, Mes suivis. */
export interface FiltresAccueil {
  chambres: Chambre[];
  suivis: boolean;
}

export const SANS_FILTRE: FiltresAccueil = { chambres: [], suivis: false };

/** Identifiants suivis envoyés au service, au plus (comme Mes suivis). */
export const MAX_SUIVIS_FILTRE = 50;

/** La demande de l'Accueil pour ce jour et ces filtres ; rien de plus quand aucun filtre n'est choisi. */
export function demandeAccueil(
  jour: string | null,
  f: FiltresAccueil,
  suivis: string[],
): DemandeAccueil {
  return {
    ...(jour ? { jour } : {}),
    ...(f.chambres.length ? { chambres: [...f.chambres].sort() } : {}),
    ...(f.suivis ? { dossiers: suivis.slice(0, MAX_SUIVIS_FILTRE) } : {}),
  };
}

/** « Assemblée · Mes suivis », null sans filtre. */
export function libelleFiltres(f: FiltresAccueil): string | null {
  const mots = [
    ...(f.chambres.includes("AN") ? ["Assemblée"] : []),
    ...(f.chambres.includes("SENAT") ? ["Sénat"] : []),
    ...(f.suivis ? ["Mes suivis"] : []),
  ];
  return mots.length ? mots.join(" · ") : null;
}

/** « 6 », « tous au Sénat » / « 2 à l’Assemblée, 4 au Sénat » / « aucun ». */
export function chiffreVotes(votes: ScrutinResume[]): {
  valeur: string;
  libelle: string;
} {
  const an = votes.filter((v) => v.chambre === "AN").length;
  const senat = votes.length - an;
  const ou = !votes.length
    ? ""
    : !an
      ? ", tous au Sénat"
      : !senat
        ? ", tous à l’Assemblée"
        : `, ${an} à l’Assemblée, ${senat} au Sénat`;
  return {
    valeur: String(votes.length),
    libelle: `${votes.length > 1 ? "votes publics" : "vote public"}${ou}`,
  };
}

// ---------- Carte d'un dossier ----------

const NATURES_CLES: Partial<Record<NatureScrutin, string>> = {
  ensemble: "ensemble du texte",
  article_unique: "article unique",
  motion: "motion",
  motion_censure: "motion de censure",
};

/**
 * Vote clé : le scrutin qui conclut seul une étape (ensemble du texte, article unique, motion). Un
 * amendement ou un article n'en est jamais un ; plusieurs candidats le même jour : aucun n'est choisi.
 */
export function voteCle(
  votes: ScrutinResume[],
): { scrutin: ScrutinResume; objet: string } | null {
  const candidats = votes.filter((v) => NATURES_CLES[v.nature]);
  return candidats.length === 1
    ? { scrutin: candidats[0], objet: NATURES_CLES[candidats[0].nature]! }
    : null;
}

/** « Et 5 votes sur des amendements de ce texte », « Et 1 vote sur un article de ce texte ». */
export function autresVotes(
  votes: ScrutinResume[],
  cle: ScrutinResume | null,
): string[] {
  const reste = votes.filter((v) => v.id !== cle?.id);
  const n = (natures: NatureScrutin[]) =>
    reste.filter((v) => natures.includes(v.nature)).length;
  const amendements = n(["amendement"]);
  const articles = n(["article"]);
  const autres = reste.length - amendements - articles;
  return [
    amendements &&
      `Et ${amendements} ${amendements > 1 ? "votes sur des amendements" : "vote sur un amendement"} de ce texte`,
    articles &&
      `Et ${articles} ${articles > 1 ? "votes sur des articles" : "vote sur un article"} de ce texte`,
    autres &&
      `Et ${pluriel(autres, "autre vote", "autres votes")} sur ce texte`,
  ].filter((x): x is string => !!x);
}

/**
 * Résumé de l'étape du jour, très bref, d'après les faits publiés : l'acte publié ce jour-là
 * (« Nouvelle lecture : le Sénat rejette le texte ») ; le vote clé de l'ensemble (« Rejeté par le
 * Sénat · 1re lecture Sénat ») ; l'échéance inscrite ce jour-là ; l'étape en cours sinon.
 * `procedure` : « procédure accélérée », à part (en retrait).
 */
export function resumeCarte(
  d: DossierResume,
  jour: string,
  cle: ScrutinResume | null,
): { texte: string; procedure: string | null } {
  const procedure = d.procedure === "acceleree" ? "procédure accélérée" : null;
  const e = d.prochaineEcheance;
  if (d.dernierEvenement?.date === jour)
    return { texte: d.dernierEvenement.libelle, procedure };
  if (
    cle &&
    (cle.nature === "ensemble" || cle.nature === "article_unique") &&
    cle.sort
  ) {
    const par = cle.chambre === "AN" ? "par l’Assemblée" : "par le Sénat";
    return {
      texte: `${capitale(cle.sort)} ${par}${cle.etape ? ` · ${cle.etape.libelle}` : ""}`,
      procedure,
    };
  }
  if (e?.date === jour)
    return { texte: `Inscrit à l’ordre du jour : ${e.libelle}`, procedure };
  if (d.etapeCourante)
    return { texte: `En cours : ${d.etapeCourante.libelle}`, procedure };
  const attendue = d.barre.find((c) => c.attendue);
  if (attendue)
    return { texte: `Étape attendue : ${attendue.libelle}`, procedure };
  return { texte: "Étape non publiée", procedure };
}

/**
 * « depuis le 26/10 (5 jours) » : une étape conclue ce jour-là, comptée jusqu'à aujourd'hui ; une
 * étape qui avance, depuis le début publié de la case courante (`CaseCompacte.debut`), la marque
 * « [jj/mm] ([n] jours) » si ce début n'est pas publié. Un jour à venir conclu, ou pas d'étape
 * courante : rien.
 */
export function depuis(
  jour: string,
  aujourdhui: string,
  decide: boolean,
  barre: CaseCompacte[] = [],
): string | null {
  const libelle = (debut: string) => {
    const n = joursEntre(debut, aujourdhui);
    if (n < 0) return null;
    return `depuis le ${jourMois(debut)} (${n === 0 ? "aujourd’hui" : dureeLisible(n)})`;
  };
  if (decide) return libelle(jour);
  const courante = barre.find((c) => c.courante);
  if (!courante) return null;
  return courante.debut ? libelle(courante.debut) : "depuis le [jj/mm] ([n] jours)";
}

// ---------- Déviations ----------

/** Nom court d'une déviation sur la carte (le libellé du modèle sinon). */
const DEVIATIONS_COURTES: Record<string, string> = {
  procedure_acceleree: "procédure accélérée",
  engagement_responsabilite: "49.3",
  motion_procedure: "motion de procédure",
  retrait: "retrait",
  caducite: "caducité",
};

/**
 * Étiquettes des déviations de la carte (`DossierResume.deviations`) : une par nature, « 49.3 · 2
 * fois », décrite avec ses étapes. La procédure accélérée est déjà dite dans le résumé, le retrait
 * sur le nœud qui porte l'issue : pas deux fois.
 */
export function etiquettesDeviations(
  d: DossierResume,
): { cle: string; libelle: string; description: string }[] {
  const vues = new Map<string, { libelle: string; etapes: string[] }>();
  for (const v of d.deviations ?? []) {
    if (v.cle === "procedure_acceleree" && d.procedure === "acceleree")
      continue;
    if (v.cle === "retrait" && d.etat === "retire") continue;
    const etape = d.barre.find((c) => c.cle === v.etape)?.libelle ?? v.etape;
    const deja = vues.get(v.cle);
    if (deja) deja.etapes.push(etape);
    else
      vues.set(v.cle, {
        libelle: DEVIATIONS_COURTES[v.cle] ?? v.libelle,
        etapes: [etape],
      });
  }
  return [...vues].map(([cle, v]) => ({
    cle,
    libelle:
      v.etapes.length > 1 ? `${v.libelle} · ${v.etapes.length} fois` : v.libelle,
    description: `${v.libelle} : ${v.etapes.join(", ")}`,
  }));
}

/** « 28/10 16 h », « 28/10 9 h 30 », « 28/10 » (heure non publiée). */
export function quandRendezVous(date: string, heure: string | null): string {
  const h = heure?.match(/T(\d{2}):(\d{2})/);
  if (!h) return jourMois(date);
  return `${jourMois(date)} ${Number(h[1])} h${h[2] === "00" ? "" : ` ${h[2]}`}`;
}

// ---------- Nœuds du parcours ----------

export type EtatNoeud =
  | "faite"
  | "courante"
  | "attendue"
  | "a_venir"
  | "inconnu"
  | "arrete"
  | "n_aura_pas_lieu";

export interface Noeud {
  cle: string;
  libelle: string;
  icone: NomIcone;
  etat: EtatNoeud;
  /** Une déviation a lieu à l'une de ses étapes. */
  deviation: boolean;
  /** Issue qui arrête le parcours (« retrait »), sur le nœud `arrete`. */
  issue: string | null;
}

type Lieu = { cle: string; libelle: string; icone: NomIcone };

const LOI: Lieu = { cle: "LOI", libelle: "Loi", icone: "jo" };
/** Institution d'un lieu publié (`CaseCompacte.lieu`) ; promulgation et JO : « Loi ». */
const INSTITUTIONS: Record<LieuCase, Lieu> = {
  AN: { cle: "AN", libelle: "Assemblée", icone: "an" },
  SENAT: { cle: "SENAT", libelle: "Sénat", icone: "senat" },
  CMP: { cle: "CMP", libelle: "CMP", icone: "cmp" },
  CC: { cle: "CC", libelle: "Conseil constit.", icone: "cc" },
  PR: LOI,
  JO: LOI,
  GOUVERNEMENT: { cle: "GOUVERNEMENT", libelle: "Gouvernement", icone: "depot" },
};

/**
 * Institution d'une case, lue dans son libellé (service sans `lieu`) : « Commission AN », « Séance
 * Sénat », « Vote du texte de la CMP », « Conseil constit. », « Promulgation et JO ».
 * null : case des deux chambres (« Nouvelle lecture ») ou sans lieu nommé, montrée seule.
 */
export function lieuDeCase(libelle: string): Lieu | null {
  if (/\bCMP\b|commission mixte/i.test(libelle))
    return { cle: "CMP", libelle: "CMP", icone: "cmp" };
  if (/Conseil constit/i.test(libelle))
    return { cle: "CC", libelle: "Conseil constit.", icone: "cc" };
  if (/Congr[eè]s/i.test(libelle))
    return { cle: "CONGRES", libelle: "Congrès", icone: "congres" };
  if (/Promulgation|Journal officiel|\bJO\b/i.test(libelle)) return LOI;
  if (/S[ée]nat/i.test(libelle))
    return { cle: "SENAT", libelle: "Sénat", icone: "senat" };
  if (/Assembl[ée]e|\bAN\b/.test(libelle))
    return { cle: "AN", libelle: "Assemblée", icone: "an" };
  return null;
}

/**
 * Institution d'une case : son lieu publié (`CaseCompacte.lieu`) ; null, une case des deux
 * chambres ou sans lieu, montrée seule ; lieu absent (service antérieur) : lu dans le libellé.
 */
export function institutionDeCase(c: CaseCompacte): Lieu | null {
  if (c.lieu === undefined) return lieuDeCase(c.libelle);
  return c.lieu ? INSTITUTIONS[c.lieu] : null;
}

const iconeSeule = (libelle: string): NomIcone =>
  /Congr[eè]s/i.test(libelle)
    ? "congres"
    : /lecture/i.test(libelle)
    ? "navette"
    : /rapport/i.test(libelle)
      ? "rapport"
      : /vote|scrutin/i.test(libelle)
        ? "urne"
        : /commission/i.test(libelle)
          ? "commission"
          : "depot";

/** États d'un dossier dont le parcours s'arrête là, et le mot de l'issue. Ce n'est pas un échec. */
const ISSUES: Partial<Record<EtatDossier, string>> = {
  retire: "retrait",
  caduc: "caducité",
  rejete: "rejet",
  irrecevable: "irrecevable",
  fusionne: "fusion",
};

function etatGroupe(cases: CaseCompacte[]): EtatNoeud {
  if (cases.some((c) => c.courante || c.etat === "en_cours")) return "courante";
  if (cases.every((c) => c.etat === "faite")) return "faite";
  if (cases.some((c) => c.attendue)) return "attendue";
  if (cases.some((c) => c.etat === "inconnu")) return "inconnu";
  return "a_venir";
}

/**
 * Nœuds de la carte : les cases visibles (sans objet masquées) regroupées par institution (cases
 * consécutives du même lieu publié = un nœud ; un dépôt sans lieu rejoint le lieu qui suit), puis une fenêtre de 4
 * nœuds autour de l'étape en cours (ou attendue, ou la dernière faite). Un dossier arrêté (retrait,
 * caducité, rejet) : son dernier nœud fait porte l'issue, la suite n'aura pas lieu.
 */
export function noeudsCarte(
  barre: CaseCompacte[],
  etat: EtatDossier | null,
  max = 4,
): { noeuds: Noeud[]; avant: number; apres: number } {
  const groupes: { lieu: Lieu; cases: CaseCompacte[] }[] = [];
  let enAttente: CaseCompacte[] = [];
  for (const c of barre.filter((x) => x.etat !== "sans_objet")) {
    const lieu = institutionDeCase(c);
    if (!lieu && /^D[ée]p[oô]t/i.test(c.libelle)) {
      enAttente.push(c);
      continue;
    }
    const cle = lieu?.cle ?? `seule:${c.cle}`;
    const dernier = groupes.at(-1);
    if (lieu && dernier?.lieu.cle === cle) dernier.cases.push(...enAttente, c);
    else
      groupes.push({
        lieu: lieu ?? { cle, libelle: c.libelle, icone: iconeSeule(c.libelle) },
        cases: [...enAttente, c],
      });
    enAttente = [];
  }
  if (enAttente.length)
    groupes.push({
      lieu: { cle: "depot", libelle: "Dépôt", icone: "depot" },
      cases: enAttente,
    });

  const noeuds: Noeud[] = groupes.map((g) => ({
    cle: g.cases.map((c) => c.cle).join("+"),
    libelle: g.lieu.libelle,
    icone: g.lieu.icone,
    etat: etatGroupe(g.cases),
    deviation: g.cases.some((c) => c.deviation),
    issue: null,
  }));
  const issue = etat ? ISSUES[etat] : undefined;
  if (issue && !noeuds.some((n) => n.etat === "courante")) {
    const dernierFait = noeuds.map((n) => n.etat).lastIndexOf("faite");
    noeuds.forEach((n, i) => {
      if (i === dernierFait) Object.assign(n, { etat: "arrete", issue });
      else if (i > dernierFait && n.etat !== "faite")
        n.etat = "n_aura_pas_lieu";
    });
  }
  const indexDe = (e: EtatNoeud) => noeuds.findIndex((n) => n.etat === e);
  const ici =
    [
      indexDe("courante"),
      indexDe("arrete"),
      indexDe("attendue"),
      noeuds.map((n) => n.etat).lastIndexOf("faite"),
    ].find((i) => i >= 0) ?? 0;
  const debut = Math.max(0, Math.min(ici - 2, noeuds.length - max));
  return {
    noeuds: noeuds.slice(debut, debut + max),
    avant: debut,
    apres: Math.max(0, noeuds.length - debut - max),
  };
}

const ETATS_NOEUD: Record<EtatNoeud, string> = {
  faite: "fait",
  courante: "en cours",
  attendue: "attendu",
  a_venir: "à venir",
  inconnu: "état inconnu",
  arrete: "arrêté",
  n_aura_pas_lieu: "n’aura pas lieu",
};

/** « Parcours : Sénat, fait ; Assemblée, en cours ; puis CMP, à venir », pour les lecteurs d'écran. */
export const descriptionNoeuds = (noeuds: Noeud[]) =>
  `Parcours : ${noeuds.map((n) => `${n.libelle}, ${ETATS_NOEUD[n.etat]}${n.issue ? ` (${n.issue})` : ""}${n.deviation ? ", avec une déviation" : ""}`).join(" ; ")}`;
