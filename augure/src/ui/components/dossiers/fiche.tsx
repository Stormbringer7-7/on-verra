// Sections de la fiche Dossier (maquette v3, planches « Dossier », « DossierTexte »,
// « DossierAmendements », « DossierTypes ») : en-tête « <type> · <dépositaire> », statut « depuis le
// … », étiquettes ; onglets de sections avec icônes et comptes ; chiffres clés et bloc du modèle ;
// aperçus (texte, amendements, scrutins clés, acteurs) et sections complètes. Chaque valeur que le
// contrat ne fournit pas garde sa marque visible (« [n] », « [jj/mm] », « [à calculer] »).

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { ActeurDossier, AmendementResume, DeviationParcours, FicheDossier, ScrutinResume, SortAmendement } from '@/core';
import { useAller } from '../../../navigation';
import { capitale, date, dateCourte, jourMois, nombre } from '../../format';
import { usePalette } from '../../theme/ThemeProvider';
import { fonts, radius, space } from '../../theme/tokens';
import { Action, Label, Puce, T, TitreSection } from '../base';
import { aSynthese } from '../commun/statuts';
import { SuivreDossier } from '../commun/Suivre';
import { SyntheseVue } from '../commun/SyntheseVue';
import { Icone } from '../Icone';
import { Apparition, Appui, BarreQuiPousse } from '../mouvement';
import { Pagination } from './blocs';
import {
  chronologieAmendements,
  chiffreCle,
  chiffresCles,
  comptesArticles,
  comptesEtape,
  compteSort,
  cycleAmendement,
  datesAmendement,
  datesEtape,
  DATE_INCONNUE,
  estVoteCle,
  etiquettesDossier,
  ICONE_SECTION,
  iconeDeviation,
  iconeType,
  INCONNU,
  LIBELLE_SECTION,
  libelleEnAttente,
  MAJORITE_CENSURE,
  SIEGES_AN,
  sortScrutin,
  statutDossier,
  titreProposition,
  typeDossier,
  versionsComparees,
  type SectionDossier,
} from './parcoursVue';
import { CHAMBRE_COURTE, ETAT_ARTICLE, nomAuteur, nomOrateur, personneAuteur, personneOrateur, SORT } from './presentation';

// ---------- Petites briques ----------

/** Étiquette rectangulaire (statut, 49.3, état d'un article). */
export function Marque({ children, signal = false, fort = false }: { children: ReactNode; signal?: boolean; fort?: boolean }) {
  const p = usePalette();
  return (
    <View
      style={[
        styles.marque,
        fort && styles.marqueForte,
        { borderColor: signal ? p.signal : fort ? p.inkSoft : p.lineStrong, backgroundColor: fort ? p.surfaceSoft : 'transparent' },
      ]}
    >
      <T variant="caption" couleur={signal ? p.signal : p.ink} style={[styles.gras, fort && { fontSize: 15, lineHeight: 20 }]}>
        {children}
      </T>
    </View>
  );
}

/** Tuile d'un chiffre clé (grand chiffre mono, libellé). */
function Tuile({ valeur, libelle }: { valeur: string; libelle: string }) {
  const p = usePalette();
  return (
    <View style={[styles.tuile, { backgroundColor: p.surfaceRaised }]}>
      <T variant="dataLarge" style={styles.tuileValeur}>{valeur}</T>
      <T variant="caption" ton="inkSoft">{libelle}</T>
    </View>
  );
}

export function GrilleChiffres({ chiffres, colonnes = 2 }: { chiffres: { valeur: string; libelle: string }[]; colonnes?: number }) {
  return (
    <View style={styles.grille}>
      {chiffres.map((c, i) => (
        <View key={`${c.libelle}-${i}`} style={{ width: `${100 / colonnes}%`, padding: 4 }}>
          <Tuile valeur={c.valeur} libelle={c.libelle} />
        </View>
      ))}
    </View>
  );
}

// ---------- En-tête ----------

