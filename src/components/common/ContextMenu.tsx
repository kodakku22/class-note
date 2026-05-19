// Reusable right-click context menu. Anytype-style: rounded card, soft
// shadow, single-column item list. Keyboard navigation included.
import { useEffect, useRef, useState } from 'react';

export type ContextMenuItem = {
  id: string;
  label: string;
  emoji?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const enabled = items.filter((i) => !i.disabled);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(enabled.length - 1, a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = enabled[active];
        if (it) {
          it.onSelect();
          onClose();
        }
      }
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [active, enabled, onClose]);

  // Keep within viewport
  const adjusted = (() => {
    const w = 220;
    const h = items.length * 30 + 12;
    let nx = x;
    let ny = y;
    if (nx + w > window.innerWidth) nx = Math.max(8, window.innerWidth - w - 8);
    if (ny + h > window.innerHeight) ny = Math.max(8, window.innerHeight - h - 8);
    return { x: nx, y: ny };
  })();

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: adjusted.x, top: adjusted.y }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it) => {
        const enabledIdx = enabled.indexOf(it);
        const isActive = enabledIdx === active;
        return (
          <button
            key={it.id}
            role="menuitem"
            disabled={it.disabled}
            className={`ctx-menu-item ${isActive ? 'active' : ''} ${it.danger ? 'danger' : ''}`}
            onClick={() => {
              if (it.disabled) return;
              it.onSelect();
              onClose();
            }}
            onMouseEnter={() => {
              if (!it.disabled && enabledIdx >= 0) setActive(enabledIdx);
            }}
          >
            {it.emoji && <span className="ctx-menu-emoji">{it.emoji}</span>}
            <span className="ctx-menu-label">{it.label}</span>
            {it.shortcut && <span className="ctx-menu-shortcut">{it.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
