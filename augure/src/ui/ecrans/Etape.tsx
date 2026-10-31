// Une case du parcours (planche « Étape », 22 sortes en 6 familles : navette, accord, fin,
// initiative, contrôle, Gouvernement). Mêmes blocs pour toutes : bande d'icônes du parcours avec
// l'étape affichée, en-tête (lieu, titre, état, dates), chiffres clés, jauge (délai ou majorité),
// personne, lien d'événement (déviation, dossier rattaché), fourche du droit commun, note de règle,
// lignes (ce qu'elle a changé, votes, documents), étapes voisines. La sorte (clé et lieu de la case,
// components/etape/regles.ts, précisée par le modèle du dossier) choisit les blocs ; les valeurs sont
// celles de `ConsulterEtape` : les personnes publiées de l'étape (rapporteurs, président et membres
// de la CMP, auteurs, Premier ministre) ; ce que la fiche ne publie pas est dit indisponible.
// Une déviation s'ouvre dans la feuille Événement (FeuilleDeviation).

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ConsulterEtape, type ChangementEtape, type DeviationParcours, type FicheEtape, type Intervenant, type PersonneEtape } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, T } from '../components/base';
import { FeuilleDeviation } from '../components/commun/FeuilleDeviation';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { aSynthese, aucuneSynthese, casesVisibles, NATURE_ETAPE, quandEtape } from '../components/commun/statuts';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { Colonnes, Requete, Section } from '../components/dossiers/blocs';
import { ExtraitVue, LigneScrutin, OrateurVue, OrigineVue } from '../components/dossiers/elements';
import { ETAT_CASE, LIEU, nomOrateur, titreOrigine, TYPE_DOCUMENT } from '../components/dossiers/presentation';
import {
  BandeParcours,
  ChiffresCles,
  EnteteEtape,
  FourcheVue,
  JaugeVue,
  LienEvenement,
  LigneEtape,
  Lignes,
  Note,
  PersonneBloc,
  PersonneIndisponible,
  Voisines,
} from '../components/etape/blocs';
import {
  bandeParcours,
  definitionEtape,
  fourcheEtape,
  iconeDeviation,
  jaugesEtape,
  membresEtape,
  personnesAttendues,
  sorteEtape,
} from '../components/etape/regles';
import { Apparition } from '../components/mouvement';
import { sousLeDossier } from '../ariane';
import { Ecran } from '../components/Ecran';
import { capitale, date, jourMois } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function Etape() {
  const { dossier, cle } = useRoute<RouteProp<Pages, 'Etape'>>().params;
  const fiche = useCommand(ConsulterEtape({ dossier, cle }));
  const f = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  return (
    <Ecran largeur="pleine" titre={f?.case.libelle} parents={sousLeDossier(f?.barre.dossier ?? { id: dossier, titre: 'Dossier' })}>
      <Requete resultat={fiche}>{(f) => <ContenuEtape fiche={f} />}</Requete>
    </Ecran>
  );
}

