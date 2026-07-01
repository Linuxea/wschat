'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/lib/auth-store';
import { Button, Input } from '@/components/ui';
import { toast } from '@/components/toaster';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
        '/auth/login',
        { username: username.trim(), password },
      );
      setAuth(data);
      toast('登录成功', 'success');
      router.push('/chat');
    } catch (err) {
      toast((err as Error).message || '登录失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold text-wechat-text">登录</h1>
      <div className="space-y-3">
        <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !username || !password}>
        {loading ? '登录中…' : '登录'}
      </Button>
      <div className="flex items-center justify-between text-sm text-wechat-subtext">
        <Link href="/register" className="hover:text-wechat-green">注册新账号</Link>
        <Link href="/forgot-password" className="hover:text-wechat-green">忘记密码？</Link>
      </div>
    </form>
  );
}
