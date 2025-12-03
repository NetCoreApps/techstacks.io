'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { appAuth } from '@/lib/auth';

export function useRequireAuth(redirectTo?: string) {
  const router = useRouter();
  const { isAuthenticated } = appAuth();
  
  useEffect(() => {
    if (!isAuthenticated && redirectTo) {
      // Only redirect if explicitly specified to avoid infinite loops
      router.push(redirectTo);
    }
  }, [isAuthenticated, router, redirectTo]);

  return isAuthenticated;
}
