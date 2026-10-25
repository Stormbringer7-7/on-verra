"""Revue humaine des rapprochements : consigner, décider, appliquer, rapporter.

Le code ne tranche jamais un rapprochement incertain : il consigne un cas (`domaine.objets.CasRevue`)
avec ses candidats et ses preuves. Une personne décide (`python -m src revue decider`) ; la décision
est appliquée aussitôt et réappliquée à chaque chargement (la clé du cas est stable).
Une décision qui désigne, pour une identité propre d'une entité, une autre entité du même type dit
que les deux sont le même objet : elles sont fusionnées (seul chemin vers une fusion).
Règles et types de cas : docs/rapprochements.md.
"""

import csv
import json
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from .domaine import IdentiteNative, Methode, Provenance
from .domaine.objets import Candidat, CasRevue

# Types de cas, dans l'ordre du rapport : (titre, ce qu'on attend de la personne qui relit)
TYPES = {
    "correspondance_a_revoir": ("Correspondances à revoir",
                                "Rapprochement en conflit (l'identité est déjà reliée à une autre entité) ou par nom "
                                "et dates. Dire quelle entité l'identité désigne, ou « aucun »."),
    "identite_membre_gouvernement": ("Membres du Gouvernement cités par le Sénat",
                                     "Le Sénat identifie un ministre par un matricule propre. Choisir l'acteur AN "
                                     "correspondant, ou « aucun »."),
    "identite_senateur_ancien_depute": ("Sénateurs anciens députés",
                                        "Le Sénat publie les anciens mandats de député sans identifiant AN. Choisir "
                                        "l'acteur AN qui est ce sénateur (fiche Sénat citée par l'AMO, dates de "
                                        "mandat : des indices), ou « aucun ». L'effet passe par la fusion d'entités."),
    "identite_declarant": ("Déclarants HATVP sans identifiant parlementaire",
                           "Membre du Gouvernement ou autre déclarant : choisir l'acteur AN correspondant, ou "
                           "« aucun » (la personne est alors créée telle que la HATVP la publie)."),
    "orateur_commission": ("Orateurs des comptes rendus de commission (AN)",
                           "L'orateur n'est désigné que par son nom. Choisir la personne parmi les présents "
                           "homonymes, ou « aucun »."),
    "orateur_sans_identifiant": ("Orateurs de séance sans identifiant officiel (AN)",
                                 "Le compte rendu donne un identifiant hors référentiel. Choisir la personne, ou « aucun »."),
    "elu_local": ("Élus du RNE homonymes (fiche par mandat)",
                  "Le RNE ne publie aucun identifiant de personne. Choisir la personne que ce mandat désigne "
                  "(parlementaire ou personne déjà établie), ou « aucun » : une personne est alors créée pour ce "
                  "mandat, proposée ensuite aux autres mandats homonymes. Priorité 1 : un parlementaire homonyme."),
    "fusion_entites": ("Fusions d'entités demandées", "Deux entités existantes désignent le même objet (personne RNE "
                       "établie par revue qui est un parlementaire…) : `python -m src revue fusionner`. Le cas trace "
                       "la décision ; la fusion est appliquée aussitôt."),
    "conflit_fusion": ("Valeurs divergentes après une fusion", "Les deux entités fusionnées publiaient des valeurs "
                       "différentes : celles de l'entité gardée l'emportent, les autres sont dans le contexte. "
                       "Constater, ou corriger la valeur gardée."),
    "amendement_ambigu": ("Amendements cités désignant plusieurs amendements",
                          "Le numéro cité correspond à plusieurs amendements. Choisir le bon, ou « aucun »."),
    "amendement_introuvable": ("Amendements cités introuvables",
                               "Le numéro cité ne correspond à aucun amendement connu. Constater."),
    "etape_ambigue": ("Amendements dont l'étape d'examen est ambiguë",
                      "Le texte visé et l'organe d'examen désignent plusieurs étapes du dossier (acte publié dans "
                      "deux dossiers, deux séances de CMP). Choisir l'étape, ou « aucun »."),
    "article_vise_illisible": ("Amendements dont l'article visé ne se lit pas",
                               "La division visée par l'amendement n'a pas de numéro d'article lisible (coquille de la "
                               "source, articles groupés) : l'amendement n'est pas relié à un article suivi. Constater."),
    "article_sans_numero": ("Articles sans numéro lisible",
                            "Le numéro de l'article ne se lit pas : il ne peut pas être suivi d'une version à l'autre. Constater."),
    "articles_plage": ("Plages d'articles", "Un intitulé désigne une plage (« Articles 6 à 14 ») : les articles "
                       "intermédiaires ne sont pas connus, la version n'est pas suivie. Constater."),
    "texte_non_decoupe": ("Textes non découpés en articles", "Le texte n'utilise pas le balisage des articles : "
                          "il est conservé entier, sans versions d'articles. Constater ou adapter le découpage."),
    "modification_a_attribuer": ("Modifications d'articles à attribuer",
                                 "Un article a changé d'une version à la suivante ; des amendements adoptés le visent "
                                 "(candidats), mais aucun n'est prouvé seul à l'origine. Constater l'amendement d'origine."),
    "modification_sans_amendement": ("Modifications d'articles sans amendement",
                                     "Un article a changé sans qu'aucun amendement adopté ne le vise à cette étape "
                                     "(transmission, coordination, mise en forme). Constater."),
    "navette_incertaine": ("Navette incertaine", "La version précédente d'un texte ne se lit pas avec certitude "
                           "(ordre ambigu, texte non chargé, rejeté ou renuméroté) : ses articles ne sont pas comparés. Constater."),
    "reference_inconnue": ("Références vers un objet inconnu",
                           "La source cite un identifiant absent des données chargées. Constater."),
    "lien_ecarte": ("Liens écartés", "Un lien cite un objet absent des données chargées. Constater."),
    "document_illisible": ("Documents illisibles", "Le document brut n'a pas pu être lu. Constater ou corriger l'adaptateur."),
    "document_non_publie": ("Documents annoncés, non publiés", "Le document annoncé n'est pas encore en ligne. Constater."),
}
GRAND_NOMBRE = 200                             # au-delà, le rapport Markdown renvoie au CSV complet


