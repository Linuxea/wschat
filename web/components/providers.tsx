'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useThemeStore } from '@/lib/theme-store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useNotificationStore } from '@/lib/notification-store';
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
  const connected = useRef(false);
  const fetchBadges = useNotificationStore((s) => s.fetchBadges);
  const onSocketBadge = useNotificationStore((s) => s.onSocketBadge);

  useEffect(() => {
    init();
    initTheme();
  }, [init, initTheme]);

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
      // 聊天红点：新消息会改变会话未读数，刷新 badge
      s.on('message:new', () => fetchBadges());
    }
    if (!accessToken && connected.current) {
      connected.current = false;
      disconnectSocket();
    }
  }, [accessToken, fetchBadges, onSocketBadge]);

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
