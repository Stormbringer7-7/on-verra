// Écran Étape, feuille Événement et écran Question (planches « Étape », « Événement »,
// « Question ») : règles des 22 sortes d'étapes et des 8 déviations, puis rendu HTML par
// react-native-web sur les fixtures. Ce que la fiche ne publie pas est marqué, jamais rempli ; une
// question sans réponse est « en attente », jamais un échec ; le ministère est celui publié.

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CaseParcours, DeviationParcours, FicheQuestion } from '../src/core';
import { fixtures } from '../src/infra/fixtures';
import { creerFixturesBus } from '../src/infra/FixturesBus';
import { PARCOURS_AGRICOLE, PARCOURS_ENGAGEMENT } from '../src/infra/fixtures/parcours';
import { QUESTION_QE_4521, QUESTION_QG_1201 } from '../src/infra/fixtures/questions';
import { FicheDeviation, ouDeviation } from '../src/ui/components/commun/FeuilleDeviation';
import { EFFET_DEVIATION } from '../src/ui/components/commun/statuts';
import {
  bandeParcours,
  chambreDuLibelle,
  definitionEtape,
  EFFET_SI,
  effetSiDe,
  fourcheEtape,
  iconeCase,
  iconeDeviation,
  jaugeDelai,
  jaugesEtape,
  membresEtape,
  personnesAttendues,
  SORTES,
  sorteEtape,
  type SorteEtape,
} from '../src/ui/components/etape/regles';
import { ContenuEtape } from '../src/ui/ecrans/Etape';
import { ContenuQuestion, cycleQuestion, detailMemeSeance, ministereQuestion, quandQuestion, statutQuestion, texteQuestion } from '../src/ui/ecrans/Question';
import { CoreProvider } from '../src/ui/hooks/core';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));
// Écran (React Navigation) : seuls Ecran, Chargement et Erreur sont importés par les écrans rendus ici.
vi.mock('../src/ui/components/Ecran', () => ({ Ecran: () => null, Chargement: () => null, Erreur: () => null }));
vi.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: {} }) }));

const rendre = (el: ReactElement) =>
  renderToStaticMarkup(
    <CoreProvider bus={creerFixturesBus({ debug: () => {}, warn: () => {} })} source="fixtures">
      {el}
    </CoreProvider>,
  );
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const JOUR = '2026-10-24';

/** Clés d'étapes des modèles opendata/parcours/*.toml, et la sorte attendue. */
const CLES: [string, SorteEtape][] = [
  ['depot', 'depot'],
  ['commission_1_o', 'commission'],
  ['commission_ae', 'commission'],
  ['seance_1_s', 'seance'],
  ['debat', 'seance'],
  ['transmission_1_s', 'transmission'],
  ['lecture_2_o', 'lecture'],
  ['nouvelle_lecture', 'lecture'],
  ['lecture_definitive', 'definitive'],
  ['cmp', 'cmp'],
  ['conclusions_cmp', 'conclusions'],
  ['cc', 'cc'],
  ['promulgation', 'promulgation'],
  ['jo', 'promulgation'],
  ['congres', 'congres'],
  ['referendum', 'referendum'],
  ['recueil', 'recueil'],
  ['examen', 'examen'],
  ['haute_cour', 'hautecour'],
  ['creation', 'creation'],
  ['nomination', 'nomination'],
  ['rapport', 'rapport'],
  ['declaration', 'declaration'],
  ['motion', 'depot'],
  ['vote', 'vote'],
  ['allocution', 'allocution'],
];

const caseDe = (c: Partial<CaseParcours>): CaseParcours => ({
  rang: 1,
  cle: 'x',
  libelle: 'x',
  lieu: null,
  facultative: false,
  nature: 'obligatoire',
  etat: 'faite',
  courante: false,
  attendue: false,
  deviation: false,
  debut: null,
  fin: null,
  programmeeLe: null,
  conclusion: null,
  provenance: [],
  ...c,
});

