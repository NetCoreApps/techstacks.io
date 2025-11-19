import TechStackDetailClient from './TechStackDetailClient';

// For static export, generate a single placeholder page.
// The ASP.NET Core backend routes all /stacks/{slug} requests
// to this placeholder, and the client loads the actual stack by slug.
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ slug: '_placeholder' }];
}

export default function TechStackDetailPage() {
  return <TechStackDetailClient />;
}
