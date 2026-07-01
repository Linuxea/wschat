'use client';

import { ChatWindow } from '@/components/chat/chat-window';
import { EmptyState } from '@/components/ui';

export default function ConversationPage({ params }: { params: { id: string } }) {
  return <ChatWindow conversationId={params.id} />;
}
