"""Rédige les résumés « en clair » d'un lot avec un modèle local (Ollama). À lancer sur le PC à GPU.

    python rediger.py lot.jsonl resultats.jsonl
    python rediger.py lot.jsonl resultats.jsonl --modele mistral:7b

Python 3.9+ seul (aucune bibliothèque à installer) et Ollama lancé sur ce PC. Reprend où il
s'était arrêté : les sujets déjà présents dans le fichier de résultats sont sautés.
"""

import argparse
import json
import socket
import sys
import time
import urllib.error
import urllib.request

OLLAMA = "http://localhost:11434"
VERSION_PROMPT = "syntheses-v1"

SYSTEME = """Tu rédiges les résumés « en clair » d'une application qui suit les lois françaises, \
pour des citoyens sans formation juridique.

Règles :
- Français courant, phrases courtes, sans jargon (expliquer un terme technique s'il est indispensable).
- Uniquement ce que disent les documents fournis : aucune information extérieure, aucune date, aucun \
chiffre, aucun nom qui n'y figure pas.
- Neutre : pas d'avis, pas d'adjectif qui juge, pas de « heureusement » ni de « malheureusement ». \
Quand l'auteur défend une position, l'attribuer (« selon l'auteur », « l'auteur estime que »).
- Si les documents ne permettent pas de résumer, répondre exactement : PAS_ASSEZ_D_INFORMATION
- Répondre par le résumé seul, sans titre, sans liste, sans formule d'introduction."""

CONSIGNES = {
    "resume_dossier": "Résume en 3 à 5 phrases ce que ce texte de loi change concrètement, pour qui, "
                      "et où il en est d'après les étapes fournies.",
    "expose_amendement": "Résume en 2 ou 3 phrases ce que cet amendement modifie et pourquoi son "
                         "auteur le propose.",
}


def appeler(chemin, corps=None, delai=600):
    requete = urllib.request.Request(OLLAMA + chemin, data=None if corps is None else json.dumps(corps).encode(),
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(requete, timeout=delai) as r:
        return json.load(r)


def verifier_modele(modele):
    try:
        presents = [m["name"] for m in appeler("/api/tags", delai=10)["models"]]
    except urllib.error.URLError:
        raise SystemExit(f"Ollama ne répond pas sur {OLLAMA} : lancez-le (application Ollama ou « ollama serve »).")
    if modele not in presents and f"{modele}:latest" not in presents:
        raise SystemExit(f"Modèle absent : téléchargez-le avec « ollama pull {modele} » (présents : {', '.join(presents) or 'aucun'}).")


def rediger(modele, sujet):
    r = appeler("/api/chat", {
        "model": modele,
        "stream": False,
        # Contexte élargi : par défaut, Ollama coupe en silence les textes longs.
        "options": {"temperature": 0.2, "num_ctx": 8192},
        "messages": [
            {"role": "system", "content": SYSTEME},
            {"role": "user", "content": f"{CONSIGNES[sujet['predicat']]}\n\n<documents>\n{sujet['contenu']}\n</documents>"},
        ],
    })
    texte = r["message"]["content"].strip()
    if r.get("done_reason") not in (None, "stop") or not texte or "PAS_ASSEZ_D_INFORMATION" in texte:
        texte = None                     # coupé ou pas assez d'information : aucune synthèse
    return texte, r.get("prompt_eval_count", 0), r.get("eval_count", 0)


def main():
    # Console Windows (cp1252) : un caractère qu'elle ne sait pas afficher ne doit pas arrêter le script.
    for flux in (sys.stdout, sys.stderr):
        flux.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("lot")
    p.add_argument("resultats")
    p.add_argument("--modele", default="qwen2.5:7b", help="modèle Ollama (défaut : qwen2.5:7b)")
    a = p.parse_args()

    verifier_modele(a.modele)
    with open(a.lot, encoding="utf-8") as f:
        lot = [json.loads(l) for l in f if l.strip()]
    try:
        with open(a.resultats, encoding="utf-8") as f:
            faits = {r["sujet_id"] + r["predicat"] for r in map(json.loads, filter(str.strip, f))}
    except FileNotFoundError:
        faits = set()
    a_faire = [s for s in lot if s["sujet_id"] + s["predicat"] not in faits]
    print(f"{len(a_faire)} sujet(s) à rédiger sur {len(lot)} avec {a.modele}")

    debut_total = time.time()
    with open(a.resultats, "a", encoding="utf-8") as sortie:
        for i, s in enumerate(a_faire, 1):
            debut = time.time()
            try:
                texte, entree, jetons = rediger(a.modele, s)
            except (urllib.error.URLError, TimeoutError, KeyError) as e:
                print(f"[{i}/{len(a_faire)}] {s['libelle']} : erreur ({e}), relancez le script pour reprendre", file=sys.stderr)
                break
            secondes = round(time.time() - debut, 1)
            sortie.write(json.dumps({
                "predicat": s["predicat"], "sujet_type": s["sujet_type"], "sujet_id": s["sujet_id"],
                "libelle": s["libelle"], "texte": texte, "modele": a.modele, "version_prompt": VERSION_PROMPT,
                "machine": socket.gethostname(), "secondes": secondes, "jetons_entree": entree, "jetons_sortie": jetons,
            }, ensure_ascii=False) + "\n")
            sortie.flush()
            print(f"[{i}/{len(a_faire)}] {s['libelle']} : {'ok' if texte else 'aucune synthèse'} ({secondes} s)")
    print(f"Terminé en {round(time.time() - debut_total)} s → {a.resultats}")


if __name__ == "__main__":
    main()
