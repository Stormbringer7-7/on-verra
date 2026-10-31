"""Contrôle automatique des résumés : tout ce qui est vérifiable doit venir du texte officiel.

    python3 controle.py lot-eau-potable.jsonl resultats/resultats-qwen.jsonl

Sans IA. Dans chaque résumé, relève les éléments qu'un modèle peut inventer et qu'on peut
retrouver mot pour mot dans la source : références d'articles (« L. 2224-7 »), nombres, sigles,
noms propres (mot à majuscule hors début de phrase), passages entre guillemets. Un élément absent
du texte source rend le résumé « à revoir » ; il n'est pas corrigé. Le contrôle ne juge ni le sens
ni le style : un résumé « ok » peut encore être faux, il passe en relecture humaine comme les autres.

Écrit à côté des résultats un fichier `…-controle.jsonl` (chaque ligne + son contrôle).
"""

import json
import re
import sys
import unicodedata

# Mots à majuscule courants dans un résumé, qui ne sont pas des noms à vérifier.
COURANTS = {"son", "sa", "ses", "cet", "cette", "ce", "il", "elle", "ils", "le", "la", "les", "l", "un", "une",
            "selon", "en", "pour", "dans", "afin", "par", "de", "des", "du", "au", "aux", "si"}

REFERENCE = re.compile(r"\b[LRD]\.?\s?\d+(?:-\d+)+\b")                     # L. 2224-7-5, R. 211-1
NOMBRE = re.compile(r"(?<![\w-])\d+(?:[.,]\d+)?(?:°|er|e|ème)?(?![\w-])")   # 5, 4°, 1er, 2,5
SIGLE = re.compile(r"\b[A-Z][A-Z0-9]{1,}\b")                                # SAGE, ZSCE, CD28
GUILLEMETS = re.compile(r"[«\"“]\s*([^»\"”]{2,80}?)\s*[»\"”]")
MOT = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿŒœ]+")


def normaliser(texte: str) -> str:
    """Comparaison tolérante : sans accents, minuscules, apostrophes et espaces unifiés."""
    texte = unicodedata.normalize("NFKD", texte.replace("’", "'").replace("\xa0", " "))
    texte = "".join(c for c in texte if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", texte)


def present(element: str, source: str) -> bool:
    e = normaliser(element)
    return re.search(r"(?<![\w])" + re.escape(e) + r"(?![\w])", source) is not None


def noms_propres(resume: str) -> list[str]:
    """Mots à majuscule qui ne commencent pas une phrase (ni ne suivent « : »), hors mots courants."""
    noms = []
    for m in MOT.finditer(resume):
        mot = m.group()
        if not mot[0].isupper() or mot.isupper() or mot.lower() in COURANTS:
            continue
        avant = resume[:m.start()].rstrip(" '’(«\"")
        civilite = re.search(r"(?:^|\s)(?:M|Mme|Mlle|MM|Mmes|Dr|Pr)\.?$", avant)
        if not avant or (avant[-1] in ".:!?\n" and not civilite):
            continue                      # début de phrase : la majuscule ne dit rien (sauf après « M. »)
        noms.append(mot)
    return noms


def elements(resume: str) -> list[tuple[str, str]]:
    trouves = [("référence", r.group()) for r in REFERENCE.finditer(resume)]
    sans_refs = REFERENCE.sub(" ", resume)
    trouves += [("nombre", n.group()) for n in NOMBRE.finditer(sans_refs)]
    trouves += [("sigle", s.group()) for s in SIGLE.finditer(resume)]
    trouves += [("nom", n) for n in noms_propres(resume)]
    trouves += [("citation", g.group(1)) for g in GUILLEMETS.finditer(resume)]
    vus, uniques = set(), []
    for t in trouves:
        if t not in vus:
            vus.add(t)
            uniques.append(t)
    return uniques


def controler(resume: str | None, source: str) -> dict:
    if resume is None:
        return {"statut": "sans_synthese", "verifies": 0, "introuvables": []}
    source_n = normaliser(source)
    elts = elements(resume)
    introuvables = [{"type": t, "valeur": v} for t, v in elts if not present(v, source_n)]
    return {"statut": "a_revoir" if introuvables else "ok", "verifies": len(elts), "introuvables": introuvables}


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        sources = {(s["sujet_id"], s["predicat"]): s["contenu"] for s in map(json.loads, filter(str.strip, f))}
    with open(sys.argv[2], encoding="utf-8") as f:
        resultats = [json.loads(l) for l in f if l.strip()]
    sortie = re.sub(r"\.jsonl$", "", sys.argv[2]) + "-controle.jsonl"
    bilan = {"ok": 0, "a_revoir": 0, "sans_synthese": 0}
    with open(sortie, "w", encoding="utf-8") as f:
        for r in resultats:
            c = controler(r["texte"], sources[(r["sujet_id"], r["predicat"])])
            bilan[c["statut"]] += 1
            f.write(json.dumps({**r, "controle": c}, ensure_ascii=False) + "\n")
            detail = ", ".join(f"{i['type']} « {i['valeur']} »" for i in c["introuvables"])
            print(f"{c['statut']:<13} {r['libelle']:<24} {c['verifies']:>2} élément(s) vérifié(s)"
                  + (f" ; introuvable(s) : {detail}" if detail else ""))
    print(f"\n{bilan['ok']} ok, {bilan['a_revoir']} à revoir, {bilan['sans_synthese']} sans synthèse → {sortie}")


if __name__ == "__main__":
    main()