describe('étape : sortes et blocs', () => {
  it('chaque clé des modèles a sa sorte, et chaque sorte une famille et une icône', () => {
    for (const [cle, sorte] of CLES) expect(sorteEtape(cle), cle).toBe(sorte);
    expect(sorteEtape('inconnue', 'CC')).toBe('cc');
    expect(sorteEtape('inconnue')).toBe('seance');
    expect(Object.keys(SORTES)).toHaveLength(22);
    for (const d of Object.values(SORTES)) expect(d.icone).toBeTruthy();
  });

  it('icônes : séance au Sénat, chambre lue dans le libellé publié', () => {
    expect(chambreDuLibelle('Séance Sénat')).toBe('SENAT');
    expect(chambreDuLibelle('Commission AN')).toBe('AN');
    expect(chambreDuLibelle('CMP')).toBeNull();
    expect(iconeCase('seance_1_s', 'SENAT')).toBe('senat');
    expect(iconeCase('seance_1_o', 'AN')).toBe('an');
    expect(iconeCase('commission_1_s', 'SENAT')).toBe('commission');
  });

  it('bande : sans objet masquées, étape affichée mise en avant, trait plein jusqu’à elle', () => {
    const cases = PARCOURS_AGRICOLE.cases;
    const pas = bandeParcours(cases, 'cmp');
    expect(pas.map((s) => s.cle)).toEqual(cases.filter((c) => c.etat !== 'sans_objet').map((c) => c.cle));
    const i = pas.findIndex((s) => s.cle === 'cmp');
    expect(pas[i].rendu).toBe('ici');
    expect(pas.slice(0, i + 1).every((s) => s.traitPlein)).toBe(true);
    expect(pas.slice(i + 1).some((s) => s.traitPlein)).toBe(false);
  });

  it('fourche : la branche prise seulement si la conclusion publiée la dit', () => {
    expect(fourcheEtape('cmp', { conclusion: 'Désaccord', etat: 'faite' })?.prise).toBe('Désaccord : nouvelle lecture');
    expect(fourcheEtape('cmp', { conclusion: 'Accord', etat: 'faite' })?.prise).toBe('Accord : vote du texte de la CMP');
    expect(fourcheEtape('cmp', { conclusion: null, etat: 'en_cours' })?.prise).toBeNull();
    expect(fourcheEtape('conclusions', { conclusion: 'AN : adopté · Sénat : adopté', etat: 'faite' })?.prise).toMatch(/fin de la navette/);
    expect(fourcheEtape('conclusions', { conclusion: 'AN : adopté', etat: 'faite' })?.prise).toBeNull();
    expect(fourcheEtape('seance', { conclusion: 'adopté', etat: 'faite' })).toBeNull();
  });

  it('jauges : délai calculé sur les dates publiées, majorité sur le scrutin, sinon marque visible', () => {
    const delai = jaugeDelai('Délai', caseDe({ etat: 'en_cours', debut: '2026-01-01' }), 6, '2026-04-01');
    expect(delai.fraction).toBeGreaterThan(0.45);
    expect(delai.fraction).toBeLessThan(0.55);
    expect(jaugeDelai('Délai', caseDe({ debut: null }), 6, JOUR)).toEqual({ libelle: 'Délai', valeur: '[n] / 6 mois', fraction: null });
    const scrutin = fixtures.ConsulterScrutin[0].output.scrutin;
    const [censure] = jaugesEtape('vote', caseDe({}), [{ ...scrutin, decompte: { pour: 260, contre: 0, abstention: 0 } }], JOUR);
    expect(censure.valeur).toBe('260 / 289');
    expect(jaugesEtape('vote', caseDe({}), [], JOUR)[0].fraction).toBeNull();
    expect(jaugesEtape('recueil', caseDe({}), [], JOUR)[0].valeur).toBe('[n] / [n]');
  });

  it('rendu sur chaque étape des fixtures : titre, état, documents, jamais « échec »', () => {
    for (const e of fixtures.ConsulterEtape) {
      const t = texte(rendre(<ContenuEtape fiche={e.output} jour={JOUR} />));
      expect(t, e.titre).toContain(e.output.case.libelle);
      expect(t).toContain(`Étape ${e.output.numero} sur`);
      expect(t).not.toMatch(/échec/i);
      for (const d of e.output.documents) expect(t).toContain(d.titre);
      for (const d of e.output.deviations) expect(t).toContain(d.libelle);
    }
  });

  it('commission : le rapporteur publié est nommé ; sans personnes dans la fiche, il est marqué indisponible', () => {
    const e = fixtures.ConsulterEtape.find((x) => x.input.cle === 'commission_1_o')!.output;
    const t = texte(rendre(<ContenuEtape fiche={e} jour={JOUR} />));
    expect(t).toContain('Camille Exemple Députée · Groupe A · rapporteure · Commission des affaires économiques');
    expect(t).not.toContain('non publié dans la fiche de l’étape');
    for (const c of e.chiffres) expect(t).toContain(c.libelle);
    const { personnes: _p, ...sans } = e;
    const t2 = texte(rendre(<ContenuEtape fiche={sans} jour={JOUR} />));
    expect(t2).toContain('Rapporteur');
    expect(t2).toContain('non publié dans la fiche de l’étape');
  });

  it('CMP : son président publié ; 49.3 : le Premier ministre seulement s’il l’est ce jour-là (fixture réelle)', () => {
    const cmp = fixtures.ConsulterEtape.find((x) => x.input.cle === 'cmp')!.output;
    expect(texte(rendre(<ContenuEtape fiche={cmp} jour={JOUR} />))).toContain('Paul Fictif Sénateur · Groupe S2 · Président · Commission mixte paritaire');
    const declaration = fixtures.ConsulterEtape.find((x) => x.input.dossier === 'DLR5L17N53597' && x.input.cle === 'declaration')!.output;
    const t = texte(rendre(<ContenuEtape fiche={declaration} jour={JOUR} />));
    expect(t).toContain('Sébastien Lecornu Premier ministre');
    expect(t).not.toContain('non publié dans la fiche de l’étape');
    // Initiateur publié sans la fonction de Premier ministre : pas de nom, la marque.
    const sansPm = { ...declaration, personnes: [] };
    expect(texte(rendre(<ContenuEtape fiche={sansPm} jour={JOUR} />))).toContain('Premier ministre [—] non publié dans la fiche de l’étape');
    expect(personnesAttendues(definitionEtape('declaration'), declaration.personnes)[0].trouvees).toHaveLength(1);
    expect(membresEtape([{ role: 'membre', qui: { type: 'nom_publie', nom: 'X', qualite: null }, detail: '' }])).toHaveLength(1);
  });

  it('le modèle du dossier précise la sorte : création d’une mission, délai de six mois des seules commissions d’enquête', () => {
    expect(definitionEtape('creation', 'mission_information')).toMatchObject({ icone: 'mission', note: null });
    expect(definitionEtape('creation', 'commission_enquete').icone).toBe('enquete');
    const rapport = { ...PARCOURS_AGRICOLE.cases[0], cle: 'rapport', debut: '2026-01-01', fin: '2026-03-01', etat: 'faite' as const };
    expect(jaugesEtape('rapport', rapport, [], JOUR, 'mission_information')).toEqual([]);
    expect(jaugesEtape('rapport', rapport, [], JOUR, 'commission_enquete')).toHaveLength(1);
    expect(jaugesEtape('rapport', rapport, [], JOUR)).toHaveLength(1);
    const [soutiens] = jaugesEtape('recueil', rapport, [], JOUR);
    expect(soutiens).toMatchObject({ valeur: '[n] / [n]', fraction: null, absence: 'Décompte du ministère de l’Intérieur : absent des sources chargées.' });
  });

  it('CMP en désaccord : la fourche dit la branche prise et barre l’autre', () => {
    const e = fixtures.ConsulterEtape.find((x) => x.input.cle === 'cmp')!.output;
    const html = rendre(<ContenuEtape fiche={e} jour={JOUR} />);
    expect(html).toContain('Branche prise : Désaccord : nouvelle lecture');
    expect(html).toContain('Branche non prise : Accord : vote du texte de la CMP');
  });
});

