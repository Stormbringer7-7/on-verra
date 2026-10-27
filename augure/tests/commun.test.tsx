// Composants partagés (components/commun), rendus en HTML par react-native-web : un lien à vérifier
// ne montre jamais sa cible comme un fait, une synthèse absente est dite, un indicateur porte sa
// référence, une source son identifiant, la barre masque les cases sans objet.

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { CaseCompacte, Indicateur, Lien, Parcours } from '../src/core';
import { fixtures } from '../src/infra/fixtures';
import { creerFixturesBus } from '../src/infra/FixturesBus';
import { PARCOURS_AGRICOLE, PARCOURS_CADUC_SENAT, PARCOURS_ENGAGEMENT, PARCOURS_FIN_DE_VIE } from '../src/infra/fixtures/parcours';
import { BarreCompacte } from '../src/ui/components/commun/BarreParcours';
import { RailParcours } from '../src/ui/components/commun/RailParcours';
import { IndicateurVue } from '../src/ui/components/commun/IndicateurVue';
import { LienStatut } from '../src/ui/components/commun/LienStatut';
import { LIBELLE_SIGNALER, Signaler, signalement } from '../src/ui/components/commun/Signaler';
import { Source } from '../src/ui/components/commun/Source';
import {
  aSynthese,
  aucuneSynthese,
  casesVisibles,
  dureeLisible,
  etatFinal,
  evenementDe,
  legendeBarre,
  lignesRail,
  MENTION_CANDIDAT,
  type LigneRail,
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
  const cas = (cle: string, libelle: string, etat: CaseCompacte['etat'], plus: Partial<CaseCompacte> = {}): CaseCompacte => ({
    cle, libelle, etat, courante: false, attendue: false, deviation: false, ...plus,
  });
  const cases: CaseCompacte[] = [
    cas('depot', 'Dépôt', 'faite', { deviation: true }),
    cas('cmp', 'CMP', 'en_cours', { courante: true }),
    cas('nouvelle_lecture', 'Nouvelle lecture', 'sans_objet'),
    cas('cc', 'Conseil constit.', 'inconnu'),
    cas('jo', 'Journal officiel', 'a_venir'),
  ];

  it('masque les cases sans objet, rend chaque état, signale la déviation sans emoji', () => {
    expect(casesVisibles(cases).map((c) => c.cle)).toEqual(['depot', 'cmp', 'cc', 'jo']);
    expect(casesVisibles(cases).map(renduCase)).toEqual(['plein', 'signal', 'inconnu', 'vide']);
    const html = rendre(<BarreCompacte cases={cases} />);
    expect(html).toContain(
      'Dépôt : faite, avec une déviation ; CMP : en cours, étape actuelle ; Conseil constit. : état inconnu ; Journal officiel : à venir',
    );
    expect(html).not.toContain('Nouvelle lecture');
    // icône dessinée (svg), jamais un caractère pictographique
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('légende : étape actuelle et case de l’écran', () => {
    expect(legendeBarre(cases, 'depot')).toBe('Étape actuelle : CMP · vous êtes : Dépôt');
    expect(legendeBarre(cases, 'cmp')).toBe('Étape actuelle : CMP');
  });

  const promulguee: CaseCompacte[] = [
    cas('depot', 'Dépôt', 'faite'),
    cas('cmp', 'CMP', 'sans_objet'),
    cas('cc', 'Conseil constit.', 'inconnu'),
    cas('promulgation_jo', 'Promulgation', 'faite'),
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
    const arrete: CaseCompacte[] = [cas('depot', 'Dépôt', 'faite'), cas('seance_1_o', 'Séance AN', 'faite'), cas('jo', 'Journal officiel', 'a_venir')];
    expect(etatFinal(arrete, 'rejete')).toBe('Rejeté');
    expect(etatFinal(arrete, 'retire')).toBe('Retiré');
    expect(etatFinal(arrete, 'adopte')).toBe('Adopté définitivement');
    expect(etatFinal(arrete, 'promulgue')).toBe('Promulgué');
    expect(etatFinal(arrete, 'caduc')).toBe('Caduc');
    expect(etatFinal(arrete, 'fusionne')).toBe('Fusionné');
    expect(etatFinal(arrete, 'rapport_publie')).toBe('Rapport publié');
    // En cours sans étape courante : rien n'est conclu.
    expect(etatFinal(arrete, 'en_cours')).toBeNull();
    expect(etatFinal(arrete)).toBeNull();
    expect(legendeBarre(arrete)).toBeNull();
    const fini = arrete.map((c) => (c.cle === 'jo' ? { ...c, etat: 'sans_objet' as const } : c));
    expect(etatFinal(fini)).toBe('Parcours terminé');
  });

});

