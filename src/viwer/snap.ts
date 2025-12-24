import * as THREE from "three";

export type Units = "mm" | "m" | "in";

export function gridSize(units: Units) {
  if (units === "mm") return 10 / 1000;
  if (units === "m") return 0.1;
  return 1 / 39.37007874; // 1 inch in meters
}

export function gridSnap(v: THREE.Vector3, units: Units) {
  const g = gridSize(units);
  const s = (x: number) => Math.round(x / g) * g;
  return new THREE.Vector3(s(v.x), s(v.y), s(v.z));
}

export function snapToEndpoints(p: THREE.Vector3, handles: THREE.Mesh[], tol = 0.1) {
  for (const h of handles) {
    if (h.position.distanceTo(p) < tol) return h.position.clone();
  }
  return p;
}

export function projectToSegment(a: THREE.Vector3, b: THREE.Vector3, q: THREE.Vector3) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const aq = new THREE.Vector3().subVectors(q, a);
  const t = Math.max(0, Math.min(1, aq.dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
}

export function snapToLines(p: THREE.Vector3, segments: Array<[THREE.Vector3, THREE.Vector3]>, tol = 0.05) {
  for (const [a,b] of segments) {
    const proj = projectToSegment(a, b, p);
    if (proj.distanceTo(p) < tol) return proj;
  }
  return p;
}