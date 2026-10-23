import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "./promptBuilder.js";

test("distingue les extremums des points d'inflexion et vérifie les croisements d'asymptotes", () => {
  const prompt = buildSystemPrompt({ gradeLevel: "TLE", subject: "Mathématiques" });

  assert.match(prompt, /maximum ou minimum un extremum/);
  assert.match(prompt, /réserve « point d'inflexion » au changement de convexité/);
  assert.match(prompt, /ne prouve pas qu'elle ne la coupe jamais/);
  assert.match(prompt, /résolvant l'égalité correspondante/);
});
