// Fiche d'un dossier (canevas « Dossier ») : en-tête, onglets Parcours, Le texte, Amendements,
// Votes, Acteurs, Intérêts ; à côté, le dossier en chiffres et les sources officielles.
// Une seule query `ConsulterDossier` ; seule la liste d'amendements est filtrée (sort) et paginée.
// Une synthèse absente sur toute une liste (« Ce qui a changé », étapes) est dite une fois pour le
// bloc ; le titre officiel n'est rappelé que s'il diffère du titre affiché.

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConsulterDossier, type ActeurDossier, type FicheDossier, type SortAmendement } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, Pastille, Puce, T } from '../components/base';
import { BarreParcours } from '../components/commun/BarreParcours';
import { Signaler } from '../components/commun/Signaler';
import { SuivreDossier } from '../components/commun/Suivre';
import { Source } from '../components/commun/Source';
import { aSynthese, aucuneSynthese, PAS_DE_SYNTHESE } from '../components/commun/statuts';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { Avertissement, Carte, Colonnes, Ligne, ListeChiffres, OngletsDefilants, Pagination, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { LigneAmendement, LigneScrutin, ListeInterets } from '../components/dossiers/elements';
import {
  CHAMBRE_COURTE,
  ETAT_CASE,
  entreeDossier,
  etatDossier,
  faitsArticle,
  nomAuteur,
  nomOrateur,
  personneAuteur,
  personneOrateur,
  SORT,
} from '../components/dossiers/presentation';
import { Ecran, Retour } from '../components/Ecran';
import { date, titreOfficielDistinct } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

type Onglet = 'parcours' | 'texte' | 'amendements' | 'votes' | 'acteurs' | 'interets';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'parcours', libelle: 'Parcours' },
  { cle: 'texte', libelle: 'Le texte' },
  { cle: 'amendements', libelle: 'Amendements' },
  { cle: 'votes', libelle: 'Votes' },
  { cle: 'acteurs', libelle: 'Acteurs' },
  { cle: 'interets', libelle: 'Intérêts' },
];

export function Dossier() {
  const { id } = useRoute<RouteProp<Pages, 'Dossier'>>().params;
  const [onglet, setOnglet] = useState<Onglet>('parcours');
  const [sort, setSort] = useState<SortAmendement | null>(null);
  const [page, setPage] = useState(1);
  const fiche = useCommand(ConsulterDossier(entreeDossier(id, sort, page)));

  return (
    <Ecran largeur="pleine">
      <Retour />
      <Requete resultat={fiche}>
        {(f) => (
          <>
            <Entete fiche={f} />
            <OngletsDefilants<Onglet> options={ONGLETS} valeur={onglet} onChange={setOnglet} label="Sections du dossier" />
            <Colonnes
              principale={
                <>
                  {onglet === 'parcours' && <OngletParcours fiche={f} />}
                  {onglet === 'texte' && <OngletTexte fiche={f} />}
                  {onglet === 'amendements' && (
                    <OngletAmendements
                      fiche={f}
                      sort={sort}
                      onSort={(s) => {
                        setSort(s);
                        setPage(1);
                      }}
                      onPage={setPage}
                    />
                  )}
                  {onglet === 'votes' && <OngletVotes fiche={f} />}
                  {onglet === 'acteurs' && <OngletActeurs fiche={f} />}
                  {onglet === 'interets' && <OngletInterets fiche={f} />}
                </>
              }
              laterale={
                <>
                  <Carte>
                    <Label>Le dossier en chiffres</Label>
                    <ListeChiffres chiffres={f.chiffres} />
                  </Carte>
                  <View style={{ gap: space[2] }}>
                    <Label>Sources officielles</Label>
                    {f.sources.map((s) => (
                      <Source key={`${s.systeme}-${s.idNatif}`} provenance={s} />
                    ))}
                  </View>
                  <Signaler cible={{ type: 'dossier', id: f.entete.id }} ecran="Dossier" />
                </>
              }
            />
          </>
        )}
      </Requete>
    </Ecran>
  );
}

