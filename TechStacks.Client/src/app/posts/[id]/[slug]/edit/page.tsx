import EditPostClient from './EditPostClient';

export async function generateStaticParams() {
  // Return empty array - pages will be generated on-demand
  return [];
}

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  return <EditPostClient id={id} slug={slug} />;
}

