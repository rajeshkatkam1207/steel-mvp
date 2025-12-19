
import { create } from "zustand";
import type { Model, Member, Section } from "../engine/schema";

type SelectionState = { selectedId?: string; };

type ModelState = {
  model?: Model;
  selection: SelectionState;
  loadModel: (m: Model) => void;
  selectMember: (id?: string) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  addMember: (m: Member) => void;
  deleteMember: (id: string) => void;
  upsertSection: (s: Section) => void;
};

export const useModel = create<ModelState>((set, get) => ({
  model: undefined,
  selection: { selectedId: undefined },

  loadModel: (m) => set({ model: m }),
  selectMember: (id) => set({ selection: { selectedId: id } }),

  updateMember: (id, patch) => set(state => {
    if (!state.model) return state;
    const members = state.model.members.map(m => m.id === id ? { ...m, ...patch } : m);
    return { model: { ...state.model, members } };
  }),

  addMember: (m) => set(state => {
    if (!state.model) return state;
    return { model: { ...state.model, members: [...state.model.members, m] } };
  }),

  deleteMember: (id) => set(state => {
    if (!state.model) return state;
    return { model: { ...state.model, members: state.model.members.filter(m => m.id !== id) } };
  }),

  upsertSection: (s) => set(state => {
    if (!state.model) return state;
    const ix = state.model.sections.findIndex(x => x.name === s.name);
    const sections = [...state.model.sections];
    if (ix >= 0) sections[ix] = s; else sections.push(s);
    return { model: { ...state.model, sections } };
  })
}));
``
