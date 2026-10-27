// Recherche (design v4, canevas « Recherche ») : un mot, un nom ou un numéro. Six familles, quatre
// d'objets et deux de faits, chacune avec son nombre ; une famille choisie s'affine par ses
// déclinaisons. Sans mot : on parcourt. Un numéro officiel (CE123, scrutin 1874) donne le résultat
// exact, ou les candidats quand il est ambigu (n° 655), chacun avec son dossier et sa chambre.
// Une déclinaison seule : sa liste paginée. Chaque résultat ouvre sa fiche.
// Filtres cumulés au mot : des expressions (le mot saisi devient une puce « « … » »), cherchées mot
// pour mot dans le texte publié et surlignées dans les extraits, et une personne (action
// « Filtrer » sur un député, un sénateur ou un ministre) : seulement ce qui la concerne par un lien
// publié ; les déclinaisons sans tel lien le disent.

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ChercherParFamilles, type DeclinaisonRecherche, type FamilleRecherche, type ResultatFamille, type SectionRecherche } from '@/core';
import { TEXTE_LONGUEUR_MAX, TEXTES_MAX } from '@/core/domain/familles';
import { type Onglets } from '../../navigation';
import { BoutonSecondaire, IconeRecherche, Puce, PuceRetirable, T } from '../components/base';
import { Chargement, Ecran, Erreur } from '../components/Ecran';
import { Avertissement, Puces } from '../components/fondations';
import { nombre } from '../format';
import { useCommand } from '../hooks/core';
import { useLarge } from '../hooks/miseEnPage';
import { PucesFamilles, Resultat, Section } from '../components/recherche/Resultats';
import { LONGUEUR_MIN, ajouterExpression, demandeFamilles, libelleCompte } from '../recherche';
import { usePalette } from '../theme/ThemeProvider';
import { fonts, radius, space } from '../theme/tokens';

/** Délai avant de lancer la recherche pendant la frappe. */
const ATTENTE_MS = 300;
function useDiffere<T>(valeur: T, ms: number): T {
  const [differee, setDifferee] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setDifferee(valeur), ms);
    return () => clearTimeout(t);
  }, [valeur, ms]);
  return differee;
}

