import Model, { type IExerciseData, type Muscle } from 'react-body-highlighter';
import { VOL_BANDS } from '../lib/muscles';

// The library colours a muscle by how many data entries name it (entry frequencies add up, then
// pick highlightedColors[n - 1]). Giving each muscle exactly one entry with frequency = palette
// index + 1 lets us choose every muscle's colour directly.
export const PALETTE = [
  'var(--vol-1)', 'var(--vol-2)', 'var(--vol-3)', 'var(--vol-4)',
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

/** Colour key for maps coloured by effective sets. */
export function VolumeLegend({ note }: { note: string }) {
  return (
    <>
      <ul className="legend" aria-label="颜色说明">
        <li><i style={{ background: 'var(--body)' }} />未练</li>
        {VOL_BANDS.map((b) => <li key={b.label}><i style={{ background: b.fill }} />{b.label}</li>)}
      </ul>
      <p className="legend-note">{note}</p>
    </>
  );
}
