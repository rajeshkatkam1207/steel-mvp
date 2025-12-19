import React from "react";
import { useModel } from "../store/useModel";
import { useMemo } from "react";

export default function Panel() {
  const { model, selection, updateMember } = useModel();
  const member = useMemo(
    () => model?.members.find(m => m.id === selection.selectedId),
    [model, selection.selectedId]
  );

  if (!model || !member) return <div className="panel">Select a member</div>;

  const onCoordChange = (idx: number, se: "start"|"end", val: string) => {
    const arr = [...(member as any)[se]];
    arr[idx] = parseFloat(val);
    updateMember(member.id, { [se]: arr } as any);
  };

  const onSectionChange = (name: string) => updateMember(member.id, { section: name });

  return (
    <div className="panel">
      <h3>{member.id} · {member.type}</h3>
      <div>
        <label>Section</label>
        <select value={member.section} onChange={e => onSectionChange(e.target.value)}>
          {model.sections.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
               </select>
      </div>

      <div className="grid">
        {["start","end"].map(se => (
          <div key={se}>
            <strong>{se.toUpperCase()}</strong>
            {[0,1,2].map(i => (
              <input key={i}
                     type="number"
                     value={(member as any)[se][i]}
                     onChange={e => onCoordChange(i, se as any, e.target.value)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
  }
