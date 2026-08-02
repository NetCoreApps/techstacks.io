import type { Metadata } from 'next';
import PostDetailClient from './PostDetailClient';
import { getPost } from '@/lib/api/gateway';

// For static export, generate a single placeholder page.
// The ASP.NET Core backend routes all /posts/{id}/{slug} requests
// to this placeholder, and the client loads the actual post by ID.
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ id: '0', slug: '_placeholder' }];
}

function toDescription(html?: string, text?: string): string {
  const source = html || text || '';
  const plain = source
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}...` : plain;
}

type Props = { params: Promise<{ id: string; slug: string }> };

// Re-check post data periodically instead of caching a single render
// (including a failed one) for the lifetime of the deployment.
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, slug } = await params;
  const postId = Number(id);

  if (!postId) return {};

  try {
    const { post } = await getPost(postId, '');
    if (!post) return {};

    const description = toDescription(post.contentHtml, post.content);
    const url = `/posts/${post.id}/${post.slug || slug}`;
    const imageUrl = `/posts/${post.id}/card.png`;

    return {
      title: post.title,
      description,
      openGraph: {
        title: post.title,
        description,
        url,
        type: 'article',
        images: [{ url: imageUrl, width: 1200, height: 630, alt: post.title }],
      },
      twitter: {
        card: 'summary_large_image',
        title: post.title,
        description,
        images: [{ url: imageUrl, alt: post.title }],
      },
    };
  } catch (err) {
    // Fall back to site-wide default metadata (e.g. post not found/deleted),
    // but log so a real failure (e.g. the internal API fetch) isn't invisible.
    console.error(`generateMetadata failed for post ${postId}:`, err);
    return {};
  }
}

export default function PostDetailPage() {
  return <PostDetailClient />;
}
