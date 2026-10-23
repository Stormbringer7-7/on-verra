"""Point d'entrée : python -m src <commande>"""

import argparse
import os
import sqlite3
from itertools import groupby
from pathlib import Path

from . import compilation
from .compilation import LEGISLATURES, compiler
from .etl import ordonner
from .publication import publier_legislatures

RACINE = Path(__file__).resolve().parent.parent
BASE = RACINE / "data" / "on_verra.db"
BRUT = RACINE / "data" / "brut"
PUBLICATION = RACINE / "publication"
PARTITIONS = RACINE / "data" / "partitions"
ORDRE_POSITIONS = ["pour", "contre", "abstention", "non_votant"]

# Taux calculés sur la vue indicateurs_deputes ; le groupe affiché est celui du dernier vote.
REQ_INDICATEURS = """
SELECT i.*, d.prenom, d.nom,
       (SELECT g.abrege FROM votes v
          JOIN scrutins s ON s.uid = v.scrutin_uid
          JOIN groupes g ON g.organe_ref = v.groupe_ref
         WHERE v.acteur_ref = i.acteur_ref AND s.legislature = i.legislature
         ORDER BY s.date DESC LIMIT 1) AS groupe,
       1.0 * i.exprimes / NULLIF(i.scrutins - i.empeches, 0) AS participation,
       1.0 * i.delegations / NULLIF(i.exprimes, 0) AS delegation,
       1.0 * i.dissidences / NULLIF(i.exprimes_en_groupe, 0) AS dissidence
FROM indicateurs_deputes i JOIN deputes d USING (acteur_ref)
"""


def connexion() -> sqlite3.Connection:
    if not BASE.exists():
        raise SystemExit(f"Base absente : lancez d'abord `python -m src importer`.")
    db = sqlite3.connect(BASE)
    db.row_factory = sqlite3.Row
    return db


ORDRES_LOIS = {
    "titre": "titre",
    "saillance": "saillance DESC, titre",
    "date": "(SELECT MAX(date) FROM scrutins_finaux WHERE loi_id = lois.id) DESC, titre",
}


def cmd_lois(args):
    db = connexion()
    filtres, params = ["titre LIKE ?"], [f"%{args.recherche}%"]
    if args.niveau:
        filtres.append("niveau = ?")
        params.append(args.niveau)
    if args.legislature:
        filtres.append("legislature = ?")
        params.append(args.legislature)
    lois = db.execute(f"SELECT * FROM lois WHERE {' AND '.join(filtres)} "
                      f"ORDER BY {ORDRES_LOIS[args.tri]} LIMIT ?", params + [args.n]).fetchall()
    for loi in lois:
        print(f"\n[{loi['niveau']} · saillance {loi['saillance']:.0f}] {loi['titre']}  ({loi['id']})")
        details = [loi["raisons"],
                   f"{loi['nb_scrutins']} scrutins" if loi["nb_scrutins"] else None,
                   f"promulguée le {loi['promulgation']}" if loi["promulgation"] else None]
        if any(details):
            print("  " + " · ".join(d for d in details if d))
        for s in db.execute("SELECT * FROM scrutins_finaux WHERE loi_id = ? ORDER BY date", (loi["id"],)):
            print(f"  {s['legislature']}e n°{s['numero']:<5} {s['date']}  {s['sort']:<7} "
                  f"pour {s['pour']:>3} / contre {s['contre']:>3} / abst. {s['abstentions']:>3}  "
                  f"({s['lecture']})")
        for e in db.execute("SELECT * FROM engagements_49_3 WHERE loi_id = ? ORDER BY date", (loi["id"],)):
            print(f"  49.3 {e['date']}  {ETAPES.get(e['etape'], e['etape'])} : sans vote final")
    print(f"\n{len(lois)} loi(s)")


ETAPES = {"AN1": "1re lecture", "CMP": "texte de CMP", "ANNLEC": "nouvelle lecture",
          "ANLDEF": "lecture définitive"}


