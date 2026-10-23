import test from "node:test";
import assert from "node:assert/strict";
import { verifyChecks } from "./mathCheck.js";

test("valide les sens de variation de f=(x²+2x+1)/(x−1)", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "(x^2+2*x+1)/(x-1)",
      intervals: [
        { from: null, to: -1, trend: "increasing" },
        { from: -1, to: 1, trend: "decreasing" },
        { from: 1, to: 3, trend: "decreasing" },
        { from: 3, to: null, trend: "increasing" },
      ],
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.results[0].ok, true);
});

test("détecte les deux sens inversés dans un tableau de variations", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "(x^2+2*x+1)/(x-1)",
      intervals: [
        { from: null, to: -1, trend: "decreasing" },
        { from: -1, to: 1, trend: "increasing" },
        { from: 1, to: 3, trend: "decreasing" },
        { from: 3, to: null, trend: "increasing" },
      ],
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.results[0].reason, /contredit le signe/);
});

test("valide les variations de h=(x²+4)/(x²−4)", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "(x^2+4)/(x^2-4)",
      intervals: [
        { from: null, to: -2, trend: "increasing" },
        { from: -2, to: 0, trend: "increasing" },
        { from: 0, to: 2, trend: "decreasing" },
        { from: 2, to: null, trend: "decreasing" },
      ],
    },
  ]);

  assert.equal(result.ok, true);
});

test("détecte un sens de variation erroné pour h", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "(x^2+4)/(x^2-4)",
      intervals: [
        { from: null, to: -2, trend: "decreasing" },
        { from: -2, to: 0, trend: "increasing" },
        { from: 0, to: 2, trend: "decreasing" },
        { from: 2, to: null, trend: "increasing" },
      ],
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.results[0].reason, /contredit le signe/);
});

test("ne valide pas un sens strict pour une fonction constante", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "5",
      intervals: [{ from: null, to: null, trend: "increasing" }],
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.results[0].reason, /aucun signe de dérivée non nul/);
});

test("rejette une partition d'intervalles qui laisse un trou", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "x^2",
      intervals: [
        { from: null, to: -1, trend: "decreasing" },
        { from: 0, to: null, trend: "increasing" },
      ],
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.results[0].reason, /ne se suivent pas/);
});

test("rejette une dérivée non définie à l'intérieur d'un intervalle", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "1/(x-0.5)",
      intervals: [{ from: 0, to: 1, trend: "decreasing" }],
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.results[0].reason, /non définie/);
});

test("exige des contrôles de variations calculables si le sujet les demande", () => {
  const missing = verifyChecks([], {
    requireDerivativeSigns: true,
    requiredDerivativeSignCount: 1,
  });
  const unsupported = verifyChecks(
    [
      {
        type: "derivative_signs",
        expr: "sin(",
        intervals: [{ from: 0, to: 1, trend: "increasing" }],
      },
    ],
    { requireDerivativeSigns: true, requiredDerivativeSignCount: 1 }
  );

  assert.equal(missing.ok, false);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.results[0].skipped, true);
});

