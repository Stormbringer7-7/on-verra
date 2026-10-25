// Adaptateur mémoire de ScrutinsRepository : les scrutins cités par les fixtures (fiches des
// dossiers d'abord, puis Accueil, étapes, fiches de scrutin), leurs fiches et les votes connus.

import type { CleCase, ScrutinResume } from '@contrat/domain/model';

import type { ScrutinsRepository } from '../../ports';
import { type DonneesMemoire, premier } from './donnees';

export class ScrutinsMemoire implements ScrutinsRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  private async tous(): Promise<ScrutinResume[]> {
    const { exemples } = await this.donnees;
    const liste = [
      ...exemples.ConsulterDossier.flatMap((e) => e.output.scrutins),
      ...exemples.ConsulterAccueil.flatMap((e) => e.output.votes),
      ...exemples.ConsulterEtape.flatMap((e) => e.output.votes),
      ...exemples.ConsulterScrutin.map((e) => e.output.scrutin),
      ...exemples.ExpliquerVote.map((e) => e.output.scrutin),
    ];
    return liste.filter((s, i) => liste.findIndex((x) => x.id === s.id) === i);
  }

  /**
   * La maquette fixe les votes montrés pour la semaine de l'Accueil (le canevas y met aussi des
   * votes des jours précédents) : cette semaine-là rend la liste de l'Accueil, telle quelle.
   */
  async entre(debut: string, fin: string, limite: number) {
    const { exemples } = await this.donnees;
    const accueil = premier(exemples.ConsulterAccueil, (e) => e.output.semaine.debut === debut && e.output.semaine.fin === fin);
    if (accueil) return accueil.output.votes.slice(0, limite);
    return (await this.tous())
      .filter((s) => s.date >= debut && s.date <= fin)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limite);
  }

  async duDossier(dossier: string, cle?: CleCase) {
    return (await this.tous()).filter((s) => s.dossier?.id === dossier && (cle === undefined || s.etape?.cle === cle));
  }

  async surAmendement(amendement: string) {
    const { exemples } = await this.donnees;
    const fiche = premier(exemples.ConsulterScrutin, (e) => e.output.objet.type === 'amendement' && e.output.objet.amendement.id === amendement);
    if (fiche) return fiche.output.scrutin;
    const vote = premier(exemples.ConsulterAmendement, (e) => e.input.id === amendement)?.output.vote;
    return vote?.type === 'scrutin_public' ? vote.scrutin : null;
  }

  async fiche(id: string) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ConsulterScrutin, (x) => x.input.id === id)?.output;
    if (!e) return null;
    const { barre: _barre, ...reste } = e;
    return reste;
  }

  async vote(scrutin: string, personne: string) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ExpliquerVote, (x) => x.input.scrutin === scrutin && x.input.personne === personne)?.output;
    return e ? { vote: e.vote, groupe: e.groupe } : null;
  }

  async derniersEcarts(personne: string, limite: number) {
    const { exemples } = await this.donnees;
    const choix = premier(exemples.ConsulterPersonne, (e) => e.output.entete.id === personne && e.output.contenu.onglet === 'choix')?.output.contenu;
    return choix?.onglet === 'choix' ? choix.derniersEcarts.slice(0, limite) : [];
  }
}
