
import { z } from "zod";

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const UnitsSchema = z.union([z.literal("mm"), z.literal("m"), z.literal("in")]);

export const SectionDimsSchema = z.object({
  bf: z.number().positive(),
  tw: z.number().positive(),
  tf: z.number().positive(),
  d: z.number().positive(),
  r: z.number().optional()
});

// Expanded to support AISC profiles
export const SectionSchema = z.object({
  name: z.string(), // e.g., W12x26
  type: z.union([
    z.literal("W"), // Wide Flange (I)
    z.literal("S"), // American Standard Beam
    z.literal("C"), // Channel
    z.literal("L"), // Angle
    z.literal("HSS"), // Hollow Structural Section
    z.literal("Pipe"),
    z.literal("Box"),
    z.literal("Custom")
  ]),
  dims: SectionDimsSchema,
  area_mm2: z.number().positive().optional(),
  perimeter_mm: z.number().positive().optional(),
});

// Material schema for AISC grades
export const MaterialSchema = z.object({
  grade: z.string(), // e.g., A36, A992
  fy: z.number().optional(), // Yield strength (MPa or ksi)
  fu: z.number().optional()  // Ultimate strength (MPa or ksi)
});

// Connection placeholder (expandable)
export const ConnectionSchema = z.object({
  type: z.string(), // e.g., "end plate", "shear tab", etc.
  details: z.record(z.string(), z.unknown()).optional() // For future extensibility
});

// Member properties for AISC compliance
export const MemberPropsSchema = z.object({
  camber: z.number().optional(), // mm or in
  end_prep: z.string().optional(), // e.g., "square", "bevel"
  splice: z.boolean().optional(),
  notes: z.string().optional()
});

export const MemberSchema = z.object({
  id: z.string(),
  type: z.union([z.literal("beam"), z.literal("column")]),
  section: z.string(), // Section name (W12x26, etc.)
  material: MaterialSchema,
  start: Vec3Schema,
  end: Vec3Schema,
  properties: MemberPropsSchema.optional(),
  connections: z.array(ConnectionSchema).optional(),
  mark: z.string().optional(), // Piece mark
  label: z.string().optional() // For annotation
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
export type Material = z.infer<typeof MaterialSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type MemberProps = z.infer<typeof MemberPropsSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Model = z.infer<typeof ModelSchema>;

