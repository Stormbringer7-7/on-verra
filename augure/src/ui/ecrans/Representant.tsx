// Fiche d'un représentant d'intérêts (canevas : artboard « Lobby ») : ce que publie le répertoire
// de la HATVP (catégorie, identifiant, inscription, dernier exercice, actions déclarées), et les
// dossiers, amendements ou articles rapprochés, chacun avec son statut (`LienStatut`) : « Vérifié ·
// l'action cite le texte » ou « À vérifier · même sujet, même période ». Une action déclarée ne
// prouve ni une rencontre, ni une influence.

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConsulterRepresentant, type CibleInteret, type FicheRepresentant, type LienInteret } from '@/core';
import { useAller, type Pages } from '@/navigation';
import { Action, BoutonSecondaire, Label, T } from '@/ui/components/base';
import { LienStatut } from '@/ui/components/commun/LienStatut';
import { Signaler } from '@/ui/components/commun/Signaler';
import { Source } from '@/ui/components/commun/Source';
import { Chargement, Ecran, Erreur, Retour } from '@/ui/components/Ecran';
import { Avertissement, Badge, Carte, Colonnes, TitreSection } from '@/ui/components/personnes/elements';
import { jour, libellePeriode, nombre, statutLien, titreCible } from '@/ui/components/personnes/regles';
import { useCommand } from '@/ui/hooks/core';
import { usePalette } from '@/ui/theme/ThemeProvider';
import { radius, space } from '@/ui/theme/tokens';

export function Representant() {
  const { id } = useRoute<RouteProp<Pages, 'Representant'>>().params;
  const [page, setPage] = useState(1);
  const fiche = useCommand(ConsulterRepresentant(page > 1 ? { id, page } : { id }));
  const donnees = fiche.statut === 'erreur' ? undefined : fiche.donnees;

  return (
    <Ecran largeur="pleine">
      <Retour />
      {fiche.statut === 'erreur' ? (
        <Erreur message={fiche.message} onReessayer={fiche.recharger} />
      ) : !donnees ? (
        <Chargement />
      ) : (
        <Contenu fiche={donnees} onSuivante={donnees.actions.suivante ? () => setPage(donnees.actions.suivante!) : null} />
      )}
      <Signaler cible={{ type: 'representant', id }} ecran="Représentant d’intérêts" />
    </Ecran>
  );
}

