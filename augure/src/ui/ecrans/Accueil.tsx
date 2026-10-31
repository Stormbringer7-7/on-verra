// Onglet Actualité (maquette v3, planche « Main ») : un jour, sa semaine, ses dossiers. Titre = le
// jour choisi (« Lundi 26 octobre »), au-dessus « Aujourd’hui / Hier / Il y a n jours » ; aujourd'hui
// par défaut, « Aujourd’hui » pour y revenir. Bande des jours défilable (point sous chaque jour qui a
// un élément) et feuille calendrier (planche « Calendrier », ses filtres Assemblée, Sénat, Mes suivis,
// envoyés au service et rappelés au-dessus du jour). Puis, en cascade : les chiffres du jour (votes,
// textes, réunions de commission et séances publiques),
// « Ce qui a été décidé » et « Ce qui avance » (cartes des seuls dossiers orphelins, planche
// « CarteDossier »). À côté : les votes du jour, « Parcourir » (listes, chiffres), les sources.

import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConsulterAccueil, type JourAccueil } from "@/core";
import { useAller } from "../../navigation";
import { Action, Label, Puce, T, TitreSection } from "../components/base";
import { Puces } from "../components/fondations";
import { BandeJours } from "../components/accueil/BandeJours";
import { CarteDossierJour } from "../components/accueil/CarteDossierJour";
import { FeuilleCalendrier } from "../components/accueil/FeuilleCalendrier";
import {
  AUCUN_JOUR_CONNU,
  ajouterCalendrier,
  aujourdhuiLocal,
  chiffreReunions,
  chiffreVotes,
  demandeAccueil,
  type FiltresAccueil,
  jourChoisi,
  libelleFiltres,
  orphelins,
  relatif,
  SANS_FILTRE,
  titreJour,
} from "../components/accueil/jours";
import { Signaler } from "../components/commun/Signaler";
import { Chargement, Colonnes, Ecran, Erreur } from "../components/Ecran";
import { LigneScrutin } from "../components/LigneScrutin";
import { Apparition, Appui } from "../components/mouvement";
import { useCommand, useCore } from "../hooks/core";
import { useLarge } from "../hooks/miseEnPage";
import { useSuivis } from "../hooks/reglages";
import { usePalette, useStyles } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";

/** « Suivis » (et leur nombre) en haut de l'Actualité : le seul accès en portrait, l'en-tête large en a un aussi. */
function BoutonSuivis() {
  const p = usePalette();
  const s = useStyles();
  const aller = useAller();
  const { dossiers, personnes } = useSuivis();
  const n = dossiers.length + personnes.length;
  return (
    <Appui
      accessibilityRole="link"
      accessibilityLabel={n ? `Mes suivis : ${n}` : "Mes suivis"}
      onPress={aller.suivis}
      style={[s.boutonSecondaire, styles.suivis, { borderColor: p.lineStrong }]}
    >
      <Label ton="ink">Suivis</Label>
      {n > 0 && (
        <View style={[styles.compte, { backgroundColor: p.signal }]}>
          <T variant="caption" couleur={p.signalInk}>
            {n}
          </T>
        </View>
      )}
    </Appui>
  );
}

/** « Parcourir » : les listes, empilées au-dessus de l'Actualité. */
function Parcourir() {
  const aller = useAller();
  const entrees = [
    { cle: "faits", libelle: "Tous les faits", aller: () => aller.explorer() },
    { cle: "lois", libelle: "Lois", aller: aller.dossiers },
    {
      cle: "personnes",
      libelle: "Personnes et groupes",
      aller: () => aller.personnes(),
    },
    {
      cle: "institutions",
      libelle: "Institutions",
      aller: () => aller.institutions(),
    },
    {
      cle: "territoires",
      libelle: "Territoires",
      aller: () => aller.onglet("Carte"),
    },
  ];
  return (
    <View style={styles.pile}>
      <TitreSection>Parcourir</TitreSection>
      <Puces label="Parcourir">
        {entrees.map((e) => (
          <Puce key={e.cle} actif={false} onPress={e.aller}>
            {e.libelle}
          </Puce>
        ))}
      </Puces>
      <Action onPress={() => aller.onglet("Chiffres")}>
        Le Parlement en chiffres →
      </Action>
    </View>
  );
}

/** Une case des chiffres du jour ; `[n]` quand le contrat ne fournit pas la valeur. */
function Chiffre({ valeur, libelle }: { valeur: string; libelle: string }) {
  const p = usePalette();
  return (
    <View
      accessible
      accessibilityLabel={`${valeur === "[n]" ? "Donnée non disponible" : valeur} ${libelle}`}
      style={[styles.chiffre, { backgroundColor: p.surfaceRaised }]}
    >
      <T variant="dataLarge" couleur={valeur === "[n]" ? p.inkMuted : p.ink}>
        {valeur}
      </T>
      <T variant="caption" ton="inkSoft">
        {libelle}
      </T>
    </View>
  );
}

