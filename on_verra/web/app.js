// Interface On verra : liste des lois, détail d'une loi et hémicycle de chaque vote.

const SVG = "http://www.w3.org/2000/svg";
const ZOOM_MAX = 8;
const ZOOM_NOMS = 3;          // à partir de ce zoom, le nom du député s'affiche sur son siège
const MARGE_BAS = 5;          // marge sous le premier rang, en unités du plan
const DOUBLE_TAP_MS = 300;
const COULEUR_INCONNUE = "#9a998f";

const CAUSES = {
  PAN: "président de l'Assemblée",
  PSE: "président de séance",
  MG: "membre du gouvernement",
};
const POSITIONS = {
  pour: { libelle: "Pour", pluriel: "Pour" },
  contre: { libelle: "Contre", pluriel: "Contre" },
  abstention: { libelle: "Abstention", pluriel: "Abstentions" },
  non_votant: { libelle: "Non-votant", pluriel: "Non-votants" },
  sans_vote: { libelle: "Sans vote enregistré", pluriel: "Sans vote" },
};
const NIVEAUX = { majeure: "Majeure", standard: "Standard", technique: "Technique" };

const etat = {
  geometrie: null,
  lois: [],
  loiId: null,
  loi: null,
  vote: null,            // { type: "scrutin" | "motion", uid }
  donnees: null,
  couleur: "groupe",     // "groupe" | "vote"
  vue: null,             // viewBox courant { x, y, w, h }
  epingle: null,         // député dont l'infobulle reste affichée (tactile, recherche)
};

const $ = (sel, racine = document) => racine.querySelector(sel);

// ---------- Utilitaires ----------

function el(nom, attrs = {}, ...enfants) {
  const n = document.createElement(nom);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "texte") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const e of enfants.flat()) if (e !== null && e !== undefined) n.append(e);
  return n;
}

function svgEl(nom, attrs = {}) {
  const n = document.createElementNS(SVG, nom);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

const dateFr = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR") : "");
const majuscule = (t) => (t ? t[0].toUpperCase() + t.slice(1) : "");
const nombre = (n) => n.toLocaleString("fr-FR");

async function api(chemin) {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || r.statusText);
  return r.json();
}

// ---------- Navigation (adresse partageable) ----------

function lireAdresse() {
  const p = new URLSearchParams(location.hash.slice(1));
  const vote = p.get("vote");
  const [type, uid] = vote ? vote.split(":") : [];
  return { loi: p.get("loi"), vote: type && uid ? { type, uid } : null };
}

function ecrireAdresse() {
  const p = new URLSearchParams();
  if (etat.loiId) p.set("loi", etat.loiId);
  if (etat.vote) p.set("vote", `${etat.vote.type}:${etat.vote.uid}`);
  history.replaceState(null, "", `#${p}`);
}

// ---------- Liste des lois ----------

async function chargerLois() {
  const params = new URLSearchParams(new FormData($("#filtres")));
  for (const [k, v] of [...params]) if (!v) params.delete(k);
  const { lois } = await api(`/api/lois?${params}`);
  etat.lois = lois;
  afficherListe();
}

function afficherListe() {
  const liste = $("#liste-lois");
  liste.replaceChildren(...etat.lois.map((l) => el("li", {},
    el("button", {
      class: "carte-loi", type: "button", "aria-current": l.id === etat.loiId ? "true" : "false",
      onclick: () => ouvrirLoi(l.id),
    },
      el("span", { class: `badge ${l.niveau}`, texte: NIVEAUX[l.niveau] }),
      el("span", { class: "titre", texte: l.titre }),
      el("span", { class: "meta" },
        el("span", { texte: `${l.legislature}e` }),
        l.derniere_date && el("span", { texte: dateFr(l.derniere_date) }),
        el("span", { texte: `saillance ${Math.round(l.saillance)}` }),
        l.nb_49_3 ? el("span", { texte: `49.3 ×${l.nb_49_3}` }) : null,
      ),
    ),
  )));
  $("#compte-lois").textContent = `${nombre(etat.lois.length)} loi${etat.lois.length > 1 ? "s" : ""}`;
}

// ---------- Détail d'une loi ----------

