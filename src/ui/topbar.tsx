import React from "react";
import { useModel } from "../store/useModel";
import { importJson, exportJson } from "../utils/fileio";

export default function Topbar() {
  const { loadModel, model } = useModel();

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
    </div>
  );
}
``