/** Jour de référence des durées (« depuis le 17/10/2026 · 7 jours ») : aujourd'hui, par défaut. */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function ContenuEtape({ fiche: f, jour = aujourdhui() }: { fiche: FicheEtape; jour?: string }) {
  const aller = useAller();
  const [deviation, setDeviation] = useState<DeviationParcours | null>(null);
  const c = f.case;
  const dossier = f.barre.dossier.id;
  const sorte = sorteEtape(c.cle, c.lieu);
  const modele = f.modele?.cle ?? null;
  const def = definitionEtape(sorte, modele);
  const membres = membresEtape(f.personnes);
  const sur = casesVisibles(f.barre.cases).length;
  const ou = f.organe?.nom ?? (c.lieu ? LIEU[c.lieu] : null);
  const nature = NATURE_ETAPE[c.nature];
  const jauges = jaugesEtape(sorte, c, f.votes, jour, modele);
  const fourche = fourcheEtape(sorte, c);

  // Blocs de la colonne principale, dans l'ordre de la planche ; chacun apparaît en cascade.
  const blocs: ReactNode[] = [
    <BandeParcours
      key="bande"
      pas={bandeParcours(f.barre.cases, c.cle)}
      libelle={`Parcours du dossier : étape ${f.numero} sur ${sur}, ${c.libelle}`}
      onPas={(cle) => aller.etape(dossier, cle)}
    />,
    <View key="entete" style={{ gap: space[2] }}>
      <EnteteEtape
        icone={def.icone}
        surtitre={`Étape ${f.numero} sur ${sur}${ou ? ` · ${ou}` : ''}`}
        titre={c.libelle}
        statut={c.conclusion ? capitale(c.conclusion) : ETAT_CASE[c.etat]}
        quand={quandEtape(c, jour)}
      />
      {nature && <T variant="caption" ton="inkMuted">{`${nature} dans le droit commun : elle peut ne pas avoir lieu.`}</T>}
      {c.programmeeLe && <T variant="caption" ton="inkMuted">{`Inscrite à l’ordre du jour le ${date(c.programmeeLe)} : une échéance, pas un acte accompli.`}</T>}
    </View>,
    <ChiffresCles key="chiffres" chiffres={f.chiffres} />,
    ...jauges.map((j) => <JaugeVue key={`jauge-${j.libelle}`} jauge={j} />),
    ...personnesAttendues(def, f.personnes).flatMap(({ role, trouvees }) =>
      trouvees.length === 0
        ? [<PersonneIndisponible key={`personne-${role}`} role={role} />]
        : trouvees.map((x, i) => <PersonneEtapeVue key={`personne-${role}-${i}`} role={role} personne={x} />),
    ),
    membres.length > 0 && (
      <Note key="membres">{`${membres.length} membre${membres.length > 1 ? 's' : ''} titulaire${membres.length > 1 ? 's' : ''} publié${membres.length > 1 ? 's' : ''} : ${membres.map((m) => nomOrateur(m.qui)).join(', ')}.`}</Note>
    ),
    ...f.deviations.map((d, i) => (
      <LienEvenement
        key={`deviation-${d.cle}-${i}`}
        icone={iconeDeviation(d.cle, d.effet)}
        libelle={d.libelle}
        fin={d.debut ? `${jourMois(d.debut)} ›` : '›'}
        accessibilityLabel={`Voir l’événement : ${d.libelle}`}
        onPress={() => setDeviation(d)}
      />
    )),
    ...f.enfants.map((k) => (
      <LienEvenement
        key={`enfant-${k.dossier.id}`}
        icone="rejoint"
        libelle={k.dossier.titre}
        fin="›"
        accessibilityLabel={`Dossier rattaché à cette étape : ${k.dossier.titre}`}
        onPress={() => aller.dossier(k.dossier.id)}
      />
    )),
    fourche && <FourcheVue key="fourche" fourche={fourche} />,
    def.note && <Note key="note">{def.note}</Note>,
    <SyntheseVue key="en-clair" synthese={f.resume} titre="En clair" />,
    f.changements.length > 0 && (
      <Lignes key="changements" titre="Ce qu’elle a changé">
        {aucuneSynthese(f.changements.map((ch) => ch.resume)) && <SyntheseVue synthese={null} />}
        {f.changements.map((ch, i) => (
          <LigneChangement key={`${ch.article.id}-${i}`} changement={ch} />
        ))}
      </Lignes>
    ),
    f.votes.length > 0 && (
      <Lignes key="votes" titre="Votes de l’étape">
        {f.votes.map((s) => (
          <LigneScrutin key={s.id} scrutin={s} />
        ))}
      </Lignes>
    ),
    <Lignes key="documents" titre="Documents">
      {f.documents.length === 0 && <Note>Aucun document publié pour l’instant.</Note>}
      {f.documents.map((d) => (
        <LigneEtape
          key={d.id}
          libelle={d.titre}
          detail={[TYPE_DOCUMENT[d.type], d.date ? date(d.date) : null, d.url ? null : 'adresse non publiée'].filter(Boolean).join(' · ')}
          fin="↗"
          onPress={d.url ? () => void Linking.openURL(d.url!).catch(() => {}) : undefined}
          accessibilityLabel={`${d.titre}, ouvrir la page officielle`}
        />
      ))}
    </Lignes>,
    <Voisines
      key="voisines"
      precedente={f.precedente?.libelle ?? null}
      suivante={f.suivante?.libelle ?? null}
      onPrecedente={() => f.precedente && aller.etape(dossier, f.precedente.cle)}
      onSuivante={() => f.suivante && aller.etape(dossier, f.suivante.cle)}
    />,
  ].filter(Boolean);

  return (
    <>
      <Colonnes
        principale={
          <View style={{ gap: 18 }}>
            {blocs.map((b, i) => (
              <Apparition key={i} rang={Math.min(i, 4)}>
                {b}
              </Apparition>
            ))}
          </View>
        }
        laterale={
          <>
            <Section titre="Qui intervient">
              {f.quiIntervient.intervenants.length === 0 && <T ton="inkMuted">Aucune prise de parole publiée pour cette étape.</T>}
              {f.quiIntervient.intervenants.map((it, i) => (
                <LigneIntervenant key={i} intervenant={it} />
              ))}
              {f.quiIntervient.total > 0 && (
                <Action onPress={() => aller.discussions({ type: 'etape', dossier, cle: c.cle })}>{`Toutes les interventions (${f.quiIntervient.total}) →`}</Action>
              )}
            </Section>
            {c.provenance.length > 0 && (
              <View style={{ gap: 4 }}>
                <Label>Ce qui établit l’étape</Label>
                {c.provenance.map((s) => (
                  <Source key={`${s.systeme}-${s.idNatif}`} provenance={s} />
                ))}
              </View>
            )}
            {f.documents.length > 0 && (
              <View style={{ gap: 4 }}>
                <Label>Sources des documents</Label>
                {f.documents.map((d) => (
                  <Source key={d.id} provenance={d.provenance} compact />
                ))}
              </View>
            )}
            <Signaler cible={{ type: 'etape', id: `${dossier}/${c.cle}` }} ecran="Etape" />
          </>
        }
      />
      <FeuilleDeviation
        deviation={deviation}
        dossier={f.barre.dossier}
        etape={deviation ? c : null}
        rattache={f.enfants[0] ?? null}
        onFermer={() => setDeviation(null)}
        onEtape={() => setDeviation(null)}
        onDossier={(id) => {
          setDeviation(null);
          aller.dossier(id);
        }}
      />
    </>
  );
}

