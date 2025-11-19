import TechnologyDetailClient from './TechnologyDetailClient';

// For static export, generate a single placeholder page.
// The ASP.NET Core backend routes all /tech/{slug} requests
// to this placeholder, and the client loads the actual technology by slug.
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ slug: '_placeholder' }];
}

export default function TechnologyDetailPage() {
  return <TechnologyDetailClient />;
}
