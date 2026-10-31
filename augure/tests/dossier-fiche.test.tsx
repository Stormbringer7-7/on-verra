// Fiche Dossier v3 (planches « Dossier », « DossierTexte », « DossierAmendements », « DossierTypes »,
// « SousDossier ») : nœuds du rail et pli « Seulement les décisions », modèle de chaque type,
// statut « depuis le … », étiquettes, chiffres clés lus ou marqués « [n] », chronologie des
// amendements, effet d'un sous-dossier ; rendu des sections (react-native-web + react-dom/server).

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { FicheDossier, ScrutinResume } from '../src/core';
import { fixtures } from '../src/infra/fixtures';
import { nombre } from '../src/ui/format';
import { PARCOURS_AGRICOLE, PARCOURS_CADUC_SENAT, PARCOURS_ENGAGEMENT } from '../src/infra/fixtures/parcours';
import { RailParcours } from '../src/ui/components/commun/RailParcours';
import { EnteteDossier, ScrutinsCles, SectionAmendements, SectionTexte } from '../src/ui/components/dossiers/fiche';
import {
  chiffresCles,
  chronologieAmendements,
  comptesArticles,
  comptesEtape,
  datesAmendement,
  joursChambre,
  libelleEnAttente,
  resumeRattache,
  effetSousDossier,
  etiquettesDossier,
  groupesRail,
  iconeEtape,
  noeudsRail,
  sousTitreDecisions,
  statutDossier,
  titreProposition,
  TYPES_DOSSIER,
  typeDossier,
} from '../src/ui/components/dossiers/parcoursVue';
import { SousDossier } from '../src/ui/components/dossiers/SousDossier';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));
// Écran (React Navigation) : seuls Chargement et Erreur sont importés, par `Requete`.
vi.mock('../src/ui/components/Ecran', () => ({ Chargement: () => null, Erreur: () => null }));

const rendre = (el: ReactElement) => renderToStaticMarkup(el);
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const rien = () => {};

const ENERGIE = fixtures.ConsulterDossier[0].output as FicheDossier;
const LOCATION = fixtures.ConsulterDossier[1].output as FicheDossier;

/** Une fiche autour d'un parcours réel des fixtures (champs de la fiche énergie, vidés). */
const ficheDe = (parcours: FicheDossier['parcours'], plus: Partial<FicheDossier> = {}): FicheDossier => ({
  ...ENERGIE,
  entete: { ...ENERGIE.entete, procedure: parcours?.procedure ?? null },
  parcours,
  etapes: [],
  articles: [],
  ceQuiAChange: [],
  amendements: { parEtape: [], filtre: {}, liste: { elements: [], page: 1, taille: 20, total: 0, suivante: null } },
  scrutins: [],
  chiffres: [],
  ...plus,
});

