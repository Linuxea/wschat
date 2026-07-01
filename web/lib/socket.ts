import { io, type Socket } from 'socket.io-client';
import { WS_URL, getAccessToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function connectSocket() {
  const token = getAccessToken();
  if (!token) return;
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/** Send a message and resolve with the server ack. */
export function sendMessage(payload: {
  conversationId: string;
  type: string;
  content: string;
  clientMsgId: string;
  replyToId?: string | null;
}): Promise<{
  id: string;
  clientMsgId: string;
  seq: number;
  createdAt: string;
  rejected: boolean;
}> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    const t = setTimeout(() => reject(new Error('send ack timeout')), 8000);
    s.emit('message:send', payload, (ack: any) => {
      clearTimeout(t);
      if (!ack) reject(new Error('no ack'));
      else resolve(ack);
    });
  });
}

export function recallMessage(messageId: string) {
  return new Promise<void>((resolve, reject) => {
    const s = getSocket();
    const t = setTimeout(() => reject(new Error('recall timeout')), 5000);
    s.emit('message:recall', { messageId }, () => {
      clearTimeout(t);
      resolve();
    });
  });
}
