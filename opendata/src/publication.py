"""Publication de la base pour les applications : une base par législature, versions, correctifs.

La publication contient un index et un dossier par législature (partition.py) :
  index.json                      législatures publiées : période, version, manifeste, taille
  <leg>/manifest.json             version courante, base complète, correctifs disponibles, nouveautés
  <leg>/on_verra-<v>.db.gz        base complète de la version v (première installation, rattrapage)
  <leg>/maj-<v-1>-<v>.sql.gz      correctif : différences entre deux versions, en SQL
  <leg>/courante.db               copie de la dernière base publiée (référence du prochain correctif)

Une version n'est publiée que si la législature a gagné un scrutin, une motion de censure ou un
recours au 49.3 : en pratique, seule la législature en cours change.
"""

import gzip
import hashlib
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# Tables dont l'apparition d'une ligne justifie une nouvelle version.
TABLES_DECLENCHEUSES = ("scrutins", "motions_censure", "engagements_49_3")
CORRECTIFS_CONSERVES = 60              # au-delà, l'application retélécharge la base complète
FORMAT_MANIFESTE = 1


def sql_valeur(v) -> str:
    """Littéral SQL sur une seule ligne : l'application exécute les correctifs ligne par ligne."""
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    texte = "'" + str(v).replace("'", "''") + "'"
    return texte.replace("\r", "' || char(13) || '").replace("\n", "' || char(10) || '")


def schema(db: sqlite3.Connection, prefixe: str = "main") -> list[tuple[str, str]]:
    return db.execute(f"SELECT name, sql FROM {prefixe}.sqlite_master "
                      f"WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name != 'meta' "
                      f"ORDER BY type, name").fetchall()


def empreinte_schema(db: sqlite3.Connection) -> str:
    """Deux bases de même empreinte ont exactement les mêmes tables, colonnes, index et vues."""
    return hashlib.sha256(json.dumps(schema(db)).encode()).hexdigest()[:16]


def tables(db: sqlite3.Connection) -> list[str]:
    return [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table' "
                                     "AND name NOT LIKE 'sqlite_%' AND name != 'meta' ORDER BY name")]


def difference(ancienne: Path, nouvelle: Path) -> tuple[list[str], dict[str, int]]:
    """Instructions SQL qui transforment `ancienne` en `nouvelle`, et nombre de lignes ajoutées par table."""
    db = sqlite3.connect(nouvelle)
    db.execute("ATTACH DATABASE ? AS ancienne", (str(ancienne),))
    if schema(db, "main") != schema(db, "ancienne"):
        raise ValueError("schéma différent : un correctif n'est pas possible")
    instructions, ajouts = [], {}
    for table in tables(db):
        infos = db.execute(f"PRAGMA table_info({table})").fetchall()
        colonnes = [c[1] for c in infos]
        cle = [c[1] for c in sorted(infos, key=lambda c: c[5]) if c[5]]
        liste = ", ".join(colonnes)
        if cle:
            cles = ", ".join(cle)
            for row in db.execute(f"SELECT {cles} FROM ancienne.{table} EXCEPT SELECT {cles} FROM main.{table}"):
                condition = " AND ".join(f"{c} = {sql_valeur(v)}" for c, v in zip(cle, row))
                instructions.append(f"DELETE FROM {table} WHERE {condition};")
            nouvelles_cles = {r for r in db.execute(
                f"SELECT {cles} FROM main.{table} EXCEPT SELECT {cles} FROM ancienne.{table}")}
            for row in db.execute(f"SELECT {liste} FROM main.{table} EXCEPT SELECT {liste} FROM ancienne.{table}"):
                instructions.append(f"INSERT OR REPLACE INTO {table} ({liste}) "
                                    f"VALUES ({', '.join(map(sql_valeur, row))});")
            ajouts[table] = len(nouvelles_cles)
        else:
            # Sans clé primaire, une ligne modifiée = une ligne supprimée + une ligne ajoutée.
            for row in db.execute(f"SELECT {liste} FROM ancienne.{table} EXCEPT SELECT {liste} FROM main.{table}"):
                condition = " AND ".join(f"{c} IS {sql_valeur(v)}" for c, v in zip(colonnes, row))
                instructions.append(f"DELETE FROM {table} WHERE {condition};")
            lignes = db.execute(f"SELECT {liste} FROM main.{table} EXCEPT SELECT {liste} FROM ancienne.{table}").fetchall()
            for row in lignes:
                instructions.append(f"INSERT INTO {table} ({liste}) VALUES ({', '.join(map(sql_valeur, row))});")
            ajouts[table] = len(lignes)
    db.close()
    return instructions, ajouts


