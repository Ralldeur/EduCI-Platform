const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://ml-service:8086";

/**
 * Interroge ml-service pour récupérer les chunks de cours/exercices les
 * plus pertinents par rapport à une question posée par l'élève.
 *
 * IMPORTANT : docType n'a volontairement PAS de valeur par défaut ici.
 * C'est à l'appelant (la route /chat) de toujours préciser explicitement
 * "cours" ou "exercice" selon ce qu'il est en train de faire — ce n'est
 * pas le rôle de ce client de décider à sa place. Voir la note dans
 * ml-service/app/main.py (SearchRequest) pour la règle produit complète.
 *
 * @param {string} query - la question ou le sujet recherché
 * @param {object} options
 * @param {string} [options.subject] - slug du programme, ex. "mathematiques" (voir SUBJECT_LABELS dans frontend/src/lib/curriculum.ts — le filtre Qdrant est un match exact, tout autre slug ne retrouve rien)
 * @param {string} [options.gradeLevel] - ex. "Terminale D"
 * @param {"cours"|"exercice"} [options.docType]
 * @param {number} [options.topK=5]
 * @returns {Promise<Array>} la liste des chunks trouvés (vide si erreur)
 */
export async function searchRag(query, { subject, gradeLevel, docType, topK = 5 } = {}) {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/rag/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, subject, gradeLevel, docType, topK }),
    });

    if (!res.ok) {
      console.error(`[ragClient] ml-service a répondu ${res.status}: ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error("[ragClient] échec de l'appel à ml-service:", err.message);
    return [];
  }
}
