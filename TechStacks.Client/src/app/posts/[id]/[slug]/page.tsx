import PostDetailClient from './PostDetailClient';
import { JsonServiceClient } from '@servicestack/client';
import * as dtos from '@/shared/dtos';

// Generate static pages for all posts
export async function generateStaticParams() {
  try {
    // Create a client with absolute URL for build-time fetching
    const buildClient = new JsonServiceClient('https://techstacks.io');
    const response = await buildClient.get(
      new dtos.QueryPosts({
        take: 1000,
        orderBy: '-created',
        fields: 'id,slug'
      })
    );
    const posts = response.results || [];

    console.log(`Generating ${posts.length} post pages`);

    // Generate params for all posts
    return posts.map((post: any) => ({
      id: post.id.toString(),
      slug: post.slug,
    }));
  } catch (error) {
    console.error('Failed to fetch posts for static generation:', error);
    // Fallback to placeholder if API is unavailable during build
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

