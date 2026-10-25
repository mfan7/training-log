import { useRef, useState, type ReactNode } from 'react';

const W = 84; // width of the revealed delete button

/** A row that slides left to reveal a delete button. Vertical drags still scroll the page. */
export function SwipeRow({ children, onDelete, label, as: Tag = 'li', className = '' }: {
  children: ReactNode; onDelete: () => void; label: string;
  /** 'div' to wrap something that is not a list item, e.g. an exercise card's header */
  as?: 'li' | 'div'; className?: string;
}) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const swallowClick = useRef(false);

  return (
    <Tag className="swipe">
      <button className="swipe-del" onClick={onDelete} onFocus={() => setX(-W)} onBlur={() => setX(0)} aria-label={`删除${label}`}>
        删除
      </button>
      <div
        className={`swipe-body ${className}`}
        style={{ transform: `translateX(${x}px)`, transition: dragging ? 'none' : undefined }}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY, base: x, horizontal: null }; }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (s.horizontal === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.horizontal = Math.abs(dx) > Math.abs(dy);
            if (!s.horizontal) { start.current = null; return; }
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }
          setX(Math.min(0, Math.max(-W, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          // a swipe, or a tap that closes an open row, must not also click what's underneath
          swallowClick.current = !!s?.horizontal || x !== 0;
          if (s?.horizontal) setX((v) => (v < -W / 2 ? -W : 0));
          else if (x) setX(0);
        }}
        onPointerCancel={() => { start.current = null; setDragging(false); setX(0); }}
        onClickCapture={(e) => {
          if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); }
          swallowClick.current = false;
        }}
      >
        {children}
      </div>
    </Tag>
  );
}
