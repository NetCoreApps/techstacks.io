import TechnologyDetailClient from './TechnologyDetailClient';
import { JsonServiceClient } from '@servicestack/client';
import * as dtos from '@/shared/dtos';

// Generate static pages for all technologies
export async function generateStaticParams() {
  try {
    // Create a client with absolute URL for build-time fetching
    const buildClient = new JsonServiceClient('https://techstacks.io');
    const response = await buildClient.get(new dtos.GetAllTechnologies(), { include: 'total' });
    const technologies = response.results || [];

    console.log(`Generating ${technologies.length} technology pages`);

    // Generate params for all technologies
    return technologies.map((tech: any) => ({
      slug: tech.slug,
    }));
  } catch (error) {
    console.error('Failed to fetch technologies for static generation:', error);
    // Fallback to placeholder if API is unavailable during build
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
