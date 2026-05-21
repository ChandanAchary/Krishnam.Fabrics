'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComboboxProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  error?: string;
  hint?: string;
  allowCustom?: boolean; // allow typing a value not in the list
  id?: string;
}

/**
 * Searchable select: users can type to filter, pick from the list, or (when
 * allowCustom) enter a free-text value. Keyboard: ↑/↓ navigate, Enter selects,
 * Esc closes.
 */
export function Combobox({
  label,
  required,
  value,
  onChange,
  options,
  placeholder = 'Type or select…',
  error,
  hint,
  allowCustom = true,
  id,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = id ?? `combobox-${Math.random().toString(36).slice(2, 9)}`;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [query, options]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Commit the typed value (free text) on blur if custom allowed
        if (allowCustom) onChange(query.trim());
        else if (!options.includes(query)) setQuery(value); // revert to last valid
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, query, value, allowCustom, options, onChange]);

  const commit = (val: string) => {
    onChange(val);
    setQuery(val);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[activeIndex]) commit(filtered[activeIndex]);
      else if (allowCustom) commit(query.trim());
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="w-full" ref={wrapRef}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className={cn(
            'input pr-9',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
          )}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (allowCustom) onChange(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
          aria-label="Toggle options"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg animate-fade-in"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">
                {allowCustom ? `Press Enter to use “${query.trim()}”` : 'No matches'}
              </li>
            ) : (
              filtered.map((opt, i) => (
                <li
                  key={opt}
                  role="option"
                  aria-selected={opt === value}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(opt);
                  }}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-sm cursor-pointer',
                    i === activeIndex ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                  )}
                >
                  <span>{opt}</span>
                  {opt === value && <Check className="h-4 w-4 text-brand-600" />}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
