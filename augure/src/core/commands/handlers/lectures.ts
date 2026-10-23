import { ordonnerDeGaucheADroite } from '../../domain/hemicycle';
import {
  NATURES_FINALES,
  type ActiviteTheme,
  type Assemblee,
  type Catalogue,
  type Champions,
  type Decompte,
  type EtatBase,
  type FicheDepute,
  type FicheGroupe,
  type FicheScrutin,
  type GroupeSiegeant,
  type MembreAssemblee,
  type Nature,
  type Niveau,
  type ResultatRecherche,
  type ScrutinResume,
  type ThemeDeGroupe,
} from '../../domain/model';
import { compterEntre, debutDouzeMois, moinsUnAn, normaliser } from '../../domain/texte';
import { bilan, estEcart } from '../../domain/votes';
import { legislatureDuScrutin, type Partitions } from '../../partitions';
import type { EnClairProvider, EntreeRecherche, ParlementRepository, SqlDatabase, ThemeClassifier } from '../../ports';

type EntreeIndexee = EntreeRecherche & { texte: string; theme: string };

export interface LecturesDeps {
  partitions: Partitions;
  /** Repository d'une partition (une base = une législature). */
  repository: (db: SqlDatabase) => ParlementRepository;
  themes: ThemeClassifier;
  enClair: EnClairProvider;
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Membres à une date, ordonnés de la gauche vers la droite, et leurs groupes avec effectifs. */
async function hemicycle(r: ParlementRepository, date: string): Promise<{ membres: MembreAssemblee[]; groupes: GroupeSiegeant[] }> {
  const membres = ordonnerDeGaucheADroite(await r.membres(date));
  const effectifs = new Map<string, number>();
  for (const m of membres) if (m.groupe) effectifs.set(m.groupe, (effectifs.get(m.groupe) ?? 0) + 1);
  const infos = new Map((await r.groupes([...effectifs.keys()])).map((g) => [g.ref, g]));
  const groupes = [...effectifs.entries()].map(([ref, sieges]) => ({
    ...(infos.get(ref) ?? { ref, abrege: '?', libelle: 'Groupe inconnu', couleur: null }),
    sieges,
  }));
  return { membres, groupes };
}

export function lectures({ partitions, repository, themes, enClair }: LecturesDeps) {
  const repos = new WeakMap<SqlDatabase, ParlementRepository>();
  const repo = async (legislature: string): Promise<ParlementRepository> => {
    const db = await partitions.db(legislature);
    let r = repos.get(db);
    if (!r) repos.set(db, (r = repository(db)));
    return r;
  };
  // Index de recherche d'une législature : construit à la première recherche, gardé en mémoire.
  // Chaque frappe filtre ~9 000 scrutins en mémoire puis ne lit que les résultats en SQL.
  const index = new WeakMap<SqlDatabase, Promise<EntreeIndexee[]>>();
  const indexDe = async (legislature: string): Promise<EntreeIndexee[]> => {
    const db = await partitions.db(legislature);
    let i = index.get(db);
    if (!i) {
      const r = await repo(legislature);
      i = r.entreesRecherche().then((entrees) =>
        entrees.map((e) => ({ ...e, texte: normaliser(`${e.titre} ${e.intitule}`), theme: themeDe(e.titre) })),
      );
      index.set(db, i);
      i.catch(() => index.delete(db));
    }
    return i;
  };
  // Le thème d'un titre ne change pas : classé une fois.
  const themesDesTitres = new Map<string, string>();
  const themeDe = (titre: string) => {
    let t = themesDesTitres.get(titre);
    if (!t) themesDesTitres.set(titre, (t = themes.classer(titre)));
    return t;
  };

  return {
    synchroniser: async (): Promise<EtatBase> => {
      await partitions.chargerIndex();
      return (await partitions.preparer(partitions.derniere())).etat;
    },

    legislatures: () => partitions.legislatures(),

    assemblee: async ({ legislature }: { legislature?: string }): Promise<Assemblee> => {
      const leg = legislature ?? partitions.derniere();
      const r = await repo(leg);
      const scrutin = await r.dernierScrutin();
      const date = scrutin?.date ?? aujourdhui();
      const [{ membres, groupes }, positions] = await Promise.all([
        hemicycle(r, date),
        scrutin ? r.positionsDuScrutin(scrutin.uid) : Promise.resolve(new Map()),
      ]);
      const indicateurs = await r.indicateurs(membres.map((m) => m.acteur));
      return {
        legislature: leg,
        date,
        groupes,
        membres: membres.map((m) => {
          const i = indicateurs.get(m.acteur);
          return {
            ...m,
            position: positions.get(m.acteur)?.position ?? (scrutin ? ('absent' as const) : null),
            presence: i && i.scrutins - i.empeches > 0 ? i.exprimes / (i.scrutins - i.empeches) : null,
            ecarts: i?.dissidences ?? 0,
          };
        }),
        scrutin,
      };
    },

    groupe: async ({ ref, legislature }: { ref: string; legislature: string }): Promise<FicheGroupe> => {
      const r = await repo(legislature);
      const groupe = await r.groupe(ref);
      if (!groupe) throw new Error(`Groupe inconnu : ${ref}`);
      const derniersVotes = await r.derniersVotesDuGroupe(ref, 8);
      // Un groupe peut avoir disparu (renommé, dissous, parfois avant tout vote) :
      // on le montre à son dernier jour d'existence, sinon à son dernier vote.
      const dernierVote = derniersVotes[0]?.scrutin.date;
      const date =
        groupe.fin && (!dernierVote || groupe.fin < dernierVote) ? groupe.fin : (dernierVote ?? aujourdhui());
      const fin = dernierVote && dernierVote < date ? dernierVote : date;
      const debut = moinsUnAn(fin);
      const membres = (await r.membres(date)).filter((m) => m.groupe === ref);
      const acteurs = membres.map((m) => m.acteur);

      const [voteUni, alliances, mensuelle, motions, indicateurs, mouvements, votes] = await Promise.all([
        r.voteUni(ref),
        r.alliances(ref),
        r.presenceMensuelle(ref, 12),
        r.motionsSoutenues(ref, Math.max(1, Math.ceil(membres.length / 2))),
        r.indicateurs(acteurs),
        r.mouvements(ref),
        r.votesDuGroupe(ref, debut, fin),
      ]);

      // Présence moyenne des membres et écarts internes, depuis les indicateurs on-verra.
      let presences = 0;
      let nbPresences = 0;
      let dissidences = 0;
      let exprimesEnGroupe = 0;
      const participation = (acteur: string) => {
        const i = indicateurs.get(acteur);
        return i && i.scrutins - i.empeches > 0 ? i.exprimes / (i.scrutins - i.empeches) : null;
      };
      for (const i of indicateurs.values()) {
        if (i.scrutins - i.empeches > 0) {
          presences += i.exprimes / (i.scrutins - i.empeches);
          nbPresences++;
        }
        dissidences += i.dissidences;
        exprimesEnGroupe += i.exprimesEnGroupe;
      }

      // Position majoritaire du groupe, thème par thème, sur 12 mois.
      const parTheme = new Map<string, ThemeDeGroupe>();
      for (const v of votes) {
        const theme = themeDe(v.scrutin.titre);
        let t = parTheme.get(theme);
        if (!t) parTheme.set(theme, (t = { theme, decompte: { pour: 0, contre: 0, abstention: 0 }, sansLigne: 0, dernier: null }));
        if (v.ligne) {
          t.decompte[v.ligne]++;
          // Votes du plus récent au plus ancien : le premier rencontré est le dernier.
          t.dernier ??= { scrutin: v.scrutin, ligne: v.ligne };
        } else t.sansLigne++;
      }
      const total = (d: Decompte) => d.pour + d.contre + d.abstention;

      const { fin: _fin, ...g } = groupe;
      return {
        groupe: g,
        legislature,
        date,
        periode: { debut, fin },
        sieges: membres.length,
        stats: {
          presence: nbPresences ? presences / nbPresences : null,
          voteUni,
          ecartsInternes: exprimesEnGroupe ? dissidences / exprimesEnGroupe : null,
          motions,
        },
        alliances,
        presenceMensuelle: [...mensuelle].reverse(),
        composition: {
          femmes: membres.filter((m) => m.civilite === 'Mme').length,
          hommes: membres.filter((m) => m.civilite === 'M.').length,
          ...mouvements,
        },
        themes: [...parTheme.values()].sort((a, b) => total(b.decompte) - total(a.decompte)),
        derniersVotes,
        membres: membres
          .map((m) => ({
            acteur: m.acteur,
            prenom: m.prenom,
            nom: m.nom,
            departement: m.departement,
            circonscription: m.circonscription,
            presence: participation(m.acteur),
            ecarts: indicateurs.get(m.acteur)?.dissidences ?? 0,
          }))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      };
    },

    depute: async ({ acteur, legislature }: { acteur: string; legislature: string }): Promise<FicheDepute> => {
      const r = await repo(legislature);
      const d = await r.depute(acteur);
      if (!d) throw new Error(`Député inconnu : ${acteur}`);
      const fin = (await r.dernierVoteDuDepute(acteur)) ?? aujourdhui();
      const debut = moinsUnAn(fin);
      const bruts = await r.votesDuDepute(acteur, debut, fin);
      const votes = bruts.map((v) => ({
        ...v,
        ecart: estEcart(v.position, v.ligneGroupe),
        theme: themeDe(v.scrutin.titre),
      }));
      const parcours = (await r.parcours(acteur)).filter((p) => p.debut <= fin && (p.fin === null || p.fin >= debut));
      const groupe = votes.at(-1)?.groupe ?? parcours.at(-1)?.groupe ?? null;
      return { ...d, legislature, groupe, parcours, periode: { debut, fin }, bilan: bilan(votes), votes };
    },

    scrutin: async ({ uid, depute }: { uid: string; depute?: string }): Promise<FicheScrutin> => {
      const r = await repo(legislatureDuScrutin(uid));
      const scrutin = await r.scrutin(uid);
      if (!scrutin) throw new Error(`Scrutin inconnu : ${uid}`);
      const [groupes, positions, sansVote, resume] = await Promise.all([
        r.positionsDesGroupes(uid),
        r.positionsDuScrutin(uid),
        r.sansVote(uid),
        enClair.pour(scrutin),
      ]);
      let nonVotants = 0;
      for (const p of positions.values()) if (p.position === 'non_votant') nonVotants++;

      let consulte: FicheScrutin['depute'] = null;
      if (depute) {
        const d = await r.depute(depute);
        const vote = positions.get(depute);
        const position = vote?.position ?? (sansVote.includes(depute) ? 'absent' : null);
        if (d && position) {
          const ligne = groupes.find((g) => g.groupe.ref === vote?.groupe)?.ligne ?? null;
          consulte = { acteur: depute, prenom: d.prenom, nom: d.nom, position, ecart: estEcart(position, ligne) };
        }
      }
      return {
        scrutin,
        absents: sansVote.length,
        nonVotants,
        groupes: [...groupes].sort((a, b) => b.membres - a.membres),
        enClair: resume,
        lienOfficiel: `https://www.assemblee-nationale.fr/dyn/${scrutin.legislature}/scrutins/${scrutin.numero}`,
        depute: consulte,
      };
    },

    scrutins: async (f: {
      legislature?: string;
      natures?: readonly Nature[];
      niveau?: Niveau;
      texte?: string;
      resultat?: 'adopte' | 'rejete';
      theme?: string;
      limite?: number;
    }): Promise<ScrutinResume[]> => {
      const { legislature, theme, texte, ...filtre } = f;
      const leg = legislature ?? partitions.derniere();
      const r = await repo(leg);
      const limite = filtre.limite ?? 200;
      const natures = filtre.natures ?? NATURES_FINALES;
      if (!theme && !texte) return r.scrutins({ ...filtre, natures, limite });
      // Texte (sans accents) ou thème (déduit du titre) : filtrés sur l'index en mémoire.
      const t = texte ? normaliser(texte) : null;
      const prefixe = filtre.resultat === 'adopte' ? 'adopt' : filtre.resultat === 'rejete' ? 'rejet' : null;
      const uids: string[] = [];
      for (const e of await indexDe(leg)) {
        if (!natures.includes(e.nature)) continue;
        if (filtre.niveau && e.niveau !== filtre.niveau) continue;
        if (prefixe && !e.sort?.startsWith(prefixe)) continue;
        if (theme && e.theme !== theme) continue;
        if (t && !e.texte.includes(t)) continue;
        uids.push(e.uid);
        if (uids.length >= limite) break;
      }
      return r.scrutinsParUid(uids);
    },

    rechercher: async ({ texte, legislature }: { texte: string; legislature?: string }): Promise<ResultatRecherche> => {
      const t = normaliser(texte.trim());
      if (t.length < 2) return { deputes: [], scrutins: [] };
      const r = await repo(legislature ?? partitions.derniere());
      const leg = legislature ?? partitions.derniere();
      const [deputes, entrees] = await Promise.all([r.deputes(), indexDe(leg)]);
      const uids = entrees.filter((e) => e.texte.includes(t)).slice(0, 20).map((e) => e.uid);
      return {
        deputes: deputes.filter((d) => normaliser(`${d.prenom} ${d.nom}`).includes(t)).slice(0, 20),
        scrutins: await r.scrutinsParUid(uids),
      };
    },

    explorer: async ({ legislature }: { legislature?: string }): Promise<Catalogue> => {
      const leg = legislature ?? partitions.derniere();
      const r = await repo(leg);
      const date = (await r.dernierScrutin())?.date ?? aujourdhui();
      const [deputes, { membres, groupes }, titres] = await Promise.all([r.deputes(), hemicycle(r, date), r.titres()]);

      const parTheme = new Map<string, number>();
      let scrutins = 0;
      for (const t of titres) {
        const theme = themeDe(t.titre);
        parTheme.set(theme, (parTheme.get(theme) ?? 0) + t.scrutins);
        scrutins += t.scrutins;
      }
      // Territoires : départements des députés en fonction.
      const enFonction = new Set(membres.map((m) => m.acteur));
      const territoires = new Map<string, { departement: string; numero: string | null; deputes: number }>();
      for (const d of deputes) {
        if (!enFonction.has(d.acteur) || !d.departement) continue;
        const t = territoires.get(d.departement) ?? { departement: d.departement, numero: d.numDepartement, deputes: 0 };
        t.deputes++;
        territoires.set(d.departement, t);
      }
      return {
        legislature: leg,
        deputes,
        groupes: [...groupes].sort((a, b) => b.sieges - a.sieges),
        themes: themes.themes
          .map((theme) => ({ theme, scrutins: parTheme.get(theme) ?? 0 }))
          .filter((t) => t.scrutins > 0),
        territoires: [...territoires.values()].sort((a, b) => a.departement.localeCompare(b.departement, 'fr')),
        scrutins,
      };
    },

    champions: async ({ legislature }: { legislature?: string }): Promise<Champions> => {
      const leg = legislature ?? partitions.derniere();
      const r = await repo(leg);
      const fin = (await r.dernierScrutin())?.date ?? aujourdhui();
      // 12 mois calendaires : la granularité de l'activité pré-calculée par on-verra.
      const debut = debutDouzeMois(fin);
      const [membres, activite, scrutins, mandats] = await Promise.all([
        r.membres(fin),
        r.activite(debut, fin),
        r.scrutinsEntre(debut, fin),
        r.mandats(),
      ]);
      const groupes = new Map((await r.groupes([...new Set(membres.flatMap((m) => (m.groupe ? [m.groupe] : [])))])).map((g) => [g.ref, g]));

      // Dates des scrutins de chaque thème : le nombre tenu pendant un mandat se compte par bornes.
      const datesParTheme = new Map<string, string[]>();
      for (const s of scrutins) {
        const theme = themeDe(s.titre);
        const dates = datesParTheme.get(theme) ?? [];
        dates.push(s.date);
        datesParTheme.set(theme, dates);
      }
      const mandatsParActeur = new Map<string, { debut: string; fin: string | null }[]>();
      for (const m of mandats) mandatsParActeur.set(m.acteur, [...(mandatsParActeur.get(m.acteur) ?? []), m]);

      const vide = (): ActiviteTheme => ({ scrutins: 0, absences: 0, exprimes: 0, pour: 0, ecarts: 0 });
      const parActeur = new Map<string, Record<string, ActiviteTheme>>();
      for (const m of membres) {
        const parTheme: Record<string, ActiviteTheme> = {};
        for (const [theme, dates] of datesParTheme) {
          const a = vide();
          for (const mandat of mandatsParActeur.get(m.acteur) ?? []) {
            const d = mandat.debut > debut ? mandat.debut : debut;
            const f = mandat.fin && mandat.fin < fin ? mandat.fin : fin;
            a.scrutins += compterEntre(dates, d, f);
          }
          parTheme[theme] = a;
        }
        parActeur.set(m.acteur, parTheme);
      }
      const votes = new Map<string, number>();
      for (const a of activite) {
        const parTheme = parActeur.get(a.acteur);
        if (!parTheme) continue; // plus en fonction
        const t = parTheme[themeDe(a.titre)];
        if (!t) continue;
        t.exprimes += a.exprimes;
        t.pour += a.pour;
        t.ecarts += a.ecarts;
        const cle = `${a.acteur}|${themeDe(a.titre)}`;
        votes.set(cle, (votes.get(cle) ?? 0) + a.votes);
      }
      for (const [acteur, parTheme] of parActeur) {
        for (const [theme, t] of Object.entries(parTheme)) {
          t.absences = Math.max(0, t.scrutins - (votes.get(`${acteur}|${theme}`) ?? 0));
        }
      }

      return {
        legislature: leg,
        periode: { debut, fin },
        themes: themes.themes.filter((t) => datesParTheme.has(t)),
        deputes: membres.map((m) => ({
          acteur: m.acteur,
          prenom: m.prenom,
          nom: m.nom,
          groupe: (m.groupe && groupes.get(m.groupe)) || null,
          parTheme: parActeur.get(m.acteur)!,
        })),
      };
    },
  };
}