def cmd_49_3(args):
    db = connexion()
    filtres, params = ["1"], []
    if args.legislature:
        filtres.append("l.legislature = ?")
        params.append(args.legislature)
    lois = db.execute(
        f"SELECT l.* FROM lois l WHERE {' AND '.join(filtres)} "
        f"AND l.id IN (SELECT loi_id FROM engagements_49_3) "
        f"ORDER BY (SELECT MIN(date) FROM engagements_49_3 WHERE loi_id = l.id)", params).fetchall()
    for loi in lois:
        print(f"\n{loi['titre']}  ({loi['legislature']}e législature)")
        for e in db.execute("SELECT * FROM engagements_49_3 WHERE loi_id = ? ORDER BY date", (loi["id"],)):
            print(f"  {e['date']}  49.3 en {ETAPES.get(e['etape'], e['etape'])}")
            for m in db.execute("SELECT * FROM motions_censure WHERE engagement_id = ? ORDER BY numero",
                                (e["id"],)):
                print(f"      motion n°{m['numero']} du {m['date']} : {m['pour']} pour / {m['requis']} requis"
                      f" -> {'ADOPTÉE, gouvernement renversé' if m['adoptee'] else 'rejetée'}")
        # Motions rattachées au texte mais pas à un engagement précis (plusieurs 49.3 rapprochés).
        for m in db.execute("SELECT * FROM motions_censure WHERE loi_id = ? AND engagement_id IS NULL "
                            "ORDER BY numero", (loi["id"],)):
            print(f"  motion n°{m['numero']} du {m['date']} (engagement non déterminé) : "
                  f"{m['pour']} pour / {m['requis']} requis -> {'ADOPTÉE' if m['adoptee'] else 'rejetée'}")
    orphelines = db.execute("SELECT COUNT(*) FROM motions_censure WHERE article = '49-3' AND loi_id IS NULL "
                            + ("AND legislature = ?" if args.legislature else ""),
                            [args.legislature] if args.legislature else []).fetchone()[0]
    nb = db.execute(f"SELECT COUNT(*) FROM engagements_49_3 e JOIN lois l ON l.id = e.loi_id "
                    f"WHERE {' AND '.join(filtres)}", params).fetchone()[0]
    print(f"\n{nb} recours au 49.3 sur {len(lois)} texte(s)"
          + (f" ; {orphelines} motion(s) 49.3 non rattachée(s) à un texte" if orphelines else ""))


def cmd_censure(args):
    db = connexion()
    m = db.execute("SELECT m.*, l.titre AS loi FROM motions_censure m LEFT JOIN lois l ON l.id = m.loi_id "
                   "WHERE m.numero = ? AND m.legislature = ?", (args.numero, args.legislature)).fetchone()
    if not m:
        raise SystemExit(f"Motion de censure n°{args.numero} absente de la {args.legislature}e législature.")
    print(f"Motion n°{m['numero']} du {m['date']} (article {m['article']}) : {m['pour']} pour, "
          f"{m['requis']} requis -> {'ADOPTÉE' if m['adoptee'] else 'rejetée'}")
    print(f"Texte visé : {m['loi'] or 'aucun / non déterminé'}\n{m['titre']}\n")
    votes = db.execute(
        "SELECT COALESCE(g.abrege, '?') AS groupe, d.prenom, d.nom, v.par_delegation FROM votes_censure v "
        "JOIN deputes d USING (acteur_ref) LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref "
        "WHERE v.scrutin_uid = ? ORDER BY groupe, d.nom", (m["scrutin_uid"],)).fetchall()
    for groupe, membres in groupby(votes, key=lambda v: v["groupe"]):
        noms = [f"{v['prenom']} {v['nom']}" + ("*" if v["par_delegation"] else "") for v in membres]
        print(f"  {groupe} ({len(noms)}) : {', '.join(noms)}")
    print("\nSeuls les votes pour sont publiés. * = vote par délégation")


