// Un amendement (planche « Amendement ») : numéro, article et dossier ; l'objet en clair en titre ;
// le sort publié et comment il a été décidé ; son cycle de vie (déposé, discuté, sort) ; ce qu'il
// change, comparé à la version juste d'avant de l'article ; pourquoi (1re phrase de l'exposé des
// motifs, citée telle quelle, l'exposé complet au besoin) ; l'auteur et ses cosignataires (couleur
// de groupe) ; avis et vote (scrutin public, ou main levée vers sa variante) ; ce qui en a été dit ;
// les renvois (l'article à chaque étape, la page officielle) ; les intérêts déclarés, s'il y en a.
// Pas de case vide : une étape, une date, une section sans donnée ne sont pas dessinées.
// Les deux versions comparées portent leur étape et leur date publiées ; la discussion en commission
// et en séance sont deux pas distincts du cycle, avec le compte rendu de chaque réunion. Amendement
// de suppression (dispositif exact « Supprimer cet article. ») : la conséquence sous le sort.
// Query `ConsulterAmendement { id }`.

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConsulterAmendement, type FicheAmendement, type SegmentDiff, type VersionComparee } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, Pastille, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/commun/RappelDossier';
import { Avertissement, Colonnes, LienExterne, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { ListeInterets } from '../components/dossiers/elements';
import { adresseAncre, LIEU, nomAuteur, personneAuteur, sortAmendement, texteDuHtml } from '../components/dossiers/presentation';
import { sousLeDossier } from '../ariane';
import { Ecran } from '../components/Ecran';
import { animerMiseEnPage, Appui, Apparition, BarreQuiPousse } from '../components/mouvement';
import { consequenceAmendement, Fait, texteAvis } from '../components/scrutin/Faits';
import { Interventions } from '../components/scrutin/Interventions';
import { Renvoi } from '../components/scrutin/Renvoi';
import { LigneScrutin } from '../components/LigneScrutin';
import { date, dateCourte } from '../format';
import { useCommand } from '../hooks/core';
import { useAnimationsReduites } from '../hooks/reglages';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space, type as typo } from '../theme/tokens';

export function Amendement() {
  const { id } = useRoute<RouteProp<Pages, 'Amendement'>>().params;
  const fiche = useCommand(ConsulterAmendement({ id }));
  const f = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  return (
    <Ecran largeur="pleine" titre={f ? `Amendement ${f.amendement.numero}` : undefined} parents={sousLeDossier(f?.barre.dossier, f?.amendement.etape)}>
      <Requete resultat={fiche}>{(f) => <ContenuAmendement fiche={f} />}</Requete>
    </Ecran>
  );
}

/**
 * Première phrase d'un exposé des motifs : jusqu'au premier point (ou « ! », « ? ») suivi d'une
 * majuscule ou de la fin, sans couper « M. » ni « n° 3. ». Le texte entier s'il n'y en a qu'une.
 */
