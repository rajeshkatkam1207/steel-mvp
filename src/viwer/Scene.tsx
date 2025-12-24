import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useModel } from "../store/useModel";
import { makeSolidBox, makeSolidISection, toMeters } from "../engine/solid";
import { gridSnap, snapToEndpoints, snapToLines } from "./snap";
import { buildGrid } from "./grid";

export default function Scene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { model, selection, selectMember, appearance } = useModel();
  const { createMode, setCreateMode, addMember } = useModel();
  const orbitRef = useRef<OrbitControls | null>(null);
  const [previewInfo, setPreviewInfo] = useState<{distance_m:number, angle_deg:number}|null>(null);
  const [nodeInfo, setNodeInfo] = useState<null | { posM: {x:number;y:number;z:number}; entries: Array<{id:string, angle:number}> }>(null);

  // Listen for preview updates dispatched from rendering loop
  React.useEffect(() => {
    const handler = (ev: any) => {
      const d = ev.detail as {distance_m:number, angle_deg:number} | null;
      setPreviewInfo(d);
    };
    window.addEventListener('preview:update', handler as EventListener);
    return () => window.removeEventListener('preview:update', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !model) return;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fb);

    // Z-up camera (Tekla style) - default Top View
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, 0, 60);
    camera.lookAt(0, 0, 0);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    // Default to 2D/top view style controls: left=pan, middle=zoom, right=rotate (disabled)
    orbit.enableRotate = false;
    orbit.enablePan = true;
    (orbit as any).mouseButtons = { LEFT: (THREE as any).MOUSE.PAN, MIDDLE: (THREE as any).MOUSE.DOLLY, RIGHT: (THREE as any).MOUSE.ROTATE };
    orbitRef.current = orbit;

    // Custom controllable grid
    let gridGroup = buildGrid(useModel.getState().grid, useModel.getState().appearance.gridMajor, useModel.getState().appearance.gridMinor);
    scene.add(gridGroup);
    // Grid origin handle for dragging/movement (size scales with grid spacing)
    const computeHandleSize = () => {
      const g = useModel.getState().grid;
      const xList = (g.xSpacings && g.xSpacings.length) ? g.xSpacings : Array(Math.max(1, g.xCount - 1)).fill(g.xSpacing);
      const yList = (g.ySpacings && g.ySpacings.length) ? g.ySpacings : Array(Math.max(1, g.yCount - 1)).fill(g.ySpacing);
      const avgX = xList.length ? xList.reduce((a,b)=>a+b,0) / xList.length : g.xSpacing || 12;
      const avgY = yList.length ? yList.reduce((a,b)=>a+b,0) / yList.length : g.ySpacing || 12;
      const avg = (avgX + avgY) * 0.5;
      return Math.max(6, Math.min(24, avg * 0.06));
    };
    let gridHandleGeo = new THREE.BoxGeometry(computeHandleSize(), computeHandleSize(), computeHandleSize());
    const gridHandleMat = new THREE.MeshBasicMaterial({ color: 0x009688 });
    const gridHandle = new THREE.Mesh(gridHandleGeo, gridHandleMat);
    gridHandle.userData.type = 'grid-handle';
    gridHandle.position.set(useModel.getState().grid.origin.x, useModel.getState().grid.origin.y, useModel.getState().grid.origin.z);
    scene.add(gridHandle);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(30, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024,1024);
    dirLight.shadow.radius = 2;
    scene.add(dirLight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0,0,1), 0); // ground plane z=0
    const temp = {
      startPt: null as THREE.Vector3 | null,
      previewMesh: null as THREE.Object3D | null,
      verticalLock: false,
      defaultHeightM: 3.0 // 3 meters default column height
    };
    let isMouseDown = false;
    const [previewInfo, setPreviewInfo] = [null as any, null as any];

    const sectionMap = new Map(model.sections.map(s => [s.name, s]));
    const viewScale = 4; // visual-only scale to make sections readable
    const meshById: Record<string, THREE.Mesh> = {};
    const origColorById: Record<string, THREE.Color> = {};
    const handleByKey: Record<string, THREE.Mesh> = {}; // `${memberId}:start|end`

    const addMemberVisuals = (m: any) => {
      const sec = sectionMap.get(m.section);
      if (!sec) return;
      const scaledSec: any = { ...sec, dims: { ...sec.dims,
        bf: sec.dims.bf * viewScale,
        d:  sec.dims.d  * viewScale,
        tw: sec.dims.tw * viewScale,
        tf: sec.dims.tf * viewScale
      } };
      const color = m.type === 'beam' ? appearance.beamColor : appearance.columnColor; // theme color
      const isIShape = scaledSec.type === 'W' || scaledSec.type === 'S';
      const mesh = isIShape ? makeSolidISection(m as any, scaledSec as any, model.project.units, color)
                            : makeSolidBox(m as any, scaledSec as any, model.project.units, color);
      if ((mesh.material as any)?.clone) mesh.material = (mesh.material as any).clone();
      try {
        const edges = new THREE.EdgesGeometry((mesh.geometry as THREE.BufferGeometry));
        const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x666666 }));
        mesh.add(lines);
      } catch {}
      mesh.userData.memberId = m.id;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) origColorById[m.id] = mat.color.clone();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshById[m.id] = mesh;

      // Handles for start/end
      const s = new THREE.Vector3(toMeters(m.start[0], model.project.units), toMeters(m.start[1], model.project.units), toMeters(m.start[2], model.project.units));
      const e = new THREE.Vector3(toMeters(m.end[0], model.project.units), toMeters(m.end[1], model.project.units), toMeters(m.end[2], model.project.units));
      const mkHandle = (pos: THREE.Vector3, key: string) => {
        const geo = new THREE.BoxGeometry(0.15,0.15,0.15);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff5252 });
        const h = new THREE.Mesh(geo, mat);
        h.position.copy(pos);
        h.userData.handleKey = key;
        h.userData.type = 'handle';
        scene.add(h);
        handleByKey[key] = h;
      };
      mkHandle(s, `${m.id}:start`);
      mkHandle(e, `${m.id}:end`);
    };

    const removeMemberVisuals = (id: string) => {
      if (meshById[id]) { try { scene.remove(meshById[id]); } catch {} delete meshById[id]; }
      const hk1 = `${id}:start`, hk2 = `${id}:end`;
      if (handleByKey[hk1]) { try { scene.remove(handleByKey[hk1]); } catch {} delete handleByKey[hk1]; }
      if (handleByKey[hk2]) { try { scene.remove(handleByKey[hk2]); } catch {} delete handleByKey[hk2]; }
    };

    // --- Build SOLIDS + endpoint handles ---
    model.members.forEach(m => addMemberVisuals(m));
    // Axes helper for quick orientation reference
    const axes = new THREE.AxesHelper(2);
    scene.add(axes);
    // Hidden-line overlay
    const hiddenLinesGroup = new THREE.Group();
    hiddenLinesGroup.visible = false;
    scene.add(hiddenLinesGroup);
    const rebuildHiddenLines = () => {
      while (hiddenLinesGroup.children.length) hiddenLinesGroup.remove(hiddenLinesGroup.children[0]);
      Object.values(meshById).forEach(mesh => {
        try {
          const edges = new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry);
          const dashed = new THREE.LineSegments(edges, new THREE.LineDashedMaterial({
            color: 0x606060,
            dashSize: 0.2,
            gapSize: 0.2,
            transparent: true,
            opacity: 0.6,
            depthTest: false
          }));
          (dashed.geometry as any).computeLineDistances?.();
          dashed.position.copy(mesh.position);
          dashed.quaternion.copy(mesh.quaternion);
          hiddenLinesGroup.add(dashed);
        } catch {}
      });
    };

    // --- Transform Controls ---
    const tc = new TransformControls(camera, renderer.domElement);
    tc.setMode("translate");
    (tc as any).setSpace?.('world');
    if (tc instanceof THREE.Object3D) {
      scene.add(tc);
    }

    tc.addEventListener("dragging-changed", (e: any) => { orbit.enabled = !e.value; });

    // Update JSON on move (mm ↔ m handled)
    tc.addEventListener("objectChange", () => {
      const obj = tc.object as any;
      // Move grid by dragging its origin handle
      if (obj?.userData?.type === 'grid-handle') {
        const { grid, updateGrid } = useModel.getState();
        const sx = Math.max(1e-6, Math.min(...((grid.xSpacings && grid.xSpacings.length) ? grid.xSpacings : [grid.xSpacing || 1])));
        const sy = Math.max(1e-6, Math.min(...((grid.ySpacings && grid.ySpacings.length) ? grid.ySpacings : [grid.ySpacing || 1])));
        const snappedX = Math.round(obj.position.x / sx) * sx;
        const snappedY = Math.round(obj.position.y / sy) * sy;
        obj.position.set(snappedX, snappedY, obj.position.z);
        updateGrid({ origin: { x: obj.position.x, y: obj.position.y, z: obj.position.z } });
        return;
      }
      // If dragging a handle, move only that endpoint with snapping
      if (obj?.userData?.handleKey) {
        const key: string = obj.userData.handleKey;
        const [memberId, endTag] = key.split(":");
        const mm = model.members.find(m => m.id === memberId);
        if (!mm) return;
        const units = model.project.units;
        // grid snap using helper
        let p = gridSnap(obj.position.clone(), units);
        // Beams: keep Z level consistent
        if (mm.type === 'beam') {
          const baseZ = Math.min(toMeters(mm.start[2], units), toMeters(mm.end[2], units));
          p.z = baseZ;
        }
        // Columns: constrain drag to Z-axis (height only), anchor X/Y to the other endpoint
        if (mm.type === 'column') {
          const other = endTag === 'start' ? mm.end : mm.start;
          const ox = toMeters(other[0], units), oy = toMeters(other[1], units);
          p.x = ox; p.y = oy; // lock X/Y
        }
        // snap to other handles if close
        const otherHandles = Object.entries(handleByKey)
          .filter(([k]) => k !== key)
          .map(([,h]) => h);
        p = snapToEndpoints(p, otherHandles, 0.05);
        // snap to nearby member lines (project onto segment) to remove tiny gaps
        const segments: Array<[THREE.Vector3, THREE.Vector3]> = model.members.map(mm2 => [
          new THREE.Vector3(toMeters(mm2.start[0], units), toMeters(mm2.start[1], units), toMeters(mm2.start[2], units)),
          new THREE.Vector3(toMeters(mm2.end[0], units), toMeters(mm2.end[1], units), toMeters(mm2.end[2], units))
        ]);
        p = snapToLines(p, segments, 0.05);
        obj.position.copy(p);
        const toUnits = (v: number) => (units === 'mm' ? v * 1000 : units === 'm' ? v : v * 39.37007874);
        const updates: any = {};
        updates[endTag] = [toUnits(p.x), toUnits(p.y), toUnits(p.z)];
        const { updateMember } = useModel.getState();
        updateMember(mm.id, updates);
        // Rebuild this member visuals
        removeMemberVisuals(mm.id);
        addMemberVisuals({ ...mm, ...updates });
        // keep handle selected
        const hk = `${mm.id}:${endTag}`; if (handleByKey[hk]) try { tc.attach(handleByKey[hk]); } catch {}
        return;
      }

      // Otherwise: moving whole member mesh
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
      const toUnits = (v: number) => (units === 'mm' ? v * 1000 : units === 'm' ? v : v * 39.37007874);
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
      // move handles along with mesh
      const sKey = `${sel}:start`, eKey = `${sel}:end`;
      if (handleByKey[sKey]) handleByKey[sKey].position.add(deltaM);
      if (handleByKey[eKey]) handleByKey[eKey].position.add(deltaM);
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
      const mode = useModel.getState().createMode;
      if (mode && mode !== "none") {
        if (!model) return;
        // Snap to grid using helper
        const units = model.project.units;
        pos.copy(gridSnap(pos.clone(), units));

        if (!temp.startPt) {
          // Prefer snapping start to endpoints and nearby lines
          const segments: Array<[THREE.Vector3, THREE.Vector3]> = model.members.map(mm2 => [
            new THREE.Vector3(toMeters(mm2.start[0], units), toMeters(mm2.start[1], units), toMeters(mm2.start[2], units)),
            new THREE.Vector3(toMeters(mm2.end[0], units), toMeters(mm2.end[1], units), toMeters(mm2.end[2], units))
          ]);
          const snappedStart = snapToLines(
            snapToEndpoints(pos.clone(), Object.values(handleByKey), 0.1),
            segments,
            0.05
          );
          temp.startPt = snappedStart.clone();
          // preview helper: group containing start marker + dynamic ghost solid
          const markerGroup = new THREE.Group();
          const geo = new THREE.SphereGeometry(0.05);
          const mat = new THREE.MeshBasicMaterial({ color: appearance.preview });
          const startDot = new THREE.Mesh(geo, mat);
          startDot.position.copy(temp.startPt);
          markerGroup.add(startDot);
          markerGroup.name = 'preview-group';
          scene.add(markerGroup);
          temp.previewMesh = markerGroup;
          return;
        } else {
          const start = temp.startPt.clone();
          let end = pos.clone();
          // Prefer snapping end to endpoints and nearby lines
          const segments: Array<[THREE.Vector3, THREE.Vector3]> = model.members.map(mm2 => [
            new THREE.Vector3(toMeters(mm2.start[0], units), toMeters(mm2.start[1], units), toMeters(mm2.start[2], units)),
            new THREE.Vector3(toMeters(mm2.end[0], units), toMeters(mm2.end[1], units), toMeters(mm2.end[2], units))
          ]);
          end = snapToLines(
            snapToEndpoints(end.clone(), Object.values(handleByKey), 0.1),
            segments,
            0.05
          );
          // Columns are always vertical (Z-axis) with height
          if (mode === "column") {
            start.z = 0;
            end = start.clone();
            end.x = start.x;
            end.y = start.y;
            end.z = start.z + temp.defaultHeightM;
          }
          // Beams should stay on ground plane (Z=0)
          if (mode === "beam") {
            start.z = 0;
            end.z = 0;
          }
          if (!model) return;
          // convert meters -> model units
          const toUnits = (v: number) => {
            if (units === "mm") return v * 1000;
            if (units === "m") return v;
            return v * 39.37007874; // inches
          };
          // Sequential ID: B1, C1, ...
          const { getNextMemberId } = useModel.getState();
          const newId = getNextMemberId(mode as any);
          const newMember = {
            id: newId,
            type: mode === "beam" ? "beam" : "column",
            section: model.sections[0]?.name ?? "",
            start: [toUnits(start.x), toUnits(start.y), toUnits(start.z)] as any,
            end: [toUnits(end.x), toUnits(end.y), toUnits(end.z)] as any
          } as any;
          addMember(newMember);
          // create mesh and add to scene
          const sec = model.sections.find(s => s.name === newMember.section);
          if (sec) {
            addMemberVisuals(newMember);
            // Auto select and attach transform controls so user can adjust immediately
            const mesh = meshById[newId];
            if (mesh) { selectMember(newId); try { tc.attach(mesh); } catch {} }
          }
          // cleanup preview
          try { if (temp.previewMesh) scene.remove(temp.previewMesh); } catch {}
          temp.startPt = null;
          temp.previewMesh = null;
          // Exit create mode by default so user can adjust; hold Shift to continue placing
          if (!(ev as any).shiftKey) {
            const { setCreateMode } = useModel.getState();
            setCreateMode("none");
          }
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
        // Configure transform controls based on member type and units
        const mm = model?.members?.find(m => m.id === id);
        if (mm) {
          const snap = (model!.project.units === 'mm') ? 10/1000 : (model!.project.units === 'm') ? 0.1 : 1/39.37007874;
          (tc as any).setTranslationSnap?.(snap);
          if (mm.type === 'column') { tc.showX = false; tc.showY = false; tc.showZ = true; }
          else { tc.showX = true; tc.showY = true; tc.showZ = false; }
        }
      } else {
        // Check for grid handle selection first
        const ghHit = raycaster.intersectObject(gridHandle, false);
        // Also allow clicking on UCS triad parts as a proxy for the handle
        const ucsHit = raycaster.intersectObjects([gridGroup], true).find(h => (h.object as any).userData?.ucsHandle);
        if ((ghHit && ghHit.length) || ucsHit) {
          try { tc.attach(gridHandle); } catch {}
          tc.showX = true; tc.showY = true; tc.showZ = false;
          const { grid } = useModel.getState();
          const sx = Math.max(1e-6, Math.min(...((grid.xSpacings && grid.xSpacings.length) ? grid.xSpacings : [grid.xSpacing || 1])));
          const sy = Math.max(1e-6, Math.min(...((grid.ySpacings && grid.ySpacings.length) ? grid.ySpacings : [grid.ySpacing || 1])));
          (tc as any).setTranslationSnap?.(Math.min(sx, sy));
        } else {
        // Check for endpoint handle selection
        const hHit = raycaster.intersectObjects(Object.values(handleByKey), false)[0];
        if (hHit) {
          try { tc.attach(hHit.object); } catch {}
          const key = (hHit.object as any).userData?.handleKey as string | undefined;
          if (key) {
            const [mid] = key.split(':');
            const cm = model?.members?.find(m => m.id === mid);
            if (cm) {
              const snap = (model!.project.units === 'mm') ? 10/1000 : (model!.project.units === 'm') ? 0.1 : 1/39.37007874;
              (tc as any).setTranslationSnap?.(snap);
              if (cm.type === 'column') { tc.showX = false; tc.showY = false; tc.showZ = true; }
              else { tc.showX = true; tc.showY = true; tc.showZ = false; }
            }
          }
          // compute simple node info (angles)
          const p = (hHit.object as THREE.Mesh).position.clone();
          const tol = 0.05;
          const entries: Array<{id:string, angle:number}> = [];
          (model?.members ?? []).forEach(mm => {
            const s = new THREE.Vector3(toMeters(mm.start[0], model!.project.units), toMeters(mm.start[1], model!.project.units), toMeters(mm.start[2], model!.project.units));
            const e = new THREE.Vector3(toMeters(mm.end[0], model!.project.units), toMeters(mm.end[1], model!.project.units), toMeters(mm.end[2], model!.project.units));
            if (s.distanceTo(p) < tol || e.distanceTo(p) < tol) {
              const dir = new THREE.Vector3().subVectors(e, s).normalize();
              const angle = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
              entries.push({ id: mm.id, angle });
            }
          });
          setNodeInfo({ posM: { x: p.x, y: p.y, z: p.z }, entries });
        } else {
          selectMember(undefined);
          setNodeInfo(null);
          try { tc.detach(); } catch {}
        }
        }
      }
    }
    renderer.domElement.addEventListener("click", onClick);
    // Mouse move preview when in create mode
    const onMove = (ev: MouseEvent) => {
      const mode = useModel.getState().createMode;
      if (!mode || mode === "none") return;
      if (!model) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const pos = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, pos);
      // snap to grid and nearby geometry for accurate preview
      const units = model.project.units;
      pos.copy(gridSnap(pos.clone(), units));
      const segments: Array<[THREE.Vector3, THREE.Vector3]> = model.members.map(mm2 => [
        new THREE.Vector3(toMeters(mm2.start[0], units), toMeters(mm2.start[1], units), toMeters(mm2.start[2], units)),
        new THREE.Vector3(toMeters(mm2.end[0], units), toMeters(mm2.end[1], units), toMeters(mm2.end[2], units))
      ]);
      pos.copy(snapToLines(snapToEndpoints(pos.clone(), Object.values(handleByKey), 0.1), segments, 0.05));
      // For beams, keep on ground plane
      if (mode === "beam") pos.z = 0;
      // update preview marker/line and compute preview info
      if (temp.startPt) {
        try {
          const start = temp.startPt.clone();
          let previewEnd = pos.clone();
          if (mode === 'column') {
            previewEnd = start.clone();
            previewEnd.z = start.z + temp.defaultHeightM;
          }
          const dist = start.distanceTo(previewEnd);
          const angle = Math.atan2(previewEnd.y - start.y, previewEnd.x - start.x) * 180 / Math.PI;
          // update preview: line + ghost solid of current section
          if (temp.previewMesh) {
            const existingLine = temp.previewMesh.getObjectByName('preview-line') as THREE.Line | undefined;
            if (existingLine) temp.previewMesh.remove(existingLine);
            const lineGeom = new THREE.BufferGeometry().setFromPoints([start, previewEnd]);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
            const line = new THREE.Line(lineGeom, lineMat);
            line.name = 'preview-line';
            temp.previewMesh.add(line);

            const existingGhost = temp.previewMesh.getObjectByName('preview-ghost') as THREE.Mesh | undefined;
            if (existingGhost) temp.previewMesh.remove(existingGhost);
            const sec = model.sections[0];
            if (sec) {
              const dummyMember: any = {
                id: '__preview__',
                type: mode === 'beam' ? 'beam' : 'column',
                section: sec.name,
                start: [start.x, start.y, start.z],
                end: [previewEnd.x, previewEnd.y, previewEnd.z]
              };
              const memberColor = (mode === 'beam') ? appearance.beamColor : appearance.columnColor;
              const ghost = (sec.type === 'W' || sec.type === 'S')
                ? makeSolidISection(dummyMember, sec as any, 'm', memberColor)
                : makeSolidBox(dummyMember, sec as any, 'm', memberColor);
              const mat = ghost.material as THREE.MeshStandardMaterial;
              mat.transparent = true; mat.opacity = 0.5;
              ghost.name = 'preview-ghost';
              temp.previewMesh.add(ghost);
            } else {
              // Fallback ghost box with nominal dims
              const Lm = start.distanceTo(previewEnd);
              const geom = new THREE.BoxGeometry(0.1, 0.1, Lm);
              const memberColor = (mode === 'beam') ? appearance.beamColor : appearance.columnColor;
              const mat = new THREE.MeshStandardMaterial({ color: memberColor, transparent: true, opacity: 0.5 });
              const ghost = new THREE.Mesh(geom, mat);
              const forward = new THREE.Vector3().subVectors(previewEnd, start);
              const upPref = new THREE.Vector3(0,0,1);
              const f = forward.clone().normalize();
              let r = new THREE.Vector3().crossVectors(upPref, f);
              if (r.lengthSq() < 1e-12) r = new THREE.Vector3(1,0,0);
              r.normalize();
              const u = new THREE.Vector3().crossVectors(f, r).normalize();
              const mtx = new THREE.Matrix4().makeBasis(r, u, f);
              const mid = new THREE.Vector3().addVectors(start, previewEnd).multiplyScalar(0.5);
              ghost.position.copy(mid);
              ghost.setRotationFromMatrix(mtx);
              ghost.name = 'preview-ghost';
              temp.previewMesh.add(ghost);
            }
          }
          // update HUD via custom event
          window.dispatchEvent(new CustomEvent('preview:update', { detail: { distance_m: dist, angle_deg: angle } }));
        } catch (err) {}
      } else {
        // Ensure a small cursor preview is visible before first click
        try {
          if (!temp.previewMesh) {
            const grp = new THREE.Group();
            grp.name = 'preview-group';
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: appearance.preview }));
            grp.add(dot);
            scene.add(grp);
            temp.previewMesh = grp;
          }
          const dot = temp.previewMesh.children[0] as THREE.Mesh | undefined;
          if (dot) dot.position.copy(pos);
        } catch {}
        window.dispatchEvent(new CustomEvent('preview:update', { detail: null }));
      }
    };
    renderer.domElement.addEventListener('mousemove', onMove);

    // Mouse down/up for drag-style drawing
    const onMouseDown = (ev: MouseEvent) => {
      const mode = useModel.getState().createMode;
      if (!mode || mode === 'none') return;
      if (!model) return;
      isMouseDown = true;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const pos = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, pos);
      // snap
      const units = model.project.units;
      const gp2 = gridSnap(pos.clone(), units);
      pos.x = gp2.x; pos.y = gp2.y; pos.z = gp2.z;
      temp.startPt = pos.clone();
      const geo = new THREE.SphereGeometry(0.05);
      const mat = new THREE.MeshBasicMaterial({ color: mode === 'beam' ? 0x4caf50 : 0x9c27b0 });
      const marker = new THREE.Mesh(geo, mat);
      marker.position.copy(temp.startPt);
      scene.add(marker);
      temp.previewMesh = marker;
    };
    const onMouseUp = (ev: MouseEvent) => {
      const mode = useModel.getState().createMode;
      if (!mode || mode === 'none') return;
      if (!isMouseDown) return;
      isMouseDown = false;
      // reuse click finalize logic by calling onClick
      onClick(ev);
    };
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    // Keyboard controls: 'v' toggles vertical lock for columns, arrow keys adjust default height
    let viewLocked = false;
    const setViewLock = (locked: boolean) => {
      viewLocked = locked;
      orbit.enableRotate = !locked && threeDMode;
      orbit.enablePan = !locked; // allow panning in top and 3D when unlocked
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        temp.verticalLock = true;
      }
      // Quick endpoint edit: 'E' attaches gizmo to end (Shift+E → start)
      if (e.key.toLowerCase() === 'e') {
        const { selection } = useModel.getState();
        const selId = selection.selectedId;
        if (selId) {
          const attachKey = e.shiftKey ? `${selId}:start` : `${selId}:end`;
          const h = handleByKey[attachKey];
          if (h) {
            try { tc.attach(h); } catch {}
            const mm = model?.members.find(m => m.id === selId);
            if (mm) {
              const snap = (model!.project.units === 'mm') ? 10/1000 : (model!.project.units === 'm') ? 0.1 : 1/39.37007874;
              (tc as any).setTranslationSnap?.(snap);
              if (mm.type === 'column') { tc.showX = false; tc.showY = false; tc.showZ = true; }
              else { tc.showX = true; tc.showY = true; tc.showZ = false; }
            }
          }
        }
      }
      if ((e.key === 'ArrowUp' || e.key === '+') && temp.verticalLock) {
        temp.defaultHeightM = Math.min(20, temp.defaultHeightM + 0.1);
      }
      if ((e.key === 'ArrowDown' || e.key === '-') && temp.verticalLock) {
        temp.defaultHeightM = Math.max(0.1, temp.defaultHeightM - 0.1);
      }
      // Nudge attached endpoint for fine control
      if (tc.object && (tc.object as any).userData?.handleKey) {
        const key = (tc.object as any).userData.handleKey as string;
        const [memberId, endTag] = key.split(':');
        const mm = model?.members.find(m => m.id === memberId);
        if (mm) {
          const units = model.project.units;
          const snap = units === 'mm' ? 10/1000 : units === 'm' ? 0.1 : 1/39.37007874;
          const p = (tc.object as THREE.Mesh).position.clone();
          if (mm.type === 'column') {
            if (e.key === 'ArrowUp' || e.key === '+') p.z += snap;
            if (e.key === 'ArrowDown' || e.key === '-') p.z -= snap;
          } else {
            if (e.key === 'ArrowLeft') p.x -= snap;
            if (e.key === 'ArrowRight') p.x += snap;
            if (e.key === 'ArrowUp') p.y += snap;
            if (e.key === 'ArrowDown') p.y -= snap;
          }
          (tc.object as THREE.Mesh).position.copy(p);
          const toUnits = (v: number) => (units === 'mm' ? v * 1000 : units === 'm' ? v : v * 39.37007874);
          const updates: any = {}; updates[endTag] = [toUnits(p.x), toUnits(p.y), toUnits(p.z)];
          const { updateMember } = useModel.getState(); updateMember(mm.id, updates);
          removeMemberVisuals(mm.id); addMemberVisuals({ ...mm, ...updates });
        }
      }
      // Toggle 3D view with '3'
      if (e.key === '3') {
        const ev = new CustomEvent('toggle3d');
        window.dispatchEvent(ev);
      }
      // Toggle hidden-line overlay
      if (e.key.toLowerCase() === 'h') {
        hiddenLinesGroup.visible = !hiddenLinesGroup.visible;
        if (hiddenLinesGroup.visible) rebuildHiddenLines();
      }
      // Fit camera to grid
      if (e.key.toLowerCase() === 'f') {
        const ev = new CustomEvent('fitGrid');
        window.dispatchEvent(ev);
      }
      // Toggle view lock with F9
      if (e.key === 'F9') {
        setViewLock(!viewLocked);
      }
      // Fit camera to grid
      if (e.key.toLowerCase() === 'f') {
        const ev = new CustomEvent('fitGrid');
        window.dispatchEvent(ev);
      }
      // ESC to cancel create mode
      if (e.key === 'Escape') {
        temp.startPt = null;
        if (temp.previewMesh) { try { scene.remove(temp.previewMesh); } catch {} }
        temp.previewMesh = null;
        setCreateMode('none');
      }
      // Undo / Redo
      if (e.ctrlKey && (e.key.toLowerCase() === 'z')) {
        const { undo } = useModel.getState();
        undo();
      }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        const { redo } = useModel.getState();
        redo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        temp.verticalLock = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // Context menu handler must be defined here for renderer scope
    const contextMenuHandler = function(ev: MouseEvent) {
      ev.preventDefault();
      ev.stopPropagation();
      console.log('Context menu event fired');
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersections = raycaster.intersectObjects(scene.children, true);
      const hit = intersections.find(i => (i.object as any).userData?.memberId);
      const makeMenu = (items: Array<{label: string, onClick: () => void}>) => {
        const menu = document.createElement("div");
        menu.style.position = "fixed";
        menu.style.left = `${ev.clientX}px`;
        menu.style.top = `${ev.clientY}px`;
        menu.style.background = "#fff";
        menu.style.border = "1px solid #888";
        menu.style.borderRadius = "6px";
        menu.style.padding = "6px";
        menu.style.zIndex = "3000";
        menu.style.boxShadow = "0 2px 8px #aaa";
        items.forEach(it => {
          const btn = document.createElement("div");
          btn.textContent = it.label;
          btn.style.padding = "6px 12px";
          btn.style.cursor = "pointer";
          btn.onmouseenter = () => btn.style.background = '#f3f3f3';
          btn.onmouseleave = () => btn.style.background = '#fff';
          btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); try { it.onClick(); } finally { if (document.body.contains(menu)) document.body.removeChild(menu); } };
          menu.appendChild(btn);
        });
        document.body.appendChild(menu);
        setTimeout(() => {
          const close = () => { if (document.body.contains(menu)) document.body.removeChild(menu); };
          window.addEventListener('click', close, { once: true });
          window.addEventListener('contextmenu', close, { once: true });
        }, 50);
      };

      if (hit) {
        const id = (hit.object as any).userData.memberId as string;
        selectMember(id);
        makeMenu([
          { label: 'Grid Properties…', onClick: () => window.dispatchEvent(new CustomEvent('ui:openGridPanel', { detail: { x: ev.clientX, y: ev.clientY } })) },
          { label: 'Fit Grid', onClick: () => window.dispatchEvent(new CustomEvent('fitGrid')) },
          { label: 'Toggle Labels', onClick: () => { const { grid, updateGrid } = useModel.getState(); updateGrid({ showLabels: !(grid.showLabels ?? true) }); } },
          { label: 'Toggle UCS', onClick: () => { const { grid, updateGrid } = useModel.getState(); updateGrid({ showUCS: !(grid.showUCS ?? true) }); } },
          { label: '—', onClick: () => {} },
        ]);
        // Add a separate color menu under the same click
        const colors = [
          { name: "Blue", value: 0x2196f3 },
          { name: "Orange", value: 0xff9800 },
          { name: "Green", value: 0x4caf50 },
          { name: "Purple", value: 0x9c27b0 },
          { name: "Red", value: 0xf44336 },
          { name: "Gray", value: 0x607d8b }
        ];
        // Quick inline color buttons beneath system menu
        const colorMenu = document.createElement('div');
        colorMenu.style.position = 'fixed';
        colorMenu.style.left = `${ev.clientX + 160}px`;
        colorMenu.style.top = `${ev.clientY}px`;
        colorMenu.style.background = '#fff';
        colorMenu.style.border = '1px solid #888';
        colorMenu.style.borderRadius = '6px';
        colorMenu.style.padding = '6px';
        colorMenu.style.zIndex = '3000';
        colorMenu.style.boxShadow = '0 2px 8px #aaa';
        const title = document.createElement('div'); title.textContent = 'Change Color'; title.style.fontWeight = 'bold'; title.style.marginBottom = '6px'; colorMenu.appendChild(title);
        colors.forEach(c => {
          const btn = document.createElement('button');
          btn.textContent = c.name;
          btn.style.margin = '2px 6px 2px 0';
          btn.style.padding = '4px 12px';
          btn.style.border = '1px solid #bbb';
          btn.style.background = `#${c.value.toString(16).padStart(6,'0')}`;
          btn.style.color = '#fff';
          btn.style.borderRadius = '4px';
          btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const mesh = meshById[id];
            if (mesh) { const mat = mesh.material as THREE.MeshStandardMaterial; mat.color.setHex(c.value); origColorById[id] = mat.color.clone(); }
            if (document.body.contains(colorMenu)) document.body.removeChild(colorMenu);
          };
          colorMenu.appendChild(btn);
        });
        document.body.appendChild(colorMenu);
        setTimeout(() => { window.addEventListener('click', () => { if (document.body.contains(colorMenu)) document.body.removeChild(colorMenu); }, { once: true }); }, 50);
      }
      else {
        makeMenu([
          { label: 'Grid Properties…', onClick: () => window.dispatchEvent(new CustomEvent('ui:openGridPanel', { detail: { x: ev.clientX, y: ev.clientY } })) },
          { label: 'Fit Grid', onClick: () => window.dispatchEvent(new CustomEvent('fitGrid')) },
          { label: 'Toggle Labels', onClick: () => { const { grid, updateGrid } = useModel.getState(); updateGrid({ showLabels: !(grid.showLabels ?? true) }); } },
          { label: 'Toggle UCS', onClick: () => { const { grid, updateGrid } = useModel.getState(); updateGrid({ showUCS: !(grid.showUCS ?? true) }); } },
        ]);
      }
    };
    renderer.domElement.addEventListener("contextmenu", contextMenuHandler);

    // --- Loop & resize ---
    // Listen for forced render event
    const forceRender = () => { renderer.render(scene, camera); };
    window.addEventListener('forceSceneRender', forceRender);
    const animate = () => { requestAnimationFrame(animate); orbit.update(); renderer.render(scene, camera); };
    animate();

    // listen for external toggle 3D view event
    let threeDMode = false;
    const onToggle3D = () => {
      threeDMode = !threeDMode;
      if (!threeDMode) {
        // switch to top view, frame the grid, and use 2D-friendly controls
        orbit.enableRotate = false;
        orbit.enablePan = true;
        (orbit as any).mouseButtons = { LEFT: (THREE as any).MOUSE.PAN, MIDDLE: (THREE as any).MOUSE.DOLLY, RIGHT: (THREE as any).MOUSE.ROTATE };
        fitCameraToGrid();
      } else {
        // restore default position
        camera.position.set(8, -10, 6);
        camera.lookAt(0, 0, 0);
        // respect view lock
        orbit.enableRotate = true;
        orbit.enablePan = true;
        (orbit as any).mouseButtons = { LEFT: (THREE as any).MOUSE.ROTATE, MIDDLE: (THREE as any).MOUSE.DOLLY, RIGHT: (THREE as any).MOUSE.PAN };
      }
    };
    window.addEventListener('toggle3d', onToggle3D as any);
    // Fit camera to entire grid extents
    const fitCameraToGrid = () => {
      const { grid } = useModel.getState();
      const ox = grid.origin.x, oy = grid.origin.y;
      const xList = (grid.xSpacings && grid.xSpacings.length) ? grid.xSpacings : Array(Math.max(1, grid.xCount - 1)).fill(grid.xSpacing);
      const yList = (grid.ySpacings && grid.ySpacings.length) ? grid.ySpacings : Array(Math.max(1, grid.yCount - 1)).fill(grid.ySpacing);
      const width = xList.reduce((a,b)=>a+b, 0);
      const height = yList.reduce((a,b)=>a+b, 0);
      const originAtStart = grid.originAtStart ?? true;
      const left = originAtStart ? (ox - (grid.extendLeftBelow || 0)) : (ox - width/2 - (grid.extendLeftBelow || 0));
      const right = originAtStart ? (ox + width + (grid.extendRightAbove || 0)) : (ox + width/2 + (grid.extendRightAbove || 0));
      const bottom = originAtStart ? (oy - (grid.extendLeftBelow || 0)) : (oy - height/2 - (grid.extendLeftBelow || 0));
      const top = originAtStart ? (oy + height + (grid.extendRightAbove || 0)) : (oy + height/2 + (grid.extendRightAbove || 0));
      const cx = (left + right) * 0.5;
      const cy = (bottom + top) * 0.5;
      const w = Math.max(1e-3, right - left);
      const h = Math.max(1e-3, top - bottom);
      orbit.enableRotate = false;
      orbit.enablePan = true;
      camera.up.set(0,0,1);
      const fov = camera.fov * Math.PI / 180;
      const aspect = Math.max(1e-3, renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight));
      const neededHV = Math.max(h, w / aspect);
      const dist = Math.max(2, neededHV / (2 * Math.tan(fov / 2)) + 1);
      camera.position.set(cx, cy, dist);
      camera.lookAt(cx, cy, 0);
      orbit.target.set(cx, cy, 0);
    };
    const onFitGrid = () => fitCameraToGrid();
    window.addEventListener('fitGrid', onFitGrid);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // Initial top-view framing so UCS appears at bottom-left and grid centered
    fitCameraToGrid();

    // Listen for grid changes and rebuild
    const unsub = useModel.subscribe(state => {
      try { scene.remove(gridGroup); } catch {}
      gridGroup = buildGrid(state.grid, state.appearance.gridMajor, state.appearance.gridMinor);
      scene.add(gridGroup);
      // sync grid handle position
      gridHandle.position.set(state.grid.origin.x, state.grid.origin.y, state.grid.origin.z);
      // resize handle to remain easy to select
      try {
        const newSize = computeHandleSize();
        gridHandle.geometry.dispose();
        gridHandleGeo = new THREE.BoxGeometry(newSize, newSize, newSize);
        gridHandle.geometry = gridHandleGeo;
      } catch {}
      window.dispatchEvent(new CustomEvent('forceSceneRender'));
    });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('forceSceneRender', forceRender);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("contextmenu", contextMenuHandler);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('toggle3d', onToggle3D as any);
      window.removeEventListener('fitGrid', onFitGrid);
      try { scene.remove(gridGroup); } catch {}
      unsub?.();
      tc.dispose();
      orbit.dispose();
      renderer.dispose();
    };
  }, [canvasRef, model, selection.selectedId]);

  // Toggle orbit controls during create mode to prevent unintended camera rotation/pan
  React.useEffect(() => {
    if (!orbitRef.current) return;
    const o = orbitRef.current;
    // Keep pan available; only restrict rotation when drawing
    o.enableRotate = createMode === 'none';
    o.enablePan = true;
    // keep zoom enabled
    o.enableZoom = true;
  }, [createMode]);

  // HUD for create mode and node info
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
    {/* Preview HUD */}
    {previewInfo && (
      <div style={{position:'absolute', top:120, left:20, zIndex:20, background:'rgba(0,0,0,0.6)', color:'#fff', padding:'6px 10px', borderRadius:6}}>
        <div>Distance: {(() => {
          if (!model) return `${previewInfo.distance_m.toFixed(3)} m`;
          const units = model.project.units;
          if (units === 'mm') return `${(previewInfo.distance_m*1000).toFixed(0)} mm`;
          if (units === 'in') return `${(previewInfo.distance_m*39.37007874).toFixed(2)} in`;
          return `${previewInfo.distance_m.toFixed(3)} m`;
        })()}</div>
        <div>Angle: {previewInfo.angle_deg.toFixed(1)}°</div>
      </div>
    )}
    {nodeInfo && (
      <div style={{position:'absolute', top:180, left:20, zIndex:20, background:'rgba(33,33,33,0.85)', color:'#fff', padding:'8px 12px', borderRadius:6}}>
        <div style={{fontWeight:600, marginBottom:4}}>Connection</div>
        <div>Members: {nodeInfo.entries.length}</div>
        <div>Angles: {nodeInfo.entries.map(e => `${e.id}: ${e.angle.toFixed(1)}°`).join(', ')}</div>
      </div>
    )}
  </>;
}
