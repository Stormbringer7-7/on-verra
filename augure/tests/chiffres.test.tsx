// Chiffres, « Où en sont les textes » : phrases (durées, files, délais) et rendu de la carte et des
// attentes hors du Parlement sur les fixtures ; un dépassement est toujours « à vérifier », jamais
// « bloqué ». Composants du design system v2 (fondations.tsx). Rendu HTML par react-native-web.

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AVANCEMENT } from '../src/infra/fixtures/avancement';
import { ATTENDUS, acteur, compteFile, demandeTextes, duree, largeurFile, medianeFile, situationTexte, texteDelai } from '../src/ui/avancement';
import { CarteAvancement, HorsParlement, Limites } from '../src/ui/components/chiffres/Avancement';
import { Avertissement, AvantApres, IndicateurEchelle, PastilleStatut } from '../src/ui/components/fondations';

// Les écrans naviguent par `useAller` : hors navigateur, une version sans effet.
vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));

const rendre = (el: ReactElement) => renderToStaticMarkup(el);
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('phrases de « Où en sont les textes »', () => {
  it('durées en jours, et en mois au-delà de deux mois', () => {
    expect(duree(1)).toBe('1 jour');
    expect(duree(16)).toBe('16 jours');
    expect(duree(404)).toBe('404 jours (environ 13 mois)');
  });

  it('comptes d’une file, médiane, largeur relative', () => {
    expect(compteFile({ enExamen: 99, enAttente: 1435 })).toBe('99 en examen · 1 435 attendent la suite');
    expect(compteFile({ enExamen: 0, enAttente: 1 })).toBe('1 attend la suite');
    expect(medianeFile({ attenteMediane: null })).toBeNull();
    expect(medianeFile({ attenteMediane: 23 })).toBe('Attente médiane : 23 jours');
    expect(largeurFile({ enExamen: 1, enAttente: 1 }, 4)).toBe(50);
    expect(largeurFile({ enExamen: 0, enAttente: 0 }, 0)).toBe(0);
  });

  it('situation, délai, acteur : où, depuis quand, quel texte fixe le délai', () => {
    expect(situationTexte({ situation: 'en_examen', depuis: '2026-10-17', jours: 7 })).toBe('En examen depuis le 17 octobre 2026 (7 jours)');
    expect(situationTexte({ situation: 'en_attente', depuis: null, jours: null })).toBe('Attend la suite (date non publiée)');
    expect(texteDelai({ delai: null })).toBe('Aucun délai fixé par un texte');
    expect(texteDelai(AVANCEMENT.horsParlement[0])).toMatch(/^Date limite : 16 octobre 2026 \(Constitution, art\. 10/);
    expect(acteur('PR')).toBe('Président de la République');
    expect(ATTENDUS.decision_cc).toBe('Décision du Conseil constitutionnel');
  });

  it('demande de la liste : rien de vide, pas de page 1 (même entrée que les fixtures)', () => {
    expect(demandeTextes({ etape: 'Nouvelle lecture', page: 1 })).toEqual({ etape: 'Nouvelle lecture' });
    expect(demandeTextes({ horsParlement: false, origine: undefined })).toEqual({});
    expect(demandeTextes({ horsParlement: true, page: 2 })).toEqual({ horsParlement: true, page: 2 });
  });
});

describe('carte « Où en sont les textes »', () => {
  const t = texte(rendre(<CarteAvancement avancement={AVANCEMENT} />));

  it('total, une barre par file avec ses comptes et le plus ancien', () => {
    expect(t).toContain('Où en sont les textes');
    expect(t).toContain('textes en cours ou en attente, au 24 octobre 2026');
    for (const f of AVANCEMENT.files) expect(t).toContain(f.etape);
    expect(t).toContain('1 en examen · Attente médiane : 16 jours');
    expect(t).toContain('Le plus ancien : Compte épargne-temps universel (23 jours)');
  });

  it('jamais le mot « bloqué »', () => {
    expect(t).not.toMatch(/bloqu/i);
  });
});

describe('hors du Parlement', () => {
  const t = texte(rendre(<HorsParlement avancement={AVANCEMENT} />));

  it('qui doit agir, depuis quand, délai, et le dépassement à vérifier avec son motif', () => {
    expect(t).toContain('Promulgation · Président de la République');
    expect(t).toContain('Décision du Conseil constitutionnel · Conseil constitutionnel');
    expect(t).toContain('Délai dépassé de 8 jours : à vérifier');
    expect(t).toContain('Aucun acte publié dans nos sources après la date limite');
    expect(t).toContain('ce n’est pas la preuve d’un retard');
    expect(t).not.toMatch(/bloqu/i);
  });

  it('les limites, telles que l’API les donne', () => {
    const l = texte(rendre(<Limites limites={AVANCEMENT.limites} />));
    for (const limite of AVANCEMENT.limites) expect(l).toContain(limite);
    expect(rendre(<Limites limites={[]} />)).toBe('');
  });
});

describe('composants v2', () => {
  it('avertissement : symbole du type, titre, texte, lien', () => {
    const t = texte(rendre(<Avertissement type="prudence" titre="À vérifier" lien={{ libelle: 'Méthode →', onPress: () => {} }}>Texte</Avertissement>));
    expect(t).toBe('! À vérifier Texte Méthode →');
  });

  it('pastille de statut : établi ou à vérifier', () => {
    expect(texte(rendre(<PastilleStatut statut="etabli" />))).toBe('Fait établi');
    expect(texte(rendre(<PastilleStatut statut="a_verifier" />))).toBe('Rapprochement à vérifier');
  });

  it('avant / après : le retiré dans Avant seulement, l’ajouté dans Après seulement', () => {
    const t = texte(
      rendre(
        <AvantApres
          morceaux={[
            { type: 'egal', texte: 'objectif de ' },
            { type: 'retire', texte: '40 %' },
            { type: 'ajoute', texte: '45 %' },
          ]}
        />,
      ),
    );
    expect(t).toBe('Avant objectif de 40 % Après objectif de 45 %');
  });

  it('indicateur : chiffre, unité en phrase, échelle lisible sans la voir', () => {
    const html = rendre(
      <IndicateurEchelle
        etiquette="Présence aux votes"
        valeur="88"
        unite="votes sur 100"
        echelle={{ valeur: 88, mediane: 79, quartiles: [70, 86], libelle: '88 votes sur 100 ; médiane 79' }}
      />,
    );
    expect(texte(html)).toContain('Présence aux votes 88 votes sur 100');
    expect(html).toContain('aria-label="88 votes sur 100 ; médiane 79"');
  });
});
