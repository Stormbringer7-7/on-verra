// Éléments partagés par les écrans Dossier : orateur (personne liée ou nom publié), extrait d'une
// intervention, origine d'un changement d'article, diff mot à mot, lignes d'amendement et de
// scrutin, rapprochements d'intérêts. Chaque élément montre sa source et le statut de ses liens.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AmendementResume, InterventionExtrait, LienInteret, Orateur, GroupeRef, OrigineModification, ScrutinResume, SegmentDiff } from '@/core';
import { useAller } from '../../../navigation';
import { date } from '../../format';
import { usePalette } from '../../theme/ThemeProvider';
import { space, type as typo } from '../../theme/tokens';
import { Label, Pastille, Repartition, T } from '../base';
import { LienStatut } from '../commun/LienStatut';
import { Source } from '../commun/Source';
import { Avertissement, LienExterne, Ligne } from './blocs';
import { adresseAncre, CHAMBRE_COURTE, nomAuteur, sortAmendement, titreOrigine } from './presentation';

// ---------- Qui parle ----------

/**
 * Orateur : une personne reliée de façon certaine ouvre sa fiche ; un nom publié (commission AN,
 * personne auditionnée) est affiché tel quel, jamais lié à une fiche.
 */
export function OrateurVue({ orateur, groupe }: { orateur: Orateur; groupe: GroupeRef | null }) {
  const p = usePalette();
  const aller = useAller();
  // Couleur du groupe au moment de l'intervention (une donnée), jamais une couleur propre.
  const couleur = groupe?.couleur ?? (orateur.type === 'personne' ? (orateur.personne.groupe?.couleur ?? null) : null);
  const precisions = [orateur.qualite, groupe?.libelle].filter(Boolean).join(' · ');
  return (
    <View style={styles.orateur}>
      {couleur ? <Pastille couleur={couleur} taille={8} /> : null}
      {orateur.type === 'personne' ? (
        <Pressable accessibilityRole="link" onPress={() => aller.personne(orateur.personne.id)} hitSlop={8}>
          <T variant="heading" style={{ textDecorationLine: 'underline', textDecorationColor: p.lineStrong }}>
            {orateur.personne.nom}
          </T>
        </Pressable>
      ) : (
        <T variant="heading">{orateur.nom}</T>
      )}
      {precisions ? <T variant="caption" ton="inkMuted">{precisions}</T> : null}
      {orateur.type === 'nom_publie' && <Label style={{ fontSize: 10 }}>Nom publié</Label>}
    </View>
  );
}

/** Extrait d'une intervention : « texte… », date, passage du compte rendu officiel. */
export function ExtraitVue({ extrait }: { extrait: InterventionExtrait }) {
  const p = usePalette();
  const texte = extrait.extrait.replace(/^«\s*|\s*»$/g, '');
  return (
    <View style={[styles.extrait, { borderBottomColor: p.line }]}>
      <OrateurVue orateur={extrait.orateur} groupe={extrait.groupe} />
      <T style={{ color: p.ink }}>{`« ${texte}${extrait.tronque ? ' …' : ''} »`}</T>
      <View style={styles.sources}>
        <LienExterne url={adresseAncre(extrait.compteRendu)}>
          {`Compte rendu${extrait.date ? ` · ${date(extrait.date)}` : ''}`}
        </LienExterne>
        <Source provenance={extrait.compteRendu.provenance} compact />
      </View>
    </View>
  );
}

// ---------- Changements d'article ----------

/**
 * Origine d'un changement. Le titre ne nomme un amendement que si l'attribution est vérifiée ;
 * une attribution en revue est montrée comme telle, avec ce qu'elle n'établit pas.
 */
export function OrigineVue({ origine }: { origine: OrigineModification | null }) {
  const aller = useAller();
  const rendu = (a: AmendementResume) => (
    <Pressable accessibilityRole="link" onPress={() => aller.amendement(a.id)} hitSlop={8}>
      <T>{`Amendement ${a.numero}${a.auteur ? ` · ${nomAuteur(a.auteur)}` : ''} · ${sortAmendement(a.sort)}`}</T>
    </Pressable>
  );
  if (origine?.type === 'amendement') {
    return <LienStatut lien={origine.amendement} rendu={rendu} libelle="Origine du changement" />;
  }
  if (origine?.type === 'non_etablie') {
    return <Avertissement>Origine non établie : aucune attribution certaine de ce changement à un amendement.</Avertissement>;
  }
  return <T ton="inkMuted">{titreOrigine(origine)}</T>;
}