async function ouvrirLoi(id, vote = null) {
  etat.loiId = id;
  afficherListe();
  etat.loi = await api(`/api/lois/${encodeURIComponent(id)}`);
  const { scrutins, motions } = etat.loi;
  const parDefaut = scrutins.length
    ? { type: "scrutin", uid: scrutins.at(-1).uid }
    : motions.length ? { type: "motion", uid: motions.at(-1).uid } : null;
  etat.vote = vote || parDefaut;
  afficherLoi();
  if (etat.vote) await ouvrirVote(etat.vote);
  else ecrireAdresse();
  if (matchMedia("(max-width: 900px)").matches) $("#detail").scrollIntoView({ behavior: "smooth" });
}

function afficherLoi() {
  const { loi, scrutins, engagements, motions } = etat.loi;
  const details = [
    loi.raisons,
    loi.nb_scrutins ? `${nombre(loi.nb_scrutins)} scrutins publics sur le texte` : null,
    loi.promulgation ? `promulguée le ${dateFr(loi.promulgation)}` : "non promulguée",
  ].filter(Boolean);

  const puce = (type, uid, texte, sous) => el("button", {
    class: "puce-vote", type: "button",
    "aria-pressed": etat.vote?.uid === uid ? "true" : "false",
    onclick: () => ouvrirVote({ type, uid }),
  }, texte, " ", el("span", { class: "sous", texte: sous }));

  const puces = [
    ...scrutins.map((s) => puce("scrutin", s.uid, `${majuscule(s.lecture || "vote final")} · ${dateFr(s.date)}`,
      `${s.sort} ${s.pour}–${s.contre}`)),
    ...motions.map((m) => puce("motion", m.uid, `Censure n°${m.numero} · ${dateFr(m.date)}`,
      `${m.adoptee ? "adoptée" : "rejetée"} ${m.pour}/${m.requis}`)),
  ];

  $("#detail").replaceChildren(
    el("div", { class: "loi-entete" },
      el("span", { class: `badge ${loi.niveau}`, texte: `${NIVEAUX[loi.niveau]} · saillance ${Math.round(loi.saillance)}` }),
      el("h2", { texte: loi.titre }),
      el("p", { class: "raisons", texte: details.join(" · ") }),
      engagements.length ? el("ul", { class: "etapes-49-3" }, engagements.map((e) =>
        el("li", { texte: `49.3 le ${dateFr(e.date)} (${etapeLisible(e.etape)}) : texte ${issueLisible(e.issue)}, sans vote` }))) : null,
    ),
    puces.length
      ? el("div", { class: "votes-choix", role: "group", "aria-label": "Votes sur ce texte" }, puces)
      : el("p", { class: "vide", texte: "Aucun vote nominatif sur ce texte." }),
    el("div", { id: "vote" }),
  );
}

const ETAPES = { AN1: "1re lecture", CMP: "texte de CMP", ANNLEC: "nouvelle lecture", ANLDEF: "lecture définitive" };
const etapeLisible = (code) => ETAPES[code] || code;
const issueLisible = (issue) => (issue?.includes("rejeté") ? "considéré comme rejeté" : "considéré comme adopté");

// ---------- Un vote ----------

async function ouvrirVote(vote) {
  etat.vote = vote;
  ecrireAdresse();
  for (const b of document.querySelectorAll(".puce-vote")) b.setAttribute("aria-pressed", "false");
  const chemin = vote.type === "motion" ? "motions" : "scrutins";
  etat.donnees = await api(`/api/${chemin}/${encodeURIComponent(vote.uid)}`);
  afficherLoi();
  afficherVote();
}

function comptes(deputes) {
  const c = { pour: 0, contre: 0, abstention: 0, non_votant: 0, sans_vote: 0 };
  for (const d of deputes) c[d.position || "sans_vote"]++;
  return c;
}

