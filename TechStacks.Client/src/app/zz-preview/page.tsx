'use client';

import { PostsList } from '@/components/posts/PostsList';
import { Post } from '@/shared/dtos';

const mk = (id: number, title: string, url: string): Post =>
  ({
    id,
    title,
    url,
    slug: 'x',
    type: 'Post',
    points: 208,
    commentsCount: 43,
    created: new Date().toISOString(),
    technologyIds: [],
  }) as unknown as Post;

const posts: Post[] = [
  mk(1, 'Announcing Rust 1.81.0', 'https://blog.rust-lang.org/2024/09/05/Rust-1.81.0/'),
  mk(2, 'Incremental – A library for incremental computations', 'https://github.com/janestreet/incremental'),
  mk(3, 'Five US tech giants hidden debts soar to $1.65T on opaque AI funding', 'https://asia.nikkei.com/business/technology/five-us'),
  mk(4, 'Ask HN: How do you test long-running background jobs?', 'https://news.ycombinator.com/item?id=48987822'),
  mk(5, 'What is everyone working on this week?', 'https://www.reddit.com/r/rust/comments/abc/x/'),
  mk(6, 'A post created on TechStacks with no external link', ''),
  mk(7, 'A very long title that should still wrap correctly alongside the muted domain suffix without breaking the layout at all', 'https://some.rather-long-subdomain.example.com/a/b/c'),
];

export default function PreviewPage() {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-xl font-bold mb-4">PostsList domain preview</h1>
      <PostsList posts={posts} />
    </div>
  );
}
