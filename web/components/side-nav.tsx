'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle, Users, Camera, Settings } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { useAuthStore } from '@/lib/auth-store';
import { useNotificationStore } from '@/lib/notification-store';
import { cn } from '@/lib/utils';

type NavKey = 'chat' | 'contacts' | 'moments' | 'profile';

const NAV: Array<{ href: string; icon: typeof MessageCircle; label: string; key: NavKey }> = [
  { href: '/chat', icon: MessageCircle, label: '聊天', key: 'chat' },
  { href: '/contacts', icon: Users, label: '通讯录', key: 'contacts' },
  { href: '/moments', icon: Camera, label: '朋友圈', key: 'moments' },
  { href: '/profile', icon: Settings, label: '我', key: 'profile' },
];

function Badge({ count, dot = false }: { count: number; dot?: boolean }) {
  if (count <= 0) return null;
  if (dot) {
    return (
      <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-rail" />
    );
  }
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-rail">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const badges = useNotificationStore((s) => s.badges);

  const counts: Record<NavKey, number> = {
    chat: badges.chat,
    contacts: badges.contacts,
    moments: badges.moments,
    profile: 0,
  };

  return (
    <nav className="flex w-16 flex-col items-center justify-between border-r border-border bg-rail py-4 backdrop-blur-xl">
      <div className="flex flex-1 flex-col items-center gap-1 pt-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          const count = counts[item.key];
          // 朋友圈用红点（无数字，微信风格）；聊/通讯录用数字
          const useDot = item.key === 'moments';
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'relative flex h-11 w-11 flex-col items-center justify-center rounded-lg transition-colors',
                active ? 'bg-primary/10 text-primary' : 'text-subtext hover:bg-black/5 hover:text-text',
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <Badge count={count} dot={useDot} />
            </Link>
          );
        })}
      </div>
      <div className="flex flex-col items-center gap-2">
        <ThemeSwitcher />
        <button
          onClick={() => router.push('/profile')}
          className="rounded-full ring-2 ring-transparent transition hover:ring-black/20"
          title="我"
        >
          <Avatar src={user?.avatar} name={user?.nickname || user?.username || '我'} size={36} />
        </button>
      </div>
    </nav>
  );
}
