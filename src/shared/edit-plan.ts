import { z } from "zod";

export const editPlanSchema = z.object({
  target: z.string().min(1),
  representation: z.enum([
    "surface_graphic",
    "surface_transformation",
    "attached_object",
    "freestanding_object",
    "scene_content",
  ]),
  integration: z.string().min(1),
  constraints: z.array(z.string().min(1)),
  exclusions: z.array(z.string().min(1)),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string().min(1),
});

export type EditPlan = z.infer<typeof editPlanSchema>;