def cmd_scrutin(args):
    db = connexion()
    s = db.execute("SELECT * FROM scrutins WHERE numero = ? AND legislature = ?",
                   (args.numero, args.legislature)).fetchone()
    if not s:
        raise SystemExit(f"Scrutin n°{args.numero} absent de la {args.legislature}e législature.")
    print(f"Scrutin n°{s['numero']} du {s['date']} ({s['nature']}) : {s['sort']}\n{s['titre']}\n")

    votes = db.execute(
        "SELECT v.position, COALESCE(g.abrege, '?') AS groupe, d.prenom, d.nom, v.par_delegation "
        "FROM votes v JOIN deputes d USING (acteur_ref) LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref "
        "WHERE v.scrutin_uid = ? ORDER BY v.position, groupe, d.nom", (s["uid"],)).fetchall()
    votes.sort(key=lambda v: ORDRE_POSITIONS.index(v["position"]))
    for position, lignes in groupby(votes, key=lambda v: v["position"]):
        lignes = list(lignes)
        print(f"== {position.upper()} ({len(lignes)})")
        for groupe, membres in groupby(lignes, key=lambda v: v["groupe"]):
            noms = [f"{m['prenom']} {m['nom']}" + ("*" if m["par_delegation"] else "") for m in membres]
            print(f"  {groupe} ({len(noms)}) : {', '.join(noms)}")

    sans = db.execute(
        "SELECT d.prenom, d.nom FROM sans_vote sv JOIN deputes d USING (acteur_ref) "
        "WHERE sv.scrutin_uid = ? ORDER BY d.nom", (s["uid"],)).fetchall()
    print(f"== SANS VOTE ENREGISTRÉ ({len(sans)})")
    if args.tous:
        print("  " + ", ".join(f"{d['prenom']} {d['nom']}" for d in sans))
    else:
        print("  (liste complète avec --tous)")
    print("\n* = vote par délégation (député absent de l'hémicycle)")


def cmd_depute(args):
    db = connexion()
    deputes = db.execute(
        "SELECT * FROM deputes WHERE (prenom || ' ' || nom) LIKE ? ORDER BY nom",
        (f"%{args.nom}%",)).fetchall()
    if len(deputes) != 1:
        for d in deputes[:20]:
            print(f"{d['prenom']} {d['nom']} ({d['departement']}, {d['num_circo']}e circ.)")
        raise SystemExit(f"{len(deputes)} député(s) trouvé(s) : précisez le nom.")
    d = deputes[0]
    print(f"{d['prenom']} {d['nom']} — {d['departement']}, {d['num_circo']}e circonscription\n")
    for i in db.execute(REQ_INDICATEURS + "WHERE i.acteur_ref = ? ORDER BY i.legislature",
                        (d["acteur_ref"],)):
        print(f"{i['legislature']}e législature ({i['groupe'] or '?'}) : participation {pct(i['participation'])} "
              f"({i['exprimes']}/{i['scrutins'] - i['empeches']}), dont {pct(i['delegation'])} par délégation ; "
              f"dissidence {pct(i['dissidence'])} ({i['dissidences']}/{i['exprimes_en_groupe']})")
    for c in db.execute(
            "SELECT m.legislature, COUNT(*) AS total, COUNT(v.acteur_ref) AS votees FROM motions_censure m "
            "JOIN mandats ma ON ma.acteur_ref = ? AND ma.legislature = m.legislature "
            " AND ma.date_debut <= m.date AND (ma.date_fin IS NULL OR ma.date_fin >= m.date) "
            "LEFT JOIN votes_censure v ON v.scrutin_uid = m.scrutin_uid AND v.acteur_ref = ma.acteur_ref "
            "GROUP BY m.legislature", (d["acteur_ref"],)):
        print(f"{c['legislature']}e législature : a voté {c['votees']} motion(s) de censure sur {c['total']}")
    print()
    lignes = db.execute(
        "SELECT s.legislature, s.numero, s.date, l.titre, v.position, v.par_delegation, "
        "       CASE WHEN g.abrege != 'NI' THEN pg.ligne END AS ligne FROM scrutins_finaux s "
        "JOIN lois l ON l.id = s.loi_id "
        "LEFT JOIN votes v ON v.scrutin_uid = s.uid AND v.acteur_ref = :a "
        "LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref "
        "LEFT JOIN positions_groupes pg ON pg.scrutin_uid = v.scrutin_uid AND pg.groupe_ref = v.groupe_ref "
        "WHERE v.acteur_ref IS NOT NULL "
        "   OR s.uid IN (SELECT scrutin_uid FROM sans_vote WHERE acteur_ref = :a) "
        "ORDER BY s.date", {"a": d["acteur_ref"]}).fetchall()
    for l in lignes:
        position = (l["position"] or "sans vote") + (" (délégation)" if l["par_delegation"] else "")
        dissident = l["ligne"] and l["position"] in ("pour", "contre", "abstention") and l["position"] != l["ligne"]
        marque = f"≠ groupe : {l['ligne']}" if dissident else ""
        print(f"{l['date']}  {l['legislature']}e n°{l['numero']:<5} {position:<24} {marque:<22} {l['titre'][:80]}")


