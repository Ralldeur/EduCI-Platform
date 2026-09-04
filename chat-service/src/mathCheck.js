import { evaluate } from "mathjs";

// Garde-fou de recalcul programmatique pour /exercises/generate — voir
// l'audit RAG du 2026-09-04 : deux erreurs numériques confirmées ont
// traversé la "vérification silencieuse" de l'étape 1 sans être détectées
// (u8/u9 faux de ~0,6%, ratio ln(1,2)/ln(1,02) annoncé 9,34 au lieu de
// 9,21) — jusqu'ici, seul le modèle lui-même contrôlait sa propre
// cohérence numérique, sans aucun calcul indépendant. Ce module recalcule
// avec une vraie bibliothèque de calcul (mathjs) un sous-ensemble ciblé et
// volontairement restreint de types de calculs simples et fréquents, pour
// comparer le résultat à ce que le modèle annonce.
//
// COUVERT : suite géométrique (u_n = u0 × q^n), suite arithmétique
// (u_n = u0 + n×r), image d'une fonction polynomiale/rationnelle simple en
// un point (f(x) pour un x donné, expression à une variable).
// NON COUVERT (volontairement, pour rester réalisable en une session) :
// dérivées, limites, nombres complexes, statistiques/régression, preuves
// par récurrence, équations à résoudre, tout calcul à plusieurs variables
// ou nécessitant une manipulation symbolique. L'étape 1 n'est pas obligée
// de remplir "checks" pour ces cas — voir verifyPrompt dans index.js.

// Tolérance : les valeurs annoncées dans un énoncé sont souvent arrondies
// (à l'unité, au dixième...) par le modèle avant d'être écrites dans les
// "checks" — une tolérance trop stricte déclencherait une fausse alerte
// sur un simple arrondi légitime. max(0,05 ; |calculé| × 0,5%) : la
// composante relative absorbe l'arrondi sur les valeurs FCFA à 5-6
// chiffres (0,5% de 100 000 = 500, largement plus qu'un arrondi à l'unité
// près) ; le plancher absolu ne sert qu'à éviter une fausse alerte due au
// bruit de calcul flottant quand |calculé| est proche de 0 — 0,5 était
// TROP haut pour ça et laissait passer telle quelle l'erreur ~1,4% sur le
// ratio ln(1,2)/ln(1,02) (9,34 annoncé contre 9,21 recalculé, un écart de
// 0,13 < 0,5) trouvée lors de l'audit RAG du 2026-09-04 ; 0,05 attrape à
// la fois cette erreur-là et celle sur u8/u9 (~0,6%, déjà couverte par la
// composante relative) sans pénaliser un arrondi légitime à 2 décimales.
const TOLERANCE_ABSOLUTE = 0.05;
const TOLERANCE_RELATIVE = 0.005;

function withinTolerance(computed, claimed) {
  const diff = Math.abs(computed - claimed);
  const tolerance = Math.max(TOLERANCE_ABSOLUTE, Math.abs(computed) * TOLERANCE_RELATIVE);
  return diff <= tolerance;
}

// Accepte les nombres JS natifs et les chaînes ("1,5" avec virgule
// française, espaces de séparateur de milliers) — le modèle peut renvoyer
// l'un ou l'autre selon comment il a rempli le JSON.
function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function checkGeometric(check) {
  const u0 = toNumber(check.u0);
  const q = toNumber(check.q);
  const n = toNumber(check.n);
  const claimed = toNumber(check.claimed);
  if (![u0, q, n, claimed].every(Number.isFinite)) {
    return { skipped: true, reason: "paramètres non numériques (u0/q/n/claimed)" };
  }
  const computed = u0 * Math.pow(q, n);
  if (!Number.isFinite(computed)) {
    return { skipped: true, reason: "résultat non calculable" };
  }
  return { computed, claimed, ok: withinTolerance(computed, claimed) };
}

function checkArithmetic(check) {
  const u0 = toNumber(check.u0);
  const r = toNumber(check.r);
  const n = toNumber(check.n);
  const claimed = toNumber(check.claimed);
  if (![u0, r, n, claimed].every(Number.isFinite)) {
    return { skipped: true, reason: "paramètres non numériques (u0/r/n/claimed)" };
  }
  const computed = u0 + n * r;
  return { computed, claimed, ok: withinTolerance(computed, claimed) };
}

function checkFunctionEval(check) {
  if (typeof check.expr !== "string" || !check.expr.trim()) {
    return { skipped: true, reason: "expression manquante" };
  }
  const x = toNumber(check.x);
  const claimed = toNumber(check.claimed);
  if (!Number.isFinite(x) || !Number.isFinite(claimed)) {
    return { skipped: true, reason: "x/claimed non numériques" };
  }
  let computed;
  try {
    computed = evaluate(check.expr, { x });
  } catch (err) {
    return { skipped: true, reason: `expression illisible par mathjs: ${err.message}` };
  }
  if (typeof computed !== "number" || !Number.isFinite(computed)) {
    // Couvre aussi le cas division par zéro / résultat complexe (mathjs
    // renvoie alors un objet Complex, pas un number) — hors périmètre.
    return { skipped: true, reason: "résultat non numérique (division par zéro, complexe...)" };
  }
  return { computed, claimed, ok: withinTolerance(computed, claimed) };
}

const CHECKERS = {
  geometric: checkGeometric,
  arithmetic: checkArithmetic,
  function_eval: checkFunctionEval,
};

/**
 * Recalcule indépendamment chaque "check" fourni par l'étape 1 de
 * /exercises/generate (voir index.js) et le compare à la valeur annoncée
 * par le modèle. `ok: false` seulement si au moins un check d'un type
 * couvert diverge au-delà de la tolérance — un check "skipped" (type non
 * couvert, ou champs illisibles) ne fait jamais échouer la vérification :
 * ce garde-fou est une première ligne de défense ciblée sur des cas
 * simples et fréquents, pas un moteur de vérification symbolique général.
 *
 * @param {Array} checks - le champ "checks" renvoyé par l'étape 1.
 * @returns {{ok: boolean, results: Array}}
 */
export function verifyChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return { ok: true, results: [] };
  }

  const results = checks.map((check) => {
    const checker = CHECKERS[check?.type];
    if (!checker) {
      return { type: check?.type, skipped: true, reason: "type non couvert par le garde-fou" };
    }
    try {
      return { type: check.type, ...checker(check) };
    } catch (err) {
      return { type: check.type, skipped: true, reason: `erreur interne: ${err.message}` };
    }
  });

  const ok = results.every((r) => r.skipped || r.ok !== false);
  return { ok, results };
}