/** Le contenu du jour choisi, en cascade : chiffres, décidé, avance. */
function ContenuDuJour({
  jour,
  aujourdhui,
  filtres,
}: {
  jour: JourAccueil;
  aujourdhui: string;
  /** « Sénat · Mes suivis » quand un filtre est choisi. */
  filtres: string | null;
}) {
  const p = usePalette();
  const aller = useAller();
  const decides = orphelins(jour.decides);
  const avancent = orphelins(jour.avancent);
  const votes = chiffreVotes(jour.votes);
  const reunions = chiffreReunions(jour.reunions);
  const votesDe = (id: string) =>
    jour.votes.filter((v) => v.dossier?.id === id);
  const avenir = jour.date > aujourdhui;
  let rang = 0;
  const carte = (d: (typeof decides)[number], decide: boolean) => (
    <Apparition key={d.id} rang={rang++}>
      <CarteDossierJour
        dossier={d}
        jour={jour.date}
        aujourdhui={aujourdhui}
        votes={votesDe(d.id)}
        decide={decide}
        onOuvrir={() => aller.dossier(d.id)}
      />
    </Apparition>
  );
  return (
    <View style={styles.pile}>
      <Apparition rang={rang++} style={styles.chiffres}>
        <Chiffre valeur={votes.valeur} libelle={votes.libelle} />
        <Chiffre
          valeur={String(decides.length + avancent.length)}
          libelle={
            decides.length + avancent.length > 1
              ? "textes en mouvement"
              : "texte en mouvement"
          }
        />
        <Chiffre valeur={reunions.valeur} libelle={reunions.libelle} />
      </Apparition>
      {reunions.detail && (
        <T variant="caption" ton="inkMuted">
          {`Réunions de commission et séances publiques · ${reunions.detail}`}
        </T>
      )}
      {decides.length > 0 && (
        <Apparition rang={rang++}>
          <TitreSection>Ce qui a été décidé</TitreSection>
        </Apparition>
      )}
      {decides.map((d) => carte(d, true))}
      {avancent.length > 0 && (
        <Apparition rang={rang++}>
          <TitreSection>
            {avenir ? "Ce qui est inscrit" : "Ce qui avance"}
          </TitreSection>
        </Apparition>
      )}
      {avancent.map((d) => carte(d, false))}
      {!decides.length && !avancent.length && (
        <Apparition
          rang={rang++}
          style={[styles.vide, { borderColor: p.lineStrong }]}
        >
          <T variant="heading">{titreJour(jour.date)}</T>
          <T ton="inkSoft">
            {avenir
              ? "Aucun acte de dossier inscrit ce jour-là pour l’instant."
              : "Aucun acte de dossier publié ce jour-là. Les jours marqués d’un point en ont au moins un."}
            {filtres ? ` Filtre : ${filtres}.` : ""}
          </T>
        </Apparition>
      )}
    </View>
  );
}

