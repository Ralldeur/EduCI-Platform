// Certains modèles renvoient les deux caractères « \n » au lieu d'un vrai
// saut de ligne. Ne remplace que les marqueurs suivis d'un paragraphe ou
// d'une liste pour préserver les commandes LaTeX comme \neq et \nabla.
export function normalizeStudentText(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\\n(?!eq\b|e\b|abla\b|u\b|ot(?:in|eq)?\b|eg\b|ewcommand\b|exists\b|parallel\b|atural\b|mid\b|earrow\b|warrow\b|Leftarrow\b|Rightarrow\b|leftrightarrow\b|Leftrightarrow\b|less\b|gtr\b|leq\b|geq\b|subset(?:eq)?\b|supset(?:eq)?\b|cong\b|sim\b|prec\b|succ\b|VDash\b|models\b)/g, "\n");
}

export function normalizeExercises(exercises) {
  if (!Array.isArray(exercises)) return exercises;
  return exercises.map((exercise) => ({
    ...exercise,
    question: normalizeStudentText(exercise?.question),
    answer: normalizeStudentText(exercise?.answer),
    explanation: normalizeStudentText(exercise?.explanation),
    options: Array.isArray(exercise?.options)
      ? exercise.options.map(normalizeStudentText)
      : exercise?.options,
  }));
}

export function normalizeCorrection(correction) {
  if (!correction || typeof correction !== "object" || Array.isArray(correction)) return correction;
  const normalized = { ...correction };
  for (const field of ["feedback", "correction", "answer", "explanation"]) {
    if (typeof normalized[field] === "string") normalized[field] = normalizeStudentText(normalized[field]);
  }
  for (const field of ["positives", "errors", "tips"]) {
    if (Array.isArray(normalized[field])) normalized[field] = normalized[field].map(normalizeStudentText);
  }
  return normalized;
}


export function formatRationalDecomposition(check) {
  const quotient = check.quotientExpr;
  const denominator = check.denominatorExpr;
  const remainder = String(check.remainderExpr).trim();
  const numericRemainder = Number(remainder.replace(",", "."));
  const simplifiedRemainder = Number.isFinite(numericRemainder) && numericRemainder < 0
    ? `− ${Math.abs(numericRemainder)}/(${denominator})`
    : `+ (${remainder})/(${denominator})`;
  return `Division vérifiée : (${check.numeratorExpr}) = (${denominator})(${quotient}) + (${remainder}). Forme simplifiée à reprendre dans la correction : ${quotient} ${simplifiedRemainder}. Si le reste est négatif, écris une soustraction avec un reste positif, jamais « + (nombre négatif) ».`;
}
