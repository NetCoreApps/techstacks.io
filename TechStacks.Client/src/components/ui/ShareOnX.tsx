'use client';

import { useEffect, useState } from 'react';

interface ShareOnXProps {
  /** Text of the post, used as the body of the tweet */
  title: string;
  /** Site-relative path of the page being shared, e.g. "/posts/1/some-slug" */
  path: string;
  className?: string;
}

/**
 * Opens x.com's post intent pre-filled with the post title and a link back to
 * its page on this site.
 *
 * Pages are statically exported so the absolute URL is only known in the
 * browser, hence the link renders after mount instead of during SSR.
 */
export function ShareOnX({ title, path, className = '' }: ShareOnXProps) {
  const [origin, setOrigin] = useState('');

  useEffect(() => setOrigin(window.location.origin), []);

  if (!origin) return null;

  const href = `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(origin + path)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Share on X"
      aria-label="Share on X"
      className={`inline-flex items-center text-gray-400 hover:text-gray-900 ${className}`}
    >
      <svg
        className="size-4"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M18.244 2.25h3.308l-7.227 8.26l8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        />
      </svg>
    </a>
  );
}

export default ShareOnX;
