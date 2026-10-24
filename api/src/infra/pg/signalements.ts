// Adaptateur Postgres du SignalementsRepository : « Signaler une erreur ou une source manquante ».
// Seule écriture de l'API : un INSERT dans `analytique.signalement` (statut NOUVEAU par défaut),
// jamais dans `canon`. L'utilisateur Postgres de l'API n'a besoin que du droit INSERT sur cette table.
//
// La table n'a ni colonne pour l'écran d'origine ni pour un identifiant qui n'est pas un UUID :
// ils sont ajoutés en fin de message, sur des lignes à part, pour la relecture.

import type { AccuseSignalement, Signalement } from '@contrat/domain/model';
import type { SignalementsRepository, SqlDatabase } from '../../ports';
import { estUuid } from './scrutins';

export class PgSignalements implements SignalementsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async enregistrer(signalement: Signalement): Promise<AccuseSignalement> {
    const { cible, ecran } = signalement;
    const id = cible.id && estUuid(cible.id) ? cible.id : null;
    const message = [
      signalement.message.trim(),
      ecran ? `— écran : ${ecran}` : null,
      cible.id && !id ? `— identifiant : ${cible.id}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const contact = signalement.contact?.trim() || null;
    const ligne = await this.db.first<{ id: string; recu_le: Date }>(
      `INSERT INTO analytique.signalement (cible_type, cible_id, message, contact)
       VALUES ($type, $id::uuid, $message, $contact)
       RETURNING signalement_id AS id, cree_le AS recu_le`,
      { $type: cible.type, $id: id, $message: message, $contact: contact },
    );
    if (!ligne) throw new Error('Signalement non enregistré');
    return { id: ligne.id, recuLe: ligne.recu_le.toISOString() };
  }
}