function Contenu({ fiche: f, onSuivante }: { fiche: FicheRepresentant; onSuivante: (() => void) | null }) {
  const p = usePalette();
  const chiffres: { libelle: string; valeur: string }[] = f.exercice
    ? [
        { libelle: `Actions ${libellePeriode(f.exercice.periode)}`, valeur: f.exercice.actions === null ? 'Non publié' : nombre(f.exercice.actions) },
        { libelle: 'Dépenses déclarées', valeur: f.exercice.depenses ?? 'Non publiées' },
        { libelle: 'Salariés déclarés', valeur: f.exercice.salaries === null ? 'Non publié' : nombre(f.exercice.salaries) },
        {
          libelle: 'Personnes déclarées',
          valeur: f.exercice.personnesDeclarees === null ? 'Non chargées' : nombre(f.exercice.personnesDeclarees),
        },
      ]
    : [];
  return (
    <>
      <View style={{ gap: 8 }}>
        <Label>{`Représentant d’intérêts${f.categorie ? ` · ${f.categorie}` : ''}`}</Label>
        <T variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34 }}>
          {f.denomination}
        </T>
        {f.nomUsage && <T ton="inkMuted">{f.nomUsage}</T>}
        <View style={styles.badges}>
          <Badge>{`Répertoire HATVP${f.inscritDepuis ? ` · inscrit depuis le ${jour(f.inscritDepuis)}` : ''}`}</Badge>
          {f.identifiant && <Badge>{`${f.identifiant.type} ${f.identifiant.valeur}`}</Badge>}
        </View>
        {f.secteurs.length > 0 && (
          <T variant="caption" ton="inkMuted">
            {`Secteurs déclarés : ${f.secteurs.join(', ')}`}
          </T>
        )}
        <Source provenance={f.provenance} />
      </View>
      <Avertissement signe="⚠">
        Une action de représentation d’intérêts déclarée ne prouve ni une rencontre avec un élu, ni une modification de la loi causée par
        cette action.
      </Avertissement>
      <Colonnes
        principal={
          <>
            {chiffres.length > 0 && (
              <View style={styles.chiffres}>
                {chiffres.map((c) => (
                  <View key={c.libelle} style={[styles.chiffre, { borderColor: p.line }]}>
                    <Label>{c.libelle}</Label>
                    <T variant="dataLarge" style={{ fontSize: 20, lineHeight: 28 }}>
                      {c.valeur}
                    </T>
                  </View>
                ))}
              </View>
            )}
            <View>
              <TitreSection>{`Actions déclarées${f.actions.total !== null ? ` (${nombre(f.actions.total)})` : ''}`}</TitreSection>
              {f.actions.elements.map((a) => (
                <View key={a.id} style={[styles.action, { borderBottomColor: p.line }]}>
                  <Label>{[libellePeriode(a.periode), a.actions.join(', ')].filter(Boolean).join(' · ')}</Label>
                  <T variant="heading">{a.objet}</T>
                  {a.responsables.length > 0 && (
                    <T variant="caption" ton="inkMuted">
                      {`Responsables publics visés : ${a.responsables.map((r) => r.toLowerCase()).join(', ')}`}
                    </T>
                  )}
                  {a.decisions.length > 0 && (
                    <T variant="caption" ton="inkMuted">
                      {`Décisions publiques déclarées : ${a.decisions.join(' ; ')}`}
                    </T>
                  )}
                  {a.publieeLe && (
                    <T variant="caption" ton="inkMuted">
                      {`Publiée le ${jour(a.publieeLe)}`}
                    </T>
                  )}
                </View>
              ))}
              {f.actions.elements.length === 0 && <T ton="inkMuted">Aucune action déclarée.</T>}
              {onSuivante && <BoutonSecondaire onPress={onSuivante}>Actions suivantes</BoutonSecondaire>}
            </View>
          </>
        }
        cote={
          <Carte>
            <T variant="heading">Dossiers et amendements rapprochés</T>
            <T variant="caption" ton="inkMuted">
              Rapprochements faits à partir de l’objet déclaré. Chacun indique son niveau de vérification.
            </T>
            {f.rapprochements.map((l, i) => (
              <Rapprochement key={`${l.action.id}-${i}`} lien={l} />
            ))}
            {f.rapprochements.length === 0 && (
              <T variant="caption" ton="inkMuted">
                Aucun rapprochement établi avec un dossier, un amendement ou un article.
              </T>
            )}
          </Carte>
        }
      />
    </>
  );
}

/** Un rapprochement : son statut d'abord ; la cible n'est ouverte comme un fait que si le lien est vérifié. */
function Rapprochement({ lien: l }: { lien: LienInteret }) {
  const p = usePalette();
  const aller = useAller();
  const ouvrir = (c: CibleInteret) => {
    if (c.type === 'dossier') aller.dossier(c.dossier.id);
    else if (c.type === 'amendement') aller.amendement(c.amendement.id);
    else aller.article(c.article.id);
  };
  return (
    <View style={[styles.rapprochement, { borderTopColor: p.line }]}>
      <LienStatut
        lien={l.vers}
        libelle={statutLien(l.vers)}
        rendu={(c) => (
          <View style={{ gap: 2 }}>
            <Action onPress={() => ouvrir(c)} accessibilityLabel={`${statutLien(l.vers)} : ${titreCible(c)}`}>
              {`${titreCible(c)} →`}
            </Action>
            <T variant="caption" ton="inkMuted">
              {`Action déclarée : ${l.action.objet} (${libellePeriode(l.action.periode)})`}
            </T>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chiffres: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chiffre: { flexGrow: 1, flexBasis: 140, borderWidth: 1, borderRadius: radius.md, padding: space[3], gap: 2 },
  action: { gap: 6, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rapprochement: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
