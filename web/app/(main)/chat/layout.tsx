'use client';

import { ConversationList } from '@/components/chat/conversation-list';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="w-72 shrink-0 border-r border-wechat-border bg-white">
        <ConversationList />
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-wechat-chatbg">{children}</div>
    </>
  );
}
