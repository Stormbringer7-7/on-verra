// Discussions : prises de parole d'une étape, d'une réunion, sur un amendement ou d'une personne,
// en texte intégral, page par page. L'orateur est une personne reliée (lien vers sa fiche) ou un
// nom publié (jamais lié) ; chaque intervention renvoie au passage du compte rendu officiel.
// Query `ListerInterventions { cible, page }`.

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListerInterventions, type Intervention } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { LienExterne, Ligne, Pagination, Requete, TitreEcran } from '../components/dossiers/blocs';
import { OrateurVue } from '../components/dossiers/elements';
import { adresseAncre, decalage, entreeDiscussions } from '../components/dossiers/presentation';
import { parentPersonne, RACINES } from '../ariane';
import { Ecran } from '../components/Ecran';
import { date } from '../format';
import { useCommand } from '../hooks/core';
import { space } from '../theme/tokens';

const REUNION = { seance: 'Séance publique', commission: 'Commission', autre: 'Réunion' } as const;

export function Discussions() {
  const params = useRoute<RouteProp<Pages, 'Discussions'>>().params;
  const [page, setPage] = useState(1);
  const liste = useCommand(ListerInterventions(entreeDiscussions(params, page)));
  const libelle = liste.statut === 'erreur' ? undefined : liste.donnees?.libelle;
  // Ce qui a été dit, sous l'objet dont on parle (son libellé vient de l'API).
  const parents =
    params.type === 'personne'
      ? [RACINES.elus, ...(libelle ? [parentPersonne(params.id, libelle)] : [])]
      : params.type === 'etape'
        ? [RACINES.lois, ...(libelle ? [{ libelle, cible: { page: 'Etape' as const, params: { dossier: params.dossier, cle: params.cle } } }] : [])]
        : params.type === 'amendement'
          ? [RACINES.lois, ...(libelle ? [{ libelle, cible: { page: 'Amendement' as const, params: { id: params.id } } }] : [])]
          : [RACINES.lois];
  return (
    <Ecran titre="Ce qui a été dit" parents={parents}>
      <Requete resultat={liste}>
        {(l) => (
          <>
            <View style={{ gap: space[2] }}>
              <Label>Discussions · texte intégral</Label>
              <TitreEcran>{l.libelle}</TitreEcran>
              <T ton="inkMuted">
                Les interventions telles que publiées au compte rendu. Un nom suivi de « nom publié » n’est relié à aucune fiche :
                le compte rendu ne donne que le nom.
              </T>
            </View>
            {l.interventions.elements.length === 0 && <T ton="inkMuted">Aucune intervention publiée.</T>}
            {l.interventions.elements.map((i) => (
              <LigneIntervention key={i.id} intervention={i} />
            ))}
            <Pagination {...l.interventions} onPage={setPage} />
          </>
        )}
      </Requete>
    </Ecran>
  );
}

function LigneIntervention({ intervention: i }: { intervention: Intervention }) {
  const aller = useAller();
  const r = i.reunion;
  const quand = [
    `${REUNION[r.type]}${r.organe ? ` · ${r.organe.nom}` : ''}`,
    r.debut ? date(r.debut) : null,
    i.horodatage !== null ? decalage(i.horodatage) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const sujet = [i.sujet.article, i.sujet.point].filter(Boolean).join(' · ');
  return (
    <Ligne>
      <Label>{quand}</Label>
      <OrateurVue orateur={i.orateur} groupe={i.groupe} />
      {sujet ? <T variant="caption" ton="inkMuted">{sujet}</T> : null}
      {i.sujet.amendement && (
        <Action onPress={() => aller.amendement(i.sujet.amendement!.id)}>{`Amendement ${i.sujet.amendement.numero} →`}</Action>
      )}
      <T selectable style={styles.texte}>
        {i.texte}
      </T>
      {i.synthese !== null && <SyntheseVue synthese={i.synthese} titre="En bref" />}
      <View style={styles.sources}>
        <LienExterne url={adresseAncre(i.compteRendu)}>Passage au compte rendu</LienExterne>
        <Source provenance={i.compteRendu.provenance} compact />
      </View>
      <Signaler cible={{ type: 'intervention', id: i.id }} ecran="Discussions" />
    </Ligne>
  );
}

const styles = StyleSheet.create({
  texte: { fontSize: 15, lineHeight: 22 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
});
