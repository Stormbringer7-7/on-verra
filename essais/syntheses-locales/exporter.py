"""Extrait d'un dossier CivicTrace le lot de textes officiels à résumer (à lancer sur le PC serveur).

    DATABASE_URL=postgres://… python exporter.py <entite_id du dossier> lot.jsonl

Une ligne JSON par sujet : le dossier lui-même (resume_dossier) et chacun de ses amendements
adoptés (expose_amendement), avec le texte officiel nettoyé de son HTML. Lecture seule.
"""

import html
import json
import os
import re
import sys

import psycopg

NATURES = ["adopte", "commission", "depose"]   # version du texte préférée : la plus avancée


def sans_balises(texte):
    if not texte:
        return ""
    texte = re.sub(r"<br\s*/?>|</p>", "\n", texte, flags=re.I)
    texte = html.unescape(re.sub(r"<[^>]+>", "", texte)).replace("\xa0", " ")
    texte = re.sub(r"[ \t]+", " ", texte)
    return re.sub(r"\n\s*\n+", "\n\n", re.sub(r" *\n *", "\n", texte)).strip()


def sujets(conn, dossier_id):
    d = conn.execute("SELECT titre, type_procedure, statut FROM canon.dossier WHERE entite_id = %s",
                     (dossier_id,)).fetchone()
    if not d:
        raise SystemExit(f"Dossier inconnu : {dossier_id}")
    titre, procedure, statut = d
    etapes = [r[0] for r in conn.execute(
        "SELECT coalesce(libelle, type) FROM canon.etape WHERE dossier_id = %s AND parent_id IS NULL "
        "ORDER BY debut NULLS LAST, ordre", (dossier_id,))]
    version = conn.execute(
        "SELECT entite_id, nature FROM canon.version_texte WHERE dossier_id = %s "
        "ORDER BY array_position(%s::text[], nature), date DESC NULLS LAST LIMIT 1",
        (dossier_id, NATURES)).fetchone()
    articles = [] if not version else conn.execute(
        "SELECT coalesce(intitule, 'Article ' || numero), texte FROM canon.version_article "
        "WHERE version_texte_id = %s ORDER BY ordre", (version[0],)).fetchall()
    yield {
        "predicat": "resume_dossier", "sujet_type": "dossier", "sujet_id": dossier_id, "libelle": titre,
        "contenu": "\n".join([
            f"Titre : {titre}",
            f"Procédure : {procedure or 'non publiée'} ; statut : {statut or 'non publié'}",
            "Étapes : " + (" → ".join(etapes) if etapes else "non publiées"),
            f"Texte ({version[1] if version else 'non chargé'}) :",
            *(f"\n{intitule}\n{sans_balises(texte)}" for intitule, texte in articles),
        ]),
    }
    for a_id, numero, chambre, division, dispositif, expose in conn.execute(
            "SELECT entite_id, numero, chambre, division, dispositif, expose FROM canon.amendement "
            "WHERE dossier_id = %s AND sort = 'adopte' ORDER BY chambre, numero", (dossier_id,)):
        if not (dispositif or expose):
            continue
        yield {
            "predicat": "expose_amendement", "sujet_type": "amendement", "sujet_id": str(a_id),
            "libelle": f"{chambre} {numero}",
            "contenu": "\n".join([
                f"Texte de loi : {titre}",
                f"Amendement {numero} ({chambre}), adopté, portant sur : {division or 'non précisé'}",
                f"Dispositif :\n{sans_balises(dispositif) or 'non publié'}",
                f"Exposé des motifs :\n{sans_balises(expose) or 'non publié'}",
            ]),
        }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, open(sys.argv[2], "w", encoding="utf-8") as f:
        n = 0
        for s in sujets(conn, sys.argv[1]):
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
            n += 1
    print(f"{n} sujets écrits dans {sys.argv[2]}")
