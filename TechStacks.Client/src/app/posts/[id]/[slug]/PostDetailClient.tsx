'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { PrimaryButton } from '@servicestack/react';
import { useAuthorization } from '@/lib/hooks/useAuthorization';
import { useAppStore } from '@/lib/stores/useAppStore';
import { appAuth } from '@/lib/auth';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { TechnologyTags } from '@/components/TechnologyTags';
import { Avatar } from '@/components/ui/Avatar';

export default function PostDetailClient() {
  const { canEditPost, canDeleteComment } = useAuthorization();
  const { isAuthenticated } = appAuth();
  const { sessionInfo } = useAppStore();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [upVotedPostIds, setUpVotedPostIds] = useState<number[]>([]);
  const [downVotedPostIds, setDownVotedPostIds] = useState<number[]>([]);
  const [localPostPoints, setLocalPostPoints] = useState<number | null>(null);
  const [upVotedCommentIds, setUpVotedCommentIds] = useState<number[]>([]);
  const [downVotedCommentIds, setDownVotedCommentIds] = useState<number[]>([]);
  const [localCommentPoints, setLocalCommentPoints] = useState<Record<number, number>>({});

  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const idSegment = segments[1]; // /posts/{id}/{slug}
  const slug = segments[2] ?? '';

  const postId = idSegment ? parseInt(idSegment, 10) : NaN;

  useEffect(() => {
    const loadPost = async () => {
      if (!postId || Number.isNaN(postId)) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const response = await gateway.getPost(postId);
        setPost(response.post);
        setComments(response.comments || []);

        // Load user's votes if authenticated
        if (isAuthenticated) {
          try {
            const [votes, activity] = await Promise.all([
              gateway.getUserPostCommentVotes(postId),
              gateway.getUserPostActivity(),
            ]);
            setUpVotedCommentIds(votes.upVotedCommentIds || []);
            setDownVotedCommentIds(votes.downVotedCommentIds || []);
            setUpVotedPostIds(activity.upVotedPostIds || []);
            setDownVotedPostIds(activity.downVotedPostIds || []);
          } catch (err) {
            console.error('Failed to load votes:', err);
          }
        }
      } catch (err) {
        console.error('Failed to load post:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [postId, isAuthenticated]);

  const handlePostVote = async (weight: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;

    try {
      const currentUpVoted = upVotedPostIds.includes(postId);
      const currentDownVoted = downVotedPostIds.includes(postId);
      const currentPoints = localPostPoints ?? post?.points ?? 0;

      let newWeight = weight;
      let pointsDelta = 0;

      if (weight === 1) {
        if (currentUpVoted) {
          newWeight = 0;
          pointsDelta = -1;
          setUpVotedPostIds(prev => prev.filter(id => id !== postId));
        } else {
          pointsDelta = currentDownVoted ? 2 : 1;
          setUpVotedPostIds(prev => [...prev, postId]);
          setDownVotedPostIds(prev => prev.filter(id => id !== postId));
        }
      } else if (weight === -1) {
        if (currentDownVoted) {
          newWeight = 0;
          pointsDelta = 1;
          setDownVotedPostIds(prev => prev.filter(id => id !== postId));
        } else {
          pointsDelta = currentUpVoted ? -2 : -1;
          setDownVotedPostIds(prev => [...prev, postId]);
          setUpVotedPostIds(prev => prev.filter(id => id !== postId));
        }
      }

      setLocalPostPoints(currentPoints + pointsDelta);
      await gateway.votePost(postId, newWeight);
    } catch (err) {
      console.error('Failed to vote on post:', err);
    }
  };

  const handleCommentVote = async (commentId: number, weight: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      return;
    }

    try {
      const currentUpVoted = upVotedCommentIds.includes(commentId);
      const currentDownVoted = downVotedCommentIds.includes(commentId);
      const comment = comments.find(c => c.id === commentId);
      const currentPoints = localCommentPoints[commentId] ?? ((comment?.upVotes ?? 0) - (comment?.downVotes ?? 0));

      let newWeight = weight;
      let pointsDelta = 0;

      if (weight === 1) {
        if (currentUpVoted) {
          newWeight = 0;
          pointsDelta = -1;
          setUpVotedCommentIds(prev => prev.filter(id => id !== commentId));
        } else {
          pointsDelta = currentDownVoted ? 2 : 1;
          setUpVotedCommentIds(prev => [...prev, commentId]);
          setDownVotedCommentIds(prev => prev.filter(id => id !== commentId));
        }
      } else if (weight === -1) {
        if (currentDownVoted) {
          newWeight = 0;
          pointsDelta = 1;
          setDownVotedCommentIds(prev => prev.filter(id => id !== commentId));
        } else {
          pointsDelta = currentUpVoted ? -2 : -1;
          setDownVotedCommentIds(prev => [...prev, commentId]);
          setUpVotedCommentIds(prev => prev.filter(id => id !== commentId));
        }
      }

      setLocalCommentPoints(prev => ({
        ...prev,
        [commentId]: currentPoints + pointsDelta
      }));

      await gateway.votePostComment(postId, commentId, newWeight);
    } catch (err) {
      console.error('Failed to vote on comment:', err);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAuthenticated || !newComment.trim()) {
      return;
    }

    try {
      await gateway.createPostComment(postId, newComment, replyToId || undefined);
      setNewComment('');
      setReplyToId(null);

      // Reload post to get updated comments
      const response = await gateway.getPost(postId);
      setComments(response.comments || []);
    } catch (err) {
      console.error('Failed to create comment:', err);
    }
  };

  const handleEditComment = async (commentId: number) => {
    if (!editContent.trim()) return;

    try {
      await gateway.updatePostComment(commentId, postId, editContent);
      setEditingCommentId(null);
      setEditContent('');

      // Reload comments
      const response = await gateway.getPost(postId);
      setComments(response.comments || []);
    } catch (err) {
      console.error('Failed to update comment:', err);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    try {
      await gateway.deletePostComment(commentId, postId);

      // Reload comments
      const response = await gateway.getPost(postId);
      setComments(response.comments || []);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const startEdit = (comment: any) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  // Organize comments into a tree structure
  const organizeComments = (comments: any[]) => {
    const commentMap = new Map();
    const rootComments: any[] = [];

    // First pass: create a map of all comments
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: organize into tree structure
    comments.forEach(comment => {
      const commentWithReplies = commentMap.get(comment.id);
      if (comment.replyId && commentMap.has(comment.replyId)) {
        commentMap.get(comment.replyId).replies.push(commentWithReplies);
      } else {
        rootComments.push(commentWithReplies);
      }
    });

    return rootComments;
  };

  const organizedComments = organizeComments(comments);

  // Recursive function to render a comment and its replies
  const renderComment = (comment: any, depth: number): React.ReactNode => {
    const isUpVoted = upVotedCommentIds.includes(comment.id);
    const isDownVoted = downVotedCommentIds.includes(comment.id);
    const displayPoints = localCommentPoints[comment.id] ?? ((comment.upVotes ?? 0) - (comment.downVotes ?? 0));
    const isOwnComment = sessionInfo?.userId === comment.userId;
    const canDelete = canDeleteComment(comment);
    const isEditing = editingCommentId === comment.id;
    const isReplyingTo = replyToId === comment.id;

    return (
      <div key={comment.id} className={depth > 0 ? 'ml-12' : ''}>
        <div className="flex gap-3">
          {/* Voting */}
          <div className="flex flex-col items-center space-y-1 text-gray-500">
            <button type="button"
              onClick={(e) => handleCommentVote(comment.id, 1, e)}
              className={`text-xl transition-colors ${
                isUpVoted
                  ? 'text-green-600'
                  : 'hover:text-green-600'
              }`}
              title={isUpVoted ? 'Remove upvote' : 'Upvote'}
              disabled={!isAuthenticated}
            >
              ▲
            </button>
            <span className="font-semibold text-sm">{displayPoints}</span>
            <button type="button"
              onClick={(e) => handleCommentVote(comment.id, -1, e)}
              className={`text-xl transition-colors ${
                isDownVoted
                  ? 'text-red-600'
                  : 'hover:text-red-600'
              }`}
              title={isDownVoted ? 'Remove downvote' : 'Downvote'}
              disabled={!isAuthenticated}
            >
              ▼
            </button>
          </div>

          {/* Comment Content */}
          <div className="flex-1">
            <div className="flex gap-x-2">
              {/* Avatar */}
              <div className="flex items-center">
                <Avatar
                  imageUrl={comment.userProfileUrl}
                  alt={comment.createdBy || 'User'}
                  size="sm"
                />
              </div>

              <div className="text-sm text-gray-600 mb-2">
                {formatDistanceToNow(new Date(comment.created), { addSuffix: true })}
                {comment.modified && comment.modified !== comment.created && (
                  <span className="text-gray-500"> (edited)</span>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="mb-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleEditComment(comment.id)}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="prose max-w-none mb-2"
                  dangerouslySetInnerHTML={{ __html: comment.contentHtml || comment.content }}
                />
                <div className="flex gap-3 text-sm text-gray-600">
                  {isAuthenticated && (
                    <button
                      onClick={() => setReplyToId(comment.id)}
                      className="hover:text-blue-600"
                    >
                      Reply
                    </button>
                  )}
                  {isOwnComment && (
                    <button
                      onClick={() => startEdit(comment)}
                      className="hover:text-blue-600"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="hover:text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Reply Form */}
        {isReplyingTo && isAuthenticated && (
          <div className="ml-12 mt-3">
            <form onSubmit={handleSubmitComment}>
              <div className="mb-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={`Reply to ${comment.createdBy}...`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <PrimaryButton type="submit" disabled={!newComment.trim()}>
                  Post Reply
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => setReplyToId(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Render Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-4 space-y-4">
            {comment.replies.map((reply: any) => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-normal text-red-600">
          <span className="mr-2">⚠</span>
          Post was not found
        </h2>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Post Card */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex gap-4 mb-4">
          {/* Post Voting */}
          <div className="flex flex-col items-center text-gray-500 -mt-1">
            <button type="button"
              onClick={(e) => handlePostVote(1, e)}
              className={`text-2xl leading-none p-1 transition-colors ${
                upVotedPostIds.includes(postId)
                  ? 'text-green-600'
                  : 'hover:text-green-600'
              }`}
              title={upVotedPostIds.includes(postId) ? 'Remove upvote' : 'Upvote'}
              disabled={!isAuthenticated}
            >
              ▲
            </button>
            <span className="font-semibold text-base">
              {localPostPoints ?? post.points ?? 0}
            </span>
            <button type="button"
              onClick={(e) => handlePostVote(-1, e)}
              className={`text-2xl leading-none p-1 transition-colors ${
                downVotedPostIds.includes(postId)
                  ? 'text-red-600'
                  : 'hover:text-red-600'
              }`}
              title={downVotedPostIds.includes(postId) ? 'Remove downvote' : 'Downvote'}
              disabled={!isAuthenticated}
            >
              ▼
            </button>
          </div>

          {/* Post Header */}
          <div className="flex-1">
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-3xl font-normal flex-1">
                {post.url ? (
                  <a href={post.url} className="text-blue-600 hover:underline">
                    {post.title}
                  </a>
                ) : (
                  post.title
                )}
              </h1>
              {canEditPost(post) && (
                <Link href={routes.postEdit(postId, slug)}>
                  <PrimaryButton className="ml-4">
                    Edit
                  </PrimaryButton>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-gray-600 mb-4">
            {post.userProfileUrl && (
              <img
                src={post.userProfileUrl}
                alt=""
                className="size-6 rounded-full"
              />
            )}
            <span>submitted {formatDistanceToNow(new Date(post.created), { addSuffix: true })}</span>
            {post.technologyIds && post.technologyIds.length > 0 && (
              <>
                <span>·</span>
                <TechnologyTags technologyIds={post.technologyIds} />
              </>
            )}
          </div>

          {post.imageUrl && (
            <div className="mb-4">
              <a href={post.url}>
                <img src={post.imageUrl} alt="post image" className="max-w-full h-auto max-h-[500px]" />
              </a>
            </div>
          )}

          {post.contentHtml && (
            <div className="prose max-w-none mb-4">
              <div dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
              {post.url && (
                <div className="mt-4">
                  <a href={post.url} className="text-blue-600 hover:underline">
                    continue reading
                  </a>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Comments Card */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">
          {comments.length === 0
            ? 'No Comments'
            : comments.length === 1
            ? '1 Comment'
            : `${comments.length} Comments`}
        </h2>

        {/* Add Top-Level Comment Form */}
        {isAuthenticated && !replyToId && (
          <form onSubmit={handleSubmitComment} className="mb-6">
            <div className="mb-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <PrimaryButton type="submit" disabled={!newComment.trim()}>
                Post Comment
              </PrimaryButton>
            </div>
          </form>
        )}

        {/* Comments List */}
        {comments.length > 0 && (
          <div className="space-y-4">
            {organizedComments.map((comment) => renderComment(comment, 0))}
          </div>
        )}
      </div>
    </div>
  );
}

