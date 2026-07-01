'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle, Users, Camera, Settings } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/chat', icon: MessageCircle, label: '聊天' },
  { href: '/contacts', icon: Users, label: '通讯录' },
  { href: '/moments', icon: Camera, label: '朋友圈' },
  { href: '/profile', icon: Settings, label: '我' },
];

export function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  return (
    <nav className="flex w-16 flex-col items-center justify-between border-r border-wechat-border bg-[#2e2e2e] py-4">
      <div className="flex flex-1 flex-col items-center gap-1 pt-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'flex h-11 w-11 flex-col items-center justify-center rounded-lg transition-colors',
                active ? 'bg-white/10 text-wechat-green' : 'text-gray-400 hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
            </Link>
          );
        })}
      </div>
      <button
        onClick={() => router.push('/profile')}
        className="rounded-full ring-2 ring-transparent transition hover:ring-white/30"
        title="我"
      >
        <Avatar src={user?.avatar} name={user?.nickname || user?.username || '我'} size={36} />
      </button>
    </nav>
  );
}
