import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wechat-green/10 via-wechat-bg to-emerald-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-wechat-green text-3xl text-white shadow-lg shadow-wechat-green/30">
              💬
            </div>
            <span className="text-2xl font-bold text-wechat-text">wschat</span>
          </Link>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl shadow-black/5 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
