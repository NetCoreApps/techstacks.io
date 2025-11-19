import PostDetailClient from './PostDetailClient';
import postsData from '@/data/posts.json';

// Generate static pages for all posts from static data
export async function generateStaticParams() {
  try {
    // Read from static JSON data generated at build time
    const posts = postsData.results || [];

    console.log(`Generating ${posts.length} post pages from static data (generated: ${postsData.generated})`);

    // Generate params for all posts
    return posts.map((post: any) => ({
      id: post.id.toString(),
      slug: post.slug,
    }));
  } catch (error) {
    console.error('Failed to load posts from static data:', error);
    // Fallback to placeholder if data is unavailable
    return [{ id: '0', slug: '_placeholder' }];
  }
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  return <PostDetailClient id={id} slug={slug} />;
}

