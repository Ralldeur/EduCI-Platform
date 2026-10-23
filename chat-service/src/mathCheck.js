import { derivative, evaluate } from "mathjs";

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
// un point (f(x) pour un x donné), et valeur d'une dérivée en un point
// (f'(a), calculée symboliquement puis évaluée en a). Pour un contexte
// concret avec une grandeur non négative, on vérifie aussi l'expression sur
// trois valeurs consécutives au début du domaine annoncé. Pour une étude de
// variations, on contrôle le signe de f' sur plusieurs points de chaque
// intervalle fourni par l'étape de préparation.
// NON COUVERT (volontairement, pour rester réalisable en une session) :
// limites, intégrales, nombres complexes, statistiques hors loi binomiale/
// régression, preuves
// par récurrence, équations à résoudre, certification du signe de la dérivée
// sur un intervalle entier, et tout calcul à plusieurs variables. Les
// contrôles hors de ce périmètre ne sont pas générés — voir verifyPrompt dans
// index.js.

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

// Le modèle utilise souvent la notation française `ln(x)`. mathjs nomme
// le logarithme népérien `log(x)`, donc on traduit le nom de fonction avant
// chaque calcul symbolique ou numérique.
function normalizeMathExpression(expression) {
  return expression.replace(/\bln(?=\s*\()/gi, "log");
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
    computed = evaluate(normalizeMathExpression(check.expr), { x });
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

function checkDerivativeEval(check) {
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
    computed = derivative(normalizeMathExpression(check.expr), "x").evaluate({ x });
  } catch (err) {
    return { skipped: true, reason: `dérivée illisible par mathjs: ${err.message}` };
  }
  if (typeof computed !== "number" || !Number.isFinite(computed)) {
    return { skipped: true, reason: "dérivée non numérique en ce point" };
  }
  return { computed, claimed, ok: withinTolerance(computed, claimed) };
}

function checkDerivativeSigns(check) {
  if (typeof check.expr !== "string" || !check.expr.trim()) {
    return { skipped: true, reason: "expression manquante" };
  }
  if (!Array.isArray(check.intervals) || check.intervals.length === 0) {
    return { ok: false, reason: "intervalles de variation manquants" };
  }

  let derivativeExpression;
  try {
    derivativeExpression = derivative(normalizeMathExpression(check.expr), "x");
  } catch (err) {
    return { skipped: true, reason: `dérivée illisible par mathjs: ${err.message}` };
  }

  const results = [];
  let previousTo;
  for (const [index, interval] of check.intervals.entries()) {
    const from = interval?.from === null ? -Infinity : toNumber(interval?.from);
    const to = interval?.to === null ? Infinity : toNumber(interval?.to);
    const trend = interval?.trend;
    if (
      (!Number.isFinite(from) && from !== -Infinity) ||
      (!Number.isFinite(to) && to !== Infinity) ||
      from >= to ||
      !["increasing", "decreasing"].includes(trend)
    ) {
      return { ok: false, reason: "intervalle ou sens de variation invalide" };
    }
    if (index > 0 && from !== previousTo) {
      return { ok: false, reason: "les intervalles de variation ne se suivent pas" };
    }
    previousTo = to;

    // Plusieurs points intérieurs limitent le risque qu'un point critique
    // non annoncé passe entre les mailles. Pour les intervalles non bornés,
    // on teste aussi des distances croissantes depuis la borne finie.
    const offsets = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];
    const samples = Number.isFinite(from) && Number.isFinite(to)
      ? Array.from({ length: 9 }, (_, index) => from + (to - from) * ((index + 1) / 10))
      : from === -Infinity && to === Infinity
        ? [-256, -64, -16, -4, -1, 0, 1, 4, 16, 64, 256]
        : from === -Infinity
          ? offsets.map((offset) => to - offset)
          : offsets.map((offset) => from + offset);
    const expectedSign = trend === "increasing" ? 1 : -1;
    let expectedSignObserved = false;

    for (const x of samples) {
      let value;
      try {
        value = derivativeExpression.evaluate({ x });
      } catch (err) {
        return { ok: false, reason: `dérivée non calculable en x=${x}: ${err.message}` };
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, reason: `dérivée non définie en x=${x}` };
      }
      const sign = Math.sign(value);
      results.push({ x, derivative: value, trend });
      if (sign !== 0 && sign !== expectedSign) {
        return {
          ok: false,
          results,
          reason: `le sens annoncé « ${trend} » contredit le signe de f'(${x})`,
        };
      }
      if (sign === expectedSign) expectedSignObserved = true;
    }
    if (!expectedSignObserved) {
      return {
        ok: false,
        results,
        reason: `aucun signe de dérivée non nul ne confirme le sens annoncé « ${trend} »`,
      };
    }
  }

  return { ok: true, results };
}

