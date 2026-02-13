'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { useAuth, PrimaryButton } from '@servicestack/react';
import { useAppStore } from '@/lib/stores/useAppStore';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { PostsList } from '@/components/posts/PostsList';
import { Post, PostType, QueryPosts } from '@/shared/dtos';

const POST_TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: PostType.Announcement, label: 'Announcement' },
  { value: PostType.Post, label: 'Post' },
  { value: PostType.Showcase, label: 'Showcase' },
];

export default function TechnologyDetailClient() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const slug = segments[1] ?? '';
  const [tech, setTech] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedPostType, setSelectedPostType] = useState<string>('');
  const [showAllStacks, setShowAllStacks] = useState(false);
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const watchedTechIds = useAppStore((s) => s.watchedTechIds);
  const toggleWatchedTech = useAppStore((s) => s.toggleWatchedTech);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;

  const loadPosts = async (techId: number, postType: string, skip = 0) => {
    const query = new QueryPosts({
      anyTechnologyIds: [techId],
      orderBy: '-id',
      take: PAGE_SIZE,
      skip,
    });
    if (postType) {
      query.types = [postType];
    }
    const response = await gateway.queryPosts(query);
    if (skip === 0) {
      setPosts(response.results);
    } else {
      setPosts(prev => [...prev, ...response.results]);
    }
    setHasMore(skip + response.results.length < (response.total ?? 0));
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !tech?.id) return;
    setLoadingMore(true);
    try {
      await loadPosts(tech.id, selectedPostType, posts.length);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, tech?.id, selectedPostType, posts.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    const loadTech = async () => {
      try {
        const data = await gateway.getTechnology(slug);
        setTech(data);

        if (data?.id) {
          await loadPosts(data.id, '');
        }
      } catch (err) {
        console.error('Failed to load technology:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTech();
  }, [slug]);

  const handlePostTypeChange = (postType: string) => {
    setSelectedPostType(postType);
    if (tech?.id) {
      loadPosts(tech.id, postType);
    }
  };

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
              {!watchedTechIds.includes(tech.id) ? (
                <button
                  type="button"
                  onClick={() => {
                    toggleWatchedTech(tech.id);
                    router.push('/');
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  + Watch
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200"
                >
                  Watching
                </button>
              )}
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
              {(() => {
                const sorted = [...tech.technologyStacks].sort((a: any, b: any) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
                const visible = showAllStacks ? sorted : sorted.slice(0, 6);
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {visible.map((stack: any) => (
                        <Link
                          key={stack.id}
                          href={routes.stack(stack.slug)}
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
                    {sorted.length > 6 && !showAllStacks && (
                      <div className="mt-4 text-center">
                        <button
                          type="button"
                          onClick={() => setShowAllStacks(true)}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                          Show all {sorted.length} tech stacks
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {posts.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Recent Posts</h2>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {POST_TYPE_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => handlePostTypeChange(option.value)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        selectedPostType === option.value
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <PostsList posts={posts} />
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <div className="text-gray-500">Loading more posts...</div>
                </div>
              )}
              <div ref={sentinelRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

