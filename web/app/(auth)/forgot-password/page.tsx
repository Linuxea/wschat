'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { toast } from '@/components/toaster';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'username' | 'reset'>('username');
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function fetchQuestion(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.get<{ securityQuestion: string }>(
        `/auth/security-question?username=${encodeURIComponent(username.trim())}`,
      );
      setQuestion(data.securityQuestion);
      setStep('reset');
    } catch (err) {
      toast((err as Error).message || '用户不存在', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        username: username.trim(),
        securityAnswer: answer,
        newPassword,
      });
      toast('密码已重置，请重新登录', 'success');
      router.push('/login');
    } catch (err) {
      toast((err as Error).message || '重置失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'username') {
    return (
      <form onSubmit={fetchQuestion} className="space-y-4">
        <h1 className="text-xl font-semibold text-wechat-text">找回密码</h1>
        <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <Button type="submit" className="w-full" disabled={loading || !username}>
          {loading ? '查询中…' : '下一步'}
        </Button>
        <div className="text-center text-sm text-wechat-subtext">
          <Link href="/login" className="text-wechat-green hover:underline">返回登录</Link>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={reset} className="space-y-4">
      <h1 className="text-xl font-semibold text-wechat-text">重置密码</h1>
      <div className="rounded-md bg-wechat-panel px-3 py-2 text-sm">
        <span className="text-wechat-subtext">密保问题：</span>
        {question}
      </div>
      <Input placeholder="密保答案" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
      <Input type="password" placeholder="新密码 (至少 6 位)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      <Button type="submit" className="w-full" disabled={loading || !answer || !newPassword}>
        {loading ? '重置中…' : '重置密码'}
      </Button>
    </form>
  );
}