function checkRationalDecomposition(check) {
  const fields = ["numeratorExpr", "denominatorExpr", "quotientExpr", "remainderExpr"];
  if (fields.some((field) => typeof check[field] !== "string" || !check[field].trim())) {
    return { ok: false, reason: "décomposition rationnelle incomplète" };
  }

  // Vérifie N(x) = D(x)Q(x) + R(x) sur plusieurs valeurs. Ce n'est pas une
  // preuve symbolique, mais cela détecte notamment les erreurs de reste
  // comme 3x²−6x+2 = (x−1)(3x−3)+5.
  const samples = [-7, -3, 0, 2, 5, 11];
  let checked = 0;
  for (const x of samples) {
    try {
      const numerator = evaluate(normalizeMathExpression(check.numeratorExpr), { x });
      const denominator = evaluate(normalizeMathExpression(check.denominatorExpr), { x });
      const quotient = evaluate(normalizeMathExpression(check.quotientExpr), { x });
      const remainder = evaluate(normalizeMathExpression(check.remainderExpr), { x });
      if ([numerator, denominator, quotient, remainder].some((value) => typeof value !== "number" || !Number.isFinite(value))) {
        continue;
      }
      if (Math.abs(denominator) < 1e-12) continue;
      const reconstructed = denominator * quotient + remainder;
      const tolerance = 1e-9 * Math.max(1, Math.abs(numerator), Math.abs(reconstructed));
      checked += 1;
      if (Math.abs(numerator - reconstructed) > tolerance) {
        return { ok: false, x, numerator, reconstructed, reason: `identité de décomposition fausse en x=${x}` };
      }
    } catch (err) {
      return { ok: false, reason: `expression de décomposition illisible : ${err.message}` };
    }
  }
  return checked >= 3
    ? { ok: true, checkedSamples: checked }
    : { ok: false, reason: "pas assez de valeurs calculables pour vérifier la décomposition" };
}

function checkDrawProbability(check) {
  const red = toNumber(check.red);
  const blue = toNumber(check.blue);
  const totalClaimed = toNumber(check.totalOutcomes);
  const favorableClaimed = toNumber(check.favorableOutcomes);
  const probabilityClaimed = toNumber(check.claimedProbability);
  if (![red, blue, totalClaimed, favorableClaimed, probabilityClaimed].every(Number.isFinite) || red < 0 || blue < 0 || red + blue < 2) {
    return { ok: false, reason: "paramètres de tirage incomplets ou invalides" };
  }
  if (typeof check.ordered !== "boolean") return { ok: false, reason: "convention d'ordre du tirage manquante" };
  const total = check.ordered ? (red + blue) * (red + blue - 1) : ((red + blue) * (red + blue - 1)) / 2;
  const favorable = check.ordered ? 2 * red * blue : red * blue;
  const probability = favorable / total;
  const ok = totalClaimed === total && favorableClaimed === favorable && Math.abs(probabilityClaimed - probability) <= 1e-9;
  return { ok, total, favorable, probability, reason: ok ? undefined : "les dénombrements ne respectent pas la convention de tirage annoncée" };
}

