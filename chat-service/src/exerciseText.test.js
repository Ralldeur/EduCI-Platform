import test from "node:test";
import assert from "node:assert/strict";
import { formatRationalDecomposition, normalizeStudentText, normalizeExercises } from "./exerciseText.js";

test("convertit les \n littéraux devant des paragraphes/listes en vrais retours", () => {
  const normalized = normalizeStudentText("Première étape.\\n\\n1. Deuxième étape\\n2. Résultat\\nla suite");
  assert.equal(normalized, "Première étape.\n\n1. Deuxième étape\n2. Résultat\nla suite");
  assert.equal(normalized.includes("\\n"), false);
});

test("préserve les commandes LaTeX commençant par n", () => {
  const latex = "$a \\neq b$ et $\\nabla f$ et $\\nearrow$ et $\\nwarrow$";
  assert.equal(normalizeStudentText(latex), latex);
});

test("normalise les énoncés, réponses, explications et options", () => {
  const [exercise] = normalizeExercises([{
    question: "Question\\nSuite",
    answer: "Réponse\\nÉtape 2",
    explanation: "Explication\\n1. Calcul",
    options: ["A\\nB"],
  }]);
  assert.equal(exercise.question, "Question\nSuite");
  assert.equal(exercise.answer, "Réponse\nÉtape 2");
  assert.equal(exercise.explanation, "Explication\n1. Calcul");
  assert.equal(exercise.options[0], "A\nB");
});


test("présente un reste négatif avec un signe simplifié", () => {
  const prompt = formatRationalDecomposition({
    numeratorExpr: "3*x^2-6*x+2",
    denominatorExpr: "x-1",
    quotientExpr: "3*x-3",
    remainderExpr: "-1",
  });
  assert.match(prompt, /3\*x-3 − 1\/\(x-1\)/);
  assert.doesNotMatch(prompt, /\+ \(-1\)\//);
});
