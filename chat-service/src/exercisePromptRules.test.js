import test from "node:test";
import assert from "node:assert/strict";
import { acidBaseTitrationGuidance } from "./exercisePromptRules.js";

test("donne des consignes de vocabulaire pour un dosage acido-basique", () => {
  const guidance = acidBaseTitrationGuidance(
    "Physique-Chimie",
    "Dosage acido-basique : équivalence et pH"
  );

  assert.match(guidance, /V_E désigne le volume de solution titrante/);
  assert.match(guidance, /volume de soude versé à l'équivalence/);
  assert.match(guidance, /dans toutes les parties de l'exercice/);
});

test("n'ajoute pas de consigne de titrage hors du sujet chimie approprié", () => {
  assert.equal(
    acidBaseTitrationGuidance("Mathématiques", "Étude des variations"),
    ""
  );
  assert.equal(
    acidBaseTitrationGuidance("Physique-Chimie", "Mouvement d'un projectile"),
    ""
  );
});
