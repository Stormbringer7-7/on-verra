// Composants partagés (components/commun), rendus en HTML par react-native-web : un lien à vérifier
// ne montre jamais sa cible comme un fait, une synthèse absente est dite, un indicateur porte sa
// référence, une source son identifiant, la barre masque les cases sans objet.

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { CaseCompacte, Indicateur, Lien, Parcours } from '../src/core';
import { fixtures } from '../src/infra/fixtures';
import { creerFixturesBus } from '../src/infra/FixturesBus';
import { BarreCompacte, BarreParcours } from '../src/ui/components/commun/BarreParcours';
import { IndicateurVue } from '../src/ui/components/commun/IndicateurVue';
import { LienStatut } from '../src/ui/components/commun/LienStatut';
import { LIBELLE_SIGNALER, Signaler, signalement } from '../src/ui/components/commun/Signaler';
import { Source } from '../src/ui/components/commun/Source';
import {
  aSynthese,
  aucuneSynthese,
  casesVisibles,
  etatFinal,
  legendeBarre,
  MENTION_CANDIDAT,
  PAS_DE_SYNTHESE,
  presentationLien,
  renduCase,
  texteSynthese,
} from '../src/ui/components/commun/statuts';
import { SyntheseVue } from '../src/ui/components/commun/SyntheseVue';
import { CoreProvider } from '../src/ui/hooks/core';

