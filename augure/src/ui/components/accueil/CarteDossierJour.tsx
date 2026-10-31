// Carte d'un dossier dans l'Actualité (planche « CarteDossier ») : type et dépositaire, titre,
// résumé très bref de l'étape du jour, quatre nœuds au plus (le parcours regroupé par lieu,
// icône du lieu dans le cercle d'état, halo sur l'étape en cours), les déviations (49.3, motion,
// retrait…) en étiquettes, « depuis le JJ/MM (n jours) » (décision du jour, début de l'étape en cours),
// le vote clé quand un scrutin conclut seul l'étape ce jour-là (jamais un amendement), les autres
// votes du jour sur ce texte, et le rendez-vous suivant publié. Seuls les dossiers orphelins ont une
// carte (l'écran les filtre).

import { Fragment } from "react";
import { StyleSheet, View } from "react-native";

import type { DossierResume, ScrutinResume } from "@/core";
import { capitale, nombre, titreOfficielDistinct } from "../../format";
import { natureDossier } from "../../libelles";
import { usePalette, useStyles } from "../../theme/ThemeProvider";
import { fonts, radius, space, type Palette } from "../../theme/tokens";
import { IconeDeviation, T } from "../base";
import { Icone } from "../Icone";
import { Appui, Halo } from "../mouvement";
import {
  type Noeud,
  autresVotes,
  depuis,
  descriptionNoeuds,
  etiquettesDeviations,
  noeudsCarte,
  quandRendezVous,
  resumeCarte,
  voteCle,
} from "./jours";

const CERCLE = 26;

function styleNoeud(p: Palette, n: Noeud) {
  switch (n.etat) {
    case "faite":
      return {
        cercle: {
          borderStyle: "solid" as const,
          borderColor: p.lineStrong,
          backgroundColor: p.surfaceSoft,
        },
        icone: p.ink,
        texte: p.inkSoft,
      };
    case "courante":
      return {
        cercle: {
          borderStyle: "solid" as const,
          borderColor: p.signal,
          backgroundColor: p.surface,
        },
        icone: p.ink,
        texte: p.ink,
      };
    case "arrete":
      return {
        cercle: {
          borderStyle: "solid" as const,
          borderColor: p.signal,
          borderWidth: 2,
          backgroundColor: p.surface,
        },
        icone: p.ink,
        texte: p.ink,
      };
    case "attendue":
      return {
        cercle: { borderStyle: "solid" as const, borderColor: p.inkSoft },
        icone: p.inkSoft,
        texte: p.inkSoft,
      };
    case "n_aura_pas_lieu":
      return {
        cercle: {
          borderStyle: "dashed" as const,
          borderColor: p.lineStrong,
          opacity: 0.4,
        },
        icone: p.inkMuted,
        texte: p.lineStrong,
      };
    default:
      return {
        cercle: { borderStyle: "dashed" as const, borderColor: p.lineStrong },
        icone: p.inkMuted,
        texte: p.inkMuted,
      };
  }
}

