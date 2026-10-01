import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ── Toasts ─────────────────────────────────────────────
const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ── Feuille modale ─────────────────────────────────────
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="search-box">
      <span className="si">🔎</span>
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
      />
      {value && (
        <button className="icon-btn clear" onClick={() => onChange('')} aria-label="Effacer">
          ✕
        </button>
      )}
    </div>
  );
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ee">{emoji}</div>
      <h3 style={{ color: 'var(--ink)' }}>{title}</h3>
      {children}
    </div>
  );
}

export function ServingsControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const steps = [1, 2, 3, 4, 6, 8];
  const idx = steps.indexOf(value);
  const prev = () => onChange(idx > 0 ? steps[idx - 1] : idx === -1 ? Math.max(1, value - 1) : value);
  const next = () => onChange(idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : idx === -1 ? value + 1 : value);
  return (
    <div className="servings" role="group" aria-label="Nombre de personnes">
      <button onClick={prev} aria-label="Moins">
        −
      </button>
      <span className="sv">👥 {value} pers.</span>
      <button onClick={next} aria-label="Plus">
        +
      </button>
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Pagination progressive (« afficher plus » automatique au scroll) */
export function useProgressive<T>(items: T[], page = 24) {
  const [n, setN] = useState(page);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => setN(page), [items, page]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setN((x) => x + page), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [page, items]);
  return { visible: items.slice(0, n), sentinel: n < items.length ? <div ref={ref} style={{ height: 1 }} /> : null };
}