def nouveautes(ancienne: Path | None, nouvelle: Path) -> list[dict]:
    """Lois concernées par les nouveaux votes, pour les notifications de l'application."""
    db = sqlite3.connect(nouvelle)
    if ancienne:
        db.execute("ATTACH DATABASE ? AS ancienne", (str(ancienne),))
        filtre_s = "WHERE s.uid NOT IN (SELECT uid FROM ancienne.scrutins)"
        filtre_m = "WHERE m.scrutin_uid NOT IN (SELECT scrutin_uid FROM ancienne.motions_censure)"
        filtre_e = ("WHERE (e.loi_id, e.date, e.etape) NOT IN "
                    "(SELECT loi_id, date, etape FROM ancienne.engagements_49_3)")
    else:
        filtre_s = filtre_m = filtre_e = "WHERE 0"
    requete = f"""
        SELECT s.loi_id, s.date, 'vote' AS evenement, s.sort AS detail FROM scrutins_finaux s {filtre_s}
        UNION ALL SELECT m.loi_id, m.date, 'censure', CASE m.adoptee WHEN 1 THEN 'adoptée' ELSE 'rejetée' END
                  FROM motions_censure m {filtre_m}
        UNION ALL SELECT e.loi_id, e.date, '49.3', e.etape FROM engagements_49_3 e {filtre_e}
    """
    resultat = [{"loi": loi, "titre": titre, "niveau": niveau, "date": date, "evenement": evt, "detail": detail}
                for loi, date, evt, detail, titre, niveau in db.execute(
                    f"SELECT n.*, l.titre, l.niveau FROM ({requete}) n LEFT JOIN lois l ON l.id = n.loi_id "
                    f"ORDER BY n.date DESC")]
    db.close()
    return resultat


def compresser(source: Path | bytes, cible: Path) -> dict:
    donnees = source.read_bytes() if isinstance(source, Path) else source
    # mtime fixé : deux compressions des mêmes données donnent le même fichier (empreinte stable).
    cible.write_bytes(gzip.compress(donnees, compresslevel=9, mtime=0))
    contenu = cible.read_bytes()
    return {"fichier": cible.name, "taille": len(contenu), "sha256": hashlib.sha256(contenu).hexdigest()}


def preparer_base(base: Path, cible: Path, version: int, date: str):
    """Copie de la base avec sa table meta : c'est elle que l'application embarque."""
    shutil.copyfile(base, cible)
    db = sqlite3.connect(cible)
    db.executescript("""
        DROP TABLE IF EXISTS meta;
        CREATE TABLE meta (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
    """)
    db.executemany("INSERT INTO meta VALUES (?, ?)", [
        ("version", str(version)), ("date", date), ("schema", empreinte_schema(db))])
    db.commit()
    db.execute("VACUUM")
    db.close()


