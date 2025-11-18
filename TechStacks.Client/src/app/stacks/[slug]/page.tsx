import TechStackDetailClient from './TechStackDetailClient';
import { JsonServiceClient } from '@servicestack/client';
import * as dtos from '@/shared/dtos';

// Generate static pages for all tech stacks
export async function generateStaticParams() {
  try {
    // Create a client with absolute URL for build-time fetching
    const buildClient = new JsonServiceClient('https://react.techstacks.io');
    const response = await buildClient.get(new dtos.GetAllTechnologyStacks(), { include: 'total' });
    const stacks = response.results || [];

    console.log(`Generating ${stacks.length} tech stack pages`);

    // Generate params for all tech stacks
    return stacks.map((stack: any) => ({
      slug: stack.slug,
    }));
  } catch (error) {
    console.error('Failed to fetch tech stacks for static generation:', error);
    // Fallback to placeholder if API is unavailable during build
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
