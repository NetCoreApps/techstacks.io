'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/lib/hooks/useAuth';
import { useAppStore } from '@/lib/stores/useAppStore';
import * as gateway from '@/lib/api/gateway';
import routes from '@/lib/utils/routes';
import { QueryPosts } from '@/shared/dtos';

export default function AccountPage() {
  const { isAuthenticated, sessionInfo } = useAuth();
  const { favoriteTechnologyIds, favoriteTechStackIds } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [techStacks, setTechStacks] = useState<any[]>([]);
  const [favoriteTechnologies, setFavoriteTechnologies] = useState<any[]>([]);
  const [favoriteTechStacks, setFavoriteTechStacks] = useState<any[]>([]);
  const [latestPosts, setLatestPosts] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !sessionInfo) {
      setLoading(false);
      return;
    }

    const loadAccountData = async () => {
      try {
        // Load user's tech stacks
        const userStacksResponse = await gateway.queryTechStacks({
          createdBy: sessionInfo.userName,
          orderBy: '-created',
          take: 10
        });

        // Load favorite technologies
        const favTechResponse = favoriteTechnologyIds.length > 0
          ? await gateway.queryTechnology({
              ids: favoriteTechnologyIds.join(','),
              take: 10
            })
          : { results: [] };

        // Load favorite tech stacks
        const favStacksResponse = favoriteTechStackIds.length > 0
          ? await gateway.queryTechStacks({
              ids: favoriteTechStackIds.join(','),
              take: 10
            })
          : { results: [] };

        // Load user's latest posts
        const postsResponse = await gateway.queryPosts(new QueryPosts({
          createdBy: sessionInfo.userName,
          orderBy: '-created',
          take: 10
        }));

        setTechStacks(userStacksResponse.results || []);
        setFavoriteTechnologies(favTechResponse.results || []);
        setFavoriteTechStacks(favStacksResponse.results || []);
        setLatestPosts(postsResponse.results || []);
      } catch (err) {
        console.error('Failed to load account data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAccountData();
  }, [isAuthenticated, sessionInfo, favoriteTechnologyIds, favoriteTechStackIds]);

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Account</h1>
          <p className="text-gray-600 mb-4">Please sign in to view your account.</p>
          <Link href={routes.signIn()} className="text-blue-600 hover:text-blue-800">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-4">
            {sessionInfo?.profileUrl && (
              <img
                src={sessionInfo.profileUrl}
                alt={sessionInfo.displayName || sessionInfo.userName}
                className="w-20 h-20 rounded-full"
              />
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {sessionInfo?.displayName || sessionInfo?.userName}
              </h1>
              <p className="text-gray-600">@{sessionInfo?.userName}</p>
            </div>
          </div>

          {/* Account Info */}
          <div className="mt-6 flex flex-wrap gap-6">
            {sessionInfo?.roles && sessionInfo.roles.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Roles</h3>
                <div className="mt-1 flex flex-wrap gap-2">
                  {sessionInfo.roles.map((role: string) => (
                    <span key={role} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {sessionInfo?.createdAt && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Member Since</h3>
                <p className="mt-1 text-gray-900">
                  {new Date(sessionInfo.createdAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* TechStacks Created */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            TechStacks Created ({techStacks.length})
          </h2>
          {techStacks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {techStacks.map((stack: any) => (
                <Link
                  key={stack.id}
                  href={routes.stack(stack.slug)}
                  prefetch={false}
                  className="border border-gray-200 rounded-lg hover:shadow-lg transition-shadow overflow-hidden"
                >
                  {stack.screenshotUrl && (
                    <img
                      src={stack.screenshotUrl}
                      alt={stack.name}
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900">{stack.name}</h3>
                    {stack.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {stack.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No tech stacks created yet.</p>
          )}
        </div>

        {/* Favorite Technologies */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Favorite Technologies ({favoriteTechnologies.length})
          </h2>
          {favoriteTechnologies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {favoriteTechnologies.map((tech: any) => (
                <Link
                  key={tech.id}
                  href={routes.tech(tech.slug)}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    {tech.logoUrl && (
                      <img
                        src={tech.logoUrl}
                        alt={tech.name}
                        className="w-12 h-12 object-contain"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900">{tech.name}</h3>
                      {tech.vendorName && (
                        <p className="text-sm text-gray-600">{tech.vendorName}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No favorite technologies yet.</p>
          )}
        </div>

        {/* Favorite TechStacks */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Favorite TechStacks ({favoriteTechStacks.length})
          </h2>
          {favoriteTechStacks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {favoriteTechStacks.map((stack: any) => (
                <Link
                  key={stack.id}
                  href={routes.stack(stack.slug)}
                  prefetch={false}
                  className="border border-gray-200 rounded-lg hover:shadow-lg transition-shadow overflow-hidden"
                >
                  {stack.screenshotUrl && (
                    <img
                      src={stack.screenshotUrl}
                      alt={stack.name}
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900">{stack.name}</h3>
                    {stack.vendorName && (
                      <p className="text-sm text-gray-600">{stack.vendorName}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No favorite tech stacks yet.</p>
          )}
        </div>

        {/* Latest Posts */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Latest Posts ({latestPosts.length})
          </h2>
          {latestPosts.length > 0 ? (
            <div className="space-y-4">
              {latestPosts.map((post: any) => (
                <Link
                  key={post.id}
                  href={routes.post(post.id, post.slug)}
                  className="block border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow"
                >
                  <div className="flex gap-4">
                    {post.imageUrl && (
                      <img
                        src={post.imageUrl}
                        alt={post.title}
                        className="w-24 h-24 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 hover:text-blue-600">
                        {post.title}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span>{formatDistanceToNow(new Date(post.created), { addSuffix: true })}</span>
                        <span>↑ {post.upVotes || 0}</span>
                        <span>💬 {post.commentsCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No posts yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