def _resoudre(registre, type_identite):
    if not type_identite:
        return None, None, None
    type_, identite = type_identite
    return type_, str(identite), (str(e) if (e := registre.resoudre(identite)) else None)


def signaler(entrepot, registre, cas: CasRevue, source_id, bilan: Counter | None = None) -> dict:
    """Consigne un cas ; s'il est déjà décidé, réapplique la décision. Retourne l'enregistrement."""
    sujet_type, sujet_identite, sujet_id = _resoudre(registre, cas.sujet)
    enregistrement = entrepot.signaler({
        "type": cas.type, "cle": cas.cle, "nature": cas.nature, "constat": cas.constat,
        "sujet_type": sujet_type, "sujet_identite": sujet_identite,
        "sujet_id": uuid.UUID(sujet_id) if sujet_id else None, "champ": cas.champ,
        "cibles": [dict(zip(("type", "identite", "entite_id"), _resoudre(registre, c))) for c in cas.cibles],
        "candidats": [{"type": c.type, "identite": str(c.identite),
                       "entite_id": _resoudre(registre, (c.type, c.identite))[2],
                       "libelle": c.libelle, "indices": c.indices} for c in cas.candidats],
        "contexte": cas.contexte, "source_id": source_id})
    if bilan is not None:
        bilan[f"cas.{cas.type}"] += 1
    if enregistrement.get("decision"):
        appliquer(entrepot, registre, enregistrement)
    return enregistrement


