"""Dossiers législatifs de l'AN : dossiers, arbre des actes (étapes réelles) et documents.

Les étapes sont celles que publie l'AN, typées d'après `@xsi:type` (le `codeActe` reste dans
`code_source`). Identité d'une étape : « dossier:acte », car quelques actes (PLF) figurent dans
deux dossiers. Aucune étape n'est supposée : la barre de parcours du design sera une projection.
Les liens étape → réunion, point d'ordre du jour, texte, et document → auteurs sont des
références explicites ; une cible absente (réunion du Sénat, texte hors archive) est écartée.
"""

import re

from ....chargement import Document, Flux
from ....domaine import IdentiteNative, Methode
from ....domaine.objets import Dependants, Objet, Rapprochement
from .commun import DOCUMENT, LICENCE, Systeme, an, documents, fichier, jour, liste, lire, val

DOSSIERS = fichier("dossiers.json.zip", "loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip")

SIGNET_SENAT = re.compile(r"/dossier-legislatif/([^/.]+)\.html")

TYPES_ETAPE = {
    "DepotInitiative_Type": "depot", "DepotInitiativeNavette_Type": "depot", "DepotAccordInternational_Type": "depot",
    "DepotLettreRectificative_Type": "depot", "SaisieComFond_Type": "saisine_commission",
    "SaisieComAvis_Type": "saisine_commission", "RenvoiPrealable_Type": "saisine_commission",
    "NominRapporteurs_Type": "nomination_rapporteurs", "DiscussionCommission_Type": "reunion_commission",
    "DepotRapport_Type": "rapport", "DiscussionSeancePublique_Type": "seance", "Decision_Type": "decision",
    "ProcedureAccelere_Type": "procedure_acceleree", "Promulgation_Type": "promulgation",
    "RetraitInitiative_Type": "retrait", "SaisineConseilConstit_Type": "saisine_cc",
    "ConclusionEtapeCC_Type": "decision_cc", "RenvoiCMP_Type": "convocation_cmp",
    "CreationOrganeTemporaire_Type": "creation_organe", "DepotMotionCensure_Type": "motion",
    "DecisionMotionCensure_Type": "motion", "MotionProcedure_Type": "motion", "EtudeImpact_Type": "etude_impact",
    "DepotAvisConseilEtat_Type": "avis_ce", "DeclarationGouvernement_Type": "declaration_gouvernement",
}
LECTURES = {"AN1": "1", "SN1": "1", "AN2": "2", "SN2": "2", "ANLUNI": "unique", "ANNLEC": "nouvelle",
            "SNNLEC": "nouvelle", "ANLDEF": "definitive", "CMP": "cmp"}
TYPES_DOCUMENT = {"PRJL": "projet", "PION": "proposition", "PNRE": "proposition", "RAPP": "rapport",
                  "RINF": "rapport", "RION": "rapport", "AVIS": "avis", "ETDI": "etude_impact", "AVCE": "avis_ce",
                  "ACIN": "accord", "MION": "motion", "TCOM": "texte_commission", "TADO": "texte_adopte"}


def chambre(code: str) -> str | None:
    for prefixe, nom in (("CMP", "CMP"), ("CC", "CC"), ("PROM", "PR"), ("AN", "AN"), ("SN", "SENAT")):
        if code.startswith(prefixe):
            return nom
    return None


def type_etape(acte: dict, racine: bool) -> str:
    if acte.get("@xsi:type") in TYPES_ETAPE:
        return TYPES_ETAPE[acte["@xsi:type"]]
    code = acte["codeActe"]
    if racine:
        return {"CMP": "cmp", "CC": "controle_constitutionnalite", "PROM": "promulgation"}.get(code, "lecture")
    if "-COM" in code:
        return "commission"
    if "-DEBATS" in code:
        return "debats"
    return "autre"


INITIATIVE = {"PRJL": "gouvernement", "PION": "parlementaire", "PNRE": "parlementaire"}


