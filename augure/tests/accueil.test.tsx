// Actualité (maquette v3 : planches « Main », « Calendrier », « CarteDossier ») : règles du jour
// choisi (libellés, bande, calendrier, points, filtres, réunions), de la carte d'un dossier (nœuds
// regroupés par lieu, fenêtre de 4, déviations, résumé, vote clé jamais un amendement, « depuis le
// … ») et rendu HTML des composants par react-native-web, sur les fixtures du jour.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ConsulterAccueil,
  type CaseCompacte,
  type ScrutinResume,
} from "../src/core";
import { fixtures } from "../src/infra/fixtures";
import { RESUMES } from "../src/infra/fixtures/dossiers";
import { S } from "../src/infra/fixtures/scrutins";
import { creerFixturesBus } from "../src/infra/FixturesBus";
import { BandeJours } from "../src/ui/components/accueil/BandeJours";
import { CarteDossierJour } from "../src/ui/components/accueil/CarteDossierJour";
import {
  AUCUN_JOUR_CONNU,
  ajouterCalendrier,
  autresVotes,
  chiffreReunions,
  chiffreVotes,
  demandeAccueil,
  depuis,
  etiquettesDeviations,
  grilleMois,
  jourChoisi,
  joursDeLaBande,
  libelleFiltres,
  libelleSemaine,
  lieuDeCase,
  noeudsCarte,
  orphelins,
  pointDuJour,
  quandRendezVous,
  relatif,
  resumeCarte,
  titreJour,
  voteCle,
} from "../src/ui/components/accueil/jours";

const texte = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const silencieux = { debug: () => {}, warn: () => {} };
const exemple = (titre: string) =>
  fixtures.ConsulterAccueil.find((e) => e.titre.includes(titre))!.output;

const cases = (
  lignes: [string, string, CaseCompacte["etat"], boolean?][],
): CaseCompacte[] =>
  lignes.map(([cle, libelle, etat, courante]) => ({
    cle,
    libelle,
    etat,
    courante: courante ?? false,
    attendue: false,
    deviation: false,
  }));