def appliquer(entrepot, registre, cas: dict):
    """Applique la décision d'un cas : rien d'autre que ce que la personne a choisi."""
    decision = cas["decision"] or {}
    choix = decision.get("choix")
    candidat = cas["candidats"][choix] if choix is not None else None
    preuve = {"cas": cas["cle"], "decide_par": cas.get("decide_par"), "motif": decision.get("motif")}
    if cas["nature"] == "identite":
        fusionner_si_meme_objet(entrepot, registre, cas, candidat, preuve)
    if cas["type"] == "correspondance_a_revoir":
        # La personne dit quelle entité l'identité désigne : cette correspondance-là est validée,
        # les autres rejetées ; « aucun » les rejette toutes.
        par = cas.get("decide_par") or "revue"
        for c in registre.entrepot.correspondances(IdentiteNative(*cas["sujet_identite"].split(":", 2))):
            bonne = candidat is not None and str(c.entite_id) == candidat["entite_id"]
            if bonne and not c.certaine:
                for autre in registre.entrepot.correspondances(c.identite):
                    if autre.certaine and autre.entite_id != c.entite_id:
                        registre.rejeter(autre, par, f"revue {cas['cle']}")
                registre.valider(c, par)
            elif not bonne and c.statut != "REJECTED" and c.methode != Methode.OFFICIAL_ID:
                registre.rejeter(c, par, f"revue {cas['cle']}")
    elif cas["nature"] == "champ" and candidat and candidat["entite_id"]:
        provenance = Provenance(cas["source_id"], f"revue:{cas['cle']}") if cas["source_id"] else None
        for cible in cas["cibles"]:
            if cible["entite_id"] and provenance:
                entrepot.corriger(cible["type"], uuid.UUID(cible["entite_id"]),
                                  {cas["champ"]: uuid.UUID(candidat["entite_id"])}, provenance)
    elif cas["nature"] == "champ" and choix is None and (creer := (cas["contexte"] or {}).get("si_aucun")):
        # « aucun » : personne de connu ; l'entité est créée telle que la source la publie, puis reliée
        entite_id = registre.identifier(creer["type"], IdentiteNative(*creer["identite"].split(":", 2)))
        provenance = Provenance(cas["source_id"], f"revue:{cas['cle']}") if cas["source_id"] else None
        if provenance:
            if entrepot.lire(creer["type"], entite_id) is None:
                entrepot.ecrire(creer["type"], entite_id, creer["valeurs"], provenance)
            for cible in cas["cibles"]:
                if cible["entite_id"]:
                    entrepot.corriger(cible["type"], uuid.UUID(cible["entite_id"]), {cas["champ"]: entite_id},
                                      provenance)
    elif cas["nature"] == "identite" and candidat and candidat["entite_id"]:
        systeme, type_source, id_source = cas["sujet_identite"].split(":", 2)
        registre.rapprocher(candidat["type"], uuid.UUID(candidat["entite_id"]),
                            IdentiteNative(systeme, type_source, id_source), Methode.MANUAL, preuve)
    elif cas["nature"] == "identite" and choix is None and (creer := (cas["contexte"] or {}).get("si_aucun")):
        # « aucun » : ce n'est personne de connu ; l'entité est créée telle que la source la publie
        identite = IdentiteNative(*cas["sujet_identite"].split(":", 2))
        entite_id = registre.identifier(creer["type"], identite)
        if entrepot.lire(creer["type"], entite_id) is None and cas["source_id"]:
            entrepot.ecrire(creer["type"], entite_id, creer["valeurs"], Provenance(cas["source_id"], f"revue:{cas['cle']}"))
    entrepot.marquer_applique(cas["cle"])


