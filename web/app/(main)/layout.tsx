'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { SideNav } from '@/components/side-nav';
import { CallOverlay } from '@/components/call/call-overlay';
import { Spinner } from '@/components/ui';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const init = useAuthStore((s) => s.init);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init();
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, [init]);

  useEffect(() => {
    if (ready && !accessToken) {
      router.replace('/login');
    }
  }, [ready, accessToken, router]);

  if (!ready || !accessToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-wechat-bg">
        <Spinner className="h-8 w-8 text-wechat-green" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SideNav />
      <div key={pathname} className="page-fade flex min-w-0 flex-1">{children}</div>
      <CallOverlay />
    </div>
  );
}
