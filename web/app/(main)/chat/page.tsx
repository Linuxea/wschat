import { EmptyState } from '@/components/ui';

export default function ChatPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState title="选择一个会话开始聊天" hint="或从通讯录添加新好友" />
    </div>
  );
}