const rendre = (el: ReactElement) => renderToStaticMarkup(el);
/** Texte visible, balises retirées. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const PROV = { systeme: 'AN' as const, type: 'dossier', idNatif: 'DLR5L17N54085', url: 'https://panoptique.invalid/dossier' };

const aVerifier: Lien<{ titre: string }> = {
  statut: 'a_verifier',
  candidat: { titre: 'Amendement CE123' },
  rapprochement: {
    statut: 'a_verifier',
    methode: 'meme_sujet_meme_periode',
    motif: 'même sujet, même période',
    avertissement: 'Ce rapprochement n’établit ni contact avec l’auteure, ni influence sur l’amendement.',
  },
};
const verifie: Lien<{ titre: string }> = {
  statut: 'verifie',
  cible: { titre: 'Projet de loi de programmation énergétique' },
  rapprochement: { statut: 'verifie', methode: 'reference_explicite', motif: 'l’action cite le texte', preuve: PROV },
};

describe('LienStatut', () => {
  it('à vérifier : en-tête « À vérifier » et mention avant le candidat, avertissement après', () => {
    const t = texte(rendre(<LienStatut lien={aVerifier} libelle="Rapprochement" rendu={(c) => <span>CIBLE:{c.titre}</span>} />));
    const entete = t.indexOf('Rapprochement · À vérifier · même sujet, même période');
    const mention = t.indexOf(MENTION_CANDIDAT);
    const cible = t.indexOf('CIBLE:Amendement CE123');
    const avertissement = t.indexOf('n’établit ni contact');
    expect(entete).toBeGreaterThanOrEqual(0);
    expect(entete).toBeLessThan(mention);
    expect(mention).toBeLessThan(cible);
    expect(cible).toBeLessThan(avertissement);
    // La cible n'apparaît qu'une fois, dans l'encadré, jamais comme « Vérifié ».
    expect(t.split('CIBLE:').length).toBe(2);
    expect(t).not.toContain('Vérifié');
  });

  it('vérifié : « Vérifié · motif », la cible, et la preuve', () => {
    const t = texte(rendre(<LienStatut lien={verifie} rendu={(c) => <span>{c.titre}</span>} />));
    expect(t).toMatch(/^Vérifié · l’action cite le texte Projet de loi de programmation énergétique AN · DLR5L17N54085/);
    expect(t).not.toContain('À vérifier');
  });

  it('la présentation ne donne jamais de « fait » pour un lien à vérifier', () => {
    const vue = presentationLien(aVerifier);
    expect(vue.statut).toBe('a_verifier');
    expect('fait' in vue).toBe(false);
    expect(presentationLien(verifie)).toMatchObject({ statut: 'verifie', fait: verifie.statut === 'verifie' ? verifie.cible : null });
  });

  it('s’applique aux liens à vérifier des fixtures (intérêts, origines de modification)', () => {
    const liens: Lien<unknown>[] = [];
    const parcourir = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(parcourir);
      else if (v && typeof v === 'object') {
        if ('rapprochement' in v && 'statut' in v) liens.push(v as Lien<unknown>);
        Object.values(v).forEach(parcourir);
      }
    };
    parcourir(fixtures);
    const douteux = liens.filter((l) => l.statut === 'a_verifier');
    expect(douteux.length).toBeGreaterThan(0);
    for (const l of douteux) {
      const t = texte(rendre(<LienStatut lien={l} rendu={() => <span>CANDIDAT</span>} />));
      expect(t.indexOf('À vérifier')).toBeLessThan(t.indexOf('CANDIDAT'));
      expect(t).toContain(l.rapprochement.avertissement);
    }
  });
});

describe('SyntheseVue', () => {
  it('synthèse null : « Pas de synthèse disponible »', () => {
    const t = texte(rendre(<SyntheseVue synthese={null} />));
    expect(t).toBe(`En clair ${PAS_DE_SYNTHESE}`);
    expect(texteSynthese('  ')).toEqual({ texte: PAS_DE_SYNTHESE, absente: true });
  });

  it('liste : une seule mention quand aucune ligne n’a de synthèse', () => {
    expect(aSynthese('Objectif relevé')).toBe(true);
    expect(aSynthese(null)).toBe(false);
    expect(aSynthese(' ')).toBe(false);
    expect(aucuneSynthese([null, null, ' '])).toBe(true);
    expect(aucuneSynthese([null, 'Objectif relevé'])).toBe(false);
    // Liste vide : rien à dire (pas de mention).
    expect(aucuneSynthese([])).toBe(false);
  });

  it('synthèse présente : le texte, marqué comme synthèse', () => {
    const t = texte(rendre(<SyntheseVue synthese="Planifier l’énergie jusqu’en 2035." titre="Résumé" />));
    expect(t).toBe('Résumé Synthèse, pas un fait Planifier l’énergie jusqu’en 2035.');
  });

  it('les dossiers sans synthèse des fixtures affichent l’absence', () => {
    const location = fixtures.ConsulterDossier[1].output;
    expect(texte(rendre(<SyntheseVue synthese={location.entete.resumeEnClair} />))).toContain(PAS_DE_SYNTHESE);
  });
});

describe('IndicateurVue', () => {
  const indicateur: Indicateur = {
    libelle: 'Écarts au groupe',
    valeur: 37.5,
    unite: 'pourcentage',
    denominateur: { valeur: 21, libelle: 'votes en groupe' },
    reference: { libelle: 'son groupe sur les mêmes scrutins', valeur: 62.5 },
    ceQueLaDonneeNeDitPas: ['Les déports ne sont pas publiés.'],
    periode: { debut: '2025-10-25', fin: null },
    calcul: 'lecture.indicateur_ecarts',
  };

  it('donne la valeur, le dénominateur, la référence, la période et le calcul', () => {
    const t = texte(rendre(<IndicateurVue indicateur={indicateur} />));
    expect(t).toContain('37,5 %');
    expect(t).toContain('Sur 21 votes en groupe');
    expect(t).toContain('Par rapport à : son groupe sur les mêmes scrutins (62,5 %)');
    expect(t).toContain('Période : 25/10/2025 → en cours');
    expect(t).toContain('Ce que la donnée ne dit pas (1)');
    expect(t).toContain('Calcul : lecture.indicateur_ecarts');
  });

  it('dit quand la référence n’est pas encore calculée', () => {
    const t = texte(rendre(<IndicateurVue indicateur={{ ...indicateur, reference: { libelle: 'la moyenne des sénateurs', valeur: null } }} />));
    expect(t).toContain('Par rapport à : la moyenne des sénateurs (pas encore calculée)');
  });
});

describe('Source', () => {
  it('« Source : AN · DLR5L17N54085 », en lien si la provenance a une URL', () => {
    const avecUrl = rendre(<Source provenance={PROV} />);
    expect(texte(avecUrl)).toBe('Source : AN · DLR5L17N54085 ↗');
    expect(avecUrl).toContain('role="link"');
    const sansUrl = rendre(<Source provenance={{ ...PROV, systeme: 'SENAT', url: null }} />);
    expect(texte(sansUrl)).toBe('Source : Sénat · DLR5L17N54085');
    expect(sansUrl).not.toContain('role="link"');
    expect(texte(rendre(<Source provenance={PROV} compact />))).toBe('AN · DLR5L17N54085 ↗');
  });
});

describe('BarreParcours', () => {
  const cases: CaseCompacte[] = [
    { cle: 'depot', libelle: 'Dépôt', etat: 'faite', courante: false },
    { cle: 'cmp', libelle: 'CMP', etat: 'en_cours', courante: true },
    { cle: 'nouvelle_lecture', libelle: 'Nouvelle lecture', etat: 'sans_objet', courante: false },
    { cle: 'cc', libelle: 'Conseil constit.', etat: 'inconnu', courante: false },
    { cle: 'jo', libelle: 'Journal officiel', etat: 'a_venir', courante: false },
  ];

  it('masque les cases sans objet et rend chaque état', () => {
    expect(casesVisibles(cases).map((c) => c.cle)).toEqual(['depot', 'cmp', 'cc', 'jo']);
    expect(casesVisibles(cases).map(renduCase)).toEqual(['plein', 'signal', 'inconnu', 'vide']);
    const html = rendre(<BarreCompacte cases={cases} />);
    expect(html).toContain('Dépôt : faite ; CMP : en cours, étape actuelle ; Conseil constit. : état inconnu ; Journal officiel : à venir');
    expect(html).not.toContain('Nouvelle lecture');
  });

  it('légende : étape actuelle et case de l’écran', () => {
    expect(legendeBarre(cases, 'depot')).toBe('Étape actuelle : CMP · vous êtes : Dépôt');
    expect(legendeBarre(cases, 'cmp')).toBe('Étape actuelle : CMP');
  });

  const promulguee: CaseCompacte[] = [
    { cle: 'depot', libelle: 'Dépôt', etat: 'faite', courante: false },
    { cle: 'cmp', libelle: 'CMP', etat: 'sans_objet', courante: false },
    { cle: 'cc', libelle: 'Conseil constit.', etat: 'inconnu', courante: false },
    { cle: 'promulgation_jo', libelle: 'Promulgation', etat: 'faite', courante: false },
  ];

  it('état final : promulguée (avec la date si la barre la donne), jamais « non établie »', () => {
    expect(etatFinal(promulguee)).toBe('Promulgué');
    const datee = promulguee.map((c) => (c.cle === 'promulgation_jo' ? { ...c, debut: '2026-03-10', fin: '2026-03-12' } : c));
    expect(etatFinal(datee)).toBe('Promulgué le 12/03/2026');
    expect(legendeBarre(datee, 'depot')).toBe('Promulgué le 12/03/2026 · vous êtes : Dépôt');
    // Une étape courante : le dossier est en cours, pas d'état final.
    expect(etatFinal(cases)).toBeNull();
  });

  it('état final : état publié du dossier, ou toutes les cases faites / sans objet', () => {
    const arrete: CaseCompacte[] = [
      { cle: 'depot', libelle: 'Dépôt', etat: 'faite', courante: false },
      { cle: 'seance_1_o', libelle: '1re lecture AN', etat: 'faite', courante: false },
      { cle: 'jo', libelle: 'Journal officiel', etat: 'a_venir', courante: false },
    ];
    expect(etatFinal(arrete, 'rejete')).toBe('Rejeté');
    expect(etatFinal(arrete, 'retire')).toBe('Retiré');
    expect(etatFinal(arrete, 'adopte')).toBe('Adopté définitivement');
    expect(etatFinal(arrete, 'promulgue')).toBe('Promulgué');
    // En cours sans étape courante : rien n'est conclu.
    expect(etatFinal(arrete, 'en_cours')).toBeNull();
    expect(etatFinal(arrete)).toBeNull();
    expect(legendeBarre(arrete)).toBeNull();
    const fini = arrete.map((c) => (c.cle === 'jo' ? { ...c, etat: 'sans_objet' as const } : c));
    expect(etatFinal(fini)).toBe('Parcours terminé');
  });

  it('montre la prochaine échéance du parcours (dossier location des fixtures)', () => {
    const parcours = fixtures.ConsulterDossier[1].output.parcours as Parcours;
    const t = texte(rendre(<BarreParcours parcours={parcours} onCase={() => {}} />));
    expect(t).toContain('Prochaine échéance : Lecture définitive AN · Séance publique le 05/11/2026 (Confirmé)');
    const boutons = rendre(<BarreParcours parcours={parcours} onCase={() => {}} />).match(/role="button"/g) ?? [];
    expect(boutons.length).toBe(casesVisibles(parcours.cases).length);
  });
});

describe('Signaler', () => {
  it('affiche le lien, et construit le signalement sans contact vide', () => {
    const bus = creerFixturesBus({ debug: () => {}, warn: () => {} });
    const html = rendre(
      <CoreProvider bus={bus} source="fixtures">
        <Signaler cible={{ type: 'dossier', id: 'dossier-energie' }} ecran="Dossier" />
      </CoreProvider>,
    );
    expect(texte(html)).toBe(`${LIBELLE_SIGNALER} →`);
    expect(signalement({ type: 'dossier', id: 'd' }, 'Dossier', '  Source manquante ', ' ')).toEqual({
      cible: { type: 'dossier', id: 'd' },
      message: 'Source manquante',
      ecran: 'Dossier',
    });
  });
});
