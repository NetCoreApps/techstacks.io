import TechStackDetailClient from './TechStackDetailClient';

// For static export, generate a placeholder page
// Actual content will be loaded client-side
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ slug: '_placeholder' }];
}

export default async function TechStackDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <TechStackDetailClient slug={slug} />;
}
