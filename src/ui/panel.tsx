
import React, { useMemo, useState } from "react";
import { useModel } from "../store/useModel";

export default function Panel() {
  const { model, selection, updateMember, deleteMember, addMember, getNextMemberId, grid, updateGrid, appearance, updateAppearance } = useModel();
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{x:number;y:number}>({ x: 40, y: 80 });
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // Creation form state
  const [createType, setCreateType] = useState<'beam'|'column'>('beam');
  const [createSection, setCreateSection] = useState('');
  const [createMatGrade, setCreateMatGrade] = useState('A992');
  const [createStart, setCreateStart] = useState<[number,number,number]>([0,0,0]);
  const [createEnd, setCreateEnd] = useState<[number,number,number]>([0,0,6000]);
  const [createCamber, setCreateCamber] = useState('');
  const [createEndPrep, setCreateEndPrep] = useState('');

  const member = useMemo(
    () => model?.members.find(m => m.id === selection.selectedId),
    [model, selection.selectedId]
  );



  // Editing state for selected member
  const [matGrade, setMatGrade] = useState("");
  const [camber, setCamber] = useState("");
  const [endPrep, setEndPrep] = useState("");

  React.useEffect(() => {
    if (member) {
      setMatGrade(member.material?.grade ?? "");
      setCamber(member.properties?.camber?.toString() ?? "");
      setEndPrep(member.properties?.end_prep ?? "");
    }
  }, [member]);


  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<{x:number;y:number}>;
      // Clamp position to viewport to keep panel fully visible
      const px = ce.detail?.x ?? 40;
      const py = ce.detail?.y ?? 80;
      const vw = window.innerWidth, vh = window.innerHeight;
      const estW = 460, estH = 520;
      setPos({ x: Math.max(8, Math.min(vw - estW - 8, px)), y: Math.max(8, Math.min(vh - estH - 8, py)) });
      setVisible(true);
    };
    const onClose = () => setVisible(false);
    window.addEventListener('ui:openGridPanel', onOpen as EventListener);
    window.addEventListener('ui:closeGridPanel', onClose as EventListener);
    const onGlobalDown = (ev: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(ev.target as Node)) setVisible(false);
    };
    window.addEventListener('mousedown', onGlobalDown);
    window.addEventListener('keydown', (ev: KeyboardEvent) => { if (ev.key === 'Escape') setVisible(false); });
    return () => {
      window.removeEventListener('ui:openGridPanel', onOpen as EventListener);
      window.removeEventListener('ui:closeGridPanel', onClose as EventListener);
      window.removeEventListener('mousedown', onGlobalDown);
    };
  }, []);

  if (!model || !visible) return null;

  // Parse bay list helper: converts text list to inches array per current unit
  const parseBayList = (text: string, unit: string): number[] => {
    const items = text.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    const toInches = (val: number, u: string) => {
      if (u === 'mm') return val / 25.4;
      if (u === 'm') return val * 39.37007874;
      return val; // inches
    };
    const out: number[] = [];
    items.forEach(it => {
      if ((unit ?? 'in') === 'ft-in') {
        // Accept formats: 20-6, 20'6", 20 ft 6 in, or just 20
        const cleaned = it.replace(/\s+/g, '');
        const m = cleaned.match(/^(\d+)(?:[-'](\d+(?:\.\d+)?))?/);
        if (m) {
          const feet = parseFloat(m[1]);
          const inches = m[2] ? parseFloat(m[2]) : 0;
          out.push(feet * 12 + inches);
          return;
        }
        // fallback: plain inches number
        const v = parseFloat(it);
        if (!isNaN(v)) out.push(v);
      } else {
        const v = parseFloat(it);
        if (!isNaN(v)) out.push(toInches(v, unit ?? 'in'));
      }
    });
    return out;
  };

  // Inline creation form
  const handleCreate = () => {
    if (!createSection) {
      alert('Select a section');
      return;
    }
    const id = getNextMemberId(createType);
    addMember({
      id,
      type: createType,
      section: createSection,
      material: { grade: createMatGrade },
      start: createStart,
      end: createEnd,
      properties: {
        camber: createCamber ? parseFloat(createCamber) : undefined,
        end_prep: createEndPrep || undefined
      }
    });
    // Reset form
    setCreateStart([0,0,0]);
    setCreateEnd([0,0,6000]);
    setCreateCamber('');
    setCreateEndPrep('');
  };

  return (
    <div ref={panelRef} className="panel" style={{ position:'absolute', top: pos.y, left: pos.x, zIndex: 2000, maxWidth: 460 }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h3 style={{margin:0}}>Grid</h3>
        <button onClick={()=>setVisible(false)} style={{border:'1px solid #bbb', background:'#fff', borderRadius:4, cursor:'pointer'}}>×</button>
      </div>
      <div style={{borderBottom:'1px solid #ccc',marginBottom:8,paddingBottom:8}}>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <label>Origin</label>
          {(['x','y','z'] as const).map((k,i)=>(
            <input key={k} type="number" value={(grid.origin as any)[k]} onChange={e=>{
              const v = parseFloat(e.target.value||'0');
              updateGrid({ origin: { ...grid.origin, [k]: v } });
            }} style={{width:60}} />
          ))}
        </div>
        <div style={{marginTop:4, fontSize:12, opacity:0.7}}>
          When bays are set, lines = bays + 1. Counts apply only if bay lists are empty.
        </div>
        {/* Non-uniform bays */}
        <div style={{marginTop:6}}>
          <label>X Bays ({grid.spacingUnit ?? 'in'})</label>
          <input type="text" placeholder={grid.spacingUnit === 'ft-in' ? 'e.g. 20-0, 15-0, 10-6' : 'e.g. 500, 400, 250'}
                 defaultValue={(grid.xSpacings ?? []).join(', ')}
                 onBlur={e=>{
                   const arr = parseBayList(e.target.value, grid.spacingUnit ?? 'in');
                   updateGrid({ xSpacings: arr });
                 }} style={{width:260, marginLeft:8}} />
        </div>
        <div style={{marginTop:6}}>
          <label>Y Bays ({grid.spacingUnit ?? 'in'})</label>
          <input type="text" placeholder={grid.spacingUnit === 'ft-in' ? 'e.g. 20-0, 15-0, 10-6' : 'e.g. 500, 400, 250'}
                 defaultValue={(grid.ySpacings ?? []).join(', ')}
                 onBlur={e=>{
                   const arr = parseBayList(e.target.value, grid.spacingUnit ?? 'in');
                   updateGrid({ ySpacings: arr });
                 }} style={{width:260, marginLeft:8}} />
        </div>
        <div style={{marginTop:6, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <label>X Count</label>
          <input type="number" value={grid.xCount} onChange={e=>updateGrid({ xCount: Math.max(1, parseInt(e.target.value||'1')) })} style={{width:60}} />
          <label>Spacing Unit</label>
          <select value={grid.spacingUnit ?? 'in'} onChange={e=>updateGrid({ spacingUnit: e.target.value as any })}>
            <option value="in">in</option>
            <option value="mm">mm</option>
            <option value="m">m</option>
            <option value="ft-in">ft-in</option>
          </select>
          {grid.spacingUnit === 'ft-in' ? (
            <>
              <label>Feet</label>
              <input type="number" value={grid.xFeet ?? 0} onChange={e=>{
                const feet = Math.max(0, parseFloat(e.target.value||'0'));
                const inchesTotal = feet*12 + (grid.xInches ?? 0);
                updateGrid({ xFeet: feet, xSpacing: inchesTotal });
              }} style={{width:60}} />
              <label>Inches</label>
              <input type="number" value={grid.xInches ?? 0} onChange={e=>{
                const inches = Math.max(0, parseFloat(e.target.value||'0'));
                const inchesTotal = (grid.xFeet ?? 0)*12 + inches;
                updateGrid({ xInches: inches, xSpacing: inchesTotal });
              }} style={{width:60}} />
            </>
          ) : (
            <>
              <label>Spacing</label>
              <input type="number" value={(() => {
                const v = grid.xSpacing;
                if ((grid.spacingUnit ?? 'in') === 'mm') return (v * 25.4);
                if ((grid.spacingUnit ?? 'in') === 'm') return (v / 39.37007874);
                return v; // inches
              })()} onChange={e=>{
                const val = Math.max(0, parseFloat(e.target.value||'0'));
                let inches = val;
                if ((grid.spacingUnit ?? 'in') === 'mm') inches = val/25.4;
                if ((grid.spacingUnit ?? 'in') === 'm') inches = val*39.37007874;
                updateGrid({ xSpacing: inches });
              }} style={{width:80}} />
              <span style={{opacity:0.7}}>({grid.spacingUnit ?? 'in'})</span>
            </>
          )}
        </div>
        <div style={{marginTop:6, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <label>Y Count</label>
          <input type="number" value={grid.yCount} onChange={e=>updateGrid({ yCount: Math.max(1, parseInt(e.target.value||'1')) })} style={{width:60}} />
          <label>Spacing Unit</label>
          <select value={grid.spacingUnit ?? 'in'} onChange={e=>updateGrid({ spacingUnit: e.target.value as any })}>
            <option value="in">in</option>
            <option value="mm">mm</option>
            <option value="m">m</option>
            <option value="ft-in">ft-in</option>
          </select>
          {grid.spacingUnit === 'ft-in' ? (
            <>
              <label>Feet</label>
              <input type="number" value={grid.yFeet ?? 0} onChange={e=>{
                const feet = Math.max(0, parseFloat(e.target.value||'0'));
                const inchesTotal = feet*12 + (grid.yInches ?? 0);
                updateGrid({ yFeet: feet, ySpacing: inchesTotal });
              }} style={{width:60}} />
              <label>Inches</label>
              <input type="number" value={grid.yInches ?? 0} onChange={e=>{
                const inches = Math.max(0, parseFloat(e.target.value||'0'));
                const inchesTotal = (grid.yFeet ?? 0)*12 + inches;
                updateGrid({ yInches: inches, ySpacing: inchesTotal });
              }} style={{width:60}} />
            </>
          ) : (
            <>
              <label>Spacing</label>
              <input type="number" value={(() => {
                const v = grid.ySpacing;
                if ((grid.spacingUnit ?? 'in') === 'mm') return (v * 25.4);
                if ((grid.spacingUnit ?? 'in') === 'm') return (v / 39.37007874);
                return v; // inches
              })()} onChange={e=>{
                const val = Math.max(0, parseFloat(e.target.value||'0'));
                let inches = val;
                if ((grid.spacingUnit ?? 'in') === 'mm') inches = val/25.4;
                if ((grid.spacingUnit ?? 'in') === 'm') inches = val*39.37007874;
                updateGrid({ ySpacing: inches });
              }} style={{width:80}} />
              <span style={{opacity:0.7}}>({grid.spacingUnit ?? 'in'})</span>
            </>
          )}
        </div>
        <div style={{marginTop:6, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
          <label>Style</label>
          <select value={grid.lineStyle ?? (grid.dashed ? 'dashed' : 'solid')} onChange={e=>updateGrid({ lineStyle: e.target.value as any })}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dots">Dots</option>
          </select>
          { (grid.lineStyle ?? 'solid') === 'dashed' && (
            <>
              <label style={{marginLeft:12}}>Dash</label>
              <input type="number" step={0.01} min={0.01} max={0.5} value={grid.dashSizeRatio ?? 0.08} onChange={e=>updateGrid({ dashSizeRatio: Math.min(0.5, Math.max(0.01, parseFloat(e.target.value||'0.08'))) })} style={{width:70}} />
              <label>Gap</label>
              <input type="number" step={0.01} min={0.01} max={0.5} value={grid.dashGapRatio ?? 0.08} onChange={e=>updateGrid({ dashGapRatio: Math.min(0.5, Math.max(0.01, parseFloat(e.target.value||'0.08'))) })} style={{width:70}} />
              <span style={{opacity:0.7}}>% of spacing</span>
            </>
          )}
          <label style={{marginLeft:12}}>Show UCS</label>
          <input type="checkbox" checked={grid.showUCS ?? true} onChange={e=>updateGrid({ showUCS: e.target.checked })} />
          <label>UCS Origin</label>
          <select value={(grid.ucsAtStart ?? true) ? 'start' : 'center'} onChange={e=>updateGrid({ ucsAtStart: e.target.value === 'start' })}>
            <option value="start">Start (bottom-left)</option>
            <option value="center">Center</option>
          </select>
          <label style={{marginLeft:12}}>Grid Origin</label>
          <select value={(grid.originAtStart ?? true) ? 'start' : 'center'} onChange={e=>updateGrid({ originAtStart: e.target.value === 'start' })}>
            <option value="start">Start (bottom-left)</option>
            <option value="center">Center</option>
          </select>
          <label style={{marginLeft:12}}>Major every X</label>
          <input type="number" min={0} step={1} value={grid.majorEveryX ?? 0} onChange={e=>updateGrid({ majorEveryX: Math.max(0, parseInt(e.target.value||'0',10)) })} style={{width:70}} />
          <label>Major every Y</label>
          <input type="number" min={0} step={1} value={grid.majorEveryY ?? 0} onChange={e=>updateGrid({ majorEveryY: Math.max(0, parseInt(e.target.value||'0',10)) })} style={{width:70}} />
          <label style={{marginLeft:12}}>Labels X</label>
          <select value={grid.labelX} onChange={e=>updateGrid({ labelX: e.target.value as any })}>
            <option value="letters">A,B,C…</option>
            <option value="numbers">1,2,3…</option>
            <option value="custom">Custom</option>
          </select>
          {grid.labelX === 'custom' && (
            <>
              <label>Custom X</label>
              <input style={{width:180}} placeholder="A,B,C,D" value={(grid.labelsX ?? []).join(',')} onChange={e=>{
                const arr = e.target.value.split(',').map(s=>s.trim()).filter(s=>s.length>0);
                updateGrid({ labelsX: arr });
              }} />
            </>
          )}
          <label style={{marginLeft:12}}>Labels Y</label>
          <select value={grid.labelY} onChange={e=>updateGrid({ labelY: e.target.value as any })}>
            <option value="numbers">1,2,3…</option>
            <option value="letters">A,B,C…</option>
            <option value="custom">Custom</option>
          </select>
          {grid.labelY === 'custom' && (
            <>
              <label>Custom Y</label>
              <input style={{width:180}} placeholder="1,2,3,4" value={(grid.labelsY ?? []).join(',')} onChange={e=>{
                const arr = e.target.value.split(',').map(s=>s.trim()).filter(s=>s.length>0);
                updateGrid({ labelsY: arr });
              }} />
            </>
          )}
          <label style={{marginLeft:12}}>Show Labels</label>
          <input type="checkbox" checked={grid.showLabels ?? true} onChange={e=>updateGrid({ showLabels: e.target.checked })} />
        </div>
        <div style={{marginTop:6, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <label>Extend Left/Below</label>
          <input type="number" value={grid.extendLeftBelow ?? 0} onChange={e=>updateGrid({ extendLeftBelow: Math.max(0, parseFloat(e.target.value||'0')) })} style={{width:80}} />
          <label>Extend Right/Above</label>
          <input type="number" value={grid.extendRightAbove ?? 0} onChange={e=>updateGrid({ extendRightAbove: Math.max(0, parseFloat(e.target.value||'0')) })} style={{width:80}} />
          <button style={{marginLeft:12}} onClick={()=>{
            const ev = new CustomEvent('fitGrid');
            window.dispatchEvent(ev);
          }}>Fit Grid</button>
        </div>
        <div style={{marginTop:6, display:'flex', gap:10, alignItems:'center'}}>
          <label>Beam Color</label>
          <input type="color" value={`#${appearance.beamColor.toString(16).padStart(6,'0')}`} onChange={e=>updateAppearance({ beamColor: parseInt(e.target.value.slice(1),16) })} />
          <label>Column Color</label>
          <input type="color" value={`#${appearance.columnColor.toString(16).padStart(6,'0')}`} onChange={e=>updateAppearance({ columnColor: parseInt(e.target.value.slice(1),16) })} />
          <label>Grid Major</label>
          <input type="color" value={`#${appearance.gridMajor.toString(16).padStart(6,'0')}`} onChange={e=>updateAppearance({ gridMajor: parseInt(e.target.value.slice(1),16) })} />
          <label>Grid Minor</label>
          <input type="color" value={`#${appearance.gridMinor.toString(16).padStart(6,'0')}`} onChange={e=>updateAppearance({ gridMinor: parseInt(e.target.value.slice(1),16) })} />
        </div>
      </div>
      <h3 style={{marginTop:12}}>Grid-Only Mode</h3>
      <div style={{opacity:0.7}}>Member creation and editing are temporarily hidden.</div>
    </div>
  );
}
