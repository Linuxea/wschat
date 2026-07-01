'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, MessageCircle, Ban, ShieldOff } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/components/toaster';
import { Avatar, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ConversationView } from '@/lib/types';

export interface FriendshipView {
  id: string;
  ownerId: string;
  friendId: string;
  remark: string | null;
  isBlocked: boolean;
  momentsBlocked: boolean;
  friend: {
    id: string;
    username: string;
    nickname: string;
    avatar: string | null;
    bio: string | null;
  };
  tags: Array<{ tag: { id: string; name: string } }>;
}

export function FriendDetail({
  fs,
  onClose,
}: {
  fs: FriendshipView;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [remark, setRemark] = useState(fs.remark || '');

  const { data: tags } = useQueryTags();

  async function saveRemark() {
    try {
      await api.patch(`/friends/${fs.friendId}`, { remark: remark || null });
      toast('备注已更新', 'success');
      qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function toggleBlock() {
    try {
      if (fs.isBlocked) {
        await api.del(`/friends/${fs.friendId}/block`);
        toast('已取消拉黑', 'success');
      } else {
        await api.post(`/friends/${fs.friendId}/block`);
        toast('已拉黑', 'success');
      }
      qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function toggleMomentsBlock() {
    try {
      if (fs.momentsBlocked) {
        await api.del(`/friends/${fs.friendId}/moments-block`);
      } else {
        await api.post(`/friends/${fs.friendId}/moments-block`);
      }
      toast(fs.momentsBlocked ? '已取消屏蔽朋友圈' : '已屏蔽对方朋友圈', 'success');
      qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function toggleTag(tagId: string, selected: boolean) {
    const current = fs.tags.map((t) => t.tag.id);
    const next = selected ? [...current, tagId] : current.filter((id) => id !== tagId);
    try {
      await api.post(`/friends/${fs.friendId}/tags`, { tagIds: next });
      qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function createTag(name: string) {
    try {
      await api.post('/friends/tags', { name });
      qc.invalidateQueries({ queryKey: ['tags'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function startChat() {
    const convs = await api.get<ConversationView[]>('/conversations');
    const priv = convs.find(
      (c) => c.type === 'PRIVATE' && c.members.some((m) => m.userId === fs.friendId),
    );
    if (priv) router.push(`/chat/${priv.id}`);
    else toast('会话不存在', 'error');
  }

  const selectedTagIds = new Set(fs.tags.map((t) => t.tag.id));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[360px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">好友详情</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Avatar src={fs.friend.avatar} name={fs.friend.nickname} size={56} />
          <div className="min-w-0">
            <div className="truncate font-medium">{fs.remark || fs.friend.nickname}</div>
            <div className="text-xs text-subtext">@{fs.friend.username}</div>
            {fs.friend.bio && <div className="truncate text-xs text-subtext">{fs.friend.bio}</div>}
          </div>
        </div>

        <button
          onClick={startChat}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm text-white hover:bg-primary-hover"
        >
          <MessageCircle size={16} /> 发消息
        </button>

        {/* remark */}
        <Section title="备注名">
          <div className="flex gap-2">
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="设置备注" />
            <Button variant="outline" size="md" onClick={saveRemark}>保存</Button>
          </div>
        </Section>

        {/* tags */}
        <Section title="标签">
          <div className="flex flex-wrap gap-2">
            {tags?.map((t) => {
              const sel = selectedTagIds.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.id, !sel)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    sel ? 'border-primary bg-primary/10 text-primary' : 'border-border text-subtext',
                  )}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <NewTagInput onCreate={createTag} />
        </Section>

        {/* actions */}
        <Section title="权限">
          <ActionRow
            icon={<Ban size={16} />}
            label={fs.isBlocked ? '已拉黑 — 点击取消' : '加入黑名单'}
            danger={!fs.isBlocked}
            active={fs.isBlocked}
            onClick={toggleBlock}
          />
          <ActionRow
            icon={<ShieldOff size={16} />}
            label={fs.momentsBlocked ? '已屏蔽朋友圈 — 点击取消' : '不看他/她的朋友圈'}
            active={fs.momentsBlocked}
            onClick={toggleMomentsBlock}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-medium text-subtext">{title}</div>
      {children}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm',
        danger ? 'text-red-500 hover:bg-red-50' : active ? 'bg-primary/10 text-primary' : 'hover:bg-panel',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function NewTagInput({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="mt-2 flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="新标签名" className="h-8 text-xs" />
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (name.trim()) {
            onCreate(name.trim());
            setName('');
          }
        }}
      >
        创建
      </Button>
    </div>
  );
}

function useQueryTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/friends/tags'),
  });
}
