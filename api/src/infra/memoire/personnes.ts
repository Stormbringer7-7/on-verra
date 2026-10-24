// Adaptateur mémoire de PersonnesRepository : annuaire, classement et fiches des personnes des
// fixtures. L'annuaire filtre et compte ce qu'il connaît (le total est celui de sa liste).

import type { ContenuOngletPersonne, DemandeClassement, FiltreAnnuaire, OngletPersonne } from '@contrat/domain/model';
import { normaliser } from '@contrat/domain/texte';

import type { Pagination, PersonnesRepository } from '../../ports';
import { type DonneesMemoire, paginer, premier } from './donnees';

export class PersonnesMemoire implements PersonnesRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  private async onglet<O extends OngletPersonne>(id: string, onglet: O): Promise<Extract<ContenuOngletPersonne, { onglet: O }> | null> {
    const { exemples } = await this.donnees;
    const contenu = premier(exemples.ConsulterPersonne, (e) => e.output.entete.id === id && e.output.contenu.onglet === onglet)?.output.contenu;
    return (contenu as Extract<ContenuOngletPersonne, { onglet: O }> | undefined) ?? null;
  }

  async annuaire(filtre: FiltreAnnuaire, pagination: Pagination) {
    const { exemples } = await this.donnees;
    const tous = premier(exemples.ListerPersonnes, (e) => !e.input.role && !e.input.q)?.output;
    // Un rôle qui a son exemple (élus locaux : fiches RNE seules comprises) ; sinon la liste filtrée.
    const duRole = filtre.role ? premier(exemples.ListerPersonnes, (e) => e.input.role === filtre.role && !e.input.q)?.output : undefined;
    const base = duRole?.personnes.elements ?? (tous?.personnes.elements ?? []).filter((p) => !filtre.role || p.role === filtre.role);
    const q = filtre.q ? normaliser(filtre.q.trim()) : '';
    const personnes = base.filter((p) => !q || normaliser(p.nom).includes(q));
    return { effectifs: tous?.effectifs ?? [], personnes: paginer(personnes, pagination) };
  }

  async classement(demande: DemandeClassement) {
    const { exemples } = await this.donnees;
    const meme = (ordre: 'asc' | 'desc') =>
      premier(exemples.ClasserPersonnes, (e) => e.input.chambre === demande.chambre && e.input.critere === demande.critere && e.input.ordre === ordre)?.output;
    const exact = meme(demande.ordre);
    const inverse = exact ? undefined : meme(demande.ordre === 'asc' ? 'desc' : 'asc');
    const source = exact ?? inverse;
    const lignes = (inverse ? [...inverse.lignes].reverse().map((l, i) => ({ ...l, rang: i + 1 })) : (source?.lignes ?? [])).slice(0, demande.limite ?? 20);
    return {
      themesAppliques: source?.themesAppliques ?? [],
      themesDisponibles: source?.themesDisponibles ?? [],
      periode: source?.periode ?? { debut: '', fin: null },
      explication: source?.explication ?? '',
      lignes,
    };
  }

  async entete(id: string) {
    const { exemples } = await this.donnees;
    return premier(exemples.ConsulterPersonne, (e) => e.output.entete.id === id)?.output.entete ?? null;
  }

  async fonctions(id: string) {
    const parcours = await this.onglet(id, 'parcours');
    if (parcours) return parcours.fonctions;
    const { exemples } = await this.donnees;
    return premier(exemples.ExpliquerVote, (e) => e.input.personne === id)?.output.parcours ?? [];
  }

  async choix(id: string) {
    const c = await this.onglet(id, 'choix');
    return { indicateurs: c?.indicateurs ?? [], note: c?.note ?? null, themes: c?.themes ?? [] };
  }

  async roles(id: string) {
    return (await this.onglet(id, 'dossiers'))?.roles ?? [];
  }

  async questions(id: string, pagination: Pagination) {
    const q = (await this.onglet(id, 'dossiers'))?.questions;
    const elements = q?.elements ?? [];
    return paginer(elements, pagination, Math.max(q?.total ?? 0, elements.length));
  }

  async actesSurLeDossier(personne: string, dossier: string) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ExpliquerVote, (x) => x.input.personne === personne && x.output.scrutin.dossier?.id === dossier)?.output;
    return e?.actes ?? [];
  }
}