function afficherVote() {
  const d = etat.donnees;
  const c = comptes(d.deputes);
  const estMotion = d.type === "motion";
  const entete = estMotion
    ? el("div", {},
        el("p", { class: "vote-titre", texte: `Motion de censure n°${d.motion.numero} du ${dateFr(d.motion.date)} (article ${d.motion.article.replace("-", ".")})` }),
        el("p", { class: "vote-sous-titre", texte: d.motion.adoptee ? "Motion adoptée : le gouvernement est renversé." : "Motion rejetée. Seuls les votes favorables à la censure sont publiés." }))
    : el("div", {},
        el("p", { class: "vote-titre", texte: `Scrutin n°${d.scrutin.numero} du ${dateFr(d.scrutin.date)} : ${d.scrutin.sort}` }),
        el("p", { class: "vote-sous-titre", texte: `${majuscule(d.scrutin.titre)} ${d.scrutin.type_vote}.` }));

  const tuile = (cls, valeur, libelle) => el("div", { class: `tuile ${cls}` },
    el("div", { class: "valeur", texte: valeur }), el("div", { class: "libelle", texte: libelle }));
  const tuiles = estMotion
    ? [tuile("pour", nombre(c.pour), "pour la censure"), tuile("", nombre(d.motion.requis), "voix requises"),
       tuile("", nombre(c.sans_vote), "n'ont pas voté la censure")]
    : [tuile("pour", nombre(c.pour), "pour"), tuile("contre", nombre(c.contre), "contre"),
       tuile("abstention", nombre(c.abstention), "abstentions"), tuile("", nombre(c.non_votant), "non-votants"),
       tuile("", nombre(c.sans_vote), "sans vote enregistré")];

  const bouton = (mode, texte) => el("button", {
    type: "button", "aria-pressed": etat.couleur === mode ? "true" : "false",
    onclick: () => { etat.couleur = mode; afficherVote(); },
  }, texte);

  const recherche = el("input", {
    type: "search", list: "liste-deputes", placeholder: "Trouver un député…", "aria-label": "Trouver un député",
    onchange: (e) => trouverDepute(e.target.value),
  });
  const options = el("datalist", { id: "liste-deputes" },
    d.deputes.map((p) => el("option", { value: `${p.prenom} ${p.nom}` })));

  const cadre = el("div", { class: "hemicycle-cadre" });
  $("#vote").replaceChildren(
    el("div", { class: "carte" },
      entete,
      el("div", { class: "tuiles" }, tuiles),
      el("div", { class: "barre-outils" },
        el("div", { class: "segmente", role: "group", "aria-label": "Couleur des sièges" },
          bouton("groupe", "Groupes politiques"), bouton("vote", "Votes")),
        el("div", { class: "outils-droite" }, recherche, options,
          el("span", { class: "zoom" },
            el("button", { type: "button", "aria-label": "Zoomer", texte: "+", onclick: () => zoomer(1.6) }), " ",
            el("button", { type: "button", "aria-label": "Dézoomer", texte: "−", onclick: () => zoomer(1 / 1.6) }), " ",
            el("button", { type: "button", "aria-label": "Vue d'ensemble", texte: "⤢", onclick: () => reinitialiserVue() }))),
      ),
      cadre,
      el("p", { class: "note-places", texte: notePlaces(d.mode_places) }),
      legende(d, c),
    ),
    el("div", { class: "carte" }, el("h3", { class: "vote-titre", texte: "Par groupe" }), tableauGroupes(d)),
    el("div", { class: "carte" }, el("h3", { class: "vote-titre", texte: "Liste des députés" }), listeNoms(d)),
  );
  dessinerHemicycle(cadre, d);
}

const notePlaces = (mode) => (mode === "reel"
  ? "Sièges réels tels que publiés par l'Assemblée. Survolez un siège pour voir le député ; zoomez pour lire les noms."
  : "Sièges reconstitués : l'Assemblée ne publie pas la place de chaque député pour cette législature. Chaque groupe occupe un secteur, dans l'ordre gauche-droite observé dans l'hémicycle.");

// ---------- Groupes : ordre gauche-droite ----------

function groupesOrdonnes(d) {
  const angle = new Map(etat.geometrie.sieges.map((s) => [s.num, s.angle]));
  const somme = new Map();
  for (const p of d.deputes) {
    if (p.siege == null) continue;
    const [t, n] = somme.get(p.groupe) || [0, 0];
    somme.set(p.groupe, [t + angle.get(p.siege), n + 1]);
  }
  const position = (g) => { const [t, n] = somme.get(g.ref) || [90, 1]; return t / n; };
  return [...d.groupes].sort((a, b) => position(a) - position(b));
}

const couleurGroupe = (g) => g?.couleur || COULEUR_INCONNUE;