def publier(base: Path, dossier: Path, forcer: bool = False) -> dict | None:
    dossier.mkdir(parents=True, exist_ok=True)
    chemin_manifeste, courante = dossier / "manifest.json", dossier / "courante.db"
    manifeste = json.loads(chemin_manifeste.read_text()) if chemin_manifeste.exists() else None
    precedente = courante if manifeste and courante.exists() else None

    instructions, ajouts, schema_change = None, {}, False
    if precedente:
        try:
            instructions, ajouts = difference(precedente, base)
        except ValueError:
            schema_change = True
        declenche = schema_change or any(ajouts.get(t) for t in TABLES_DECLENCHEUSES)
        if not declenche and not forcer:
            print("Aucun nouveau vote, motion ou 49.3 : pas de nouvelle version.")
            return None

    version = (manifeste["version"] + 1) if manifeste else 1
    date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    preparee = dossier / f"on_verra-{version}.db"
    preparer_base(base, preparee, version, date)
    complete = compresser(preparee, dossier / f"on_verra-{version}.db.gz")

    correctifs = [] if schema_change or not manifeste else manifeste["correctifs"]
    if instructions is not None and not schema_change:
        # Le correctif vérifie la version de départ : appliqué sur une autre base, il échoue sans rien changer.
        script = "\n".join([
            "BEGIN;",
            "CREATE TEMP TABLE verification_version (ok INTEGER CHECK (ok = 1));",
            f"INSERT INTO verification_version SELECT COALESCE((SELECT valeur FROM meta "
            f"WHERE cle = 'version') = '{version - 1}', 0);",
            *instructions,
            f"UPDATE meta SET valeur = '{version}' WHERE cle = 'version';",
            f"UPDATE meta SET valeur = '{date}' WHERE cle = 'date';",
            "DROP TABLE verification_version;",
            "COMMIT;", "",
        ])
        correctif = compresser(script.encode(), dossier / f"maj-{version - 1}-{version}.sql.gz")
        correctifs = [*correctifs, {"de": version - 1, "vers": version, **correctif,
                                    "lignes": len(instructions)}]

    # Les correctifs trop anciens sont retirés ; les bases complètes antérieures aussi.
    retires = correctifs[:-CORRECTIFS_CONSERVES] if len(correctifs) > CORRECTIFS_CONSERVES else []
    correctifs = correctifs[-CORRECTIFS_CONSERVES:]
    for c in retires:
        (dossier / c["fichier"]).unlink(missing_ok=True)
    for ancienne in dossier.glob("on_verra-*.db.gz"):
        if ancienne.name != complete["fichier"]:
            ancienne.unlink()

    nouveau = {
        "format": FORMAT_MANIFESTE,
        "version": version,
        "date": date,
        "schema": empreinte_schema(sqlite3.connect(preparee)),
        "base": complete,
        "correctifs": correctifs,
        "nouveautes": nouveautes(precedente, base),
    }
    shutil.move(preparee, courante)
    chemin_manifeste.write_text(json.dumps(nouveau, ensure_ascii=False, indent=1))
    resume = ", ".join(f"{t} +{n}" for t, n in ajouts.items() if n and t in TABLES_DECLENCHEUSES)
    print(f"Version {version} publiée ({complete['taille'] / 1e6:.1f} Mo compressée"
          + (f", correctif {correctifs[-1]['taille'] / 1e3:.0f} ko : {resume}" if correctifs
             and correctifs[-1]["vers"] == version else "") + f") -> {dossier}")
    return nouveau


def publier_legislatures(base: Path, dossier: Path, partitions: Path, schema: Path,
                         legislatures: list[str], forcer: bool = False) -> dict:
    """Découpe la base complète par législature, publie chaque partition, puis écrit index.json."""
    from .partition import partitionner

    entrees = []
    for leg in legislatures:
        print(f"== {leg}e législature")
        partition = partitionner(base, leg, partitions / f"on_verra_{leg}.db", schema)
        publier(partition, dossier / leg, forcer)
        manifeste = json.loads((dossier / leg / "manifest.json").read_text())
        db = sqlite3.connect(f"{partition.as_uri()}?mode=ro", uri=True)
        debut, fin, nb = db.execute("SELECT MIN(date), MAX(date), COUNT(*) FROM scrutins").fetchone()
        db.close()
        entrees.append({"legislature": leg, "debut": debut, "fin": fin, "scrutins": nb,
                        "version": manifeste["version"], "manifeste": f"{leg}/manifest.json",
                        "taille": manifeste["base"]["taille"]})
    index = {"format": FORMAT_MANIFESTE, "date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "legislatures": entrees}
    (dossier / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    print(f"index.json : {', '.join(e['legislature'] + 'e v' + str(e['version']) for e in entrees)} -> {dossier}")
    return index


def appliquer(base_locale: Path, correctif: Path):
    """Ce que fait l'application : exécuter le correctif dans une transaction (référence et tests)."""
    db = sqlite3.connect(base_locale)
    try:
        db.executescript(gzip.decompress(correctif.read_bytes()).decode())
    except sqlite3.Error:
        db.execute("ROLLBACK") if db.in_transaction else None
        raise
    finally:
        db.close()
