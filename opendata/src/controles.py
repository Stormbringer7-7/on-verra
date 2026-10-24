"""Contrôles d'invariants : la base canonique ne contient que des données 100 % fiables.

Fiable = identifiant officiel lu dans sa source, référence explicite d'une source vers une autre,
ou décision humaine tracée (cas de revue appliqué). Un contrôle bloquant qui échoue fait échouer
la commande : une donnée non fiable a été écrite comme un fait. Le reste attend la revue humaine
(docs/rapprochements.md) et ne figure jamais dans `canon` avant décision.
"""

import json
from datetime import datetime
from pathlib import Path


def controler(entrepot, dossier: Path) -> tuple[bool, Path]:
    resultats = entrepot.controles()
    dossier.mkdir(parents=True, exist_ok=True)
    cible = dossier / f"controles-{datetime.now():%Y%m%d-%H%M%S}.json"
    cible.write_text(json.dumps({"date": datetime.now().isoformat(), "controles": resultats},
                                ensure_ascii=False, indent=1, default=str))
    ok = True
    for r in resultats:
        etat = "OK " if not r["nombre"] else ("ÉCHEC" if r["bloquant"] else "info")
        ok &= not (r["bloquant"] and r["nombre"])
        print(f"[{etat}] {r['nom']:<40} {r['nombre']:>8}  {r['explication']}")
        for e in r["exemples"][:3] if r["nombre"] and r["bloquant"] else []:
            print(f"         ex. {e}")
    print("Données canoniques : 100 % fiables." if ok else "Invariant violé : des données non fiables sont dans canon.")
    return ok, cible
