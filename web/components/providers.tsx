'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useThemeStore } from '@/lib/theme-store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useNotificationStore } from '@/lib/notification-store';
import { useSoundStore } from '@/lib/sound-store';
import { playMessageAlert, unlockAudio } from '@/lib/sound';
import type { ConversationView, MessageView } from '@/lib/types';
import { Toaster } from '@/components/toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
        },
      }),
  );

  const init = useAuthStore((s) => s.init);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const initTheme = useThemeStore((s) => s.init);
  const initSound = useSoundStore((s) => s.init);
  const connected = useRef(false);
  const fetchBadges = useNotificationStore((s) => s.fetchBadges);
  const onSocketBadge = useNotificationStore((s) => s.onSocketBadge);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    init();
    initTheme();
    initSound();
  }, [init, initTheme, initSound]);

  // 解除浏览器对 AudioContext 的自动播放限制：首次交互后解锁
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUserGesture = () => unlockAudio();
    window.addEventListener('pointerdown', onUserGesture);
    window.addEventListener('keydown', onUserGesture);
    return () => {
      window.removeEventListener('pointerdown', onUserGesture);
      window.removeEventListener('keydown', onUserGesture);
    };
  }, []);

  useEffect(() => {
    if (accessToken && !connected.current) {
      connected.current = true;
      connectSocket();
      fetchBadges(); //登录后立即拉取红点
      const s = getSocket();
      s.on('connect', () => console.debug('[ws] connected'));
      s.on('disconnect', () => console.debug('[ws] disconnected'));
      // 通知红点：服务端推送的新通知 + badge 更新
      s.on('notification:new', () => fetchBadges());
      s.on('notification:badge', onSocketBadge);
      // 新消息：刷新聊天红点 + 按规则播放提示音
      s.on('message:new', (m: MessageView) => {
        fetchBadges();
        const { enabled, volume } = useSoundStore.getState();
        if (!enabled || volume <= 0) return;
        const meId = useAuthStore.getState().user?.id;
        if (!meId || !m) return;
        if (m.senderId === meId) return; // 自己发的消息不响
        // 前台且正看该会话 → 静音
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          const activeId = pathnameRef.current.startsWith('/chat/')
            ? pathnameRef.current.slice('/chat/'.length)
            : null;
          if (activeId === m.conversationId) return;
        }
        // 会话级免打扰 → 静音
        const convs = qc.getQueryData<ConversationView[]>(['conversations']);
        if (convs) {
          const conv = convs.find((c) => c.id === m.conversationId);
          if (conv?.muted) return;
        }
        const isMention = Array.isArray(m.mentions) && m.mentions.includes(meId);
        playMessageAlert(isMention ? 'mention' : 'normal', volume);
      });
    }
    if (!accessToken && connected.current) {
      connected.current = false;
      disconnectSocket();
    }
  }, [accessToken, fetchBadges, onSocketBadge, qc]);

  useEffect(() => {
    const onExpired = () => {
      logout();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [logout]);

  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