describe('rail : nœuds et pli « Seulement les décisions »', () => {
  it('urgence agricole : commissions et transmission pliées, terminal = Journal officiel, icônes de lieu', () => {
    const noeuds = noeudsRail(PARCOURS_AGRICOLE);
    expect(noeuds.filter((n) => n.intermediaire).map((n) => n.cas.cle)).toEqual(['commission_1_o', 'transmission_1_s', 'commission_1_s']);
    expect(noeuds.find((n) => n.rendu === 'terminal')?.cas.cle).toBe('jo');
    expect(noeuds.some((n) => n.rendu === 'actuel')).toBe(false);
    expect(noeuds.at(-1)!.trait).toBe('aucun');
    expect(noeuds.map((n) => n.icone).slice(0, 4)).toEqual(['depot', 'commission', 'an', 'transmission']);
    // la procédure accélérée est une étiquette du dépôt, qui ne dévie pas le cours du texte
    const depot = noeuds[0];
    expect(depot.evenements.map((e) => e.libelle)).toEqual(['Procédure accélérée']);
    expect(depot.devie).toBe(false);
    // la branche prise est dite sous son étape
    expect(noeuds.find((n) => n.cas.cle === 'conclusions_cmp')!.lignes).toContain('Branche prise : Texte de la CMP adopté : fin de la navette');
    // deux plis : [commission AN], [transmission, commission Sénat]
    expect(groupesRail(noeuds).filter((g) => g.type === 'pli').map((g) => (g.type === 'pli' ? g.noeuds.length : 0))).toEqual([1, 2]);
    expect(sousTitreDecisions(noeuds, true)).toBe('3 étapes intermédiaires masquées');
  });

  it('caducité : un seul nœud, dévié, sans trait ; jamais « échec »', () => {
    const noeuds = noeudsRail(PARCOURS_CADUC_SENAT);
    expect(noeuds.map((n) => n.cas.cle)).toEqual(['depot']);
    expect(noeuds[0]).toMatchObject({ devie: true, trait: 'aucun' });
    expect(texte(rendre(<RailParcours parcours={PARCOURS_CADUC_SENAT} onEtape={rien} onDeviation={rien} onDossier={rien} />))).not.toMatch(/échec/i);
  });

  it('énergie : Conseil constitutionnel en cours (halo), étapes à venir avec leur nature, chiffres de l’étape', () => {
    const noeuds = noeudsRail(ENERGIE.parcours!, ENERGIE.etapes);
    const cc = noeuds.find((n) => n.cas.cle === 'cc')!;
    expect(cc.rendu).toBe('actuel');
    expect(cc.lignes.some((l) => l.startsWith('Depuis le 17/10/2026'))).toBe(true);
    expect(noeuds.find((n) => n.cas.cle === 'promulgation')).toMatchObject({ rendu: 'a_venir', nature: 'obligatoire', date: '' });
    expect(noeuds.find((n) => n.cas.cle === 'seance_1_o')!.lignes).toContain(`Amendements déposés : ${nombre(1980)}`);
    const html = rendre(<RailParcours parcours={ENERGIE.parcours!} etapes={ENERGIE.etapes} onEtape={rien} onDeviation={rien} onDossier={rien} />);
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(texte(html)).toContain('prévue si… facultative');
  });

  it('dossiers rattachés : un bloc sous leur étape', () => {
    const avecEnfant = { ...PARCOURS_AGRICOLE, enfants: [{ dossier: { id: 'x', titre: 'Engagement de responsabilité' }, etape: 'seance_1_o', etapeLibelle: 'Séance AN' }] };
    expect(noeudsRail(avecEnfant).find((n) => n.cas.cle === 'seance_1_o')!.enfants).toHaveLength(1);
    expect(texte(rendre(<RailParcours parcours={avecEnfant} onEtape={rien} onDeviation={rien} onDossier={rien} />))).toContain(
      'Engagement de responsabilité Dossier rattaché · Séance AN ›',
    );
  });
});

describe('types de dossier (opendata/parcours)', () => {
  it('chaque modèle publié a son icône, ses sections et ses chiffres', () => {
    // Les modèles de opendata/parcours/*.toml (hors correspondances.toml).
    const modeles = [
      'allocution', 'commission_enquete', 'haute_cour', 'loi_financement_securite_sociale', 'loi_finances', 'loi_ordinaire',
      'loi_organique', 'mission_information', 'motion_referendaire', 'petition', 'prerogatives_enquete', 'rapport_information',
      'referendum_initiative_partagee', 'resolution', 'resolution_34_1', 'resolution_europeenne', 'resolution_reglement',
      'responsabilite_gouvernement', 'revision_constitutionnelle', 'traite',
    ];
    expect(modeles).toHaveLength(20);
    for (const m of modeles) {
      expect(TYPES_DOSSIER[m], m).toBeDefined();
      expect(TYPES_DOSSIER[m].sections[0]).toBe('parcours');
      expect(TYPES_DOSSIER[m].chiffres.length).toBeGreaterThan(0);
    }
    // modèle inconnu : celui de sa famille
    expect(typeDossier({ cle: 'nouveau', version: 1, libelle: 'x', famille: 'gouvernement', fondement: '' })).toBe(TYPES_DOSSIER.responsabilite_gouvernement);
  });

  it('icônes de lieu : séance au Sénat, CMP, Conseil, promulgation', () => {
    expect(iconeEtape({ cle: 'seance_1_s', lieu: 'SENAT' })).toBe('senat');
    expect(iconeEtape({ cle: 'nouvelle_lecture', lieu: null })).toBe('navette');
    expect(iconeEtape({ cle: 'creation', lieu: 'AN' }, 'mission_information')).toBe('mission');
    expect(iconeEtape({ cle: 'promulgation_jo', lieu: 'PR' })).toBe('jo');
  });
});