describe("jours de l’Actualité", () => {
  it("titre, libellé relatif, semaine (1er, mois et années à cheval)", () => {
    expect(titreJour("2026-10-26")).toBe("Lundi 26 octobre");
    expect(titreJour("2026-11-01")).toBe("Dimanche 1er novembre");
    expect(relatif("2026-10-24", "2026-10-24")).toBe("Aujourd’hui · 2026");
    expect(relatif("2026-10-23", "2026-10-24")).toBe("Hier · 2026");
    expect(relatif("2026-10-25", "2026-10-24")).toBe("Demain · 2026");
    expect(relatif("2026-10-19", "2026-10-24")).toBe("Il y a 5 jours · 2026");
    expect(relatif("2026-10-28", "2026-10-24")).toBe("Dans 4 jours · 2026");
    expect(libelleSemaine("2026-10-21")).toBe("Semaine du 19 au 25 octobre");
    expect(libelleSemaine("2026-10-28")).toBe(
      "Semaine du 26 octobre au 1er novembre",
    );
    expect(libelleSemaine("2026-12-30")).toBe(
      "Semaine du 28 décembre 2026 au 3 janvier 2027",
    );
  });

  it("bande : sept semaines du lundi au dimanche, le jour choisi dedans", () => {
    const b = joursDeLaBande("2026-10-24");
    expect(b).toHaveLength(49);
    expect([b[0], b.at(-1)]).toEqual(["2026-09-28", "2026-11-15"]);
    // Même fenêtre que celle du service pour ce jour.
    expect({ debut: b[0], fin: b.at(-1) }).toEqual(
      exemple("aujourd’hui").calendrier!.fenetre,
    );
  });

  it("grille du mois : le lundi commence la ligne", () => {
    const octobre = grilleMois(2026, 9);
    expect(octobre.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(octobre.filter(Boolean)).toHaveLength(31);
    expect(grilleMois(2026, 1).filter(Boolean)).toHaveLength(28);
  });

  it("points : connus dans les fenêtres reçues, inconnus au-delà (ni oui ni non)", () => {
    const connus = ajouterCalendrier(AUCUN_JOUR_CONNU, exemple("aujourd’hui"));
    expect(ajouterCalendrier(connus, exemple("aujourd’hui"))).toBe(connus);
    expect(pointDuJour(connus, "2026-10-14")).toBe("oui");
    expect(pointDuJour(connus, "2026-10-24")).toBe("non");
    expect(pointDuJour(connus, "2026-06-11")).toBe("inconnu");
    const plus = ajouterCalendrier(connus, {
      ...exemple("aujourd’hui"),
      calendrier: {
        aujourdhui: "2026-10-24",
        fenetre: { debut: "2026-06-01", fin: "2026-06-30" },
        jours: ["2026-06-11"],
      },
    });
    expect(pointDuJour(plus, "2026-06-11")).toBe("oui");
  });

  it("jour choisi : celui du service, ou filtré ici sur une réponse sans `jour`", () => {
    const a = exemple("14 octobre");
    expect(jourChoisi(a, "2026-10-14")).toBe(a.jour);
    expect(jourChoisi(a, "2026-10-15")).toBeNull();
    const ancien = {
      ...exemple("aujourd’hui"),
      jour: undefined,
      calendrier: undefined,
    };
    const j = jourChoisi(ancien, "2026-10-28")!;
    expect(j.avancent.map((d) => d.id)).toEqual(["dossier-budget"]);
    expect(jourChoisi(ancien, "2026-10-22")!.votes.map((v) => v.id)).toEqual([
      "scrutin-an-2433",
    ]);
  });

  it("seuls les dossiers orphelins ont une carte", () => {
    const enfant = {
      ...RESUMES.budget,
      id: "dossier-493",
      parent: {
        dossier: { id: "dossier-budget", titre: "Budget" },
        etape: "lecture_1_o",
        etapeLibelle: "1re lecture AN",
      },
    };
    expect(orphelins([RESUMES.budget, enfant]).map((d) => d.id)).toEqual([
      "dossier-budget",
    ]);
  });

  it("chiffres du jour : votes publics par chambre", () => {
    expect(chiffreVotes([S.sen298, S.sen297])).toEqual({
      valeur: "2",
      libelle: "votes publics, tous au Sénat",
    });
    expect(chiffreVotes([S.an2433])).toEqual({
      valeur: "1",
      libelle: "vote public, tous à l’Assemblée",
    });
    expect(chiffreVotes([S.an2433, S.sen297]).libelle).toBe(
      "votes publics, 1 à l’Assemblée, 1 au Sénat",
    );
    expect(chiffreVotes([])).toEqual({ valeur: "0", libelle: "vote public" });
  });

  it("chiffres du jour : réunions par chambre, les commissions du Sénat non publiées ne comptent pas zéro", () => {
    // Base réelle, mardi 27 octobre 2026 : 9 commissions et 3 séances à l'AN, 1 séance au Sénat.
    expect(
      chiffreReunions([
        { chambre: "AN", commissions: 9, seances: 3 },
        { chambre: "SENAT", commissions: null, seances: 1 },
      ]),
    ).toEqual({
      valeur: "13",
      libelle: "réunions et séances",
      detail:
        "Assemblée : 9 commissions, 3 séances · Sénat : commissions non publiées, 1 séance",
    });
    expect(chiffreReunions(undefined).valeur).toBe("[n]");
    expect(
      chiffreReunions([{ chambre: "SENAT", commissions: null, seances: null }])
        .valeur,
    ).toBe("[n]");
    expect(
      chiffreReunions([{ chambre: "AN", commissions: 0, seances: 1 }]),
    ).toMatchObject({ valeur: "1", libelle: "réunion ou séance" });
  });

  it("filtres : la demande ne porte que ce qui est choisi ; Mes suivis envoie les identifiants", () => {
    const aucun = { chambres: [], suivis: false };
    expect(demandeAccueil(null, aucun, ["d1"])).toEqual({});
    expect(demandeAccueil("2026-10-14", aucun, [])).toEqual({
      jour: "2026-10-14",
    });
    expect(
      demandeAccueil(
        "2026-10-14",
        { chambres: ["SENAT", "AN"], suivis: true },
        ["d1", "d2"],
      ),
    ).toEqual({
      jour: "2026-10-14",
      chambres: ["AN", "SENAT"],
      dossiers: ["d1", "d2"],
    });
    // Mes suivis sans dossier suivi : une liste vide, qui ne garde rien (pas « tout »).
    expect(demandeAccueil(null, { chambres: [], suivis: true }, [])).toEqual({
      dossiers: [],
    });
    expect(libelleFiltres(aucun)).toBeNull();
    expect(libelleFiltres({ chambres: ["SENAT"], suivis: true })).toBe(
      "Sénat · Mes suivis",
    );
  });
});

describe("carte d’un dossier", () => {
  it("institution lue dans le libellé ; « Nouvelle lecture » sans lieu", () => {
    expect(lieuDeCase("Commission AN")?.cle).toBe("AN");
    expect(lieuDeCase("Lecture définitive AN")?.cle).toBe("AN");
    expect(lieuDeCase("Séance Sénat")?.cle).toBe("SENAT");
    expect(lieuDeCase("Vote du texte de la CMP")?.cle).toBe("CMP");
    expect(lieuDeCase("Conseil constit.")?.cle).toBe("CC");
    expect(lieuDeCase("Promulgation et JO")?.cle).toBe("LOI");
    expect(lieuDeCase("Nouvelle lecture")).toBeNull();
  });

  it("nœuds : cases consécutives du même lieu publié regroupées, sans objet masquées", () => {
    const { noeuds, avant, apres } = noeudsCarte(
      RESUMES.energie.barre,
      "en_cours",
    );
    // AN (dépôt, commission, séance) · Sénat · CMP · vote du texte de la CMP (les deux chambres,
    // lieu null : seul) · Conseil · Loi (promulgation PR, JO) : fenêtre de 4 autour du Conseil.
    expect(noeuds.map((n) => [n.libelle, n.etat])).toEqual([
      ["CMP", "faite"],
      ["Vote du texte de la CMP", "faite"],
      ["Conseil constit.", "courante"],
      ["Loi", "a_venir"],
    ]);
    expect([avant, apres]).toEqual([2, 0]);
  });

  it("nœuds : le lieu publié prime sur le libellé ; sans lieu (service antérieur), le libellé", () => {
    // Dépôt au Sénat (lieu SENAT, libellé « Dépôt ») : avec la 1re lecture du Sénat.
    const { noeuds } = noeudsCarte(RESUMES.medecins.barre, "promulgue", 8);
    expect(noeuds.map((n) => n.libelle)).toEqual([
      "Sénat",
      "Assemblée",
      "Sénat",
      "Assemblée",
      "Conseil constit.",
      "Loi",
    ]);
    expect(noeuds[0].cle).toBe("depot+lecture_1_o");
    // Un lieu publié contraire au libellé : le lieu.
    const [seule] = noeudsCarte(
      [{ ...cases([["x", "Commission AN", "faite"]])[0], lieu: "SENAT" }],
      null,
    ).noeuds;
    expect(seule.libelle).toBe("Sénat");
    // Congrès du Parlement : lieu null, montré seul, son icône.
    const [congres] = noeudsCarte(
      [{ ...cases([["congres", "Congrès du Parlement", "a_venir"]])[0], lieu: null }],
      null,
    ).noeuds;
    expect([congres.libelle, congres.icone]).toEqual(["Congrès du Parlement", "congres"]);
  });

  it("déviations en étiquettes : une par nature, ni la procédure accélérée ni le retrait redits", () => {
    // PLF 2026 (base réelle, DLR5L17N52428) : deux 49.3, en nouvelle lecture et en lecture définitive.
    const plf = {
      ...RESUMES.budget,
      deviations: [
        { cle: "engagement_responsabilite", libelle: "Engagement de la responsabilité du Gouvernement (49.3)", etape: "nouvelle_lecture", issue: "rejete" },
        { cle: "engagement_responsabilite", libelle: "Engagement de la responsabilité du Gouvernement (49.3)", etape: "lecture_definitive", issue: "rejete" },
        { cle: "motion_procedure", libelle: "Motion de procédure (rejet préalable, question préalable, renvoi en commission)", etape: "lecture_1_o", issue: null },
      ],
    };
    expect(etiquettesDeviations(plf)).toEqual([
      {
        cle: "engagement_responsabilite",
        libelle: "49.3 · 2 fois",
        description: "49.3 : Nouvelle lecture, Lecture définitive AN",
      },
      {
        cle: "motion_procedure",
        libelle: "motion de procédure",
        description: "motion de procédure : 1re lecture AN",
      },
    ]);
    // Énergie : procédure accélérée, déjà dite dans le résumé.
    expect(etiquettesDeviations(RESUMES.energie)).toEqual([]);
    expect(
      etiquettesDeviations({
        ...RESUMES.location,
        etat: "retire",
        deviations: [{ cle: "retrait", libelle: "Retrait", etape: "depot", issue: "retire" }],
      }),
    ).toEqual([]);
    // Service antérieur (sans `deviations`) : aucune étiquette.
    expect(etiquettesDeviations({ ...RESUMES.energie, deviations: undefined })).toEqual([]);
  });

  it("fenêtre de 4 nœuds autour de l’étape en cours (planche : 8 nœuds, les 4 derniers)", () => {
    const budget2026 = cases([
      ["depot", "Dépôt AN", "faite"],
      ["commission_1_o", "Commission AN", "faite"],
      ["seance_1_o", "Séance AN", "faite"],
      ["commission_1_s", "Commission Sénat", "faite"],
      ["seance_1_s", "Séance Sénat", "faite"],
      ["cmp", "CMP", "faite"],
      ["nl_an", "Nouvelle lecture AN", "faite"],
      ["nl_s", "Nouvelle lecture Sénat", "faite"],
      ["lecture_definitive", "Lecture définitive AN", "faite"],
      ["cc", "Conseil constit.", "en_cours", true],
      ["promulgation", "Promulgation", "a_venir"],
      ["jo", "JO", "a_venir"],
    ]);
    const { noeuds, avant } = noeudsCarte(budget2026, "en_cours");
    expect(noeuds.map((n) => n.libelle)).toEqual([
      "Sénat",
      "Assemblée",
      "Conseil constit.",
      "Loi",
    ]);
    expect(avant).toBe(4);
  });

  it("dossier retiré : le dernier nœud fait porte l’issue, la suite n’aura pas lieu (pas un échec)", () => {
    const eau = cases([
      ["depot", "Dépôt AN", "faite"],
      ["seance_1_o", "Séance AN", "faite"],
      ["seance_1_s", "Séance Sénat", "a_venir"],
      ["cmp", "CMP", "a_venir"],
      ["jo", "Promulgation et JO", "a_venir"],
    ]);
    const { noeuds } = noeudsCarte(eau, "retire");
    expect(noeuds.map((n) => [n.libelle, n.etat, n.issue])).toEqual([
      ["Assemblée", "arrete", "retrait"],
      ["Sénat", "n_aura_pas_lieu", null],
      ["CMP", "n_aura_pas_lieu", null],
      ["Loi", "n_aura_pas_lieu", null],
    ]);
  });

  it("vote clé : le scrutin qui conclut seul l’étape, jamais un amendement ni un article", () => {
    expect(voteCle([S.sen297])?.objet).toBe("motion");
    expect(voteCle([S.an2433])).toBeNull();
    const amendement: ScrutinResume = {
      ...S.an2433,
      id: "x",
      nature: "amendement",
    };
    expect(voteCle([S.sen298, amendement])?.scrutin.id).toBe(
      "scrutin-senat-298",
    );
    // Deux candidats le même jour : aucun n'est choisi.
    expect(voteCle([S.sen298, { ...S.sen298, id: "y" }])).toBeNull();
    expect(
      autresVotes(
        [S.sen298, amendement, { ...amendement, id: "z" }, S.an2433],
        S.sen298,
      ),
    ).toEqual([
      "Et 2 votes sur des amendements de ce texte",
      "Et 1 vote sur un article de ce texte",
    ]);
  });

  it("résumé de l’étape : l’acte du jour, sinon le vote de l’ensemble, l’échéance, l’étape en cours", () => {
    expect(resumeCarte(RESUMES.location, "2026-10-14", S.sen297).texte).toBe(
      "Nouvelle lecture : le Sénat rejette le texte",
    );
    expect(resumeCarte(RESUMES.energie, "2026-10-14", S.sen298)).toEqual({
      texte: "Adopté par le Sénat · Vote du texte de la CMP",
      procedure: "procédure accélérée",
    });
    expect(resumeCarte(RESUMES.budget, "2026-10-28", null).texte).toBe(
      "Inscrit à l’ordre du jour : 1re lecture AN · Vote solennel sur la première partie",
    );
    expect(resumeCarte(RESUMES.budget, "2026-10-22", null).texte).toBe(
      "En cours : 1re lecture AN",
    );
  });

  it("« depuis le » : la décision comptée jusqu’à aujourd’hui ; en cours, depuis le début de l’étape courante", () => {
    expect(depuis("2026-10-14", "2026-10-24", true)).toBe(
      "depuis le 14/10 (10 jours)",
    );
    expect(depuis("2026-10-24", "2026-10-24", true)).toBe(
      "depuis le 24/10 (aujourd’hui)",
    );
    // Budget : 1re lecture AN en cours depuis le 08/10.
    expect(depuis("2026-10-22", "2026-10-24", false, RESUMES.budget.barre)).toBe(
      "depuis le 08/10 (2 semaines)",
    );
    // Location : lecture définitive courante, pas encore commencée (début non publié) : la marque.
    expect(depuis("2026-10-22", "2026-10-24", false, RESUMES.location.barre)).toBe(
      "depuis le [jj/mm] ([n] jours)",
    );
    // Service antérieur (case sans `debut`) : la marque ; pas d'étape courante : rien.
    expect(
      depuis("2026-10-22", "2026-10-24", false, cases([["seance_1_o", "Séance AN", "en_cours", true]])),
    ).toBe("depuis le [jj/mm] ([n] jours)");
    expect(depuis("2026-10-22", "2026-10-24", false, RESUMES.medecins.barre)).toBeNull();
    expect(quandRendezVous("2026-10-28", "2026-10-28T16:00:00+01:00")).toBe(
      "28/10 16 h",
    );
    expect(quandRendezVous("2026-10-28", "2026-10-28T09:30:00+01:00")).toBe(
      "28/10 9 h 30",
    );
    expect(quandRendezVous("2026-10-28", null)).toBe("28/10");
  });

  it("rendu : vote clé, nœuds décrits, rendez-vous suivant, aucun caractère décoratif", () => {
    const html = renderToStaticMarkup(
      <CarteDossierJour
        dossier={RESUMES.location}
        jour="2026-10-14"
        aujourdhui="2026-10-24"
        votes={[S.sen297]}
        decide
        onOuvrir={() => {}}
      />,
    );
    const t = texte(html);
    expect(t).toContain("Nouvelle lecture : le Sénat rejette le texte");
    expect(t).toContain("Vote clé · motion");
    expect(t).toContain("198 pour");
    expect(t).toContain("depuis le 14/10 (10 jours)");
    expect(t).toContain("05/11 15 h");
    expect(html).toContain("Parcours : ");
    expect(t).not.toMatch(/[✎§◐▥⌖⚡✦★]/u);
  });

  it("rendu : sans échéance publiée, « Aucun rendez-vous publié » ; un amendement n’est pas un vote clé", () => {
    const t = texte(
      renderToStaticMarkup(
        <CarteDossierJour
          dossier={{ ...RESUMES.budget, prochaineEcheance: null }}
          jour="2026-10-22"
          aujourdhui="2026-10-24"
          votes={[S.an2433]}
          decide={false}
          onOuvrir={() => {}}
        />,
      ),
    );
    expect(t).toContain("Aucun rendez-vous publié");
    expect(t).not.toContain("Vote clé");
    expect(t).toContain("Et 1 vote sur un article de ce texte");
    expect(t).toContain("depuis le 08/10 (2 semaines)");
  });

  it("rendu : les déviations en étiquettes, décrites aux lecteurs d’écran", () => {
    const html = renderToStaticMarkup(
      <CarteDossierJour
        dossier={{
          ...RESUMES.budget,
          deviations: [
            { cle: "engagement_responsabilite", libelle: "Engagement de la responsabilité du Gouvernement (49.3)", etape: "lecture_1_o", issue: "rejete" },
          ],
        }}
        jour="2026-10-22"
        aujourdhui="2026-10-24"
        votes={[]}
        decide={false}
        onOuvrir={() => {}}
      />,
    );
    expect(texte(html)).toContain("49.3");
    expect(html).toContain("Déviation, 49.3 : 1re lecture AN");
  });
});

describe("bande des jours", () => {
  it("rendu : 49 jours, le choisi sélectionné, aujourd’hui et les points dits aux lecteurs d’écran", () => {
    const connus = ajouterCalendrier(AUCUN_JOUR_CONNU, exemple("aujourd’hui"));
    const html = renderToStaticMarkup(
      <BandeJours
        choisi="2026-10-14"
        aujourdhui="2026-10-24"
        connus={connus}
        onChoisir={() => {}}
        onCalendrier={() => {}}
      />,
    );
    expect(texte(html)).toContain("Semaine du 12 au 18 octobre");
    expect(html).toContain("Mercredi 14 octobre 2026, au moins un élément");
    expect(html).toContain("Samedi 24 octobre 2026, aujourd’hui");
    expect(html).toContain("Déployer le calendrier");
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });
});

describe("Accueil sur le FixturesBus", () => {
  const bus = creerFixturesBus(silencieux);

  it("aujourd’hui sans `jour` ; un jour demandé ; ses dossiers sans parent", async () => {
    const a = await bus.execute(ConsulterAccueil({}));
    expect(a.jour?.date).toBe(a.calendrier?.aujourdhui);
    const j = await bus.execute(ConsulterAccueil({ jour: "2026-10-14" }));
    expect(j.jour?.decides.map((d) => d.id)).toEqual([
      "dossier-location",
      "dossier-energie",
    ]);
    expect(j.semaine).toEqual({ debut: "2026-10-12", fin: "2026-10-18" });
    expect(j.jour?.reunions).toEqual([
      { chambre: "AN", commissions: 6, seances: 2 },
      { chambre: "SENAT", commissions: null, seances: 1 },
    ]);
    // Filtre Sénat : les décisions du jour y ont lieu, ses réunions et ses votes seuls.
    const senat = await bus.execute(
      ConsulterAccueil({ jour: "2026-10-14", chambres: ["SENAT"] }),
    );
    expect(senat.jour?.reunions?.map((r) => r.chambre)).toEqual(["SENAT"]);
    expect(senat.jour?.votes.every((v) => v.chambre === "SENAT")).toBe(true);
    for (const e of fixtures.ConsulterAccueil) {
      const jour = e.output.jour!;
      expect(
        [...jour.decides, ...jour.avancent].every((d) => d.parent === null),
        e.titre,
      ).toBe(true);
      expect(
        jour.votes.every((v) => v.date === jour.date),
        e.titre,
      ).toBe(true);
      expect(
        e.output.calendrier!.jours.every(
          (x) =>
            x >= e.output.calendrier!.fenetre.debut &&
            x <= e.output.calendrier!.fenetre.fin,
        ),
      ).toBe(true);
    }
  });
});
