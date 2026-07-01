'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/components/toaster';
import { Avatar, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { FriendshipView } from './friend-detail';

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get<FriendshipView[]>('/friends'),
  });

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!name.trim() || selected.size === 0) return;
    setCreating(true);
    try {
      const g = await api.post<{ id: string }>('/groups', {
        name: name.trim(),
        memberIds: [...selected],
      });
      toast('群已创建', 'success');
      onClose();
      router.push(`/chat/${g.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[380px] rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">发起群聊</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">
            <X size={18} />
          </button>
        </div>
        <Input placeholder="群名称" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="mt-2 text-xs text-subtext">
          已选 {selected.size} 位成员（至少 1 位）
        </div>
        <div className="scrollbar-thin mt-2 max-h-64 overflow-y-auto">
          {friends?.map((f) => {
            const sel = selected.has(f.friendId);
            return (
              <button
                key={f.id}
                onClick={() => toggle(f.friendId)}
                className={cn('flex w-full items-center gap-2 rounded px-2 py-2 hover:bg-panel', sel && 'bg-primary/5')}
              >
                <Avatar src={f.friend.avatar} name={f.remark || f.friend.nickname} size={32} />
                <span className="flex-1 text-left text-sm">{f.remark || f.friend.nickname}</span>
                <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-white', sel ? 'border-primary bg-primary' : 'border-border')}>
                  {sel && '✓'}
                </span>
              </button>
            );
          })}
          {friends && friends.length === 0 && (
            <p className="py-6 text-center text-sm text-subtext">还没有好友</p>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={create} disabled={creating || !name.trim() || selected.size === 0}>
            创建 ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  );
}