export function Accueil() {
  const p = usePalette();
  const large = useLarge();
  const { source } = useCore();
  // null : aujourd'hui (le jour de référence du service, demandé sans `jour`).
  const [demande, setDemande] = useState<string | null>(null);
  const [calendrier, setCalendrier] = useState(false);
  // Filtres du calendrier : Assemblée, Sénat, Mes suivis (identifiants gardés dans les réglages).
  const [filtres, setFiltres] = useState<FiltresAccueil>(SANS_FILTRE);
  const suivis = useSuivis().dossiers.map((d) => d.id);
  const entree = demandeAccueil(demande, filtres, suivis);
  const accueil = useCommand(ConsulterAccueil(entree));
  const a = accueil.statut === "erreur" ? undefined : accueil.donnees;
  const filtre = libelleFiltres(filtres);

  // Jours qui ont un élément : chaque réponse apporte sa fenêtre (gardée d'un jour à l'autre) pour
  // les filtres en cours. D'autres filtres : d'autres points, tout est oublié, et la réponse des
  // anciens filtres (encore là pendant ce rendu) n'est pas reprise.
  const cleFiltres = JSON.stringify({ ...entree, jour: undefined });
  const [vus, setVus] = useState({ cle: cleFiltres, connus: AUCUN_JOUR_CONNU });
  if (vus.cle !== cleFiltres) {
    setVus({ cle: cleFiltres, connus: AUCUN_JOUR_CONNU });
  } else if (accueil.statut === "pret") {
    const avec = ajouterCalendrier(vus.connus, a);
    if (avec !== vus.connus) setVus({ cle: cleFiltres, connus: avec });
  }
  const connus = vus.cle === cleFiltres ? vus.connus : AUCUN_JOUR_CONNU;

  // Aujourd'hui : celui du service (fixe en maquette), celui de l'appareil faute de mieux.
  const [aujourdhuiVu, setAujourdhuiVu] = useState<string | null>(null);
  const reference =
    a?.calendrier?.aujourdhui ?? (!demande ? a?.jour?.date : undefined);
  if (reference && reference !== aujourdhuiVu) setAujourdhuiVu(reference);
  const aujourdhui = aujourdhuiVu ?? aujourdhuiLocal();
  const affiche = demande ?? aujourdhui;
  const choisir = (jour: string) =>
    setDemande(jour === aujourdhui ? null : jour);

  const entete = (
    <View style={styles.titreLigne}>
      <View style={styles.titre}>
        <T variant="label" ton="inkMuted">
          {relatif(affiche, aujourdhui)}
        </T>
        <T
          variant={large ? "screenLarge" : "screen"}
          accessibilityRole="header"
        >
          {titreJour(affiche)}
        </T>
      </View>
      <View style={styles.boutons}>
        {affiche !== aujourdhui && (
          <Appui
            accessibilityRole="button"
            accessibilityLabel="Revenir à aujourd’hui"
            onPress={() => setDemande(null)}
            style={[styles.bouton, { borderColor: p.lineStrong }]}
          >
            <Label ton="ink">Aujourd’hui</Label>
          </Appui>
        )}
        <BoutonSuivis />
      </View>
    </View>
  );

  if (!a && accueil.statut === "chargement") {
    return (
      <Ecran titre="Actualité">
        <Chargement />
      </Ecran>
    );
  }
  if (accueil.statut === "erreur" || !a) {
    return (
      <Ecran titre="Actualité">
        {entete}
        {accueil.statut === "erreur" ? (
          <Erreur
            message={accueil.message}
            detail={accueil.detail}
            onReessayer={accueil.recharger}
          />
        ) : (
          <Chargement />
        )}
      </Ecran>
    );
  }

  const jour = jourChoisi(a, affiche);
  const corps = jour ? (
    <ContenuDuJour
      key={`${jour.date}|${cleFiltres}`}
      jour={jour}
      aujourdhui={aujourdhui}
      filtres={filtre}
    />
  ) : accueil.statut === "chargement" ? (
    <Chargement />
  ) : (
    // La réponse porte sur un autre jour (source qui ne sait pas servir ce jour-là).
    <View style={[styles.vide, { borderColor: p.lineStrong }]}>
      <T variant="heading">{titreJour(affiche)}</T>
      <T ton="inkSoft">Ce jour n’est pas disponible dans la source actuelle.</T>
    </View>
  );

  return (
    <Ecran titre="Actualité">
      {entete}
      <BandeJours
        choisi={affiche}
        aujourdhui={aujourdhui}
        connus={connus}
        onChoisir={choisir}
        onCalendrier={() => setCalendrier(true)}
      />
      {filtre && (
        <View style={styles.filtres}>
          <T variant="small" ton="inkSoft" style={styles.filtresTexte}>
            {`Filtre : ${filtre}`}
          </T>
          <Action
            accessibilityLabel="Retirer les filtres"
            onPress={() => setFiltres(SANS_FILTRE)}
          >
            Retirer les filtres
          </Action>
        </View>
      )}
      <Colonnes
        principale={corps}
        laterale={
          <>
            <View>
              <TitreSection>Votes du jour</TitreSection>
              {jour?.votes.length ? (
                jour.votes.map((s) => <LigneScrutin key={s.id} scrutin={s} />)
              ) : (
                <T ton="inkMuted" style={styles.aucun}>
                  {jour
                    ? "Aucun scrutin public ce jour-là, ni à l’Assemblée ni au Sénat."
                    : "Votes du jour non disponibles."}
                </T>
              )}
            </View>
            <Parcourir />
            <T variant="caption" ton="inkMuted">
              {source === "fixtures"
                ? "Données fictives de maquette."
                : "Sources : Assemblée nationale, Sénat, Légifrance, Conseil constitutionnel, HATVP. Chaque fiche cite les siennes."}
            </T>
            <Signaler cible={{ type: "autre", id: null }} ecran="Accueil" />
          </>
        }
      />
      <FeuilleCalendrier
        visible={calendrier}
        choisi={affiche}
        aujourdhui={aujourdhui}
        connus={connus}
        filtres={filtres}
        suivis={suivis.length}
        onFiltrer={setFiltres}
        onFermer={() => setCalendrier(false)}
        onVoir={(j) => {
          setCalendrier(false);
          choisir(j);
        }}
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titreLigne: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: space[2],
  },
  titre: { gap: space[1], flexShrink: 1, minWidth: 0 },
  boutons: { flexDirection: "row", alignItems: "center", gap: 6 },
  bouton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  suivis: { flexDirection: "row", gap: space[2], paddingHorizontal: 14 },
  compte: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  pile: { gap: space[3] },
  chiffres: { flexDirection: "row", gap: space[2] },
  chiffre: {
    flex: 1,
    minWidth: 0,
    gap: space[1],
    padding: space[3],
    borderRadius: radius.lg,
  },
  vide: {
    gap: space[2],
    paddingVertical: 18,
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  aucun: { paddingVertical: space[3] },
  filtres: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
  filtresTexte: { flexShrink: 1 },
});
