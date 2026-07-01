'use client';

import { create } from 'zustand';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

interface ToastStore {
  toasts: ToastItem[];
  push: (message: string, type?: ToastItem['type']) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3200);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, type?: ToastItem['type']) {
  useToastStore.getState().push(message, type);
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <Toast key={t.id} item={t} onClose={() => remove(t.id)} />
      ))}
    </div>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  useEffect(() => {}, []);
  return (
    <div
      onClick={onClose}
      className={cn(
        'pointer-events-auto cursor-pointer animate-slide-up rounded-lg px-4 py-2.5 text-sm text-white shadow-lg max-w-sm',
        item.type === 'error' ? 'bg-red-500' : item.type === 'success' ? 'bg-primary' : 'bg-gray-800',
      )}
    >
      {item.message}
    </div>
  );
}
