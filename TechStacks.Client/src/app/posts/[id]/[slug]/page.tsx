import PostDetailClient from './PostDetailClient';

// For static export, generate a placeholder page
// Actual content will be loaded client-side
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ id: '0', slug: '_placeholder' }];
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  return <PostDetailClient id={id} slug={slug} />;
}

