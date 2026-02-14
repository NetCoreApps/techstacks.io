'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, PrimaryButton, SecondaryButton } from '@servicestack/react';
import { PostsList } from '@/components/posts/PostsList';
import { PostForm } from '@/components/forms/PostForm';
import { WatchListDialog } from '@/components/WatchListDialog';
import * as gateway from '@/lib/api/gateway';
import { useAppStore } from '@/lib/stores/useAppStore';
import Link from 'next/link';
import { QueryPosts, Post, TechnologyView, PostType } from '@/shared/dtos';

const POSTS_PER_PAGE = 25;

const POST_TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: PostType.Announcement, label: 'Announcement' },
  { value: PostType.Post, label: 'Post' },
  { value: PostType.Showcase, label: 'Showcase' },
];

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [technologies, setTechnologies] = useState<TechnologyView[]>([]);
  const [selectedPostType, setSelectedPostType] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [watchDialogOpen, setWatchDialogOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const watchedTechIds = useAppStore((s) => s.watchedTechIds);
  const watchedTechNames = useAppStore((s) => s.watchedTechNames);
  const toggleWatchedTech = useAppStore((s) => s.toggleWatchedTech);
  const [watchEnabled, setWatchEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchEnabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Backfill missing tech names for existing watched IDs
  useEffect(() => {
    const missingIds = watchedTechIds.filter(id => !watchedTechNames[id]);
    if (missingIds.length === 0) return;
    gateway.getTechnologyTiers().then((allTechs) => {
      if (!allTechs) return;
      const store = useAppStore.getState();
      const updated = { ...store.watchedTechNames };
      let changed = false;
      for (const tech of allTechs as { id: number; name: string }[]) {
        if (missingIds.includes(tech.id) && !updated[tech.id]) {
          updated[tech.id] = tech.name;
          changed = true;
        }
      }
      if (changed) {
        useAppStore.setState({ watchedTechNames: updated });
      }
    }).catch(console.error);
  }, [watchedTechIds, watchedTechNames]);

  // Only apply watch filter when enabled
  const activeWatched = watchEnabled ? watchedTechIds : [];

  // Refresh posts when watch list changes (after initial mount)
  const [initialLoad, setInitialLoad] = useState(true);
  useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false);
      return;
    }
    setCurrentPage(1);
    loadPosts(1, selectedPostType, watchEnabled ? watchedTechIds : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedTechIds]);

  // Read initial state from URL
  useEffect(() => {
    const page = parseInt(searchParams.get('page') || '1', 10);
    const postType = searchParams.get('type') || '';

    setCurrentPage(page);
    setSelectedPostType(postType);
  }, [searchParams]);

  // Update URL with current state
  const updateUrl = useCallback((page: number, postType: string) => {
    const params = new URLSearchParams();
    if (page > 1) {
      params.set('page', page.toString());
    }
    if (postType) {
      params.set('type', postType);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/?${queryString}` : '/');
  }, [router]);

  const loadPosts = useCallback(async (page: number = 1, postType: string = '', watched: number[] = []) => {
    try {
      setLoading(true);
      const skip = (page - 1) * POSTS_PER_PAGE;
      const query = new QueryPosts({ orderBy: '-id', take: POSTS_PER_PAGE, skip });
      if (watched.length > 0) {
        query.anyTechnologyIds = watched;
      }
      if (postType) {
        query.types = [postType];
      }
      const response = await gateway.queryPosts(query);
      setPosts(response.results || []);
      setTotal(response.total || 0);
      setCurrentPage(page);
      setSelectedPostType(postType);
      updateUrl(page, postType);
    } catch (err: any) {
      console.error('Failed to load posts:', err);
      setError(err.message || 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, [updateUrl]);

  const loadTechnologies = async () => {
    try {
      const techs = await gateway.getPopularTechnologies(30);
      setTechnologies(techs || []);
    } catch (err: any) {
      console.error('Failed to load technologies:', err);
    }
  };

  // Load initial data based on URL params
  useEffect(() => {
    setMounted(true);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const postType = searchParams.get('type') || '';

    loadPosts(page, postType, activeWatched);
    loadTechnologies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePostDone = () => {
    setShowPostForm(false);
    setCurrentPage(1);
    loadPosts(1, selectedPostType, activeWatched);
  };

  const handleToggleWatchEnabled = () => {
    const next = !watchEnabled;
    setWatchEnabled(next);
    localStorage.setItem('watchEnabled', String(next));
    setCurrentPage(1);
    loadPosts(1, selectedPostType, next ? watchedTechIds : []);
  };

  const handleWatchDialogClose = (open: boolean) => {
    const wasOpen = watchDialogOpen;
    setWatchDialogOpen(open);
    // When closing the dialog, refresh posts with the (possibly changed) watch list
    if (wasOpen && !open) {
      setWatchEnabled(true);
      localStorage.setItem('watchEnabled', 'true');
      setCurrentPage(1);
      // Read directly from store since state may be stale
      const currentWatched = useAppStore.getState().watchedTechIds;
      loadPosts(1, selectedPostType, currentWatched);
    }
  };

  const handlePostTypeChange = (postType: string) => {
    setSelectedPostType(postType);
    setCurrentPage(1);
    loadPosts(1, postType, activeWatched);
  };

  const handlePageChange = (page: number) => {
    loadPosts(page, selectedPostType, activeWatched);
    // Scroll to top of posts
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(total / POSTS_PER_PAGE);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="relative flex items-center justify-between mb-6">
          <div className="w-full flex items-center justify-between pr-4">
            <h1 className="text-3xl font-bold text-gray-900">Latest News</h1>
            <div>
              {watchedTechIds.length > 0 && (
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  <button type="button"
                    onClick={() => { if (watchEnabled) handleToggleWatchEnabled(); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      !watchEnabled ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    All
                  </button>
                  <button type="button"
                    onClick={() => { if (!watchEnabled) handleToggleWatchEnabled(); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      watchEnabled ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Watch List
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Post Type Filter */}
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

            {mounted && isAuthenticated && !showPostForm && (
              <PrimaryButton
                onClick={() => setShowPostForm(true)}
                className="whitespace-nowrap px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
              >
                + New Post
              </PrimaryButton>
            )}
            {mounted && showPostForm && (
              <SecondaryButton onClick={() => setShowPostForm(false)}>
                Cancel
              </SecondaryButton>
            )}
          </div>
        </div>

        {showPostForm && (
          <div className="mb-6">
            <PostForm onDone={handlePostDone} />
          </div>
        )}

        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-600">Loading posts...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <PostsList posts={posts} />

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <button type="button"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {/* First page */}
                      {currentPage > 3 && (
                        <>
                          <button type="button"
                            onClick={() => handlePageChange(1)}
                            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            1
                          </button>
                          {currentPage > 4 && (
                            <span className="px-2 text-gray-500">...</span>
                          )}
                        </>
                      )}

                      {/* Page numbers around current page */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
                          return page === currentPage ||
                                 page === currentPage - 1 ||
                                 page === currentPage + 1 ||
                                 (currentPage <= 2 && page <= 3) ||
                                 (currentPage >= totalPages - 1 && page >= totalPages - 2);
                        })
                        .map(page => (
                          <button type="button"
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`px-3 py-2 rounded-lg border transition-colors ${
                              page === currentPage
                                ? 'bg-pink-600 text-white border-pink-600'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        ))}

                      {/* Last page */}
                      {currentPage < totalPages - 2 && (
                        <>
                          {currentPage < totalPages - 3 && (
                            <span className="px-2 text-gray-500">...</span>
                          )}
                          <button type="button"
                            onClick={() => handlePageChange(totalPages)}
                            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}
                    </div>

                    <button type="button"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}

                {/* Page info */}
                {total > 0 && (
                  <div className="mt-4 text-center text-sm text-gray-600">
                    Showing {((currentPage - 1) * POSTS_PER_PAGE) + 1} to {Math.min(currentPage * POSTS_PER_PAGE, total)} of {total} posts
                  </div>
                )}
              </div>
              <div className="space-y-4">
                {/* Watch List */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase">
                      Watch List
                    </h3>
                    <button type="button"
                      onClick={() => setWatchDialogOpen(true)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {watchedTechIds.length > 0 ? 'Edit' : '+ Add'}
                    </button>
                  </div>
                  {watchedTechIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {watchedTechIds.map((id) => {
                        const name = watchedTechNames[id] || technologies.find(t => t.id === id)?.name || `#${id}`;
                        return (
                          <span key={id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            watchEnabled ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {name}
                            <button type="button"
                              onClick={() => toggleWatchedTech(id)}
                              className={watchEnabled ? 'text-indigo-400 hover:text-indigo-700' : 'text-gray-400 hover:text-gray-600'}
                              title={`Remove ${name}`}
                            >
                              &times;
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Add technologies to filter posts by your interests.
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">
                    Popular Technologies
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {technologies.map((tech) => (
                      <Link
                        key={tech.id}
                        href={`/tech/${tech.slug}`}
                        className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                        title={`${tech.name} (${tech.favCount || 0} favorites)`}
                      >
                        {tech.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">
                    Sponsored by:
                  </h3>
                  <a href="https://servicestack.net" target="_blank" rel="noopener noreferrer">
                    <img
                      src="/img/logo-text.svg"
                      alt="ServiceStack"
                      className="w-full"
                    />
                  </a>
                </div>

              </div>
            </div>
          </>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-4">
            <p className="text-blue-800">No posts found</p>
          </div>
        )}
      </div>

      <WatchListDialog open={watchDialogOpen} onOpenChange={handleWatchDialogClose} />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><div className="flex justify-center items-center py-12"><div className="text-gray-600">Loading...</div></div></div>}>
      <HomePageContent />
    </Suspense>
  );
}
