"""Amendements cités par le compte rendu intégral du Sénat, retrouvés dans AMELI.

Deux références, la structurée d'abord :
- ancre `<a name="amd_2025_766_2">` posée par le Sénat dans l'intervention qui présente un
  amendement : session (`ses.ann`), numéro du texte AMELI (`txt_ameli.num`), numéro de
  l'amendement (`amd.num`, « I_12 » pour « I-12 », suffixe `_rect_N` ignoré) ;
- numéro cité dans le texte (« Je mets aux voix l'amendement n° 448 »), cherché seulement dans
  les textes de la lecture en cours (`cri:titreS1@lecassidt` → DOSLEG `texte` (session, numéro)
  → `txt_ameli` du dossier `cri:titreS1@signet`). Un même numéro existe dans plusieurs textes
  d'un dossier (lecture, CMP…) : la lecture lève l'ambiguïté. Les textes des ancres de la même
  discussion hors de cette lecture (discussion commune de deux textes sous un seul signet, ancre
  erronée) servent seulement à repérer une ambiguïté : rien n'y est relié d'office.
Numéro comparé tel que publié (« 448 » n'est pas « COM-448 », amendement de commission).
Seuls les amendements chargés par `senat.travaux` (texte de session ≥ 2024, dossier connu) sont
reliés ; une citation qui ne désigne que des amendements non chargés (texte plus ancien, mission
du projet de loi de finances sans dossier dans AMELI) reste vide, sans revue.
Le dispositif lu en séance (`cri:amendements`) n'est pas une citation : « Amendement n° 655 » en
tête d'un sous-amendement désigne l'amendement visé, déjà cité par le président.
"""

import re

from .travaux import MEMBRE_AMELI, MEMBRE_DOSLEG, PREMIERE_ANNEE, table

# numéro du texte AMELI : « 370 rect. » est le texte n° 370 (ancre « amd_2024_370_16 », DOSLEG « 370 »)
TEXTE_RECTIFIE = re.compile(r"^(\d+)\s+rect(?:\.|ifiée?)?(?:\s+bis)?$")
ANCRE = re.compile(r"^amd_(\d{4})_(\d+)_((?:[A-Z]+_)?\d+)(?:_rect_\d+)?$")
RECTIFIE = r"(?:\s+rectifi[ée]e?(?:\s+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?)?"
NUMERO = r"(?:[A-Z]{1,5}-)?\d+"
# « l'amendement n° 448 », « les amendements identiques nos 272 rectifié et 743 »
CITATION = re.compile(rf"\b(?:sous-)?amendements?(?:\s+identiques)?\s+n(?:°|º|os?)\s*"
                      rf"({NUMERO}{RECTIFIE}(?:\s*(?:,|et)\s*{NUMERO}{RECTIFIE})*)", re.I)


def numeros_cites(texte: str) -> list[str]:
    """« amendements nos 272 rectifié et 743 » -> ["272", "743"], dans l'ordre, sans doublon."""
    return list(dict.fromkeys(n for liste in CITATION.findall(texte or "") for n in re.findall(NUMERO, liste)))


def ancre(nom: str | None) -> tuple[str, str, str] | None:
    """« amd_2025_766_2_rect_1 » -> ("2025", "766", "2") ; « amd_2024_143_II_12 » -> (…, "II-12")."""
    m = ANCRE.match(nom or "")
    return (m.group(1), m.group(2), m.group(3).replace("_", "-")) if m else None


