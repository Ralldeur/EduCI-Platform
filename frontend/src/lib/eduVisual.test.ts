import test from "node:test";
import assert from "node:assert/strict";
import { parseEduVisual } from "./eduVisual";

test("parse un graphique natif avec des axes et une courbe bornée", () => {
  const visual = parseEduVisual(
    "educi-graph",
    JSON.stringify({
      title: "Position en fonction du temps",
      xAxis: { label: "Temps", unit: "s", min: 0, max: 2 },
      yAxis: { label: "Position", unit: "m", min: 0, max: 4 },
      series: [{ label: "x(t)", points: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }] }],
    })
  );

  assert.equal(visual?.kind, "graph");
  if (visual?.kind === "graph") assert.equal(visual.spec.series[0].points.length, 3);
});

test("rejette un graphique dont les points sortent des axes annoncés", () => {
  const visual = parseEduVisual(
    "educi-graph",
    JSON.stringify({
      xAxis: { label: "t", min: 0, max: 1 },
      yAxis: { label: "v", min: 0, max: 1 },
      series: [{ label: "v(t)", points: [{ x: 0, y: 0 }, { x: 2, y: 1 }] }],
    })
  );

  assert.equal(visual, null);
});

test("parse un schéma vectoriel et rejette les attributs SVG arbitraires", () => {
  const diagram = parseEduVisual(
    "educi-diagram",
    JSON.stringify({
      title: "Forces sur un objet",
      elements: [{ kind: "arrow", x1: 50, y1: 50, x2: 50, y2: 90, label: "P", color: "blue" }],
    })
  );
  const injection = parseEduVisual(
    "educi-diagram",
    JSON.stringify({
      title: "Schéma",
      elements: [{ kind: "point", x: 50, y: 50, label: "O", onload: "alert(1)" }],
    })
  );

  assert.equal(diagram?.kind, "diagram");
  assert.equal(injection, null);
});
