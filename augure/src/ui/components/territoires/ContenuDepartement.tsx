// Contenu de la fiche Département : élus en fonction (pastille de groupe, participation comparée à
// leur groupe), vote de chacun sur le scrutin demandé, participation du département par chambre et
// ce que ces mesures ne disent pas.

import { StyleSheet, View } from "react-native";

import type { EluDuDepartement, FicheDepartement } from "@/core";
import { useAller } from "../../../navigation";
import {
  dateLongue,
  resultatScrutin,
  texteReference,
  titreScrutin,
  valeurIndicateur,
} from "../../format";
import {
  LIBELLES_CHAMBRE,
  LIBELLES_POSITION,
  texteVotes,
} from "../../territoires";
import { space } from "../../theme/tokens";
import { Ligne, Pastille, T, TitreEcran, TitreSection } from "../base";
import { useLarge } from "../../hooks/miseEnPage";
import { IndicateurVue } from "../commun/IndicateurVue";

function LigneElu({ elu }: { elu: EluDuDepartement }) {
  const aller = useAller();
  const { personne: p, participation: i } = elu;
  return (
    <Ligne
      onPress={() => aller.personne(p.id)}
      accessibilityLabel={[p.nom, p.fonction, p.groupe?.libelle]
        .filter(Boolean)
        .join(", ")}
    >
      <View style={styles.elu}>
        <View style={styles.nom}>
          {p.groupe && <Pastille couleur={p.groupe.couleur} />}
          <T variant="heading">{p.nom}</T>
        </View>
        <T variant="small" ton="inkSoft">
          {[p.fonction, p.groupe?.libelle].filter(Boolean).join(" · ")}
        </T>
        {i && (
          <T variant="small" ton="inkMuted">
            {`Participation ${valeurIndicateur(i.valeur, i.unite)} · ${texteReference(i)}`}
          </T>
        )}
      </View>
    </Ligne>
  );
}

function Votes({
  scrutin,
}: {
  scrutin: NonNullable<FicheDepartement["scrutin"]>;
}) {
  const aller = useAller();
  return (
    <View style={styles.bloc}>
      <TitreSection>Sur ce vote</TitreSection>
      <Ligne onPress={() => aller.scrutin(scrutin.scrutin.id)}>
        <View style={styles.elu}>
          <T variant="label" ton="inkMuted">
            {`Scrutin n° ${scrutin.scrutin.numero} · ${dateLongue(scrutin.scrutin.date)} · ${resultatScrutin(scrutin.scrutin)}`}
          </T>
          <T variant="heading">{titreScrutin(scrutin.scrutin)}</T>
          <T variant="small" ton="inkSoft">
            {`Élus du département : ${texteVotes(scrutin.votes)}`}
          </T>
        </View>
      </Ligne>
      {scrutin.elus.map((e) => (
        <Ligne
          key={e.personne.id}
          onPress={() => aller.personne(e.personne.id)}
          accessibilityLabel={`${e.personne.nom} : ${LIBELLES_POSITION[e.position]}`}
        >
          <View style={styles.nom}>
            {e.personne.groupe && (
              <Pastille couleur={e.personne.groupe.couleur} />
            )}
            <T variant="body" style={styles.flex}>
              {e.personne.nom}
            </T>
            <T variant="heading">{LIBELLES_POSITION[e.position]}</T>
          </View>
        </Ligne>
      ))}
    </View>
  );
}

export function ContenuDepartement({ fiche: f }: { fiche: FicheDepartement }) {
  const large = useLarge();
  return (
    <>
      <View style={styles.entete}>
        <TitreEcran surtitre={`Département ${f.departement.code}`}>
          {f.departement.nom}
        </TitreEcran>
        <T ton="inkSoft">
          Ses élus aujourd’hui et leur participation aux scrutins publics,
          comparée à celle de leur groupe.
        </T>
      </View>
      <View style={[styles.colonnes, large && styles.colonnesLarges]}>
        <View style={[styles.bloc, large && styles.principale]}>
          {f.scrutin && <Votes scrutin={f.scrutin} />}
          {(["AN", "SENAT"] as const).map((c) => {
            const elus = f.elus.filter((e) => e.chambre === c);
            return elus.length ? (
              <View key={c} style={styles.bloc}>
                <TitreSection>{LIBELLES_CHAMBRE[c]}</TitreSection>
                {elus.map((e) => (
                  <LigneElu key={e.personne.id} elu={e} />
                ))}
              </View>
            ) : null;
          })}
          {f.elus.length === 0 && (
            <T ton="inkSoft">
              Aucun élu en fonction rattaché à ce département dans nos données.
            </T>
          )}
        </View>
        <View style={[styles.bloc, large && styles.laterale]}>
          {f.presence.map((p) => (
            <View key={p.chambre} style={styles.bloc}>
              <TitreSection>{`${LIBELLES_CHAMBRE[p.chambre]} du département`}</TitreSection>
              <IndicateurVue indicateur={p.indicateur} />
            </View>
          ))}
          <View style={styles.limites}>
            {f.limites.map((l) => (
              <T key={l} variant="small" ton="inkSoft">
                {l}
              </T>
            ))}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  entete: { gap: space[2] },
  colonnes: { gap: space[8] },
  colonnesLarges: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[10],
  },
  principale: { flex: 3, minWidth: 0 },
  laterale: { flex: 2, minWidth: 0 },
  bloc: { gap: space[3] },
  elu: { gap: space[1] },
  nom: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flex: 1 },
  limites: { gap: space[1] },
});
