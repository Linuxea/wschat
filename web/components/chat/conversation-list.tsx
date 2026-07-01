'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { getSocket } from '@/lib/socket';
import { Avatar, EmptyState } from '@/components/ui';
import { cn, formatTime } from '@/lib/utils';
import type { ConversationView } from '@/lib/types';
import { conversationDisplay } from '@/lib/types';

export function ConversationList() {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<ConversationView[]>('/conversations'),
    refetchInterval: false,
  });

  useEffect(() => {
    const s = getSocket();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['conversations'] });
    s.on('message:new', invalidate);
    s.on('message:recall', invalidate);
    s.on('conversation:new', invalidate);
    s.on('conversation:removed', invalidate);
    s.on('connected', invalidate);
    return () => {
      s.off('message:new', invalidate);
      s.off('message:recall', invalidate);
      s.off('conversation:new', invalidate);
      s.off('conversation:removed', invalidate);
      s.off('connected', invalidate);
    };
  }, [qc]);

  const activeId = pathname.startsWith('/chat/') ? pathname.slice('/chat/'.length) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-wechat-border px-4">
        <span className="font-medium text-wechat-text">微信</span>
        <button
          onClick={() => router.push('/contacts?action=search')}
          className="text-wechat-subtext transition hover:text-wechat-green"
          title="添加"
        >
          <Search size={18} />
        </button>
      </header>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-wechat-subtext">加载中…</div>
        ) : !conversations || conversations.length === 0 ? (
          <EmptyState title="还没有会话" hint="去通讯录添加好友开始聊天" />
        ) : (
          conversations.map((c) => {
            const disp = conversationDisplay(c, user?.id || '');
            const active = activeId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => router.push(`/chat/${c.id}`)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors',
                  active ? 'bg-wechat-bg' : 'hover:bg-wechat-panel',
                )}
              >
                <div className="relative">
                  <Avatar src={disp.avatar} name={disp.name} size={44} />
                  {c.unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-wechat-text">{disp.name}</span>
                    {c.lastMessage && (
                      <span className="shrink-0 text-[11px] text-wechat-subtext">
                        {formatTime(c.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {c.pinned && <span className="text-[10px] text-wechat-subtext">📌</span>}
                    {c.muted && <span className="text-[10px]">🔇</span>}
                    <p className="truncate text-xs text-wechat-subtext">
                      {c.lastMessage?.preview || '暂无消息'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
