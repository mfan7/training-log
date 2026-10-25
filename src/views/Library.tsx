import { useState } from 'react';
import { ExerciseList } from './ExerciseList';
import { ExerciseSheet } from './ExerciseSheet';
import { ExerciseForm } from './ExerciseForm';

export function Library() {
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  return (
    <>
      <ExerciseList onSelect={(e) => setOpen(e.id)} onCreate={setCreating} />
      {open && <ExerciseSheet id={open} onClose={() => setOpen(null)} />}
      {creating !== null && (
        <ExerciseForm initialName={creating} onClose={() => setCreating(null)} onSaved={(id) => { setCreating(null); setOpen(id); }} />
      )}
    </>
  );
}