export function premierePhrase(texte: string): string {
  const t = texte.replace(/\s+/g, ' ').trim();
  const re = /[.!?…](?=\s+[«"(]?[A-ZÀ-ÖØ-Þ])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const avant = t.slice(Math.max(0, m.index - 3), m.index);
    if (/(^|\s)(M|Mme|MM|art|al|n°\s?\d*)$/i.test(avant)) continue;
    return t.slice(0, m.index + 1);
  }
  return t;
}

/** Comment le sort a été décidé (« à main levée, le 12/02/2026 »), pour la ligne sous le titre. */
function modeDuSort(f: FicheAmendement): string | null {
  const le = f.dateSort ? `le ${date(f.dateSort)}` : null;
  if (f.vote.type === 'main_levee') return ['à main levée', le].filter(Boolean).join(', ');
  if (f.vote.type === 'scrutin_public') return [`scrutin public n° ${f.vote.scrutin.numero}`, le].filter(Boolean).join(', ');
  return le;
}

/**
 * Étapes connues du cycle de vie, dans l'ordre ; une étape sans date publiée n'est pas dessinée.
 * Discussion : en commission et en séance, distinguées par la réunion (`discussion`) ; une fiche
 * antérieure à ce champ garde un seul pas « Discuté » (1re date des extraits).
 */
export function cycle(f: FicheAmendement): { libelle: string; date: string | null; finale: boolean }[] {
  const discussions = f.discussions.extraits.map((e) => e.date).filter((d): d is string => !!d).sort();
  const discute = f.discussion
    ? [
        f.discussion.commission?.date ? { libelle: 'Discuté en commission', date: f.discussion.commission.date, finale: false } : null,
        f.discussion.seance?.date ? { libelle: 'Discuté en séance', date: f.discussion.seance.date, finale: false } : null,
      ]
    : [discussions[0] ? { libelle: 'Discuté', date: discussions[0], finale: false } : null];
  return [
    f.dateDepot ? { libelle: 'Déposé', date: f.dateDepot, finale: false } : null,
    ...discute,
    f.amendement.sort ? { libelle: sortAmendement(f.amendement.sort), date: f.dateSort, finale: true } : null,
  ].filter((e): e is { libelle: string; date: string | null; finale: boolean } => e !== null);
}

/** « Commission AN · 14/01/2026 » : étape et date publiées d'une version comparée ; marquées si absentes. */
export function quandVersion(v: VersionComparee | null | undefined): string | null {
  if (v === undefined) return null;
  if (v === null) return 'version non publiée';
  return [v.etape?.libelle ?? 'étape non reliée', v.date ? date(v.date) : 'date non publiée'].join(' · ');
}

export function ContenuAmendement({ fiche: f }: { fiche: FicheAmendement }) {
  const p = usePalette();
  const aller = useAller();
  const reduites = useAnimationsReduites();
  const [exposeComplet, setExposeComplet] = useState(false);
  const a = f.amendement;
  const auteur = personneAuteur(a.auteur);
  const cible = a.division ?? (a.article ? `article ${a.article.numero}` : null);
  const etapes = cycle(f);
  const expose = f.expose ? texteDuHtml(f.expose) : null;
  const phrase = expose ? premierePhrase(expose) : null;
  const sort = modeDuSort(f);
  const consequence = consequenceAmendement(f);
  const versions = f.dispositif.versions;
  const groupesCosignataires = f.cosignataires.groupes;
  const comptesRendus = [
    f.discussion?.commission?.compteRendu ? { libelle: 'Compte rendu de la commission', lieu: f.discussion.commission } : null,
    f.discussion?.seance?.compteRendu ? { libelle: 'Compte rendu de la séance', lieu: f.discussion.seance } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <BarreDossierVue barre={f.barre} />
      <Apparition>
        <View style={{ gap: space[2] }}>
          <View style={styles.contexte}>
            <Label>{[`Amendement ${a.numero}`, cible, LIEU[a.chambre]].filter(Boolean).join(' · ')}</Label>
            <Pressable accessibilityRole="link" onPress={() => aller.dossier(f.barre.dossier.id)} hitSlop={6}>
              <Label ton="signal">{f.barre.dossier.titre}</Label>
            </Pressable>
          </View>
          <TitreEcran>{a.objet ?? `Amendement ${a.numero}`}</TitreEcran>
          {a.objet === null && <T variant="caption" ton="inkMuted">Pas de synthèse disponible de l’objet.</T>}
          <View style={styles.rangee}>
            <View style={[styles.verdict, { borderColor: p.inkSoft }]}>
              <T variant="label" ton="ink">
                {sortAmendement(a.sort)}
              </T>
            </View>
            {sort && <T ton="inkSoft">{sort}</T>}
            {consequence && <T ton="inkSoft">{consequence}</T>}
          </View>
        </View>
      </Apparition>

      {etapes.length > 0 && (
        <Apparition rang={1}>
          <View
            style={styles.cycle}
            accessibilityRole="image"
            accessibilityLabel={`Cycle de vie : ${etapes.map((e) => `${e.libelle.toLowerCase()}${e.date ? ` le ${date(e.date)}` : ''}`).join(', ')}`}
          >
            {etapes.map((e) => (
              <View key={e.libelle} style={styles.etape}>
                <View style={[styles.trait, { backgroundColor: p.surfaceSunken }]}>
                  <BarreQuiPousse fraction={1} couleur={e.finale ? p.signal : p.inkSoft} style={{ borderRadius: 2 }} />
                </View>
                <T variant="small" ton={e.finale ? 'ink' : 'inkSoft'} style={e.finale ? { fontFamily: typo.heading.fontFamily } : undefined}>
                  {e.libelle}
                </T>
                {e.date && <T variant="data" ton="inkMuted">{dateCourte(e.date)}</T>}
              </View>
            ))}
          </View>
        </Apparition>
      )}

      <Colonnes
        principale={
          <>
            <Apparition rang={2}>
              <Section titre={`Ce qu’il change${cible ? ` · ${cible}` : ''}`}>
                {f.dispositif.diff ? (
                  <>
                    <View style={styles.versus}>
                      <View style={[styles.version, { backgroundColor: p.surfaceRaised }]}>
                        <T variant="label" ton="ink">Version juste d’avant</T>
                        {versions && <T variant="caption" ton="inkMuted">{quandVersion(versions.avant)}</T>}
                      </View>
                      <T ton="inkMuted" aria-hidden>
                        →
                      </T>
                      <View style={[styles.version, { backgroundColor: p.surfaceRaised, borderWidth: 1, borderColor: p.signal }]}>
                        <T variant="label" ton="ink">Avec l’amendement</T>
                        {versions && <T variant="caption" ton="inkMuted">{quandVersion(versions.apres)}</T>}
                      </View>
                    </View>
                    <Comparaison segments={f.dispositif.diff} />
                  </>
                ) : f.dispositif.texte ? (
                  <>
                    <T style={{ fontSize: 17, lineHeight: 26 }}>{texteDuHtml(f.dispositif.texte)}</T>
                    <T variant="caption" ton="inkMuted">Dispositif tel que publié : le texte de l’article visé n’est pas chargé, la comparaison n’est pas possible.</T>
                  </>
                ) : (
                  <T ton="inkMuted">Dispositif non publié.</T>
                )}
              </Section>
            </Apparition>

            <Apparition rang={3}>
              <Section titre="Pourquoi">
                {phrase ? (
                  <>
                    <T variant="lead" couleur={p.inkQuote}>{`« ${exposeComplet && expose ? expose : phrase} »`}</T>
                    <View style={styles.rangee}>
                      <T variant="caption" ton="inkMuted">
                        {exposeComplet ? 'Exposé des motifs, cité tel quel' : '1re phrase de l’exposé des motifs, citée telle quelle'}
                      </T>
                      {expose && expose !== phrase && (
                        <Action
                          onPress={() => {
                            animerMiseEnPage(reduites);
                            setExposeComplet((x) => !x);
                          }}
                        >
                          {exposeComplet ? 'première phrase' : 'exposé complet'}
                        </Action>
                      )}
                    </View>
                    <Source provenance={f.provenance} compact />
                  </>
                ) : (
                  <T ton="inkMuted">Exposé des motifs non publié.</T>
                )}
                {f.exposeEnClair && <SyntheseVue synthese={f.exposeEnClair} titre="Résumé en clair" />}
              </Section>
            </Apparition>

            <Apparition rang={4}>
              <Appui
                accessibilityRole={auteur ? 'link' : undefined}
                onPress={auteur ? () => aller.personne(auteur.id) : undefined}
                style={[styles.auteur, { backgroundColor: p.surfaceRaised }]}
              >
                {auteur?.groupe && <Pastille couleur={auteur.groupe.couleur} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="heading">{nomAuteur(a.auteur)}</T>
                  <T variant="small" ton="inkSoft">
                    {[
                      auteur?.groupe?.libelle ?? (a.auteur?.type === 'gouvernement' ? 'Gouvernement' : a.auteur?.type === 'commission' ? 'Commission' : null),
                      f.cosignataires.total
                        ? `+ ${f.cosignataires.total} cosignataire${f.cosignataires.total > 1 ? 's' : ''}${groupesCosignataires.length === 1 ? `, ${f.cosignataires.total > 1 ? 'tous ' : ''}${groupesCosignataires[0].abrege}` : ''}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </T>
                </View>
              </Appui>
            </Apparition>
            {f.cosignataires.personnes.length > 0 && (
              <View style={styles.cosignataires}>
                {f.cosignataires.personnes.map((c) => (
                  <Appui key={c.id} accessibilityRole="link" onPress={() => aller.personne(c.id)} style={styles.cosignataire}>
                    {c.groupe && <Pastille couleur={c.groupe.couleur} taille={8} />}
                    <T style={{ flex: 1 }}>{c.nom}</T>
                    <T variant="caption" ton="inkMuted">{c.groupe?.abrege ?? c.fonction ?? 'Cosignataire'}</T>
                  </Appui>
                ))}
                {f.cosignataires.total > f.cosignataires.personnes.length && (
                  <T variant="caption" ton="inkMuted">
                    {`et ${f.cosignataires.total - f.cosignataires.personnes.length} autres${groupesCosignataires.length ? ` (${groupesCosignataires.map((g) => g.abrege).join(', ')})` : ''}`}
                  </T>
                )}
              </View>
            )}

            <Apparition rang={5}>
              <Section titre="Avis et vote">
                <View style={{ gap: space[2] }}>
                  {f.avis.publies && f.avis.liste.length > 0 ? (
                    <>
                      <Fait libelle="Avis" valeur={texteAvis(f)} />
                      {f.avis.liste.map((av, i) => (
                        <Source key={i} provenance={av.provenance} compact />
                      ))}
                    </>
                  ) : (
                    <Fait libelle="Avis" valeur={a.chambre === 'AN' ? 'Commission et Gouvernement : non publiés en données structurées par l’Assemblée' : texteAvis(f)} />
                  )}
                  <Fait
                    libelle="Vote"
                    valeur={
                      f.vote.type === 'main_levee'
                        ? 'À main levée : pas de détail par élu ni par groupe'
                        : f.vote.type === 'scrutin_public'
                          ? 'Scrutin public : vote nominatif'
                          : a.sort
                            ? `Pas mis aux voix (${sortAmendement(a.sort).toLowerCase()})`
                            : 'Pas encore mis aux voix'
                    }
                  />
                </View>
                {f.vote.type === 'scrutin_public' && <LigneScrutin scrutin={f.vote.scrutin} />}
                {f.vote.type === 'main_levee' && <Renvoi libelle="Le vote à main levée" onPress={() => aller.voteMainLevee(a.id)} />}
              </Section>
            </Apparition>

            <Interventions titre="Ce qui en a été dit" extraits={f.discussions.extraits} total={f.discussions.total} amendement={a.id} />
          </>
        }
        laterale={
          <>
            <View>
              {a.article && <Renvoi libelle={`L’article ${a.article.numero} à chaque étape`} onPress={() => aller.article(a.article!.id)} />}
              {f.provenance.url && <Renvoi libelle="Texte officiel" externe onPress={() => void Linking.openURL(f.provenance.url!)} />}
            </View>
            {comptesRendus.length > 0 && (
              <View style={styles.sources}>
                {comptesRendus.map((c) =>
                  c.lieu.compteRendu!.url ? (
                    <LienExterne key={c.libelle} url={adresseAncre(c.lieu.compteRendu!)}>
                      {`${c.libelle}${c.lieu.date ? ` · ${date(c.lieu.date)}` : ''}`}
                    </LienExterne>
                  ) : (
                    <T key={c.libelle} variant="caption" ton="inkMuted">{`${c.libelle} : adresse non publiée`}</T>
                  ),
                )}
              </View>
            )}
            {f.interets.length > 0 && (
              <Section titre="Intérêts déclarés sur ce sujet">
                <ListeInterets interets={f.interets} />
                <Avertissement>Un rapprochement n’établit ni contact avec l’auteur, ni influence sur l’amendement.</Avertissement>
              </Section>
            )}
            <Signaler cible={{ type: 'amendement', id: a.id }} ecran="Amendement" />
          </>
        }
      />
    </>
  );
}

/** Comparaison mot à mot avec la version juste d'avant : retraits barrés, ajouts soulignés. */
function Comparaison({ segments }: { segments: SegmentDiff[] }) {
  const p = usePalette();
  return (
    <View style={{ gap: space[2] }}>
      <View style={[styles.diff, { backgroundColor: p.surfaceSunken }]}>
        <Text style={[typo.data, { fontSize: 14, lineHeight: 22, color: p.inkSoft }]}>
          {segments.map((s, i) => (
            <Text
              key={i}
              accessibilityLabel={s.type === 'ajoute' ? `ajouté : ${s.texte}` : s.type === 'supprime' ? `retiré : ${s.texte}` : undefined}
              style={
                s.type === 'ajoute'
                  ? { backgroundColor: p.diffAdded, color: p.ink, textDecorationLine: 'underline' }
                  : s.type === 'supprime'
                    ? { backgroundColor: p.diffRemoved, color: p.ink, textDecorationLine: 'line-through', textDecorationColor: p.voteContre }
                    : undefined
              }
            >
              {s.texte}
            </Text>
          ))}
        </Text>
      </View>
      <View style={styles.rangee}>
        <T variant="caption" style={{ backgroundColor: p.diffAdded, textDecorationLine: 'underline' }}>texte ajouté</T>
        <T variant="caption" style={{ backgroundColor: p.diffRemoved, textDecorationLine: 'line-through', textDecorationColor: p.voteContre }}>texte retiré</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contexte: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2] },
  rangee: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] },
  verdict: { paddingVertical: 6, paddingHorizontal: space[3], borderWidth: 1, borderRadius: 2 },
  cycle: { flexDirection: 'row', gap: space[1] },
  etape: { flex: 1, gap: 6 },
  trait: { height: 4, borderRadius: 2, overflow: 'hidden', flexDirection: 'row' },
  versus: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  version: { flex: 1, paddingVertical: space[2], paddingHorizontal: 10, borderRadius: radius.md },
  diff: { padding: space[3], borderRadius: radius.md },
  auteur: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: 14, borderRadius: radius.lg },
  cosignataires: { gap: space[1] },
  cosignataire: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  sources: { gap: space[2], alignItems: 'flex-start' },
});
