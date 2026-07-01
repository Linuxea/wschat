'use client';

import { X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StagedImage {
  id: string;
  file: File;
  preview: string; // objectURL
}

interface Props {
  staged: StagedImage[];
  mergeMode: boolean;
  sending: boolean;
  onToggleMerge: () => void;
  onRemove: (id: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function ImageStagedBar({ staged, mergeMode, sending, onToggleMerge, onRemove, onSend, onCancel }: Props) {
  if (staged.length === 0) return null;
  const canMerge = staged.length >= 3;
  return (
    <div className="border-t border-border bg-white px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-subtext">{staged.length} 张图片</span>
        <button onClick={onCancel} className="text-xs text-subtext hover:text-text">
          清空
        </button>
      </div>
      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-2">
        {staged.map((img) => (
          <div key={img.id} className="relative h-20 w-20 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.preview} alt="" className="h-full w-full rounded-md object-cover" />
            <button
              onClick={() => onRemove(img.id)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      {canMerge && (
        <div className="flex items-center gap-2 border-t border-border pt-2">
          <button
            onClick={onToggleMerge}
            type="button"
            role="switch"
            aria-checked={mergeMode}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
              mergeMode ? 'bg-primary' : 'bg-black/15',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                mergeMode ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
          <span className="text-xs text-subtext">发送后合并展示（九宫格卡片，防刷屏）</span>
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <button
          onClick={onSend}
          disabled={sending}
          className="flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm text-white transition hover:bg-primary-hover disabled:opacity-40"
        >
          <Send size={14} /> {sending ? '发送中…' : '发送'}
        </button>
      </div>
    </div>
  );
}