def actes(noeud, parent=None, racine=None, chemin="/dossierParlementaire/actesLegislatifs"):
    """Actes en profondeur, dans l'ordre publié : (acte, uid du parent, code racine, pointeur)."""
    for i, a in enumerate(liste((noeud or {}).get("acteLegislatif"))):
        pointeur = f"{chemin}/acteLegislatif/{i}"
        code_racine = racine or a["codeActe"]
        yield a, parent, code_racine, pointeur
        yield from actes(a.get("actesLegislatifs"), a["uid"], code_racine, f"{pointeur}/actesLegislatifs")


def refs(x) -> list[str]:
    return [r for r in (val(v) for v in liste(x)) if r]


def textes_cites(a: dict) -> list:
    """Textes qu'un acte cite : déposé, adopté, loi, textes associés (uid tels que publiés)."""
    return (refs(a.get("texteAssocie")) + refs(a.get("texteAdopte")) + refs(a.get("texteLoiRef"))
            + [val(t.get("refTexteAssocie")) for t in liste((a.get("textesAssocies") or {}).get("texteAssocie"))])


def signet_senat(d: dict) -> str | None:
    """Signet du dossier du Sénat que l'AN cite (`senatChemin`), sinon None."""
    m = SIGNET_SENAT.search(val(d["titreDossier"].get("senatChemin")) or "")
    return m.group(1) if m else None


def cle_suivi(d: dict) -> str:
    """Clé de suivi des articles d'un dossier : celle du dossier Sénat quand l'AN le cite (même
    article des deux côtés de la navette), sinon celle du dossier AN."""
    signet = signet_senat(d)
    return f"SENAT:dossier:{signet}" if signet else f"AN:dossier:{d['uid']}"


