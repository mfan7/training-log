export type Week = 'A' | 'B' | 'C';
export type Loc = 'gym' | 'home';
/** lb = weight in pounds (0 = bodyweight), level = assist level, bw = bodyweight (weight optional), sec = seconds held */
export type Load = 'lb' | 'level' | 'bw' | 'sec';

export interface Exercise {
  id: string; cn: string; en: string;
  cat: string; catName: string; size: string; group: string;
  equip: string; home: boolean; homeNote: string;
  muscles: string; cue: string; legacy: string[];
  load: Load; inc: number;
}

export interface PlanItem {
  ex: string; sets: number; min: number; max: number; rest: number;
  /** items sharing a superset label are done alternately */
  ss?: string;
}

export interface Template { key: string; week: Week; loc: Loc; title: string; items: PlanItem[] }

export interface Session {
  id: string; date: string; week: Week; loc: Loc; plan: PlanItem[];
  started_at: string; ended_at: string | null; notes: string;
  deleted: boolean; updated_at: string;
  /** 1 = has local changes not yet pushed to Supabase */
  dirty: 0 | 1;
}

export interface SetRow {
  id: string; session_id: string; exercise_id: string; set_no: number;
  weight: number | null; reps: number; rpe: number | null; done_at: string;
  deleted: boolean; updated_at: string; dirty: 0 | 1;
}
