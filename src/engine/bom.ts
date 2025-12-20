
// src/engine/bom.ts
import type { Model, Member } from "./schema";
import { length3 } from "./mesh";

export function computeBOM(model: Model) {
  const units = model.project.units;
  const toMeters = (v: number) => units === "mm" ? v/1000 : units === "m" ? v : v/39.37007874;
  const sectionMap = new Map(model.sections.map(s => [s.name, s]));
  const rows: string[][] = [["ID","Type","Section","Length_m","Weight_kg","Surface_m2"]];

  model.members.forEach((m: Member) => {
    const sec = sectionMap.get(m.section);
    const Lm = toMeters(length3(m.start, m.end));
    const area_m2 = sec?.area_mm2 ? (sec.area_mm2 / 1e6) : 0.0001; // fallback small value
    const perimeter_m = sec?.perimeter_mm ? (sec.perimeter_mm / 1000) : (2*(sec!.dims.bf + sec!.dims.d)/1000);
    const weight_kg = Lm * area_m2 * model.project.density_kg_per_m3;
       const surface_m2 = perimeter_m * Lm;
    rows.push([m.id, m.type, m.section, Lm.toFixed(3), weight_kg.toFixed(2), surface_m2.toFixed(2)]);
  });
  return rows;
}
