// Fixtures de maquette : chaque commande du contrat a ses exemples, au format exact du contrat
// (vérifié à la compilation par le type `Fixtures`), et les règles de fond sont respectées
// partout : liens à vérifier sans cible, indicateurs comparés, provenance complète, JSON pur.

import { describe, expect, it } from 'vitest';

import * as definitions from '../src/core/commands/definitions';
import { fixtures, type Fixtures } from '../src/infra/fixtures';

type Noeud = { chemin: string; valeur: Record<string, unknown> };

/** Tous les objets d'une valeur, avec leur chemin, pour vérifier les règles partout. */
function objets(valeur: unknown, chemin = '$', acc: Noeud[] = []): Noeud[] {
  if (Array.isArray(valeur)) valeur.forEach((v, i) => objets(v, `${chemin}[${i}]`, acc));
  else if (valeur && typeof valeur === 'object') {
    acc.push({ chemin, valeur: valeur as Record<string, unknown> });
    for (const [k, v] of Object.entries(valeur)) objets(v, `${chemin}.${k}`, acc);
  }
  return acc;
}

const exemples = Object.entries(fixtures as Fixtures).flatMap(([commande, liste]) =>
  (liste as { titre: string; input: unknown; output: unknown }[]).map((e) => ({ commande, ...e })),
);
const noeuds = exemples.flatMap((e) => objets(e.output, `${e.commande} « ${e.titre} »`));

