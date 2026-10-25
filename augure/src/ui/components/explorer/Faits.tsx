// Un fait de l'Explorer, selon son type (canevas v4, Explorer.dc.html) : intervention (citation,
// orateur, compte rendu), amendement, scrutin (barre pour / contre / abstention, position du filtre),
// vote à main levée (pastille en pointillé : aucun vote individuel), question, intérêt et déclaration
// (style à part, badge HATVP, statut du rapprochement), personne. Toucher l'objet d'un fait ajoute
// son filtre (`filtrer`) ; la fiche complète reste à un geste (« Fiche »).

import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import type { CleFiltre, ContexteFait, Fait, GroupeRef, Position } from '@/core';
import { useAller } from '../../../navigation';
import { date } from '../../format';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, Pastille, Repartition, T } from '../base';
import { LienStatut } from '../commun/LienStatut';
import { Source } from '../commun/Source';
import { adresseAncre, CHAMBRE_COURTE, nomAuteur, sortAmendement } from '../dossiers/presentation';

export type Filtrer = (cle: CleFiltre, id: string) => void;

/** Où : étape, article, date (par lien explicite seulement). */
export const ouFait = (c: ContexteFait, sansArticle = false) =>
  [c.etape?.libelle, !sansArticle && c.article ? `Art. ${c.article.numero}` : null, c.date ? date(c.date) : null].filter(Boolean).join(' · ');

function Cadre({ children, transparence = false, contour = false }: { children: ReactNode; transparence?: boolean; contour?: boolean }) {
  const p = usePalette();
  const fond = transparence
    ? { backgroundColor: p.cautionSoft, borderWidth: 1, borderColor: p.cautionLine }
    : contour
      ? { borderWidth: 1, borderColor: p.line }
      : { backgroundColor: p.surfaceRaised };
  return <View style={[styles.cadre, fond]}>{children}</View>;
}