def dossier(doc: Document):
    d = lire(doc)["dossierParlementaire"]
    uid, ident = d["uid"], an("dossier", d["uid"])
    tous = list(actes(d.get("actesLegislatifs")))
    depots = [jour(a["dateActe"]) for a, *_ in tous if TYPES_ETAPE.get(a.get("@xsi:type")) == "depot" and a.get("dateActe")]
    initiateur = d.get("initiateur") or {}
    acteurs_init = [val(x.get("acteurRef")) for x in liste((initiateur.get("acteurs") or {}).get("acteur"))]
    # Initiative : lue sur le texte déposé, pas sur les initiateurs (l'AN y liste aussi les
    # ministres d'un projet). PRJL… = projet de loi, donc le Gouvernement (Constitution, art. 39) ;
    # PION… (proposition de loi) et PNRE… (proposition de résolution) = parlementaires.
    deposes = [val(a.get("texteAssocie")) or "" for a, *_ in tous if a.get("@xsi:type") == "DepotInitiative_Type"]
    nature_depot = deposes[0][:4] if deposes else ""
    organes_init = [val((x.get("organeRef") or {}).get("uid") if isinstance(x.get("organeRef"), dict) else x.get("organeRef"))
                    for x in liste((initiateur.get("organes") or {}).get("organe"))]
    yield Objet("dossier", ident, {
        "titre": d["titreDossier"]["titre"], "titre_court": val(d["titreDossier"].get("titreChemin")),
        "type_procedure": (d.get("procedureParlementaire") or {}).get("libelle"),
        "procedure_acceleree": any(a.get("@xsi:type") == "ProcedureAccelere_Type" for a, *_ in tous),
        "initiative": INITIATIVE.get(nature_depot),
        "legislature": val(d.get("legislature")), "date_depot": min(depots) if depots else None},
        "/dossierParlementaire", f"https://www.assemblee-nationale.fr/dyn/{val(d.get('legislature'))}/dossiers/{uid}")
    # L'AN cite le dossier du Sénat : référence explicite, même dossier canonique des deux côtés.
    chemin_senat = val(d["titreDossier"].get("senatChemin")) or ""
    if m := SIGNET_SENAT.search(chemin_senat):
        yield Rapprochement("dossier", ident, IdentiteNative(Systeme.SENAT, "dossier", m.group(1)),
                            Methode.EXPLICIT_REFERENCE, {"senatChemin": chemin_senat}, chemin_senat)
    initiateurs = [an("acteur", r) for r in acteurs_init if r] + [an("organe", r) for r in organes_init if r]
    yield Dependants("lien", {"de_id": ident, "nature": "initiateur"},
                     [{"vers_id": c, "ordre": i} for i, c in enumerate(dict.fromkeys(initiateurs))],
                     "/dossierParlementaire/initiateur", ("vers_id",))

    for ordre, (a, parent, racine, pointeur) in enumerate(tous):
        etape = an("acte", f"{uid}:{a['uid']}")
        # Conclusion : `statutConclusion` (lectures, CMP), `decision` (motions : « Motion rejetée »)
        statut = a.get("statutConclusion") or a.get("decision") or {}
        yield Objet("etape", etape, {
            "dossier_id": ident, "parent_id": an("acte", f"{uid}:{parent}") if parent else None, "type": type_etape(a, parent is None),
            "code_source": a["codeActe"], "libelle": (a.get("libelleActe") or {}).get("nomCanonique"),
            "chambre": chambre(racine), "lecture": LECTURES.get(racine, racine.lower()), "ordre": ordre,
            "organe_id": an("organe", val(a.get("organeRef"))), "debut": jour(a.get("dateActe")),
            "statut": "faite", "conclusion": val(statut.get("libelle"))}, pointeur)
        rapporteurs = [val(r.get("acteurRef")) for r in liste((a.get("rapporteurs") or {}).get("rapporteur"))]
        textes = textes_cites(a)
        # Décision du Conseil constitutionnel citée par l'acte : même numéro que le stock CONSTIT.
        cc = None
        if a.get("@xsi:type") == "ConclusionEtapeCC_Type" and val(a.get("numDecision")) and val(a.get("anneeDecision")):
            cc = IdentiteNative(Systeme.CONSTIT, "decision", f"{val(a['anneeDecision'])}-{val(a['numDecision'])}")
            yield Objet("decision_cc", cc, {"numero": cc.id_source, "dossier_id": ident}, pointeur)
        # Promulgation : le texte publié au Journal officiel, identifié par son NOR.
        texte_publie = None
        info_jo = a.get("infoJO") or {}
        if a.get("@xsi:type") == "Promulgation_Type" and val(info_jo.get("referenceNOR")):
            texte_publie = IdentiteNative(Systeme.LEGIFRANCE, "nor", val(info_jo["referenceNOR"]))
            titre_loi = val(a.get("titreLoi")) or ""
            yield Objet("texte_publie", texte_publie, {
                "nature": "LOI_ORGANIQUE" if "organique" in titre_loi.lower() else "LOI", "numero": val(a.get("codeLoi")),
                "nor": texte_publie.id_source, "titre": titre_loi or None,
                "date_publication": jour(info_jo.get("dateJO")) or jour(a.get("dateActe")),
                "numero_jo": val(info_jo.get("numJO")), "dossier_id": ident,
                "url": val(info_jo.get("urlLegifrance"))}, pointeur, val(info_jo.get("urlLegifrance")))
        for nature, cibles in (("decision_cc", [cc] if cc else []), ("texte_publie", [texte_publie] if texte_publie else []),
                               ("rapporteur", [an("acteur", r) for r in rapporteurs if r]),
                               ("reunion", [an("reunion", r) for r in refs(a.get("reunionRef"))]),
                               ("point_odj", [an("point_odj", r) for r in refs(a.get("odjRef"))]),
                               ("texte", [an("document", t) for t in dict.fromkeys(textes) if t])):
            yield Dependants("lien", {"de_id": etape, "nature": nature},
                             [{"vers_id": c, "ordre": i} for i, c in enumerate(dict.fromkeys(cibles))], pointeur, ("vers_id",))


