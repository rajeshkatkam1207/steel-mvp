
// src/engine/solid.ts
import * as THREE from "three";
import type { Member, Section } from "./types";

/** Distance between two 3D points */
export function length3(a: [number,number,number], b: [number,number,number]) {
  return Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
}

/** Convert units: viewer uses meters */
export const toMeters = (val: number, units: "mm"|"m"|"in") =>
  units === "mm" ? val / 1000 : units === "m" ? val : val / 39.37007874;

export const fromMeters = (val: number, units: "mm"|"m"|"in") =>
  units === "mm" ? val * 1000 : units === "m" ? val : val * 39.37007874;

/**
 * Build an orthonormal basis (Right, Up, Forward) aligned to the member direction
 * and a preferred global Up to keep cross-section consistent (Tekla-like look).
 *
 * - forward: along member start->end
 * - upPref: preferred global up (for beams: Y; for columns: X)
 * - right = upPref × forward
 * - up = forward × right
 */
function makeBasis(forward: THREE.Vector3, upPref: THREE.Vector3) {
  const f = forward.clone().normalize();
  let r = new THREE.Vector3().crossVectors(upPref, f);
  // If upPref ~ parallel to forward, fall back to world Z to avoid degeneracy
  if (r.lengthSq() < 1e-12) {
    const worldZ = new THREE.Vector3(0,0,1);
    r = new THREE.Vector3().crossVectors(worldZ, f);
  }
  r.normalize();
  const u = new THREE.Vector3().crossVectors(f, r).normalize();
  // 3x3 rotation matrix columns: Right, Up, Forward
  const m = new THREE.Matrix4().makeBasis(r, u, f);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return q;
}

/**
 * SOLID box envelope with Tekla-like orientation:
 *  - width (X_local)  = flange width (bf)   → flanges horizontal for beams
 *  - depth (Y_local)  = section depth (d)   → web vertical for beams
 *  - length (Z_local) = member length
 */
export function makeSolidBox(
  m: Member, sec: Section, units: "mm"|"m", color?: number
): THREE.Mesh {
  const Lm = toMeters(length3(m.start, m.end), units);
  const depth = toMeters(sec.dims.d, units);   // Y_local
  const width = toMeters(sec.dims.bf, units);  // X_local

  const geom = new THREE.BoxGeometry(width, depth, Lm);
  const mat = new THREE.MeshStandardMaterial({
    color: color ?? (m.type === "beam" ? 0x2d6cdf : 0x2fbf71),
    metalness: 0.6,
    roughness: 0.4
  });
  const mesh = new THREE.Mesh(geom, mat);

  // Z-up: interpret input as [X, Y, Z], no swap needed
  const start = new THREE.Vector3(
    toMeters(m.start[0], units), toMeters(m.start[1], units), toMeters(m.start[2], units)
  );
  const end = new THREE.Vector3(
    toMeters(m.end[0], units), toMeters(m.end[1], units), toMeters(m.end[2], units)
  );
  const forward = new THREE.Vector3().subVectors(end, start);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);

  // Z-up: beams → +Z up (web vertical), columns → +Y up (web horizontal)
  const upPref = (m.type === "beam") ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,1,0);
  const q = makeBasis(forward, upPref);
  mesh.setRotationFromQuaternion(q);

  return mesh;
}

/**
 * Realistic I‑section sweep (approx.; no fillet radii) with Tekla-like orientation.
 * Uses the same basis logic as the box.
 */
export function makeSolidISection(
  m: Member, sec: Section, units: "mm"|"m", color?: number
): THREE.Mesh {
  const Lm = toMeters(length3(m.start, m.end), units);
  const bf = toMeters(sec.dims.bf, units);
  const tf = toMeters(sec.dims.tf, units);
  const tw = toMeters(sec.dims.tw, units);
  const d  = toMeters(sec.dims.d, units);

  // 2D I profile centered on origin (X horizontal, Y vertical)
  const halfDepth = d / 2;
  const halfFlange = bf / 2;
  const halfWeb = tw / 2;

  const shape = new THREE.Shape();
  // Outer rectangle
  shape.moveTo(-halfFlange, -halfDepth);
  shape.lineTo( halfFlange, -halfDepth);
  shape.lineTo( halfFlange,  halfDepth);
  shape.lineTo(-halfFlange,  halfDepth);
  shape.lineTo(-halfFlange, -halfDepth);

  // Left & right voids (between flanges & web)
  const leftHole = new THREE.Path();
  leftHole.moveTo(-halfFlange, -halfDepth + tf);
  leftHole.lineTo(-halfWeb,    -halfDepth + tf);
  leftHole.lineTo(-halfWeb,     halfDepth - tf);
  leftHole.lineTo(-halfFlange,  halfDepth - tf);
  leftHole.lineTo(-halfFlange, -halfDepth + tf);

  const rightHole = new THREE.Path();
  rightHole.moveTo( halfWeb,    -halfDepth + tf);
  rightHole.lineTo( halfFlange, -halfDepth + tf);
  rightHole.lineTo( halfFlange,  halfDepth - tf);
  rightHole.lineTo( halfWeb,     halfDepth - tf);
  rightHole.lineTo( halfWeb,    -halfDepth + tf);

  shape.holes.push(leftHole, rightHole);

  const extrude = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: Lm, bevelEnabled: false });
  // Center along local Z
  extrude.translate(0, 0, -Lm/2);

  const mat = new THREE.MeshStandardMaterial({
    color: color ?? (m.type === "beam" ? 0x2d6cdf : 0x2fbf71),
    metalness: 0.6,
    roughness: 0.4
  });
  const mesh = new THREE.Mesh(extrude, mat);

  // Position & orientation
  const start = new THREE.Vector3(
    toMeters(m.start[0], units), toMeters(m.start[1], units), toMeters(m.start[2], units)
  );
  const end = new THREE.Vector3(
    toMeters(m.end[0], units), toMeters(m.end[1], units), toMeters(m.end[2], units)
  );
  const forward = new THREE.Vector3().subVectors(end, start);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);

  const upPref = (m.type === "beam") ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
  const q = makeBasis(forward, upPref);
  mesh.setRotationFromQuaternion(q);

  return mesh;
}
