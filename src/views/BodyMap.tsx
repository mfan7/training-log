import Model, { type IExerciseData, type Muscle } from 'react-body-highlighter';

// The library colours a muscle by how many data entries name it (entry frequencies add up, then
// pick highlightedColors[n - 1]). Giving each muscle exactly one entry with frequency = palette
// index + 1 lets us choose every muscle's colour directly.
export const PALETTE = [
  'var(--lv-pr)', 'var(--lv-high)', 'var(--lv-mid)', 'var(--lv-low)', 'var(--lv-first)',
  'var(--lv-pr-2)', 'var(--lv-high-2)', 'var(--lv-mid-2)', 'var(--lv-low-2)', 'var(--lv-first-2)',
  'var(--plan-1)', 'var(--plan-2)',
] as const;
export type Fill = (typeof PALETTE)[number];

/** Front and back views side by side; `fills` colours muscles, tapping one calls onSelect. */
export function BodyMap({ fills, onSelect, label }: {
  fills: Map<Muscle, Fill>; onSelect?: (m: Muscle) => void; label: string;
}) {
  const data: IExerciseData[] = [...fills].map(([m, fill]) => ({ name: m, muscles: [m], frequency: PALETTE.indexOf(fill) + 1 }));
  const props = {
    data, highlightedColors: [...PALETTE], bodyColor: 'var(--body)',
    onClick: ({ muscle }: { muscle: Muscle }) => onSelect?.(muscle),
    style: { width: '100%' }, svgStyle: { width: '100%', height: 'auto', display: 'block' },
  };
  return (
    <figure className="bodymap" aria-label={label}>
      <div><Model {...props} type="anterior" /><figcaption>正面</figcaption></div>
      <div><Model {...props} type="posterior" /><figcaption>背面</figcaption></div>
    </figure>
  );
}
