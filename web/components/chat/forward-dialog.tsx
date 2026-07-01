'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { sendMessage } from '@/lib/socket';
import { useAuthStore } from '@/lib/auth-store';
import { toast } from '@/components/toaster';
import { Avatar, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ConversationMember, ConversationView, MessageView } from '@/lib/types';
import { conversationDisplay } from '@/lib/types';

interface Props {
  open: boolean;
  messages: MessageView[];
  memberMap: Map<string, ConversationMember>;
  onClose: () => void;
  onDone: () => void;
}

export function ForwardDialog({ open, messages, memberMap, onClose, onDone }: Props) {
  const me = useAuthStore((s) => s.user);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<ConversationView[]>('/conversations'),
    enabled: open,
  });

  async function doForward(mode: 'one_by_one' | 'merged') {
    if (!targetId || messages.length === 0 || sending) return;
    setSending(true);
    try {
      if (mode === 'one_by_one') {
        // 逐条：在目标会话按原 type/content 各发一条（图片转过去还是图片）
        for (const m of messages) {
          await sendMessage({
            conversationId: targetId,
            type: m.type,
            content: m.content,
            clientMsgId: `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          });
        }
      } else {
        // 合并：打包成一条 FORWARDED 聊天记录卡片（快照当时的昵称）
        const items = messages.map((m) => {
          const mem = memberMap.get(m.senderId);
          const name = mem ? mem.remark || mem.nickname || mem.username : '未知';
          return {
            senderName: name,
            senderId: m.senderId,
            type: m.type,
            content: m.content,
            ts: new Date(m.createdAt).getTime(),
          };
        });
        await sendMessage({
          conversationId: targetId,
          type: 'FORWARDED',
          content: JSON.stringify({ title: '聊天记录', items }),
          clientMsgId: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
      }
      onDone();
    } catch (e) {
      toast((e as Error).message || '转发失败', 'error');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-96 flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="font-medium">
            转发{messages.length > 0 ? ` ${messages.length} 条` : ''}
          </span>
          <button onClick={onClose} className="text-subtext hover:text-text">
            <X size={18} />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {!conversations || conversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-subtext">没有可转发的会话</div>
          ) : (
            conversations.map((c) => {
              const disp = conversationDisplay(c, me?.id || '');
              return (
                <button
                  key={c.id}
                  onClick={() => setTargetId(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left',
                    targetId === c.id ? 'bg-primary/10' : 'hover:bg-panel',
                  )}
                >
                  <Avatar src={disp.avatar} name={disp.name} size={36} />
                  <span className="truncate text-sm text-text">{disp.name}</span>
                </button>
              );
            })
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={() => doForward('one_by_one')}
            disabled={!targetId || sending}
          >
            逐条转发
          </Button>
          <Button
            onClick={() => doForward('merged')}
            disabled={!targetId || sending || messages.length < 2}
            title={messages.length < 2 ? '需选择 2 条以上' : undefined}
          >
            合并转发
          </Button>
        </footer>
      </div>
    </div>
  );
}
