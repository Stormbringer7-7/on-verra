"""Entrepot Postgres : schémas `brut`, `canon` et `analytique` créés par `schema_pg/`.

Le type d'une entité est le nom de sa table dans `canon` (personne, dossier, intervention…).
Les colonnes sont vérifiées contre le catalogue : une colonne inconnue est une erreur immédiate,
pas une donnée perdue. Une ligne qui change est d'abord copiée dans `canon.historique`.

Débit : UUID générés ici, types d'entité gardés en mémoire, et mode pipeline dans une
transaction (les écritures sans résultat partent par lots, sans attendre chaque réponse).
"""

import json
import uuid
from contextlib import contextmanager, nullcontext

from psycopg import pq, sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ....domaine import Affirmation, Correspondance, EnregistrementSource, IdentiteNative, Provenance, Statut

# Faits sans identité propre, rattachés à un parent et remplacés en bloc.
DEPENDANTS = {"lien", "vote", "position_groupe", "avis_amendement", "participation", "audition",
              "rubrique_declaree", "exercice_representation", "modification_article"}


# Colonnes qui référencent une entité sans être une référence à re-pointer lors d'une fusion :
# l'audit (correspondances, provenance, historique, fusions) reste attaché à l'entité d'origine.
HORS_FUSION = {("canon", "correspondance"), ("canon", "provenance"), ("canon", "historique"), ("canon", "fusion")}


def _valeur(v):
    return Jsonb(v) if isinstance(v, dict) else v


def _json(v):
    """JSONB d'un bilan qui peut contenir dates, UUID, décimaux."""
    return Jsonb(v, dumps=lambda x: json.dumps(x, default=str, ensure_ascii=False))


