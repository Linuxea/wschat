'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Video, MoreVertical, Pin, BellOff, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket, recallMessage } from '@/lib/socket';
import { useAuthStore } from '@/lib/auth-store';
import { useCallStore } from '@/lib/call-store';
import { useNotificationStore } from '@/lib/notification-store';
import { toast } from '@/components/toaster';
import { Avatar, EmptyState } from '@/components/ui';
import { MessageBubble } from './message-bubble';
import { MessageInput } from './message-input';
import { cn } from '@/lib/utils';
import type { ConversationView, MessageView } from '@/lib/types';
import { conversationDisplay } from '@/lib/types';

export function ChatWindow({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const startCall = useCallStore((s) => s.startOutgoing);
  const fetchBadges = useNotificationStore((s) => s.fetchBadges);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [highlightSeqs, setHighlightSeqs] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReadSeq = useRef(0);

  const { data: conv } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get<ConversationView>(`/conversations/${conversationId}`),
  });

  const { data: messages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.get<MessageView[]>(`/messages/conversation/${conversationId}`),
  });

  // socket listeners
  useEffect(() => {
    const s = getSocket();
    const onNew = (m: MessageView) => {
      if (m.conversationId !== conversationId) return;
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    const onRecall = (p: { conversationId: string; id: string }) => {
      if (p.conversationId !== conversationId) return;
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    };
    s.on('message:new', onNew);
    s.on('message:recall', onRecall);
    return () => {
      s.off('message:new', onNew);
      s.off('message:recall', onRecall);
    };
  }, [conversationId, qc]);

  // mark read when latest seq changes
  useEffect(() => {
    const latestSeq = messages && messages.length ? messages[0].seq : 0;
    if (!latestSeq || latestSeq === lastReadSeq.current) return;
    lastReadSeq.current = latestSeq;
    api.post(`/conversations/${conversationId}/read`, { seq: latestSeq }).then(() => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      fetchBadges(); //已读会话后同步聊天红点
    });
  }, [messages, conversationId, qc, fetchBadges]);

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleRecall(msg: MessageView) {
    try {
      await recallMessage(msg.id);
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast('已撤回', 'success');
    } catch (e) {
      toast((e as Error).message || '撤回失败', 'error');
    }
  }

  async function togglePin() {
    if (!conv) return;
    const next = !conv.pinned;
    await api.post(`/conversations/${conversationId}/${next ? 'pin' : 'unpin'}`);
    qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    setMenuOpen(false);
  }

  async function doSearch() {
    if (!searchQ.trim()) return;
    try {
      const hits = await api.post<MessageView[]>(`/messages/conversation/${conversationId}/search`, { q: searchQ });
      setHighlightSeqs(new Set(hits.map((h) => h.seq)));
      toast(`找到 ${hits.length} 条结果`, 'success');
    } catch (e) {
      toast((e as Error).message || '搜索失败', 'error');
    }
  }

  if (!conv) return null;
  const disp = conversationDisplay(conv, me?.id || '');
  const memberMap = new Map(conv.members.map((m) => [m.userId, m]));

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <header className="relative flex h-14 items-center justify-between border-b border-border bg-panel px-4 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="truncate font-medium text-text">{disp.name}</div>
          {conv.type === 'GROUP' && (
            <div className="text-[11px] text-subtext">{conv.members.length} 位成员</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => startCall(conversationId).catch((e) => toast(e.message, 'error'))}
            className="rounded p-1.5 text-subtext hover:bg-black/5 hover:text-primary"
            title="视频通话"
          >
            <Video size={18} />
          </button>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="rounded p-1.5 text-subtext hover:bg-black/5"
            title="搜索"
          >
            <Search size={18} />
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="rounded p-1.5 text-subtext hover:bg-black/5">
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-md border border-border bg-white py-1 text-sm shadow-lg">
                <MenuItem icon={<Pin size={14} />} label={conv.pinned ? '取消置顶' : '置顶'} onClick={() => togglePin()} />
                <MenuItem
                  icon={<BellOff size={14} />}
                  label={conv.muted ? '取消免打扰' : '消息免打扰'}
                  onClick={async () => {
                    const next = !conv.muted;
                    await api.post(`/conversations/${conversationId}/${next ? 'mute' : 'unmute'}`);
                    qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
                    setMenuOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-white px-4 py-2">
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="搜索聊天记录…"
            className="h-8 flex-1 rounded border border-border px-2 text-sm outline-none focus:border-primary"
          />
          <button onClick={doSearch} className="rounded bg-primary px-3 py-1 text-xs text-white">搜索</button>
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto py-3">
        {!messages || messages.length === 0 ? (
          <EmptyState title="还没有消息" hint="发条消息打个招呼吧" />
        ) : (
          messages
            .slice()
            .reverse()
            .map((m) => (
              <div key={m.id} className={cn(highlightSeqs.has(m.seq) && 'rounded bg-yellow-100/60')}>
                <MessageBubble
                  msg={m}
                  isMine={m.senderId === me?.id}
                  sender={memberMap.get(m.senderId)}
                  onRecall={handleRecall}
                  memberMap={memberMap}
                />
              </div>
            ))
        )}
      </div>

      <MessageInput
        conversationId={conversationId}
        onSent={() => qc.invalidateQueries({ queryKey: ['messages', conversationId] })}
        members={conv.members}
        conversationType={conv.type}
      />
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-text hover:bg-panel"
    >
      {icon}
      {label}
    </button>
  );
}
