"""Les objets des sources officielles, 17e législature : d'où vient chaque objet, sa famille, son
format, sa livraison, et comment en lire un échantillon dans le cache (`data/brut`).

À valider objet par objet (data/echantillons/rapport.md) : la famille est une proposition, la
fréquence de mise à jour est observée (date du fichier publié), jamais supposée.

Livraison :
- « stock complet » : chaque publication remplace la précédente, tout l'objet y est ;
- « incrémental » : chaque publication ne contient que ce qui a changé depuis la précédente
  (fichiers datés de la DILA), à côté d'un stock global publié plus rarement.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from . import lecture as L

DEBUT_17E = "2024-07-18"
"""Première séance de la 17e législature : borne des échantillons datés (Sénat)."""

AN = "https://data.assemblee-nationale.fr/static/openData/repository/17"
AN_PAGE = "https://data.assemblee-nationale.fr/"
SENAT = "https://data.senat.fr/data"
SENAT_PAGE = "https://data.senat.fr/"
DILA = "https://echanges.dila.gouv.fr/OPENDATA"
LICENCE = "Licence Ouverte / Etalab 2.0"


@dataclass(frozen=True)
class Objet:
    cle: str
    famille: str
    producteur: str
    jeu: str
    page: str
    url: str
    fichier: str
    """Chemin dans data/brut."""
    format: str
    livraison: str
    lire: Callable[[Path, int], tuple[list[dict], int]] | None
    perimetre: str = "17e législature"
    n: int = 300
    remarque: str = ""
    licence: str = LICENCE


@dataclass(frozen=True)
class Dump:
    """Un dump PostgreSQL du Sénat : chaque table est un objet."""
    cle: str
    familles: dict[str, str]
    """Famille par table ; « * » pour les autres."""
    jeu: str
    url: str
    fichier: str
    membre: str
    filtres: dict[str, Callable[[dict], bool]] = field(default_factory=dict)
    n: int = 300


def depuis_17e(colonne: str) -> Callable[[dict], bool]:
    return lambda l: (l.get(colonne) or "") >= DEBUT_17E


def session_17e(l: dict) -> bool:
    # Session parlementaire 2023-2024 (finie le 30/09/2024) et suivantes : elles couvrent la 17e.
    return (l.get("sesann") or "") >= "2023"


def an(cle, famille, fichier, chemin_url, motif, racine, n=300, remarque="", format_="JSON dans une archive ZIP (un fichier par objet)"):
    return Objet(cle, famille, "Assemblée nationale", chemin_url.rsplit("/", 1)[-1], AN_PAGE, f"{AN}/{chemin_url}",
                 f"an/{fichier}", format_, "stock complet",
                 lambda p, n: L.membres_zip(p, motif, n, L.json_membre(racine) if format_.startswith("JSON") else L.xml_membre(racine)),
                 n=n, remarque=remarque)


OBJETS: list[Objet] = [
    # ---------- Assemblée nationale ----------
    an("an.acteur", "Acteurs", "acteurs.json.zip",
       "amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip",
       r"json/acteur/", "acteur", remarque="Mandats dans l'acteur (table fille). Historique complet de chaque acteur, pas seulement la 17e."),
    an("an.organe", "Acteurs", "acteurs.json.zip",
       "amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip",
       r"json/organe/", "organe", remarque="Tous les organes, toutes législatures."),
    an("an.deport", "Acteurs", "acteurs.json.zip",
       "amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip",
       r"json/deport/", "deport"),
    an("an.dossier", "Dossiers et textes", "dossiers.json.zip", "loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip",
       r"json/dossierParlementaire/", "dossierParlementaire", remarque="Actes de procédure imbriqués (tables filles)."),
    an("an.document", "Dossiers et textes", "dossiers.json.zip", "loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip",
       r"json/document/", "document"),
    an("an.amendement", "Amendements", "amendements.json.zip", "loi/amendements_div_legis/Amendements.json.zip",
       r"\.json$", "amendement"),
    an("an.scrutin", "Scrutins", "scrutins.json.zip", "loi/scrutins/Scrutins.json.zip", r"\.json$", "scrutin",
       remarque="Votes nominatifs imbriqués par groupe."),
    an("an.reunion", "Agenda et séances", "agenda.json.zip", "vp/reunions/Agenda.json.zip", r"json/reunion/", "reunion"),
    an("an.compte_rendu", "Débats", "comptes_rendus.xml.zip", "vp/syceronbrut/syseron.xml.zip", r"xml/compteRendu/", None, n=12,
       format_="XML dans une archive ZIP (un fichier par séance)",
       remarque="Un document par séance, très long : échantillon de 12 séances."),
    an("an.question_ecrite", "Questions", "questions_ecrites.json.zip", "questions/questions_ecrites/Questions_ecrites.json.zip",
       r"\.json$", "question"),
    an("an.question_gouvernement", "Questions", "questions_gouvernement.json.zip",
       "questions/questions_gouvernement/Questions_gouvernement.json.zip", r"\.json$", "question"),
    an("an.question_orale", "Questions", "questions_orales.json.zip",
       "questions/questions_orales_sans_debat/Questions_orales_sans_debat.json.zip", r"\.json$", "question"),
    Objet("an.texte_html", "Dossiers et textes", "Assemblée nationale", "Documents (rendu HTML)", AN_PAGE,
          "https://www.assemblee-nationale.fr/dyn/opendata/<uid>.html", "an/textes", "HTML, un fichier par document", "document par document",
          None, remarque="Texte intégral d'un document, découpé par les classes HTML : pas de champs structurés."),
    Objet("an.compte_rendu_commission_html", "Débats", "Assemblée nationale", "Comptes rendus de commission (rendu HTML)", AN_PAGE,
          "https://www.assemblee-nationale.fr/dyn/opendata/<uid>.html", "an/commissions", "HTML, un fichier par réunion",
          "document par document", None, remarque="Pas de champs structurés."),

    # ---------- Sénat : CSV et XML ----------
    *[Objet(f"senat.{nom}", "Acteurs", "Sénat", f"ODSEN_{nom.upper()}.csv", SENAT_PAGE, f"{SENAT}/senateurs/ODSEN_{nom.upper()}.csv",
            f"senat/{fichier}", "CSV (précédé de la requête SQL en commentaire « % »)", "stock complet",
            lambda p, n: L.lignes_csv(p, n), perimetre="tous les sénateurs, toutes périodes")
      for nom, fichier in (("general", "senateurs.csv"), ("elusen", "elusen.csv"), ("histogroupes", "histogroupes.csv"),
                           ("coms", "coms.csv"), ("eludep", "eludep.csv"), ("mandat_local", "mandat_local.csv"))],
    Objet("senat.cri", "Débats", "Sénat", "Comptes rendus intégraux (cri.zip)", SENAT_PAGE, f"{SENAT}/debats/cri.zip", "senat/cri.zip",
          "XHTML (balises cri:, mal formé) dans une archive ZIP, un fichier par séance ; lu comme texte", "stock complet",
          lambda p, n: L.membres_zip(p, r"cri/d(20240[7-9]|20241|2025|2026)", n, L.html_membre), n=6,
          perimetre="séances depuis juillet 2024", remarque="Un document par séance, très long : échantillon de 6 séances."),
    Objet("senat.akn_texte", "Dossiers et textes", "Sénat", "Textes Akoma Ntoso", "https://www.senat.fr/akomantoso/",
          "https://www.senat.fr/akomantoso/<texte>.akn.xml", "senat/akn", "XML Akoma Ntoso, un fichier par texte", "document par document",
          lambda p, n: L.membres_dossier(p, r"\.akn\.xml$", n, L.xml_membre()), n=40,
          perimetre="textes téléchargés (index depots.xml et adoptions.xml)"),
    *[Objet(f"senat.akn_{nom}", "Dossiers et textes", "Sénat", f"Index Akoma Ntoso {nom}.xml", "https://www.senat.fr/akomantoso/",
            f"https://www.senat.fr/akomantoso/{nom}.xml", f"senat/akn_{nom}.xml", "XML (liste de textes)", "stock complet",
            lambda p, n: L.enregistrements_xml(p, "text", n), perimetre="tous les textes indexés")
      for nom in ("depots", "adoptions")],

    # ---------- DILA : Légifrance et Conseil constitutionnel ----------
    *[Objet(f"legi.{nom}", "Droit en vigueur", "DILA", "LEGI (codes et textes consolidés)", f"{DILA}/LEGI/", f"{DILA}/LEGI/",
            "legifrance/LEGI_20261023-215041.tar.gz", "XML dans une archive tar.gz, un fichier par objet",
            "incrémental (une archive datée par livraison) + stock global",
            lambda p, n, m=motif: L.membres_tar(p, m, n, L.xml_membre()), n=150,
            perimetre="une livraison incrémentale (23/10/2026)", remarque=rq)
      for nom, motif, rq in (("article", r"/article/.*\.xml$", "Une version d'article par fichier, avec la liste de toutes ses versions."),
                             ("section", r"/section_ta/.*\.xml$", ""),
                             ("texte_version", r"/texte/version/.*\.xml$", ""),
                             ("texte_struct", r"/texte/struct/.*\.xml$", ""))],
    *[Objet(f"jorf.{nom}", "Journal officiel", "DILA", "JORF (Journal officiel)", f"{DILA}/JORF/", f"{DILA}/JORF/",
            "legifrance/JORF_20261024-014834.tar.gz", "XML dans une archive tar.gz, un fichier par objet",
            "incrémental (une archive datée par livraison) + stock global",
            lambda p, n, m=motif: L.membres_tar(p, m, n, L.xml_membre()), n=150, perimetre="une livraison incrémentale (24/10/2026)")
      for nom, motif in (("article", r"/article/.*\.xml$"), ("section", r"/section_ta/.*\.xml$"),
                         ("texte_version", r"/texte/version/.*\.xml$"), ("texte_struct", r"/texte/struct/.*\.xml$"))],
    Objet("constit.decision", "Contrôle constitutionnel", "DILA", "CONSTIT (décisions du Conseil constitutionnel)", f"{DILA}/CONSTIT/",
          f"{DILA}/CONSTIT/", "constit/CONSTIT_20261019-211152.tar.gz", "XML dans une archive tar.gz, un fichier par décision",
          "incrémental (une archive datée par livraison) + stock global",
          lambda p, n: L.membres_tar(p, r"\.xml$", n, L.xml_membre()), perimetre="une livraison incrémentale (19/10/2026)"),

    # ---------- HATVP ----------
    Objet("hatvp.declaration", "Transparence", "HATVP", "Déclarations d'intérêts et de patrimoine", "https://www.hatvp.fr/open-data/",
          "https://www.hatvp.fr/livraison/merge/declarations.xml", "hatvp/declarations.xml", "XML (un fichier, toutes les déclarations)",
          "stock complet", lambda p, n: L.enregistrements_xml(p, "declaration", n), n=150, perimetre="toutes les déclarations publiées"),
    Objet("hatvp.declaration_liste", "Transparence", "HATVP", "Liste des déclarations", "https://www.hatvp.fr/open-data/",
          "https://www.hatvp.fr/livraison/opendata/liste.csv", "hatvp/declarations_liste.csv", "CSV", "stock complet",
          lambda p, n: L.lignes_csv(p, n), perimetre="toutes les déclarations publiées"),
    Objet("hatvp.representant", "Transparence", "HATVP", "Répertoire des représentants d'intérêts", "https://www.hatvp.fr/open-data/",
          "https://www.hatvp.fr/agora/opendata/agora_repertoire_opendata.json", "hatvp/repertoire.json",
          "JSON (un fichier, liste « publications »)", "stock complet",
          lambda p, n: L.enregistrements_json(p, "publications", n), n=150, perimetre="tout le répertoire",
          remarque="Activités et exercices imbriqués (tables filles)."),

    # ---------- RNE et INSEE ----------
    *[Objet(f"rne.{nom}", "Élus (RNE)", "Ministère de l'Intérieur", f"Répertoire national des élus : {titre}",
            "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1", "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
            f"rne/{fichier}", "CSV", "stock complet", lambda p, n: L.lignes_csv(p, n), perimetre="élus en fonction")
      for nom, titre, fichier in (("depute", "députés", "elus_deputes_dep_csv.csv"), ("senateur", "sénateurs", "elus_senateurs_sen_csv.csv"),
                                  ("maire", "maires", "elus_maires_mai_csv.csv"),
                                  ("conseiller_communautaire", "conseillers communautaires", "elus_conseillers_communautaires_epci_csv.csv"),
                                  ("depute_europeen", "représentants au Parlement européen", "elus_representants_parlement_europ_en_rpe_csv.csv"))],
    *[Objet(f"insee.{nom}", "Territoires", "INSEE", f"Code officiel géographique 2026 : {nom}",
            "https://www.insee.fr/fr/statistiques/8740222", f"https://www.insee.fr/fr/statistiques/fichier/8740222/v_{nom}_2026.csv",
            f"insee/v_{nom}_2026.csv", "CSV", "millésime annuel (stock complet)", lambda p, n: L.lignes_csv(p, n),
            perimetre="COG au 1er janvier 2026")
      for nom in ("commune", "departement", "region", "comer")],
]

DUMPS: list[Dump] = [
    Dump("senat.ameli", {"*": "Amendements"}, "AMELI (amendements)", f"{SENAT}/ameli/ameli.zip", "senat/ameli.zip",
         "var/opt/opendata/ameli.sql",
         {"amd": depuis_17e("datdep"), "txt_ameli": depuis_17e("datdep"), "sea": depuis_17e("dat")}),
    Dump("senat.dosleg", {"*": "Dossiers et textes", **{t: "Scrutins" for t in ("scr", "votsen", "amescr", "corscr", "posvot", "stavot", "titsen")}},
         "DOSLEG (dossiers législatifs)", f"{SENAT}/dosleg/dosleg.zip", "senat/dosleg.zip", "dosleg.sql",
         {"loi": depuis_17e("date_loi"), "doc": depuis_17e("docdat"), "texte": depuis_17e("txtoritxtdat"), "scr": depuis_17e("scrdat"),
          "votsen": session_17e, "evtsea": depuis_17e("evtseadat"), "date_seance": depuis_17e("date_s"), "aud": depuis_17e("auddat")}),
    Dump("senat.debats", {"*": "Débats"}, "Débats (index des comptes rendus)", f"{SENAT}/debats/debats.zip", "senat/debats.zip", "debats.sql",
         {t: depuis_17e("datsea") for t in ("debats", "secdis", "secdivers", "lecassdeb")}),
    Dump("senat.sens", {"*": "Acteurs"}, "SENS (sénateurs, organes, fonctions)", f"{SENAT}/senateurs/export_sens.zip",
         "senat/export_sens.zip", "export_sens.sql"),
]
