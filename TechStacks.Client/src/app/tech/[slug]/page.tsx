import TechnologyDetailClient from './TechnologyDetailClient';

// For static export, generate a placeholder page
// Actual content will be loaded client-side
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ slug: '_placeholder' }];
}

export default async function TechnologyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <TechnologyDetailClient slug={slug} />;
}
