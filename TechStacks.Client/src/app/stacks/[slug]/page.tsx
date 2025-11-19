import TechStackDetailClient from './TechStackDetailClient';
import stacksData from '@/data/stacks.json';

// Generate static pages for all tech stacks from static data
export async function generateStaticParams() {
  try {
    // Read from static JSON data generated at build time
    const stacks = stacksData.results || [];

    console.log(`Generating ${stacks.length} tech stack pages from static data (generated: ${stacksData.generated})`);

    // Generate params for all tech stacks
    return stacks.map((stack: any) => ({
      slug: stack.slug,
    }));
  } catch (error) {
    console.error('Failed to load tech stacks from static data:', error);
    // Fallback to placeholder if data is unavailable
    return [{ slug: '_placeholder' }];
  }
}

export default async function TechStackDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <TechStackDetailClient slug={slug} />;
}
