import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 font-serif text-xl">
        Helpdesk<span className="text-primary">AI</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
