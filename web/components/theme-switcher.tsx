'use client';

import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { THEMES } from '@/lib/themes';
import { useThemeStore } from '@/lib/theme-store';
import { cn } from '@/lib/utils';

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
          open ? 'bg-primary/10 text-primary' : 'text-subtext hover:bg-black/5 hover:text-text',
        )}
        title="主题"
      >
        <Palette size={22} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="animate-fade-in absolute bottom-0 left-full z-50 ml-2 w-44 rounded-xl border border-border bg-surface/90 p-1 shadow-soft-lg backdrop-blur-xl">
          <div className="px-2 py-1.5 text-[11px] font-medium text-subtext">外观</div>
          {THEMES.map((t) => {
            const selected = t.id === theme;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors',
                  selected ? 'bg-primary/10 text-primary' : 'text-text hover:bg-black/5',
                )}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-[11px] text-subtext">{t.description}</span>
                </span>
                {selected && <Check size={16} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