test("rejette les sens de variation inconnus et les bornes inversées", () => {
  const result = verifyChecks([
    {
      type: "derivative_signs",
      expr: "x^2",
      intervals: [{ from: 2, to: 1, trend: "sideways" }],
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.results[0].reason, /intervalle ou sens.*invalide/);
});

test("conserve les contrôles numériques déjà présents", () => {
  const result = verifyChecks([
    { type: "geometric", u0: 100, q: 2, n: 3, claimed: 800 },
    { type: "arithmetic", u0: 5, r: 3, n: 12, claimed: 41 },
    { type: "function_eval", expr: "(x^2+2)/(x-1)", x: 2, claimed: 6 },
    { type: "derivative_eval", expr: "x^3-2*x", x: 2, claimed: 10 },
    { type: "nonnegative_samples", expr: "x+2", domainStart: 0 },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 5);
  assert.ok(result.results.every((check) => check.ok === true));
});

test("échantillonne une grandeur non négative dans son domaine borné", () => {
  const result = verifyChecks([
    { type: "nonnegative_samples", expr: "0.1-x", domainStart: 0, domainEnd: 0.075 },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.results[0].samples.map(({ x }) => x), [0, 0.0375, 0.075]);
});

test("détecte une quantité négative avant la borne d'un domaine borné", () => {
  const result = verifyChecks([
    { type: "nonnegative_samples", expr: "0.1-2*x", domainStart: 0, domainEnd: 0.075 },
  ]);

  assert.equal(result.ok, false);
  assert.ok(Math.abs(result.results[0].samples.at(-1).value + 0.05) < 1e-12);
});

test("continue de rejeter un résultat numérique erroné", () => {
  const result = verifyChecks([
    { type: "arithmetic", u0: 5, r: 3, n: 12, claimed: 44 },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.results[0].computed, 41);
});

test("vérifie ln(x)/x en traduisant ln vers le logarithme népérien de mathjs", () => {
  const result = verifyChecks([
    { type: "function_eval", expr: "ln(x)/x", x: 1, claimed: 0 },
    { type: "derivative_eval", expr: "ln(x)/x", x: 1, claimed: 1 },
    {
      type: "derivative_signs",
      expr: "ln(x)/x",
      intervals: [
        { from: 0, to: Math.E, trend: "increasing" },
        { from: Math.E, to: null, trend: "decreasing" },
      ],
    },
  ], { requireDerivativeSigns: true, requiredDerivativeSignCount: 1 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.results.map((check) => check.skipped ?? false), [false, false, false]);
  assert.equal(result.results[0].computed, 0);
  assert.equal(result.results[1].computed, 1);
});


test("valide une division euclidienne rationnelle exacte", () => {
  const result = verifyChecks([{
    type: "rational_decomposition",
    numeratorExpr: "3*x^2-6*x+2",
    denominatorExpr: "x-1",
    quotientExpr: "3*x-3",
    remainderExpr: "-1",
  }]);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].checkedSamples, 6);
});

test("détecte le quotient et le reste erronés observés dans une correction", () => {
  const result = verifyChecks([{
    type: "rational_decomposition",
    numeratorExpr: "3*x^2-6*x+2",
    denominatorExpr: "x-1",
    quotientExpr: "3*x-3",
    remainderExpr: "5",
  }]);
  assert.equal(result.ok, false);
  assert.match(result.results[0].reason, /identité de décomposition fausse/);
});

test("exige une décomposition valide pour chaque fonction du sujet", () => {
  const result = verifyChecks([], { requireRationalDecompositions: true, requiredRationalDecompositionCount: 1 });
  assert.equal(result.ok, false);
});

test("vérifie un dénombrement ordonné pour deux tirages sans remise", () => {
  const result = verifyChecks([{
    type: "draw_probability",
    red: 5,
    blue: 3,
    ordered: true,
    totalOutcomes: 56,
    favorableOutcomes: 30,
    claimedProbability: 15 / 28,
  }]);
  assert.equal(result.ok, true);
});

test("refuse de mélanger un tirage successif avec des dénombrements non ordonnés", () => {
  const result = verifyChecks([{
    type: "draw_probability",
    red: 5,
    blue: 3,
    ordered: true,
    totalOutcomes: 28,
    favorableOutcomes: 15,
    claimedProbability: 15 / 28,
  }]);
  assert.equal(result.ok, false);
});

test("recalcule la loi binomiale B(10, 0,3) et accepte les valeurs arrondies à 5 décimales", () => {
  const probabilities = Array.from({ length: 11 }, (_, k) => {
    const combination = Array.from({ length: Math.min(k, 10 - k) }, (_, index) =>
      (10 - Math.min(k, 10 - k) + index + 1) / (index + 1)
    ).reduce((product, factor) => product * factor, 1);
    const computed = combination * 0.3 ** k * 0.7 ** (10 - k);
    return { k, claimed: Number(computed.toFixed(5)) };
  });
  const result = verifyChecks([
    { type: "binomial_distribution", n: 10, p: 0.3, precision: 5, probabilities },
  ], { requireBinomialDistributions: true, requiredBinomialDistributionCount: 1 });

  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.results[0].distribution[4].computed - 0.200120949) < 1e-12);
  assert.ok(Math.abs(result.results[0].sumComputed - 1) < 1e-12);
});

test("détecte P(X=4)=0,19996 et le total erroné de la réponse observée", () => {
  const probabilities = [
    0.02825, 0.12106, 0.23347, 0.26683, 0.19996, 0.10292,
    0.03676, 0.00900, 0.00145, 0.00014, 0.00001,
  ].map((claimed, k) => ({ k, claimed }));
  const result = verifyChecks([
    { type: "binomial_distribution", n: 10, p: 0.3, precision: 5, probabilities },
  ]);

  assert.equal(result.ok, false);
  assert.ok(Math.abs(result.results[0].distribution[4].computed - 0.200120949) < 1e-12);
  assert.match(result.results[0].reason, /P\(X=4\).*0\.19996/);
});

test("exige une loi binomiale complète lorsque le sujet le demande", () => {
  const missing = verifyChecks([], {
    requireBinomialDistributions: true,
    requiredBinomialDistributionCount: 1,
  });
  const incomplete = verifyChecks([
    {
      type: "binomial_distribution",
      n: 2,
      p: 0.5,
      probabilities: [{ k: 0, claimed: 0.25 }, { k: 2, claimed: 0.25 }],
    },
  ], {
    requireBinomialDistributions: true,
    requiredBinomialDistributionCount: 1,
  });

  assert.equal(missing.ok, false);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.results[0].reason, /3 valeurs de k/);
});
