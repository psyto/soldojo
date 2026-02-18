import Link from 'next/link';
import { Flame, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-solana-gradient">
        <Flame className="h-9 w-9 text-white" />
      </div>
      <h1 className="mt-6 text-4xl font-bold">404</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        This page doesn&apos;t exist on any chain.
      </p>
      <Link
        href="/"
        className="mt-6 flex items-center gap-2 rounded-xl bg-solana-gradient px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  );
}
