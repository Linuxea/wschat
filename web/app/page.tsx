import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-wechat-bg">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold text-wechat-green">wschat</h1>
        <p className="text-wechat-subtext">WeChat-style web chat — demo build</p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="px-5 py-2 rounded-md bg-wechat-green text-white hover:bg-wechat-greenDark transition"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="px-5 py-2 rounded-md border border-wechat-border hover:bg-white transition"
          >
            注册
          </Link>
        </div>
      </div>
    </main>
  );
}
