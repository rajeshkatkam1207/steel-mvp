
// src/ui/Topbar.tsx
import React from "react";
import { useModel } from "../store/useModel";
import { importJson, exportJson } from "../utils/fileio";

export default function Topbar() {
  const { loadModel, model, renderMode, setRenderMode } = useModel();
  const { createMode, setCreateMode } = useModel();

  return (
    <div className="topbar">
      <input type="file" accept="application/json"
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
      {model && <button onClick={() => exportJson(model)}>Export JSON</button>}

      <label style={{ marginLeft: 8 }}>
        Render:
        <select
          value={renderMode}
          onChange={e => setRenderMode(e.target.value as any)}
          style={{ marginLeft: 6 }}
        >
          <option value="box">Box</option>
          <option value="i">I‑section</option>
        </select>
      </label>

      <label style={{ marginLeft: 12 }}>
        Create:
        <select value={createMode} onChange={e => setCreateMode(e.target.value as any)} style={{ marginLeft: 6 }}>
          <option value="none">None</option>
          <option value="beam">Beam</option>
          <option value="column">Column</option>
        </select>
      </label>
    </div>
  );
}
