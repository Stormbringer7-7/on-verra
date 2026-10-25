// Fixtures de maquette du contrat : pour chaque commande de definitions.ts, des exemples
// { entrée, sortie } tirés des deux dossiers fictifs du canevas « Panoptique v2 ». Le type oblige
// chaque commande du contrat à avoir ses exemples, au format exact de son entrée et de sa sortie.
//
// Utilisées par le futur `FixturesBus` de l'app (EXPO_PUBLIC_SOURCE=fixtures) et par l'adaptateur
// mémoire de l'API (SOURCE_DONNEES=memoire) : une entrée absente des exemples n'a pas de réponse.

import type { InputOf, OutputOf } from '../../core/commands/bus';
import * as definitions from '../../core/commands/definitions';
import { AVANCEMENT, AVANCEMENT_HORS_PARLEMENT, AVANCEMENT_NOUVELLE_LECTURE } from './avancement';
import { ACCUEIL, AMENDEMENT_CE123, AMENDEMENT_COM56, ARTICLE_ENERGIE_3, ARTICLE_LOCATION_2, ETAPES, FICHE_ENERGIE, FICHE_LOCATION, LISTE_DOSSIERS, LISTE_DOSSIERS_PARLEMENTAIRES } from './dossiers';
import { LISTE_INTERVENTIONS_CE123, LISTE_INTERVENTIONS_SEANCE_AN } from './discussions';
import { A, ART, D, P } from './entites';
import { INSTITUTIONS } from './institutions';
import { FICHE_REPRESENTANT_ENR, R } from './interets';
import { ANNUAIRE, ANNUAIRE_ELUS_LOCAUX, CLASSEMENT_AN_ECARTS, PERSONNES } from './personnes';
import { ACCUSE_SIGNALEMENT, RECHERCHE_ENERGIE, RECHERCHE_VIDE } from './recherche';
import { EXPLICATION_CAMILLE_1874, FICHE_SCRUTIN_1874, FICHE_SCRUTIN_SENAT_297, S } from './scrutins';

type Definitions = typeof definitions;

export interface Exemple<D> {
  /** Ce que l'exemple montre (écran du canevas, cas particulier). */
  titre: string;
  input: InputOf<D>;
  output: OutputOf<D>;
}

export type Fixtures = { [K in keyof Definitions]: Exemple<Definitions[K]>[] };

const etape = (dossier: string, cle: string) => ETAPES[`${dossier}/${cle}`];