export function EnteteDossier({ fiche: f }: { fiche: FicheDossier }) {
  const p = usePalette();
  const aller = useAller();
  const e = f.entete;
  const auteur = personneAuteur(e.auteur);
  const statut = statutDossier(f);
  const etiquettes = etiquettesDossier(f);
  return (
    <View style={styles.entete}>
      <View style={styles.ligneType}>
        <Icone nom={iconeType(f.parcours?.modele, e.type)} couleur={p.inkMuted} taille={16} />
        <T variant="label" ton="inkMuted" style={{ flexShrink: 1 }}>
          {`${e.type} · `}
          <T
            variant="label"
            ton={auteur ? 'signal' : 'inkMuted'}
            accessibilityRole={auteur ? 'link' : undefined}
            onPress={auteur ? () => aller.personne(auteur.id) : undefined}
            style={auteur ? { textDecorationLine: 'underline' } : undefined}
          >
            {nomAuteur(e.auteur)}
          </T>
          {e.cosignataires ? ` et ${nombre(e.cosignataires)} cosignataires` : ''}
        </T>
      </View>
      <T variant="screen" accessibilityRole="header">{e.titreEnClair ?? e.titre}</T>
      <View style={styles.ligneStatut}>
        <Marque fort>{statut.libelle}</Marque>
        <T variant="small" ton="inkSoft" style={{ flexShrink: 1 }}>{statut.depuis}</T>
        <View style={{ marginLeft: 'auto' }}>
          <SuivreDossier id={e.id} titre={e.titre} />
        </View>
      </View>
      {etiquettes.length > 0 && (
        <View style={styles.etiquettes}>
          {etiquettes.map((t) => (
            <Marque key={t.libelle} signal={t.signal}>{t.libelle}</Marque>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------- Onglets ----------

/** Compte affiché sur l'onglet d'une section (articles, amendements, votes publics), null sinon. */
function compteSection(s: SectionDossier, f: FicheDossier): string | null {
  if (s === 'texte') return f.articles.length ? nombre(f.articles.length) : null;
  if (s === 'amendements') return f.amendements.liste.total !== null ? nombre(f.amendements.liste.total) : null;
  if (s === 'scrutins') return nombre(f.scrutins.length);
  return null;
}

export function OngletsDossier({ fiche, valeur, onChange }: { fiche: FicheDossier; valeur: SectionDossier; onChange(s: SectionDossier): void }) {
  const p = usePalette();
  const sections = typeDossier(fiche.parcours?.modele).sections;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel="Sections du dossier"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 6 }}
    >
      {sections.map((s) => {
        const actif = s === valeur;
        const compte = compteSection(s, fiche);
        const encre = actif ? p.surface : p.inkSoft;
        return (
          <Appui
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={`${LIBELLE_SECTION[s]}${compte ? `, ${compte}` : ''}`}
            onPress={() => onChange(s)}
            style={[styles.onglet, actif ? { backgroundColor: p.ink, borderColor: p.ink } : { borderColor: p.lineFaint }]}
          >
            <Icone nom={ICONE_SECTION[s]} couleur={encre} taille={14} />
            <T variant="label" couleur={actif ? p.surface : p.inkSoft} style={{ fontSize: 15 }}>{LIBELLE_SECTION[s]}</T>
            {compte && <T variant="data" couleur={actif ? p.surface : p.inkMuted}>{compte}</T>}
          </Appui>
        );
      })}
    </ScrollView>
  );
}

// ---------- Aperçu : chiffres, proposition, bloc du modèle ----------

export function ChiffresEtProposition({ fiche: f }: { fiche: FicheDossier }) {
  const p = usePalette();
  const type = typeDossier(f.parcours?.modele);
  return (
    <>
      <Apparition rang={0}>
        <GrilleChiffres chiffres={chiffresCles(f)} />
      </Apparition>
      {type.bloc && (
        <Apparition rang={1}>
          <View style={[styles.bloc, { backgroundColor: p.surfaceRaised }]}>
            <T variant="small" style={styles.gras}>{type.bloc.titre}</T>
            <T variant="small" ton="inkSoft">{type.bloc.publie ? type.bloc.texte : `${type.bloc.texte} : non publié dans les données chargées`}</T>
          </View>
        </Apparition>
      )}
      <Apparition rang={2} style={{ gap: space[2] }}>
        <TitreSection>{titreProposition(f)}</TitreSection>
        <SyntheseVue synthese={f.entete.resumeEnClair} titre="En clair" />
      </Apparition>
    </>
  );
}

/** Section que le contrat ne fournit pas encore pour ce type (soutiens, auditions, acte européen…). */
export function SectionNonPubliee({ section }: { section: SectionDossier }) {
  const p = usePalette();
  return (
    <View style={styles.section}>
      <TitreSection>{LIBELLE_SECTION[section]}</TitreSection>
      <View style={[styles.exemple, { borderColor: p.lineStrong }]}>
        <T ton="inkMuted">{`${LIBELLE_SECTION[section]} : non publié dans les données chargées.`}</T>
      </View>
    </View>
  );
}

// ---------- Texte ----------

export function ApercuTexte({ fiche: f, onTout }: { fiche: FicheDossier; onTout(): void }) {
  const p = usePalette();
  const v = versionsComparees(f);
  const n = comptesArticles(f);
  return (
    <View style={styles.section}>
      <TitreSection action={<Action onPress={onTout}>Comparer →</Action>}>Texte</TitreSection>
      <T variant="small" ton="inkSoft">{`Texte déposé (${v.depose}) comparé à : ${v.etape.titre.toLowerCase()}, ${v.etape.detail}.`}</T>
      <View style={[styles.exemple, { borderColor: p.lineStrong }]}>
        <LigneCompte valeur={`+ ${n.ajoutes}`} couleur={p.votePour} libelle="articles ajoutés" />
        <LigneCompte valeur={`− ${n.supprimes}`} couleur={p.voteContre} libelle="articles supprimés" />
        <LigneCompte valeur={n.modifies} couleur={p.ink} libelle="articles modifiés" />
      </View>
    </View>
  );
}

function LigneCompte({ valeur, couleur, libelle }: { valeur: string; couleur: string; libelle: string }) {
  return (
    <View style={styles.ligneCompte}>
      <T variant="data" couleur={couleur} style={{ fontSize: 15, lineHeight: 20, minWidth: 56 }}>{valeur}</T>
      <T style={{ fontSize: 15, lineHeight: 20 }}>{libelle}</T>
    </View>
  );
}

export function SectionTexte({ fiche: f }: { fiche: FicheDossier }) {
  const p = usePalette();
  const aller = useAller();
  const v = versionsComparees(f);
  const n = comptesArticles(f);
  const adoptes = chiffreCle({ cle: 'amendements_adoptes' }, f);
  const arret = f.parcours?.deviations.find((d) => d.effet === 'termine');
  return (
    <View style={styles.section}>
      <View style={{ gap: space[1] }}>
        <T variant="label" ton="inkMuted">{`Texte · ${f.entete.type.toLowerCase()}`}</T>
        <T variant="title" accessibilityRole="header">Ce qui a changé depuis le dépôt</T>
      </View>
      <View style={styles.versions}>
        <View style={[styles.version, { backgroundColor: p.surfaceRaised }]}>
          <T variant="small" style={styles.gras}>Texte déposé</T>
          <T variant="data" ton="inkMuted">{v.depose}</T>
        </View>
        <T ton="inkMuted" aria-hidden>→</T>
        <View style={[styles.version, { backgroundColor: p.surfaceRaised, borderWidth: 1, borderColor: p.signal }]}>
          <T variant="small" style={styles.gras}>{v.etape.titre}</T>
          <T variant="data" ton="inkMuted">{v.etape.detail}</T>
        </View>
      </View>
      <T variant="small" ton="inkSoft">
        {`Les versions intermédiaires ne sont pas comparées (le texte en a connu ${nombre(f.versionsDuTexte)}).`}
        {arret ? ` ${arret.libelle}${arret.debut ? ` le ${date(arret.debut)}` : ''} : la dernière version adoptée est celle de la dernière étape faite.` : ''}
      </T>
      <GrilleChiffres
        colonnes={3}
        chiffres={[
          { valeur: n.total, libelle: 'articles' },
          { valeur: n.modifies, libelle: 'modifiés' },
          { valeur: adoptes.valeur, libelle: 'amendements adoptés' },
        ]}
      />
      {f.articles.length === 0 && <T ton="inkMuted">{`Articles : [à calculer], aucun article chargé pour ce dossier.`}</T>}
      {f.articles.map((a, i) => {
        const changement = f.ceQuiAChange.find((c) => c.article.id === a.article.id);
        return (
          <Apparition key={a.article.id} rang={Math.min(i, 4)} style={[styles.article, { borderTopColor: p.line }]}>
            <View style={styles.entre}>
              <T variant="heading">{`Article ${a.article.numero}`}</T>
              <Marque>{`${ETAT_ARTICLE[a.etat]}${a.ajoutePar ? ` · ${CHAMBRE_COURTE[a.ajoutePar]}` : ''}`}</Marque>
            </View>
            <T variant="small" ton="inkSoft">{a.intitule ?? 'Intitulé non publié'}</T>
            {changement && aSynthese(changement.resume) && <SyntheseVue synthese={changement.resume} titre="Ce qui a changé" />}
            {a.etat !== 'inchange' && (
              <Action onPress={() => aller.article(a.article.id, { comparaison: 'depose' })}>Comparer au texte déposé →</Action>
            )}
          </Apparition>
        );
      })}
    </View>
  );
}

// ---------- Amendements ----------

/** Filtres de la liste, au pluriel (« Adoptés 402 »). */
const SORTS_FILTRES: [SortAmendement, string][] = [
  ['adopte', 'Adoptés'],
  ['rejete', 'Rejetés'],
  ['retire', 'Retirés'],
  ['tombe', 'Tombés'],
  ['non_soutenu', 'Non soutenus'],
  ['irrecevable', 'Irrecevables'],
];

export function ApercuAmendements({ fiche: f, onTout }: { fiche: FicheDossier; onTout(): void }) {
  const total = f.amendements.liste.total;
  return (
    <View style={styles.section}>
      <TitreSection action={<Action onPress={onTout}>{total !== null ? `Les ${nombre(total)} →` : 'Tous →'}</Action>}>Amendements</TitreSection>
      {f.amendements.liste.elements.length === 0 && <T ton="inkMuted">Aucun amendement chargé pour ce dossier.</T>}
      {f.amendements.liste.elements.slice(0, 3).map((a) => (
        <LigneAmendementCourte key={a.id} amendement={a} />
      ))}
    </View>
  );
}

function LigneAmendementCourte({ amendement: a }: { amendement: AmendementResume }) {
  const p = usePalette();
  const aller = useAller();
  return (
    <Appui
      accessibilityRole="link"
      accessibilityLabel={`Amendement ${a.numero}, ${cycleAmendement(a.sort)}`}
      onPress={() => aller.amendement(a.id)}
      style={[styles.amCourt, { borderTopColor: p.line }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="small" style={styles.gras}>{`n° ${a.numero} · ${a.division ?? (a.article ? `article ${a.article.numero}` : 'article [—]')}`}</T>
        <T variant="caption" ton="inkMuted">{`${a.etape?.libelle ?? '[étape]'} · ${nomAuteur(a.auteur)}`}</T>
      </View>
      <Marque fort={a.sort === 'adopte'}>{cycleAmendement(a.sort)}</Marque>
    </Appui>
  );
}

export function SectionAmendements({
  fiche: f,
  sort,
  onSort,
  onPage,
  onDeviation,
}: {
  fiche: FicheDossier;
  sort: SortAmendement | null;
  onSort(s: SortAmendement | null): void;
  onPage(page: number): void;
  onDeviation(d: DeviationParcours): void;
}) {
  const p = usePalette();
  const deposes = chiffreCle({ cle: 'amendements_deposes' }, f).valeur;
  const adoptes = chiffreCle({ cle: 'amendements_adoptes' }, f).valeur;
  const { etapes, nAurontPasLieu, sansEtape } = chronologieAmendements(f);
  return (
    <View style={styles.section}>
      <View style={{ gap: space[1] }}>
        <T variant="label" ton="inkMuted">Amendements · depuis le dépôt</T>
        <T variant="title" accessibilityRole="header">{`${deposes} amendements, ${adoptes} adoptés`}</T>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Puce actif={sort === null} onPress={() => onSort(null)}>{`Tous ${deposes}`}</Puce>
        {SORTS_FILTRES.map(([s, libelle]) => (
          <Puce key={s} actif={sort === s} onPress={() => onSort(s)}>
            {`${libelle} ${f.amendements.parSort ? compteSort(f, s) : s === 'adopte' ? adoptes : INCONNU}`}
          </Puce>
        ))}
      </ScrollView>
      {sort && <T variant="small" ton="inkMuted">{`Filtre : ${SORT[sort].toLowerCase()} · page chargée seulement.`}</T>}

      <View>
        {etapes.map((e, i) => {
          const courante = e.cas.courante || e.cas.etat === 'en_cours';
          const derniere = i === etapes.length - 1 && !nAurontPasLieu.length;
          return (
            <View key={e.cas.cle} style={styles.et}>
              <View style={styles.etColonne}>
                <View style={[styles.etPoint, { backgroundColor: courante || e.arret ? p.signal : e.cas.etat === 'a_venir' ? 'transparent' : p.inkSoft, borderColor: p.lineStrong, borderWidth: e.cas.etat === 'a_venir' ? 1.5 : 0 }]} />
                {!derniere && <View style={[styles.etTrait, { backgroundColor: p.lineFaint }]} />}
              </View>
              <View style={styles.etCorps}>
                <View style={styles.entreBase}>
                  <T variant="heading" style={{ flex: 1 }}>{e.cas.libelle}</T>
                  <T variant="data" ton="inkMuted">{datesEtape(e.cas)}</T>
                </View>
                {e.cas.cle === 'depot' && !e.stat && <T variant="small" ton="inkSoft">{`Texte déposé${f.articles.length ? ` · ${nombre(f.articles.length)} articles suivis` : ''}`}</T>}
                {e.stat && (
                  <View style={styles.comptes}>
                    {comptesEtape(e, f.entete.etat).map((c) => (
                      <Compte key={c.libelle} n={c.n} libelle={c.libelle} />
                    ))}
                  </View>
                )}
                {e.amendements.map((a) => (
                  <CarteAmendement key={a.id} amendement={a} />
                ))}
                {e.evenements.map((d, j) => (
                  <Appui
                    key={`${d.cle}-${j}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir l’événement : ${d.libelle}`}
                    onPress={() => onDeviation(d)}
                    style={[styles.evenement, { borderColor: p.signal }]}
                  >
                    <Icone nom={iconeDeviation(d)} couleur={p.signalHover} taille={16} />
                    <T variant="small" style={[styles.gras, { flex: 1 }]}>{`${d.debut ? jourMois(d.debut) : DATE_INCONNUE} · ${d.libelle}`}</T>
                    <T couleur={p.signalHover}>›</T>
                  </Appui>
                ))}
                {e.arret && (
                  <View style={[styles.nonDebattus, { borderColor: p.lineStrong }]}>
                    <T variant="small" ton="inkSoft">{phraseArret(e, f)}</T>
                  </View>
                )}
              </View>
            </View>
          );
        })}
        {nAurontPasLieu.length > 0 && (
          <View style={[styles.et, { opacity: 0.6 }]}>
            <View style={styles.etColonne}>
              <View style={[styles.etPoint, { borderColor: p.lineStrong, borderWidth: 1.5, borderStyle: 'dashed' }]} />
            </View>
            <View style={[styles.etCorps, { paddingBottom: 0 }]}>
              <T variant="heading" ton="inkMuted">{nAurontPasLieu.join(', ')}</T>
              <T variant="small" ton="inkSoft">N’auront pas lieu</T>
            </View>
          </View>
        )}
      </View>
      {sansEtape.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Label>Étape non publiée</Label>
          {sansEtape.map((a) => (
            <CarteAmendement key={a.id} amendement={a} />
          ))}
        </View>
      )}
      {f.amendements.liste.elements.length === 0 && <T ton="inkMuted">Aucun amendement pour ce filtre.</T>}
      <Pagination {...f.amendements.liste} onPage={onPage} />
    </View>
  );
}

/** Sous l'étape où le parcours s'arrête : combien d'amendements restaient en attente, et ce qu'on peut en dire. */
function phraseArret(e: ReturnType<typeof chronologieAmendements>['etapes'][number], f: FicheDossier): string {
  const n = e.stat?.parSort ? nombre(e.stat.parSort.en_attente) : INCONNU;
  const libelle = libelleEnAttente(e, f.entete.etat);
  return libelle === 'non débattus'
    ? `${n} amendements non débattus : le parcours s’est arrêté avant leur examen.`
    : `${n} amendements ${libelle} : le parcours s’est arrêté à cette étape.`;
}

function Compte({ n, libelle }: { n: string; libelle: string }) {
  return (
    <T variant="caption" ton="inkMuted">
      <T variant="data" ton="ink">{n}</T>
      {` ${libelle}`}
    </T>
  );
}

function CarteAmendement({ amendement: a }: { amendement: AmendementResume }) {
  const p = usePalette();
  const aller = useAller();
  const personne = personneAuteur(a.auteur);
  const couleur = personne?.groupe?.couleur ?? p.lineStrong;
  const dates = datesAmendement(a);
  return (
    <Appui
      accessibilityRole="link"
      accessibilityLabel={`Amendement ${a.numero}, ${cycleAmendement(a.sort)}`}
      onPress={() => aller.amendement(a.id)}
      style={[styles.am, { backgroundColor: p.surfaceRaised }]}
    >
      <View style={styles.entreHaut}>
        <T variant="small" style={[styles.gras, { flex: 1 }]}>{`n° ${a.numero} · ${a.objet ?? a.division ?? '[titre en clair]'}`}</T>
        <Marque fort={a.sort === 'adopte'}>{cycleAmendement(a.sort)}</Marque>
      </View>
      <View style={styles.rangee}>
        <View style={[styles.pastille, { backgroundColor: couleur }]} />
        <T variant="caption" ton="inkMuted">{`${nomAuteur(a.auteur)}${personne?.groupe ? ` (${personne.groupe.abrege})` : ''}${a.cosignataires ? ` + ${a.cosignataires}` : ''}`}</T>
      </View>
      <View style={styles.cycle} accessibilityLabel={`${capitale(dates.depot)}, puis ${dates.sort}`}>
        <View style={[styles.cyclePoint, { backgroundColor: p.inkSoft }]} />
        <T variant="data" ton="inkMuted" style={styles.cycleTexte}>{dates.depot}</T>
        <View style={[styles.cycleTrait, { backgroundColor: p.lineFaint }]} />
        <View style={[styles.cyclePoint, { backgroundColor: p.signal }]} />
        <T variant="data" ton="inkMuted" style={styles.cycleTexte}>{dates.sort}</T>
      </View>
    </Appui>
  );
}

// ---------- Scrutins clés ----------

export function ScrutinsCles({ fiche: f, onTout, complet = false }: { fiche: FicheDossier; onTout?(): void; complet?: boolean }) {
  const cles = f.scrutins.filter(estVoteCle);
  const autres = f.scrutins.filter((s) => !estVoteCle(s));
  const montres = complet ? cles : cles.slice(0, 3);
  return (
    <View style={styles.section}>
      <TitreSection action={onTout && f.scrutins.length > 0 ? <Action onPress={onTout}>{`Les ${nombre(f.scrutins.length)} votes →`}</Action> : undefined}>
        Scrutins clés
      </TitreSection>
      <T variant="caption" ton="inkMuted">Un vote clé conclut seul son étape : ensemble du texte, motion de censure.</T>
      {cles.length === 0 && <T ton="inkMuted">Aucun vote clé publié pour l’instant.</T>}
      {montres.map((s) => (
        <CarteVoteCle key={s.id} scrutin={s} />
      ))}
      {complet && autres.length > 0 && (
        <View style={{ gap: space[2], paddingTop: space[2] }}>
          <Label>{`Autres votes publics (${nombre(autres.length)})`}</Label>
          {autres.map((s) => (
            <CarteVoteCle key={s.id} scrutin={s} />
          ))}
        </View>
      )}
    </View>
  );
}

export function CarteVoteCle({ scrutin: s }: { scrutin: ScrutinResume }) {
  const p = usePalette();
  const aller = useAller();
  const censure = s.nature === 'motion_censure';
  return (
    <Appui accessibilityRole="link" accessibilityLabel={`Scrutin n° ${s.numero}, ${sortScrutin(s)}`} onPress={() => aller.scrutin(s.id)} style={[styles.vote, { borderColor: p.line }]}>
      <View style={styles.entreBase}>
        <T variant="caption" ton="inkMuted" style={{ flex: 1 }}>{`${CHAMBRE_COURTE[s.chambre]} · ${s.etape?.libelle ?? '[étape]'} · ${dateCourte(s.date)}`}</T>
        <T variant="caption" style={styles.gras}>{sortScrutin(s)}</T>
      </View>
      <T variant="heading" style={{ fontSize: 16, lineHeight: 22 }}>{s.enClair ?? s.intitule}</T>
      {censure ? (
        <>
          <JaugeCensure pour={s.decompte.pour} />
          <T variant="data" ton="inkMuted">{`${nombre(s.decompte.pour)} voix · ${MAJORITE_CENSURE} nécessaires`}</T>
        </>
      ) : (
        <T variant="data" ton="inkMuted">
          <T variant="data" couleur={p.votePour}>{`+ ${nombre(s.decompte.pour)} pour`}</T>
          {'  '}
          <T variant="data" couleur={p.voteContre}>{`− ${nombre(s.decompte.contre)} contre`}</T>
        </T>
      )}
    </Appui>
  );
}

/** Voix pour la censure sur les 577 sièges, repère à la majorité absolue (289). */
export function JaugeCensure({ pour }: { pour: number }) {
  const p = usePalette();
  return (
    <View style={[styles.jauge, { backgroundColor: p.surfaceSunken }]} accessibilityRole="image" accessibilityLabel={`${pour} voix pour, ${MAJORITE_CENSURE} nécessaires`}>
      <BarreQuiPousse fraction={Math.min(1, pour / SIEGES_AN)} couleur={p.votePour} />
      <View style={[styles.repere, { left: `${(MAJORITE_CENSURE / SIEGES_AN) * 100}%`, backgroundColor: p.ink }]} />
    </View>
  );
}

// ---------- Acteurs ----------

export function ApercuActeurs({ fiche: f, onTout }: { fiche: FicheDossier; onTout(): void }) {
  const tous = f.acteurs.flatMap((g) => g.acteurs);
  const restants = f.acteurs.reduce((s, g) => s + g.total, 0) - Math.min(5, tous.length);
  return (
    <View style={styles.section}>
      <TitreSection>Acteurs</TitreSection>
      {tous.length === 0 && <T ton="inkMuted">Aucun acteur publié pour ce dossier.</T>}
      {tous.slice(0, 5).map((a, i) => (
        <LigneActeur key={i} acteur={a} />
      ))}
      {restants > 0 && <Action onPress={onTout}>{`${nombre(restants)} autres acteurs →`}</Action>}
    </View>
  );
}

export function SectionActeurs({ fiche: f, titre }: { fiche: FicheDossier; titre?: string }) {
  return (
    <View style={styles.section}>
      {titre && <TitreSection>{titre}</TitreSection>}
      {f.acteurs.length === 0 && <T ton="inkMuted">Aucun acteur publié pour ce dossier.</T>}
      {f.acteurs.map((g) => (
        <View key={g.role} style={{ gap: 0 }}>
          <Label style={{ paddingBottom: space[1] }}>{g.libelle}</Label>
          {g.acteurs.map((a, i) => (
            <LigneActeur key={i} acteur={a} />
          ))}
          {g.total > g.acteurs.length && <T variant="caption" ton="inkMuted">{`et ${nombre(g.total - g.acteurs.length)} autres`}</T>}
        </View>
      ))}
    </View>
  );
}

/** Une personne reliée ouvre sa fiche (pastille de son groupe) ; un nom publié reste du texte. */
export function LigneActeur({ acteur: a }: { acteur: ActeurDossier }) {
  const p = usePalette();
  const aller = useAller();
  const personne = personneOrateur(a.qui);
  const couleur = personne?.groupe?.couleur ?? p.lineStrong;
  const precisions = [a.role, a.qui.qualite, a.qui.type === 'nom_publie' ? 'nom publié, aucune fiche reliée' : null].filter(Boolean).join(' · ');
  const contenu = (
    <>
      <View style={[styles.pastilleActeur, { backgroundColor: couleur }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="heading" style={{ fontSize: 16, lineHeight: 22 }}>{nomOrateur(a.qui)}</T>
        <T variant="small" ton="inkSoft">{precisions}</T>
      </View>
      {a.activite && <T variant="data" ton="inkMuted" style={{ textAlign: 'right' }}>{`${typeof a.activite.valeur === 'number' ? nombre(a.activite.valeur) : a.activite.valeur} ${a.activite.libelle.toLowerCase()}`}</T>}
    </>
  );
  if (!personne) return <View style={[styles.acteur, { borderTopColor: p.line }]}>{contenu}</View>;
  return (
    <Appui accessibilityRole="link" accessibilityLabel={nomOrateur(a.qui)} onPress={() => aller.personne(personne.id)} style={[styles.acteur, { borderTopColor: p.line }]}>
      {contenu}
    </Appui>
  );
}

const styles = StyleSheet.create({
  gras: { fontFamily: fonts.sansSemiBold },
  marque: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  marqueForte: { paddingHorizontal: 12, paddingVertical: 5 },
  tuile: { gap: space[1], padding: space[3], borderRadius: radius.lg, minHeight: 84 },
  tuileValeur: { fontSize: 24, lineHeight: 28 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  entete: { gap: 10 },
  ligneType: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ligneStatut: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  etiquettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  onglet: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  bloc: { gap: 2, paddingVertical: space[3], paddingHorizontal: 14, borderRadius: radius.lg },
  section: { gap: space[3] },
  exemple: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: space[3], paddingHorizontal: 14, gap: space[2] },
  ligneCompte: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  versions: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  version: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.lg },
  article: { gap: space[2], paddingVertical: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  entreBase: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2] },
  entreHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2] },
  amCourt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  et: { flexDirection: 'row', gap: space[3] },
  etColonne: { width: 20, alignItems: 'center' },
  etPoint: { width: 12, height: 12, borderRadius: radius.full, marginTop: 6 },
  etTrait: { flex: 1, width: 2 },
  etCorps: { flex: 1, minWidth: 0, gap: 6, paddingBottom: space[4] },
  comptes: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
  am: { gap: 6, paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.lg },
  rangee: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pastille: { width: 8, height: 8, borderRadius: radius.full },
  cycle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  cyclePoint: { width: 6, height: 6, borderRadius: radius.full },
  cycleTrait: { width: 14, height: 1 },
  cycleTexte: { fontSize: 11, lineHeight: 15 },
  evenement: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[3], borderRadius: radius.lg, borderWidth: 1 },
  nonDebattus: { paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  vote: { gap: 6, paddingVertical: space[3], paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1 },
  jauge: { height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  repere: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  acteur: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  pastilleActeur: { width: 10, height: 10, borderRadius: radius.full },
});
