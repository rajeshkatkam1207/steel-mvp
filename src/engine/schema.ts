
import { z } from "zod";

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const UnitsSchema = z.union([z.literal("mm"), z.literal("m")]);

export const SectionDimsSchema = z.object({
  bf: z.number().positive(),
  tw: z.number().positive(),
  tf: z.number().positive(),
  d: z.number().positive(),
  r: z.number().optional()
});

export const SectionSchema = z.object({
  name: z.string(),
  type: z.union([z.literal("I"), z.literal("C"), z.literal("Box")]),
  dims: SectionDimsSchema,
  area_mm2: z.number().positive().optional(),
  perimeter_mm: z.number().positive().optional(),
});

export const MemberSchema = z.object({
  id: z.string(),
  type: z.union([z.literal("beam"), z.literal("column")]),
  section: z.string(),
  start: Vec3Schema,
  end: Vec3Schema
});

export const ProjectSchema = z.object({
  name: z.string(),
  units: UnitsSchema,
  origin: Vec3Schema,
  density_kg_per_m3: z.number().positive()
});

export const ModelSchema = z.object({
  project: ProjectSchema,
  levels: z.array(z.object({ name: z.string(), elevation: z.number() })),
  sections: z.array(SectionSchema),
  members: z.array(MemberSchema)
});

// TypeScript types inferred from Zod schemas
export type Vec3 = z.infer<typeof Vec3Schema>;
export type Units = z.infer<typeof UnitsSchema>;
export type SectionDims = z.infer<typeof SectionDimsSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Model = z.infer<typeof ModelSchema>;

