'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Check, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/components/toaster';
import { Avatar, Button, EmptyState, Input } from '@/components/ui';
import { FriendDetail, type FriendshipView } from './friend-detail';
import { CreateGroupModal } from './create-group-modal';
import type { PublicUser } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'friends' | 'requests' | 'search';

export function ContactsView() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>(sp.get('action') === 'search' ? 'search' : 'friends');
  const [selected, setSelected] = useState<FriendshipView | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get<FriendshipView[]>('/friends'),
  });
  const { data: incoming } = useQuery({
    queryKey: ['friends', 'incoming'],
    queryFn: () =>
      api.get<Array<{ id: string; message: string | null; from: PublicUser }>>(
        '/friends/requests/incoming',
      ),
  });

  return (
    <>
      <div className="flex h-full w-full flex-col bg-white">
        <header className="flex h-14 items-center justify-between border-b border-wechat-border px-4">
          <div className="flex gap-1">
            <TabBtn active={tab === 'friends'} onClick={() => setTab('friends')}>朋友</TabBtn>
            <TabBtn active={tab === 'requests'} onClick={() => setTab('requests')}>
              新朋友
              {(incoming?.length || 0) > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {incoming!.length}
                </span>
              )}
            </TabBtn>
            <TabBtn active={tab === 'search'} onClick={() => setTab('search')}>搜索</TabBtn>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            title="发起群聊"
            className="rounded p-1.5 text-wechat-subtext hover:bg-black/5 hover:text-wechat-green"
          >
            <Users size={18} />
          </button>
        </header>

        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {tab === 'friends' && <FriendsTab friends={friends} onSelect={setSelected} />}
          {tab === 'requests' && <RequestsTab />}
          {tab === 'search' && <SearchTab />}
        </div>
      </div>
      {selected && <FriendDetail fs={selected} onClose={() => setSelected(null)} />}
      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center rounded-md px-3 py-1.5 text-sm transition',
        active ? 'bg-wechat-green/10 text-wechat-green' : 'text-wechat-subtext hover:bg-black/5',
      )}
    >
      {children}
    </button>
  );
}

function FriendsTab({
  friends,
  onSelect,
}: {
  friends?: FriendshipView[];
  onSelect: (f: FriendshipView) => void;
}) {
  if (!friends) return <div className="p-4 text-center text-sm text-wechat-subtext">加载中…</div>;
  if (friends.length === 0) return <EmptyState title="还没有好友" hint="去「搜索」添加好友吧" />;
  const sorted = [...friends].sort((a, b) =>
    (a.remark || a.friend.nickname).localeCompare(b.remark || b.friend.nickname, 'zh'),
  );
  return (
    <div className="py-1">
      {sorted.map((f) => (
        <button
          key={f.id}
          onClick={() => onSelect(f)}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-wechat-panel"
        >
          <Avatar src={f.friend.avatar} name={f.remark || f.friend.nickname} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {f.remark || f.friend.nickname}
              {f.remark && <span className="ml-2 text-xs text-wechat-subtext">{f.friend.nickname}</span>}
            </div>
            {f.tags.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {f.tags.map((t) => (
                  <span key={t.tag.id} className="rounded bg-wechat-green/10 px-1.5 text-[10px] text-wechat-green">
                    {t.tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {f.isBlocked && <span className="text-[10px] text-red-400">已拉黑</span>}
        </button>
      ))}
    </div>
  );
}

function RequestsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['friends', 'incoming'],
    queryFn: () =>
      api.get<Array<{ id: string; message: string | null; from: PublicUser }>>(
        '/friends/requests/incoming',
      ),
  });

  async function act(id: string, accept: boolean) {
    try {
      await api.post(`/friends/requests/${id}/${accept ? 'accept' : 'reject'}`);
      toast(accept ? '已添加好友' : '已拒绝', 'success');
      qc.invalidateQueries({ queryKey: ['friends', 'incoming'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (isLoading) return <div className="p-4 text-center text-sm text-wechat-subtext">加载中…</div>;
  if (!data || data.length === 0) return <EmptyState title="没有新的好友请求" />;

  return (
    <div className="py-1">
      {data.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-wechat-panel">
          <Avatar src={r.from.avatar} name={r.from.nickname} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.from.nickname}</div>
            <div className="truncate text-xs text-wechat-subtext">
              {r.message || `我是 ${r.from.nickname}`}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => act(r.id, true)} className="rounded-md bg-wechat-green px-3 py-1 text-xs text-white hover:bg-wechat-greenDark">
              接受
            </button>
            <button onClick={() => act(r.id, false)} className="rounded-md border border-wechat-border px-3 py-1 text-xs hover:bg-wechat-panel">
              拒绝
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchTab() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);

  async function doSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      setResults(await api.get<PublicUser[]>(`/users/search?q=${encodeURIComponent(q.trim())}`));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  }

  async function add(toId: string) {
    try {
      await api.post('/friends/requests', { toId, message: '想和你交个朋友' });
      toast('好友请求已发送', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="p-4">
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="按用户名搜索" />
        <Button onClick={doSearch} disabled={searching}>
          <Search size={16} />
        </Button>
      </div>
      <div className="mt-4">
        {results.length === 0 && q && !searching && (
          <p className="text-center text-sm text-wechat-subtext">没有找到用户</p>
        )}
        {results.map((u) => (
          <div key={u.id} className="flex items-center gap-3 py-2.5">
            <Avatar src={u.avatar} name={u.nickname} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.nickname}</div>
              <div className="text-xs text-wechat-subtext">@{u.username}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => add(u.id)}>
              <UserPlus size={14} /> 加好友
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
