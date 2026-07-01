'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, LogOut, Save, Volume2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { disconnectSocket } from '@/lib/socket';
import { useSoundStore } from '@/lib/sound-store';
import { playMessageAlert } from '@/lib/sound';
import { toast } from '@/components/toaster';
import { Avatar, Button, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { PublicUser } from '@/lib/types';

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const soundEnabled = useSoundStore((s) => s.enabled);
  const soundVolume = useSoundStore((s) => s.volume);
  const setSoundEnabled = useSoundStore((s) => s.setEnabled);
  const setSoundVolume = useSoundStore((s) => s.setVolume);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setNickname(user.nickname);
      setBio(user.bio || '');
    }
  }, [user]);

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const up = await api.upload(f);
      const updated = await api.patch<PublicUser>('/users/me', { avatar: up.url });
      setUser(updated);
      toast('头像已更新', 'success');
    } catch (err) {
      toast((err as Error).message || '上传失败', 'error');
    }
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch<PublicUser>('/users/me', { nickname, bio });
      setUser(updated);
      toast('已保存', 'success');
    } catch (e) {
      toast((e as Error).message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function doLogout() {
    disconnectSocket();
    logout();
    router.push('/login');
  }

  if (!user) return null;

  return (
    <div className="flex h-full w-full justify-center bg-background">
      <div className="w-full max-w-md bg-white">
        <header className="flex h-14 items-center border-b border-border px-5">
          <h1 className="text-lg font-semibold">个人信息</h1>
        </header>

        <div className="p-6">
          <div className="flex flex-col items-center gap-3">
            <button onClick={() => avatarInput.current?.click()} className="relative" title="更换头像">
              <Avatar src={user.avatar} name={user.nickname} size={80} />
              <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white">
                <Camera size={12} />
              </span>
            </button>
            <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onAvatar} />
            <div className="text-sm text-subtext">@{user.username}</div>
          </div>

          <div className="mt-6 space-y-4">
            <Field label="昵称">
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </Field>
            <Field label="个性签名">
              <Textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="写点什么介绍自己…" />
            </Field>
            <Button onClick={save} disabled={saving} className="w-full">
              <Save size={16} /> {saving ? '保存中…' : '保存修改'}
            </Button>
          </div>

          <div className="mt-8 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2">
              <Volume2 size={16} className="text-subtext" />
              <h2 className="text-sm font-semibold text-text">消息提示音</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-subtext">接收新消息时播放</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundEnabled}
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                    soundEnabled ? 'bg-primary' : 'bg-black/15',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                      soundEnabled ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
              {soundEnabled && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-subtext">音量</span>
                    <button
                      type="button"
                      onClick={() => playMessageAlert('normal', soundVolume)}
                      className="text-xs text-primary hover:underline"
                    >
                      试听
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={soundVolume}
                    onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-border pt-4">
            <button
              onClick={doLogout}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-red-200 py-2.5 text-sm text-red-500 hover:bg-red-50"
            >
              <LogOut size={16} /> 退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-subtext">{label}</label>
      {children}
    </div>
  );
}