function legende(d, c) {
  const items = etat.couleur === "groupe"
    ? groupesOrdonnes(d).map((g) => el("li", { title: g.libelle },
        el("span", { class: "pastille", style: `background:${couleurGroupe(g)}` }),
        g.abrege, el("span", { class: "nombre", texte: g.membres })))
    : [];
  const positions = d.type === "motion"
    ? [["pour", "A voté la censure"], ["sans_vote", "N'a pas voté la censure"]]
    : [["pour", "Pour"], ["contre", "Contre"], ["abstention", "Abstention"], ["non_votant", "Non-votant (fonction)"], ["sans_vote", "Sans vote enregistré"]];
  const marques = positions.map(([p, texte]) => {
    const creux = p === "non_votant" || p === "sans_vote";
    const forme = etat.couleur === "groupe"
      ? (creux ? el("span", { class: "pastille", style: "background:var(--texte-3);opacity:.35" })
               : el("span", { class: "pastille ronde", style: `background:var(--vote-${p})` }))
      : el("span", { class: `pastille ${creux ? `creuse${p === "non_votant" ? " pointillee" : ""}` : ""}`, style: creux ? "" : `background:var(--vote-${p})` });
    return el("li", {}, forme, texte, el("span", { class: "nombre", texte: c[p] }));
  });
  return el("div", {},
    items.length ? el("ul", { class: "legende", "aria-label": "Groupes, de gauche à droite" }, items) : null,
    el("ul", { class: "legende", "aria-label": "Votes" }, marques),
    etat.couleur === "groupe"
      ? el("p", { class: "note-places", texte: "Pastille sur le siège : sens du vote. Siège pâle : pas de vote enregistré." })
      : null,
  );
}

// ---------- Hémicycle ----------

function dessinerHemicycle(cadre, d) {
  const g = etat.geometrie;
  const [x, y, w, h] = vueInitiale();
  etat.vue = { x, y, w, h };
  const svg = svgEl("svg", { class: "hemicycle", viewBox: `${x} ${y} ${w} ${h}`, role: "img",
    "aria-label": "Hémicycle : chaque siège est un député, coloré selon son groupe ou son vote" });
  const echelle = svgEl("g", { transform: `scale(${g.echelle})` });
  for (const dd of g.decor) echelle.append(svgEl("path", { d: dd, class: "decor" }));
  svg.append(echelle);

  const parSiege = new Map(d.deputes.filter((p) => p.siege != null).map((p) => [p.siege, p]));
  const groupes = new Map(d.groupes.map((gr) => [gr.ref, gr]));
  const sieges = svgEl("g", { transform: `scale(${g.echelle})` });
  const marques = svgEl("g");
  const noms = svgEl("g", { class: "noms", visibility: "hidden" });

  for (const s of g.sieges) {
    const p = parSiege.get(s.num);
    const chemin = svgEl("path", { d: s.d, class: "siege" });
    if (!p) {
      chemin.classList.add("libre");
      sieges.append(chemin);
      continue;
    }
    chemin.classList.add("occupe");
    chemin.dataset.acteur = p.acteur;
    const position = p.position || "sans_vote";
    const creux = position === "non_votant" || position === "sans_vote";
    if (etat.couleur === "groupe") {
      chemin.style.fill = couleurGroupe(groupes.get(p.groupe));
      if (creux) chemin.classList.add("estompe");
      else marques.append(svgEl("circle", { cx: s.x, cy: s.y - 0.3, r: 0.75, class: "marque-vote", fill: `var(--vote-${position})` }));
    } else if (creux) {
      chemin.classList.add("creux");
      if (position === "non_votant") chemin.classList.add("statutaire");
    } else {
      chemin.style.fill = `var(--vote-${position})`;
    }
    sieges.append(chemin);
    // Le nom passe sous la pastille de vote pour ne pas la recouvrir.
    const nom = svgEl("text", { x: s.x, y: s.y + 0.95, class: "nom-siege" });
    nom.textContent = p.nom;
    noms.append(nom);
  }
  svg.append(sieges, marques, noms);
  cadre.append(svg);
  brancherInteractions(svg, cadre, new Map(d.deputes.map((p) => [p.acteur, p])), groupes);
}

