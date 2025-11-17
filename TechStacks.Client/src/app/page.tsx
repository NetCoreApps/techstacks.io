'use client';

import { useEffect, useState } from 'react';
import { CloseButton, PrimaryButton, SecondaryButton } from '@servicestack/react';
import { PostsList } from '@/components/posts/PostsList';
import { PostForm } from '@/components/forms/PostForm';
import { useAuth } from '@/lib/hooks/useAuth';
import * as gateway from '@/lib/api/gateway';
import { QueryPosts, Post, TechnologyView } from '@/shared/dtos';

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [technologies, setTechnologies] = useState<TechnologyView[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated } = useAuth();

  const loadPosts = async (techId?: number | null) => {
    try {
      setLoading(true);
      const query = new QueryPosts({ orderBy: '-id', take: 50 });
      if (techId) {
        query.anyTechnologyIds = [techId];
      }
      const response = await gateway.queryPosts(query);
      setPosts(response.results || []);
    } catch (err: any) {
      console.error('Failed to load posts:', err);
      setError(err.message || 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const loadTechnologies = async () => {
    try {
      const techs = await gateway.getPopularTechnologies(30);
      setTechnologies(techs || []);
    } catch (err: any) {
      console.error('Failed to load technologies:', err);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadPosts();
    loadTechnologies();
  }, []);

  const handlePostDone = () => {
    setShowPostForm(false);
    loadPosts(selectedTechId);
  };

  const handleTagClick = (techId: number) => {
    if (selectedTechId === techId) {
      // Deselect if clicking the same tag
      setSelectedTechId(null);
      loadPosts(null);
    } else {
      setSelectedTechId(techId);
      loadPosts(techId);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="relative flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Latest News</h1>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <PostsList posts={posts} />
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
