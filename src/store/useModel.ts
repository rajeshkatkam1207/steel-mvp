
// src/store/useModel.ts
import { create } from "zustand";
import type { Model, Member, Section } from "../engine/schema";

export type RenderMode = "box" | "i";

type SelectionState = { selectedId?: string; };

type ModelState = {
  model?: Model;
  selection: SelectionState;
  renderMode: RenderMode;
  setRenderMode: (m: RenderMode) => void;
  createMode: "none" | "beam" | "column";
  setCreateMode: (m: "none" | "beam" | "column") => void;

  loadModel: (m: Model) => void;
  selectMember: (id?: string) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  addMember: (m: Member) => void;
  deleteMember: (id: string) => void;
  upsertSection: (s: Section) => void;

  getNextMemberId: (type: "beam" | "column") => string;
};

export const useModel = create<ModelState>((set, get) => ({
  model: undefined,
  selection: { selectedId: undefined },
  renderMode: "box",
  setRenderMode: (m) => set({ renderMode: m }),
  createMode: "none",
  setCreateMode: (m) => set({ createMode: m }),

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

  getNextMemberId: (type) => {
    const state = get();
    if (!state.model) return type === "beam" ? "B1" : "C1";
    const prefix = type === "beam" ? "B" : "C";
    const nums = state.model.members
      .filter(m => m.type === type && m.id.startsWith(prefix))
      .map(m => parseInt(m.id.slice(prefix.length), 10))
      .filter(n => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `${prefix}${next}`;
  },

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
