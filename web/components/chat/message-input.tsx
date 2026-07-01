'use client';

import { useMemo, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Smile, Image as ImageIcon, FileText, Send, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { sendMessage } from '@/lib/socket';
import { toast } from '@/components/toaster';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ConversationMember } from '@/lib/types';

/** '@所有人' 的哨兵值，与服务端 ALL_SENTINEL 保持一致 */
export const ALL_SENTINEL = '__all__';

interface Mention {
  key: string; //userId 或 '__all__'
  label: string; //插入文本里的 @label
}

interface Props {
  conversationId: string;
  onSent: () => void;
  members: ConversationMember[];
  conversationType: 'PRIVATE' | 'GROUP';
}

function memberLabel(m: ConversationMember): string {
  return m.remark || m.nickname || m.username;
}

export function MessageInput({ conversationId, onSent, members, conversationType }: Props) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const fileImg = useRef<HTMLInputElement>(null);
  const fileDoc = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const atIndexRef = useRef<number>(-1); //'@' 字符在文本中的位置

  const isGroup = conversationType === 'GROUP';

  //浮层候选：首项「所有人」，其余按 query 过滤成员
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter((m) => {
      const label = memberLabel(m).toLowerCase();
      const uname = m.username.toLowerCase();
      return !q || label.includes(q) || uname.includes(q);
    });
    const showAll = !q || '所有人'.includes(q) || 'all'.includes(q) || '@所有人'.includes(q);
    const allEntry: Mention & { isAll: true } = { key: ALL_SENTINEL, label: '所有人', isAll: true } as never;
    const items: Array<Mention & { member?: ConversationMember; isAll?: boolean }> = [];
    if (showAll && isGroup) items.push(allEntry);
    for (const m of list) items.push({ key: m.userId, label: memberLabel(m), member: m });
    return items;
  }, [members, query, isGroup]);

  function detectMention(value: string, caret: number) {
    if (!isGroup) {
      setPickerOpen(false);
      return;
    }
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at < 0) {
      setPickerOpen(false);
      return;
    }
    // @ 必须出现在行首或紧跟空白之后（避免邮箱误触发）
    const prev = at === 0 ? '' : before[at - 1];
    if (prev && !/\s/.test(prev)) {
      setPickerOpen(false);
      return;
    }
    const seg = before.slice(at + 1);
    // query 段不能含空白（含空白说明已结束）
    if (/\s/.test(seg)) {
      setPickerOpen(false);
      return;
    }
    atIndexRef.current = at;
    setQuery(seg);
    setActiveIdx(0);
    setPickerOpen(true);
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    detectMention(v, e.target.selectionStart ?? v.length);
  }

  function insertMention(item: Mention & { member?: ConversationMember; isAll?: boolean }) {
    const ta = taRef.current;
    const at = atIndexRef.current;
    if (!ta || at < 0) return;
    const caret = ta.selectionStart ?? text.length;
    const before = text.slice(0, at);
    const after = text.slice(caret);
    const token = `@${item.label} `;
    const next = before + token + after;
    setText(next);
    setMentions((ms) => (ms.some((m) => m.key === item.key) ? ms : [...ms, { key: item.key, label: item.label }]));
    setPickerOpen(false);
    setQuery('');
    atIndexRef.current = -1;
    //光标移到插入 token 之后
    requestAnimationFrame(() => {
      const pos = (before + token).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  function onPickerKeyDown(e: React.KeyboardEvent) {
    if (!pickerOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, candidates.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (candidates[activeIdx]) {
        e.preventDefault();
        insertMention(candidates[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPickerOpen(false);
    }
  }

  async function sendText() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    // 仅保留文本中仍存在的 @label 对应的 mention
    const validKeys = mentions.filter((m) => t.includes(`@${m.label}`)).map((m) => m.key);
    const uniqueKeys = Array.from(new Set(validKeys));
    try {
      await sendMessage({
        conversationId,
        type: 'TEXT',
        content: t,
        clientMsgId: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...(uniqueKeys.length ? { mentions: uniqueKeys } : {}),
      });
      setText('');
      setMentions([]);
      onSent();
    } catch (e) {
      toast((e as Error).message || '发送失败', 'error');
    } finally {
      setSending(false);
    }
  }

  async function sendEmoji(emoji: string) {
    try {
      await sendMessage({
        conversationId,
        type: 'EMOJI',
        content: emoji,
        clientMsgId: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      onSent();
    } catch (e) {
      toast((e as Error).message || '发送失败', 'error');
    }
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const up = await api.upload(f);
      await sendMessage({
        conversationId,
        type: 'IMAGE',
        content: JSON.stringify({ url: up.url, size: up.size }),
        clientMsgId: `i-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      onSent();
    } catch (err) {
      toast((err as Error).message || '上传失败', 'error');
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const up = await api.upload(f);
      await sendMessage({
        conversationId,
        type: f.type.startsWith('video/') ? 'VIDEO' : 'FILE',
        content: JSON.stringify({ url: up.url, name: f.name, size: f.size, mimeType: up.mimeType }),
        clientMsgId: `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      onSent();
    } catch (err) {
      toast((err as Error).message || '上传失败', 'error');
    }
  }

  return (
    <div className="relative border-t border-border bg-panel backdrop-blur-xl">
      {showEmoji && (
        <div className="absolute bottom-full left-2 z-20">
          <Picker
            data={data}
            onEmojiSelect={(e: any) => {
              sendEmoji(e.native);
              setShowEmoji(false);
            }}
            theme="light"
            previewPosition="none"
            locale="zh"
          />
        </div>
      )}
      {/* @成员浮层 */}
      {pickerOpen && candidates.length > 0 && (
        <div className="absolute bottom-full left-10 z-30 mb-1 max-h-60 w-56 overflow-y-auto rounded-md border border-border bg-white py-1 shadow-lg scrollbar-thin">
          {candidates.map((item, i) => (
            <button
              key={item.key}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => insertMention(item)}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm',
                i === activeIdx ? 'bg-primary/10' : 'hover:bg-panel',
              )}
            >
              {item.isAll ? (
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/15 text-primary">
                  <Users size={16} />
                </div>
              ) : (
                <Avatar src={item.member?.avatar} name={item.label} size={28} />
              )}
              <span className="truncate">
                {item.isAll ? (
                  <span className="font-medium text-primary">所有人</span>
                ) : (
                  item.label
                )}
                {!!item.member && item.member.username !== item.label && (
                  <span className="ml-1 text-[11px] text-subtext">@{item.member.username}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 px-3 py-2">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          className={cn('rounded p-1.5 text-subtext hover:bg-black/5', showEmoji && 'text-primary')}
          title="表情"
        >
          <Smile size={20} />
        </button>
        <button onClick={() => fileImg.current?.click()} className="rounded p-1.5 text-subtext hover:bg-black/5" title="图片">
          <ImageIcon size={20} />
        </button>
        <button onClick={() => fileDoc.current?.click()} className="rounded p-1.5 text-subtext hover:bg-black/5" title="文件/视频">
          <FileText size={20} />
        </button>
        <input ref={fileImg} type="file" accept="image/*" hidden onChange={onImage} />
        <input ref={fileDoc} type="file" hidden onChange={onFile} />
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={(e) => {
            if (pickerOpen) {
              onPickerKeyDown(e);
              if (e.defaultPrevented) return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder={isGroup ? '输入消息，@ 提及成员，Enter 发送' : '输入消息，Enter 发送，Shift+Enter 换行'}
          className="scrollbar-thin max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={sendText}
          disabled={!text.trim() || sending}
          className="rounded-md bg-primary px-4 py-2 text-sm text-white transition hover:bg-primary-hover disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