def pct(x) -> str:
    return "—" if x is None else f"{100 * x:.1f} %"


def cmd_indicateurs(args):
    db = connexion()
    filtres, params = ["i.legislature = ?", "i.scrutins - i.empeches >= ?"], [args.legislature, args.min]
    if args.dissidence_min is not None:
        filtres.append("i.exprimes_en_groupe >= ?")
        params.append(args.dissidence_min)
    rows = db.execute(f"SELECT * FROM ({REQ_INDICATEURS} WHERE {' AND '.join(filtres)}) "
                      f"WHERE ? IS NULL OR groupe = ? "
                      f"ORDER BY {args.tri} IS NULL, {args.tri} {'ASC' if args.croissant else 'DESC'}, nom "
                      f"LIMIT ?", params + [args.groupe, args.groupe, args.n]).fetchall()
    if not rows and args.groupe:
        groupes = db.execute(
            "SELECT DISTINCT g.abrege FROM votes v JOIN scrutins s ON s.uid = v.scrutin_uid "
            "JOIN groupes g ON g.organe_ref = v.groupe_ref WHERE s.legislature = ? ORDER BY 1",
            (args.legislature,)).fetchall()
        raise SystemExit(f"Aucun député pour le groupe {args.groupe}. Groupes de la "
                         f"{args.legislature}e législature : {', '.join(g[0] for g in groupes)}")
    print(f"{'député':<32} {'groupe':<10} {'particip.':>9} {'délég.':>8} {'dissid.':>8}  votes")
    for r in rows:
        print(f"{(r['prenom'] + ' ' + r['nom'])[:32]:<32} {(r['groupe'] or '?')[:10]:<10} "
              f"{pct(r['participation']):>9} {pct(r['delegation']):>8} {pct(r['dissidence']):>8}  "
              f"{r['exprimes']}/{r['scrutins'] - r['empeches']}")


def charger_postgres(dossier: Path, forcer: bool = False):
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL manquante : adresse de la base Postgres de l'API")
    from .postgres import charger                   # psycopg : seulement là où Postgres sert
    charger(url, dossier, forcer)


