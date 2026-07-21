'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/stores/useAppStore';

export function useHeaderTitle(title: string) {
  const setHeaderTitle = useAppStore((state) => state.setHeaderTitle);
  const pathname = usePathname();

  useEffect(() => {
    setHeaderTitle(title, pathname);
  }, [title, pathname, setHeaderTitle]);
}
