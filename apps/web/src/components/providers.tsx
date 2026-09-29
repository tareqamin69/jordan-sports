'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, notify } from '@jordan-sports/ui';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
        // Every save/delete/confirm announces itself: a mutation declares `meta: { toast }`.
        mutationCache: new MutationCache({
          onSuccess: (data, _variables, _context, mutation) => {
            const toast = mutation.meta?.toast;
            if (toast) notify(typeof toast === 'function' ? toast(data) : toast);
          },
        }),
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
