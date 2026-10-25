// Contrat sur l'adaptateur mémoire : la suite générique, puis la preuve que les handlers, joués
// sur les dépôts mémoire et le synthétiseur de maquette, redonnent les sorties des fixtures.
// Les seuls écarts tolérés sont listés ici, avec leur raison : ils viennent des fixtures ou des
// ports (signalés au lot contrat), et le test échoue si un écart apparaît ou disparaît.

import { describe, expect, it } from 'vitest';

import type { Command } from '@contrat/commands/bus';
import { fixtures } from '@fixtures';

import { cleSujet } from '../../src/infra/memoire/donnees';
import { memoire } from '../../src/infra/memoire';
import { type NomCommande, a, commande, coreDeTest, differences } from '../support';
import { type Retiree, suiteContrat } from './suite';

const EXEMPLES: Command[] = (Object.keys(fixtures) as NomCommande[]).flatMap((nom) =>
  fixtures[nom].map((e) => commande(nom, e.input as never)),
);

/** Retirées simulées : dans des listes seulement (un dossier, un amendement, un représentant). */
const RETIREES: Retiree[] = [
  { id: 'dossier-video', type: 'dossier' },
  { id: 'amdt-com56', type: 'amendement' },
  { id: 'ri-conso', type: 'representant' },
];

suiteContrat('mémoire (fixtures)', () => memoire({ retirees: RETIREES.map((r) => r.id) }).depots, {
  exemples: EXEMPLES,
  retirees: async () => RETIREES,
});

/** Écarts connus entre la sortie des handlers et la fixture, par titre d'exemple. */
const ECARTS: Record<string, { chemins: string[]; raison: string }> = {
  'Énergie · Commission AN (changements, à vérifier compris)': {
    chemins: ['resume'],
    raison: 'resume_etape : la fixture du dossier (etapes[1].resume = null) et celle de l’étape ont deux textes pour le même sujet',
  },
  'Énergie · Séance AN (votes, Qui intervient)': {
    chemins: ['resume'],
    raison: 'resume_etape : idem (etapes[2].resume = null dans la fiche du dossier)',
  },
  'Énergie · Conseil constitutionnel (en cours)': {
    chemins: ['resume'],
    raison: 'resume_etape : idem (deux textes différents)',
  },
  'Pourquoi Camille Exemple a voté contre': {
    chemins: ['personne.fonction', 'surLeTheme', 'declarations.auTheme'],
    raison:
      'fonction « de contexte » sans port qui la donne (le cœur la compose depuis l’en-tête) ; surLeTheme non null dans la fixture alors qu’aucun thème n’est attribué (contrat.md : null) et qu’aucun port ne le fournit ; auTheme suit',
  },
  Annuaire: {
    chemins: ['personnes.total'],
    raison: 'pagination incohérente dans la fixture (total 961, 9 éléments, suivante null) : la mémoire compte ce qu’elle a',
  },
  'Claire Exemple · ses choix (ne vote pas)': {
    chemins: ['entete.enCours'],
    raison: 'deux en-têtes différents pour la même personne selon l’onglet (PersonnesRepository.entete n’en rend qu’un)',
  },
};

describe('mémoire : les handlers rejouent les fixtures du contrat', () => {
  for (const nom of Object.keys(fixtures) as NomCommande[]) {
    for (const exemple of fixtures[nom]) {
      it(`${nom} · ${exemple.titre}`, async () => {
        const m = memoire();
        const bus = coreDeTest(m.depots, { synthetiseur: m.synthetiseur, horloge: m.horloge });
        const sortie = await bus.execute(commande(nom, exemple.input as never));
        const ecarts = differences(sortie, exemple.output);
        expect(ecarts, ecarts.map((c) => `${c} : ${JSON.stringify(a(sortie, c))} ≠ ${JSON.stringify(a(exemple.output, c))}`).join('\n')).toEqual(
          ECARTS[exemple.titre]?.chemins ?? [],
        );
      });
    }
  }

  it('les synthèses contradictoires des fixtures sont celles attendues', async () => {
    const { conflits } = await memoire().donnees;
    expect(conflits.map((c) => cleSujet(c.sujet))).toEqual(
      (['commission_1_o', 'seance_1_o', 'cc'] as const).map((cle) => cleSujet({ type: 'resume_etape', dossier: 'dossier-energie', cle })),
    );
  });

  it('signalement : accusé numéroté, gardé par le dépôt mémoire', async () => {
    const m = memoire({ maintenant: () => '2026-10-24T12:00:00+02:00' });
    const bus = coreDeTest(m.depots);
    const accuse = await bus.execute(commande('SignalerErreur', { cible: { type: 'scrutin', id: 'scrutin-an-1874' }, message: '  Mauvais décompte  ' }));
    expect(accuse).toEqual({ id: 'signalement-fictif-1', recuLe: '2026-10-24T12:00:00+02:00' });
    expect(m.depots.signalements.recus).toEqual([{ cible: { type: 'scrutin', id: 'scrutin-an-1874' }, message: 'Mauvais décompte', ...accuse }]);
  });
});