class Index:
    """(texte AMELI, numéro) -> amendements, et lecture DOSLEG -> textes AMELI."""

    def __init__(self, textes: list[dict], amendements: list[dict], textes_dosleg: list[dict]):
        """`textes` : lignes `txt_ameli` avec leur session (`ann`) et `charge` (amendements chargés
        par `senat.travaux`) ; `amendements` : lignes `amd` ; `textes_dosleg` : DOSLEG `texte`."""
        self.texte_par_numero: dict[tuple[str, str], list[dict]] = {}
        for t in textes:
            m = TEXTE_RECTIFIE.match(t["num"] or "")
            self.texte_par_numero.setdefault((t["ann"], m.group(1) if m else t["num"]), []).append(t)
        self.charges = {t["id"] for t in textes if t["charge"]}
        connus = {t["id"] for t in textes}
        self.amendements: dict[tuple[str, str], list[str]] = {}
        self.texte_de: dict[str, str] = {}
        for a in amendements:
            if a["txtid"] in connus and a["num"]:
                self.amendements.setdefault((a["txtid"], a["num"]), []).append(a["id"])
                self.texte_de[a["id"]] = a["txtid"]
        self.lecture: dict[str, set[tuple[str, str]]] = {}
        for t in textes_dosleg:
            self.lecture.setdefault(t["lecassidt"], set()).add((t["sesann"], t["texnum"]))

    @classmethod
    def lire(cls, ameli, dosleg) -> "Index":
        annees = {s["id"]: s["ann"] for s in table(ameli, MEMBRE_AMELI, "ses")}
        # `charge` : même filtre que `travaux.Referentiel.textes` ; les autres textes (plus anciens,
        # ou sans dossier comme les missions du projet de loi de finances) sont lus pour être reconnus
        textes = [{"id": t["id"], "ann": annees.get(t["sesdepid"]), "num": t["num"], "signet": t["doslegsignet"],
                   "charge": int(annees.get(t["sesdepid"]) or 0) >= PREMIERE_ANNEE and bool(t.get("doslegsignet"))}
                  for t in table(ameli, MEMBRE_AMELI, "txt_ameli")]
        amendements = [{"id": a["id"], "txtid": a["txtid"], "num": a["num"]} for a in table(ameli, MEMBRE_AMELI, "amd")]
        lecture = [{"lecassidt": t["lecassidt"], "sesann": t["sesann"], "texnum": t["texnum"]}
                   for t in table(dosleg, MEMBRE_DOSLEG, "texte")]
        return cls(textes, amendements, lecture)

    def textes(self, ann: str, num: str) -> list[str]:
        return [t["id"] for t in self.texte_par_numero.get((ann, num), [])]

    def en_discussion(self, signet: str | None, lecassidt: str | None, ancres=()) -> tuple[list[str], list[str]]:
        """Textes AMELI en discussion : ceux de la lecture, numéros publiés par DOSLEG, dans le
        dossier de la section (DOSLEG liste aussi les numéros de l'AN, qui ne sont pas des textes
        de ce dossier) ; et, à part, les autres textes que citent les ancres de la discussion."""
        lecture = {t["id"] for cle in self.lecture.get(lecassidt, ()) if signet
                   for t in self.texte_par_numero.get(cle, []) if t["signet"] == signet}
        autres = {t for ann, num, _ in ancres for t in self.textes(ann, num)} - lecture
        return sorted(lecture), sorted(autres)

    def chercher(self, ancres: list[tuple[str, str, str]], numeros: list[str], lecture: list[str],
                 autres: list[str], ou: str) -> tuple[list[str], list[tuple[str, str, list[str], str | None]]]:
        """Amendements trouvés, et problèmes à revoir : (où, numéro, candidats, motif). Le code ne
        choisit jamais entre candidats.
        - ancre : son amendement, si son texte est de la lecture (ou si la section n'a pas de
          lecture) ; sinon les deux références se contredisent (discussion commune, ou ancre
          erronée : « amd_2024_254_3 » dans le débat du texte 189) : revue, avec l'amendement de
          l'ancre et ceux du même numéro dans la lecture ;
        - numéro cité : cherché dans la lecture et les textes des autres ancres ; relié s'il ne
          désigne qu'un amendement, et de la lecture."""
        trouves, problemes = [], []
        demandes = []
        for ann, num, n in ancres:
            textes = self.textes(ann, num)
            accord = not lecture or bool(set(textes) & set(lecture))
            demandes.append((f"texte {ann}-{num}", n, textes if accord else textes + lecture,
                             None if accord else f"ancre du texte {ann}-{num}, hors de la lecture en cours"))
        demandes += [(ou, n, lecture + autres, None) for n in numeros if n not in {a[2] for a in ancres}]
        for lieu, n, dans, motif in demandes:
            candidats = list(dict.fromkeys(u for t in dans for u in self.amendements.get((t, n), [])))
            charges = [u for u in candidats if self.texte_de[u] in self.charges]
            if dans and not set(dans) & self.charges or candidats and not charges:
                continue                       # amendements non chargés par `senat.travaux`
            if len(candidats) == 1 and motif is None and lecture and self.texte_de[candidats[0]] not in lecture \
                    and not lieu.startswith("texte"):
                motif = "seul amendement de ce numéro, dans un texte hors de la lecture en cours"
            if len(candidats) == 1 and motif is None:
                trouves.append(candidats[0])
            else:                              # candidats proposés : les seuls amendements chargés
                problemes.append((lieu, n, charges, motif))
        return list(dict.fromkeys(trouves)), problemes