function binomialProbability(n, k, p) {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;

  // Calcul logarithmique pour éviter le débordement de C(n,k) avant la
  // multiplication par p^k(1-p)^(n-k), surtout pour les n plus grands.
  const upper = Math.min(k, n - k);
  let logCombination = 0;
  for (let index = 1; index <= upper; index += 1) {
    logCombination += Math.log(n - upper + index) - Math.log(index);
  }
  const logProbability =
    logCombination + k * Math.log(p) + (n - k) * Math.log1p(-p);
  return Math.exp(logProbability);
}

function checkBinomialDistribution(check) {
  const n = toNumber(check.n);
  const p = toNumber(check.p);
  const precision = check.precision == null ? 5 : toNumber(check.precision);
  if (
    !Number.isInteger(n) || n < 0 || n > 1000 ||
    !Number.isFinite(p) || p < 0 || p > 1 ||
    !Number.isInteger(precision) || precision < 0 || precision > 12
  ) {
    return { ok: false, reason: "paramètres binomiaux invalides (n, p ou précision)" };
  }
  if (!Array.isArray(check.probabilities) || check.probabilities.length !== n + 1) {
    return { ok: false, reason: `le tableau doit contenir les ${n + 1} valeurs de k, de 0 à n` };
  }

  const rowsByK = new Map();
  for (const row of check.probabilities) {
    const k = toNumber(row?.k);
    const claimed = toNumber(row?.claimed);
    if (
      !Number.isInteger(k) || k < 0 || k > n ||
      !Number.isFinite(claimed) || claimed < 0 || claimed > 1 || rowsByK.has(k)
    ) {
      return { ok: false, reason: "valeurs k/probabilité manquantes, invalides ou dupliquées" };
    }
    rowsByK.set(k, claimed);
  }
  if (rowsByK.size !== n + 1) {
    return { ok: false, reason: `le tableau doit couvrir chaque k de 0 à ${n}` };
  }

  const tolerance = 0.5 * 10 ** -precision + Number.EPSILON;
  const distribution = Array.from({ length: n + 1 }, (_, k) => {
    const computed = binomialProbability(n, k, p);
    const claimed = rowsByK.get(k);
    return { k, computed, claimed, ok: Math.abs(computed - claimed) <= tolerance };
  });
  const sumClaimed = distribution.reduce((sum, row) => sum + row.claimed, 0);
  const sumComputed = distribution.reduce((sum, row) => sum + row.computed, 0);
  const sumTolerance = (n + 1) * tolerance + 1e-12;
  const failedRow = distribution.find((row) => !row.ok);
  const sumOk = Math.abs(sumClaimed - 1) <= sumTolerance;

  return {
    ok: !failedRow && sumOk,
    distribution,
    sumClaimed,
    sumComputed,
    reason: failedRow
      ? `P(X=${failedRow.k}) annoncé à ${failedRow.claimed}, valeur recalculée ${failedRow.computed}`
      : !sumOk
        ? `la somme du tableau vaut ${sumClaimed}, au lieu de 1 à l'arrondi près`
        : undefined,
  };
}

function checkNonnegativeSamples(check) {
  if (typeof check.expr !== "string" || !check.expr.trim()) {
    return { ok: false, reason: "expression manquante pour l'audit du contexte" };
  }
  const domainStart = toNumber(check.domainStart);
  if (!Number.isFinite(domainStart)) {
    return { ok: false, reason: "début du domaine non numérique" };
  }
  const domainEnd = check.domainEnd == null ? null : toNumber(check.domainEnd);
  if (check.domainEnd != null && (!Number.isFinite(domainEnd) || domainEnd < domainStart)) {
    return { ok: false, reason: "fin du domaine invalide pour l'audit du contexte" };
  }

  let samples;
  try {
    const samplePoints =
      domainEnd == null
        ? [domainStart, domainStart + 1, domainStart + 2]
        : domainEnd === domainStart
          ? [domainStart]
          : [domainStart, (domainStart + domainEnd) / 2, domainEnd];
    samples = samplePoints.map((x) => {
      const value = evaluate(normalizeMathExpression(check.expr), { x });
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`valeur non numérique pour x=${x}`);
      }
      return { x, value };
    });
  } catch (err) {
    return { ok: false, reason: `expression non calculable pour l'audit du contexte: ${err.message}` };
  }
  const negative = samples.filter(({ value }) => value < -1e-10);
  return {
    samples,
    ok: negative.length === 0,
    reason: negative.length > 0 ? "une grandeur déclarée non négative prend une valeur négative" : undefined,
  };
}

