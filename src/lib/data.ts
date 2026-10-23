import exercisesJson from '../data/exercises.json';
import templatesJson from '../data/templates.json';
import type { Exercise, Loc, Template, Week } from './types';

export const EXERCISES = exercisesJson as Exercise[];
export const TEMPLATES = templatesJson as Template[];
export const EX = new Map(EXERCISES.map((e) => [e.id, e]));

export const ex = (id: string): Exercise =>
  EX.get(id) ?? {
    id, cn: id, en: '', cat: '', catName: '', size: '', group: '', equip: '', home: true,
    homeNote: '', muscles: '', cue: '', legacy: [], load: 'lb', inc: 5,
  };

export const template = (week: Week, loc: Loc): Template =>
  TEMPLATES.find((t) => t.week === week && t.loc === loc)!;

export const WEEK_TITLE: Record<Week, string> = { A: '腿 + 肩', B: '背 + 二头', C: '胸 + 三头' };

export const GROUP_ORDER = ['腿', '胸', '背', '肩', '二头', '三头', '核心', '全身', '平衡', '热身'];
