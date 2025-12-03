'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { appAuth } from '@/lib/auth';
import { TechnologyTags } from '@/components/TechnologyTags';
import { Post } from '@/shared/dtos';


interface PostsListProps {
  posts: Post[];
}

export function PostsList({ posts }: PostsListProps) {
  const router = useRouter();
  const { isAuthenticated } = appAuth();
  const [upVotedPostIds, setUpVotedPostIds] = useState<number[]>([]);
  const [downVotedPostIds, setDownVotedPostIds] = useState<number[]>([]);
  const [localPoints, setLocalPoints] = useState<Record<number, number>>({});

  useEffect(() => {
    const loadUserActivity = async () => {
      if (!isAuthenticated) return;

      try {
        const activity = await gateway.getUserPostActivity();
        setUpVotedPostIds(activity.upVotedPostIds || []);
        setDownVotedPostIds(activity.downVotedPostIds || []);
      } catch (err) {
        console.error('Failed to load user post activity:', err);
      }
    };

    loadUserActivity();
  }, [isAuthenticated]);

  const handleVote = async (postId: number, weight: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click when voting

    if (!isAuthenticated) {
      // Optionally redirect to login
      return;
    }

    try {
      const currentUpVoted = upVotedPostIds.includes(postId);
      const currentDownVoted = downVotedPostIds.includes(postId);
      const post = posts.find(p => p.id === postId);
      const currentPoints = localPoints[postId] ?? post?.points ?? 0;

      // Determine the new vote state
      let newWeight = weight;
      let pointsDelta = 0;

      if (weight === 1) {
        if (currentUpVoted) {
          // Remove upvote
          newWeight = 0;
          pointsDelta = -1;
          setUpVotedPostIds(prev => prev.filter(id => id !== postId));
        } else {
          // Add upvote (and remove downvote if exists)
          pointsDelta = currentDownVoted ? 2 : 1;
          setUpVotedPostIds(prev => [...prev, postId]);
          setDownVotedPostIds(prev => prev.filter(id => id !== postId));
        }
      } else if (weight === -1) {
        if (currentDownVoted) {
          // Remove downvote
          newWeight = 0;
          pointsDelta = 1;
          setDownVotedPostIds(prev => prev.filter(id => id !== postId));
        } else {
          // Add downvote (and remove upvote if exists)
          pointsDelta = currentUpVoted ? -2 : -1;
          setDownVotedPostIds(prev => [...prev, postId]);
          setUpVotedPostIds(prev => prev.filter(id => id !== postId));
        }
      }

      // Update local points optimistically
      setLocalPoints(prev => ({
        ...prev,
        [postId]: currentPoints + pointsDelta
      }));

      await gateway.votePost(postId, newWeight);
    } catch (err) {
      console.error('Failed to vote on post:', err);
      // Optionally revert the optimistic update
    }
  };

  const handleCardClick = (postId: number, slug: string) => {
    router.push(routes.post(postId, slug));
  };

  if (!posts || posts.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-4">
        <p className="text-blue-800">No posts found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 flex-1">
      {posts.map((post) => {
        const postId = post.id!;
        const isUpVoted = upVotedPostIds.includes(postId);
        const isDownVoted = downVotedPostIds.includes(postId);
        const displayPoints = localPoints[postId] ?? post.points ?? 0;

        return (
          <article
            key={post.id}
            onClick={() => handleCardClick(postId, post.slug)}
            className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-3 cursor-pointer"
          >
            <div className="flex gap-4">
              {/* Voting */}
              <div className="flex flex-col items-center space-y-1 text-gray-500">
                <button
                  onClick={(e) => handleVote(postId, 1, e)}
                  className={`text-2xl transition-colors ${
                    isUpVoted
                      ? 'text-green-600'
                      : 'hover:text-green-600'
                  }`}
                  title={isUpVoted ? 'Remove upvote' : 'Upvote'}
                >
                  ▲
                </button>
                <span className="font-semibold text-xl">{displayPoints}</span>
                <button
                  onClick={(e) => handleVote(postId, -1, e)}
                  className={`text-2xl transition-colors ${
                    isDownVoted
                      ? 'text-red-600'
                      : 'hover:text-red-600'
                  }`}
                  title={isDownVoted ? 'Remove downvote' : 'Downvote'}
                >
                  ▼
                </button>
              </div>

            {/* Post Content */}
            <div className="flex-1">
              <div className="flex items-start gap-3">
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="mt-1 size-20 object-cover rounded"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-medium">
                      {post.type}
                    </span>
                    {post.userProfileUrl && (
                      <img
                        src={post.userProfileUrl}
                        alt=""
                        className="size-6 rounded-full"
                      />
                    )}
                    <span>
                      {formatDistanceToNow(new Date(post.created!), { addSuffix: true })}
                    </span>
                    {post.commentsCount || 0
                      ? (<Link
                            href={routes.post(postId, post.slug)}
                            className="hover:text-primary-600"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {post.commentsCount} comments
                          </Link>)
                    : null}
                  </div>
                  {post.labels && post.labels.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {post.labels.map((label) => (
                        <span
                          key={label}
                          className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {post.technologyIds && post.technologyIds.length > 0 && (
                <TechnologyTags technologyIds={post.technologyIds} className="mt-2" />
              )}
            </div>
          </div>
        </article>
        );
      })}
    </div>
  );
}
