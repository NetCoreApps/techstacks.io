import Link from 'next/link';
import { AnchorHTMLAttributes, forwardRef } from 'react';

/**
 * A Link component optimized for static export with dynamic routes.
 * 
 * For dynamic routes (containing [slug] or [id]), this component:
 * - Disables prefetching to avoid 404 errors on __next._tree.txt files
 * - Uses regular anchor behavior for better compatibility with static hosting
 * 
 * For static routes, it uses Next.js Link with prefetching enabled.
 */

interface StaticLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  prefetch?: boolean;
}

export const StaticLink = forwardRef<HTMLAnchorElement, StaticLinkProps>(
  ({ href, prefetch, children, ...props }, ref) => {
    // Detect if this is a dynamic route by checking for common patterns
    const isDynamicRoute = 
      href.startsWith('/tech/') && href !== '/tech' && href !== '/tech/new' ||
      href.startsWith('/stacks/') && href !== '/stacks' && href !== '/stacks/new' ||
      href.startsWith('/posts/') ||
      href.includes('[') || href.includes(']');

    // For dynamic routes in static export, disable prefetch to avoid 404s
    const shouldPrefetch = isDynamicRoute ? false : (prefetch ?? true);

    return (
      <Link 
        href={href} 
        prefetch={shouldPrefetch}
        ref={ref}
        {...props}
      >
        {children}
      </Link>
    );
  }
);

StaticLink.displayName = 'StaticLink';

export default StaticLink;

