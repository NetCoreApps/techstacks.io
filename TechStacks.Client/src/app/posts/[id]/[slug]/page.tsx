import PostDetailClient from './PostDetailClient';

// For static export, generate a single placeholder page.
// The ASP.NET Core backend routes all /posts/{id}/{slug} requests
// to this placeholder, and the client loads the actual post by ID.
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ id: '0', slug: '_placeholder' }];
}

export default function PostDetailPage() {
  return <PostDetailClient />;
}

