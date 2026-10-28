import exercisesJson from '../data/exercises.json';
import templatesJson from '../data/templates.json';
import type { CustomExercise, Exercise, Loc, SeedTemplate, Session, Template } from './types';

// Exercises defined here rather than in the spreadsheet: logging a whole class as one entry.
const EXTRA: Exercise[] = [{
  id: 'CL01', cn: 'HIIT 团课', en: 'HIIT / group class', cat: 'CL', catName: '团课/体能', size: '—', group: '全身',
  equip: '其他', home: true, homeNote: '', muscles: '全身、心肺', cue: '记录这节课的分钟数；课上做了特别的动作，可以再加进来。',
  legacy: [], load: 'min', inc: 5, hiit: true,
}];
export const BUILTIN_EXERCISES = [...(exercisesJson as Exercise[]), ...EXTRA];
export const CLASS_ID = 'CL01';

/** Unit of `reps` for an exercise. */
export const unitOf = (e: Exercise) => (e.load === 'sec' ? '秒' : e.load === 'min' ? '分钟' : '次');
const SEEDS = templatesJson as SeedTemplate[];

// Custom exercises are loaded from the local database; App keeps this in step via setCustomExercises.
// Deleted ones stay findable by id so old sessions still show their names.
let custom: Exercise[] = [];
let byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
export function setCustomExercises(list: CustomExercise[]) {
  custom = list.filter((e) => !e.deleted).sort((a, b) => a.cn.localeCompare(b.cn, 'zh'));
  byId = new Map([...BUILTIN_EXERCISES, ...list].map((e) => [e.id, e]));
}
export const allExercises = (): Exercise[] => [...custom, ...BUILTIN_EXERCISES];

export const ex = (id: string): Exercise =>
  byId.get(id) ?? {
    id, cn: id, en: '', cat: '', catName: '', size: '', group: '', equip: '', home: true,
    homeNote: '', muscles: '', cue: '', legacy: [], load: 'lb', inc: 5,
  };

// The six shipped plans get fixed ids, so every device seeds the same rows and they sync as one.
const SEED_IDS: Record<string, string> = {
  'gym-A': '7a1e0000-0000-4000-8000-000000000a01', 'gym-B': '7a1e0000-0000-4000-8000-000000000b01',
  'gym-C': '7a1e0000-0000-4000-8000-000000000c01', 'home-A': '7a1e0000-0000-4000-8000-000000000a02',
  'home-B': '7a1e0000-0000-4000-8000-000000000b02', 'home-C': '7a1e0000-0000-4000-8000-000000000c02',
};
const seedId = (week: string, loc: Loc) => SEED_IDS[`${loc}-${week}`] as string | undefined;

export const seedTemplates = (): Template[] => SEEDS.map((t) => ({
  id: SEED_IDS[t.key], name: t.title, loc: t.loc, items: t.items,
  position: 'ABC'.indexOf(t.week), rotation: true,
  // Never pushed unless edited; any copy from the server replaces it.
  deleted: false, updated_at: '1970-01-01T00:00:00.000Z', dirty: 0,
}));

/** The shipped version of a built-in plan, for "restore defaults". */
export const seedFor = (id: string) => seedTemplates().find((t) => t.id === id);

/** The plan a session came from, including sessions logged before plans were editable. */
export const sessionTemplateId = (s: Session): string | undefined => s.template_id ?? seedId(s.week, s.loc);

export function sessionTitle(s: Session): string {
  return s.title || SEEDS.find((t) => t.week === s.week && t.loc === s.loc)?.title || '';
}

export const LOC_LABEL: Record<Loc, string> = { gym: '健身房', home: '居家' };
/** "A 周健身房", or just "居家" for a plan outside the rotation */
export const sessionLabel = (s: Session) => (s.week && s.week !== '-' ? `${s.week} 周` : '') + LOC_LABEL[s.loc];
export const letter = (i: number) => (i < 0 ? '-' : String.fromCharCode(65 + (i % 26)));

export const GROUP_ORDER = ['腿', '胸', '背', '肩', '二头', '三头', '核心', '全身', '平衡', '热身'];
