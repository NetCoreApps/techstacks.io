'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { useAuth } from '@/lib/hooks/useAuth';
import { PrimaryButton } from '@servicestack/react';
import { FavoriteButton } from '@/components/ui/FavoriteButton';

export default function TechnologyDetailClient({ slug }: { slug: string }) {
  const [tech, setTech] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const loadTech = async () => {
      try {
        const data = await gateway.getTechnology(slug);
        setTech(data);
      } catch (err) {
        console.error('Failed to load technology:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTech();
  }, [slug]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  if (!tech) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Technology not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-start gap-6">
            {tech.logoUrl && (
              <img
                src={tech.logoUrl}
                alt={tech.name}
                className="w-24 h-24 object-contain"
              />
            )}
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900">{tech.name}</h1>
              {tech.vendorName && (
                <p className="text-lg text-gray-600 mt-2">by {tech.vendorName}</p>
              )}
              {tech.productUrl && (
                <a
                  href={tech.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline mt-2 inline-block"
                >
                  Visit Website →
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <FavoriteButton type="technology" id={tech.id} />
              {isAuthenticated && (
                <PrimaryButton
                  href={`/tech/${slug}/edit`}>
                  Edit
                </PrimaryButton>
              )}
            </div>
          </div>

          {tech.description && (
            <div className="mt-6">
              <h2 className="text-2xl font-semibold mb-4">Description</h2>
              <p className="text-gray-700">{tech.description}</p>
            </div>
          )}

          {tech.technologyStacks && tech.technologyStacks.length > 0 && (
            <div className="mt-8">
              <h2 className="text-2xl font-semibold mb-4">Used in Tech Stacks</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {tech.technologyStacks.map((stack: any) => (
                  <Link
                    key={stack.id}
                    href={routes.stack(stack.slug)}
                    prefetch={false}
                    className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition"
                  >
                    <div className="flex items-center gap-3">
                      {stack.screenshotUrl && (
                        <img
                          src={stack.screenshotUrl}
                          alt={stack.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">{stack.name}</h3>
                        {stack.vendorName && (
                          <p className="text-sm text-gray-600">{stack.vendorName}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

