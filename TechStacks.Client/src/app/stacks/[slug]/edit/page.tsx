import { TechStackForm } from '@/components/forms/TechStackForm';

// For static export, generate a placeholder page
// Actual content will be loaded client-side
export async function generateStaticParams() {
  // Return a placeholder - the actual routing happens client-side
  return [{ slug: '_placeholder' }];
}

export default async function EditTechStackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <TechStackForm slug={slug} />
      </div>
    </div>
  );
}

