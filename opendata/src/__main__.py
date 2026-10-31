"""Point d'entrée : python -m src <commande>"""

import argparse
import os
from pathlib import Path

from . import compilation

RACINE = Path(__file__).resolve().parent.parent
BRUT = RACINE / "data" / "brut"
INVENTAIRE = RACINE / "data" / "inventaire"
ECHANTILLONS = RACINE / "data" / "echantillons"


def cmd_migrer():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL absente.")
    from .adaptateurs.stockage.postgres import connecter, migrer
    appliquees = migrer(connecter(url))
    print("\n".join(f"Migration appliquée : {n}" for n in appliquees) or "Schéma à jour.")


def cmd_projeter(args):
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL absente.")
    from .adaptateurs.stockage.postgres import ProjecteurPostgres, connecter
    for table, n in ProjecteurPostgres(connecter(url)).projeter().items():
        print(f"lecture.{table:<36} {n:>10}")


def cmd_uml(args):
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL absente.")
    from .adaptateurs.stockage.postgres import connecter
    from .uml import DOC, ecrire
    print(f"{'Diagrammes régénérés' if ecrire(connecter(url)) else 'Diagrammes à jour'} : {DOC}")


def cmd_controles(args):
    from .controles import controler
    ok, cible = controler(compilation.entrepot_canon(os.environ.get("DATABASE_URL")), RACINE / "data" / "rapports")
    print(f"Rapport : {cible}")
    raise SystemExit(0 if ok else 1)


CLES_REVUE = RACINE / "data" / "revue"             # cles.json et admins/*.asc : publics, jamais une clé privée
CLES_PERSONNELLES = Path.home() / ".config" / "big-brother" / "revue"


def admins_gpg() -> set[str]:
    return {e.strip().upper() for e in os.environ.get("REVUE_ADMINS_GPG", "").split(",") if e.strip()}


def cmd_cles(args):
    import base64
    from .banc import signature as sig
    if args.action == "creer":
        fichier = args.fichier or CLES_PERSONNELLES / f"{args.nom}.pem"
        publique = sig.creer_paire(fichier)
        print(f"Clé privée : {fichier} (lisible par vous seul, ne la copiez jamais sur le serveur)\n"
              f"Clé publique : {sig.b64(publique)}\nEmpreinte : {sig.empreinte(publique)}\n"
              f"À inscrire par un admin : python -m src revue cles inscrire --nom {args.nom} --role <role> "
              f"--publique {sig.b64(publique)} --gpg <empreinte GPG de l'admin>")
    elif args.action == "inscrire":
        publique = base64.b64decode(args.publique, validate=True)
        sig.inscrire(args.fichier, args.nom, args.role, publique, args.gpg)
        print(f"Inscrite dans {args.fichier} : {args.nom} ({args.role}), empreinte {sig.empreinte(publique)}")
    else:
        cles = sig.charger_cles(args.fichier, sorted((args.fichier.parent / "admins").glob("*.asc")), admins_gpg())
        for c in cles.values():
            print(f"{c.nom:<20} {c.role:<10} {c.empreinte}  signée par {c.signee_par}")
        print(f"{len(cles)} clé(s) valide(s) dans {args.fichier}")


def cmd_revue(args):
    from . import revue
    from .identites import RegistreIdentites
    entrepot = compilation.entrepot_canon(os.environ.get("DATABASE_URL"))
    if args.action == "rapport":
        print(f"Rapport écrit : {revue.rapport(entrepot, args.dossier)}")
    elif args.action == "lister":
        for cas in entrepot.cas_revue(args.type, None if args.statut == "tous" else args.statut):
            print(f"{cas['cle']}  [{cas['statut']}]\n  {cas['constat']}")
            for i, c in enumerate(cas["candidats"]):
                print(f"    [{i}] {c['libelle'] or c['identite']}  {c['indices']}")
    elif args.action == "servir":
        from .banc import Banc, charger_lots, servir
        servir(Banc(entrepot, RegistreIdentites(entrepot), charger_lots(args.syntheses)), args.hote, args.port,
               tuple(args.hote_public))
    elif args.action == "fusionner":
        from .domaine import IdentiteNative
        b, a = (IdentiteNative(*x.split(":", 2)) for x in (args.absorbee, args.absorbante))
        cas = revue.fusionner(entrepot, RegistreIdentites(entrepot), args.type, b, a, args.par, args.motif)
        print(f"Fusion enregistrée et appliquée : {b} -> {a} (cas {cas['cle']}, {args.par})")
    else:
        choix = None if args.choix == "aucun" else int(args.choix)
        revue.decider(entrepot, RegistreIdentites(entrepot), args.cle, choix, args.par, args.motif)
        print(f"Décision enregistrée et appliquée : {args.cle} -> {args.choix} ({args.par})")


def cmd_inventaire(args):
    from .inventaire import SOURCES, inventorier
    noms = list(SOURCES) if args.source == "tout" else [args.source]
    for nom in noms:
        if nom not in SOURCES:
            raise SystemExit(f"Source inconnue : {nom} ({', '.join(SOURCES)})")
        print(f"Inventaire écrit : {inventorier(nom, SOURCES[nom], BRUT, INVENTAIRE, args.forcer)}")


def cmd_echantillons(args):
    from .echantillons import construire
    print(f"Échantillons écrits : {construire(BRUT, ECHANTILLONS, args.objets, args.reseau)} (rapport : {ECHANTILLONS / 'rapport.md'})")


