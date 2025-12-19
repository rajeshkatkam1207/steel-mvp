import React from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useModel } from "../store/useModel";
import { makePrismaticMesh } from "../engine/mesh";

export default function Scene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { model, selection, selectMember } = useModel();

  useEffect(() => {
    if (!canvasRef.current || !model) return;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fb);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(15, 12, 25);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    scene.add(new THREE.GridHelper(50, 50));

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 30, 20);
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const sectionMap = new Map(model.sections.map(s => [s.name, s]));
    const meshById: Record<string, THREE.Mesh> = {};

    model.members.forEach((m) => {
      const sec = sectionMap.get(m.section);
      if (!sec) return;
      const mesh = makePrismaticMesh(m, sec, model.project.units as any);
      mesh.userData.memberId = m.id;
      scene.add(mesh);
      meshById[m.id] = mesh;
    });

    const tc = new TransformControls(camera, renderer.domElement);
    tc.setMode("translate");
    scene.add(tc as unknown as THREE.Object3D);

    tc.addEventListener("objectChange", () => {
      const sel = selection.selectedId;
      if (!sel || !model) return;
      const mesh = meshById[sel];
      if (!mesh) return;

      const oldMember = model.members.find((mm) => mm.id === sel);
      if (!oldMember) return;

      const origMid = new THREE.Vector3(
        (oldMember.start[0] + oldMember.end[0]) / 2,
        (oldMember.start[1] + oldMember.end[1]) / 2,
        (oldMember.start[2] + oldMember.end[2]) / 2
      );

      const currMid = mesh.position.clone();
      const delta = new THREE.Vector3().subVectors(currMid, origMid);

      const newStart = [oldMember.start[0] + delta.x * 1000, oldMember.start[1] + delta.y * 1000, oldMember.start[2] + delta.z * 1000] as [number, number, number];
      const newEnd = [oldMember.end[0] + delta.x * 1000, oldMember.end[1] + delta.y * 1000, oldMember.end[2] + delta.z * 1000] as [number, number, number];

      const { updateMember } = useModel.getState();
      updateMember(sel, { start: newStart, end: newEnd });
    });

    function onClick(ev: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, false);
      const hit = intersects.find((i) => (i.object as any).userData?.memberId);
      if (hit) {
        const id = (hit.object as any).userData.memberId as string;
        selectMember(id);
        tc.attach(hit.object as THREE.Object3D);
      } else {
        selectMember(undefined);
        try { tc.detach(); } catch { /* ignore */ }
      }
    }

    renderer.domElement.addEventListener("click", onClick);

    const animate = () => {
      requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
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
      // dispose geometries/materials created by mesh factory if needed
    };
  }, [canvasRef, model, selection.selectedId]);

  return <canvas ref={canvasRef} style={{ width: "100vw", height: "100vh" }} />;
}
