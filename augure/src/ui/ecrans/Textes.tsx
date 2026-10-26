// Les textes d'une file de « Où en sont les textes » (ou tous, ou ceux qui attendent hors du
// Parlement), du plus ancien au plus récent, filtrables par origine, paginés. Chaque ligne ouvre la
// fiche du dossier. Query `ConsulterAvancement { etape, horsParlement, origine, page }`.

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConsulterAvancement, type Origine, type TexteEnAttente } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { demandeTextes, situationTexte } from '../avancement';
import { Ligne, Puce, T, TitreEcran } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Pagination, Requete } from '../components/dossiers/blocs';
import { Ecran } from '../components/Ecran';
import { Puces } from '../components/fondations';
import { dateLongue, pluriel } from '../format';
import { ORIGINES } from '../libelles';
import { useCommand } from '../hooks/core';
import { space } from '../theme/tokens';

function LigneTexte({ texte: t }: { texte: TexteEnAttente }) {
  const aller = useAller();
  return (
    <Ligne onPress={() => aller.dossier(t.dossier.id)} accessibilityLabel={`${t.dossier.titre}. ${t.etape.libelle}. ${situationTexte(t)}`}>
      <View style={styles.ligne}>
        <T variant="label" ton="inkMuted">
          {[t.etape.libelle, t.origine ? ORIGINES[t.origine] : null].filter(Boolean).join(' · ')}
        </T>
        <T variant="heading">{t.dossier.titre}</T>
        <T variant="small" ton="inkSoft">
          {situationTexte(t)}
        </T>
        {t.dernierActe && (
          <T variant="small" ton="inkMuted">
            Dernier acte : {t.dernierActe.libelle} ({dateLongue(t.dernierActe.date)})
          </T>
        )}
        {t.prochaineEcheance && (
          <T variant="small" ton="ink">
            Inscrit le {dateLongue(t.prochaineEcheance.date)} : {t.prochaineEcheance.libelle}
          </T>
        )}
      </View>
    </Ligne>
  );
}

export function Textes() {
  const params = useRoute<RouteProp<Pages, 'Textes'>>().params;
  const [origine, setOrigine] = useState<Origine | undefined>(params?.origine);
  const [page, setPage] = useState(1);
  const resultat = useCommand(ConsulterAvancement(demandeTextes({ ...params, origine, page })));
  const titre = params?.etape ?? (params?.horsParlement ? 'Attentes hors du Parlement' : 'Tous les textes en cours');
  const choisir = (o: Origine | undefined) => {
    setOrigine(o);
    setPage(1);
  };

  return (
    <Ecran titre={titre}>
      <View style={styles.entete}>
        <TitreEcran surtitre="Où en sont les textes">{titre}</TitreEcran>
        <T ton="inkSoft">Du plus ancien au plus récent. Un texte « en examen » a commencé cette étape ; sinon il attend la suite.</T>
      </View>
      <Puces label="Origine">
        <Puce actif={origine === undefined} onPress={() => choisir(undefined)}>
          Tous
        </Puce>
        {(Object.keys(ORIGINES) as Origine[]).map((o) => (
          <Puce key={o} actif={origine === o} onPress={() => choisir(o)}>
            {ORIGINES[o]}
          </Puce>
        ))}
      </Puces>
      <Requete resultat={resultat}>
        {(a) => (
          <View style={styles.liste}>
            <T variant="label" ton="inkMuted">
              {a.textes.total !== null ? pluriel(a.textes.total, 'texte') : ''}
            </T>
            {a.textes.elements.length ? (
              <View>
                {a.textes.elements.map((t) => (
                  <LigneTexte key={t.dossier.id} texte={t} />
                ))}
              </View>
            ) : (
              <T ton="inkMuted">Aucun texte pour ces critères.</T>
            )}
            <Pagination page={a.textes.page} taille={a.textes.taille} total={a.textes.total} suivante={a.textes.suivante} onPage={setPage} />
          </View>
        )}
      </Requete>
      <Signaler cible={{ type: 'autre', id: null }} ecran="Où en sont les textes" />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: space[2] },
  liste: { gap: space[3] },
  ligne: { flex: 1, gap: space[1], minWidth: 0 },
});
