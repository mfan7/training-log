export type Loc = 'gym' | 'home';
/** lb = weight in pounds (0 = bodyweight), level = assist level, bw = bodyweight (weight optional),
 *  sec = seconds held, min = minutes (classes, cardio); `reps` holds the seconds or minutes */
export type Load = 'lb' | 'level' | 'bw' | 'sec' | 'min';

export interface Exercise {
  id: string; cn: string; en: string;
  cat: string; catName: string; size: string; group: string;
  equip: string; home: boolean; homeNote: string;
  muscles: string; cue: string; legacy: string[];
  load: Load; inc: number;
  /** true for exercises the user added in the app */
  custom?: boolean;
  /** HIIT / conditioning: counts half toward muscle volume, and toward 体能 */
  hiit?: boolean;
  /** muscles picked on the body map; overrides what the muscle text implies */
  map?: { primary: string[]; secondary: string[] };
}

/** A user-added exercise as stored locally. Synced to Supabase as { id, data, deleted }. */
export interface CustomExercise extends Exercise {
  deleted: boolean; updated_at: string; dirty: 0 | 1;
}

export interface PlanItem {
  ex: string; sets: number; min: number; max: number; rest: number;
  /** items sharing a superset label are done alternately */
  ss?: string;
}

/** One of the six plans shipped in src/data/templates.json. */
export interface SeedTemplate { key: string; week: string; loc: Loc; title: string; items: PlanItem[] }

/** A workout plan. Plans with `rotation` set take turns week by week, in `position` order. */
export interface Template {
  id: string; name: string; loc: Loc; items: PlanItem[];
  position: number; rotation: boolean;
  deleted: boolean; updated_at: string; dirty: 0 | 1;
}

export interface Session {
  /** `week` is the plan's rotation letter when the session started (A, B, C…), or '-' outside the rotation */
  id: string; date: string; week: string; loc: Loc; plan: PlanItem[];
  /** null for sessions logged before plans became editable */
  template_id: string | null; title: string;
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
