'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useAuth, PrimaryButton, SecondaryButton, ErrorSummary } from '@servicestack/react';
import { ResponseStatus } from '@servicestack/client';
import { useAppStore } from '@/lib/stores/useAppStore';
import { appAuth } from '@/lib/auth';
import * as gateway from '@/lib/api/gateway';
import routes from '@/lib/utils/routes';
import { QueryPosts } from '@/shared/dtos';

export default function AccountPage() {
  const { isAuthenticated, user } = useAuth();
  const { signOut, revalidate } = appAuth();
  const { favoriteTechnologyIds, favoriteTechStackIds } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [techStacks, setTechStacks] = useState<any[]>([]);
  const [favoriteTechnologies, setFavoriteTechnologies] = useState<any[]>([]);
  const [favoriteTechStacks, setFavoriteTechStacks] = useState<any[]>([]);
  const [latestPosts, setLatestPosts] = useState<any[]>([]);

  // Avatar editing
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarError, setAvatarError] = useState<ResponseStatus | undefined>(undefined);
  // Cache buster to reload the default generated Avatar after it's been reset
  const [avatarVersion, setAvatarVersion] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }

    const loadAccountData = async () => {
      try {
        // Load user's tech stacks
        const userStacksResponse = await gateway.queryTechStacks({
          createdBy: user.userName,
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
          userId: parseInt(user.userId!),
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
  }, [isAuthenticated, user, favoriteTechnologyIds, favoriteTechStackIds]);

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

  const handleLogout = async () => {
    await signOut('/');
  };

  const defaultAvatarUrl = user?.userId ? gateway.userAvatarUrl(user.userId) : '';
  const hasCustomAvatar = !!user?.profileUrl && user.profileUrl !== defaultAvatarUrl;
  const currentAvatarUrl = hasCustomAvatar
    ? user!.profileUrl!
    : avatarVersion // reload the generated Avatar after it's been reset
      ? `${defaultAvatarUrl}?v=${avatarVersion}`
      : defaultAvatarUrl;

  const startEditingAvatar = () => {
    setAvatarUrl(hasCustomAvatar ? user!.profileUrl! : '');
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatarError(undefined);
    setEditingAvatar(true);
  };

  const cancelEditingAvatar = () => {
    setEditingAvatar(false);
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatarError(undefined);
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarError(undefined);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveAvatar = async (profileUrl?: string, file?: File) => {
    setSavingAvatar(true);
    setAvatarError(undefined);
    try {
      const api = await gateway.updateUserAvatar(profileUrl, file);
      if (api.succeeded) {
        // Refresh the Auth User so the new Avatar is displayed in the Header
        await revalidate();
        setAvatarVersion(v => v + 1);
        cancelEditingAvatar();
      } else {
        setAvatarError(api.error!);
      }
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleAvatarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveAvatar(avatarUrl, avatarFile || undefined);
  };

  const handleAvatarReset = async () => {
    if (!confirm('Reset your Avatar back to the default Avatar?')) return;
    if (fileRef.current) fileRef.current.value = '';
    await saveAvatar();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={startEditingAvatar}
                title="Change Avatar"
                className="group relative w-20 h-20 rounded-full overflow-hidden shrink-0"
              >
                {currentAvatarUrl && (
                  <img
                    src={currentAvatarUrl}
                    alt={user?.displayName || user?.userName}
                    className="w-20 h-20 rounded-full object-cover"
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  Change
                </span>
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {user?.displayName || user?.userName}
                </h1>
                <p className="text-gray-600">@{user?.userName}</p>
              </div>
            </div>
            <PrimaryButton onClick={handleLogout} color="red">
              Logout
            </PrimaryButton>
          </div>

          {/* Change Avatar */}
          {editingAvatar && (
            <form onSubmit={handleAvatarSubmit} className="mt-6 border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Change Avatar</h2>

              <ErrorSummary status={avatarError} className="mb-4" />

              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 space-y-4">
                  <div>
                    <label htmlFor="avatar" className="block text-sm font-medium text-gray-700 mb-1">
                      Upload Image
                    </label>
                    <input
                      id="avatar"
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="profileUrl" className="block text-sm font-medium text-gray-700 mb-1">
                      or use an Image URL
                    </label>
                    <input
                      id="profileUrl"
                      type="url"
                      value={avatarUrl}
                      onChange={e => setAvatarUrl(e.target.value)}
                      disabled={!!avatarFile}
                      placeholder="https://example.org/avatar.png"
                      className="block w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    {avatarFile && (
                      <p className="mt-1 text-xs text-gray-500">Ignored while an image is selected</p>
                    )}
                  </div>
                </div>

                <div className="sm:w-40 shrink-0">
                  <p className="block text-sm font-medium text-gray-700 mb-1">Preview</p>
                  <img
                    src={avatarPreview || avatarUrl || currentAvatarUrl}
                    alt="Avatar preview"
                    className="w-24 h-24 rounded-full object-cover border border-gray-200"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <PrimaryButton type="submit" disabled={savingAvatar}>
                  {savingAvatar ? 'Saving...' : 'Save Avatar'}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={cancelEditingAvatar} disabled={savingAvatar}>
                  Cancel
                </SecondaryButton>
                {hasCustomAvatar && (
                  <button
                    type="button"
                    onClick={handleAvatarReset}
                    disabled={savingAvatar}
                    className="text-sm text-gray-600 hover:text-red-600 disabled:opacity-50"
                  >
                    Reset to default Avatar
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Account Info */}
          <div className="mt-6 flex flex-wrap gap-6">
            {user?.roles && user.roles.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Roles</h3>
                <div className="mt-1 flex flex-wrap gap-2">
                  {user.roles.map((role: string) => (
                    <span key={role} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                      {role}
                    </span>
                  ))}
                </div>
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