def main():
    p = argparse.ArgumentParser(prog="src", description="Chargement canonique CivicTrace : sources, projections, contrôles, revue.")
    sp = p.add_subparsers(required=True)

    c = sp.add_parser("migrer", help="applique les migrations du schéma canonique (DATABASE_URL)")
    c.set_defaults(f=lambda a: cmd_migrer())

    c = sp.add_parser("canon", help="charge le modèle canonique CivicTrace (ENTREPOT=postgres, DATABASE_URL)")
    c.add_argument("--age-max", type=float, default=20, help="heures avant de revérifier un fichier (défaut : 20)")
    c.add_argument("--forcer", action="store_true", help="re-télécharge et relit tout, même inchangé")
    c.add_argument("--relire", action="store_true", help="réanalyse les documents inchangés, sans re-télécharger (avec --etapes : ces étapes seulement)")
    c.add_argument("--etapes", help="seulement ces étapes (ex. senat.debats), et celles dont elles dépendent")
    c.set_defaults(f=lambda a: compilation.compiler_canon(os.environ.get("DATABASE_URL"), BRUT, a.forcer,
                                                          a.age_max * 3600, a.relire,
                                                          a.etapes.split(",") if a.etapes else None))

    c = sp.add_parser("projeter", help="reconstruit les indicateurs contextualisés (schéma lecture, DATABASE_URL)")
    c.set_defaults(f=cmd_projeter)

    c = sp.add_parser("uml", help="régénère les diagrammes de docs/uml.md depuis le schéma migré (DATABASE_URL)")
    c.set_defaults(f=cmd_uml)

    c = sp.add_parser("controles", help="vérifie que la base canonique ne contient que des données 100 %% fiables")
    c.set_defaults(f=cmd_controles)

    c = sp.add_parser("revue", help="revue humaine (DATABASE_URL) : rapport, lister, decider, fusionner, servir")
    rs = c.add_subparsers(dest="action", required=True)
    r = rs.add_parser("rapport", help="écrit docs/revue/rapport.md et un CSV complet par type de cas")
    r.add_argument("--dossier", type=Path, default=RACINE / "docs" / "revue")
    r = rs.add_parser("lister", help="cas d'un type, avec leurs candidats")
    r.add_argument("--type")
    r.add_argument("--statut", default="A_REVOIR", help="A_REVOIR, DECIDE, APPLIQUE ou tous")
    r = rs.add_parser("decider", help="enregistre une décision et l'applique")
    r.add_argument("cle")
    r.add_argument("--choix", required=True, help="indice du candidat, ou « aucun »")
    r.add_argument("--par", required=True, help="nom de la personne qui décide")
    r.add_argument("--motif")
    r = rs.add_parser("servir", help="banc de revue (app interne) : rapprochements et synthèses, http://127.0.0.1:8084")
    r.add_argument("--hote", default="127.0.0.1", help="adresse d'écoute (0.0.0.0 dans le conteneur seulement)")
    r.add_argument("--port", type=int, default=8084)
    r.add_argument("--hote-public", action="append", default=[], help="en-tête Host accepté en plus de 127.0.0.1")
    r.add_argument("--syntheses", type=Path, default=RACINE / "data" / "relecture",
                   help="dossier des lots de synthèses à juger (*.json)")
    r = rs.add_parser("fusionner", help="deux entités sont le même objet : fusionne la première dans la seconde")
    r.add_argument("absorbee", help="identité native de l'entité absorbée, ex. RNE:personne:<clé>")
    r.add_argument("absorbante", help="identité native de l'entité gardée, ex. AN:acteur:PA720614")
    r.add_argument("--type", required=True, help="type des deux entités (personne, dossier…)")
    r.add_argument("--par", required=True, help="nom de la personne qui décide")
    r.add_argument("--motif", required=True, help="preuve vérifiable que c'est le même objet")
    c.set_defaults(f=cmd_revue)
    r = rs.add_parser("cles", help="clés Ed25519 du banc de revue : creer (sur votre poste), inscrire (admin, GPG), verifier")
    ks = r.add_subparsers(dest="action", required=True)
    k = ks.add_parser("creer", help="crée votre paire ; la clé privée reste sur ce poste")
    k.add_argument("--nom", required=True)
    k.add_argument("--fichier", type=Path, help=f"clé privée (défaut : {CLES_PERSONNELLES}/<nom>.pem)")
    k = ks.add_parser("inscrire", help="admin : signe une clé publique avec sa clé GPG et l'ajoute au fichier du service")
    k.add_argument("--nom", required=True)
    k.add_argument("--role", required=True, choices=["admin", "relecteur", "poste"])
    k.add_argument("--publique", required=True, help="clé publique (base64), donnée par « cles creer »")
    k.add_argument("--gpg", required=True, help="empreinte de la clé GPG de l'admin qui signe")
    k.add_argument("--fichier", type=Path, default=CLES_REVUE / "cles.json")
    k = ks.add_parser("verifier", help="vérifie chaque clé du fichier (REVUE_ADMINS_GPG, admins/*.asc à côté)")
    k.add_argument("--fichier", type=Path, default=CLES_REVUE / "cles.json")
    for k in ks.choices.values():
        k.set_defaults(f=cmd_cles)

    c = sp.add_parser("inventaire", help="télécharge un échantillon d'une source et relève sa structure")
    c.add_argument("source", help="an, senat, legifrance, constit, hatvp, rne ou tout")
    c.add_argument("--forcer", action="store_true", help="re-télécharge même si le fichier est en cache")
    c.set_defaults(f=cmd_inventaire)

    c = sp.add_parser("echantillons", help="échantillons de la 17e en SQLite, tous les champs, avec leur profil (cache seul)")
    c.add_argument("objets", nargs="*", help="objets ou préfixes (an, an.amendement, senat.ameli…) ; rien : tout")
    c.add_argument("--reseau", action="store_true", help="demande aux serveurs la date de publication de chaque fichier")
    c.set_defaults(f=cmd_echantillons)

    args = p.parse_args()
    args.f(args)


if __name__ == "__main__":
    main()
