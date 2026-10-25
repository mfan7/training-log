import { ExerciseList } from './ExerciseList';
import { Sheet } from './ExerciseSheet';
import type { Loc } from '../lib/types';

export function Picker({ loc, group, title, taken, onPick, onClose }: {
  loc: Loc; group?: string; title: string; taken: Set<string>; onPick: (id: string) => void; onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} label={title}>
      <h2>{title}</h2>
      <ExerciseList initialGroup={group} homeOnly={loc === 'home'} taken={taken} onSelect={(e) => onPick(e.id)} />
    </Sheet>
  );
}