export const fixtures: Fixtures = {
  ConsulterAccueil: [{ titre: 'Accueil, semaine du 19 octobre 2026', input: {}, output: ACCUEIL }],
  ListerDossiers: [
    { titre: 'Tous les dossiers', input: {}, output: LISTE_DOSSIERS },
    { titre: 'Proposés par des parlementaires', input: { origine: 'parlementaire' }, output: LISTE_DOSSIERS_PARLEMENTAIRES },
  ],
  ConsulterAvancement: [
    { titre: 'Où en sont les textes (épargne : promulgation hors délai, à vérifier)', input: {}, output: AVANCEMENT },
    { titre: 'Attentes hors du Parlement', input: { horsParlement: true }, output: AVANCEMENT_HORS_PARLEMENT },
    { titre: 'Une file : la nouvelle lecture', input: { etape: 'Nouvelle lecture' }, output: AVANCEMENT_NOUVELLE_LECTURE },
  ],
  ConsulterDossier: [
    { titre: 'Énergie : procédure accélérée, CMP conclusive, Conseil saisi', input: { id: D.energie.id }, output: FICHE_ENERGIE },
    { titre: 'Location : navette, CMP en échec, dernier mot à l’AN (sans synthèse)', input: { id: D.location.id }, output: FICHE_LOCATION },
  ],
  ConsulterEtape: [
    { titre: 'Énergie · Commission AN (changements, à vérifier compris)', input: { dossier: D.energie.id, cle: 'commission_1_o' }, output: etape(D.energie.id, 'commission_1_o') },
    { titre: 'Énergie · Séance AN (votes, Qui intervient)', input: { dossier: D.energie.id, cle: 'seance_1_o' }, output: etape(D.energie.id, 'seance_1_o') },
    { titre: 'Énergie · Conseil constitutionnel (en cours)', input: { dossier: D.energie.id, cle: 'cc' }, output: etape(D.energie.id, 'cc') },
    { titre: 'Location · 1re lecture AN (auditionnée, nom publié)', input: { dossier: D.location.id, cle: 'lecture_1_o' }, output: etape(D.location.id, 'lecture_1_o') },
    { titre: 'Location · CMP en échec', input: { dossier: D.location.id, cle: 'cmp' }, output: etape(D.location.id, 'cmp') },
    { titre: 'Location · Lecture définitive programmée', input: { dossier: D.location.id, cle: 'lecture_definitive' }, output: etape(D.location.id, 'lecture_definitive') },
  ],
  ListerInterventions: [
    { titre: 'Ce qui a été dit en commission sur CE123', input: { cible: { type: 'amendement', id: A.ce123.id } }, output: LISTE_INTERVENTIONS_CE123 },
    {
      titre: 'Séance AN du dossier énergie, page 1',
      input: { cible: { type: 'etape', dossier: D.energie.id, cle: 'seance_1_o' }, taille: 3 },
      output: LISTE_INTERVENTIONS_SEANCE_AN,
    },
  ],
  ConsulterArticle: [
    { titre: 'Énergie · art. 3, version de la commission', input: { article: ART.e3.id, version: 'va-e3-1' }, output: ARTICLE_ENERGIE_3 },
    { titre: 'Location · art. 2, dernière version (origine non établie)', input: { article: ART.l2.id }, output: ARTICLE_LOCATION_2 },
  ],
  ConsulterAmendement: [
    { titre: 'CE123 (AN : avis non publiés, main levée)', input: { id: A.ce123.id }, output: AMENDEMENT_CE123 },
    { titre: 'COM-56 (Sénat : avis publiés)', input: { id: A.com56.id }, output: AMENDEMENT_COM56 },
  ],
  ConsulterScrutin: [
    { titre: 'AN · scrutin n° 1874 (six réacteurs d’ici 2040)', input: { id: S.an1874.id }, output: FICHE_SCRUTIN_1874 },
    { titre: 'Sénat · question préalable (location)', input: { id: S.sen297.id }, output: FICHE_SCRUTIN_SENAT_297 },
  ],
  ExpliquerVote: [
    { titre: 'Pourquoi Camille Exemple a voté contre', input: { scrutin: S.an1874.id, personne: P.camille.id }, output: EXPLICATION_CAMILLE_1874 },
  ],
  ListerPersonnes: [
    { titre: 'Annuaire', input: {}, output: ANNUAIRE },
    { titre: 'Élus locaux (une fiche RNE seule)', input: { role: 'elu_local' }, output: ANNUAIRE_ELUS_LOCAUX },
  ],
  ClasserPersonnes: [
    {
      titre: 'Députés, écarts, thèmes favoris (ignorés : aucun thème attribué)',
      input: { chambre: 'AN', critere: 'ecarts', ordre: 'desc', themes: ['energie', 'logement'] },
      output: CLASSEMENT_AN_ECARTS,
    },
  ],
  ConsulterPersonne: [
    { titre: 'Camille Exemple · parcours (mandats RNE reliés par revue)', input: { id: P.camille.id }, output: PERSONNES['camille-exemple/parcours'] },
    { titre: 'Camille Exemple · parcours', input: { id: P.camille.id, onglet: 'parcours' }, output: PERSONNES['camille-exemple/parcours'] },
    { titre: 'Camille Exemple · ses choix', input: { id: P.camille.id, onglet: 'choix' }, output: PERSONNES['camille-exemple/choix'] },
    { titre: 'Camille Exemple · dossiers', input: { id: P.camille.id, onglet: 'dossiers' }, output: PERSONNES['camille-exemple/dossiers'] },
    { titre: 'Camille Exemple · déclarations', input: { id: P.camille.id, onglet: 'declarations' }, output: PERSONNES['camille-exemple/declarations'] },
    { titre: 'Claire Exemple · parcours (ministre)', input: { id: P.claire.id }, output: PERSONNES['claire-exemple/parcours'] },
    { titre: 'Claire Exemple · ses choix (ne vote pas)', input: { id: P.claire.id, onglet: 'choix' }, output: PERSONNES['claire-exemple/choix'] },
    { titre: 'Nadia Specimen · parcours (élue locale)', input: { id: P.nadia.id }, output: PERSONNES['nadia-specimen/parcours'] },
    { titre: 'Fiche RNE seule', input: { id: 'rne-maire-099' }, output: PERSONNES['rne-maire-099/parcours'] },
  ],
  ConsulterInstitution: [
    { titre: 'Assemblée nationale', input: { institution: 'an' }, output: INSTITUTIONS.an },
    { titre: 'Sénat', input: { institution: 'senat' }, output: INSTITUTIONS.senat },
    { titre: 'Gouvernement', input: { institution: 'gouvernement' }, output: INSTITUTIONS.gouvernement },
    { titre: 'Conseil constitutionnel', input: { institution: 'cc' }, output: INSTITUTIONS.cc },
  ],
  ConsulterRepresentant: [{ titre: 'Association fictive des énergies renouvelables', input: { id: R.enr.id }, output: FICHE_REPRESENTANT_ENR }],
  Rechercher: [
    { titre: 'Recherche « énergie », tous types', input: { q: 'énergie' }, output: RECHERCHE_ENERGIE },
    { titre: 'Aucun résultat', input: { q: 'zzzz', type: 'dossiers' }, output: RECHERCHE_VIDE },
  ],
  SignalerErreur: [
    {
      titre: 'Signalement sur un dossier',
      input: { cible: { type: 'dossier', id: D.energie.id }, message: 'Source manquante : avis du Conseil d’État.', ecran: 'Dossier' },
      output: ACCUSE_SIGNALEMENT,
    },
  ],
};
