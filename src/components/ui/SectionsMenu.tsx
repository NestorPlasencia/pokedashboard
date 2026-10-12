import { BookOpen, ChartNoAxesCombined, Library, Menu, Settings } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { navigate, type Route } from '../../utils/route';

const SECTIONS = [
  { route: 'collections', label: 'Colecciones', Icon: Library },
  { route: 'pokedex', label: 'Pokédex', Icon: BookOpen },
  { route: 'reports', label: 'Informes', Icon: ChartNoAxesCombined },
  { route: 'settings', label: 'Settings', Icon: Settings },
] as const;

/** Secondary pages share a disclosure in the bottom navigation on every screen. */
export function SectionsMenu({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [route]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    // A resize can hide this dock in favour of its counterpart.
    const closeOnResize = () => setOpen(false);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);

  return (
    <div
      className="sections-menu"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        className={open || route !== 'catalog' ? 'is-active' : ''}
        aria-label="Menú de secciones"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <Menu size={20} aria-hidden="true" />
        <span>Menú</span>
      </button>
      <nav id={panelId} className="sections-menu__panel" aria-label="Secciones" hidden={!open}>
        {SECTIONS.map(({ route: destination, label, Icon }) => (
          <button
            key={destination}
            type="button"
            className={`sections-menu__item${route === destination ? ' is-active' : ''}`}
            aria-current={route === destination ? 'page' : undefined}
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus({ preventScroll: true });
              navigate(destination);
            }}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
