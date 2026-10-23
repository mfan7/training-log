import { useState } from 'react';
import { ExerciseList } from './ExerciseList';
import { ExerciseSheet } from './ExerciseSheet';

export function Library() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <ExerciseList onSelect={(e) => setOpen(e.id)} />
      {open && <ExerciseSheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