export function Recherche() {
  const p = usePalette();
  const large = useLarge();
  const route = useRoute<RouteProp<Onglets, 'Recherche'>>();
  const [q, setQ] = useState(route.params?.q ?? '');
  const [famille, setFamille] = useState<FamilleRecherche | null>(null);
  const [declinaisons, setDeclinaisons] = useState<DeclinaisonRecherche[]>([]);
  const [page, setPage] = useState(1);
  const [textes, setTextes] = useState<string[]>([]);
  const [personne, setPersonne] = useState<{ id: string; nom: string; couleur: string | null } | null>(null);
  const qDiffere = useDiffere(q, ATTENTE_MS);

  // Nouveau mot reçu par la navigation (`navigate('Recherche', { q })`) : il remplace la saisie.
  const qRoute = route.params?.q;
  const [qRouteVu, setQRouteVu] = useState(qRoute);
  if (qRoute !== qRouteVu) {
    setQRouteVu(qRoute);
    if (qRoute !== undefined) setQ(qRoute);
  }

  const demande = demandeFamilles(qDiffere, famille, declinaisons, page, { textes, personne: personne?.id ?? null });
  const resultat = useCommand(ChercherParFamilles(demande));
  const donnees = resultat.statut !== 'erreur' ? resultat.donnees : undefined;

  const changerMot = (texte: string) => {
    setQ(texte);
    setPage(1);
  };
  // Le mot saisi devient une expression filtrée : la saisie se vide pour la suivante.
  const mot = q.replace(/\s+/g, ' ').trim();
  const peutAjouter = mot.length >= LONGUEUR_MIN && textes.length < TEXTES_MAX && mot.length <= TEXTE_LONGUEUR_MAX;
  const ajouterMot = () => {
    if (!peutAjouter) return;
    setTextes(ajouterExpression(textes, mot));
    setQ('');
    setPage(1);
  };
  const retirerTexte = (t: string) => {
    setTextes(textes.filter((x) => x !== t));
    setPage(1);
  };
  const filtrerPersonne = (r: ResultatFamille) => {
    setPersonne({ id: r.id, nom: r.titre, couleur: r.groupe?.couleur ?? null });
    setPage(1);
  };
  const filtre = textes.length > 0 || personne !== null;
  // Le nom servi par l'API fait foi (la puce reste lisible pendant le chargement).
  const nomPersonne = donnees?.personne?.nom ?? personne?.nom ?? '';
  const choisirFamille = (f: FamilleRecherche) => {
    setFamille(famille === f ? null : f);
    setDeclinaisons([]);
    setPage(1);
  };
  const basculer = (d: DeclinaisonRecherche) => {
    setDeclinaisons(declinaisons.includes(d) ? declinaisons.filter((x) => x !== d) : [...declinaisons, d]);
    setPage(1);
  };
  const voirTout = (s: SectionRecherche) => {
    setFamille(s.famille);
    setDeclinaisons([s.declinaison]);
    setPage(1);
  };

  const objets = donnees?.familles.filter((f) => f.nature === 'objet') ?? [];
  const faits = donnees?.familles.filter((f) => f.nature === 'fait') ?? [];
  const ouverte = donnees?.familles.find((f) => f.famille === famille) ?? null;
  const numero = donnees?.numero ?? null;
  const exact = numero && numero.candidats.length > 0 ? numero.candidats : null;
  const detail = donnees?.sections.length === 1 && (demande.declinaisons?.length ?? 0) === 1;

  return (
    <Ecran>
      <View style={[styles.entete, large && styles.enteteLarge]}>
        <T variant="display" accessibilityRole="header">
          Recherche
        </T>
        <View style={[styles.champ, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}>
          <IconeRecherche couleur={p.inkMuted} />
          <TextInput
            accessibilityLabel="Rechercher : un mot, un nom, un numéro"
            value={q}
            onChangeText={changerMot}
            placeholder="Un mot, un nom, un numéro (CE123, scrutin 1874…)"
            placeholderTextColor={p.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            inputMode="search"
            style={[styles.saisie, { color: p.ink }]}
          />
        </View>
        {peutAjouter && (
          <View style={styles.actions}>
            <BoutonSecondaire onPress={ajouterMot} accessibilityLabel={`Garder l’expression ${mot} comme filtre`}>
              {`Garder « ${mot} » comme expression`}
            </BoutonSecondaire>
          </View>
        )}
        {filtre && (
          <View style={styles.filtres} accessibilityLabel="Filtres de la recherche">
            {textes.map((t) => (
              <PuceRetirable key={t} libelle={`« ${t} »`} onRetirer={() => retirerTexte(t)} />
            ))}
            {personne && <PuceRetirable libelle={nomPersonne} couleur={donnees?.personne?.groupe?.couleur ?? personne.couleur} onRetirer={() => setPersonne(null)} />}
          </View>
        )}
      </View>

      {exact && (
        <View style={[styles.exact, { backgroundColor: p.surfaceRaised, borderColor: p.inkSoft }]}>
          <T variant="label" ton="inkSoft">
            {exact.length > 1
              ? `${nombre(exact.length)} objets portent ce numéro : précisez avec le dossier ou la chambre`
              : 'Résultat exact'}
          </T>
          {exact.map((r) => (
            <Resultat key={`${r.declinaison}:${r.id}`} r={r} />
          ))}
        </View>
      )}
      {numero && !exact && (
        <Avertissement titre={`Aucun objet ne porte le numéro « ${numero.saisi} »`}>
          Voici les résultats du mot, tel quel.
        </Avertissement>
      )}

      {donnees && (
        <View style={styles.familles}>
          <T variant="label" ton="inkMuted">
            Objets
          </T>
          <PucesFamilles familles={objets} famille={famille} choisir={choisirFamille} />
          <T variant="label" ton="inkMuted">
            Faits
          </T>
          <PucesFamilles familles={faits} famille={famille} choisir={choisirFamille} />
          {ouverte && (
            <View style={[styles.affiner, { backgroundColor: p.surfaceRaised, borderColor: p.line }]}>
              <T variant="small" ton="inkMuted">
                {`${ouverte.libelle} : affiner`}
              </T>
              <Puces label={`${ouverte.libelle} : déclinaisons`}>
                {ouverte.declinaisons
                  .filter((d) => d.compte !== null)
                  .map((d) => (
                    <Puce
                      key={d.declinaison}
                      variante="contour"
                      actif={declinaisons.includes(d.declinaison)}
                      onPress={() => basculer(d.declinaison)}
                      accessibilityLabel={`${d.libelle}, ${libelleCompte(d.compte, nombre)} résultats`}
                    >
                      {`${d.libelle} ${libelleCompte(d.compte, nombre)}`}
                    </Puce>
                  ))}
              </Puces>
              {ouverte.declinaisons
                .filter((d) => d.indisponible !== null || d.horsPersonne !== null)
                .map((d) => (
                  <T key={d.declinaison} variant="small" ton="inkMuted">
                    {`${d.libelle} : ${d.indisponible ?? d.horsPersonne}`}
                  </T>
                ))}
            </View>
          )}
        </View>
      )}

      {resultat.statut === 'erreur' && <Erreur message={resultat.message} onReessayer={resultat.recharger} />}
      {resultat.statut === 'chargement' && !donnees && <Chargement libelle="Recherche" />}

      {donnees && !exact && (
        <View style={styles.resultats}>
          <T variant="title" accessibilityRole="header">
            {donnees.q || donnees.textes.length || donnees.personne ? 'Résultats' : 'Parcourir'}
          </T>
          {donnees.personne && (
            <T variant="small" ton="inkMuted">
              {`Seulement ce qui concerne ${donnees.personne.nom} par un lien publié (initiateur, vote, auteur, orateur, déclarant) ; les autres déclinaisons sont écartées.`}
            </T>
          )}
          {donnees.sections.map((s) => (
            <Section
              key={s.declinaison}
              s={s}
              detail={detail}
              voirTout={() => voirTout(s)}
              page={setPage}
              textes={donnees.textes}
              filtrerPersonne={filtrerPersonne}
            />
          ))}
          {donnees.sections.length === 0 && <T ton="inkMuted">Aucun résultat. Essayez un autre mot, ou retirez une puce.</T>}
        </View>
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: space[3] },
  enteteLarge: { maxWidth: 880 },
  champ: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 16, borderWidth: 1, borderRadius: radius.full },
  saisie: { flex: 1, minWidth: 0, minHeight: 48, fontFamily: fonts.sans, fontSize: 17 },
  exact: { gap: space[2], padding: space[4], borderWidth: 1.5, borderRadius: radius.lg },
  familles: { gap: space[3] },
  affiner: { gap: space[2], padding: 14, borderWidth: 1, borderRadius: radius.lg },
  resultats: { gap: space[6] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  filtres: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
