// La vue filtrée de l'Explorer (canevas v4, Explorer.dc.html) : fil de filtres par famille, phrase
// de contexte, objet focal et sa « Fiche », onglets de faits avec compteurs, « Regrouper par »,
// groupes de tête qui ajoutent un filtre, scrutin filtré, comparaison de deux groupes (appui long),
// « Élargir » et « Rien ici », panneau « Ajouter un filtre » (portrait) ou colonne « Affiner »
// (paysage). Toute action produit une nouvelle demande (`changer`) : l'écran la met dans l'adresse.

import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CleFiltre, DemandeFaits, ExplorationFaits, FicheVisee, GroupeFaits, Page, ScrutinFiltre, TypeFait } from '@/core';
import { useAller } from '../../../navigation';
import {
  FAMILLES_LIBELLES,
  ONGLETS_FAITS,
  REGROUPEMENTS_LIBELLES,
  ajouterFiltre,
  avecDeplie,
  avecOnglet,
  avecPage,
  avecRegroupement,
  comparerA,
  nombreFaits,
  ongletsVisibles,
  phraseContexte,
  remonterA,
  retirerFamille,
  retirerFiltres,
  segmentsFil,
} from '../../explorer';
import { date, dateLongue, nombre, pluriel } from '../../format';
import { useLarge } from '../../hooks/miseEnPage';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { BoutonSecondaire, Label, Pastille, Repartition, T, TitreEcran } from '../base';
import { Avertissement, Puces } from '../fondations';
import { CarteFait, Etiquette, PastilleMainLevee } from './Faits';

type Changer = (d: DemandeFaits) => void;

const TYPE_FOCAL: Record<CleFiltre, string> = {
  dossier: 'Dossier législatif',
  etape: 'Étape',
  article: 'Article',
  groupe: 'Groupe parlementaire',
  personne: 'Personne',
  chambre: 'Institution',
  organe: 'Organe',
  departement: 'Territoire',
  scrutin: 'Vote',
  amendement: 'Amendement',
};

// ---------- Petites pièces ----------

/** Pagination d'une `Page<T>` : position, précédente, suivante. */
function Pagination({ page, taille, total, suivante, onPage }: { page: number; taille: number; total: number | null; suivante: number | null; onPage(n: number): void }) {
  const debut = (page - 1) * taille + 1;
  return (
    <View style={{ gap: space[2] }}>
      <Label>{total !== null ? `Page ${page} · ${debut}–${Math.min(total, page * taille)} sur ${total}` : `Page ${page}`}</Label>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {page > 1 && <BoutonSecondaire onPress={() => onPage(page - 1)}>← Précédente</BoutonSecondaire>}
        {suivante !== null && <BoutonSecondaire onPress={() => onPage(suivante)}>Suivante →</BoutonSecondaire>}
      </View>
    </View>
  );
}

/** Puce de filtre : libellé, nombre, appui long facultatif (comparer). */
function PuceFiltre({
  libelle,
  nombre: n,
  couleur,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  libelle: string;
  nombre?: number;
  couleur?: string | null;
  onPress(): void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (n !== undefined ? `${libelle}, ${nombreFaits(n)}` : libelle)}
      accessibilityHint={onLongPress ? 'Appui long : comparer' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.puce, { borderColor: p.lineFaint }, pressed && { opacity: 0.8 }]}
    >
      {couleur && <Pastille couleur={couleur} taille={8} />}
      <T variant="label" ton="ink">
        {libelle}
      </T>
      {n !== undefined && (
        <T variant="caption" ton="inkMuted">
          {nombre(n)}
        </T>
      )}
    </Pressable>
  );
}

