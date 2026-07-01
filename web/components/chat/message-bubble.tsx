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
}

export function MessageBubble({ msg, isMine, sender, onRecall, onReply, replyTarget }: Props) {
  const recalled = !!msg.deletedAt;
  const withinRecall =
    isMine && !recalled && Date.now() - new Date(msg.createdAt).getTime() < 2 * 60 * 1000;

  return (
    <div className={cn('group flex gap-2 px-4 py-1.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar src={sender?.avatar} name={sender?.nickname || sender?.username || '?'} size={38} />
      <div className={cn('flex max-w-[70%] flex-col', isMine ? 'items-end' : 'items-start')}>
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-wechat-subtext">
          {isMine ? '我' : sender?.nickname || sender?.username}
        </div>
        {replyTarget && (
          <div className="mb-1 max-w-full truncate rounded bg-black/5 px-2 py-0.5 text-[11px] text-wechat-subtext">
            回复 {replyTarget.senderId === msg.senderId ? '自己' : ''}: {replyTarget.content.slice(0, 30)}
          </div>
        )}
        <div className="relative">
          {!recalled && withinRecall && (
            <button
              onClick={() => onRecall?.(msg)}
              className="absolute -top-7 right-0 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
            >
              撤回
            </button>
          )}
          <MessageBody msg={msg} isMine={isMine} onReply={onReply} />
        </div>
        <span className="mt-0.5 text-[10px] text-wechat-subtext opacity-0 transition group-hover:opacity-100">
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

function MessageBody({ msg, isMine, onReply }: { msg: MessageView; isMine: boolean; onReply?: (m: MessageView) => void }) {
  if (msg.deletedAt) {
    return <span className="text-xs text-wechat-subtext">该消息已撤回</span>;
  }
  let node: React.ReactNode;
  switch (msg.type) {
    case 'TEXT':
      node = <span className="whitespace-pre-wrap break-words">{msg.content}</span>;
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
    default:
      node = <span>{msg.content}</span>;
  }
  return (
    <div
      onDoubleClick={() => msg.type === 'TEXT' && onReply?.(msg)}
      className={cn(
        'inline-block rounded-lg px-3 py-2 text-sm shadow-sm',
        isMine ? 'bg-wechat-mybubble text-wechat-text' : 'bg-white text-wechat-text',
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

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
