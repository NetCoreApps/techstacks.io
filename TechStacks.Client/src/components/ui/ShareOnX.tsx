'use client';

import { useEffect, useState } from 'react';
import { technologyCache } from '@/lib/utils/technologyCache';
import { decodeHtmlEntities } from '@/lib/utils/decodeHtmlEntities';

interface ShareOnXProps {
  /** Text of the post, used as the body of the tweet */
  title: string;
  /** Site-relative path of the page being shared, e.g. "/posts/1/some-slug" */
  path: string;
  /** Post's technologies, added to the tweet as hashtags */
  technologyIds?: number[];
  className?: string;
}

/** Technology name as a hashtag, or null if nothing usable survives. */
function hashtag(name: string): string | null {
  // Hashtags stop at the first non-alphanumeric character, so "ASP.NET Core"
  // has to be closed up into "#ASPNETCore" rather than truncated to "#ASP"
  const word = name.replace(/[^\p{L}\p{N}_]/gu, '');
  return word && !/^\d+$/.test(word) ? `#${word}` : null;
}

// Enough to categorise the post without the tweet reading as tag spam
const MAX_HASHTAGS = 3;

/**
 * Opens x.com's post intent pre-filled with the post title, its technology
 * hashtags, and a link back to its page on this site.
 *
 * The absolute URL depends on the browser's origin, hence the link renders
 * after mount instead of during SSR.
 */
export function ShareOnX({ title, path, technologyIds, className = '' }: ShareOnXProps) {
  const [origin, setOrigin] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (!technologyIds || technologyIds.length === 0) {
      setHashtags([]);
      return;
    }

    let stale = false;
    technologyCache.getTechnologies(technologyIds)
      .then((techs) => {
        if (stale) return;
        const tags = techs.map((t) => hashtag(t.name)).filter((t): t is string => t !== null);
        setHashtags(tags.slice(0, MAX_HASHTAGS));
      })
      // Sharing without hashtags beats not offering the link at all
      .catch((err) => console.error('Failed to load technologies:', err));

    return () => { stale = true; };
  }, [technologyIds?.join(',')]);

  if (!origin) return null;

  // Title comes HTML-escaped from the API (e.g. "&amp;"); decode it back to
  // plain text before it goes into the tweet body.
  const decodedTitle = decodeHtmlEntities(title);

  // The trailing newline lands x.com's appended link on its own line
  const text = hashtags.length ? `${decodedTitle}\n${hashtags.join(' ')}\n` : decodedTitle;
  const href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(origin + path)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // Feed rows are clickable cards; sharing shouldn't also open the post
      onClick={(e) => e.stopPropagation()}
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