/** Nom touchable (ajoute un filtre), avec la pastille de son groupe. */
function Qui({ nom, groupe, onPress }: { nom: string; groupe: GroupeRef | null; onPress?: () => void }) {
  const contenu = (
    <View style={styles.qui}>
      {groupe && <Pastille couleur={groupe.couleur} taille={8} />}
      <T variant="label" ton="ink">
        {nom}
      </T>
    </View>
  );
  if (!onPress) return contenu;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Filtrer sur ${nom}`} onPress={onPress} hitSlop={10} style={styles.toucher}>
      {contenu}
    </Pressable>
  );
}

/** Lien vers le passage du compte rendu officiel (aucun si la source n'en publie pas). */
function LienCompteRendu({ url }: { url: string | null }) {
  const p = usePalette();
  if (!url) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Compte rendu (page officielle)"
      onPress={() => Linking.openURL(url)}
      style={[styles.lienSource, { borderColor: p.lineStrong }]}
    >
      <Label>Compte rendu ↗</Label>
    </Pressable>
  );
}

export function BadgeHatvp() {
  const p = usePalette();
  return (
    <View style={[styles.badge, { backgroundColor: p.cautionLine }]}>
      <T variant="caption" couleur={p.caution} style={{ fontWeight: '700' }}>
        HATVP
      </T>
    </View>
  );
}

const MARQUE: Record<Position, string> = { pour: 'Pour', contre: 'Contre', abstention: 'Abstention', non_votant: 'Non-votant', absent: 'Absent' };

/** Position du filtre (personne ou groupe) sur un scrutin public, telle que publiée. */
function MarqueVote({ fait }: { fait: Extract<Fait, { type: 'scrutin' }> }) {
  const p = usePalette();
  const d = fait.duFiltre;
  if (!d) return null;
  if (d.type === 'personne') {
    return (
      <View style={styles.marque}>
        <Pastille couleur={couleurVote(p, d.position)} taille={12} />
        <T variant="label" couleur={couleurVote(p, d.position)}>
          {MARQUE[d.position]}
          {d.parDelegation ? ' (par délégation)' : ''}
        </T>
        {d.contreSonGroupe && <Etiquette>contre son groupe</Etiquette>}
      </View>
    );
  }
  const exprimes = d.decompte.pour + d.decompte.contre + d.decompte.abstention;
  if (!d.ligne || !exprimes) return <Label>Pas de ligne majoritaire</Label>;
  const part = Math.round((d.decompte[d.ligne] / exprimes) * 100);
  return (
    <T variant="label" couleur={couleurVote(p, d.ligne)}>
      {`${MARQUE[d.ligne]} à ${part} %`}
    </T>
  );
}

export function Etiquette({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={[styles.etiquette, { borderColor: p.lineStrong }]}>
      <T variant="caption" ton="inkSoft">
        {children}
      </T>
    </View>
  );
}

/** Pastille en pointillé : vote à main levée, aucun vote individuel n'existe. */
export function PastilleMainLevee() {
  const p = usePalette();
  return <View accessibilityLabel="Vote à main levée" style={[styles.mainLevee, { borderColor: p.inkMuted }]} />;
}

export function CarteFait({ fait, filtrer, sansArticle = false }: { fait: Fait; filtrer: Filtrer; sansArticle?: boolean }) {
  const p = usePalette();
  const aller = useAller();
  switch (fait.type) {
    case 'intervention': {
      const o = fait.orateur;
      return (
        <Cadre>
          <T variant="text">{`« ${fait.extrait.replace(/^«\s*|\s*»$/g, '')}${fait.tronque ? ' …' : ''} »`}</T>
          <View style={styles.ligneMeta}>
            {o.type === 'personne' ? (
              <Qui nom={o.personne.nom} groupe={fait.groupe} onPress={() => filtrer('personne', o.personne.id)} />
            ) : (
              <Qui nom={`${o.nom} (nom publié)`} groupe={null} />
            )}
            {fait.groupe && <T variant="small" ton="inkSoft">{fait.groupe.libelle}</T>}
            <T variant="small" ton="inkMuted">
              {[fait.reunion.organe?.nom ?? CHAMBRE_COURTE[fait.reunion.chambre], ouFait(fait.contexte, sansArticle)].filter(Boolean).join(' · ')}
            </T>
          </View>
          <View style={styles.ligneMeta}>
            <LienCompteRendu url={adresseAncre(fait.compteRendu)} />
            <Source provenance={fait.compteRendu.provenance} compact />
          </View>
        </Cadre>
      );
    }
    case 'amendement': {
      const a = fait.amendement;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Amendement ${a.numero}, ${sortAmendement(a.sort)} : filtrer sur cet amendement`}
          onPress={() => filtrer('amendement', a.id)}
          style={({ pressed }) => [styles.cadre, { borderWidth: 1, borderColor: p.line }, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.entreDeux}>
            <T variant="data" ton="inkSoft">
              {a.numero}
            </T>
            <T variant="label" couleur={a.sort === 'adopte' ? p.votePour : a.sort === 'rejete' ? p.voteContre : p.voteAbstention}>
              {sortAmendement(a.sort)}
            </T>
          </View>
          <T variant="heading" ton={a.objet === null ? 'inkMuted' : 'ink'}>
            {a.objet ?? 'Pas de synthèse disponible'}
          </T>
          <T variant="small" ton="inkSoft">
            {[nomAuteur(a.auteur), ouFait(fait.contexte, sansArticle)].filter(Boolean).join(' · ')}
          </T>
        </Pressable>
      );
    }
    case 'scrutin': {
      const s = fait.scrutin;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Scrutin n° ${s.numero} : voir les groupes`}
          onPress={() => filtrer('scrutin', s.id)}
          style={({ pressed }) => [styles.ligneScrutin, { borderBottomColor: p.line }, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.colonne}>
            <T variant="heading">{s.enClair ?? s.intitule}</T>
            <T variant="caption" ton="inkMuted">
              {[`Scrutin n° ${s.numero}`, CHAMBRE_COURTE[s.chambre], s.etape?.libelle, date(s.date), s.sort].filter(Boolean).join(' · ')}
            </T>
            <Repartition decompte={s.decompte} />
          </View>
          <MarqueVote fait={fait} />
        </Pressable>
      );
    }
    case 'main_levee':
      return (
        <Cadre contour>
          <View style={styles.marque}>
            <PastilleMainLevee />
            <T variant="heading">{`Amendement ${fait.amendement.numero} · ${sortAmendement(fait.sort)}`}</T>
          </View>
          <T variant="small" ton="inkSoft">
            Vote à main levée : personne n’a de vote individuel enregistré.
          </T>
          <T variant="caption" ton="inkMuted">
            {ouFait(fait.contexte, sansArticle)}
          </T>
        </Cadre>
      );
    case 'question': {
      const q = fait.question;
      return (
        <Cadre contour>
          <Label>{[`Question n° ${q.numero}`, q.date ? date(q.date) : null].filter(Boolean).join(' · ')}</Label>
          <T variant="heading">{q.titre ?? q.rubrique ?? 'Question sans analyse publiée'}</T>
          <View style={styles.ligneMeta}>
            {fait.auteur && <Qui nom={fait.auteur.nom} groupe={fait.auteur.groupe} onPress={() => filtrer('personne', fait.auteur!.id)} />}
            <T variant="small" ton="inkSoft">
              {[q.ministere ? `Adressée au ${q.ministere}` : null, q.dateReponse ? `réponse le ${date(q.dateReponse)}` : 'sans réponse publiée'].filter(Boolean).join(' · ')}
            </T>
          </View>
          <Source provenance={q.provenance} compact />
        </Cadre>
      );
    }
    case 'interet': {
      const l = fait.lien;
      return (
        <Cadre transparence>
          <View style={styles.ligneMeta}>
            <BadgeHatvp />
            <T variant="label" couleur={p.inkQuote}>
              Lobbying déclaré
            </T>
          </View>
          <Pressable accessibilityRole="link" onPress={() => aller.representant(l.representant.id)} hitSlop={8} style={styles.toucher}>
            <T variant="heading">{l.representant.denomination}</T>
          </Pressable>
          <T>{`« ${l.action.objet} »`}</T>
          <T variant="caption" ton="inkMuted">
            {`Action déclarée du ${date(l.action.periode.debut)}${l.action.periode.fin ? ` au ${date(l.action.periode.fin)}` : ''} · auprès de : ${l.action.responsables.join(', ') || 'non précisé'}`}
          </T>
          <LienStatut
            lien={l.vers}
            libelle="Rapprochement"
            rendu={(c) => (
              <T variant="caption">
                {c.type === 'dossier' ? `Dossier : ${c.dossier.titre}` : c.type === 'amendement' ? `Amendement ${c.amendement.numero}` : `Article ${c.article.numero} · ${c.dossier.titre}`}
              </T>
            )}
          />
        </Cadre>
      );
    }
    case 'declaration': {
      const d = fait.declaration;
      return (
        <Cadre transparence>
          <View style={styles.ligneMeta}>
            <BadgeHatvp />
            <T variant="label" couleur={p.inkQuote}>
              {d.libelle}
            </T>
          </View>
          <Qui nom={fait.personne.nom} groupe={fait.personne.groupe} onPress={() => filtrer('personne', fait.personne.id)} />
          <T variant="small" ton="inkSoft">
            {[d.modificative ? 'Modificative' : null, d.datePublication ? `publiée le ${date(d.datePublication)}` : d.dateDepot ? `déposée le ${date(d.dateDepot)}` : null]
              .filter(Boolean)
              .join(' · ') || 'Telle que publiée par la HATVP'}
          </T>
          {d.url && (
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(d.url!)} hitSlop={8} style={styles.toucher}>
              <T variant="label" ton="ink" style={{ textDecorationLine: 'underline' }}>
                Voir la déclaration
              </T>
            </Pressable>
          )}
          <Source provenance={fait.provenance} compact />
        </Cadre>
      );
    }
    case 'personne': {
      const actes = [
        fait.interventions ? `${fait.interventions} intervention${fait.interventions > 1 ? 's' : ''}` : null,
        fait.amendements ? `${fait.amendements} amendement${fait.amendements > 1 ? 's' : ''}` : null,
        fait.votes ? `${fait.votes} vote${fait.votes > 1 ? 's' : ''}` : null,
      ].filter(Boolean);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${fait.personne.nom} : filtrer sur cette personne`}
          onPress={() => filtrer('personne', fait.personne.id)}
          style={({ pressed }) => [styles.lignePersonne, { borderBottomColor: p.line }, pressed && { opacity: 0.8 }]}
        >
          {fait.personne.groupe && <Pastille couleur={fait.personne.groupe.couleur} />}
          <View style={styles.colonne}>
            <T variant="heading">{fait.personne.nom}</T>
            <T variant="small" ton="inkSoft">
              {[fait.personne.fonction, actes.join(' · ') || 'Vote seulement'].filter(Boolean).join(' · ')}
            </T>
          </View>
          <T variant="section" ton="inkMuted" aria-hidden>
            ›
          </T>
        </Pressable>
      );
    }
  }
}

const styles = StyleSheet.create({
  cadre: { gap: space[2], paddingHorizontal: space[4], paddingVertical: 14, borderRadius: radius.lg },
  qui: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toucher: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  ligneMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2], rowGap: space[1] },
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  ligneScrutin: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: 10, borderBottomWidth: 1 },
  lignePersonne: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60, paddingVertical: space[2], borderBottomWidth: 1 },
  colonne: { flex: 1, gap: 3, minWidth: 0 },
  marque: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  lienSource: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6, borderWidth: 1, borderRadius: radius.sm },
  badge: { minHeight: 22, paddingHorizontal: space[2], borderRadius: 4, justifyContent: 'center' },
  etiquette: { paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  mainLevee: { width: 14, height: 14, borderRadius: radius.full, borderWidth: 2, borderStyle: 'dashed' },
});
