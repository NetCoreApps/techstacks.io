'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, PrimaryButton, SecondaryButton } from '@servicestack/react';
import { PostsList } from '@/components/posts/PostsList';
import { PostForm } from '@/components/forms/PostForm';
import * as gateway from '@/lib/api/gateway';
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
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const [selectedPostType, setSelectedPostType] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { isAuthenticated } = useAuth();

  // Read initial state from URL
  useEffect(() => {
    const page = parseInt(searchParams.get('page') || '1', 10);
    const techId = searchParams.get('techId');
    const postType = searchParams.get('type') || '';

    setCurrentPage(page);
    if (techId) {
      setSelectedTechId(parseInt(techId, 10));
    }
    setSelectedPostType(postType);
  }, [searchParams]);

  // Update URL with current state
  const updateUrl = useCallback((page: number, techId: number | null, postType: string) => {
    const params = new URLSearchParams();
    if (page > 1) {
      params.set('page', page.toString());
    }
    if (techId) {
      params.set('techId', techId.toString());
    }
    if (postType) {
      params.set('type', postType);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/?${queryString}` : '/');
  }, [router]);

  const loadPosts = useCallback(async (techId?: number | null, page: number = 1, postType: string = '') => {
    try {
      setLoading(true);
      const skip = (page - 1) * POSTS_PER_PAGE;
      const query = new QueryPosts({ orderBy: '-id', take: POSTS_PER_PAGE, skip });
      if (techId) {
        query.anyTechnologyIds = [techId];
      }
      if (postType) {
        query.types = [postType];
      }
      const response = await gateway.queryPosts(query);
      setPosts(response.results || []);
      setTotal(response.total || 0);
      setCurrentPage(page);
      setSelectedPostType(postType);
      updateUrl(page, techId || null, postType);
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
    const techId = searchParams.get('techId');
    const postType = searchParams.get('type') || '';

    loadPosts(techId ? parseInt(techId, 10) : null, page, postType);
    loadTechnologies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePostDone = () => {
    setShowPostForm(false);
    setSelectedTechId(null);
    setCurrentPage(1);
    loadPosts(null, 1, selectedPostType);
  };

  const handleTagClick = (techId: number) => {
    if (selectedTechId === techId) {
      // Deselect if clicking the same tag
      setSelectedTechId(null);
      setCurrentPage(1);
      loadPosts(null, 1, selectedPostType);
    } else {
      setSelectedTechId(techId);
      setCurrentPage(1);
      loadPosts(techId, 1, selectedPostType);
    }
  };

  const handlePostTypeChange = (postType: string) => {
    setSelectedPostType(postType);
    setCurrentPage(1);
    loadPosts(selectedTechId, 1, postType);
  };

  const handlePageChange = (page: number) => {
    loadPosts(selectedTechId, page, selectedPostType);
    // Scroll to top of posts
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(total / POSTS_PER_PAGE);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="relative flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Latest News</h1>
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
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
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

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">
                    Popular Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {technologies.map((tech) => (
                      <button type="button"
                        key={tech.id}
                        onClick={() => handleTagClick(tech.id!)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          selectedTechId === tech.id
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={`${tech.name} (${tech.favCount || 0} favorites)`}
                      >
                        {tech.name}
                      </button>
                    ))}
                  </div>
                  {selectedTechId && (
                    <div className="mt-4 flex justify-center">
                      <button type="button"
                      onClick={() => handleTagClick(selectedTechId)}
                      className="text-sm text-pink-600 hover:text-pink-700 font-medium"
                    >
                      show all posts
                    </button>
                    </div>
                  )}
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
