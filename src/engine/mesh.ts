
// src/engine/mesh.ts
import * as THREE from "three";
import type { Member, Section } from "./types";

export function length3(a: [number,number,number], b: [number,number,number]) {
  return Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
}
const toMeters = (val: number, units: "mm"|"m") => units === "mm" ? val / 1000 : val;

export function makePrismaticMesh(m: Member, sec: Section, units: "mm"|"m") {
  const Lm = toMeters(length3(m.start, m.end), units);
  const depth = toMeters(sec.dims.d, units);
  const width = toMeters(sec.dims.bf, units);

  const geom = new THREE.BoxGeometry(width, depth, Lm);
   const mat = new THREE.MeshStandardMaterial({ color: m.type === "beam" ? 0x2d6cdf : 0x2fbf71 });
  const mesh = new THREE.Mesh(geom, mat);

  const start = new THREE.Vector3(...m.start.map(v => toMeters(v, units)) as [number,number,number]);
  const end = new THREE.Vector3(...m.end.map(v => toMeters(v, units)) as [number,number,number]);

  const dir = new THREE.Vector3().subVectors(end, start);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);

  const zAxis = new THREE.Vector3(0,0,1);
  const quat = new THREE.Quaternion().setFromUnitVectors(zAxis, dir.clone().normalize());
  mesh.setRotationFromQuaternion(quat);

  return mesh;
}
