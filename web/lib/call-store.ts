import { create } from 'zustand';
import { api } from './api';
import type { PublicUser } from './types';

export const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace('ws', 'http') || 'http://localhost:3001';

interface CallState {
  callId: string | null;
  roomName: string | null;
  token: string | null;
  livekitUrl: string;
  conversationId: string | null;
  caller: PublicUser | null;
  mode: 'outgoing' | 'incoming' | 'active' | null;

  startOutgoing: (conversationId: string) => Promise<void>;
  setIncoming: (p: {
    callId: string;
    conversationId: string;
    roomName: string;
    caller: PublicUser;
  }) => void;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => Promise<void>;
  endCall: () => Promise<void>;
  clear: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  callId: null,
  roomName: null,
  token: null,
  livekitUrl: '',
  conversationId: null,
  caller: null,
  mode: null,

  startOutgoing: async (conversationId) => {
    try {
      const res = await api.post<{
        callId: string;
        roomName: string;
        token: string;
        livekitUrl: string;
      }>('/call/start', { conversationId });
      set({
        callId: res.callId,
        roomName: res.roomName,
        token: res.token,
        livekitUrl: res.livekitUrl,
        conversationId,
        caller: null,
        mode: 'active',
      });
    } catch (e) {
      throw e;
    }
  },

  setIncoming: (p) => {
    set({
      callId: p.callId,
      conversationId: p.conversationId,
      roomName: p.roomName,
      caller: p.caller,
      mode: 'incoming',
      token: null,
      livekitUrl: '',
    });
  },

  acceptIncoming: async () => {
    const { callId } = get();
    if (!callId) return;
    try {
      const res = await api.post<{
        token: string;
        livekitUrl: string;
        roomName: string;
      }>(`/call/${callId}/join`);
      set({ token: res.token, livekitUrl: res.livekitUrl, mode: 'active' });
    } catch (e) {
      set({ mode: null, callId: null });
      throw e;
    }
  },

  rejectIncoming: async () => {
    const { callId } = get();
    if (callId) {
      try {
        await api.post(`/call/${callId}/reject`);
      } catch {
        /* ignore */
      }
    }
    get().clear();
  },

  endCall: async () => {
    const { callId } = get();
    if (callId) {
      try {
        await api.post(`/call/${callId}/end`);
      } catch {
        /* ignore */
      }
    }
    get().clear();
  },

  clear: () =>
    set({
      callId: null,
      roomName: null,
      token: null,
      livekitUrl: '',
      conversationId: null,
      caller: null,
      mode: null,
    }),
}));
