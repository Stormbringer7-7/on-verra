"""Géométrie des sièges de l'hémicycle, extraite du plan publié par l'Assemblée nationale.

Le plan (un SVG avec un tracé par siège, id "p<numéro>") est téléchargé une fois et réduit à
web/hemicycle.json : tracés des sièges, centre et angle de chacun, tracés de décor.
"""

import html
import json
import math
import re
import urllib.request
from pathlib import Path

URL = "https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle"
CIBLE = Path(__file__).parent / "web" / "hemicycle.json"
ECHELLE = 0.28                          # transform="matrix(0.28,0,0,0.28,0,0)" de tous les tracés

RE_PATH = re.compile(r"<path\b([^>]*)/?>", re.S)
RE_ATTR = re.compile(r'([\w:-]+)="([^"]*)"')
RE_JETON = re.compile(r"[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?")
ARITE = {"m": 2, "l": 2, "h": 1, "v": 1, "c": 6, "s": 4, "q": 4, "t": 2, "a": 7, "z": 0}


def sommets(d: str) -> list[tuple[float, float]]:
    """Points d'arrivée de chaque segment d'un tracé SVG (les points de contrôle sont ignorés)."""
    jetons, points = RE_JETON.findall(d), []
    x = y = x0 = y0 = 0.0
    cmd, i = None, 0
    while i < len(jetons):
        if jetons[i].isalpha():
            cmd, i = jetons[i], i + 1
            if cmd in "zZ":
                x, y = x0, y0
                continue
        n = ARITE[cmd.lower()]
        args = [float(v) for v in jetons[i:i + n]]
        i += n
        rel = cmd.islower()
        if cmd.lower() == "h":
            x = args[0] + (x if rel else 0)
        elif cmd.lower() == "v":
            y = args[0] + (y if rel else 0)
        else:
            dx, dy = args[-2], args[-1]
            x, y = (x + dx, y + dy) if rel else (dx, dy)
        if cmd.lower() == "m":
            x0, y0 = x, y
            cmd = "l" if rel else "L"      # coordonnées suivantes d'un M = segments implicites
        points.append((x, y))
    return points


def extraire(page: str) -> dict:
    debut = page.find("<svg xmlns")
    svg = page[debut:page.find("</svg>", debut)]
    sieges, decor = {}, []
    for brut in RE_PATH.findall(svg):
        attrs = dict(RE_ATTR.findall(brut))
        d = " ".join(attrs["d"].split())
        if attrs.get("class") == "place" and attrs.get("id", "").startswith("p"):
            sieges[int(attrs["id"][1:])] = d
        else:
            decor.append(d)

    centres = {}
    for num, d in sieges.items():
        pts = sommets(d)
        centres[num] = (sum(p[0] for p in pts) / len(pts) * ECHELLE, sum(p[1] for p in pts) / len(pts) * ECHELLE)
    # Centre de l'hémicycle : milieu horizontal, sous le premier rang.
    cx = (min(c[0] for c in centres.values()) + max(c[0] for c in centres.values())) / 2
    cy = max(c[1] for c in centres.values()) + 8
    return {
        "source": f"Plan de l'hémicycle, Assemblée nationale ({URL})",
        "viewBox": [0, 0, 237, 164],
        "echelle": ECHELLE,
        "decor": decor,
        "sieges": [
            {"num": num, "d": sieges[num], "x": round(x, 2), "y": round(y, 2),
             # Angle depuis le centre : 0 à gauche, 180 à droite (ordre gauche-droite).
             "angle": round(math.degrees(math.atan2(cy - y, cx - x)), 2),
             "rayon": round(math.hypot(x - cx, y - cy), 2)}
            for num, (x, y) in sorted(centres.items())
        ],
    }


def generer(cible: Path = CIBLE):
    with urllib.request.urlopen(URL) as r:
        page = r.read().decode("utf-8")
    donnees = extraire(page)
    cible.parent.mkdir(parents=True, exist_ok=True)
    cible.write_text(json.dumps(donnees, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(donnees['sieges'])} sièges -> {cible}")


def charger(chemin: Path = CIBLE) -> dict:
    return json.loads(chemin.read_text())


if __name__ == "__main__":
    generer()
