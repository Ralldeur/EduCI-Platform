import { z } from "zod";

const finiteNumber = z.number().finite();
const label = z.string().trim().min(1).max(80);

const axisSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    unit: z.string().trim().max(16).optional(),
    min: finiteNumber,
    max: finiteNumber,
  })
  .strict()
  .refine((axis) => axis.max > axis.min);

const graphSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    xAxis: axisSchema,
    yAxis: axisSchema,
    series: z
      .array(
        z
          .object({
            label,
            points: z
              .array(z.object({ x: finiteNumber, y: finiteNumber }).strict())
              .min(2)
              .max(100),
          })
          .strict()
      )
      .min(1)
      .max(4),
  })
  .strict()
  .superRefine((graph, context) => {
    graph.series.forEach((series, seriesIndex) => {
      series.points.forEach((point, pointIndex) => {
        if (point.x < graph.xAxis.min || point.x > graph.xAxis.max) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series", seriesIndex, "points", pointIndex, "x"],
            message: "Point outside horizontal axis",
          });
        }
        if (point.y < graph.yAxis.min || point.y > graph.yAxis.max) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series", seriesIndex, "points", pointIndex, "y"],
            message: "Point outside vertical axis",
          });
        }
      });
    });
  });

const coordinate = z.number().finite().min(0).max(100);
const colorName = z.enum(["orange", "blue", "green", "red", "purple", "gray"]);
const optionalElementLabel = z.string().trim().max(60).optional();

const diagramElementSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("line"),
      x1: coordinate,
      y1: coordinate,
      x2: coordinate,
      y2: coordinate,
      label: optionalElementLabel,
      color: colorName.optional(),
      dashed: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("arrow"),
      x1: coordinate,
      y1: coordinate,
      x2: coordinate,
      y2: coordinate,
      label: optionalElementLabel,
      color: colorName.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("point"),
      x: coordinate,
      y: coordinate,
      label: optionalElementLabel,
      color: colorName.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("circle"),
      x: coordinate,
      y: coordinate,
      radius: z.number().finite().min(0.5).max(50),
      label: optionalElementLabel,
      color: colorName.optional(),
    })
    .strict(),
]);

const diagramSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    elements: z.array(diagramElementSchema).min(1).max(40),
  })
  .strict();

export type GraphSpec = z.infer<typeof graphSchema>;
export type DiagramSpec = z.infer<typeof diagramSchema>;
export type EduVisual =
  | { kind: "graph"; spec: GraphSpec }
  | { kind: "diagram"; spec: DiagramSpec };

/** Parse only the small, supported data formats. Raw HTML/SVG never reaches the DOM. */
export function parseEduVisual(language: string, source: string): EduVisual | null {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }

  if (language === "educi-graph") {
    const parsed = graphSchema.safeParse(value);
    return parsed.success ? { kind: "graph", spec: parsed.data } : null;
  }

  if (language === "educi-diagram") {
    const parsed = diagramSchema.safeParse(value);
    return parsed.success ? { kind: "diagram", spec: parsed.data } : null;
  }

  return null;
}
