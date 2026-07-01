export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  bio: string | null;
}

export interface ConversationMember {
  userId: string;
  username: string;
  nickname: string;
  avatar: string | null;
  role: string;
  remark: string | null;
}

export interface ConversationView {
  id: string;
  type: 'PRIVATE' | 'GROUP';
  name: string | null;
  avatar: string | null;
  ownerId: string | null;
  announcement: string | null;
  pinned: boolean;
  muted: boolean;
  lastReadSeq: number;
  unread: number;
  members: ConversationMember[];
  lastMessage: {
    id: string;
    type: string;
    preview: string;
    senderId: string;
    seq: number;
    createdAt: string;
  } | null;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO' | 'FILE' | 'EMOJI' | 'SYSTEM';
  content: string;
  seq: number;
  clientMsgId: string;
  replyToId: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface MomentView {
  id: string;
  author: PublicUser;
  content: string;
  media: Array<{ type: string; url: string; width?: number; height?: number }> | null;
  visibility: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  comments: Array<{
    id: string;
    user: PublicUser;
    content: string;
    replyToUserId: string | null;
    createdAt: string;
  }>;
}

export interface CallInvitePayload {
  callId: string;
  conversationId: string;
  roomName: string;
  caller: PublicUser;
}

/** Pick display name/avatar for a conversation relative to current user. */
export function conversationDisplay(
  conv: ConversationView,
  currentUserId: string,
): { name: string; avatar: string | null } {
  if (conv.type === 'GROUP') {
    return { name: conv.name || conv.members.map((m) => m.nickname).join('、') || '群聊', avatar: conv.avatar };
  }
  const other = conv.members.find((m) => m.userId !== currentUserId);
  return {
    name: other?.remark || other?.nickname || other?.username || '未知',
    avatar: other?.avatar ?? null,
  };
}