def fusionner_si_meme_objet(entrepot, registre, cas: dict, candidat: dict | None, preuve: dict) -> dict | None:
    """Le sujet du cas est l'identité propre (`OFFICIAL_ID`) d'une entité B ; la décision désigne
    une autre entité A du même type : B et A sont le même objet, B est fusionnée dans A.

    Une identité reliée à B par référence (pas la sienne) ne dit rien de B : la décision rejette
    seulement ce lien. Un cas `fusion_entites` est une demande explicite : fusion dans tous les cas.
    Rejouée, la décision ne fait rien (l'identité désigne déjà A)."""
    if not (candidat and candidat["entite_id"] and cas["sujet_identite"]):
        return None
    identite = IdentiteNative(*cas["sujet_identite"].split(":", 2))
    absorbee, absorbante = registre.resoudre(identite), uuid.UUID(candidat["entite_id"])
    if absorbee is None or absorbee == absorbante:
        return None
    lien = next(c for c in entrepot.correspondances(identite) if c.certaine)
    if cas["type"] != "fusion_entites" and lien.methode != Methode.OFFICIAL_ID:
        return None
    if lien.type_entite != candidat["type"]:
        raise ValueError(f"{cas['cle']} : {lien.type_entite} et {candidat['type']} ne se fusionnent pas")
    bilan = registre.fusionner(lien.type_entite, absorbee, absorbante, preuve)
    if bilan and bilan["conflits"]:
        conflits = json.loads(json.dumps(bilan["conflits"], default=str))
        signaler(entrepot, registre, CasRevue(
            "conflit_fusion", f"conflit_fusion:{identite}", "constat",
            f"{lien.type_entite} {identite} fusionné dans {absorbante} : {len(conflits)} valeur(s) différente(s) "
            f"({', '.join(conflits)}), celles de l'entité gardée l'emportent",
            contexte={"cas": cas["cle"], "absorbee": str(absorbee), "absorbante": str(absorbante), "conflits": conflits}),
            cas["source_id"])
    return bilan


def fusionner(entrepot, registre, type_: str, absorbee: IdentiteNative, absorbante: IdentiteNative, par: str,
              motif: str | None = None) -> dict:
    """Fusion demandée par une personne : consignée (cas `fusion_entites`), décidée et appliquée."""
    for identite in (absorbee, absorbante):
        if registre.resoudre(identite) is None:
            raise KeyError(f"identité inconnue ou non certaine : {identite}")
    cas = CasRevue("fusion_entites", f"fusion_entites:{absorbee}", "identite",
                   f"{absorbee} et {absorbante} désignent le même objet ({type_})", sujet=(type_, absorbee),
                   candidats=(Candidat(type_, absorbante, str(absorbante)),))
    with registre.transaction():
        signaler(entrepot, registre, cas, None)
        decider(entrepot, registre, cas.cle, 0, par, motif)
    return next(c for c in entrepot.cas_revue("fusion_entites") if c["cle"] == cas.cle)


def decider(entrepot, registre, cle: str, choix: int | None, par: str, motif: str | None = None):
    """Enregistre la décision d'une personne et l'applique aussitôt."""
    cas = next((c for c in entrepot.cas_revue() if c["cle"] == cle), None)
    if cas is None:
        raise KeyError(f"cas inconnu : {cle}")
    if choix is not None and not 0 <= choix < len(cas["candidats"]):
        raise ValueError(f"{cle} : {len(cas['candidats'])} candidat(s), choix {choix} impossible")
    if cas["nature"] == "constat" and choix is not None:
        raise ValueError(f"{cle} : cas de constat, rien à choisir (choix « aucun »)")
    with registre.transaction():
        entrepot.decider(cle, {"choix": choix, "motif": motif}, par)
        cas = next(c for c in entrepot.cas_revue() if c["cle"] == cle)
        appliquer(entrepot, registre, cas)


# Rapport --------------------------------------------------------------------------------------
def _ligne(cas: dict) -> dict:
    candidats = " ; ".join(f"[{i}] {c['libelle'] or c['identite']}"
                           + (f" ({', '.join(f'{k}={v}' for k, v in c['indices'].items())})" if c["indices"] else "")
                           for i, c in enumerate(cas["candidats"]))
    return {"cle": cas["cle"], "statut": cas["statut"], "constat": cas["constat"],
            "sujet": cas["sujet_identite"] or "", "champ": cas["champ"] or "", "cibles": len(cas["cibles"]),
            "candidats": candidats, "contexte": json.dumps(cas["contexte"], ensure_ascii=False, default=str),
            "decision": json.dumps(cas["decision"], ensure_ascii=False) if cas["decision"] else "",
            "decide_par": cas.get("decide_par") or ""}