// Cadre initial : les sièges et une marge, sans la tribune qui occupe le bas du plan.
function vueInitiale() {
  const [x, , w] = etat.geometrie.viewBox;
  const bas = Math.max(...etat.geometrie.sieges.map((s) => s.y)) + MARGE_BAS;
  return [x, 0, w, bas];
}

function appliquerVue(svg) {
  const v = etat.vue;
  svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  const zoom = vueInitiale()[2] / v.w;
  $(".noms", svg)?.setAttribute("visibility", zoom >= ZOOM_NOMS ? "visible" : "hidden");
  // Zoomé, un doigt déplace la vue ; sinon il fait défiler la page.
  svg.parentElement?.classList.toggle("zoome", zoom > 1.01);
  replacerBulle();
}

function zoomer(facteur, cx, cy) {
  const svg = $(".hemicycle");
  if (!svg) return;
  const [, , bw, bh] = vueInitiale();
  const v = etat.vue;
  const w = Math.min(bw, Math.max(bw / ZOOM_MAX, v.w / facteur));
  const h = w * (bh / bw);
  cx ??= v.x + v.w / 2;
  cy ??= v.y + v.h / 2;
  const rx = (cx - v.x) / v.w, ry = (cy - v.y) / v.h;
  etat.vue = borner({ x: cx - rx * w, y: cy - ry * h, w, h });
  appliquerVue(svg);
}

function borner(v) {
  const [bx, by, bw, bh] = vueInitiale();
  return { ...v, x: Math.min(Math.max(v.x, bx), bx + bw - v.w), y: Math.min(Math.max(v.y, by), by + bh - v.h) };
}

function reinitialiserVue() {
  const [x, y, w, h] = vueInitiale();
  etat.vue = { x, y, w, h };
  const svg = $(".hemicycle");
  if (svg) appliquerVue(svg);
}

function versSvg(svg, evt) {
  const r = svg.getBoundingClientRect();
  return { x: etat.vue.x + ((evt.clientX - r.left) / r.width) * etat.vue.w,
           y: etat.vue.y + ((evt.clientY - r.top) / r.height) * etat.vue.h };
}

function brancherInteractions(svg, cadre, deputes, groupes) {
  const bulle = $("#infobulle");
  const doigts = new Map();     // pointeurs posés : id -> { x, y }
  let glisse = null;            // déplacement à un pointeur
  let pince = null;             // zoom à deux doigts
  let dernierTap = null;        // pour le double-tap tactile

  const ecart = () => { const [a, b] = [...doigts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const milieu = () => { const [a, b] = [...doigts.values()]; return { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }; };

  svg.addEventListener("pointerdown", (e) => {
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    if (doigts.size === 2) {
      // Le point de l'hémicycle situé entre les deux doigts restera sous eux pendant le geste.
      pince = { ecart: ecart(), vue: { ...etat.vue }, centre: versSvg(svg, milieu()) };
      glisse = null;
      bulle.hidden = true;
    } else if (doigts.size === 1) {
      glisse = { x: e.clientX, y: e.clientY, vue: { ...etat.vue }, bouge: false };
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (doigts.has(e.pointerId)) doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pince && doigts.size >= 2) {
      const [, , bw, bh] = vueInitiale();
      const w = Math.min(bw, Math.max(bw / ZOOM_MAX, pince.vue.w * (pince.ecart / ecart())));
      const h = w * (bh / bw);
      const r = svg.getBoundingClientRect();
      const m = milieu();
      etat.vue = borner({ x: pince.centre.x - ((m.clientX - r.left) / r.width) * w,
                          y: pince.centre.y - ((m.clientY - r.top) / r.height) * h, w, h });
      appliquerVue(svg);
      return;
    }
    if (glisse && (glisse.bouge || Math.hypot(e.clientX - glisse.x, e.clientY - glisse.y) > 4)) {
      glisse.bouge = true;
      svg.classList.add("deplacement");
      const r = svg.getBoundingClientRect();
      etat.vue = borner({ ...glisse.vue,
        x: glisse.vue.x - ((e.clientX - glisse.x) / r.width) * glisse.vue.w,
        y: glisse.vue.y - ((e.clientY - glisse.y) / r.height) * glisse.vue.h });
      appliquerVue(svg);
      bulle.hidden = true;
      return;
    }
    if (etat.epingle || e.pointerType !== "mouse") return;
    const p = deputes.get(e.target.dataset?.acteur);
    if (p) montrerBulle(p, groupes, e.clientX, e.clientY);
    else bulle.hidden = true;
  });

  const lever = (e) => {
    doigts.delete(e.pointerId);
    svg.classList.remove("deplacement");
    if (pince) {
      // Fin du pincement : le doigt restant ne doit ni déplacer la vue ni compter comme un tap.
      if (doigts.size < 2) pince = null;
      glisse = null;
      return;
    }
    const tap = glisse && !glisse.bouge && e.type === "pointerup";
    glisse = null;
    if (!tap) return;
    if (e.pointerType === "touch") {
      const maintenant = performance.now();
      if (dernierTap && maintenant - dernierTap.t < DOUBLE_TAP_MS
          && Math.hypot(e.clientX - dernierTap.x, e.clientY - dernierTap.y) < 30) {
        dernierTap = null;
        const pt = versSvg(svg, e);
        zoomer(2, pt.x, pt.y);
        return;
      }
      dernierTap = { t: maintenant, x: e.clientX, y: e.clientY };
    }
    const p = deputes.get(document.elementFromPoint(e.clientX, e.clientY)?.dataset?.acteur);
    if (p) epingler(p, groupes); else desepingler();
  };
  svg.addEventListener("pointerup", lever);
  svg.addEventListener("pointercancel", lever);
  svg.addEventListener("pointerleave", (e) => { if (!etat.epingle && e.pointerType === "mouse") bulle.hidden = true; });
  svg.addEventListener("dblclick", (e) => { const pt = versSvg(svg, e); zoomer(2, pt.x, pt.y); });
  // Molette : zoom seulement avec Ctrl (ou pincement du pavé tactile) pour ne pas bloquer le défilement.
  svg.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const pt = versSvg(svg, e);
    zoomer(e.deltaY < 0 ? 1.25 : 0.8, pt.x, pt.y);
  }, { passive: false });
}

