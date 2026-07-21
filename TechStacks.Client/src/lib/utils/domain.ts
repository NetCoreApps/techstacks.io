/**
 * Bare hostname of a post's source URL, e.g. "blog.rust-lang.org".
 *
 * Derived from the URL rather than read from Post.source so it also works for
 * posts imported before that column existed, and for posts created on the site.
 * Returns null for posts without a link, so callers can skip rendering.
 */
export function postDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return null; // relative or malformed URL
  }
}

export default postDomain;