function Entete({ fiche: { entete: e } }: { fiche: FicheDossier }) {
  const p = usePalette();
  const aller = useAller();
  const auteur = personneAuteur(e.auteur);
  const titre = e.titreEnClair ?? e.titre;
  const debut = [titreOfficielDistinct(titre, e.titreOfficiel), e.dateDepot ? `déposé le ${date(e.dateDepot)}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={{ gap: space[2] }}>
      <View style={styles.ligneEtiquettes}>
        <Label>{e.type}</Label>
        {e.procedure === 'acceleree' && (
          <View style={[styles.badge, { borderColor: p.lineStrong }]}>
            <Label ton="ink" style={{ fontSize: 10 }}>Procédure accélérée</Label>
          </View>
        )}
      </View>
      <TitreEcran>{titre}</TitreEcran>
      <SuivreDossier id={e.id} titre={e.titre} />
      <T ton="inkMuted">
        {debut ? `${debut} · par ` : 'Par '}
        <T
          ton="ink"
          accessibilityRole={auteur ? 'link' : undefined}
          onPress={auteur ? () => aller.personne(auteur.id) : undefined}
          style={auteur ? { textDecorationLine: 'underline' } : undefined}
        >
          {nomAuteur(e.auteur)}
        </T>
        {e.cosignataires ? ` et ${e.cosignataires} cosignataires` : ''}
      </T>
      <View style={styles.ligneEtiquettes}>
        <Pastille couleur={e.etat === 'en_cours' ? p.signal : p.inkMuted} taille={8} />
        <Label couleur={e.etat === 'en_cours' ? p.signal : p.inkMuted}>{etatDossier(e.etat)}</Label>
      </View>
      <Action onPress={() => aller.faits('dossier', e.id)}>Tous les faits de ce dossier →</Action>
    </View>
  );
}

function OngletParcours({ fiche: f }: { fiche: FicheDossier }) {
  const p = usePalette();
  const aller = useAller();
  const navette = f.parcours?.procedure === 'normale';
  const changementsSansSynthese = aucuneSynthese(f.ceQuiAChange.map((c) => c.resume));
  const etapesSansSynthese = aucuneSynthese(f.etapes.map((e) => e.resume));
  return (
    <>
      <Carte>
        <SyntheseVue synthese={f.entete.resumeEnClair} titre="En clair" />
        <Label>Ce qui a changé depuis le dépôt</Label>
        {f.ceQuiAChange.length === 0 && <T ton="inkMuted">Aucun article modifié pour l’instant.</T>}
        {changementsSansSynthese && <T ton="inkMuted">{PAS_DE_SYNTHESE}</T>}
        {f.ceQuiAChange.map((c) => {
          const faits = faitsArticle(f.articles.find((a) => a.article.id === c.article.id));
          return (
            <Pressable
              key={c.article.id}
              accessibilityRole="link"
              accessibilityLabel={`Article ${c.article.numero}${faits ? `, ${faits}` : ''}`}
              onPress={() => aller.article(c.article.id)}
              style={styles.changement}
            >
              <View style={styles.entreDeux}>
                <Label ton="signal">{`Art. ${c.article.numero} →`}</Label>
                {faits && <Label>{faits}</Label>}
              </View>
              {aSynthese(c.resume) && <SyntheseVue synthese={c.resume} />}
            </Pressable>
          );
        })}
      </Carte>
      <Section titre="Parcours du texte">
        {f.parcours ? (
          <>
            <BarreParcours parcours={f.parcours} etat={f.entete.etat} onCase={(cle) => aller.etape(f.entete.id, cle)} />
            {f.parcours.prochaineEcheance && (
              <T variant="caption" ton="signal">
                {`Prochaine échéance : ${f.parcours.prochaineEcheance.libelle} · ${date(f.parcours.prochaineEcheance.date)}${f.parcours.prochaineEcheance.etat ? ` (${f.parcours.prochaineEcheance.etat})` : ''}`}
              </T>
            )}
            {navette && (
              <Avertissement>
                Navette : le texte passe d’une chambre à l’autre jusqu’à un accord. Après l’échec d’une CMP, le Gouvernement peut
                demander à l’Assemblée de statuer définitivement (Constitution, art. 45).
              </Avertissement>
            )}
          </>
        ) : (
          <Avertissement>Pas de barre de parcours pour ce type de texte : les étapes publiées sont listées ci-dessous.</Avertissement>
        )}
        {etapesSansSynthese && <SyntheseVue synthese={null} titre="En clair" />}
        {f.etapes.map((e) => (
          <Ligne key={e.cle} onPress={() => aller.etape(f.entete.id, e.cle)} accessibilityLabel={`Étape ${e.libelle}`}>
            <View style={styles.entreDeux}>
              <View style={styles.ligneEtiquettes}>
                <Pastille couleur={e.courante ? p.signal : e.etat === 'faite' ? p.ink : p.line} taille={8} />
                {e.lieu && <Label>{CHAMBRE_COURTE[e.lieu]}</Label>}
                <T variant="heading">{e.libelle}</T>
              </View>
              <Label>{e.debut ? date(e.debut) : ETAT_CASE[e.etat]}</Label>
            </View>
            {e.organe && <T variant="caption" ton="inkMuted">{e.organe.nom}</T>}
            {e.conclusion && <T variant="caption">{e.conclusion}</T>}
            {aSynthese(e.resume) && <SyntheseVue synthese={e.resume} />}
            {e.chiffres.length > 0 && (
              <T variant="caption" ton="inkMuted">{e.chiffres.map((c) => `${c.libelle} : ${c.valeur}`).join(' · ')}</T>
            )}
          </Ligne>
        ))}
      </Section>
    </>
  );
}

function OngletTexte({ fiche: f }: { fiche: FicheDossier }) {
  const aller = useAller();
  return (
    <Section titre="Le texte, article par article">
      <T ton="inkMuted">
        {`Le texte a connu ${f.versionsDuTexte} version${f.versionsDuTexte > 1 ? 's' : ''}. Touchez un article pour voir chaque modification, à quelle étape, et son origine quand elle est établie.`}
      </T>
      {f.articles.map((a) => (
        <Ligne key={a.article.id} onPress={() => aller.article(a.article.id)} accessibilityLabel={`Article ${a.article.numero}`}>
          <View style={styles.entreDeux}>
            <T variant="data">{`Art. ${a.article.numero}`}</T>
            <Label ton={a.etat === 'inchange' ? 'inkMuted' : 'ink'}>{faitsArticle(a)}</Label>
          </View>
          <T>{a.intitule ?? 'Intitulé non publié'}</T>
        </Ligne>
      ))}
    </Section>
  );
}

function OngletAmendements({
  fiche: f,
  sort,
  onSort,
  onPage,
}: {
  fiche: FicheDossier;
  sort: SortAmendement | null;
  onSort(s: SortAmendement | null): void;
  onPage(p: number): void;
}) {
  const p = usePalette();
  const sorts: SortAmendement[] = ['adopte', 'rejete', 'retire', 'tombe', 'irrecevable'];
  return (
    <Section titre="Les amendements du dossier">
      <View style={[styles.tableau, { borderColor: p.line }]}>
        <View style={styles.rangee}>
          <Label style={{ flex: 2 }}>Étape</Label>
          <Label style={styles.nombre}>Déposés</Label>
          <Label style={styles.nombre}>Adoptés</Label>
        </View>
        {f.amendements.parEtape.map((s) => (
          <View key={s.cle} style={styles.rangee}>
            <T style={{ flex: 2 }}>{s.libelle}</T>
            <T variant="data" style={styles.nombre}>{s.deposes.toLocaleString('fr-FR')}</T>
            <T variant="data" style={styles.nombre}>{s.adoptes.toLocaleString('fr-FR')}</T>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Puce actif={sort === null} onPress={() => onSort(null)}>Tous</Puce>
        {sorts.map((s) => (
          <Puce key={s} actif={sort === s} onPress={() => onSort(s)}>
            {SORT[s]}
          </Puce>
        ))}
      </ScrollView>
      {f.amendements.liste.elements.length === 0 && <T ton="inkMuted">Aucun amendement pour ce filtre.</T>}
      {f.amendements.liste.elements.map((a) => (
        <LigneAmendement key={a.id} amendement={a} />
      ))}
      <Pagination {...f.amendements.liste} onPage={onPage} />
    </Section>
  );
}

function OngletVotes({ fiche: f }: { fiche: FicheDossier }) {
  return (
    <Section titre="Les votes du dossier">
      <T ton="inkMuted">Scrutins publics de ce dossier, dans les deux chambres. Les autres votes se font à main levée et ne sont pas nominatifs.</T>
      {f.scrutins.length === 0 && <T ton="inkMuted">Aucun scrutin public pour l’instant.</T>}
      {f.scrutins.map((s) => (
        <LigneScrutin key={s.id} scrutin={s} />
      ))}
    </Section>
  );
}

function OngletActeurs({ fiche: f }: { fiche: FicheDossier }) {
  return (
    <>
      {f.acteurs.map((g) => (
        <Section key={g.role} titre={g.libelle}>
          {g.acteurs.map((a, i) => (
            <LigneActeur key={i} acteur={a} />
          ))}
          {g.total > g.acteurs.length && <T variant="caption" ton="inkMuted">{`et ${g.total - g.acteurs.length} autres`}</T>}
        </Section>
      ))}
    </>
  );
}

/** Une personne reliée ouvre sa fiche ; un nom publié (auditionnée) reste du texte. */
function LigneActeur({ acteur: a }: { acteur: ActeurDossier }) {
  const aller = useAller();
  const personne = personneOrateur(a.qui);
  return (
    <Ligne onPress={personne ? () => aller.personne(personne.id) : undefined}>
      <View style={styles.entreDeux}>
        <View style={[styles.ligneEtiquettes, { flex: 1 }]}>
          {personne?.groupe?.couleur && <Pastille couleur={personne.groupe.couleur} />}
          <View style={{ flex: 1 }}>
            <T variant="heading">{nomOrateur(a.qui)}</T>
            <T variant="caption" ton="inkMuted">
              {[a.role, a.qui.qualite, a.qui.type === 'nom_publie' ? 'nom publié, aucune fiche reliée' : null].filter(Boolean).join(' · ')}
            </T>
          </View>
        </View>
        {a.activite && <T variant="data" ton="inkMuted">{`${a.activite.libelle} : ${a.activite.valeur}`}</T>}
      </View>
    </Ligne>
  );
}

function OngletInterets({ fiche: f }: { fiche: FicheDossier }) {
  return (
    <Section titre="Les intérêts déclarés sur le dossier">
      <Avertissement glyphe="⚠">
        Rapprochements : ces organisations ont déclaré à la HATVP des actions de représentation d’intérêts sur ce sujet pendant
        l’examen du texte. Cela n’établit ni une rencontre, ni une influence sur le texte.
      </Avertissement>
      <ListeInterets interets={f.interets} />
    </Section>
  );
}

const styles = StyleSheet.create({
  ligneEtiquettes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, minHeight: 22, justifyContent: 'center' },
  changement: { gap: space[1], minHeight: 44, justifyContent: 'center' },
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  tableau: { borderWidth: 1, borderRadius: radius.md, padding: space[3], gap: space[2] },
  rangee: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  nombre: { flex: 1, textAlign: 'right' },
});
