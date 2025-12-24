
// src/store/useModel.ts
import { create } from "zustand";
import type { Model, Member, Section } from "../engine/schema";

export type Appearance = {
  beamColor: number;
  columnColor: number;
  gridMajor: number;
  gridMinor: number;
  hiddenLine: number;
  preview: number;
};

export type GridSettings = {
  origin: { x: number; y: number; z: number };
  xCount: number; // number of vertical grid lines
  yCount: number; // number of horizontal grid lines
  xSpacing: number; // spacing in project units
  ySpacing: number; // spacing in project units
  xSpacings?: number[]; // per-bay spacing (inches)
  ySpacings?: number[]; // per-bay spacing (inches)
  dashed: boolean;
  lineStyle?: 'solid' | 'dashed' | 'dots';
  dashSizeRatio?: number; // relative to avg spacing (0.01..0.5)
  dashGapRatio?: number; // relative to avg spacing (0.01..0.5)
  majorEveryX?: number; // color every Nth vertical line as Major (0=off)
  majorEveryY?: number; // color every Nth horizontal line as Major (0=off)
  showUCS?: boolean; // show axis triad at UCS origin
  ucsAtStart?: boolean; // place UCS origin at grid start (bottom-left)
  originAtStart?: boolean; // interpret `origin` as grid start (bottom-left) instead of center
  labelX: 'numbers' | 'letters' | 'custom';
  labelY: 'numbers' | 'letters' | 'custom';
  labelsX?: string[];
  labelsY?: string[];
  showLabels?: boolean;
  extendLeftBelow?: number; // extension length to left/below (units)
  extendRightAbove?: number; // extension length to right/above (units)
  spacingUnit?: 'in' | 'mm' | 'm' | 'ft-in';
  xFeet?: number;
  xInches?: number;
  yFeet?: number;
  yInches?: number;
};

export type RenderMode = "box" | "i";

type SelectionState = { selectedId?: string; };

type ModelState = {
  model?: Model;
  selection: SelectionState;
  renderMode: RenderMode;
  setRenderMode: (m: RenderMode) => void;
  appearance: Appearance;
  updateAppearance: (patch: Partial<Appearance>) => void;
  grid: GridSettings;
  updateGrid: (patch: Partial<GridSettings>) => void;
  createMode: "none" | "beam" | "column";
  setCreateMode: (m: "none" | "beam" | "column") => void;

  loadModel: (m: Model) => void;
  selectMember: (id?: string) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  addMember: (m: Member) => void;
  deleteMember: (id: string) => void;
  renameMember: (oldId: string, newId: string) => void;
  upsertSection: (s: Section) => void;

  getNextMemberId: (type: "beam" | "column") => string;
  createModel: (name?: string) => void;

  // History for undo/redo
  history: Model[];
  future: Model[];
  undo: () => void;
  redo: () => void;
};

export const useModel = create<ModelState>((set, get) => ({
  model: undefined,
  selection: { selectedId: undefined },
  renderMode: "box",
  setRenderMode: (m) => set({ renderMode: m }),
  appearance: {
    beamColor: 0xFFC107,
    columnColor: 0xFFC107,
    gridMajor: 0x999999,
    gridMinor: 0xDDDDDD,
    hiddenLine: 0x606060,
    preview: 0x1976d2
  },
  updateAppearance: (patch) => set(state => ({ appearance: { ...state.appearance, ...patch } })),
  grid: {
    origin: { x: 0, y: 0, z: 0 },
    xCount: 4,
    yCount: 4,
    xSpacing: 240, // default bay = 20 ft (inches)
    ySpacing: 240,
    xSpacings: [240,240,240],
    ySpacings: [240,240,240],
    dashed: true,
    lineStyle: 'dashed',
    dashSizeRatio: 0.08,
    dashGapRatio: 0.08,
    majorEveryX: 0,
    majorEveryY: 0,
    showUCS: true,
    ucsAtStart: true,
    originAtStart: true,
    labelX: 'letters',
    labelY: 'numbers',
    labelsX: [],
    labelsY: [],
    showLabels: true,
    extendLeftBelow: 24,
    extendRightAbove: 24,
    spacingUnit: 'in',
    xFeet: 10,
    xInches: 0,
    yFeet: 10,
    yInches: 0,
  },
  updateGrid: (patch) => set(state => ({ grid: { ...state.grid, ...patch } })),
  createMode: "none",
  setCreateMode: (m) => set({ createMode: m }),
  history: [],
  future: [],

  loadModel: (m) => set(state => ({
    history: state.model ? [...state.history, state.model] : state.history,
    future: [],
    model: m
  })),
  selectMember: (id) => set({ selection: { selectedId: id } }),

  updateMember: (id, patch) => set(state => {
    if (!state.model) return state;
    const members = state.model.members.map(m => m.id === id ? { ...m, ...patch } : m);
    const newModel = { ...state.model, members };
    return { model: newModel, history: [...state.history, state.model], future: [] };
  }),

  addMember: (m) => set(state => {
    if (!state.model) return state;
    const newModel = { ...state.model, members: [...state.model.members, m] };
    return { model: newModel, history: [...state.history, state.model], future: [] };
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

  createModel: (name) => {
    const defaultModel: Model = {
      project: {
        name: name || "New Project",
        units: "in",
        origin: [0, 0, 0],
        density_kg_per_m3: 7850
      },
      levels: [{ name: "L1", elevation: 0 }],
      sections: [
        {
          name: "W4x13",
          type: "W",
          // Approximate dims in inches for demo
          dims: { bf: 4.0, tw: 0.25, tf: 0.35, d: 4.0 },
          area_mm2: undefined
        }
      ],
      members: []
    };
    set(state => ({ model: defaultModel, history: state.model ? [...state.history, state.model] : state.history, future: [] }));
  },

  deleteMember: (id) => set(state => {
    if (!state.model) return state;
    const newModel = { ...state.model, members: state.model.members.filter(m => m.id !== id) };
    return { model: newModel, history: [...state.history, state.model], future: [] };
  }),

  // Rename a member id safely (updates references by replacing the id)
  renameMember: (oldId, newId) => set(state => {
    if (!state.model) return state;
    // prevent duplicate ids
    if (state.model.members.find(m => m.id === newId)) return state;
    const members = state.model.members.map(m => m.id === oldId ? { ...m, id: newId } : m);
    const newModel = { ...state.model, members };
    return { model: newModel, history: [...state.history, state.model], future: [] };
  }),

  upsertSection: (s) => set(state => {
    if (!state.model) return state;
    const ix = state.model.sections.findIndex(x => x.name === s.name);
    const sections = [...state.model.sections];
    if (ix >= 0) sections[ix] = s; else sections.push(s);
    const newModel = { ...state.model, sections };
    return { model: newModel, history: [...state.history, state.model], future: [] };
  })
  ,

  undo: () => set(state => {
    if (!state.model || state.history.length === 0) return state;
    const prev = state.history[state.history.length - 1];
    const newHistory = state.history.slice(0, -1);
    return { model: prev, history: newHistory, future: [state.model, ...state.future] };
  }),

  redo: () => set(state => {
    if (!state.model || state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return { model: next, history: [...state.history, state.model], future: newFuture };
  })
}));
