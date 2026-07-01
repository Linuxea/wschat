'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellOff } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useNotificationStore, fetchNotifications } from '@/lib/notification-store';
import { toast } from '@/components/toaster';
import { Avatar, EmptyState, Spinner } from '@/components/ui';
import { formatTime, cn } from '@/lib/utils';
import type { NotificationView, NotificationType } from '@/lib/types';

function displayName(u: { nickname: string; username: string }): string {
  return u.nickname || u.username || '用户';
}

function describe(n: NotificationView): { text: string; target?: string } {
  const name = displayName(n.actor);
  const payload = (n.payload || {}) as Record<string, unknown>;
  switch (n.type) {
    case 'MOMENT_LIKE': {
      const text = n.aggregated && n.actorCount > 1
        ? `${name} 等 ${n.actorCount} 人赞了你的朋友圈`
        : `${name} 赞了你的朋友圈`;
      return { text, target: '/moments' };
    }
    case 'MOMENT_COMMENT':
      return { text: `${name} 评论了你：${String(payload.content ?? '')}`, target: '/moments' };
    case 'MOMENT_REPLY':
      return { text: `${name} 回复了你：${String(payload.content ?? '')}`, target: '/moments' };
    case 'FRIEND_REQUEST':
      return { text: `${name} 请求添加你为好友`, target: '/contacts' };
    case 'MENTION': {
      const cid = payload.conversationId as string | undefined;
      return { text: `${name} 在聊天中提到了你`, target: cid ? `/chat/${cid}` : '/chat' };
    }
    case 'MISSED_CALL': {
      const cid = payload.conversationId as string | undefined;
      return { text: `${name} 的未接来电`, target: cid ? `/chat/${cid}` : '/chat' };
    }
    default:
      return { text: `${name} 的一条通知` };
  }
}

export function NotificationsView() {
  const router = useRouter();
  const qc = useQueryClient();
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  const { data: list, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(undefined, 50),
  });

  // 进入页面即清掉互动消息红点
  useEffect(() => {
    markAllRead('moments').then(() => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新通知到达时刷新列表
  useEffect(() => {
    const s = getSocket();
    const onNew = () => qc.invalidateQueries({ queryKey: ['notifications'] });
    s.on('notification:new', onNew);
    return () => {
      s.off('notification:new', onNew);
    };
  }, [qc]);

  const unreadCount = list?.filter((n) => !n.readAt).length ?? 0;

  async function clearAll() {
    try {
      await markAllRead();
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast('已全部标为已读', 'success');
    } catch (e) {
      toast((e as Error).message || '操作失败', 'error');
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="rounded p-1.5 text-subtext hover:bg-black/5">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold">消息</h1>
        </div>
        <button
          onClick={clearAll}
          disabled={unreadCount === 0}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-subtext hover:bg-black/5 disabled:opacity-40"
          title="全部已读"
        >
          <BellOff size={14} /> 全部已读
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="text-primary" />
          </div>
        ) : !list || list.length === 0 ? (
          <EmptyState title="暂无消息" hint="赞、评论、好友请求等会显示在这里" />
        ) : (
          list.map((n) => {
            const { text, target } = describe(n);
            const unread = !n.readAt;
            return (
              <button
                key={n.id}
                onClick={() => target && router.push(target)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-panel',
                  unread && 'bg-primary/5',
                )}
              >
                <div className="relative">
                  <Avatar src={n.actor.avatar} name={displayName(n.actor)} size={40} />
                  {unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text">{text}</span>
                    <span className="shrink-0 text-[11px] text-subtext">{formatTime(n.createdAt)}</span>
                  </div>
                  {(n.type === 'MOMENT_COMMENT' || n.type === 'MOMENT_REPLY') && (
                    <p className="mt-0.5 truncate text-xs text-subtext">
                      {(n.payload as Record<string, unknown> | null)?.content as string | undefined}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