function epingler(p, groupes) {
  desepingler();
  etat.epingle = { depute: p, groupes };
  document.querySelector(`.siege[data-acteur="${CSS.escape(p.acteur)}"]`)?.classList.add("cible");
  replacerBulle();
}

// L'infobulle épinglée reste accrochée à son siège quand on zoome ou fait défiler la page.
function replacerBulle() {
  if (!etat.epingle) return;
  const { depute, groupes } = etat.epingle;
  const siege = document.querySelector(`.siege[data-acteur="${CSS.escape(depute.acteur)}"]`);
  if (!siege) return desepingler();
  const r = siege.getBoundingClientRect();
  montrerBulle(depute, groupes, r.right, r.bottom);
}

function desepingler() {
  if (!etat.epingle) return;
  document.querySelector(".siege.cible")?.classList.remove("cible");
  etat.epingle = null;
  $("#infobulle").hidden = true;
}

function texteVote(p, motion) {
  if (motion) return p.position === "pour" ? ["A voté la censure", null] : ["N'a pas voté la censure", null];
  if (!p.position) return ["Sans vote enregistré", "absent, ou présent sans prendre part au vote"];
  if (p.position === "non_votant") return ["Non-votant", CAUSES[p.cause] || null];
  return [POSITIONS[p.position].libelle, p.delegation ? "par délégation (absent de l'hémicycle)" : null];
}

function montrerBulle(p, groupes, x, y) {
  const bulle = $("#infobulle");
  const g = groupes.get(p.groupe);
  const [position, precision] = texteVote(p, etat.donnees.type === "motion");
  bulle.replaceChildren(
    el("div", { class: "nom", texte: `${p.prenom} ${p.nom}` }),
    el("div", { class: "groupe" }, el("span", { class: "pastille", style: `background:${couleurGroupe(g)}` }),
      g ? `${g.libelle} (${g.abrege})` : "Groupe inconnu"),
    el("div", { class: "position", texte: position }),
    precision ? el("div", { class: "precision", texte: precision }) : null,
    el("div", { class: "precision", texte: `Siège n°${p.siege}` }),
  );
  bulle.hidden = false;
  const r = bulle.getBoundingClientRect();
  const gauche = x + 14 + r.width > innerWidth ? x - r.width - 14 : x + 14;
  const haut = y + 14 + r.height > innerHeight ? y - r.height - 14 : y + 14;
  bulle.style.left = `${Math.max(8, gauche)}px`;
  bulle.style.top = `${Math.max(8, haut)}px`;
}

