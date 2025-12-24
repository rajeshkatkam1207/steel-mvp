import * as THREE from "three";
import { GridSettings } from "../store/useModel";

function makeLabelSprite(text: string, color: string = "#ffffff", bg: string = "rgba(0,0,0,0.6)") {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.fillStyle = bg; ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.fillStyle = color; ctx.font = "bold 56px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width/2, canvas.height/2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(2.2, 1.1, 1);
  spr.renderOrder = 9999;
  return spr;
}

export function buildGrid(settings: GridSettings, colorMajor: number, colorMinor: number): THREE.Group {
  const g = new THREE.Group();
  const { origin, xCount, yCount, xSpacing, ySpacing, dashed, lineStyle, labelX, labelY, labelsX, labelsY, extendLeftBelow = 0, extendRightAbove = 0 } = settings;
  const cx = origin.x, cy = origin.y, oz = origin.z;
  const xList = (settings.xSpacings && settings.xSpacings.length > 0) ? settings.xSpacings : Array(Math.max(1, xCount - 1)).fill(xSpacing);
  const yList = (settings.ySpacings && settings.ySpacings.length > 0) ? settings.ySpacings : Array(Math.max(1, yCount - 1)).fill(ySpacing);
  const width = xList.reduce((a,b)=>a+b, 0);
  const height = yList.reduce((a,b)=>a+b, 0);
  const originAtStart = settings.originAtStart ?? true;
  const blx = originAtStart ? cx : (cx - width / 2); // bottom-left X
  const bly = originAtStart ? cy : (cy - height / 2); // bottom-left Y

  const style = lineStyle ?? (dashed ? 'dashed' : 'solid');
  const avgSpacing = Math.max(1e-3, (width + height) / (xList.length + yList.length || 1));
  const dashSize = avgSpacing * (settings.dashSizeRatio ?? 0.08);
  const gapSize = avgSpacing * (settings.dashGapRatio ?? 0.08);

  const makeDotsLine = (p1: THREE.Vector3, p2: THREE.Vector3, color: number, stepInches: number) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len <= 1e-6) return null;
    dir.normalize();
    const step = Math.max(0.5, stepInches); // step in world units (inches)
    const count = Math.max(2, Math.floor(len / step));
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) * len;
      const pt = new THREE.Vector3().copy(p1).addScaledVector(dir, t);
      positions[i*3+0] = pt.x; positions[i*3+1] = pt.y; positions[i*3+2] = pt.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 3, sizeAttenuation: false });
    return new THREE.Points(geo, mat);
  };

  // vertical lines (X index) with above/below extensions
  // Vertical grid lines: number of lines = bays + 1
  for (let i = 0; i <= xList.length; i++) {
    const x = blx + xList.slice(0, i).reduce((a,b)=>a+b, 0);
    const pts = [
      new THREE.Vector3(x, bly - extendLeftBelow, oz),
      new THREE.Vector3(x, bly + height + extendRightAbove, oz)
    ];
    const isMajor = (settings.majorEveryX ?? 0) > 0 ? (i % (settings.majorEveryX as number) === 0) : false;
    const lineColor = isMajor ? colorMajor : colorMinor;
    if (style === 'dots') {
      const dots = makeDotsLine(pts[0], pts[1], lineColor, Math.max(...yList, ySpacing) * 0.1);
      if (dots) g.add(dots);
    } else if (style === 'dashed') {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({ color: lineColor, dashSize, gapSize });
      const line = new THREE.Line(geo, mat as any);
      (line as any).computeLineDistances?.();
      g.add(line);
    } else {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: lineColor });
      const line = new THREE.Line(geo, mat as any);
      g.add(line);
    }
  }

  // horizontal lines (Y index) with left/right extensions
  // Horizontal grid lines: number of lines = bays + 1
  for (let j = 0; j <= yList.length; j++) {
    const y = bly + yList.slice(0, j).reduce((a,b)=>a+b, 0);
    const pts = [
      new THREE.Vector3(blx - extendLeftBelow, y, oz),
      new THREE.Vector3(blx + width + extendRightAbove, y, oz)
    ];
    const isMajor = (settings.majorEveryY ?? 0) > 0 ? (j % (settings.majorEveryY as number) === 0) : false;
    const lineColor = isMajor ? colorMajor : colorMinor;
    if (style === 'dots') {
      const dots = makeDotsLine(pts[0], pts[1], lineColor, Math.max(...xList, xSpacing) * 0.1);
      if (dots) g.add(dots);
    } else if (style === 'dashed') {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({ color: lineColor, dashSize, gapSize });
      const line = new THREE.Line(geo, mat as any);
      (line as any).computeLineDistances?.();
      g.add(line);
    } else {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: lineColor });
      const line = new THREE.Line(geo, mat as any);
      g.add(line);
    }
  }

  // Per-line labels: Horizontal (top) numbers, Vertical (left) letters
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const makeLetter = (idx: number) => {
    let n = idx;
    let s = "";
    do { s = alphabet[n % 26] + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  };
  // X-line labels (top)
  if (settings.showLabels ?? true) {
  for (let i = 0; i <= xList.length; i++) {
    const x = blx + xList.slice(0, i).reduce((a,b)=>a+b, 0);
    let text: string;
    if ((settings.labelX ?? 'letters') === 'custom' && settings.labelsX && settings.labelsX[i]) text = settings.labelsX[i]!;
    else if ((settings.labelX ?? 'letters') === 'letters') text = makeLetter(i);
    else text = `${i+1}`;
    const spr = makeLabelSprite(text);
    spr.position.set(x, bly + height + extendRightAbove + (Math.max(...yList, ySpacing) * 0.08), oz);
    g.add(spr);
  }
  // Y-line labels (left)
  for (let j = 0; j <= yList.length; j++) {
    const y = bly + yList.slice(0, j).reduce((a,b)=>a+b, 0);
    let text: string;
    if ((settings.labelY ?? 'numbers') === 'custom' && settings.labelsY && settings.labelsY[j]) text = settings.labelsY[j]!;
    else if ((settings.labelY ?? 'numbers') === 'letters') text = makeLetter(j);
    else text = `${j+1}`;
    const spr = makeLabelSprite(text);
    spr.position.set(blx - extendLeftBelow - (Math.max(...xList, xSpacing) * 0.08), y, oz);
    g.add(spr);
  }
  }

  // No border lines (per request)

  // UCS axis triad at origin
  if (settings.showUCS ?? true) {
    const ucsX = (settings.ucsAtStart ?? true) ? blx : cx;
    const ucsY = (settings.ucsAtStart ?? true) ? bly : cy;
    const ucsOrigin = new THREE.Vector3(ucsX, ucsY, oz);
    const axisGroup = new THREE.Group();
    (axisGroup as any).userData = { ...(axisGroup as any).userData, ucsHandle: true };
    const len = Math.max(6, Math.min(18, Math.min(width, height) * 0.08));

    const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), ucsOrigin, len, 0xff0000, len*0.2, len*0.08);
    (xArrow as any).userData = { ucsHandle: true };
    const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), ucsOrigin, len, 0x00ff00, len*0.2, len*0.08);
    (yArrow as any).userData = { ucsHandle: true };
    const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), ucsOrigin, len*0.6, 0x0000ff, len*0.2, len*0.08);
    (zArrow as any).userData = { ucsHandle: true };
    axisGroup.add(xArrow); axisGroup.add(yArrow); axisGroup.add(zArrow);

    const sx = makeLabelSprite("X", "#ffffff", "rgba(255,0,0,0.6)");
    const sy = makeLabelSprite("Y", "#ffffff", "rgba(0,255,0,0.6)");
    const sz = makeLabelSprite("Z", "#ffffff", "rgba(0,0,255,0.6)");
    (sx as any).userData = { ucsHandle: true };
    (sy as any).userData = { ucsHandle: true };
    (sz as any).userData = { ucsHandle: true };
    sx.position.copy(ucsOrigin).add(new THREE.Vector3(len + 6, 0, 0));
    sy.position.copy(ucsOrigin).add(new THREE.Vector3(0, len + 6, 0));
    sz.position.copy(ucsOrigin).add(new THREE.Vector3(0, 0, len + 6));
    axisGroup.add(sx); axisGroup.add(sy); axisGroup.add(sz);

    g.add(axisGroup);
  }

  return g;
}