describe('en-tête et chiffres clés', () => {
  it('énergie : statut depuis l’étape courante, chiffres lus dans la fiche, procédure accélérée', () => {
    expect(statutDossier(ENERGIE)).toEqual({ libelle: 'En cours', depuis: 'Conseil constit. depuis le 17/10/2026 (7 jours)' });
    expect(chiffresCles(ENERGIE)).toEqual([
      { valeur: nombre(3242), libelle: 'amendements déposés' },
      { valeur: '402', libelle: 'amendements adoptés' },
      { valeur: '5', libelle: 'votes publics' },
      { valeur: '285', libelle: 'jours depuis le dépôt' },
    ]);
    expect(etiquettesDossier(ENERGIE)).toEqual([{ libelle: 'Procédure accélérée', signal: false }]);
    expect(titreProposition(ENERGIE)).toBe('Ce qu’il propose');
    expect(titreProposition(LOCATION)).toBe('Ce qu’elle propose');
  });

  it('promulguée : jours du dépôt à la loi, décision du Conseil en étiquette ; chiffre absent = [n]', () => {
    const f = ficheDe(PARCOURS_AGRICOLE, { entete: { ...ENERGIE.entete, etat: 'promulgue', dateDepot: '2026-04-08', procedure: 'acceleree' } });
    expect(chiffresCles(f)).toContainEqual({ valeur: '132', libelle: 'jours du dépôt à la loi' });
    expect(chiffresCles(f)[0]).toEqual({ valeur: '[n]', libelle: 'amendements déposés' });
    expect(statutDossier(f)).toEqual({ libelle: 'Promulgué', depuis: 'depuis le 19/08/2026 (69 jours)' });
    expect(etiquettesDossier(f).map((e) => e.libelle)).toContain('Conseil constitutionnel : Non conformité partielle - réserve');
    expect(titreProposition(f)).toBe('Ce qu’il proposait');
    // Loi de finances : jours de chaque chambre lus dans les dates des cases (dépôt 08/04 → séance
    // AN 02/06 ; transmission 03/06 → séance Sénat 02/07), total jusqu'au vote du texte de la CMP (21/07).
    const finances = ficheDe({ ...PARCOURS_AGRICOLE, modele: { ...PARCOURS_AGRICOLE.modele, cle: 'loi_finances' } });
    expect(chiffresCles(finances).slice(0, 3)).toEqual([
      { valeur: '55 / 40', libelle: 'jours à l’Assemblée' },
      { valeur: '29 / 15', libelle: 'jours au Sénat' },
      { valeur: '104 / 70', libelle: 'jours au total' },
    ]);
    // Une date manque : la marque, jamais un nombre supposé.
    const sansDepot = { ...PARCOURS_AGRICOLE, modele: finances.parcours!.modele, cases: PARCOURS_AGRICOLE.cases.map((c) => (c.cle === 'depot' ? { ...c, debut: null } : c)) };
    expect(chiffresCles(ficheDe(sansDepot))[0]).toEqual({ valeur: '[n] / 40', libelle: 'jours à l’Assemblée' });
    expect(joursChambre(null, 'AN')).toBeNull();
  });

  it('commission d’enquête : membres lus dans les chiffres de la fiche ; RIP : soutiens absents des sources', () => {
    const enquete = { ...PARCOURS_AGRICOLE, modele: { ...PARCOURS_AGRICOLE.modele, cle: 'commission_enquete', famille: 'controle' as const } };
    expect(chiffresCles(ficheDe(enquete, { chiffres: [{ libelle: 'Membres', valeur: 29 }] }))[0]).toEqual({ valeur: '29', libelle: 'membres' });
    expect(chiffresCles(ficheDe(enquete))[0]).toEqual({ valeur: '[n]', libelle: 'membres' });
    const rip = { ...PARCOURS_AGRICOLE, modele: { ...PARCOURS_AGRICOLE.modele, cle: 'referendum_initiative_partagee' } };
    expect(chiffresCles(ficheDe(rip))[1]).toEqual({ valeur: '[n]', libelle: 'soutiens d’électeurs, 1/10 requis · absent des sources' });
  });

  it('49.3 répétés : une étiquette « utilisé n fois », en signal', () => {
    const d = { cle: 'engagement_responsabilite', libelle: 'Engagement de responsabilité', fondement: 'art. 49, al. 3', etape: 'seance_1_o', effet: 'rejoint' as const, debut: null, conclusion: null, provenance: [] };
    const f = ficheDe({ ...PARCOURS_AGRICOLE, deviations: [d, d, d] });
    expect(etiquettesDossier(f)[0]).toEqual({ libelle: '49.3 utilisé 3 fois', signal: true });
    const seance = noeudsRail(f.parcours!).find((n) => n.cas.cle === 'seance_1_o')!;
    expect(seance.evenements.map((e) => e.libelle)).toEqual(['49.3 ×3']);
    expect(seance.devie).toBe(true);
  });

  it('rend l’en-tête : type, dépositaire, statut, sans emoji', () => {
    const t = texte(rendre(<EnteteDossier fiche={ENERGIE} />));
    expect(t).toContain('Projet de loi · ');
    expect(t).toContain('En cours Conseil constit. depuis le 17/10/2026 (7 jours)');
    expect(t).toContain('Procédure accélérée');
  });
});