describe('feuille Événement', () => {
  const engagement = PARCOURS_ENGAGEMENT.deviations[0] ?? null;
  const acceleree: DeviationParcours = PARCOURS_AGRICOLE.deviations[0];
  const depot = PARCOURS_AGRICOLE.cases.find((c) => c.cle === 'depot')!;

  it('les 8 déviations des modèles ont leur icône ; effets conditionnels des modèles', () => {
    const cles = ['procedure_acceleree', 'engagement_responsabilite', 'motion_procedure', 'irrecevabilite', 'retrait', 'retrait_ordre_du_jour', 'caducite', 'fusion'];
    expect(new Set(cles.map((c) => iconeDeviation(c, 'rejoint'))).size).toBe(8);
    expect(iconeDeviation('inconnue', 'suspend')).toBe('suspend');
    expect(EFFET_SI.engagement_responsabilite).toMatch(/motion de censure est adoptée : fin du parcours/);
    expect(EFFET_SI.irrecevabilite).toBeUndefined();
  });

  it('où et quand : lieu, étape et date publiés, date marquée sinon', () => {
    expect(ouDeviation(acceleree, depot)).toBe('Assemblée nationale · Dépôt AN · date non publiée');
    expect(ouDeviation({ ...acceleree, debut: '2026-04-08' }, null)).toBe('Étape non publiée · 08/04/2026');
  });

  it('rendu : effet en clair, effet si, fondement, action vers l’étape, actes sources', () => {
    const t = texte(rendre(<FicheDeviation deviation={acceleree} etape={depot} rattache={null} onFermer={() => {}} onEtape={() => {}} onDossier={() => {}} />));
    expect(t).toContain('Procédure accélérée');
    expect(t).toContain(EFFET_DEVIATION.rejoint);
    expect(t).toContain(EFFET_SI.procedure_acceleree);
    // Aucun effet conditionnel dans le modèle : la phrase est dite règle générale.
    expect(t).toContain('(règle générale, pas une donnée du dossier)');
    expect(t).toContain(acceleree.fondement);
    expect(t).toContain('Voir l’étape');
    expect(t).toContain('Aucune conclusion publiée');
    expect(t).toContain('Source ↗');
  });

  it('dossier rattaché (49.3) : l’action mène au dossier', () => {
    const d: DeviationParcours = engagement ?? { ...acceleree, cle: 'engagement_responsabilite', libelle: '49.3', conclusion: 'Motion de censure rejetée' };
    const rattache = { dossier: { id: 'd-493', titre: 'Engagement de responsabilité, 1re partie' }, etape: 'nouvelle_lecture', etapeLibelle: 'Nouvelle lecture' };
    const t = texte(rendre(<FicheDeviation deviation={{ ...d, cle: 'engagement_responsabilite' }} etape={depot} rattache={rattache} onFermer={() => {}} onEtape={() => {}} onDossier={() => {}} />));
    expect(t).toContain('Voir le 49.3 et la motion');
    expect(t).toContain(rattache.dossier.titre);
  });

  it('effet si : celui du modèle quand la fiche le publie ; dossier où il a lieu, motions du rattachement', () => {
    expect(effetSiDe({ cle: 'engagement_responsabilite', effetSi: 'termine' })).toEqual({ texte: EFFET_SI.engagement_responsabilite, source: 'modele' });
    expect(effetSiDe({ cle: 'engagement_responsabilite' })?.source).toBe('regle');
    expect(effetSiDe({ cle: 'irrecevabilite', effetSi: null })).toBeNull();
    const plf = fixtures.ConsulterDossier.find((x) => x.input.id === 'DLR5L17N52428')!.output;
    const d = plf.parcours!.deviations.find((x) => x.cle === 'engagement_responsabilite')!;
    const etape = plf.parcours!.cases.find((c) => c.cle === d.etape)!;
    const rattache = plf.parcours!.enfants.find((e) => e.etape === d.etape)!;
    const t = texte(
      rendre(<FicheDeviation deviation={d} dossier={{ id: plf.entete.id, titre: plf.entete.titre }} etape={etape} rattache={rattache} onFermer={() => {}} onEtape={() => {}} onDossier={() => {}} />),
    );
    expect(t).toContain('Si une motion de censure est adoptée : fin du parcours. (défini par le modèle de parcours)');
    expect(t).toContain('Dossier Projet de loi de finances pour 2026');
    expect(t).toContain('Motions 2 motions de censure, rejetées : 269 et 142 voix pour, 289 requises (règle)');
  });
});

