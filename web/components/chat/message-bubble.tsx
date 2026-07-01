'use client';

import { useRef, useState } from 'react';
import { Avatar } from '@/components/ui';
import { cn, formatTime } from '@/lib/utils';
import type { ConversationMember, MessageView } from '@/lib/types';

interface Props {
  msg: MessageView;
  isMine: boolean;
  sender?: ConversationMember;
  onRecall?: (msg: MessageView) => void;
  onReply?: (msg: MessageView) => void;
  replyTarget?: MessageView | null;
  memberMap?: Map<string, ConversationMember>;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onForward?: (msg: MessageView) => void; // 单条快捷转发
  onSelectStart?: (msg: MessageView) => void; // 进入多选模式并选中当前
}

export function MessageBubble({
  msg,
  isMine,
  sender,
  onRecall,
  onReply,
  replyTarget,
  memberMap,
  selectMode,
  selected,
  onToggleSelect,
  onForward,
  onSelectStart,
}: Props) {
  const recalled = !!msg.deletedAt;
  const withinRecall =
    isMine && !recalled && Date.now() - new Date(msg.createdAt).getTime() < 2 * 60 * 1000;

  return (
    <div
      className={cn(
        'group flex gap-2 px-4 py-1.5',
        isMine ? 'flex-row-reverse' : 'flex-row',
        selectMode && 'cursor-pointer',
      )}
      onClick={selectMode ? () => onToggleSelect?.(msg.id) : undefined}
    >
      {selectMode && (
        <div className="flex items-center">
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full border-2 text-[9px] font-bold text-white',
              selected ? 'border-primary bg-primary' : 'border-gray-400 bg-white',
            )}
          >
            {selected ? '✓' : ''}
          </span>
        </div>
      )}
      <Avatar src={sender?.avatar} name={sender?.nickname || sender?.username || '?'} size={38} />
      <div className={cn('flex max-w-[70%] flex-col', isMine ? 'items-end' : 'items-start')}>
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-subtext">
          {isMine ? '我' : sender?.nickname || sender?.username}
        </div>
        {replyTarget && (
          <div className="mb-1 max-w-full truncate rounded bg-black/5 px-2 py-0.5 text-[11px] text-subtext">
            回复 {replyTarget.senderId === msg.senderId ? '自己' : ''}: {replyTarget.content.slice(0, 30)}
          </div>
        )}
        <div className="relative">
          {!recalled && !selectMode && (
            <div className="absolute -top-7 right-0 flex gap-1 opacity-0 transition group-hover:opacity-100">
              {withinRecall && (
                <button
                  onClick={() => onRecall?.(msg)}
                  className="rounded bg-black/70 px-2 py-0.5 text-[10px] text-white"
                >
                  撤回
                </button>
              )}
              <button
                onClick={() => onForward?.(msg)}
                className="rounded bg-black/70 px-2 py-0.5 text-[10px] text-white"
              >
                转发
              </button>
              <button
                onClick={() => onSelectStart?.(msg)}
                className="rounded bg-black/70 px-2 py-0.5 text-[10px] text-white"
              >
                多选
              </button>
            </div>
          )}
          <MessageBody msg={msg} isMine={isMine} onReply={onReply} memberMap={memberMap} />
        </div>
        <span className="mt-0.5 text-[10px] text-subtext opacity-0 transition group-hover:opacity-100">
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

