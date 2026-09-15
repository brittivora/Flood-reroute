/**
 * AddressInput.tsx
 * Type-ahead place search.
 *
 * People type building and society names, not coordinates - "Lodha
 * Amara", "Hiranandani Gardens", "Sai Krupa CHS". Those match many
 * places across the metro, so this shows candidates with their locality
 * and lets the user choose rather than silently picking the top hit.
 *
 * Keyboard: arrows move, Enter selects, Escape closes.
 */

import { useEffect, useRef, useState } from "react";
import { api, type Suggestion } from "./api";

interface Props {
  label: string;
  value: string;
  placeholder: string;
  dot: string;
  onChange: (text: string) => void;
  onSelect: (place: Suggestion) => void;
}

export default function AddressInput({
  label,
  value,
  placeholder,
  dot,
  onChange,
  onSelect,
}: Props) {
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const skipNext = useRef(false);

  // Debounced lookup. 250 ms is short enough to feel live and long
  // enough that a fast typist doesn't fire a request per character.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    window.clearTimeout(timer.current);

    const q = value.trim();
    // Coordinates from a dropped pin shouldn't trigger a search.
    if (q.length < 2 || /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(q)) {
      setResults([]);
      setOpen(false);
      return;
    }

    setBusy(true);
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api.suggest(q);
        setResults(r);
        setActive(0);
        setOpen(r.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setBusy(false);
      }
    }, 250);

    return () => window.clearTimeout(timer.current);
  }, [value]);

  // Close when focus leaves the component entirely.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (p: Suggestion) => {
    skipNext.current = true; // selecting shouldn't re-trigger a search
    onChange(p.name);
    onSelect(p);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <label className="flex items-center gap-2.5 rounded-xl border border-hairline bg-raised px-3 py-2.5 focus-within:border-signal">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: dot }}
          aria-hidden
        />
        <span className="sr-only">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${label}-listbox`}
          className="w-full bg-transparent text-[0.86rem] text-text outline-none placeholder:text-faint"
        />
        {busy && (
          <span
            className="h-3 w-3 shrink-0 animate-spin rounded-full border border-faint border-t-transparent"
            aria-hidden
          />
        )}
      </label>

      {open && (
        <ul
          id={`${label}-listbox`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-hairline bg-raised py-1 shadow-2xl shadow-black/60"
        >
          {results.map((p, i) => (
            <li key={`${p.name}-${p.lat}-${p.lon}`} role="option" aria-selected={i === active}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={`w-full px-3 py-2 text-left transition-colors ${
                  i === active ? "bg-signal/15" : ""
                }`}
              >
                <div className="truncate text-[0.84rem] text-text">{p.name}</div>
                {p.context && (
                  <div className="truncate text-[0.72rem] text-faint">{p.context}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
