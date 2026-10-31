// Feuille « Choisir un jour » de l'Actualité (planche « Calendrier ») : elle monte du bas (320 ms,
// `Montee`), l'année (‹ 2026 ›), les douze mois, la grille du mois (lundi d'abord), un point sous
// chaque jour qui a au moins un élément publié, aujourd'hui souligné ; « Voir ce jour » ferme la
// feuille sur le jour choisi. Les points ne sont connus que dans les fenêtres déjà reçues du
// service : la feuille le dit. Filtres de la planche : Assemblée, Sénat, Mes suivis (les dossiers
// suivis des réglages) ; ils s'appliquent tout de suite aux points et au contenu du jour.

import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { date } from "../../format";
import { useAnimationsReduites } from "../../hooks/reglages";
import { usePalette, useStyles } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Puce, T } from "../base";
import { Appui, Montee } from "../mouvement";
import {
  type FiltresAccueil,
  type JoursConnus,
  JOURS_COURTS,
  MOIS_COURTS,
  grilleMois,
  jourLong,
  libelleFiltres,
  nomMois,
  pointDuJour,
} from "./jours";

/** Chevron ‹ ou › (tracé de la planche, sans caractère). */
function Chevron({
  sens,
  couleur,
}: {
  sens: "gauche" | "droite";
  couleur: string;
}) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 20 20"
      fill="none"
      stroke={couleur}
      strokeWidth={1.8}
      aria-hidden
    >
      <Path
        d={
          sens === "gauche"
            ? "M12.5 4.5 7 10l5.5 5.5"
            : "M7.5 4.5 13 10l-5.5 5.5"
        }
      />
    </Svg>
  );
}

export function FeuilleCalendrier({
  visible,
  ...props
}: {
  visible: boolean;
  choisi: string;
  aujourdhui: string;
  connus: JoursConnus;
  filtres: FiltresAccueil;
  /** Nombre de dossiers suivis (réglages). */
  suivis: number;
  onFiltrer(filtres: FiltresAccueil): void;
  onVoir(jour: string): void;
  onFermer(): void;
}) {
  if (!visible) return null;
  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={props.onFermer}
    >
      <Contenu {...props} />
    </Modal>
  );
}

/** Assemblée, Sénat, Mes suivis : chaque puce se coche et se décoche. */
function Filtres({
  filtres,
  suivis,
  onFiltrer,
}: {
  filtres: FiltresAccueil;
  suivis: number;
  onFiltrer(filtres: FiltresAccueil): void;
}) {
  const chambre = (c: "AN" | "SENAT") => ({
    actif: filtres.chambres.includes(c),
    onPress: () =>
      onFiltrer({
        ...filtres,
        chambres: filtres.chambres.includes(c)
          ? filtres.chambres.filter((x) => x !== c)
          : [...filtres.chambres, c],
      }),
  });
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Filtrer les jours"
      style={styles.filtres}
    >
      <Puce variante="contour" {...chambre("AN")}>
        Assemblée
      </Puce>
      <Puce variante="contour" {...chambre("SENAT")}>
        Sénat
      </Puce>
      <Puce
        variante="contour"
        actif={filtres.suivis}
        accessibilityLabel={
          suivis
            ? `Mes suivis : ${suivis} ${suivis > 1 ? "dossiers" : "dossier"}`
            : "Mes suivis : aucun dossier suivi"
        }
        onPress={() => onFiltrer({ ...filtres, suivis: !filtres.suivis })}
      >
        Mes suivis
      </Puce>
    </View>
  );
}