def rapport(entrepot, dossier: Path) -> Path:
    """Écrit `rapport.md` (synthèse et détail) et un CSV complet par type de cas."""
    dossier.mkdir(parents=True, exist_ok=True)
    par_type = defaultdict(list)
    for c in entrepot.cas_revue():
        par_type[c["type"]].append(c)
    verifiees = [l for l in entrepot.compter_correspondances() if l[2] != Methode.OFFICIAL_ID]
    officielles = sum(l[4] for l in entrepot.compter_correspondances() if l[2] == Methode.OFFICIAL_ID)
    md = [f"# Rapport de revue des rapprochements — {datetime.now():%d/%m/%Y %H:%M}", "",
          "Mécanismes et règles : [docs/rapprochements.md](../rapprochements.md). Pour décider un cas :",
          "`python -m src revue decider <cle> --choix <n|aucun> --par <nom> [--motif …]`.", "",
          "## Synthèse", "", "| Type | À revoir | Décidés | Appliqués | Caducs | Total |", "|---|---|---|---|---|---|"]
    for type_ in [*TYPES, *sorted(set(par_type) - set(TYPES))]:
        cas = par_type.get(type_, [])
        statuts = Counter(c["statut"] for c in cas)
        md.append(f"| {TYPES.get(type_, (type_,))[0]} | {statuts['A_REVOIR']} | {statuts['DECIDE']} | "
                  f"{statuts['APPLIQUE']} | {statuts['CADUC']} | {len(cas)} |")
    md += ["", "## Rapprochements automatiques (références explicites, à auditer)", "",
           f"{officielles} identités natives lues dans leur propre source (OFFICIAL_ID). Correspondances "
           "entre sources (référence explicite : une source cite l'identifiant de l'autre ; MANUAL : décision "
           "de revue ; NAME_DATE : proposition) :", "",
           "| Système | Type d'objet | Méthode | Statut | Nombre |", "|---|---|---|---|---|"]
    md += [f"| {s} | {t} | {m} | {st} | {n} |" for s, t, m, st, n in verifiees]
    for type_, (titre, consigne) in TYPES.items():
        cas = par_type.get(type_, [])
        if not cas:
            continue
        lignes = [_ligne(c) for c in cas]
        with open(dossier / f"{type_}.csv", "w", newline="", encoding="utf-8") as f:
            ecrivain = csv.DictWriter(f, fieldnames=list(lignes[0]))
            ecrivain.writeheader()
            ecrivain.writerows(lignes)
        a_revoir = [l for l in lignes if l["statut"] == "A_REVOIR"]
        md += ["", f"## {titre} — {len(cas)} cas ({len(a_revoir)} à revoir)", "", consigne, "",
               f"Liste complète : [{type_}.csv]({type_}.csv).", ""]
        a_revoir.sort(key=lambda l: json.loads(l["contexte"]).get("priorite", 9) if l["contexte"] else 9)
        exemples = a_revoir[:GRAND_NOMBRE] if len(a_revoir) > GRAND_NOMBRE else a_revoir
        if len(a_revoir) > GRAND_NOMBRE:
            md.append(f"Les {GRAND_NOMBRE} premiers cas à revoir sur {len(a_revoir)} :")
            md.append("")
        if exemples:
            md += ["| Clé | Constat | Candidats |", "|---|---|---|"]
            md += [f"| `{l['cle']}` | {l['constat']} | {l['candidats'] or '—'} |" for l in exemples]
    cible = dossier / "rapport.md"
    cible.write_text("\n".join(md) + "\n", encoding="utf-8")
    return cible
