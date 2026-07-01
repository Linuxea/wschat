'use client';

import { useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Smile, Image as ImageIcon, FileText, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { sendMessage } from '@/lib/socket';
import { toast } from '@/components/toaster';
import { cn } from '@/lib/utils';

interface Props {
  conversationId: string;
  onSent: () => void;
}

export function MessageInput({ conversationId, onSent }: Props) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const fileImg = useRef<HTMLInputElement>(null);
  const fileDoc = useRef<HTMLInputElement>(null);

  async function sendText() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await sendMessage({
        conversationId,
        type: 'TEXT',
        content: t,
        clientMsgId: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      setText('');
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
    <div className="relative border-t border-wechat-border bg-wechat-panel">
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
      <div className="flex items-end gap-2 px-3 py-2">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          className={cn('rounded p-1.5 text-wechat-subtext hover:bg-black/5', showEmoji && 'text-wechat-green')}
          title="表情"
        >
          <Smile size={20} />
        </button>
        <button onClick={() => fileImg.current?.click()} className="rounded p-1.5 text-wechat-subtext hover:bg-black/5" title="图片">
          <ImageIcon size={20} />
        </button>
        <button onClick={() => fileDoc.current?.click()} className="rounded p-1.5 text-wechat-subtext hover:bg-black/5" title="文件/视频">
          <FileText size={20} />
        </button>
        <input ref={fileImg} type="file" accept="image/*" hidden onChange={onImage} />
        <input ref={fileDoc} type="file" hidden onChange={onFile} />
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          className="scrollbar-thin max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-wechat-border bg-white px-3 py-2 text-sm outline-none focus:border-wechat-green"
        />
        <button
          onClick={sendText}
          disabled={!text.trim() || sending}
          className="rounded-md bg-wechat-green px-4 py-2 text-sm text-white transition hover:bg-wechat-greenDark disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