function Contenu({
  choisi,
  aujourdhui,
  connus,
  filtres,
  suivis,
  onFiltrer,
  onVoir,
  onFermer,
}: Omit<Parameters<typeof FeuilleCalendrier>[0], "visible">) {
  const p = usePalette();
  const s = useStyles();
  const reduites = useAnimationsReduites();
  const [annee, setAnnee] = useState(Number(choisi.slice(0, 4)));
  const [mois, setMois] = useState(Number(choisi.slice(5, 7)) - 1);
  const [jour, setJour] = useState<string | null>(choisi);
  const cases = grilleMois(annee, mois);
  const enCours =
    jour && jour.startsWith(`${annee}-${String(mois + 1).padStart(2, "0")}`)
      ? jour
      : null;
  const fenetres = connus.fenetres.map((f) => f.debut).sort();
  const fins = connus.fenetres.map((f) => f.fin).sort();
  const filtre = libelleFiltres(filtres);

  const changerAnnee = (n: number) => {
    setAnnee(annee + n);
    setJour(null);
  };
  const ligne = (debut: number) => cases.slice(debut, debut + 7);

  return (
    <View style={styles.racine}>
      <Pressable
        accessibilityLabel="Fermer le calendrier"
        onPress={onFermer}
        style={s.voile}
      />
      <Montee style={styles.bas}>
        <View
          accessibilityViewIsModal
          accessibilityLabel="Choisir un jour"
          style={[
            s.feuille,
            styles.feuille,
            { backgroundColor: p.surfaceRaised },
          ]}
        >
          <View style={s.poignee} />

          <View style={s.entre}>
            <Appui
              accessibilityRole="button"
              accessibilityLabel="Année précédente"
              onPress={() => changerAnnee(-1)}
              style={s.boutonIcone}
            >
              <Chevron sens="gauche" couleur={p.ink} />
            </Appui>
            <T variant="dataLarge" accessibilityRole="header">
              {annee}
            </T>
            <Appui
              accessibilityRole="button"
              accessibilityLabel="Année suivante"
              onPress={() => changerAnnee(1)}
              style={s.boutonIcone}
            >
              <Chevron sens="droite" couleur={p.ink} />
            </Appui>
          </View>

          <Filtres filtres={filtres} suivis={suivis} onFiltrer={onFiltrer} />
          {filtres.suivis && !suivis && (
            <T variant="caption" ton="inkMuted">
              Aucun dossier suivi : suivez un texte depuis sa fiche pour voir ses jours ici.
            </T>
          )}

          <View style={styles.mois}>
            {MOIS_COURTS.map((m, i) => {
              const sel = i === mois;
              return (
                <Appui
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  aria-selected={sel}
                  accessibilityLabel={`${nomMois(i)} ${annee}`}
                  onPress={() => {
                    setMois(i);
                    setJour(null);
                  }}
                  style={[
                    styles.unMois,
                    {
                      borderColor: sel ? p.ink : p.lineFaint,
                      backgroundColor: sel ? p.ink : "transparent",
                    },
                  ]}
                >
                  <T variant="label" couleur={sel ? p.surface : p.inkSoft}>
                    {m}
                  </T>
                </Appui>
              );
            })}
          </View>

          <View style={styles.grille}>
            <View style={s.entre}>
              <T variant="heading">{`${nomMois(mois).charAt(0).toUpperCase()}${nomMois(mois).slice(1)} ${annee}`}</T>
              <T variant="caption" ton="inkMuted">
                {enCours
                  ? `Choisi : ${Number(enCours.slice(8, 10))} ${nomMois(mois)}`
                  : "Aucun jour choisi"}
              </T>
            </View>
            <View style={styles.semaine}>
              {JOURS_COURTS.map((j) => (
                <T
                  key={j}
                  variant="caption"
                  ton="inkMuted"
                  style={styles.cellule}
                >
                  {j}
                </T>
              ))}
            </View>
            {Array.from({ length: Math.ceil(cases.length / 7) }, (_, l) => (
              <View key={l} style={styles.semaine}>
                {ligne(l * 7).map((c, i) => {
                  if (!c) return <View key={`v${i}`} style={styles.cellule} />;
                  const sel = c === enCours;
                  const auj = c === aujourdhui;
                  const point = pointDuJour(connus, c);
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      aria-selected={sel}
                      accessibilityLabel={`${jourLong(c)}${point === "oui" ? ", au moins un élément" : ""}${auj ? ", aujourd’hui" : ""}`}
                      onPress={() => setJour(c)}
                      style={({ pressed }) => [
                        styles.cellule,
                        styles.jour,
                        sel && { backgroundColor: p.surfaceSoft },
                        pressed &&
                          !reduites && { transform: [{ scale: 0.95 }] },
                      ]}
                    >
                      <T
                        variant="data"
                        couleur={sel ? p.signal : auj ? p.ink : p.inkSoft}
                        style={auj && styles.souligne}
                      >
                        {Number(c.slice(8, 10))}
                      </T>
                      <View
                        style={[
                          styles.point,
                          point === "oui" && {
                            backgroundColor: sel ? p.signal : p.lineStrong,
                          },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <T variant="caption" ton="inkMuted">
            {filtre ? `Filtre : ${filtre}. ` : ""}
            {fenetres.length
              ? `Un point : au moins un acte d’un dossier ou un scrutin public daté de ce jour-là. Points connus du ${date(fenetres[0])} au ${date(fins.at(-1)!)}.`
              : "Un point : au moins un acte d’un dossier ou un scrutin public daté de ce jour-là. Aucun point connu pour l’instant."}
          </T>

          <Appui
            accessibilityRole="button"
            accessibilityLabel={
              enCours ? `Voir le ${jourLong(enCours)}` : "Choisir un jour"
            }
            accessibilityState={{ disabled: !enCours }}
            disabled={!enCours}
            onPress={() => enCours && onVoir(enCours)}
            style={[s.bouton, !enCours && { opacity: 0.5 }]}
          >
            <T style={s.boutonTexte}>Voir ce jour</T>
          </Appui>
        </View>
      </Montee>
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, justifyContent: "flex-end" },
  bas: { width: "100%", maxWidth: 560, alignSelf: "center" },
  feuille: { gap: space[4], paddingBottom: space[6] },
  mois: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filtres: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  unMois: {
    flexBasis: "15%",
    flexGrow: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.full,
  },
  grille: { gap: 6 },
  semaine: { flexDirection: "row" },
  cellule: { flex: 1, textAlign: "center" },
  jour: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radius.md,
  },
  souligne: { textDecorationLine: "underline" },
  point: { width: 6, height: 6, borderRadius: 3 },
});