/** Les nœuds compacts de la carte (4 au plus), décrits en entier pour les lecteurs d'écran. */
export function NoeudsCarte({ dossier }: { dossier: DossierResume }) {
  const p = usePalette();
  const { noeuds, avant, apres } = noeudsCarte(dossier.barre, dossier.etat);
  if (!noeuds.length) return null;
  const description = `${descriptionNoeuds(noeuds)}${avant ? ` ; ${avant} avant` : ""}${apres ? ` ; ${apres} ensuite` : ""}`;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={description}
      style={styles.noeuds}
    >
      {noeuds.map((n, i) => {
        const st = styleNoeud(p, n);
        const suivant = noeuds[i + 1];
        const trait = !suivant
          ? null
          : suivant.etat === "n_aura_pas_lieu"
            ? {
                borderTopWidth: 1,
                borderStyle: "dashed" as const,
                borderColor: p.lineFaint,
                height: 0,
              }
            : ["faite", "courante", "arrete"].includes(suivant.etat)
              ? { backgroundColor: p.inkSoft }
              : { backgroundColor: p.lineFaint };
        return (
          <Fragment key={n.cle}>
            <View style={styles.noeud}>
              <View style={styles.cercleZone}>
                {n.etat === "courante" && (
                  <Halo couleur={p.signal} taille={CERCLE} />
                )}
                <View style={[styles.cercle, st.cercle]}>
                  <Icone nom={n.icone} couleur={st.icone} taille={14} />
                </View>
              </View>
              <T
                variant="caption"
                couleur={st.texte}
                numberOfLines={2}
                style={[
                  styles.libelle,
                  n.etat === "courante" && styles.gras,
                  n.etat === "n_aura_pas_lieu" && styles.barre,
                ]}
              >
                {n.libelle}
              </T>
              {n.issue && (
                <View style={[styles.issue, { backgroundColor: p.signalSoft }]}>
                  <T
                    variant="caption"
                    couleur={p.signal}
                    style={styles.issueTexte}
                  >
                    {n.issue}
                  </T>
                </View>
              )}
              {n.deviation && <IconeDeviation couleur={st.icone} taille={10} />}
            </View>
            {trait && <View style={[styles.trait, trait]} />}
          </Fragment>
        );
      })}
    </View>
  );
}

/** Vote clé : sort publié, barre pour / contre / abstention, décompte. */
function VoteCle({
  scrutin,
  objet,
}: {
  scrutin: ScrutinResume;
  objet: string;
}) {
  const p = usePalette();
  const { pour, contre, abstention } = scrutin.decompte;
  const total = pour + contre + abstention;
  return (
    <View
      accessible
      accessibilityLabel={`Vote clé, ${objet} : ${scrutin.sort ?? "sort non publié"}, ${pour} pour, ${contre} contre, ${abstention} abstentions`}
      style={[styles.vote, { borderColor: p.line }]}
    >
      <View style={styles.voteEntete}>
        <T variant="caption" ton="inkMuted">{`Vote clé · ${objet}`}</T>
        <T variant="caption" style={styles.gras}>
          {scrutin.sort ? capitale(scrutin.sort) : "Sort non publié"}
        </T>
      </View>
      {total > 0 && (
        <View style={styles.jauge}>
          {pour > 0 && (
            <View style={{ flex: pour, backgroundColor: p.votePour }} />
          )}
          {contre > 0 && (
            <View style={{ flex: contre, backgroundColor: p.voteContre }} />
          )}
          {abstention > 0 && (
            <View
              style={{ flex: abstention, backgroundColor: p.voteAbstention }}
            />
          )}
        </View>
      )}
      <T variant="data" ton="inkMuted">
        <T variant="data" couleur={p.votePour}>{`${nombre(pour)} pour`}</T>
        {" · "}
        <T
          variant="data"
          couleur={p.voteContre}
        >{`${nombre(contre)} contre`}</T>
        {` · ${nombre(abstention)} abst.`}
      </T>
    </View>
  );
}

