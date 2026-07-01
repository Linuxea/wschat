import { create } from 'zustand';
import { setAccessToken } from './api';

export interface AuthUser {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  bio: string | null;
}

interface AuthData {
  user: AuthUser | null;
  accessToken: string;
  refreshToken: string;
}

const KEY = 'wschat-auth';

function loadFromStorage(): AuthData {
  if (typeof window === 'undefined') {
    return { user: null, accessToken: '', refreshToken: '' };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { user: null, accessToken: '', refreshToken: '' };
    return JSON.parse(raw) as AuthData;
  } catch {
    return { user: null, accessToken: '', refreshToken: '' };
  }
}

interface AuthStore extends AuthData {
  init: () => void;
  setAuth: (data: AuthData) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

function persist(data: AuthData) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(data));
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...loadFromStorage(),
  init: () => {
    const data = loadFromStorage();
    set(data);
    if (data.accessToken) setAccessToken(data.accessToken);
  },
  setAuth: (data) => {
    persist(data);
    set(data);
    setAccessToken(data.accessToken);
  },
  setUser: (user) => {
    const cur = get();
    const next: AuthData = {
      user,
      accessToken: cur.accessToken,
      refreshToken: cur.refreshToken,
    };
    persist(next);
    set({ user });
  },
  logout: () => {
    if (typeof window !== 'undefined') localStorage.removeItem(KEY);
    set({ user: null, accessToken: '', refreshToken: '' });
    setAccessToken('');
  },
}));
