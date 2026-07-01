'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { toast } from '@/components/toaster';
import { Avatar, Input } from '@/components/ui';
import { cn, formatTime } from '@/lib/utils';
import type { MomentView } from '@/lib/types';

const VIS_LABEL: Record<string, string> = {
  PUBLIC: '公开',
  FRIENDS: '仅好友',
  PRIVATE: '仅自己',
  SPECIFIED: '部分可见',
};

export function MomentCard({ moment }: { moment: MomentView }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; nickname: string } | null>(null);
  const isMine = moment.author.id === me?.id;

  const userNames = useMemo(() => {
    const m = new Map<string, string>();
    m.set(moment.author.id, moment.author.nickname);
    for (const c of moment.comments) m.set(c.user.id, c.user.nickname);
    return m;
  }, [moment]);

  async function like() {
    try {
      await api.post(`/moments/${moment.id}/like`);
      qc.invalidateQueries({ queryKey: ['moments', 'feed'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function sendComment() {
    if (!comment.trim()) return;
    try {
      await api.post(`/moments/${moment.id}/comments`, {
        content: comment.trim(),
        replyToUserId: replyTo?.id,
      });
      setComment('');
      setCommenting(false);
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ['moments', 'feed'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function del() {
    if (!confirm('删除这条朋友圈？')) return;
    try {
      await api.del(`/moments/${moment.id}`);
      qc.invalidateQueries({ queryKey: ['moments', 'feed'] });
      toast('已删除', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="flex gap-3 px-4 py-4">
      <Avatar src={moment.author.avatar} name={moment.author.nickname} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-primary">{moment.author.nickname}</span>
          <span className="rounded bg-black/5 px-1.5 text-[10px] text-subtext">
            {VIS_LABEL[moment.visibility] || moment.visibility}
          </span>
        </div>

        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text">{moment.content}</p>

        {moment.media && moment.media.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-1">
            {moment.media.map((m, i) => (
              <div key={i} className="overflow-hidden rounded">
                {m.type === 'video' ? (
                  <video src={m.url} controls className="h-28 w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-28 w-full object-cover" />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-1 text-xs text-subtext">{formatTime(moment.createdAt)}</div>

        {/* actions */}
        <div className="mt-2 flex items-center gap-3 text-subtext">
          <button onClick={like} className={cn('flex items-center gap-1 text-xs hover:text-primary', moment.likedByMe && 'text-primary')}>
            <Heart size={14} fill={moment.likedByMe ? 'currentColor' : 'none'} />
            {moment.likeCount > 0 && moment.likeCount}
          </button>
          <button onClick={() => setCommenting((v) => !v)} className="flex items-center gap-1 text-xs hover:text-primary">
            <MessageCircle size={14} />
            {moment.commentCount > 0 && moment.commentCount}
          </button>
          {isMine && (
            <button onClick={del} className="ml-auto text-xs hover:text-red-500">
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* comments */}
        {(moment.comments.length > 0 || commenting) && (
          <div className="mt-2 rounded-md bg-panel p-2">
            {moment.comments.map((c) => (
              <div
                key={c.id}
                className="cursor-pointer rounded px-1 py-0.5 text-xs hover:bg-black/5"
                onClick={() => {
                  setReplyTo({ id: c.user.id, nickname: c.user.nickname });
                  setCommenting(true);
                }}
              >
                <span className="font-medium text-primary">{c.user.nickname}</span>
                {c.replyToUserId && c.replyToUserId !== c.user.id && (
                  <span className="text-subtext">
                    {' '}回复 {userNames.get(c.replyToUserId) ?? '该用户'}
                  </span>
                )}
                <span className="text-text">：{c.content}</span>
              </div>
            ))}
            {commenting && (
              <div className="mt-2">
                {replyTo && (
                  <div className="mb-1 flex items-center justify-between text-[11px] text-subtext">
                    <span>回复 {replyTo.nickname}</span>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="text-subtext hover:text-text"
                    >
                      取消回复
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                    placeholder={replyTo ? `回复 ${replyTo.nickname}` : '说点什么…'}
                    className="h-8 text-xs"
                    autoFocus
                  />
                  <button onClick={sendComment} className="rounded bg-primary px-3 text-xs text-white">
                    发送
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