def document(doc: Document):
    d = lire(doc)
    d = d.get("document") or d
    uid, ident = d["uid"], an("document", d["uid"])
    classe = d.get("classification") or {}
    code = (classe.get("type") or {}).get("code")
    sous_type = (classe.get("sousType") or {}).get("code")
    yield Objet("document", ident, {
        "dossier_id": an("dossier", val(d.get("dossierRef"))), "type": TYPES_DOCUMENT.get(code, "autre"),
        "type_source": "/".join(x for x in (code, sous_type) if x), "titre": (d.get("titres") or {}).get("titrePrincipal"),
        "numero": val((d.get("notice") or {}).get("numNotice")),
        "date": jour(((d.get("cycleDeVie") or {}).get("chrono") or {}).get("dateDepot")),
        "url": f"{DOCUMENT}/{uid}.html"}, "/document")
    auteurs = []
    for a in liste((d.get("auteurs") or {}).get("auteur")):
        if (a.get("acteur") or {}).get("acteurRef"):
            auteurs.append(an("acteur", val(a["acteur"]["acteurRef"])))
        elif (a.get("organe") or {}).get("organeRef"):
            auteurs.append(an("organe", val(a["organe"]["organeRef"])))
    cosignataires = [an("acteur", val((c.get("acteur") or {}).get("acteurRef")))
                     for c in liste((d.get("coSignataires") or {}).get("coSignataire"))
                     if val((c.get("acteur") or {}).get("acteurRef"))]
    for nature, cibles in (("auteur", auteurs), ("cosignataire", cosignataires)):
        yield Dependants("lien", {"de_id": ident, "nature": nature},
                         [{"vers_id": c, "ordre": i} for i, c in enumerate(dict.fromkeys(cibles))], "/document", ("vers_id",))


# Textes cités par un compte rendu de séance : projets et propositions, mais aussi rapports et
# avis (le texte de la commission est publié avec le rapport : « (n° 1364) »). Seulement les
# documents principaux, dont l'uid porte le numéro : les tomes et annexes (« -tI », « -COMPA »)
# reprennent le numéro d'un autre dossier. Le numéro n'est unique qu'au sein d'une législature.
TEXTE_CITABLE = re.compile(r"^(?:PRJL|PION|PNRE|RAPP|RION|AVIS)ANR5L(\d+)B(\d+)$")


def numeros_de_texte(chemin) -> dict[tuple[str, str], set[str]]:
    """(législature, numNotice « 2453 ») -> dossiers des documents principaux qui le portent."""
    index: dict[tuple[str, str], set[str]] = {}
    for doc in documents(DOSSIERS, chemin, "document/"):
        d = lire(doc)
        d = d.get("document") or d
        m = TEXTE_CITABLE.match(d["uid"])
        numero, dossier_ref = val((d.get("notice") or {}).get("numNotice")), val(d.get("dossierRef"))
        if m and numero and dossier_ref and int(m.group(2)) == int(numero):
            index.setdefault((m.group(1), numero), set()).add(dossier_ref)
    return index


def actes_des_scrutins(chemin) -> dict[str, tuple[str, str]]:
    """Scrutin (`voteRefs`) -> (dossier, identité composite de l'étape qui le cite)."""
    index = {}
    for doc in documents(DOSSIERS, chemin, "dossierParlementaire/"):
        d = lire(doc)["dossierParlementaire"]
        for a, *_ in actes(d.get("actesLegislatifs")):
            for vote in refs((a.get("voteRefs") or {}).get("voteRef")):
                index.setdefault(vote, (d["uid"], f"{d['uid']}:{a['uid']}"))
    return index


