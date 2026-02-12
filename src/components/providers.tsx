'use client';

import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './providers/session-provider';
import { SolanaProvider } from './providers/solana-provider';
import { LocaleProvider } from '@/contexts/locale-context';
import { queryClient } from '@/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <AuthProvider>
        <LocaleProvider>{children}</LocaleProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <LocaleProvider>
        <SolanaProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </SolanaProvider>
      </LocaleProvider>
    </AuthProvider>
  );
}
