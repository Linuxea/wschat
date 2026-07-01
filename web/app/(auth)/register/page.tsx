'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/lib/auth-store';
import { Button, Input } from '@/components/ui';
import { toast } from '@/components/toaster';

const SECURITY_QUESTIONS = [
  '您的小学名称是？',
  '您最喜欢的水果是？',
  '您的出生城市是？',
  '您宠物的名字是？',
];

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({
    username: '',
    password: '',
    nickname: '',
    securityQuestion: SECURITY_QUESTIONS[0],
    securityAnswer: '',
  });
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
        '/auth/register',
        form,
      );
      setAuth(data);
      toast('注册成功', 'success');
      router.push('/chat');
    } catch (err) {
      toast((err as Error).message || '注册失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold text-text">注册</h1>
      <div className="space-y-3">
        <Input placeholder="用户名 (3-20 位字母数字)" value={form.username} onChange={(e) => update('username', e.target.value)} />
        <Input type="password" placeholder="密码 (至少 6 位)" value={form.password} onChange={(e) => update('password', e.target.value)} />
        <Input placeholder="昵称" value={form.nickname} onChange={(e) => update('nickname', e.target.value)} />
        <div>
          <label className="mb-1 block text-xs text-subtext">密保问题</label>
          <select
            className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
            value={form.securityQuestion}
            onChange={(e) => update('securityQuestion', e.target.value)}
          >
            {SECURITY_QUESTIONS.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <Input placeholder="密保答案" value={form.securityAnswer} onChange={(e) => update('securityAnswer', e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? '注册中…' : '注册'}
      </Button>
      <div className="text-center text-sm text-subtext">
        已有账号？{' '}
        <Link href="/login" className="text-primary hover:underline">去登录</Link>
      </div>
    </form>
  );
}