/** Fil de filtres : un segment par famille, chaque niveau touchable pour remonter, × pour retirer. */
function Fil({ e, changer, panneau }: { e: ExplorationFaits; changer: Changer; panneau?: { ouvert: boolean; basculer(): void } }) {
  const p = usePalette();
  const segments = segmentsFil(e);
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="Filtres actifs" style={styles.fil}>
      {segments.map((s) => (
        <View key={s.famille} style={[styles.segment, { backgroundColor: p.filtreSoft, borderColor: p.filtreLine }]}>
          <T variant="label" couleur={p.ai} aria-hidden>
            {s.glyphe}
          </T>
          {s.filtres.map((f, i) => {
            const dernier = i === s.filtres.length - 1;
            return (
              <View key={f.cle} style={styles.maillon}>
                {i > 0 && (
                  <T variant="label" ton="inkMuted" aria-hidden>
                    ›
                  </T>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={dernier ? f.libelle : `Remonter à ${f.libelle}`}
                  disabled={dernier}
                  onPress={() => changer(remonterA(e.demande, f.cle))}
                  style={styles.cran}
                >
                  {f.groupe && <Pastille couleur={f.groupe.couleur} taille={8} />}
                  <T variant="label" couleur={dernier ? p.ink : p.inkSoft} numberOfLines={1}>
                    {f.libelle}
                  </T>
                </Pressable>
              </View>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retirer le filtre ${s.libelle}`}
            onPress={() => changer(retirerFamille(e.demande, s.famille))}
            style={styles.croix}
          >
            <T variant="heading" ton="inkSoft" aria-hidden>
              ×
            </T>
          </Pressable>
        </View>
      ))}
      {panneau && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: panneau.ouvert }}
          onPress={panneau.basculer}
          style={[styles.ajouter, { borderColor: p.lineStrong }]}
        >
          <T variant="label" ton="ink">
            {panneau.ouvert ? '+ Fermer les filtres' : '+ Ajouter un filtre'}
          </T>
        </Pressable>
      )}
    </View>
  );
}

/** Suggestions de filtres par famille, avec leur nombre (panneau ou colonne « Affiner »). */
function Suggestions({ e, changer }: { e: ExplorationFaits; changer: Changer }) {
  const groupeFiltre = e.demande.filtres?.groupe;
  if (!e.suggestions.length) return <T ton="inkMuted">Aucun filtre de plus ne resserre cette vue.</T>;
  return (
    <View style={{ gap: space[4] }}>
      {e.suggestions.map((s) => (
        <View key={s.famille} style={{ gap: space[2] }}>
          <View style={styles.famille}>
            <T variant="label" ton="ink" aria-hidden style={styles.glyphe}>
              {FAMILLES_LIBELLES[s.famille].glyphe}
            </T>
            <Label ton="inkSoft">{FAMILLES_LIBELLES[s.famille].libelle}</Label>
          </View>
          <View style={styles.puces}>
            {s.filtres.map((f) => (
              <PuceFiltre
                key={`${f.cle}:${f.id}`}
                libelle={f.libelle}
                nombre={f.nombre}
                couleur={f.groupe?.couleur}
                onPress={() => changer(ajouterFiltre(e.demande, f.cle, f.id))}
                onLongPress={f.cle === 'groupe' && groupeFiltre && f.id !== groupeFiltre ? () => changer(comparerA(e.demande, f.id)) : undefined}
              />
            ))}
          </View>
        </View>
      ))}
      <T variant="small" ton="inkMuted">
        Un filtre de plus resserre la vue. Appui long sur un groupe pour le comparer au groupe filtré.
      </T>
    </View>
  );
}

/** Onglets de faits avec leur nombre ; Transparence au style à part. */
function OngletsFaits({ e, changer }: { e: ExplorationFaits; changer: Changer }) {
  const p = usePalette();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View accessibilityRole="tablist" accessibilityLabel="Faits" style={[styles.onglets, { borderBottomColor: p.line }]}>
        {ongletsVisibles(e).map((t) => {
          const actif = t === e.onglet;
          const tr = t === 'transparence';
          return (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={`${ONGLETS_FAITS[t]}, ${e.compteurs[t]}`}
              onPress={() => changer(avecOnglet(e.demande, t))}
              style={[styles.onglet, { borderBottomColor: actif ? p.signal : 'transparent' }]}
            >
              <T variant="heading" couleur={actif ? p.ink : p.inkMuted}>
                {ONGLETS_FAITS[t]}
              </T>
              <View style={[styles.compte, { backgroundColor: tr ? p.cautionLine : p.surfaceSoft }]}>
                <T variant="caption" couleur={tr ? p.caution : p.inkSoft}>
                  {nombre(e.compteurs[t])}
                </T>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** Un groupe de faits : tête touchable (ajoute son filtre ; appui long sur un groupe : comparer), aperçu, « Voir les N ». */
function Groupe({ g, e, changer, onglet }: { g: GroupeFaits; e: ExplorationFaits; changer: Changer; onglet: TypeFait }) {
  const p = usePalette();
  const filtrer = (cle: CleFiltre, id: string) => changer(ajouterFiltre(e.demande, cle, id));
  const groupeFiltre = e.demande.filtres?.groupe;
  const compter =
    onglet === 'personnes' ? pluriel(g.total, 'personne') : onglet === 'amendements' ? pluriel(g.total, 'amendement') : onglet === 'votes' ? pluriel(g.total, 'vote') : onglet === 'interventions' ? pluriel(g.total, 'intervention') : pluriel(g.total, 'élément');
  const tete = (
    <View style={styles.teteContenu}>
      {g.groupe && <Pastille couleur={g.groupe.couleur} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T variant="heading">{/^\d{4}-\d{2}-\d{2}$/.test(g.libelle) ? dateLongue(g.libelle) : g.libelle}</T>
        <T variant="small" ton="inkMuted">
          {[compter, g.detail].filter(Boolean).join(' · ')}
        </T>
      </View>
      {g.filtre && (
        <T variant="section" ton="inkMuted" aria-hidden>
          ›
        </T>
      )}
    </View>
  );
  return (
    <View style={styles.groupe}>
      {g.filtre ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${g.libelle}, ${compter} : filtrer`}
          accessibilityHint={g.filtre.cle === 'groupe' && groupeFiltre ? 'Appui long : comparer au groupe filtré' : undefined}
          onPress={() => filtrer(g.filtre!.cle, g.filtre!.id)}
          onLongPress={g.filtre.cle === 'groupe' && groupeFiltre && g.filtre.id !== groupeFiltre ? () => changer(comparerA(e.demande, g.filtre!.id)) : undefined}
          style={({ pressed }) => [styles.tete, { borderBottomColor: p.line }, pressed && { opacity: 0.8 }]}
        >
          {tete}
        </Pressable>
      ) : (
        <View style={[styles.tete, { borderBottomColor: p.line }]}>{tete}</View>
      )}
      {g.faits.map((f) => (
        <CarteFait key={`${f.type}:${f.id}`} fait={f} filtrer={filtrer} sansArticle={!!e.demande.filtres?.article} />
      ))}
      {g.total > g.faits.length && (
        <Pressable accessibilityRole="button" onPress={() => changer(avecDeplie(e.demande, onglet, g.cle))} style={styles.voir}>
          <T variant="label" ton="signal">{`Voir les ${nombre(g.total)} →`}</T>
        </Pressable>
      )}
    </View>
  );
}

function ListeGroupes({ groupes, e, changer, onglet }: { groupes: Page<GroupeFaits>; e: ExplorationFaits; changer: Changer; onglet: TypeFait }) {
  return (
    <View style={{ gap: space[6] }}>
      {groupes.elements.map((g) => (
        <Groupe key={g.cle} g={g} e={e} changer={changer} onglet={onglet} />
      ))}
      {(groupes.page > 1 || groupes.suivante !== null) && (
        <Pagination page={groupes.page} taille={groupes.taille} total={groupes.total} suivante={groupes.suivante} onPage={(n) => changer(avecPage(e.demande, n))} />
      )}
    </View>
  );
}

/** Le scrutin filtré : sa répartition par groupe (touchable), et chaque membre du groupe filtré. */
function Scrutin({ s, e, changer }: { s: ScrutinFiltre; e: ExplorationFaits; changer: Changer }) {
  const p = usePalette();
  const aller = useAller();
  const sc = s.scrutin;
  const total = sc.decompte.pour + sc.decompte.contre + sc.decompte.abstention;
  return (
    <View style={{ gap: space[3] }}>
      <View style={[styles.panneau, { backgroundColor: p.surfaceRaised }]}>
        <Label>{`Scrutin n° ${sc.numero} · ${date(sc.date)}`}</Label>
        <T variant="heading">{sc.enClair ?? sc.intitule}</T>
        <T>
          <T variant="heading">{sc.sort ?? (sc.adopte === null ? 'Sort non publié' : sc.adopte ? 'Adopté' : 'Rejeté')}</T>
          {` · ${sc.decompte.pour} pour, ${sc.decompte.contre} contre, ${sc.decompte.abstention} abstentions`}
        </T>
        <Repartition decompte={sc.decompte} total={total} hauteur={8} />
        <Pressable accessibilityRole="link" onPress={() => aller.scrutin(sc.id)} style={styles.voir}>
          <T variant="label" ton="signal">
            Fiche du scrutin →
          </T>
        </Pressable>
      </View>
      {s.membres ? (
        <View>
          {s.membres.map((m) => (
            <Pressable
              key={m.personne.id}
              accessibilityRole="button"
              accessibilityLabel={`${m.personne.nom} : ${m.position}`}
              onPress={() => changer(ajouterFiltre(e.demande, 'personne', m.personne.id))}
              style={({ pressed }) => [styles.membre, { borderBottomColor: p.line }, pressed && { opacity: 0.8 }]}
            >
              <Pastille couleur={couleurVote(p, m.position)} taille={14} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T variant="heading">{m.personne.nom}</T>
                {m.personne.fonction && (
                  <T variant="caption" ton="inkMuted">
                    {m.personne.fonction}
                  </T>
                )}
              </View>
              {m.contreSonGroupe && <Etiquette>contre son groupe</Etiquette>}
              <T variant="label" couleur={couleurVote(p, m.position)}>
                {m.position === 'pour' ? 'Pour' : m.position === 'contre' ? 'Contre' : m.position === 'abstention' ? 'Abstention' : m.position === 'non_votant' ? 'Non-votant' : 'Absent'}
                {m.parDelegation ? ' (délégation)' : ''}
              </T>
            </Pressable>
          ))}
        </View>
      ) : (
        <View>
          {s.groupes.map((g) => {
            const n = g.decompte.pour + g.decompte.contre + g.decompte.abstention;
            const part = (x: number) => (n ? Math.round((x / n) * 100) : 0);
            return (
              <Pressable
                key={g.groupe.id}
                accessibilityRole="button"
                accessibilityLabel={`${g.groupe.libelle} : ${part(g.decompte.pour)} % pour, ${part(g.decompte.contre)} % contre. Voir chaque membre`}
                onPress={() => changer(ajouterFiltre(e.demande, 'groupe', g.groupe.id))}
                style={({ pressed }) => [styles.groupeVote, { borderBottomColor: p.line }, pressed && { opacity: 0.8 }]}
              >
                <View style={styles.teteContenu}>
                  <Pastille couleur={g.groupe.couleur} />
                  <T variant="heading" style={{ flex: 1 }}>
                    {g.groupe.libelle}
                  </T>
                  <T variant="small" ton="inkSoft">{`${part(g.decompte.pour)} % pour · ${part(g.decompte.contre)} % contre`}</T>
                  <T variant="section" ton="inkMuted" aria-hidden>
                    ›
                  </T>
                </View>
                <Repartition decompte={g.decompte} hauteur={8} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Fiche : l'objet seul, hors filtres (feuille en bas en portrait, panneau à droite en paysage). */
function Fiche({ e, ouvert, fermer }: { e: ExplorationFaits; ouvert: boolean; fermer(): void }) {
  const p = usePalette();
  const large = useLarge();
  const aller = useAller();
  const f = e.focal;
  if (!f) return null;
  const ouvrir = (v: FicheVisee) => {
    fermer();
    switch (v.type) {
      case 'dossier':
        return aller.dossier(v.id);
      case 'etape':
        return aller.etape(v.dossier, v.cle);
      case 'article':
        return aller.article(v.id);
      case 'personne':
        return aller.personne(v.id);
      case 'scrutin':
        return aller.scrutin(v.id);
      case 'amendement':
        return aller.amendement(v.id);
      case 'institution':
        return aller.institution(v.institution);
    }
  };
  const faits = ongletsVisibles({ compteurs: e.compteurs, onglet: e.onglet }).filter((t) => e.compteurs[t] > 0);
  return (
    <Modal visible={ouvert} transparent animationType={large ? 'fade' : 'slide'} onRequestClose={fermer}>
      <Pressable accessibilityLabel="Fermer la fiche" onPress={fermer} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
      <View
        accessibilityRole="none"
        aria-modal
        accessibilityLabel={`Fiche · ${TYPE_FOCAL[f.cle]}`}
        style={[
          large ? styles.ficheLarge : styles.fichePortrait,
          { backgroundColor: p.surfaceRaised, borderColor: p.lineFaint },
        ]}
      >
        <View style={styles.ficheEntete}>
          <Label>{`Fiche · ${TYPE_FOCAL[f.cle]}`}</Label>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer la fiche" onPress={fermer} style={[styles.fermer, { borderColor: p.lineFaint }]}>
            <T variant="heading" aria-hidden>
              ×
            </T>
          </Pressable>
        </View>
        <View style={styles.teteContenu}>
          {f.groupe && <Pastille couleur={f.groupe.couleur} taille={12} />}
          <T variant="title">{f.libelle}</T>
        </View>
        {f.detail && <T ton="inkSoft">{f.detail}</T>}
        {faits.length > 0 && (
          <View style={{ gap: space[2] }}>
            {faits.map((t) => (
              <View key={t} style={styles.entreDeux}>
                <T ton="inkSoft">{`${ONGLETS_FAITS[t]} dans cette vue`}</T>
                <T variant="data">{nombre(e.compteurs[t])}</T>
              </View>
            ))}
          </View>
        )}
        <T variant="small" ton="inkMuted">
          La fiche montre l’objet pour lui-même, hors des filtres. La fermer ramène à la même vue.
        </T>
        {f.fiche ? (
          <Pressable accessibilityRole="link" onPress={() => ouvrir(f.fiche!)} style={[styles.bouton, { backgroundColor: p.ink }]}>
            <T variant="heading" couleur={p.surface}>
              Ouvrir la fiche complète
            </T>
          </Pressable>
        ) : (
          <T variant="small" ton="inkMuted">
            Pas encore de fiche complète pour cet objet.
          </T>
        )}
      </View>
    </Modal>
  );
}

// ---------- Vue ----------

export function VueExploration({ e, changer }: { e: ExplorationFaits; changer: Changer }) {
  const p = usePalette();
  const large = useLarge();
  const [panneau, setPanneau] = useState(false);
  const [fiche, setFiche] = useState(false);
  const sansFiltre = e.filtres.length === 0;
  const comparer = !!e.comparaison;
  const vide = e.groupes.total === 0 && e.groupes.elements.length === 0 && !e.scrutin && !e.deplie;
  const changerEtFermer: Changer = (d) => {
    setPanneau(false);
    changer(d);
  };

  const principal: ReactNode = (
    <View style={styles.principal}>
      {sansFiltre && (
        <View style={{ gap: space[2] }}>
          <TitreEcran>Parcourir</TitreEcran>
          <T ton="inkSoft">Tous les faits du Parlement. Touchez un dossier, un groupe ou une personne pour filtrer.</T>
        </View>
      )}
      <Fil e={e} changer={changer} panneau={large ? undefined : { ouvert: panneau, basculer: () => setPanneau((o) => !o) }} />
      {!large && panneau && (
        <View style={[styles.panneau, { backgroundColor: p.surfaceSoft, borderColor: p.line, borderWidth: 1 }]} accessibilityLabel="Ajouter un filtre">
          <Suggestions e={e} changer={changerEtFermer} />
        </View>
      )}
      {e.indisponibles.length > 0 && (
        <Avertissement type="prudence" titre="Filtre pas encore disponible">
          {`Les territoires ne sont pas encore chargés : le filtre ${e.indisponibles.map((c) => TYPE_FOCAL[c].toLowerCase()).join(', ')} ne retient aucun fait.`}
        </Avertissement>
      )}
      <T variant={large ? 'leadLarge' : 'lead'} couleur={p.inkQuote}>
        {phraseContexte(e)}
      </T>
      {e.focal && (
        <View style={[styles.focal, { backgroundColor: p.surfaceRaised }]}>
          {e.focal.groupe && <Pastille couleur={e.focal.groupe.couleur} taille={12} />}
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Label>{TYPE_FOCAL[e.focal.cle]}</Label>
            <T variant="section">{e.focal.libelle}</T>
            {e.focal.detail && (
              <T variant="small" ton="inkSoft">
                {e.focal.detail}
              </T>
            )}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Fiche : ${e.focal.libelle}`} onPress={() => setFiche(true)} style={[styles.boutonFiche, { borderColor: p.lineStrong }]}>
            <T variant="heading">Fiche</T>
          </Pressable>
        </View>
      )}
      <OngletsFaits e={e} changer={changer} />
      {e.onglet === 'transparence' && (
        <Avertissement type="prudence" titre="Déclarations et transparence">
          Ce que les élus et les organisations déclarent à la HATVP. Un rapprochement avec un texte n’est pas une preuve d’influence : chacun porte son statut.
        </Avertissement>
      )}
      {e.regroupements.length > 1 && !e.scrutin && (
        <Puces label="Regrouper par">
          <T variant="small" ton="inkMuted" style={{ alignSelf: 'center' }}>
            Regrouper par
          </T>
          {e.regroupements.map((r) => {
            const actif = r === e.regroupement;
            return (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                onPress={() => changer(avecRegroupement(e.demande, e.onglet, r))}
                style={[styles.puce, actif ? { backgroundColor: p.ink, borderColor: p.ink } : { borderColor: p.lineFaint }]}
              >
                <T variant="label" couleur={actif ? p.surface : p.ink}>
                  {REGROUPEMENTS_LIBELLES[r]}
                </T>
              </Pressable>
            );
          })}
        </Puces>
      )}
      {e.comparaison && (
        <View style={[styles.comparaison, { borderColor: p.lineStrong }]}>
          <T style={{ flex: 1 }}>
            {'Comparaison : '}
            <T variant="heading">{e.filtres.find((f) => f.cle === 'groupe')?.libelle ?? ''}</T>
            {' et '}
            <T variant="heading">{e.comparaison.groupe.libelle}</T>
          </T>
          <Pressable accessibilityRole="button" onPress={() => changer(comparerA(e.demande, undefined))} style={[styles.puce, { borderColor: p.lineFaint }]}>
            <T variant="label">Fermer</T>
          </Pressable>
        </View>
      )}
      {e.scrutin && <Scrutin s={e.scrutin} e={e} changer={changer} />}
      {e.deplie && e.demande.deplier ? (
        <View style={{ gap: space[3] }}>
          <Pressable accessibilityRole="button" onPress={() => changer(avecDeplie(e.demande, e.onglet, undefined))} style={styles.voir}>
            <T variant="label" ton="signal">
              ← Tous les groupes
            </T>
          </Pressable>
          {e.deplie.elements.map((f) => (
            <CarteFait key={`${f.type}:${f.id}`} fait={f} filtrer={(cle, id) => changer(ajouterFiltre(e.demande, cle, id))} sansArticle={!!e.demande.filtres?.article} />
          ))}
          <Pagination page={e.deplie.page} taille={e.deplie.taille} total={e.deplie.total} suivante={e.deplie.suivante} onPage={(n) => changer(avecPage(e.demande, n))} />
        </View>
      ) : (
        !e.scrutin && (
          <View style={comparer && large ? styles.colonnesComparees : { gap: space[6] }}>
            <View style={{ flex: 1, minWidth: 0, gap: space[4] }}>
              {e.comparaison && <T variant="section">{e.filtres.find((f) => f.cle === 'groupe')?.libelle}</T>}
              <ListeGroupes groupes={e.groupes} e={e} changer={changer} onglet={e.onglet} />
            </View>
            {e.comparaison && (
              <View style={{ flex: 1, minWidth: 0, gap: space[4] }}>
                <T variant="section">{e.comparaison.groupe.libelle}</T>
                <ListeGroupes groupes={e.comparaison.groupes} e={e} changer={changer} onglet={e.onglet} />
              </View>
            )}
          </View>
        )
      )}
      {vide && (
        <View style={[styles.vide, { borderColor: p.lineFaint }]}>
          <T variant="heading">Rien ici</T>
          <T ton="inkSoft">Aucun fait ne correspond à tous ces filtres. Élargissez la vue en retirant un filtre.</T>
          <View style={styles.puces}>
            {e.elargir.map((x) => (
              <PuceFiltre key={x.retirer.join(',')} libelle={x.libelle} nombre={x.nombre} onPress={() => changer(retirerFiltres(e.demande, x.retirer))} />
            ))}
          </View>
        </View>
      )}
      {!vide && e.elargir.length > 0 && (
        <View style={[styles.elargir, { borderTopColor: p.line }]}>
          <T variant="small" ton="inkMuted">
            Élargir
          </T>
          {e.elargir.map((x) => (
            <PuceFiltre key={x.retirer.join(',')} libelle={x.libelle} nombre={x.nombre} onPress={() => changer(retirerFiltres(e.demande, x.retirer))} />
          ))}
        </View>
      )}
      {e.onglet === 'votes' && !e.scrutin && (
        <View style={styles.teteContenu}>
          <PastilleMainLevee />
          <T variant="small" ton="inkMuted">
            Main levée : aucun vote individuel n’est enregistré.
          </T>
        </View>
      )}
      {e.limites.length > 0 && (
        <View style={{ gap: space[1] }}>
          {e.limites.map((l) => (
            <T key={l} variant="small" ton="inkMuted">
              {l}
            </T>
          ))}
        </View>
      )}
      <Fiche e={e} ouvert={fiche} fermer={() => setFiche(false)} />
    </View>
  );

  if (!large) return principal;
  return (
    <View style={styles.deuxColonnes}>
      <View accessibilityLabel="Filtres" style={[styles.affiner, { backgroundColor: p.surfaceRaised, borderColor: p.line }]}>
        <T variant="heading">Affiner</T>
        <Suggestions e={e} changer={changer} />
      </View>
      {principal}
    </View>
  );
}

const styles = StyleSheet.create({
  principal: { flex: 1, minWidth: 0, gap: space[5] },
  deuxColonnes: { flexDirection: 'row', alignItems: 'flex-start', gap: space[10] },
  affiner: { width: 280, gap: space[5], padding: space[5], borderRadius: radius.lg, borderWidth: 1 },
  fil: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingLeft: 14, paddingRight: 6, borderRadius: radius.full, borderWidth: 1.5, maxWidth: '100%' },
  maillon: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  cran: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 2, flexShrink: 1 },
  croix: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  ajouter: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center' },
  panneau: { gap: space[2], padding: space[4], borderRadius: radius.lg },
  famille: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  glyphe: { width: 20, textAlign: 'center' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puce: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[3], borderRadius: radius.full, borderWidth: 1 },
  focal: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: 18, paddingVertical: space[4], borderRadius: radius.lg },
  boutonFiche: { minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.full, borderWidth: 1, justifyContent: 'center' },
  onglets: { flexDirection: 'row', gap: space[6], borderBottomWidth: 1 },
  onglet: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, borderBottomWidth: 3 },
  compte: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  groupe: { gap: 10, minWidth: 0 },
  tete: { minHeight: 48, paddingBottom: 4, borderBottomWidth: 1, justifyContent: 'center' },
  teteContenu: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voir: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  comparaison: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  colonnesComparees: { flexDirection: 'row', alignItems: 'flex-start', gap: space[8] },
  membre: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60, paddingVertical: space[2], borderBottomWidth: 1 },
  groupeVote: { gap: space[2], paddingVertical: space[3], borderBottomWidth: 1 },
  vide: { gap: space[3], padding: space[6], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  elargir: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], paddingTop: space[2], borderTopWidth: 1 },
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', gap: space[4] },
  fichePortrait: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', gap: space[4], padding: space[5], paddingBottom: space[7], borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1 },
  ficheLarge: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, gap: space[4], padding: space[8], borderLeftWidth: 1 },
  ficheEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  fermer: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bouton: { minHeight: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
});