describe('Texte et amendements', () => {
  it('comptes des articles depuis le dépôt ; aucun article : à calculer', () => {
    expect(comptesArticles(ENERGIE)).toEqual({ ajoutes: '1', supprimes: '0', modifies: '4', total: '6' });
    expect(comptesArticles(ficheDe(null)).modifies).toBe('[à calculer]');
    const t = texte(rendre(<SectionTexte fiche={ENERGIE} />));
    expect(t).toContain('Texte déposé 12/01/2026 → Étape en cours Conseil constit. · 17/10/26');
    expect(t).toContain('Les versions intermédiaires ne sont pas comparées');
  });

  it('chronologie depuis le dépôt : étapes dans l’ordre, amendements sous leur étape', () => {
    const { etapes, nAurontPasLieu } = chronologieAmendements(ENERGIE);
    expect(etapes[0].cas.cle).toBe('depot');
    const commission = etapes.find((e) => e.cas.cle === 'commission_1_o')!;
    expect(commission.stat).toMatchObject({ deposes: 612, adoptes: 96 });
    expect(commission.amendements.map((a) => a.numero)).toEqual(['CE123', 'CE88']);
    expect(nAurontPasLieu).toEqual([]);
    const t = texte(rendre(<SectionAmendements fiche={ENERGIE} sort={null} onSort={rien} onPage={rien} onDeviation={rien} />));
    expect(t).toContain('3 242 amendements, 402 adoptés Tous 3 242 Adoptés 402 Rejetés 1 803 Retirés 340 Tombés 304');
    expect(t).toContain('Retiré par son auteur');
    // Comptes par sort de l'étape, et les deux amendements sans sort publié.
    expect(t).toContain('612 déposés 96 adoptés 330 rejetés 64 retirés 52 tombés 38 irrecevables 30 non soutenus 2 sans sort publié');
    // Ligne de vie : dates de dépôt et de sort publiées.
    expect(t).toContain('déposé 30/01');
    expect(t).toContain('adopté 04/02');
    // Sans comptes par sort : la marque.
    const sansSorts = { ...ENERGIE, amendements: { ...ENERGIE.amendements, parSort: undefined, parEtape: ENERGIE.amendements.parEtape.map(({ parSort: _p, ...e }) => e) } };
    expect(texte(rendre(<SectionAmendements fiche={sansSorts} sort={null} onSort={rien} onPage={rien} onDeviation={rien} />))).toContain('612 déposés 96 adoptés [n] rejetés');
  });

  it('amendements en attente : « non débattus » seulement si le texte est retiré ou caduc', () => {
    const [commission] = chronologieAmendements(ENERGIE).etapes.filter((e) => e.cas.cle === 'commission_1_o');
    const enAttente = { ...commission, stat: { ...commission.stat!, parSort: { ...commission.stat!.parSort!, en_attente: 2 } } };
    expect(comptesEtape(enAttente, 'en_cours').at(-1)).toEqual({ n: '2', libelle: 'sans sort publié' });
    expect(libelleEnAttente(enAttente, 'en_cours')).toBe('sans sort publié'); // étape faite : le sort peut ne pas être publié
    expect(libelleEnAttente({ ...enAttente, cas: { ...enAttente.cas, etat: 'en_cours' } }, 'en_cours')).toBe('en attente');
    expect(libelleEnAttente(enAttente, 'caduc')).toBe('non débattus');
    const retrait = { ...enAttente, evenements: [{ ...PARCOURS_CADUC_SENAT.deviations[0], cle: 'retrait' }] };
    expect(libelleEnAttente(retrait, 'en_cours')).toBe('non débattus');
    // Irrecevabilité : arrêt, mais rien ne dit que l'examen n'a pas eu lieu.
    expect(libelleEnAttente({ ...retrait, evenements: [{ ...retrait.evenements[0], cle: 'irrecevabilite' }] }, 'en_cours')).toBe('sans sort publié');
    expect(datesAmendement({ dateDepot: null, dateSort: null, sort: 'rejete' })).toEqual({ depot: 'déposé [jj/mm]', sort: 'rejeté [jj/mm]' });
    expect(datesAmendement({ dateDepot: '2026-04-28', dateSort: null, sort: 'en_attente' })).toEqual({ depot: 'déposé 28/04', sort: 'pas encore examiné' });
  });

  it('caducité : l’événement dans la chronologie, puis les étapes qui n’auront pas lieu', () => {
    const f = ficheDe(PARCOURS_CADUC_SENAT);
    const { etapes, nAurontPasLieu } = chronologieAmendements(f);
    expect(etapes.map((e) => e.cas.cle)).toEqual(['depot']);
    expect(etapes[0]).toMatchObject({ arret: true });
    expect(nAurontPasLieu).toContain('Journal officiel');
    const t = texte(rendre(<SectionAmendements fiche={f} sort={null} onSort={rien} onPage={rien} onDeviation={rien} />));
    expect(t).toContain('Caducité');
    expect(t).toContain('N’auront pas lieu');
    expect(t).toContain('[n] amendements non débattus');
    expect(t).not.toMatch(/échec/i);
  });

  it('scrutins clés : seulement ceux qui concluent leur étape', () => {
    const t = texte(rendre(<ScrutinsCles fiche={ENERGIE} complet />));
    const cles = ENERGIE.scrutins.filter((s) => ['ensemble', 'article_unique', 'motion_censure'].includes(s.nature));
    for (const s of ENERGIE.scrutins) {
      if (cles.includes(s)) expect(t).toContain(s.enClair ?? s.intitule);
    }
  });
});

