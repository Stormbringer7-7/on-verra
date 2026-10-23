import { useRoute, type RouteProp } from '@react-navigation/native';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ConsulterScrutin, type FicheScrutin } from '@/core';
import { partMajoritaire, verdict } from '@/core/domain/votes';
import { useAller, type Pages } from '@/navigation';
import { Action, Label, Panneau, Pastille, Repartition, T } from '@/ui/components/base';
import { Chargement, Ecran, Erreur, Retour, Source } from '@/ui/components/Ecran';
import { date, nomComplet, pluriel } from '@/ui/format';
import { useCommand } from '@/ui/hooks/core';
import { estFinal, libelleScrutin, NATURES } from '@/ui/natures';
import { LIBELLE_VOTE, couleurVote, usePalette } from '@/ui/theme/ThemeProvider';
import { fonts, radius, space } from '@/ui/theme/tokens';


export function Scrutin() {
  const { uid, depute } = useRoute<RouteProp<Pages, 'Scrutin'>>().params;
  const fiche = useCommand(ConsulterScrutin(depute ? { uid, depute } : { uid }));

  return (
    <Ecran section="scrutins">
      <Retour />
      {fiche.statut === 'erreur' ? (
        <Erreur message={fiche.message} onReessayer={fiche.recharger} />
      ) : fiche.statut === 'chargement' ? (
        <Chargement />
      ) : (
        <Contenu fiche={fiche.donnees} />
      )}
      <Source precision="absent : en fonction ce jour-là, sans vote enregistré (absent ou présent sans voter)" />
    </Ecran>
  );
}

function Contenu({ fiche }: { fiche: FicheScrutin }) {
  const p = usePalette();
  const aller = useAller();
  const { scrutin: s, enClair } = fiche;
  const total = s.decompte.pour + s.decompte.contre + s.decompte.abstention + fiche.absents;

  return (
    <>
      <View style={{ gap: space[2] }}>
        <Label>
          {[NATURES[s.nature].libelle, s.niveau === 'majeure' ? 'TEXTE MAJEUR' : null, date(s.date), `SCRUTIN N° ${s.numero}`]
            .filter(Boolean)
            .join(' · ')}
        </Label>
        <T variant="title" style={estFinal(s) ? styles.titre : undefined}>
          {libelleScrutin(s)}
        </T>
        {!estFinal(s) && s.loiId && <T ton="inkMuted">{`Texte : ${s.titre}`}</T>}
      </View>

      <Panneau>
        <Label>EN CLAIR</Label>
        {enClair ? (
          <T variant="lead">{enClair.resume}</T>
        ) : (
          <T variant="lead" ton="inkMuted">
            Pas encore de résumé en clair pour ce texte.
          </T>
        )}
        <View style={{ gap: 6 }}>
          <T>
            <Label couleur={p.votePour}>+ POUR</Label> = {enClair?.pour ?? `adopter ${NATURES[s.nature].objet}`}
          </T>
          <T>
            <Label couleur={p.voteContre}>− CONTRE</Label> = {enClair?.contre ?? `ne pas adopter ${NATURES[s.nature].objet}`}
          </T>
        </View>
        <T variant="caption" ton="inkMuted">
          {`Intitulé officiel${s.lecture ? ` (${s.lecture})` : ''} : ${s.intitule}`}
        </T>
        <Action onPress={() => Linking.openURL(fiche.lienOfficiel)} accessibilityLabel="Lire le scrutin officiel sur le site de l'Assemblée">
          LIRE LE SCRUTIN OFFICIEL ↗
        </Action>
      </Panneau>

      <View style={{ gap: space[2] }}>
        <View style={styles.entre}>
          <T variant="title" style={{ fontFamily: fonts.sansBold }}>
            {verdict(s.sort, s.decompte)}
          </T>
          <T variant="data">{`${s.decompte.pour} pour · ${s.decompte.contre} contre`}</T>
        </View>
        <Repartition decompte={s.decompte} total={total} hauteur={10} />
        <T variant="caption" ton="inkMuted">
          {`${pluriel(s.decompte.abstention, 'abstention')} · ${pluriel(fiche.absents, 'absent')}${fiche.nonVotants ? ` · ${pluriel(fiche.nonVotants, 'non-votant')} (présidence, gouvernement)` : ''}`}
        </T>
      </View>

      <View style={{ gap: space[1] }}>
        <T variant="heading" style={{ marginBottom: space[2] }}>
          Qui a voté quoi
        </T>
        {fiche.groupes.map((g) => {
          const exprimes = g.decompte.pour + g.decompte.contre + g.decompte.abstention;
          return (
            <Pressable
              key={g.groupe.ref}
              accessibilityRole="link"
              onPress={() => aller.groupe(g.groupe.ref, s.legislature)}
              style={[styles.groupe, { borderBottomColor: p.line }]}
            >
              <View style={styles.ligneGroupe}>
                <Pastille couleur={g.groupe.couleur ?? p.inkMuted} />
                <T style={{ flex: 1 }} numberOfLines={1}>
                  {g.groupe.libelle}
                </T>
                {g.ligne ? (
                  <Label couleur={couleurVote(p, g.ligne)}>
                    {`${LIBELLE_VOTE[g.ligne]} ${Math.round(partMajoritaire(g.decompte) * 100)} %`}
                  </Label>
                ) : (
                  <Label>{exprimes ? 'PARTAGÉ' : 'AUCUN VOTE'}</Label>
                )}
              </View>
              <Repartition decompte={g.decompte} total={g.membres} />
            </Pressable>
          );
        })}
      </View>

      {fiche.depute && (
        <Pressable
          accessibilityRole="link"
          onPress={() => aller.depute(fiche.depute!.acteur, s.legislature)}
          style={[styles.depute, { borderColor: p.lineStrong }]}
        >
          <Label>DÉPUTÉ CONSULTÉ</Label>
          <T>
            {`${nomComplet(fiche.depute)} : `}
            <T couleur={couleurVote(p, fiche.depute.position)}>{LIBELLE_VOTE[fiche.depute.position].slice(2).toLowerCase()}</T>
            {fiche.depute.ecart && <T ton="signal"> · écart avec son groupe</T>}
          </T>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 28, lineHeight: 32, fontFamily: fonts.sansBold },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  groupe: { gap: 6, paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  ligneGroupe: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  depute: { gap: space[1], paddingVertical: space[3], paddingHorizontal: space[4], borderWidth: 1, borderRadius: radius.sm },
});