function checkContextAudit(check) {
  if (["signed", "abstract", "challenge"].includes(check.mode)) return { ok: true };
  return { ok: false, reason: "type de contexte inconnu" };
}

function checkInvalidContextAudit(check) {
  return { ok: false, reason: check.reason || "audit de contexte manquant ou incomplet" };
}

const CHECKERS = {
  geometric: checkGeometric,
  arithmetic: checkArithmetic,
  function_eval: checkFunctionEval,
  derivative_eval: checkDerivativeEval,
  derivative_signs: checkDerivativeSigns,
  rational_decomposition: checkRationalDecomposition,
  draw_probability: checkDrawProbability,
  binomial_distribution: checkBinomialDistribution,
  nonnegative_samples: checkNonnegativeSamples,
  context_audit: checkContextAudit,
  invalid_context_audit: checkInvalidContextAudit,
};

/**
 * Recalcule indépendamment chaque "check" fourni par l'étape 1 de
 * /exercises/generate (voir index.js) et le compare aux valeurs annoncées
 * par le modèle. `derivative_eval` contrôle f'(x) en un point ;
 * `derivative_signs` vérifie le signe de f' sur des points échantillonnés
 * dans chaque intervalle, sans certifier formellement tout l'intervalle.
 * `ok: false` seulement si au moins un check d'un type couvert diverge au-delà
 * de la tolérance — un check "skipped" (type non
 * couvert, ou champs illisibles) ne fait jamais échouer la vérification :
 * ce garde-fou est une première ligne de défense ciblée sur des cas
 * simples et fréquents, pas un moteur de vérification symbolique général.
 *
 * @param {Array} checks - le champ "checks" renvoyé par l'étape 1.
 * @returns {{ok: boolean, results: Array}}
 */
export function verifyChecks(
  checks,
  {
    requireDerivativeSigns = false,
    requiredDerivativeSignCount = 0,
    requireRationalDecompositions = false,
    requiredRationalDecompositionCount = 0,
    requireDrawProbabilities = false,
    requiredDrawProbabilityCount = 0,
    requireBinomialDistributions = false,
    requiredBinomialDistributionCount = 0,
  } = {}
) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return {
      ok: (!requireDerivativeSigns || requiredDerivativeSignCount === 0) &&
        (!requireRationalDecompositions || requiredRationalDecompositionCount === 0) &&
        (!requireDrawProbabilities || requiredDrawProbabilityCount === 0) &&
        (!requireBinomialDistributions || requiredBinomialDistributionCount === 0),
      results: [],
    };
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

  const ok =
    results.every((r) => r.skipped || r.ok !== false) &&
    (!requireDerivativeSigns ||
      results.filter((r) => r.type === "derivative_signs" && !r.skipped && r.ok === true).length >=
        requiredDerivativeSignCount) &&
    (!requireRationalDecompositions ||
      results.filter((r) => r.type === "rational_decomposition" && !r.skipped && r.ok === true).length >=
        requiredRationalDecompositionCount) &&
    (!requireDrawProbabilities ||
      results.filter((r) => r.type === "draw_probability" && !r.skipped && r.ok === true).length >=
        requiredDrawProbabilityCount) &&
    (!requireBinomialDistributions ||
      results.filter((r) => r.type === "binomial_distribution" && !r.skipped && r.ok === true).length >=
        requiredBinomialDistributionCount);
  return { ok, results };
}
