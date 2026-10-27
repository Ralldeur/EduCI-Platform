function normalizeForMatching(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function acidBaseTitrationGuidance(subject, topic) {
  const normalizedSubject = normalizeForMatching(subject);
  const normalizedTopic = normalizeForMatching(topic);
  const isChemistry = /chimie/.test(normalizedSubject);
  const isTitrationTopic = /\b(dosage|titrage|equivalence)\b/.test(normalizedTopic);
  const isAcidBaseTopic = /acido.?basique|acid.{0,40}base|base.{0,40}acid|\bph\b/.test(
    normalizedTopic
  );

  if (!isChemistry || !isTitrationTopic || !isAcidBaseTopic) return "";

  return [
    "Pour un dosage acido-basique, distingue toujours l'échantillon analysé de la solution titrante ajoutée depuis la burette. V_E désigne le volume de solution titrante versé à l'équivalence ; le volume prélevé de l'échantillon est une autre grandeur.",
    "Lis le protocole pour identifier le titrant, puis nomme-le explicitement dans chaque question, réponse et explication. Par exemple, si une solution d'acide chlorhydrique est dosée par la soude, demande le volume de soude versé à l'équivalence, jamais le volume d'acide versé.",
    "Vérifie que le vocabulaire employé pour V_E correspond au réactif ajouté dans le protocole, dans toutes les parties de l'exercice.",
  ].join("\n- ");
}
