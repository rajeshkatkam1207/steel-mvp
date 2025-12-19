
// src/engine/types.ts
export type Vec3 = [number, number, number];
export type Units = "mm" | "m";
export type MemberType = "beam" | "column";

export interface Project {
  name: string;
  units: Units;
  origin: Vec3;
  density_kg_per_m3: number;
}

export interface Level { name: string; elevation: number; }

export interface SectionDims {
  bf: number; tw: number; tf: number; d: number; r?: number; // I-section dims
}

export interface Section {
  name: string;
  type: "I" | "C" | "Box";
  dims: SectionDims;
  area_mm2?: number;     // if available from catalog
  perimeter_mm?: number; // for paint area estimates
}

export interface Member {
  id: string;
  type: MemberType;
   section: string;  // link to Section.name
  start: Vec3;
  end: Vec3;
}
