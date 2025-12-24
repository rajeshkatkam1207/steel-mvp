
// src/ui/Topbar.tsx
import React from "react";
import { useModel } from "../store/useModel";
import { importJson, exportJson } from "../utils/fileio";

export default function Topbar() {
  const { loadModel, model, createModel } = useModel();
  const { createMode, setCreateMode } = useModel();
  const [projAction, setProjAction] = React.useState<string>("");

  const MenuItem = ({ label, active }: {label: string; active?: boolean}) => (
    <div style={{
      padding: '8px 12px',
      fontWeight: 600,
      color: active ? '#222' : '#555',
      borderBottom: active ? '3px solid #1976d2' : '3px solid transparent'
    }}>{label}</div>
  );

  const RibbonButton = ({ label, onClick, disabled, children }:
    {label: string; onClick?: () => void; disabled?: boolean; children?: React.ReactNode}) => (
    <button onClick={onClick} disabled={disabled} title={label}
      style={{
        display:'inline-flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        width:90, height:70, marginRight:8, border:'1px solid #cfd8dc', borderRadius:6,
        background:'#fff', boxShadow:'0 1px 2px rgba(0,0,0,0.08)'
      }}>
      {children}
      <div style={{fontSize:12, marginTop:6}}>{label}</div>
    </button>
  );

  return (
    <div className="topbar" style={{position:'fixed', top:0, left:0, right:0, zIndex:100}}>
      {/* Primary menu bar (Tekla-like) */}
      <div style={{display:'flex', alignItems:'center', background:'#eceff1', borderBottom:'1px solid #cfd8dc'}}>
        <MenuItem label="STEEL" active />
        <MenuItem label="CONCRETE" />
        <MenuItem label="EDIT" />
        <MenuItem label="VIEW" />
        <MenuItem label="DRAWINGS & REPORTS" />
        <MenuItem label="MANAGE" />
        <MenuItem label="ANALYSIS & DESIGN" />
        <div style={{flex:1}} />
        {/* Project actions on the right */}
        <label style={{ marginRight: 12, display:'flex', alignItems:'center' }}>
          <span style={{marginRight:6, color:'#333'}}>Project</span>
          <select value={projAction} onChange={e => {
          const v = e.target.value; setProjAction("");
          if (v === 'open') return (document.getElementById('file-input') as HTMLInputElement)?.click();
          if (v === 'save' && model) {
            // ask for filename and extension
            const name = window.prompt('Filename (include extension .json or .ifc)', `${model.project.name}.json`) || `${model.project.name}.json`;
            const lower = name.toLowerCase();
            if (!lower.endsWith('.json') && !lower.endsWith('.ifc')) {
              alert('Please use a .json or .ifc extension; saving as .json');
            }
            // For now, export JSON only. If user chose .ifc, save JSON with .ifc name (IFC export not yet implemented).
            exportJson(model, name.endsWith('.ifc') ? `${name}` : name);
            return;
          }
          if (v === 'new') {
            if (model) {
              const save = window.confirm('Save current project before creating a new one?');
              if (save) {
                const name = window.prompt('Filename (include extension .json or .ifc)', `${model.project.name}.json`) || `${model.project.name}.json`;
                exportJson(model, name);
              }
            }
            return createModel && createModel('New Project');
          }
        }} style={{ marginLeft: 6 }}>
          <option value="">Select</option>
          <option value="new">New Project</option>
          <option value="open">Open Project...</option>
          <option value="save">Save Project</option>
          </select>
        </label>
      <input id="file-input" type="file" accept="application/json" style={{display:'none'}}
             onChange={async e => {
               const file = e.target.files?.[0];
               if (!file) return;
               try {
                 const m = await importJson(file);
                 loadModel(m);
               } catch (err: any) {
                 alert("Invalid JSON: " + err.message);
               }
             }} />
      </div>

      {/* Ribbon with steel tools */}
      <div style={{display:'flex', alignItems:'center', padding:'8px 12px', background:'#f7f9fa', borderBottom:'1px solid #e0e0e0'}}>
        <RibbonButton label="Beam" onClick={() => setCreateMode('beam')}>
          <svg width="40" height="18" viewBox="0 0 40 18" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="7" width="36" height="4" fill="#FFC107" rx="1" />
          </svg>
        </RibbonButton>
        <RibbonButton label="Column" onClick={() => setCreateMode('column')}>
          <svg width="20" height="36" viewBox="0 0 20 36" xmlns="http://www.w3.org/2000/svg">
            <rect x="7" y="2" width="6" height="30" fill="#FFC107" rx="1" />
          </svg>
        </RibbonButton>
        <RibbonButton label="Plate" disabled>
          <svg width="40" height="18" viewBox="0 0 40 18" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="4" width="28" height="10" fill="#b0bec5" rx="2" />
          </svg>
        </RibbonButton>
        <RibbonButton label="Bolt" disabled>
          <svg width="32" height="24" viewBox="0 0 32 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="5" fill="#78909c" />
            <rect x="17" y="10" width="10" height="4" fill="#90a4ae" />
          </svg>
        </RibbonButton>
        <RibbonButton label="Weld" disabled>
          <svg width="32" height="24" viewBox="0 0 32 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 12 L28 12" stroke="#90a4ae" strokeWidth="3" />
          </svg>
        </RibbonButton>
      </div>
    </div>
  );
}
