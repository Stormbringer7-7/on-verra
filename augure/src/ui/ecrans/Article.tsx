// Un article suivi à travers les versions du texte (canevas « Article ») : versions successives,
// texte de la version choisie comparé mot à mot à la précédente ou au texte déposé, et l'origine
// du changement avec son statut (amendement vérifié, à vérifier, compromis CMP, non établie).
// Query `ConsulterArticle { article, version, comparaison }`.

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConsulterArticle, type FicheArticle } from '@/core';
import type { Pages } from '../../navigation';
import { Label, Segmente, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/commun/RappelDossier';
import { Carte, Colonnes, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { DiffTexte, OrigineVue } from '../components/dossiers/elements';
import { CHAMBRE_COURTE, entreeArticle, titreOrigine } from '../components/dossiers/presentation';
import { parentDossier, RACINES, sousLeDossier } from '../ariane';
import { Ecran } from '../components/Ecran';
import { date } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

type Comparaison = 'precedente' | 'depose';

export function Article() {
  const params = useRoute<RouteProp<Pages, 'Article'>>().params;
  const [version, setVersion] = useState(params.version);
  const [comparaison, setComparaison] = useState<Comparaison>(params.comparaison ?? 'precedente');
  const fiche = useCommand(ConsulterArticle(entreeArticle(params.article, version, comparaison)));
  const f = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  return (
    <Ecran largeur="pleine" titre={f ? `Art. ${f.article.numero}` : undefined} parents={f ? [...sousLeDossier(f.barre.dossier), { ...parentDossier(f.barre.dossier), libelle: 'Le texte' }] : [RACINES.lois]}>
      <Requete resultat={fiche}>
        {(f) => <ContenuArticle fiche={f} comparaison={comparaison} onVersion={setVersion} onComparaison={setComparaison} />}
      </Requete>
    </Ecran>
  );
}

function ContenuArticle({
  fiche: f,
  comparaison,
  onVersion,
  onComparaison,
}: {
  fiche: FicheArticle;
  comparaison: Comparaison;
  onVersion(id: string): void;
  onComparaison(c: Comparaison): void;
}) {
  const p = usePalette();
  const a = f.affichee;
  const affichee = f.versions.find((v) => v.id === a.version) ?? null;
  const comparee = f.versions.find((v) => v.id === a.compareeA) ?? null;
  const aVerifier = a.origine?.type === 'amendement' && a.origine.amendement.statut === 'a_verifier';
  return (
    <>
      <BarreDossierVue barre={f.barre} />
      <View style={{ gap: space[2] }}>
        <Label>{`Article ${f.article.numero} · ${f.modifications} modification${f.modifications > 1 ? 's' : ''} depuis le dépôt`}</Label>
        <TitreEcran>{f.intitule ?? `Article ${f.article.numero}`}</TitreEcran>
      </View>
      <Colonnes
        principale={
          <>
            <Segmente
              label="Comparer avec"
              valeur={comparaison}
              onChange={onComparaison}
              options={[
                { cle: 'precedente', libelle: 'Version précédente' },
                { cle: 'depose', libelle: 'Texte déposé' },
              ]}
            />
            <Carte>
              <Label>
                {affichee
                  ? `${affichee.libelle}${affichee.date ? ` · ${date(affichee.date)}` : ''}${comparee ? ` · comparé à : ${comparee.libelle}` : ''}`
                  : 'Version affichée'}
              </Label>
              {affichee?.mention && <Label ton="ink">{affichee.mention}</Label>}
              {a.compareeA === null ? <T style={{ fontSize: 17, lineHeight: 26 }}>{a.texte}</T> : <DiffTexte segments={a.diff} />}
            </Carte>
            <Section titre="Pourquoi ce changement">
              <Label>{titreOrigine(a.origine)}</Label>
              {a.origine === null ? (
                <T ton="inkMuted">Texte déposé : rien à comparer.</T>
              ) : (
                <>
                  <OrigineVue origine={a.origine} />
                  {/* Attribution en revue : ni l'exposé ni la synthèse d'un amendement candidat ne sont montrés. */}
                  {aVerifier ? (
                    <T variant="caption" ton="inkMuted">Exposé et synthèse affichés une fois l’attribution vérifiée.</T>
                  ) : (
                    <>
                  {a.pourquoi.expose && (
                    <View style={[styles.citation, { borderLeftColor: p.lineStrong }]}>
                      <Label>Exposé des motifs · extrait officiel</Label>
                      <T>{`« ${a.pourquoi.expose} »`}</T>
                    </View>
                  )}
                  <SyntheseVue synthese={a.pourquoi.synthese} titre="En clair" />
                    </>
                  )}
                </>
              )}
            </Section>
          </>
        }
        laterale={
          <>
            <Section titre="Versions de l’article">
              <ScrollView style={{ maxHeight: 520 }} nestedScrollEnabled>
                {f.versions.map((v) => {
                  const active = v.id === a.version;
                  return (
                    <Pressable
                      key={v.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => onVersion(v.id)}
                      style={[styles.version, { borderColor: active ? p.ink : p.line, backgroundColor: active ? p.surfaceRaised : 'transparent' }]}
                    >
                      <Label ton={active ? 'ink' : 'inkMuted'}>
                        {`V${v.rang} · ${v.date ? date(v.date) : 'date inconnue'}${v.lieu ? ` · ${CHAMBRE_COURTE[v.lieu]}` : ''}`}
                      </Label>
                      <T>{v.libelle}</T>
                      <T variant="caption" ton="inkMuted">
                        {[`Art. ${v.numero}`, v.mention, v.statut === 'present' ? null : v.statut.replace('_', ' ')].filter(Boolean).join(' · ')}
                      </T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Section>
            <Signaler cible={{ type: 'article', id: f.article.id }} ecran="Article" />
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  citation: { borderLeftWidth: 2, paddingLeft: 14, gap: 6 },
  version: { gap: 2, padding: space[3], borderWidth: 1, borderRadius: radius.sm, marginBottom: space[2], minHeight: 44 },
});
