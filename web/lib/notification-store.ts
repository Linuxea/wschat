import { create } from 'zustand';
import { api } from './api';
import type { Badges, NotificationView } from './types';

interface NotificationState {
  badges: Badges;
  fetchBadges: () => Promise<void>;
  onSocketBadge: (b: Badges) => void;
  markAllRead: (type?: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  badges: { chat: 0, contacts: 0, moments: 0 },

  fetchBadges: async () => {
    try {
      const b = await api.get<Badges>('/notifications/badges');
      set({ badges: b });
    } catch {
      /* ignore — badges are non-critical */
    }
  },

  onSocketBadge: (b) => set({ badges: b }),

  markAllRead: async (type) => {
    try {
      await api.post('/notifications/read-all', type ? { type } : undefined);
    } catch {
      /* ignore */
    }
  },
}));

// 通知列表的本地读取/标记已读辅助（页面用 TanStack Query 管理缓存，这里只放纯调用）
export async function fetchNotifications(before?: string, limit = 50) {
  const qs = before ? `?before=${encodeURIComponent(before)}&limit=${limit}` : `?limit=${limit}`;
  return api.get<NotificationView[]>(`/notifications${qs}`);
}

export async function markNotificationRead(id: string) {
  return api.post(`/notifications/${id}/read`);
}