describe('sous-dossier (49.3)', () => {
  const motion: ScrutinResume = {
    id: 'scrutin-an-censure', chambre: 'AN', numero: '3201', date: '2026-01-23', nature: 'motion_censure',
    intitule: 'la motion de censure', enClair: null, sort: 'rejetée', adopte: false, decompte: { pour: 260, contre: 0, abstention: 0 },
    dossier: null, etape: { cle: 'vote', libelle: 'Vote' },
  };
  const f = ficheDe(PARCOURS_ENGAGEMENT, {
    entete: { ...ENERGIE.entete, id: 'DLR5L17N53597', titre: 'Engagement sur la 1re partie', titreEnClair: null, type: 'Engagement de responsabilité', etat: 'rapport_publie' },
    scrutins: [motion],
  });

  it('effet : motion rejetée, texte adopté ; l’autre branche en regard', () => {
    expect(effetSousDossier(f)).toEqual({
      pris: 'Motion rejetée : le texte est considéré comme adopté',
      autres: ['Motion adoptée : texte rejeté, le Gouvernement démissionne'],
    });
    // rien de publié (ni scrutin du dossier, ni motion du rattachement) : aucune branche tranchée
    const sansRien = { ...f, scrutins: [], parcours: { ...f.parcours!, parent: { ...f.parcours!.parent!, scrutins: [] } } };
    expect(effetSousDossier(sansRien)?.pris).toBeNull();
    // les motions du rattachement suffisent : n° 5154 et 5155, toutes deux rejetées
    expect(effetSousDossier({ ...f, scrutins: [] })?.pris).toBe('Motion rejetée : le texte est considéré comme adopté');
    const adoptee = { ...sansRien, parcours: { ...sansRien.parcours, parent: { ...sansRien.parcours.parent, scrutins: [{ ...PARCOURS_ENGAGEMENT.parent!.scrutins![0], adopte: true, sort: 'adopté' }] } } };
    expect(effetSousDossier(adoptee)?.pris).toBe('Motion adoptée : texte rejeté, le Gouvernement démissionne');
  });

  it('motions du rattachement : résumé sur le rail du parent, cartes dans la fiche du 49.3 (fixtures réelles)', () => {
    const plf = fixtures.ConsulterDossier.find((x) => x.input.id === 'DLR5L17N52428')!.output;
    const premiere = plf.parcours!.enfants.find((e) => e.dossier.id === 'DLR5L17N53597')!;
    expect(resumeRattache(premiere)).toBe('2 motions de censure, rejetées : 269 et 142 voix pour, 289 requises (règle)');
    expect(resumeRattache({ ...premiere, scrutins: [] })).toBeNull();
    expect(resumeRattache({ dossier: premiere.dossier, etape: null, etapeLibelle: null })).toBeNull();
    const rail = texte(rendre(<RailParcours parcours={plf.parcours!} etapes={plf.etapes} onEtape={rien} onDeviation={rien} onDossier={rien} />));
    expect(rail).toContain('2 motions de censure, rejetées : 269 et 142 voix pour, 289 requises (règle)');
    expect(rail).toContain('2 motions de censure, rejetées : 260 et 135 voix pour');
    const engagement = fixtures.ConsulterDossier.find((x) => x.input.id === 'DLR5L17N53597')!.output;
    const t = texte(rendre(<SousDossier fiche={engagement} />));
    expect(t).toContain('Les motions');
    expect(t).toContain('Motion de censure n° 5154 · rejeté · 269 voix pour, 289 requises (règle)');
    expect(t).toContain('Motion rejetée : le texte est considéré comme adopté');
    expect(t).not.toContain('Scrutin de la motion : non publié');
    expect(t).not.toMatch(/échec/i);
  });

  it('rend le lien au parent, le mini parcours, la motion et sa jauge', () => {
    const t = texte(rendre(<SousDossier fiche={f} />));
    expect(t).toContain('Rattaché à Projet de loi de finances pour 2026 · Nouvelle lecture');
    expect(t).toContain('Déclaration du Gouvernement');
    expect(t).toContain('Effet sur le dossier');
    expect(t).toContain('260 voix · 289 nécessaires');
    expect(t).toContain('Seuls les « pour » sont comptés.');
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
