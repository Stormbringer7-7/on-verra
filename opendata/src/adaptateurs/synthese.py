"""Adaptateurs du port `Synthetiseur`. Seul `SansSynthese` est branché : aucun LLM pour l'instant,
l'application affiche « Pas de synthèse disponible »."""


class SansSynthese:
    def synthese(self, sujet_type, sujet_id, passages):
        return None
