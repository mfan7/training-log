import { useState } from 'react';
import { ExerciseList } from './ExerciseList';
import { ExerciseForm } from './ExerciseForm';
import { Sheet } from './ExerciseSheet';
import type { Loc } from '../lib/types';

export function Picker({ loc, group, title, taken, onPick, onClose }: {
  loc: Loc; group?: string; title: string; taken: Set<string>; onPick: (id: string) => void; onClose: () => void;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  if (creating !== null) {
    return <ExerciseForm initialName={creating} onSaved={onPick} onClose={() => setCreating(null)} />;
  }
  return (
    <Sheet onClose={onClose} label={title}>
      <h2>{title}</h2>
      <ExerciseList initialGroup={group} homeOnly={loc === 'home'} taken={taken} onSelect={(e) => onPick(e.id)} onCreate={setCreating} />
    </Sheet>
  );
}
