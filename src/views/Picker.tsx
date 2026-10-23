import { ExerciseList } from './ExerciseList';
import { Sheet } from './ExerciseSheet';
import type { Loc } from '../lib/types';

export function Picker({ loc, group, title, onPick, onClose }: {
  loc: Loc; group?: string; title: string; onPick: (id: string) => void; onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} label={title}>
      <h2>{title}</h2>
      <ExerciseList initialGroup={group} homeOnly={loc === 'home'} onSelect={(e) => onPick(e.id)} />
    </Sheet>
  );
}