class EntrepotPostgres:
    def __init__(self, connexion):
        """`connexion` : psycopg.Connection en autocommit ; `transaction()` ouvre un bloc."""
        self.cx = connexion
        self._colonnes: dict[str, set[str]] = {}
        self._types: dict[uuid.UUID, str] = {}
        self._references: dict[str | None, list[tuple]] = {}

    @contextmanager
    def transaction(self):
        if self._en_transaction():
            with self.cx.transaction():        # point de sauvegarde
                yield self
            return
        try:
            with self.cx.pipeline(), self.cx.transaction():
                yield self
        except BaseException:
            self._types.clear()                # entités créées puis annulées
            raise

    def _en_transaction(self) -> bool:
        return self.cx.info.transaction_status != pq.TransactionStatus.IDLE

    def _atomique(self):
        """Plusieurs requêtes indissociables : déjà dans une transaction, rien à ouvrir."""
        return nullcontext() if self._en_transaction() else self.cx.transaction()

    def _type(self, entite_id: uuid.UUID) -> str | None:
        if entite_id not in self._types:
            ligne = self.cx.execute("SELECT type FROM canon.entite WHERE entite_id = %s", (entite_id,)).fetchone()
            if not ligne:
                return None
            self._types[entite_id] = ligne[0]
        return self._types[entite_id]

    # Catalogue ---------------------------------------------------------------------------------
    def colonnes(self, table: str) -> set[str]:
        if table not in self._colonnes:
            lignes = self.cx.execute("SELECT column_name FROM information_schema.columns "
                                     "WHERE table_schema = 'canon' AND table_name = %s "
                                     "AND is_generated = 'NEVER'", (table,)).fetchall()
            if not lignes:
                raise KeyError(f"table inconnue du schéma canon : {table}")
            self._colonnes[table] = {c for (c,) in lignes}
        return self._colonnes[table]

    def _verifier(self, table: str, noms):
        inconnues = set(noms) - self.colonnes(table)
        if inconnues:
            raise KeyError(f"{table} : colonnes inconnues {sorted(inconnues)}")

    # Enregistrements bruts ---------------------------------------------------------------------
    def enregistrer_source(self, e: EnregistrementSource) -> tuple[uuid.UUID, bool]:
        ligne = self.cx.execute(
            "INSERT INTO brut.enregistrement_source (systeme, fichier, chemin, empreinte, id_source, url, "
            "licence, recupere_le, charge_utile) VALUES (%s, %s, %s, %s, %s, %s, %s, COALESCE(%s, now()), %s) "
            "ON CONFLICT (systeme, fichier, chemin, empreinte) DO NOTHING RETURNING source_id",
            (e.systeme, e.fichier, e.chemin, e.empreinte, e.id_source, e.url, e.licence, e.recupere_le,
             Jsonb(e.charge_utile) if e.charge_utile is not None else None)).fetchone()
        if ligne:
            return ligne[0], True
        (existant,) = self.cx.execute(
            "SELECT source_id FROM brut.enregistrement_source "
            "WHERE systeme = %s AND fichier = %s AND chemin = %s AND empreinte = %s",
            (e.systeme, e.fichier, e.chemin, e.empreinte)).fetchone()
        return existant, False

    # Entités -----------------------------------------------------------------------------------
    def creer_entite(self, type_entite: str) -> uuid.UUID:
        self.colonnes(type_entite)                  # type = table de canon
        id_ = uuid.uuid4()
        self.cx.execute("INSERT INTO canon.entite (entite_id, type) VALUES (%s, %s)", (id_, type_entite))
        self._types[id_] = type_entite
        return id_

    def ecrire(self, type_entite: str, entite_id: uuid.UUID, valeurs: dict, provenance: Provenance):
        self._verifier(type_entite, valeurs)
        if self._type(entite_id) != type_entite:
            raise KeyError(f"{entite_id} n'est pas une entité {type_entite}")
        noms = ["entite_id", *valeurs]
        table = sql.Identifier("canon", type_entite)
        colonnes = sql.SQL(", ").join(map(sql.Identifier, noms))
        nouvelles = sql.SQL(", ").join(sql.SQL("EXCLUDED.{}").format(sql.Identifier(n)) for n in valeurs)
        anciennes = sql.SQL(", ").join(sql.SQL("t.{}").format(sql.Identifier(n)) for n in valeurs)
        maj = sql.SQL(", ").join(sql.SQL("{0} = EXCLUDED.{0}").format(sql.Identifier(n)) for n in valeurs)
        with self._atomique():
            if valeurs:
                # L'ancienne ligne part dans l'historique seulement si une valeur connue est remplacée :
                # compléter un champ vide (une seconde source apporte le titre) n'est pas un changement.
                remplace = sql.SQL(" OR ").join(
                    sql.SQL("(a.v ->> {0}) IS NOT NULL AND to_jsonb(t.{1}) IS DISTINCT FROM (a.v -> {0})")
                    .format(sql.Literal(n), sql.Identifier(n)) for n in valeurs)
                self.cx.execute(sql.SQL(
                    "WITH ancienne AS (SELECT to_jsonb(t) AS v FROM {table} t WHERE entite_id = %(id)s), "
                    "ecrite AS (INSERT INTO {table} AS t ({colonnes}) VALUES ({marques}) "
                    "  ON CONFLICT (entite_id) DO UPDATE SET {maj} "
                    "  WHERE ROW({anciennes}) IS DISTINCT FROM ROW({nouvelles}) "
                    "  RETURNING ({remplace_ici}) AS remplace) "
                    "INSERT INTO canon.historique (entite_id, type, valeurs, remplace_par) "
                    "SELECT %(id)s, %(type)s, ancienne.v, %(source)s FROM ancienne, ecrite WHERE ecrite.remplace").format(
                        table=table, colonnes=colonnes, maj=maj, anciennes=anciennes, nouvelles=nouvelles,
                        remplace_ici=sql.SQL("EXISTS (SELECT 1 FROM ancienne a WHERE {})").format(remplace),
                        marques=sql.SQL(", ").join(sql.Placeholder(f"v{i}") for i in range(len(noms)))),
                    {"id": entite_id, "type": type_entite, "source": provenance.source_id,
                     **{f"v{i}": _valeur(v) for i, v in enumerate([entite_id, *valeurs.values()])}})
            else:
                self.cx.execute(sql.SQL("INSERT INTO {} (entite_id) VALUES (%s) ON CONFLICT DO NOTHING")
                                .format(table), (entite_id,))
            self.cx.execute("INSERT INTO canon.provenance (entite_id, source_id, pointeur, url) "
                            "VALUES (%s, %s, %s, %s) ON CONFLICT (entite_id, source_id, pointeur) DO NOTHING",
                            (entite_id, provenance.source_id, provenance.pointeur or "", provenance.url))

    def lire(self, type_entite: str, entite_id: uuid.UUID) -> dict | None:
        colonnes = sorted(self.colonnes(type_entite) - {"entite_id"})
        with self.cx.cursor(row_factory=dict_row) as cur:
            ligne = cur.execute(sql.SQL("SELECT {} FROM {} WHERE entite_id = %s").format(
                sql.SQL(", ").join(map(sql.Identifier, colonnes)), sql.Identifier("canon", type_entite)),
                (entite_id,)).fetchone()
        return dict(ligne) if ligne else None

    # Faits dépendants --------------------------------------------------------------------------
    def remplacer_dependants(self, table: str, parent: dict, lignes: list[dict], provenance: Provenance):
        if table not in DEPENDANTS:
            raise KeyError(f"table dépendante inconnue : {table}")
        self._verifier(table, parent)
        cible = sql.Identifier("canon", table)
        filtre = sql.SQL(" AND ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in parent)
        with self._atomique():
            self.cx.execute(sql.SQL("DELETE FROM {} WHERE {}").format(cible, filtre), tuple(parent.values()))
            if not lignes:
                return
            noms = [*parent, *lignes[0], "source_id"]
            self._verifier(table, noms)
            if any(l.keys() != lignes[0].keys() for l in lignes):
                raise KeyError(f"{table} : lignes de colonnes différentes")
            with self.cx.cursor() as cur:            # COPY est impossible en mode pipeline
                cur.executemany(sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                    cible, sql.SQL(", ").join(map(sql.Identifier, noms)),
                    sql.SQL(", ").join(sql.Placeholder() * len(noms))),
                    [[*parent.values(), *map(_valeur, l.values()), provenance.source_id] for l in lignes])

    def dependants(self, table: str, parent: dict) -> list[dict]:
        if table not in DEPENDANTS:
            raise KeyError(f"table dépendante inconnue : {table}")
        self._verifier(table, parent)
        filtre = sql.SQL(" AND ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in parent)
        with self.cx.cursor(row_factory=dict_row) as cur:
            return [dict(l) for l in cur.execute(sql.SQL("SELECT * FROM {} WHERE {}").format(
                sql.Identifier("canon", table), filtre), tuple(parent.values()))]

    # Correspondances ---------------------------------------------------------------------------
    COLONNES_CORRESPONDANCE = ("correspondance_id, type_entite, entite_id, systeme, type_source, id_source, url, "
                               "methode, statut, preuve, valide_du, valide_au, revu_par, revu_le")

    @staticmethod
    def _correspondance(l) -> Correspondance:
        return Correspondance(l[1], l[2], IdentiteNative(l[3], l[4], l[5]), l[7], l[8], l[9], l[6],
                              l[10], l[11], l[12], l[13], l[0])

    def _correspondances(self, condition: str, params) -> list[Correspondance]:
        return [self._correspondance(l) for l in self.cx.execute(
            f"SELECT {self.COLONNES_CORRESPONDANCE} FROM canon.correspondance WHERE {condition} "
            "ORDER BY cree_le", params)]

    def correspondances(self, identite: IdentiteNative) -> list[Correspondance]:
        return self._correspondances("systeme = %s AND type_source = %s AND id_source = %s",
                                     (identite.systeme, identite.type_source, identite.id_source))

    def correspondances_de(self, entite_id: uuid.UUID) -> list[Correspondance]:
        return self._correspondances("entite_id = %s", (entite_id,))

    def verifiees(self):
        return [(IdentiteNative(s, t, i), e) for s, t, i, e in self.cx.execute(
            "SELECT systeme, type_source, id_source, entite_id FROM canon.correspondance WHERE statut = %s",
            (Statut.VERIFIED,))]

    def compter_correspondances(self):
        return [tuple(l) for l in self.cx.execute(
            "SELECT systeme, type_source, methode, statut, count(*) FROM canon.correspondance "
            "GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4")]

    def a_revoir(self):
        return self._correspondances("statut IN (%s, %s)", (Statut.PROPOSED, Statut.NEEDS_REVIEW))

    def ajouter_correspondance(self, c: Correspondance):
        if self._type(c.entite_id) != c.type_entite:
            raise KeyError(f"{c.entite_id} n'est pas une entité {c.type_entite}")
        self.cx.execute(
            f"INSERT INTO canon.correspondance ({self.COLONNES_CORRESPONDANCE}) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (c.id, c.type_entite, c.entite_id, c.identite.systeme, c.identite.type_source, c.identite.id_source,
             c.url, c.methode, c.statut, Jsonb(c.preuve), c.valide_du, c.valide_au, c.revu_par, c.revu_le))

    def reviser_correspondance(self, c: Correspondance):
        ligne = self.cx.execute("UPDATE canon.correspondance SET statut = %s, preuve = %s, revu_par = %s, "
                                "revu_le = %s WHERE correspondance_id = %s RETURNING 1",
                                (c.statut, Jsonb(c.preuve), c.revu_par, c.revu_le, c.id)).fetchone()
        if not ligne:
            raise KeyError(f"correspondance inconnue : {c.id}")

    # Analyse -----------------------------------------------------------------------------------
    def ajouter_affirmation(self, a: Affirmation):
        with self._atomique():
            self.cx.execute(
                "INSERT INTO analytique.affirmation (affirmation_id, sujet_type, sujet_id, predicat, objet, type, "
                "methode, verification, modele, version_prompt, cree_le) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (a.id, a.sujet_type, a.sujet_id, a.predicat, Jsonb(a.objet), a.type, a.methode, a.verification,
                 a.modele, a.version_prompt, a.cree_le))
            for p in a.preuves:
                self.cx.execute("INSERT INTO analytique.preuve (affirmation_id, source_id, pointeur, url) "
                                "VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                                (a.id, p.source_id, p.pointeur or "", p.url))

    def corriger(self, type_entite: str, entite_id: uuid.UUID, valeurs: dict, provenance: Provenance):
        """UPDATE d'une ligne existante (l'upsert vérifierait les NOT NULL d'une ligne incomplète)."""
        self._verifier(type_entite, valeurs)
        table = sql.Identifier("canon", type_entite)
        with self._atomique():
            ancienne = self.cx.execute(sql.SQL("SELECT to_jsonb(t) FROM {} t WHERE entite_id = %s").format(table),
                                       (entite_id,)).fetchone()
            if ancienne is None:
                raise KeyError(f"{type_entite} {entite_id} absent : rien à corriger")
            self.cx.execute(sql.SQL("UPDATE {} SET {} WHERE entite_id = %s").format(
                table, sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(n)) for n in valeurs)),
                [*map(_valeur, valeurs.values()), entite_id])
            if any(ancienne[0].get(k) is not None and str(ancienne[0].get(k)) != str(v) for k, v in valeurs.items()):
                self.cx.execute("INSERT INTO canon.historique (entite_id, type, valeurs, remplace_par) "
                                "VALUES (%s, %s, %s, %s)", (entite_id, type_entite, Jsonb(ancienne[0]),
                                                            provenance.source_id))
            self.cx.execute("INSERT INTO canon.provenance (entite_id, source_id, pointeur, url) "
                            "VALUES (%s, %s, %s, %s) ON CONFLICT (entite_id, source_id, pointeur) DO NOTHING",
                            (entite_id, provenance.source_id, provenance.pointeur or "", provenance.url))

    # Revue humaine -----------------------------------------------------------------------------
    COLONNES_CAS = ("type", "cle", "nature", "constat", "sujet_type", "sujet_identite", "sujet_id", "champ",
                    "cibles", "candidats", "contexte", "source_id")

    def signaler(self, cas: dict) -> dict:
        valeurs = [Jsonb(cas.get(c)) if c in ("cibles", "candidats", "contexte") else cas.get(c)
                   for c in self.COLONNES_CAS]
        maj = ", ".join(f"{c} = EXCLUDED.{c}" for c in self.COLONNES_CAS if c != "cle")
        with self.cx.cursor(row_factory=dict_row) as cur:
            return dict(cur.execute(
                f"INSERT INTO analytique.cas_revue ({', '.join(self.COLONNES_CAS)}) "
                f"VALUES ({', '.join(['%s'] * len(self.COLONNES_CAS))}) "
                f"ON CONFLICT (cle) DO UPDATE SET {maj}, derniere_vue = now(), statut = CASE WHEN "
                f"cas_revue.statut = 'CADUC' THEN 'A_REVOIR' ELSE cas_revue.statut END RETURNING *", valeurs).fetchone())

    def cas_revue(self, type_: str | None = None, statut: str | None = None) -> list[dict]:
        with self.cx.cursor(row_factory=dict_row) as cur:
            return [dict(l) for l in cur.execute(
                "SELECT * FROM analytique.cas_revue WHERE (%s::text IS NULL OR type = %s) "
                "AND (%s::text IS NULL OR statut = %s) ORDER BY type, cle", (type_, type_, statut, statut))]

    def decider(self, cle: str, decision: dict, par: str):
        if not self.cx.execute("UPDATE analytique.cas_revue SET decision = %s, decide_par = %s, decide_le = now(), "
                               "statut = 'DECIDE' WHERE cle = %s RETURNING 1", (Jsonb(decision), par, cle)).fetchone():
            raise KeyError(f"cas inconnu : {cle}")

    def classer_caducs(self, prefixe: str, presents: set[str]) -> int:
        motif = prefixe.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        return len(self.cx.execute("UPDATE analytique.cas_revue SET statut = 'CADUC' WHERE cle LIKE %s "
                                   "AND statut = 'A_REVOIR' AND NOT (cle = ANY(%s)) RETURNING 1",
                                   (motif, list(presents))).fetchall())

    def retirer_absents(self, type_entite: str, champ: str, parent_id: uuid.UUID, presents: set[uuid.UUID]) -> int:
        table, colonne = sql.Identifier("canon", type_entite), sql.Identifier(champ)
        self._verifier(type_entite, {champ: parent_id})
        with self._atomique():
            self.cx.execute(sql.SQL(
                "UPDATE canon.entite e SET retiree_de_la_source_le = NULL FROM {t} x WHERE x.entite_id = e.entite_id "
                "AND x.{c} = %s AND e.entite_id = ANY(%s) AND e.retiree_de_la_source_le IS NOT NULL "
                "AND e.fusionnee_dans IS NULL")
                .format(t=table, c=colonne), (parent_id, list(presents)))
            return len(self.cx.execute(sql.SQL(
                "UPDATE canon.entite e SET retiree_de_la_source_le = now() FROM {t} x WHERE x.entite_id = e.entite_id "
                "AND x.{c} = %s AND NOT (e.entite_id = ANY(%s)) AND e.retiree_de_la_source_le IS NULL RETURNING 1")
                .format(t=table, c=colonne), (parent_id, list(presents))).fetchall())

    def retirees(self, type_entite: str) -> set[uuid.UUID]:
        return {i for (i,) in self.cx.execute("SELECT entite_id FROM canon.entite WHERE type = %s "
                                               "AND retiree_de_la_source_le IS NOT NULL", (type_entite,))}

    # Fusion d'entités (cf. docs/rapprochements.md §7) ----------------------------------------
    def references(self, type_entite: str | None = None) -> list[tuple]:
        """Colonnes qui référencent une entité de ce type (toutes si None), lues dans le catalogue :
        clés étrangères vers `canon.entite` ou vers la table du type. (schéma, table, colonne,
        cle_propre, uniques) : `cle_propre` = la colonne est à elle seule la clé primaire (la ligne
        de l'entité elle-même, jamais re-pointée) ; `uniques` = clés uniques qui la contiennent."""
        if type_entite not in self._references:
            cibles = ["canon.entite"] + ([f"canon.{type_entite}"] if type_entite else [])
            condition = ("con.confrelid = ANY(%s::regclass[])" if type_entite else
                         "con.confrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'canon'::regnamespace)")
            lignes = self.cx.execute(
                "SELECT n.nspname, cl.relname, a.attname, "
                "  EXISTS (SELECT 1 FROM pg_constraint p WHERE p.conrelid = con.conrelid AND p.contype = 'p' "
                "          AND p.conkey = con.conkey), "
                "  ARRAY(SELECT array_to_json(ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = u.conrelid "
                "          AND attnum = ANY(u.conkey) ORDER BY attnum))::text FROM pg_constraint u "
                "          WHERE u.conrelid = con.conrelid AND u.contype IN ('p', 'u') AND con.conkey[1] = ANY(u.conkey)) "
                "FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid "
                "JOIN pg_namespace n ON n.oid = cl.relnamespace "
                "JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1] "
                f"WHERE con.contype = 'f' AND cardinality(con.conkey) = 1 AND {condition} "
                "ORDER BY 1, 2, 3", (cibles,) if type_entite else ()).fetchall()
            self._references[type_entite] = [
                (s, t, c, propre, [json.loads(u) for u in uniques]) for s, t, c, propre, uniques in lignes
                if (s, t) not in HORS_FUSION]
        return self._references[type_entite]

    def fusionnee_dans(self, entite_id: uuid.UUID) -> uuid.UUID | None:
        ligne = self.cx.execute("SELECT fusionnee_dans FROM canon.entite WHERE entite_id = %s", (entite_id,)).fetchone()
        return ligne[0] if ligne else None

    def fusionner(self, type_entite: str, absorbee: uuid.UUID, absorbante: uuid.UUID, preuve: dict) -> dict | None:
        b, a = absorbee, absorbante
        if a == b:
            raise ValueError(f"{b} : une entité ne se fusionne pas avec elle-même")
        with self._atomique():
            etats = dict((e, (t, f)) for e, t, f in self.cx.execute(
                "SELECT entite_id, type, fusionnee_dans FROM canon.entite WHERE entite_id = ANY(%s) FOR UPDATE",
                ([a, b],)))
            if etats.get(a, (None,))[0] != type_entite or etats.get(b, (None,))[0] != type_entite:
                raise KeyError(f"{b} et {a} ne sont pas deux entités {type_entite}")
            if etats[b][1] == a:
                return None                            # déjà fait : idempotent
            if etats[b][1] or etats[a][1]:
                raise ValueError(f"{b} ou {a} est déjà fusionnée : fusionner dans l'entité qui l'a absorbée")
            table = sql.Identifier("canon", type_entite)
            # 1. valeurs : celles de l'absorbante gagnent, un champ vide est complété, un écart consigné
            uniques = {c for (c,) in self.cx.execute(          # contraintes et index uniques, hors clé primaire
                "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid "
                "AND a.attnum = ANY(i.indkey) WHERE i.indrelid = %s::regclass AND i.indisunique AND NOT i.indisprimary",
                (f"canon.{type_entite}",))}
            va, vb = self.lire(type_entite, a), self.lire(type_entite, b) or {}
            completees, conflits = {}, {}
            for col, v in vb.items():
                w = (va or {}).get(col)
                if v is None or v == w or v == b:
                    continue
                if w is not None:
                    conflits[col] = {"gardee": w, "ecartee": v}
                elif col in uniques:
                    conflits[col] = {"gardee": None, "ecartee": v, "motif": "valeur unique, non recopiée"}
                else:
                    completees[col] = v
            if completees or (va is None and vb):
                self.cx.execute("INSERT INTO canon.provenance (entite_id, source_id, pointeur, url, vu_le) "
                                "SELECT %s, source_id, pointeur, url, vu_le FROM canon.provenance WHERE entite_id = %s "
                                "ON CONFLICT (entite_id, source_id, pointeur) DO NOTHING", (a, b))
                noms = list(completees)
                if va is None:
                    self.cx.execute(sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                        table, sql.SQL(", ").join(map(sql.Identifier, ["entite_id", *noms])),
                        sql.SQL(", ").join(sql.Placeholder() * (len(noms) + 1))),
                        [a, *map(_valeur, completees.values())])
                else:
                    self.cx.execute(sql.SQL("UPDATE {} SET {} WHERE entite_id = %s").format(
                        table, sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(n)) for n in noms)),
                        [*map(_valeur, completees.values()), a])
            # 2. références : chaque clé étrangère vers l'entité ou vers sa table
            references, doublons = {}, 0
            for schema, nom, col, propre, cles in self.references(type_entite):
                if propre:
                    continue                           # la ligne de l'entité elle-même
                t, c = sql.Identifier(schema, nom), sql.Identifier(col)
                entite = "entite_id" in self.colonnes_de(schema, nom) and nom != "entite"
                for cle in cles:
                    autres = [k for k in cle if k != col]
                    egal = sql.SQL("").join(sql.SQL(" AND x.{0} IS NOT DISTINCT FROM y.{0}").format(sql.Identifier(k))
                                            for k in autres)
                    doublon = sql.SQL("FROM {t} y WHERE x.{c} = %(b)s AND y.{c} = %(a)s{egal}").format(t=t, c=c, egal=egal)
                    if entite:
                        # deux entités auraient la même clé : à fusionner d'abord, jamais supprimées ici
                        (n,) = self.cx.execute(sql.SQL("SELECT count(*) FROM {t} x WHERE EXISTS (SELECT 1 {d})")
                                               .format(t=t, d=doublon), {"a": a, "b": b}).fetchone()
                        if n:
                            raise ValueError(f"fusion impossible : {n} {nom} auraient la même clé {cle} "
                                             "(les fusionner d'abord)")
                        continue
                    # fait dépendant déjà présent chez l'absorbante : historisé, puis retiré
                    doublons += len(self.cx.execute(sql.SQL(
                        "WITH retires AS (DELETE FROM {t} x WHERE EXISTS (SELECT 1 {d}) RETURNING to_jsonb(x) AS v) "
                        "INSERT INTO canon.historique (entite_id, type, valeurs) SELECT %(b)s, %(nom)s, v FROM retires "
                        "RETURNING 1").format(t=t, d=doublon), {"a": a, "b": b, "nom": nom}).fetchall())
                n = len(self.cx.execute(sql.SQL("UPDATE {t} SET {c} = %s WHERE {c} = %s RETURNING 1")
                                        .format(t=t, c=c), (a, b)).fetchall())
                if n:
                    references[f"{nom}.{col}"] = n
            for champ in ("cibles", "candidats"):
                n = len(self.cx.execute(sql.SQL(
                    "UPDATE analytique.cas_revue SET {c} = (SELECT jsonb_agg(CASE WHEN x ->> 'entite_id' = %(b)s "
                    "THEN jsonb_set(x, '{{entite_id}}', to_jsonb(%(a)s::text)) ELSE x END ORDER BY i) "
                    "FROM jsonb_array_elements({c}) WITH ORDINALITY e(x, i)) "
                    "WHERE {c} @> jsonb_build_array(jsonb_build_object('entite_id', %(b)s::text)) RETURNING 1")
                    .format(c=sql.Identifier(champ)), {"a": str(a), "b": str(b)}).fetchall())
                if n:
                    references[f"cas_revue.{champ}"] = n
            n = len(self.cx.execute("UPDATE analytique.cas_revue SET sujet_id = %s WHERE sujet_id = %s RETURNING 1",
                                    (a, b)).fetchall())
            if n:
                references["cas_revue.sujet_id"] = n
            # 3. l'absorbée est gardée, marquée ; la fusion est enregistrée
            self.cx.execute("UPDATE canon.entite SET fusionnee_dans = %s, "
                            "retiree_de_la_source_le = COALESCE(retiree_de_la_source_le, now()) WHERE entite_id = %s",
                            (a, b))
            bilan = {"references": references, "doublons": doublons, "completees": sorted(completees),
                     "conflits": conflits}
            self.cx.execute("INSERT INTO canon.fusion (absorbee_id, absorbante_id, type, preuve, references_, doublons, "
                            "completees, conflits) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                            (b, a, type_entite, _json(preuve), _json(references), doublons, _json(bilan["completees"]),
                             _json(conflits)))
        return bilan

    def colonnes_de(self, schema: str, table: str) -> set[str]:
        if schema == "canon":
            return self.colonnes(table)
        return {c for (c,) in self.cx.execute("SELECT column_name FROM information_schema.columns "
                                              "WHERE table_schema = %s AND table_name = %s", (schema, table))}

    def marquer_applique(self, cle: str):
        self.cx.execute("UPDATE analytique.cas_revue SET statut = 'APPLIQUE', applique_le = now() WHERE cle = %s",
                        (cle,))

    # Contrôles d'invariants (cf. src/controles.py) ---------------------------------------------
    TABLES_METIER = ("personne", "organisation", "fonction", "dossier", "etape", "document", "amendement", "scrutin",
                     "reunion", "point_odj", "intervention", "question", "decision_cc", "texte_publie", "declaration",
                     "representant_interets", "action_representation", "version_texte", "version_article",
                     "article_suivi", "evenement_agenda", "mandat_rne")

    def controles(self) -> list[dict]:
        sans_provenance = " UNION ALL ".join(
            f"SELECT '{t}' AS t, entite_id FROM canon.{t} x WHERE NOT EXISTS "
            f"(SELECT 1 FROM canon.provenance p WHERE p.entite_id = x.entite_id)" for t in self.TABLES_METIER)
        fusionnees = "SELECT entite_id FROM canon.entite WHERE fusionnee_dans IS NOT NULL"
        vers_fusionnee = " UNION ALL ".join(
            [f"SELECT '{t}.{c} ' || x.{c} FROM {s}.{t} x JOIN ({fusionnees}) f ON f.entite_id = x.{c}"
             for s, t, c, propre, _ in self.references() if not propre]
            + ["SELECT 'cas_revue ' || r.cle FROM analytique.cas_revue r WHERE r.sujet_id IN "
               f"({fusionnees}) OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.cibles || r.candidats) x "
               f"WHERE x ->> 'entite_id' IN (SELECT entite_id::text FROM ({fusionnees}) f))"])
        requetes = [
            ("correspondance_certaine_par_nom", True,
             "Correspondance VERIFIED obtenue par nom et dates (NAME_DATE) : interdit sans décision humaine",
             "SELECT systeme || ':' || type_source || ':' || id_source FROM canon.correspondance "
             "WHERE statut = 'VERIFIED' AND methode = 'NAME_DATE'"),
            ("correspondance_manuelle_sans_decision", True,
             "Correspondance MANUAL sans la décision de revue qui l'a produite (preuve.cas)",
             "SELECT systeme || ':' || type_source || ':' || id_source FROM canon.correspondance "
             "WHERE methode = 'MANUAL' AND statut = 'VERIFIED' AND NOT (preuve ? 'cas')"),
            ("identite_reliee_deux_fois", True, "Identité native reliée de façon certaine à plusieurs entités",
             "SELECT systeme || ':' || type_source || ':' || id_source FROM canon.correspondance "
             "WHERE statut = 'VERIFIED' GROUP BY systeme, type_source, id_source HAVING count(*) > 1"),
            ("entite_sans_identite", True, "Entité sans aucune identité native vérifiée : impossible à retracer",
             "SELECT e.type || ' ' || e.entite_id FROM canon.entite e WHERE e.fusionnee_dans IS NULL AND NOT EXISTS "
             "(SELECT 1 FROM canon.correspondance c WHERE c.entite_id = e.entite_id AND c.statut = 'VERIFIED')"),
            ("reference_vers_entite_fusionnee", True,
             "Référence vers une entité fusionnée : elle aurait dû passer à l'entité qui l'a absorbée",
             vers_fusionnee),
            ("entite_fusionnee_avec_identite", True,
             "Entité fusionnée qui garde une correspondance certaine ou en revue (à reporter sur l'absorbante)",
             "SELECT c.systeme || ':' || c.type_source || ':' || c.id_source FROM canon.correspondance c "
             "JOIN canon.entite e ON e.entite_id = c.entite_id WHERE e.fusionnee_dans IS NOT NULL "
             "AND c.statut <> 'REJECTED'"),
            ("fusion_sans_decision", True,
             "Entité fusionnée sans cas de revue appliqué ni référence explicite sourcée qui la justifie",
             "SELECT e.type || ' ' || e.entite_id FROM canon.entite e LEFT JOIN canon.fusion f "
             "ON f.absorbee_id = e.entite_id WHERE e.fusionnee_dans IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "
             "analytique.cas_revue r WHERE r.cle = f.preuve ->> 'cas' AND r.statut = 'APPLIQUE') AND NOT ("
             "f.preuve ? 'reference' AND EXISTS (SELECT 1 FROM brut.enregistrement_source s "
             "WHERE s.source_id::text = f.preuve ->> 'source_id'))"),
            ("ligne_sans_provenance", True, "Ligne métier sans enregistrement source qui la justifie",
             f"SELECT t || ' ' || entite_id FROM ({sans_provenance}) s"),
            ("valeur_de_revue_sans_cas", True, "Valeur posée par une revue sans cas appliqué correspondant",
             "SELECT p.entite_id || ' ' || p.pointeur FROM canon.provenance p WHERE p.pointeur LIKE 'revue:%' "
             "AND NOT EXISTS (SELECT 1 FROM analytique.cas_revue r WHERE 'revue:' || r.cle = p.pointeur "
             "AND r.statut = 'APPLIQUE')"),
            ("elu_relie_sans_revue", True, "Mandat RNE relié à une personne sans décision de revue appliquée",
             "SELECT 'mandat_rne ' || m.entite_id FROM canon.mandat_rne m WHERE m.personne_id IS NOT NULL "
             "AND NOT EXISTS (SELECT 1 FROM analytique.cas_revue r WHERE r.type = 'elu_local' "
             "AND r.statut = 'APPLIQUE' AND r.cibles @> jsonb_build_array(jsonb_build_object("
             "'entite_id', m.entite_id::text)))"),
            ("decision_non_appliquee", True, "Décision humaine enregistrée mais pas appliquée",
             "SELECT cle FROM analytique.cas_revue WHERE statut = 'DECIDE'"),
            ("dates_incoherentes_source", False, "Fin avant début, tel que publié par la source (signalé, pas corrigé)",
             "SELECT 'fonction ' || entite_id FROM canon.fonction WHERE fin < debut UNION ALL "
             "SELECT 'organisation ' || entite_id FROM canon.organisation WHERE fin < debut UNION ALL "
             "SELECT 'etape ' || entite_id FROM canon.etape WHERE fin < debut"),
            ("cas_a_revoir", False, "Rapprochements en attente de revue humaine (rien n'en est appliqué)",
             "SELECT type || ' ' || cle FROM analytique.cas_revue WHERE statut = 'A_REVOIR'"),
        ]
        if self.cx.execute("SELECT to_regclass('lecture.couleur_groupe') IS NOT NULL").fetchone()[0]:
            requetes.append(
                ("groupe_actif_couleur_arbitraire", False,
                 "Groupe qui a des membres, sans couleur officielle ni famille : couleur de secours "
                 "(compléter lecture.couleur_groupe_famille, projections/12_couleur_groupe.sql)",
                 "SELECT o.chambre || ' ' || COALESCE(o.abrege, o.nom) FROM lecture.couleur_groupe c "
                 "JOIN canon.organisation o ON o.entite_id = c.groupe_id WHERE c.source = 'arbitraire' "
                 "AND EXISTS (SELECT 1 FROM lecture.appartenance_groupe ag WHERE ag.groupe_id = c.groupe_id "
                 "AND ag.fin >= CURRENT_DATE)"))
        resultats = []
        for nom, bloquant, explication, requete in requetes:
            (nombre,) = self.cx.execute(f"SELECT count(*) FROM ({requete}) q").fetchone()
            exemples = [x for (x,) in self.cx.execute(f"SELECT * FROM ({requete}) q LIMIT 5")] if nombre else []
            resultats.append({"nom": nom, "bloquant": bloquant, "explication": explication, "nombre": nombre,
                              "exemples": exemples})
        return resultats