# Étapes d'examen d'une lecture : la commission saisie au fond ou pour avis, la séance publique
# (`CMP-DEBATS-AN`, `CMP-DEBATS-SN` pour les conclusions d'une CMP). Leurs sous-actes (réunions,
# décision) ne sont pas l'étape : on rattache l'amendement au niveau qui porte l'organe d'examen.
EXAMEN = re.compile(r"-(?:COM-FOND|COM-AVIS|DEBATS(?:-AN|-SN)?)$")
# Textes du Sénat cités par l'AN : « PRJLSNR5S479B0689 » (déposé), « …BTC0763 » (de la commission).
# Le numéro est celui de la série des textes du Sénat ; les textes adoptés (`BTA`) ont leur propre
# série, les rapports ne sont pas amendés : ni les uns ni les autres ne sont retenus.
TEXTE_SENAT = re.compile(r"^(?:PRJL|PION|PNRE)SNR5S\d+B(?:TC)?0*(\d+)$")


class Examens:
    """Ce que les dossiers publient pour rattacher un amendement, lu une fois :
    - `cles` : dossier -> clé de suivi de ses articles (cf. `cle_suivi`) ;
    - `etapes` : (dossier, texte AN cité par une lecture, organe) -> étapes d'examen de cette
      lecture menées par cet organe (identités « dossier:acte ») ;
    - `lectures_senat` : signet Sénat -> lectures des dossiers AN qui le citent :
      (dossier, code de la lecture, numéros des textes du Sénat cités, étapes d'examen)."""

    def __init__(self, dossiers):
        """`dossiers` : les `dossierParlementaire` tels que publiés (cf. `lire_examens`)."""
        self.cles: dict[str, str] = {}
        self.etapes: dict[tuple[str, str, str], list[str]] = {}
        self.lectures_senat: dict[str, list[tuple[str, str, set[str], list[tuple[str, str, str | None]]]]] = {}
        for d in dossiers:
            uid = d["uid"]
            self.cles[uid] = cle_suivi(d)
            # Une lecture par acte racine (son uid : un dossier repris d'une législature à l'autre a
            # plusieurs « AN1 ») : son code, les textes que ses actes citent, ses étapes d'examen.
            lectures: dict[str, tuple[str, set, list]] = {}
            for a, parent, racine, _ in actes(d.get("actesLegislatifs")):
                if parent is None:
                    lecture = a["uid"]
                _, textes, examens = lectures.setdefault(lecture, (racine, set(), []))
                textes.update(t for t in textes_cites(a) if t)
                if parent is not None and EXAMEN.search(a["codeActe"]):
                    examens.append((a["codeActe"], f"{uid}:{a['uid']}", val(a.get("organeRef"))))
            for _, textes, examens in lectures.values():
                for texte in textes:
                    for _, etape, organe in examens:
                        if organe:
                            self.etapes.setdefault((uid, texte, organe), []).append(etape)
            if signet := signet_senat(d):
                self.lectures_senat.setdefault(signet, []).extend(
                    (uid, racine, {m.group(1) for t in textes if (m := TEXTE_SENAT.match(t))}, examens)
                    for racine, textes, examens in lectures.values())


def lire_examens(chemin) -> Examens:
    return Examens(lire(doc)["dossierParlementaire"] for doc in documents(DOSSIERS, chemin, "dossierParlementaire/"))


def flux(chemin) -> list[Flux]:
    def prealable_dossier(doc):
        d = lire(doc)["dossierParlementaire"]
        return [("dossier", an("dossier", d["uid"]))] + [("etape", an("acte", f"{d['uid']}:{a['uid']}"))
                                                         for a, *_ in actes(d.get("actesLegislatifs"))]

    def prealable_document(doc):
        d = lire(doc)
        return [("document", an("document", (d.get("document") or d)["uid"]))]

    return [Flux(Systeme.AN, LICENCE, lambda: documents(DOSSIERS, chemin, "dossierParlementaire/"), dossier,
                 prealable_dossier),
            Flux(Systeme.AN, LICENCE, lambda: documents(DOSSIERS, chemin, "document/"), document, prealable_document)]