describe('fixtures du contrat', () => {
  it('donnent au moins un exemple pour chaque commande', () => {
    for (const nom of Object.keys(definitions)) {
      expect((fixtures as Record<string, unknown[]>)[nom]?.length, nom).toBeGreaterThan(0);
    }
  });

  it('ont une sortie définie, sérialisable en JSON sans perte', () => {
    for (const e of exemples) {
      expect(e.output, `${e.commande} « ${e.titre} »`).toBeDefined();
      expect(JSON.parse(JSON.stringify(e.output)), `${e.commande} « ${e.titre} »`).toEqual(e.output);
      expect(JSON.parse(JSON.stringify(e.input))).toEqual(e.input);
    }
  });

  it('ont des entrées distinctes pour une même commande', () => {
    for (const [commande, liste] of Object.entries(fixtures)) {
      const cles = (liste as { input: unknown }[]).map((e) => JSON.stringify(e.input));
      expect(new Set(cles).size, commande).toBe(cles.length);
    }
  });

  it('ne présentent jamais un lien à vérifier comme certain', () => {
    const liens = noeuds.filter((n) => n.valeur.statut === 'verifie' || n.valeur.statut === 'a_verifier');
    expect(liens.some((n) => n.valeur.statut === 'a_verifier')).toBe(true);
    for (const { chemin, valeur } of liens) {
      if ('rapprochement' in valeur) {
        // Lien<T> : cible si vérifié, candidat sinon, et le rapprochement porte le même statut.
        const rapprochement = valeur.rapprochement as { statut: string };
        expect(rapprochement.statut, chemin).toBe(valeur.statut);
        if (valeur.statut === 'verifie') expect('cible' in valeur && !('candidat' in valeur), chemin).toBe(true);
        else expect('candidat' in valeur && !('cible' in valeur), chemin).toBe(true);
      } else {
        // Rapprochement seul : un « à vérifier » dit toujours ce qu'il n'établit pas.
        expect(typeof valeur.motif, chemin).toBe('string');
        if (valeur.statut === 'a_verifier') expect(String(valeur.avertissement ?? ''), chemin).not.toBe('');
      }
    }
  });

  it('ne donnent jamais un indicateur sans référence ni dénominateur', () => {
    const indicateurs = noeuds.filter((n) => 'ceQueLaDonneeNeDitPas' in n.valeur);
    expect(indicateurs.length).toBeGreaterThan(0);
    for (const { chemin, valeur } of indicateurs) {
      expect((valeur.reference as { libelle: string }).libelle, chemin).not.toBe('');
      expect(valeur.denominateur, chemin).not.toBeNull();
      expect(typeof valeur.calcul, chemin).toBe('string');
    }
  });

  it('donnent une couleur et sa source à tout groupe', () => {
    const groupes = noeuds.filter((n) => 'abrege' in n.valeur && 'chambre' in n.valeur && 'libelle' in n.valeur);
    expect(groupes.length).toBeGreaterThan(0);
    for (const { chemin, valeur } of groupes) {
      expect(String(valeur.couleur ?? ''), chemin).toMatch(/^#[0-9a-f]{6}$/i);
      expect(['officielle', 'famille', 'gauche_droite', 'arbitraire'], chemin).toContain(valeur.sourceCouleur);
    }
  });

  it('donnent une provenance complète à chaque fait sourcé', () => {
    const provenances = noeuds.filter((n) => 'idNatif' in n.valeur);
    expect(provenances.length).toBeGreaterThan(0);
    for (const { chemin, valeur } of provenances) {
      expect(['AN', 'SENAT', 'LEGIFRANCE', 'CONSTIT', 'HATVP', 'RNE', 'INSEE', 'CIVICTRACE'], chemin).toContain(valeur.systeme);
      expect(valeur.idNatif, chemin).not.toBe('');
      expect(typeof valeur.type, chemin).toBe('string');
      // Fixtures fictives : aucune URL ne mène à un vrai site.
      if (valeur.url !== null) expect(String(valeur.url), chemin).toMatch(/^https:\/\/panoptique\.invalid\//);
    }
  });

  it('montrent l’absence de synthèse (« Pas de synthèse disponible »)', () => {
    const location = fixtures.ConsulterDossier.find((e) => e.input.id === 'dossier-location')!.output;
    expect(location.entete.titreEnClair).toBeNull();
    expect(location.entete.resumeEnClair).toBeNull();
    for (const i of fixtures.ListerInterventions.flatMap((e) => e.output.interventions.elements)) expect(i.synthese).toBeNull();
  });

  it('suivent la projection du parcours : au plus une case courante, cases connues du gabarit', () => {
    for (const e of fixtures.ConsulterDossier) {
      const cases = e.output.parcours!.cases;
      expect(cases.filter((c) => c.courante).length, e.titre).toBeLessThanOrEqual(1);
      expect(cases.map((c) => c.rang), e.titre).toEqual(cases.map((_, i) => i + 1));
      for (const c of cases) if (c.etat === 'a_venir' || c.etat === 'sans_objet') expect(c.fin, `${e.titre} ${c.cle}`).toBeNull();
    }
  });

  it('donnent chaque parlementaire de l’hémicycle, cohérent avec les décomptes par groupe', () => {
    for (const e of fixtures.ConsulterScrutin) {
      const f = e.output;
      for (const g of f.groupes) {
        const votes = f.votes.filter((v) => v.personne.groupe?.id === g.groupe.id);
        const n = (p: string) => votes.filter((v) => v.position === p).length;
        expect([n('pour'), n('contre'), n('abstention'), n('non_votant'), n('absent')], `${e.titre} ${g.groupe.abrege}`).toEqual([
          g.decompte.pour, g.decompte.contre, g.decompte.abstention, g.nonVotants, g.absents,
        ]);
      }
      expect(new Set(f.votes.map((v) => v.personne.id)).size, e.titre).toBe(f.votes.length);
      for (const d of f.votesDifferents.personnes) {
        expect(f.votes.find((v) => v.personne.id === d.personne.id)?.position, `${e.titre} ${d.personne.nom}`).toBe(d.position);
      }
    }
    for (const e of fixtures.ConsulterInstitution) {
      const i = e.output;
      if (i.type !== 'an' && i.type !== 'senat') continue;
      expect(i.membres.length, e.titre).toBe(i.sieges);
      for (const g of i.groupes) expect(i.membres.filter((m) => m.personne.groupe?.id === g.groupe.id).length, g.groupe.abrege).toBe(g.sieges);
    }
  });

  it('ne contiennent ni date de naissance ni adresse', () => {
    const texte = JSON.stringify(fixtures);
    expect(texte).not.toMatch(/naissance|adresse|"ne_le"|domicile/i);
  });
});