describe('RailParcours (parcours réels)', () => {
  const rail = (parcours: Parcours) =>
    rendre(<RailParcours parcours={parcours} onEtape={() => {}} onDeviation={() => {}} onDossier={() => {}} />);
  const etapesDe = (lignes: LigneRail[]) => lignes.flatMap((l) => (l.type === 'etape' ? [l.etape.cle] : []));

  it('urgence agricole : étapes sans objet masquées, déviation au dépôt, branche de fin de navette, attentes', () => {
    const lignes = lignesRail(PARCOURS_AGRICOLE);
    expect(etapesDe(lignes)).toEqual([
      'depot', 'commission_1_o', 'seance_1_o', 'transmission_1_s', 'commission_1_s', 'seance_1_s', 'cmp', 'conclusions_cmp', 'cc',
      'promulgation', 'jo',
    ]);
    // la déviation suit son étape, un seul niveau, et revient au rail
    const i = lignes.findIndex((l) => l.type === 'etape' && l.etape.cle === 'depot');
    expect(lignes[i + 1]).toMatchObject({ type: 'deviation', effet: 'Détour, puis retour au parcours', premiere: true, derniere: true });
    expect(lignes.find((l) => l.type === 'branche')).toMatchObject({ libelle: 'Texte de la CMP adopté : fin de la navette', vers: 'Puis directement : Conseil constitutionnel' });
    expect(lignes.filter((l) => l.type === 'attente').map((l) => (l.type === 'attente' ? l.libelle : ''))).toContain('2 semaines d’attente');
    const etape = lignes.find((l) => l.type === 'etape' && l.etape.cle === 'commission_1_o');
    expect(etape).toMatchObject({ quand: 'Du 08/04/2026 au 07/05/2026 · 4 semaines', trait: 'plein' });
    const t = texte(rail(PARCOURS_AGRICOLE));
    expect(t).toContain('Parcours suivi Loi ordinaire');
    expect(t).toContain('Comparer au droit commun');
    expect(t).not.toContain('2e lecture AN');
    expect(rail(PARCOURS_AGRICOLE)).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('comparer au droit commun : les étapes sans objet reviennent, barrées', () => {
    const lignes = lignesRail(PARCOURS_AGRICOLE, true);
    expect(etapesDe(lignes)).toHaveLength(16);
    expect(lignes.find((l) => l.type === 'etape' && l.etape.cle === 'lecture_2_o')).toMatchObject({ quand: 'Sans objet', nature: 'Conditionnelle' });
  });

  it('fin de vie : CMP en désaccord, branche vers la nouvelle lecture', () => {
    const lignes = lignesRail(PARCOURS_FIN_DE_VIE);
    expect(lignes.find((l) => l.type === 'branche')).toMatchObject({ vers: 'Puis directement : Nouvelle lecture' });
    expect(etapesDe(lignes)).not.toContain('conclusions_cmp');
  });

  it('49.3 : parcours du Gouvernement, « Événement de » le texte à son étape', () => {
    expect(etapesDe(lignesRail(PARCOURS_ENGAGEMENT))).toEqual(['declaration', 'motion', 'debat', 'vote']);
    expect(evenementDe(PARCOURS_ENGAGEMENT.parent!)).toBe('Événement de : Projet de loi de finances pour 2026 · Nouvelle lecture');
  });

  it('caduc au Sénat : la déviation termine le parcours, rien ensuite, jamais « échec »', () => {
    const lignes = lignesRail(PARCOURS_CADUC_SENAT);
    expect(etapesDe(lignes)).toEqual(['depot']);
    expect(lignes[1]).toMatchObject({ type: 'deviation', effet: 'Fin du parcours', trait: 'aucun' });
    expect(texte(rail(PARCOURS_CADUC_SENAT))).not.toMatch(/échec/i);
  });

  it('étape attendue : en attente depuis la fin de la dernière étape faite', () => {
    const attendue: Parcours = {
      ...PARCOURS_FIN_DE_VIE,
      cases: PARCOURS_FIN_DE_VIE.cases.map((c) =>
        c.cle === 'cc' ? { ...c, etat: 'a_venir', attendue: true, debut: null, fin: null, conclusion: null }
          : ['promulgation', 'jo'].includes(c.cle) ? { ...c, etat: 'a_venir', debut: null, fin: null, conclusion: null } : c,
      ),
      dateReference: '2026-07-28',
    };
    const cc = lignesRail(attendue).find((l) => l.type === 'etape' && l.etape.cle === 'cc');
    expect(cc).toMatchObject({ quand: 'En attente depuis 13 jours' });
    expect(dureeLisible(1)).toBe('1 jour');
    expect(dureeLisible(40)).toBe('6 semaines');
    expect(dureeLisible(120)).toBe('4 mois');
  });

  it('montre la prochaine échéance (dossier location des fixtures)', () => {
    const parcours = fixtures.ConsulterDossier[1].output.parcours as Parcours;
    expect(texte(rail(parcours))).toContain('Prochaine échéance : Lecture définitive AN · Séance publique le 05/11/2026 (Confirmé)');
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
