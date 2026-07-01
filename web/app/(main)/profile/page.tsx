'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, LogOut, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { disconnectSocket } from '@/lib/socket';
import { toast } from '@/components/toaster';
import { Avatar, Button, Input, Textarea } from '@/components/ui';
import type { PublicUser } from '@/lib/types';

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
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
    <div className="flex h-full w-full justify-center bg-wechat-bg">
      <div className="w-full max-w-md bg-white">
        <header className="flex h-14 items-center border-b border-wechat-border px-5">
          <h1 className="text-lg font-semibold">个人信息</h1>
        </header>

        <div className="p-6">
          <div className="flex flex-col items-center gap-3">
            <button onClick={() => avatarInput.current?.click()} className="relative" title="更换头像">
              <Avatar src={user.avatar} name={user.nickname} size={80} />
              <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-wechat-green text-white ring-2 ring-white">
                <Camera size={12} />
              </span>
            </button>
            <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onAvatar} />
            <div className="text-sm text-wechat-subtext">@{user.username}</div>
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

          <div className="mt-8 border-t border-wechat-border pt-4">
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
      <label className="mb-1 block text-xs font-medium text-wechat-subtext">{label}</label>
      {children}
    </div>
  );
}