def main():
    p = argparse.ArgumentParser(prog="src", description="Votes finaux des députés sur chaque loi.")
    sp = p.add_subparsers(required=True)

    c = sp.add_parser("importer", help="télécharge l'open data AN et (re)construit la base")
    c.add_argument("--legislatures", default=",".join(LEGISLATURES),
                   help=f"liste séparée par des virgules (défaut : {','.join(LEGISLATURES)})")
    c.add_argument("--forcer", action="store_true", help="re-télécharge même si les fichiers existent")
    c.set_defaults(f=lambda a: compiler(BASE, BRUT, a.legislatures.split(","), a.forcer))

    c = sp.add_parser("etapes", help="étapes du pipeline de compilation, dans l'ordre d'exécution")
    c.set_defaults(f=lambda a: [print(f"{e.nom:<14} {e.description}"
                                      + (f"  (après {', '.join(e.apres)})" if e.apres else ""))
                                for e in ordonner(compilation.ETAPES)])

    c = sp.add_parser("lois", help="liste les lois, leur niveau d'importance et leurs scrutins finaux")
    c.add_argument("recherche", nargs="?", default="")
    c.add_argument("--niveau", choices=["majeure", "standard", "technique"])
    c.add_argument("--legislature")
    c.add_argument("--tri", choices=list(ORDRES_LOIS), default="titre")
    c.add_argument("-n", type=int, default=1000, help="nombre maximal de lois")
    c.set_defaults(f=cmd_lois)

    c = sp.add_parser("49-3", help="textes adoptés par 49.3 et motions de censure associées")
    c.add_argument("--legislature")
    c.set_defaults(f=cmd_49_3)

    c = sp.add_parser("censure", help="qui a voté une motion de censure")
    c.add_argument("numero", type=int)
    c.add_argument("--legislature", default="17")
    c.set_defaults(f=cmd_censure)

    c = sp.add_parser("scrutin", help="qui a voté quoi sur un scrutin")
    c.add_argument("numero", type=int)
    c.add_argument("--legislature", default="17")
    c.add_argument("--tous", action="store_true", help="liste les députés sans vote enregistré")
    c.set_defaults(f=cmd_scrutin)

    c = sp.add_parser("indicateurs", help="classement des députés par participation ou dissidence (tous les scrutins)")
    c.add_argument("--legislature", default="17")
    c.add_argument("--tri", choices=["participation", "dissidence", "delegation"], default="participation")
    c.add_argument("--croissant", action="store_true", help="les plus faibles d'abord")
    c.add_argument("--groupe", help="abréviation du groupe, ex. RN, SOC, EPR")
    c.add_argument("--min", type=int, default=20,
                   help="nombre minimal de scrutins en fonction (défaut : 20)")
    c.add_argument("--dissidence-min", type=int, default=None, dest="dissidence_min",
                   help="nombre minimal de votes exprimés au sein d'un groupe")
    c.add_argument("-n", type=int, default=20, help="nombre de lignes (défaut : 20)")
    c.set_defaults(f=cmd_indicateurs)

    c = sp.add_parser("depute", help="votes finaux et indicateurs d'un député")
    c.add_argument("nom")
    c.set_defaults(f=cmd_depute)

    c = sp.add_parser("publier", help="publie une base par législature (index.json + <leg>/manifest.json)")
    c.add_argument("--dossier", type=Path, default=PUBLICATION)
    c.add_argument("--legislatures", default=",".join(LEGISLATURES),
                   help=f"liste séparée par des virgules (défaut : {','.join(LEGISLATURES)})")
    c.add_argument("--forcer", action="store_true", help="publie même sans nouveau scrutin")
    c.set_defaults(f=lambda a: publier_legislatures(BASE, a.dossier, PARTITIONS, compilation.SCHEMA,
                                                    a.legislatures.split(","), a.forcer))

    c = sp.add_parser("charger", help="charge la publication dans Postgres (DATABASE_URL), lu par l'API")
    c.add_argument("--dossier", type=Path, default=PUBLICATION)
    c.add_argument("--forcer", action="store_true", help="recharge même les versions déjà chargées")
    c.set_defaults(f=lambda a: charger_postgres(a.dossier, a.forcer))

    c = sp.add_parser("mettre-a-jour", help="re-télécharge les données AN modifiées, reconstruit et publie si nouveau scrutin")
    c.add_argument("--dossier", type=Path, default=PUBLICATION)
    # Ménage le site de l'Assemblée : un fichier en cache n'est redemandé qu'après ce délai,
    # et seulement s'il a changé (If-Modified-Since) ; --forcer re-télécharge tout.
    c.add_argument("--age-max", type=float, default=20, help="heures avant de revérifier un fichier (défaut : 20)")
    c.add_argument("--forcer", action="store_true", help="re-télécharge tout, même inchangé")
    c.set_defaults(f=lambda a: (compiler(BASE, BRUT, LEGISLATURES, a.forcer, a.age_max * 3600),
                                publier_legislatures(BASE, a.dossier, PARTITIONS, compilation.SCHEMA, LEGISLATURES),
                                os.environ.get("DATABASE_URL") and charger_postgres(a.dossier)))

    args = p.parse_args()
    args.f(args)


if __name__ == "__main__":
    main()