export function CarteDossierJour({
  dossier: d,
  jour,
  aujourdhui,
  votes,
  decide,
  onOuvrir,
}: {
  dossier: DossierResume;
  jour: string;
  aujourdhui: string;
  /** Scrutins du jour sur ce dossier. */
  votes: ScrutinResume[];
  /** Une étape conclue ce jour-là (« Ce qui a été décidé »), sinon « Ce qui avance ». */
  decide: boolean;
  onOuvrir(): void;
}) {
  const p = usePalette();
  const s = useStyles();
  const titre = d.titreEnClair ?? d.titre;
  const officiel = titreOfficielDistinct(titre, d.titreOfficiel);
  const cle = voteCle(votes);
  const resume = resumeCarte(d, jour, cle?.scrutin ?? null);
  const autres = autresVotes(votes, cle?.scrutin ?? null);
  const quand = depuis(jour, aujourdhui, decide, d.barre);
  const etiquettes = etiquettesDeviations(d);
  const e = d.prochaineEcheance;
  return (
    <Appui
      accessibilityRole="link"
      accessibilityLabel={`${titre}. ${resume.texte}${resume.procedure ? `, ${resume.procedure}` : ""}.`}
      onPress={onOuvrir}
      style={[s.carte, styles.carte]}
    >
      <T variant="meta" ton="inkMuted">
        {natureDossier(d) || "Type non publié"}
      </T>
      <View style={styles.titres}>
        <T variant="card">{titre}</T>
        {officiel && (
          <T variant="small" ton="inkMuted">
            {officiel}
          </T>
        )}
      </View>
      <T variant="small" style={styles.resume}>
        {resume.texte}
        {resume.procedure && (
          <T variant="small" ton="inkMuted">{` · ${resume.procedure}`}</T>
        )}
      </T>
      <NoeudsCarte dossier={d} />
      {etiquettes.length > 0 && (
        <View style={styles.etiquettes}>
          {etiquettes.map((e) => (
            <View
              key={e.cle}
              accessible
              accessibilityLabel={`Déviation, ${e.description}`}
              style={[styles.etiquette, { borderColor: p.lineStrong }]}
            >
              <IconeDeviation couleur={p.inkSoft} taille={10} />
              <T variant="caption" ton="inkSoft">
                {e.libelle}
              </T>
            </View>
          ))}
        </View>
      )}
      {quand && (
        <T variant="data" ton="inkMuted">
          {quand}
        </T>
      )}
      {decide && cle && <VoteCle scrutin={cle.scrutin} objet={cle.objet} />}
      {autres.map((a) => (
        <T key={a} variant="small" ton="inkSoft">
          {a}
        </T>
      ))}
      <View style={[styles.suite, { borderColor: p.line }]}>
        <T variant="data" style={styles.gras}>
          {e ? quandRendezVous(e.date, e.heure) : "Suite"}
        </T>
        <T
          variant="small"
          couleur={e ? p.inkQuote : p.inkMuted}
          style={styles.suiteTexte}
        >
          {e ? e.libelle : "Aucun rendez-vous publié"}
          {e?.etat && (
            <T variant="small" ton="inkMuted">{` · ${e.etat.toLowerCase()}`}</T>
          )}
        </T>
      </View>
    </Appui>
  );
}

const styles = StyleSheet.create({
  carte: { gap: 10, padding: space[4] },
  titres: { gap: 2 },
  resume: { fontSize: 15 },
  noeuds: { flexDirection: "row", alignItems: "flex-start" },
  etiquettes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  etiquette: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: radius.full,
  },
  noeud: { width: 66, flexShrink: 1, alignItems: "center", gap: 4 },
  cercleZone: {
    width: CERCLE,
    height: CERCLE,
    alignItems: "center",
    justifyContent: "center",
  },
  cercle: {
    width: CERCLE,
    height: CERCLE,
    borderRadius: CERCLE / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  libelle: { textAlign: "center", fontSize: 12, lineHeight: 15 },
  gras: { fontFamily: fonts.sansSemiBold },
  barre: { textDecorationLine: "line-through" },
  issue: { paddingHorizontal: 4, borderRadius: 2 },
  issueTexte: { fontSize: 11, lineHeight: 15, fontFamily: fonts.sansSemiBold },
  trait: { flex: 1, minWidth: 4, height: 2, marginTop: CERCLE / 2 - 1 },
  vote: {
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  voteEntete: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space[2],
  },
  jauge: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    gap: 2,
  },
  suite: {
    flexDirection: "row",
    gap: space[2],
    paddingTop: 9,
    borderTopWidth: 1,
  },
  suiteTexte: { flex: 1 },
});