/** Personne publiée de l'étape : pastille de son groupe, ouvre sa fiche quand elle est reliée. */
function PersonneEtapeVue({ role, personne: x }: { role: string; personne: PersonneEtape }) {
  const aller = useAller();
  const p = usePalette();
  const ref = x.qui.type === 'personne' ? x.qui.personne : null;
  return (
    <PersonneBloc
      nom={nomOrateur(x.qui)}
      detail={x.role === 'auteur' ? `${role} · ${x.detail}` : x.detail}
      couleur={ref?.groupe?.couleur ?? p.lineStrong}
      onPress={ref ? () => aller.personne(ref.id) : undefined}
    />
  );
}

/** Article modifié et origine du changement : l'amendement n'est nommé que si l'attribution est vérifiée. */
function LigneChangement({ changement: ch }: { changement: ChangementEtape }) {
  const aller = useAller();
  return (
    <View style={styles.changement}>
      <LigneEtape
        libelle={`Article ${ch.article.numero}`}
        detail={titreOrigine(ch.origine)}
        onPress={() => aller.article(ch.article.id)}
        accessibilityLabel={`Article ${ch.article.numero}, ${titreOrigine(ch.origine)}`}
      />
      {aSynthese(ch.resume) && <SyntheseVue synthese={ch.resume} />}
      <OrigineVue origine={ch.origine} />
    </View>
  );
}

/** Une ligne de « Qui intervient » : l'orateur (pastille de son groupe), ses prises de parole, un extrait. */
function LigneIntervenant({ intervenant: it }: { intervenant: Intervenant }) {
  return (
    <View style={{ gap: 4 }}>
      {it.extrait ? (
        <ExtraitVue extrait={it.extrait} />
      ) : (
        <View style={{ gap: 2 }}>
          <OrateurVue orateur={it.orateur} groupe={it.groupe} />
          <T variant="caption" ton="inkMuted">Aucun extrait publié.</T>
        </View>
      )}
      <Label>{`${it.interventions} prise${it.interventions > 1 ? 's' : ''} de parole dans l’étape`}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  changement: { gap: space[1], paddingBottom: space[2] },
});
