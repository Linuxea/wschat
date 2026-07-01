'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
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
  const connected = useRef(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (accessToken && !connected.current) {
      connected.current = true;
      connectSocket();
      const s = getSocket();
      s.on('connect', () => console.debug('[ws] connected'));
      s.on('disconnect', () => console.debug('[ws] disconnected'));
    }
    if (!accessToken && connected.current) {
      connected.current = false;
      disconnectSocket();
    }
  }, [accessToken]);

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