function trouverDepute(texte) {
  const cible = texte.trim().toLowerCase();
  const p = etat.donnees.deputes.find((d) => `${d.prenom} ${d.nom}`.toLowerCase() === cible)
    || etat.donnees.deputes.find((d) => `${d.prenom} ${d.nom}`.toLowerCase().includes(cible));
  if (!p || p.siege == null) return;
  const s = etat.geometrie.sieges.find((x) => x.num === p.siege);
  reinitialiserVue();
  zoomer(4, s.x, s.y);
  epingler(p, new Map(etat.donnees.groupes.map((g) => [g.ref, g])));
}

// ---------- Tableau par groupe et liste des noms ----------

function tableauGroupes(d) {
  const motion = d.type === "motion";
  const colonnes = motion
    ? [["membres", "Membres"], ["pour", "Pour la censure"], ["sans_vote", "Pas de vote"]]
    : [["membres", "Membres"], ["pour", "Pour"], ["contre", "Contre"], ["abstention", "Abst."],
       ["non_votant", "Non-votants"], ["sans_vote", "Sans vote"], ["ligne", "Ligne du groupe"]];
  return el("div", { class: "defilement" }, el("table", { class: "tableau-groupes" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", texte: "Groupe (de gauche à droite)" }),
      colonnes.map(([, t]) => el("th", { scope: "col", texte: t })))),
    el("tbody", {}, groupesOrdonnes(d).map((g) => el("tr", {},
      el("th", { scope: "row", title: g.libelle }, el("span", { class: "nom-groupe" },
        el("span", { class: "pastille", style: `background:${couleurGroupe(g)}` }), g.abrege)),
      colonnes.map(([k]) => el("td", { texte: k === "ligne" ? (g.ligne ? POSITIONS[g.ligne].libelle : "—") : g[k] })),
    ))),
  ));
}

function listeNoms(d) {
  const motion = d.type === "motion";
  const ordre = groupesOrdonnes(d);
  const positions = motion ? ["pour", "sans_vote"] : ["pour", "contre", "abstention", "non_votant", "sans_vote"];
  return positions.map((pos) => {
    const deputes = d.deputes.filter((p) => (p.position || "sans_vote") === pos);
    const titre = motion ? (pos === "pour" ? "Ont voté la censure" : "N'ont pas voté la censure") : POSITIONS[pos].pluriel;
    return el("details", { class: "noms", open: pos !== "sans_vote" && deputes.length <= 300 },
      el("summary", { texte: `${titre} (${deputes.length})` }),
      ordre.map((g) => {
        const membres = deputes.filter((p) => p.groupe === g.ref)
          .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
          .map((p) => `${p.prenom} ${p.nom}${p.delegation ? "*" : ""}`);
        return membres.length
          ? el("p", { class: "noms-groupe" }, el("strong", { texte: `${g.abrege} (${membres.length}) : ` }), membres.join(", "))
          : null;
      }),
    );
  }).concat(motion ? [] : [el("p", { class: "note-places", texte: "* vote par délégation : le député n'était pas dans l'hémicycle." })]);
}

// ---------- Démarrage ----------

async function demarrer() {
  etat.geometrie = await api("hemicycle.json");
  const adresse = lireAdresse();
  const filtres = $("#filtres");
  let minuterie;
  filtres.addEventListener("input", () => { clearTimeout(minuterie); minuterie = setTimeout(chargerLois, 200); });
  filtres.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") desepingler(); });
  addEventListener("scroll", replacerBulle, { passive: true });
  addEventListener("resize", replacerBulle);
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest?.(".hemicycle")) desepingler(); });
  if (adresse.loi) filtres.legislature.value = "";
  await chargerLois();
  const premiere = adresse.loi || etat.lois[0]?.id;
  if (premiere) await ouvrirLoi(premiere, adresse.vote);
}

demarrer().catch((e) => {
  $("#detail").replaceChildren(el("p", { class: "vide", texte: `Erreur : ${e.message}` }));
});
