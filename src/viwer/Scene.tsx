
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useModel } from "../store/useModel";
import { makeSolidBox, makeSolidISection, toMeters } from "../engine/solid";

export default function Scene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { model, selection, selectMember } = useModel();
  const { createMode, setCreateMode, addMember } = useModel();

  useEffect(() => {
    if (!canvasRef.current || !model) return;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fb);

    // Z-up camera (Tekla style)
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(35, -40, 30); // look from +X, -Y, +Z
    camera.lookAt(0, 0, 0);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    // Z-up grid (on XY plane, Z=0)
    const grid = new THREE.GridHelper(100, 100, 0x888888, 0xcccccc);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9); dirLight.position.set(30, 40, 20); scene.add(dirLight);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0,0,1), 0); // ground plane z=0
    const temp = { startPt: null as THREE.Vector3 | null, previewMesh: null as THREE.Object3D | null };

    const sectionMap = new Map(model.sections.map(s => [s.name, s]));
    const meshById: Record<string, THREE.Mesh> = {};
    const origColorById: Record<string, THREE.Color> = {};

    // --- Build SOLIDS (choose Box or I-section) ---
    model.members.forEach(m => {
      const sec = sectionMap.get(m.section);
      if (!sec) return;
      // Tekla-like colors: beams = green, columns = purple
      const color = m.type === "beam" ? 0x4caf50 : 0x9c27b0;

      // Prefer realistic I-section when section data supports it, fallback to box
      const mesh = (sec.type === "I")
        ? makeSolidISection(m, sec, model.project.units, color)
        : makeSolidBox(m, sec, model.project.units, color);

      // Add dark edge lines for clearer outline (like Tekla)
      try {
        const edges = new THREE.EdgesGeometry((mesh.geometry as THREE.BufferGeometry));
        const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 1 }));
        // put lines as child so selection still targets the main mesh
        mesh.add(lines);
      } catch (e) {
        // ignore if geometry doesn't support edges extraction
      }

      mesh.userData.memberId = m.id;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) origColorById[m.id] = mat.color.clone();
      scene.add(mesh);
      meshById[m.id] = mesh;
    });

    // --- Transform Controls ---
    const tc = new TransformControls(camera, renderer.domElement);
    tc.setMode("translate");
    scene.add(tc);

    tc.addEventListener("dragging-changed", (e: any) => { orbit.enabled = !e.value; });

    // Update JSON on move (mm ↔ m handled)
    tc.addEventListener("objectChange", () => {
      const sel = selection.selectedId;
      if (!sel || !model) return;
      const mesh = meshById[sel];
      if (!mesh) return;

      const oldMember = model.members.find(mm => mm.id === sel);
      if (!oldMember) return;

      const units = model.project.units;
      const origMidM = new THREE.Vector3(
        toMeters((oldMember.start[0] + oldMember.end[0]) / 2, units),
        toMeters((oldMember.start[1] + oldMember.end[1]) / 2, units),
        toMeters((oldMember.start[2] + oldMember.end[2]) / 2, units)
      );
      const currMidM = mesh.position.clone();
      const deltaM = new THREE.Vector3().subVectors(currMidM, origMidM);

      const toUnits = (v: number) => (units === "mm" ? v * 1000 : units === "m" ? v : v * 39.37007874);

      const newStart: [number, number, number] = [
        oldMember.start[0] + toUnits(deltaM.x),
        oldMember.start[1] + toUnits(deltaM.y),
        oldMember.start[2] + toUnits(deltaM.z)
      ];
      const newEnd: [number, number, number] = [
        oldMember.end[0] + toUnits(deltaM.x),
        oldMember.end[1] + toUnits(deltaM.y),
        oldMember.end[2] + toUnits(deltaM.z)
      ];

      const { updateMember } = useModel.getState();
      updateMember(sel, { start: newStart, end: newEnd });
    });

    // --- Click selection & highlight ---
    function onClick(ev: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      // intersect with ground plane to get world position
      const pos = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, pos);

      // if in create mode, handle start/end placement
      if (createMode && createMode !== "none") {
        // Snap to grid (inches if units==in, 10mm if mm, 0.1m if m)
        const units = model.project.units;
        let grid = 1; // default 1 inch
        if (units === "mm") grid = 10 / 1000;
        else if (units === "m") grid = 0.1;
        // snap function
        const snap = (v: number) => Math.round(v / grid) * grid;
        pos.x = snap(pos.x);
        pos.y = snap(pos.y);
        pos.z = snap(pos.z);

        if (!temp.startPt) {
          temp.startPt = pos.clone();
          // preview helper: small marker
          const geo = new THREE.SphereGeometry(0.05);
          const mat = new THREE.MeshBasicMaterial({ color: createMode === "beam" ? 0x4caf50 : 0x9c27b0 });
          const marker = new THREE.Mesh(geo, mat);
          marker.position.copy(temp.startPt);
          scene.add(marker);
          temp.previewMesh = marker;
          return;
        } else {
          const start = temp.startPt.clone();
          const end = pos.clone();
          if (!model) return;
          // convert meters -> model units
          const toUnits = (v: number) => {
            if (units === "mm") return v * 1000;
            if (units === "m") return v;
            return v * 39.37007874; // inches
          };
          // Sequential ID: B1, C1, ...
          const { getNextMemberId } = useModel.getState();
          const newId = getNextMemberId(createMode);
          const newMember = {
            id: newId,
            type: createMode === "beam" ? "beam" : "column",
            section: model.sections[0]?.name ?? "",
            start: [toUnits(start.x), toUnits(start.y), toUnits(start.z)] as any,
            end: [toUnits(end.x), toUnits(end.y), toUnits(end.z)] as any
          } as any;
          addMember(newMember);
          // create mesh and add to scene
          const sec = model.sections.find(s => s.name === newMember.section);
          if (sec) {
            const color = newMember.type === "beam" ? 0x4caf50 : 0x9c27b0;
            const mesh = (sec.type === "I") ? makeSolidISection(newMember, sec, model.project.units, color)
                                              : makeSolidBox(newMember, sec, model.project.units, color);
            mesh.userData.memberId = newId;
            scene.add(mesh);
            meshById[newId] = mesh;
            origColorById[newId] = (mesh.material as any).color.clone?.() ?? new THREE.Color(color);
          }
          // cleanup preview
          try { if (temp.previewMesh) scene.remove(temp.previewMesh); } catch {}
          temp.startPt = null;
          temp.previewMesh = null;
          setCreateMode("none");
          return;
        }
      }

      const hit = raycaster.intersectObjects(scene.children, false)
                 .find(i => (i.object as any).userData?.memberId);

      // reset previous highlight
      Object.entries(meshById).forEach(([id, mesh]) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && origColorById[id]) mat.color.copy(origColorById[id]);
      });

      if (hit) {
        const id = (hit.object as any).userData.memberId as string;
        selectMember(id);
        tc.attach(hit.object);
        const selMat = (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (selMat) selMat.color.setHex(0xff8c00);
      } else {
        selectMember(undefined);
        try { tc.detach(); } catch {}
      }
    }
    renderer.domElement.addEventListener("click", onClick);

    // --- Loop & resize ---
    const animate = () => { requestAnimationFrame(animate); orbit.update(); renderer.render(scene, camera); };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);
      tc.dispose();
      orbit.dispose();
      renderer.dispose();
    };
  }, [canvasRef, model, selection.selectedId]);

  // HUD for create mode
  return <>
    <canvas ref={canvasRef} style={{ width: "100vw", height: "100vh" }} />
    {createMode !== "none" && (
      <div style={{
        position: "absolute", top: 60, left: 20, zIndex: 10, background: "rgba(255,255,255,0.95)",
        border: "1px solid #bbb", borderRadius: 6, padding: "10px 18px", fontSize: 16, color: "#222"
      }}>
        <b>{createMode === "beam" ? "Beam" : "Column"} creation:</b><br/>
        Click to place start point, then click to place end point.<br/>
        (Snaps to {model?.project.units === "in" ? "1 inch" : model?.project.units === "mm" ? "10 mm" : "0.1 m"} grid)
      </div>
    )}
  </>;
}