describe('question', () => {
  it('fixtures : les questions de la fiche personne ont leur fiche, mêmes champs', () => {
    const resume = fixtures.ConsulterPersonne.flatMap((e) => (e.output.contenu.onglet === 'dossiers' ? e.output.contenu.questions.elements : []));
    for (const q of resume) {
      const f = fixtures.ConsulterQuestion.find((e) => e.input.id === q.id)?.output;
      expect(f, q.id).toBeDefined();
      expect([f!.type, f!.numero, f!.titre, f!.date, f!.dateReponse]).toEqual([q.type, q.numero, q.titre, q.date, q.dateReponse]);
      expect(ministereQuestion(f!)).toBe(q.ministere);
    }
  });

  it('QE sans réponse : en attente, durée depuis la publication, réponse attendue dans le cycle', () => {
    const q = QUESTION_QE_4521;
    expect(statutQuestion(q)).toBe('En attente de réponse');
    expect(quandQuestion(q)).toBe('publiée le 12/06/2026 (4 mois)');
    expect(cycleQuestion(q).map((s) => [s.libelle, s.rendu])).toEqual([
      ['Publiée au JO', 'faite'],
      ['Attribuée', 'faite'],
      ['Réponse au JO', 'attendue'],
    ]);
    const t = texte(rendre(<ContenuQuestion question={q} />));
    expect(t).toContain('Pas encore de réponse publiée.');
    expect(t).toContain('Ministère de la Transition énergétique');
    expect(t).not.toMatch(/échec/i);
  });

  it('QG : réponse en séance ; question et réponse publiées ensemble', () => {
    const q: FicheQuestion = { ...QUESTION_QG_1201, texteQuestion: null };
    expect(statutQuestion(q)).toBe('Réponse en séance');
    expect(texteQuestion(q).texte).toMatch(/publiées ensemble/);
    const t = texte(rendre(<ContenuQuestion question={QUESTION_QG_1201} />));
    expect(t).toContain(QUESTION_QG_1201.texteQuestion!);
    expect(t).toContain(QUESTION_QG_1201.texteReponse!);
  });

  it('QG : questions de la même séance (même jour), chacune consultable ; rien d’inventé sans la donnée', () => {
    expect(detailMemeSeance(QUESTION_QG_1201)).toBe('1 autre question au Gouvernement le 12/05/2026');
    const t = texte(rendre(<ContenuQuestion question={QUESTION_QG_1201} />));
    expect(t).toContain('Questions de la même séance');
    expect(t).toContain('n° 1202 · Prix de l’électricité pour les ménages');
    expect(t).toContain('Hugo Fictif · B');
    for (const m of QUESTION_QG_1201.memeSeance!) {
      expect(m.date).toBe(QUESTION_QG_1201.date);
      expect(fixtures.ConsulterQuestion.some((e) => e.input.id === m.id), m.id).toBe(true);
    }
    expect(detailMemeSeance({ ...QUESTION_QG_1201, memeSeance: [] })).toBe('aucune autre question publiée le 12/05/2026');
    const { memeSeance: _m, ...ancienne } = QUESTION_QG_1201;
    expect(detailMemeSeance(ancienne)).toBe('non publiées');
    expect(detailMemeSeance({ ...QUESTION_QG_1201, type: 'QOSD' })).toBe('séance non publiée avec la question');
    expect(texte(rendre(<ContenuQuestion question={QUESTION_QE_4521} />))).not.toContain('Questions de la même séance');
  });

  it('QOSD : la date d’inscription, non publiée, est marquée', () => {
    const q: FicheQuestion = { ...QUESTION_QG_1201, type: 'QOSD', statut: 'en_attente', dateReponse: null, texteReponse: null };
    expect(cycleQuestion(q).map((s) => [s.libelle, s.detail, s.rendu])).toEqual([
      ['Déposée', '12/05', 'faite'],
      ['Inscrite', 'non publiée', 'inconnue'],
      ['Réponse orale', '', 'attendue'],
    ]);
    expect(quandQuestion(q)).toBe('déposée le 12/05/2026 (5 mois)');
  });

  it('close sans réponse : la clôture publiée, telle quelle', () => {
    const q: FicheQuestion = { ...QUESTION_QE_4521, statut: 'close', cloture: { libelle: 'Retirée', date: '2026-09-01' } };
    expect(statutQuestion(q)).toBe('Retirée');
    expect(quandQuestion(q)).toBe('le 01/09/2026');
  });
});
