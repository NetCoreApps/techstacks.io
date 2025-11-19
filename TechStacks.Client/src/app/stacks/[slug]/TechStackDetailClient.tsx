'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { useAuth, PrimaryButton } from '@servicestack/react';
import { useAppStore } from '@/lib/stores/useAppStore';
import { FavoriteButton } from '@/components/ui/FavoriteButton';

export default function TechStackDetailClient() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const slug = segments[1] ?? '';
  const [stack, setStack] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();
  const { config } = useAppStore();

  useEffect(() => {
    const loadStack = async () => {
      try {
        const data = await gateway.getTechnologyStack(slug);
        setStack(data.result);
      } catch (err) {
        console.error('Failed to load tech stack:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStack();
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

  if (!stack) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Tech stack not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {stack.screenshotUrl && (
            <img
              src={stack.screenshotUrl}
              alt={stack.name}
              className="w-full max-h-210 object-cover"
            />
          )}
          <div className="p-8">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-gray-900">{stack.name}</h1>
                {stack.vendorName && (
                  <p className="text-lg text-gray-600 mt-2">by {stack.vendorName}</p>
                )}
                {stack.appUrl && (
                  <a
                    href={stack.appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline mt-2 inline-block"
                  >
                    Visit Website →
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <FavoriteButton type="techstack" id={stack.id} />
                {isAuthenticated && (
                  <PrimaryButton href={`/stacks/${slug}/edit`}>
                    Edit
                  </PrimaryButton>
                )}
              </div>
            </div>

            {stack.description && (
              <div className="mt-6">
                <h2 className="text-2xl font-semibold mb-4">Description</h2>
                <p className="text-gray-700">{stack.description}</p>
              </div>
            )}

            {stack.technologyChoices && stack.technologyChoices.length > 0 && (
              <div className="mt-8">
                <h2 className="text-2xl font-semibold mb-6">Technologies used by {stack.name}</h2>
                {/* Group by tier */}
                {config?.allTiers?.map((tier: any) => {
                  const tierTechs = stack.technologyChoices.filter((tech: any) => tech.tier === tier.name);
                  if (tierTechs.length === 0) return null;

                  return (
                    <div key={tier.name} className="mb-8">
                      <h3 className="text-xl font-semibold text-gray-500 mb-4">{tier.title}</h3>
                      <div className="flex flex-wrap gap-6 space-y-4 space-x-4 items-center">
                        {tierTechs.map((tech: any) => (
                          <Link
                            key={tech.id}
                            href={routes.tech(tech.slug)}
                            className="hover:opacity-80 transition-opacity"
                            title={tech.name}
                          >
                            {tech.logoApproved && tech.logoUrl && (
                              <img
                                src={tech.logoUrl}
                                alt={tech.name}
                                className="max-w-[300px] max-h-20 object-contain"
                              />
                            )}
                            {(!tech.logoApproved || !tech.logoUrl) && (
                              <div className="px-4 py-2 bg-gray-100 rounded">
                                <span className="font-semibold text-gray-900">{tech.name}</span>
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {stack.detailsHtml && (
              <div className="mt-8">
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: stack.detailsHtml }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