/** Texte comparé mot à mot : ajouts soulignés sur fond, suppressions barrées. */
export function DiffTexte({ segments }: { segments: SegmentDiff[] }) {
  const p = usePalette();
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[typo.lead, { color: p.ink }]}>
        {segments.map((s, i) => (
          <Text
            key={i}
            accessibilityLabel={s.type === 'ajoute' ? `ajouté : ${s.texte}` : s.type === 'supprime' ? `supprimé : ${s.texte}` : undefined}
            style={
              s.type === 'ajoute'
                ? { backgroundColor: p.signalSoft, textDecorationLine: 'underline' }
                : s.type === 'supprime'
                  ? { color: p.inkMuted, textDecorationLine: 'line-through' }
                  : undefined
            }
          >
            {s.texte}
          </Text>
        ))}
      </Text>
      <View style={styles.legende}>
        <T variant="caption" style={{ backgroundColor: p.signalSoft, textDecorationLine: 'underline' }}>texte ajouté</T>
        <T variant="caption" ton="inkMuted" style={{ textDecorationLine: 'line-through' }}>texte supprimé</T>
      </View>
    </View>
  );
}

// ---------- Lignes ----------

export function LigneAmendement({ amendement: a }: { amendement: AmendementResume }) {
  const aller = useAller();
  const contexte = [a.numero, a.etape?.libelle, a.division ?? (a.article ? `Art. ${a.article.numero}` : null)].filter(Boolean).join(' · ');
  return (
    <Ligne onPress={() => aller.amendement(a.id)} accessibilityLabel={`Amendement ${a.numero}`}>
      <View style={styles.entreDeux}>
        <Label style={{ flexShrink: 1 }}>{contexte}</Label>
        <Label ton={a.sort === 'adopte' ? 'ink' : 'inkMuted'}>{sortAmendement(a.sort)}</Label>
      </View>
      <T variant="heading" ton={a.objet === null ? 'inkMuted' : 'ink'}>
        {a.objet ?? 'Pas de synthèse disponible'}
      </T>
      <T variant="caption" ton="inkMuted">
        {`${nomAuteur(a.auteur)}${a.cosignataires ? ` · ${a.cosignataires} cosignataires` : ''}`}
      </T>
    </Ligne>
  );
}

export function LigneScrutin({ scrutin: s }: { scrutin: ScrutinResume }) {
  const aller = useAller();
  return (
    <Ligne onPress={() => aller.scrutin(s.id)} accessibilityLabel={`Scrutin n° ${s.numero}`}>
      <View style={styles.entreDeux}>
        <Label style={{ flexShrink: 1 }}>{`${CHAMBRE_COURTE[s.chambre]} · ${date(s.date)} · n° ${s.numero}`}</Label>
        <Label ton={s.adopte ? 'ink' : 'inkMuted'}>{s.sort ?? (s.adopte === null ? 'Sort non publié' : s.adopte ? 'adopté' : 'rejeté')}</Label>
      </View>
      <T variant="heading">{s.enClair ?? s.intitule}</T>
      {s.enClair === null && <T variant="caption" ton="inkMuted">Pas de synthèse disponible · intitulé officiel</T>}
      <Repartition decompte={s.decompte} />
      <T variant="data" ton="inkMuted">{`+ ${s.decompte.pour}  − ${s.decompte.contre}  Ø ${s.decompte.abstention}`}</T>
    </Ligne>
  );
}

// ---------- Intérêts ----------

/**
 * Rapprochements lobbying : chacun avec son statut (vérifié si l'action cite le texte, à vérifier
 * sinon) ; une action déclarée n'établit ni rencontre, ni influence.
 */
export function ListeInterets({ interets }: { interets: LienInteret[] }) {
  const aller = useAller();
  if (!interets.length) return <T ton="inkMuted">Aucun rapprochement avec une action déclarée.</T>;
  return (
    <View>
      {interets.map((l, i) => (
        <Ligne key={`${l.representant.id}-${l.action.id}-${i}`}>
          <Pressable accessibilityRole="link" onPress={() => aller.representant(l.representant.id)} hitSlop={8}>
            <T variant="heading">{l.representant.denomination}</T>
          </Pressable>
          <T variant="caption" ton="inkMuted">
            {[
              l.representant.categorie,
              `action déclarée du ${date(l.action.periode.debut)}${l.action.periode.fin ? ` au ${date(l.action.periode.fin)}` : ''}`,
              l.actionsDeclarees !== null ? `${l.actionsDeclarees} actions déclarées sur l’année` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </T>
          <T>{`« ${l.action.objet} » · auprès de : ${l.action.responsables.join(', ') || 'non précisé'}`}</T>
          <LienStatut
            lien={l.vers}
            libelle="Rapprochement"
            rendu={(c) => (
              <T variant="caption">
                {c.type === 'dossier'
                  ? `Dossier : ${c.dossier.titre}`
                  : c.type === 'amendement'
                    ? `Amendement ${c.amendement.numero}`
                    : `Article ${c.article.numero} · ${c.dossier.titre}`}
              </T>
            )}
          />
        </Ligne>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  orateur: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2], rowGap: 2 },
  extrait: { gap: space[2], paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  legende: { flexDirection: 'row', gap: space[4] },
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
});