function MessageBody({ msg, isMine, onReply, memberMap }: { msg: MessageView; isMine: boolean; onReply?: (m: MessageView) => void; memberMap?: Map<string, ConversationMember> }) {
  if (msg.deletedAt) {
    return <span className="text-xs text-subtext">该消息已撤回</span>;
  }
  let node: React.ReactNode;
  switch (msg.type) {
    case 'TEXT':
      node = <TextWithMentions content={msg.content} mentions={msg.mentions} memberMap={memberMap} isMine={isMine} />;
      break;
    case 'EMOJI':
      node = <span className="text-3xl leading-none">{msg.content}</span>;
      break;
    case 'IMAGE': {
      const p = safeJson(msg.content);
      node = (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p?.url} alt="img" className="max-h-60 max-w-[220px] cursor-pointer rounded-md" />
      );
      break;
    }
    case 'VOICE': {
      const p = safeJson(msg.content);
      node = <VoiceBar url={p?.url} duration={p?.duration} isMine={isMine} />;
      break;
    }
    case 'VIDEO': {
      const p = safeJson(msg.content);
      node = <video src={p?.url} controls className="max-h-60 max-w-[240px] rounded-md" />;
      break;
    }
    case 'FILE': {
      const p = safeJson(msg.content);
      node = (
        <a href={p?.url} target="_blank" rel="noreferrer" className="underline">
          📎 {p?.name || '文件'} {p?.size ? `(${Math.round(p.size / 1024)}KB)` : ''}
        </a>
      );
      break;
    }
    case 'FORWARDED': {
      const p = safeJson(msg.content);
      node = <ForwardedCard bundle={p} />;
      break;
    }
    default:
      node = <span>{msg.content}</span>;
  }
  return (
    <div
      onDoubleClick={() => msg.type === 'TEXT' && onReply?.(msg)}
      className={cn(
        'inline-block rounded-bubble px-3 py-2 text-sm shadow-soft',
        isMine ? 'bg-bubble-self text-white' : 'bg-bubble-other text-text',
      )}
    >
      {node}
    </div>
  );
}

function VoiceBar({ url, duration, isMine }: { url: string; duration?: number; isMine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <button
      onClick={() => {
        const a = ref.current;
        if (!a) return;
        if (playing) a.pause();
        else a.play().catch(() => {});
      }}
      className={cn('flex items-center gap-2 py-0.5', isMine ? 'flex-row-reverse' : 'flex-row')}
    >
      <audio
        ref={ref}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <span className="text-base">{playing ? '⏸' : '▶'}</span>
      <span className="text-xs">{duration || 0}&quot;</span>
    </button>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 渲染文本，把真实 @提及 的 `@昵称` 高亮（精确：只标 mentions 命中的）。 */
function TextWithMentions({
  content,
  mentions,
  memberMap,
  isMine,
}: {
  content: string;
  mentions?: string[];
  memberMap?: Map<string, ConversationMember>;
  isMine: boolean;
}) {
  const tokens = new Set<string>();
  if (mentions && mentions.length) {
    for (const m of mentions) {
      if (m === '__all__') {
        tokens.add('@所有人');
      } else {
        const mem = memberMap?.get(m);
        const label = mem ? mem.remark || mem.nickname || mem.username : '';
        if (label) tokens.add(`@${label}`);
      }
    }
  }
  if (tokens.size === 0) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }
  //长 token 优先匹配，避免 `@张` 抢了 `@张三`
  const sorted = Array.from(tokens).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'g');
  const parts = content.split(re);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        tokens.has(p) ? (
          <span key={i} className={cn('font-medium', isMine ? 'text-white/90 underline' : 'text-primary underline')}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

interface ForwardedItem {
  senderName?: string;
  senderId?: string;
  type?: string;
  content?: string;
  ts?: number;
}

function previewForwardedItem(it: ForwardedItem): string {
  switch (it.type) {
    case 'TEXT':
    case 'EMOJI':
      return it.content || '';
    case 'IMAGE':
      return '[图片]';
    case 'VOICE':
      return '[语音]';
    case 'VIDEO':
      return '[视频]';
    case 'FILE':
      return '[文件]';
    default:
      return '[消息]';
  }
}

function ForwardedCard({ bundle }: { bundle: { title?: string; items?: ForwardedItem[] } }) {
  const [expanded, setExpanded] = useState(false);
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  if (items.length === 0) return <span className="text-xs text-subtext">[空的聊天记录]</span>;
  const shown = expanded ? items : items.slice(0, 3);
  return (
    <div className="min-w-[200px] max-w-[240px]">
      <div className="mb-1 text-xs font-medium text-subtext">{bundle?.title || '聊天记录'}</div>
      <div className="space-y-1 border-t border-black/10 pt-1">
        {shown.map((it, i) => (
          <div key={i} className="text-xs">
            <span className="font-medium">{it.senderName || '未知'}: </span>
            <span className="text-subtext">{previewForwardedItem(it)}</span>
          </div>
        ))}
      </div>
      {items.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] text-primary hover:underline"
        >
          {expanded ? '收起' : `展开全部 ${items.length} 条`}
        </button>
      )}
    </div>
  );
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
