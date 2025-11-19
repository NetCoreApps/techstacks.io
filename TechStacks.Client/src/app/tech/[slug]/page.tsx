import TechnologyDetailClient from './TechnologyDetailClient';
import techData from '@/data/tech.json';

// Generate static pages for all technologies from static data
export async function generateStaticParams() {
  try {
    // Read from static JSON data generated at build time
    const technologies = techData.results || [];

    console.log(`Generating ${technologies.length} technology pages from static data (generated: ${techData.generated})`);

    // Generate params for all technologies
    return technologies.map((tech: any) => ({
      slug: tech.slug,
    }));
  } catch (error) {
    console.error('Failed to load technologies from static data:', error);
    // Fallback to placeholder if data is unavailable
    return [{ slug: '_placeholder' }];
  }
}

export default async function TechnologyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <TechnologyDetailClient slug={slug} />;
}
