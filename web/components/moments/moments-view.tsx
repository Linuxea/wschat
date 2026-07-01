'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Globe, Users, Lock, UserCheck, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { toast } from '@/components/toaster';
import { Avatar, Button, EmptyState, Spinner, Textarea } from '@/components/ui';
import { MomentCard } from './moment-card';
import type { MomentView } from '@/lib/types';

const VIS_OPTIONS = [
  { value: 'PUBLIC', label: '公开', icon: Globe },
  { value: 'FRIENDS', label: '仅好友', icon: Users },
  { value: 'PRIVATE', label: '仅自己', icon: Lock },
];

export function MomentsView() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState('FRIENDS');
  const [media, setMedia] = useState<Array<{ type: string; url: string }>>([]);
  const [posting, setPosting] = useState(false);

  const { data: feed, isLoading } = useQuery({
    queryKey: ['moments', 'feed'],
    queryFn: () => api.get<MomentView[]>('/moments/feed'),
  });

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      try {
        const up = await api.upload(f);
        setMedia((m) => [...m, { type: f.type.startsWith('video/') ? 'video' : 'image', url: up.url }]);
      } catch (err) {
        toast((err as Error).message || '上传失败', 'error');
      }
    }
  }

  async function publish() {
    if (!text.trim() && media.length === 0) return;
    setPosting(true);
    try {
      await api.post('/moments', { content: text.trim(), visibility, media });
      setText('');
      setMedia([]);
      setComposing(false);
      qc.invalidateQueries({ queryKey: ['moments', 'feed'] });
      toast('已发布', 'success');
    } catch (e) {
      toast((e as Error).message || '发布失败', 'error');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <header className="flex h-14 items-center justify-between border-b border-wechat-border px-5">
        <h1 className="text-lg font-semibold">朋友圈</h1>
        <button
          onClick={() => setComposing(true)}
          className="rounded p-2 text-wechat-subtext hover:bg-black/5 hover:text-wechat-green"
          title="发表"
        >
          <Camera size={20} />
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="text-wechat-green" />
          </div>
        ) : !feed || feed.length === 0 ? (
          <EmptyState title="朋友圈空空如也" hint="点右上角相机发表第一条" />
        ) : (
          feed.map((m) => <MomentCard key={m.id} moment={m} />)
        )}
      </div>

      {/* composer */}
      {composing && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-16 animate-fade-in" onClick={() => setComposing(false)}>
          <div className="w-[520px] max-w-[92vw] rounded-2xl bg-white p-5 shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <Avatar src={me?.avatar} name={me?.nickname || '我'} size={36} />
              <span className="font-medium">{me?.nickname}</span>
            </div>
            <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="这一刻的想法…" autoFocus />
            <div className="mt-2 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <div key={i} className="relative">
                  {m.type === 'video' ? (
                    <video src={m.url} className="h-20 w-20 rounded object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} className="h-20 w-20 rounded object-cover" />
                  )}
                  <button
                    onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
              {media.length < 9 && (
                <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded border border-dashed border-wechat-border text-wechat-subtext hover:bg-wechat-panel">
                  <ImagePlus size={20} />
                  <input type="file" accept="image/*,video/*" multiple hidden onChange={onPickImage} />
                </label>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1">
                {VIS_OPTIONS.map((v) => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.value}
                      onClick={() => setVisibility(v.value)}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                        visibility === v.value ? 'border-wechat-green bg-wechat-green/10 text-wechat-green' : 'border-wechat-border text-wechat-subtext'
                      }`}
                    >
                      <Icon size={12} /> {v.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setComposing(false)}>取消</Button>
                <Button size="sm" onClick={publish} disabled={posting || (!text.trim() && media.length === 0)}>
                  <Send size={14} /> 发表
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
