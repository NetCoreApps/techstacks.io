'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, PrimaryButton, SecondaryButton } from '@servicestack/react';
import { PostsList } from '@/components/posts/PostsList';
import { PostForm } from '@/components/forms/PostForm';
import { WatchListDialog } from '@/components/WatchListDialog';
import * as gateway from '@/lib/api/gateway';
import { useAppStore } from '@/lib/stores/useAppStore';
import { useHeaderTitle } from '@/lib/hooks/useHeaderTitle';
import Link from 'next/link';
import { QueryPosts, Post, TechnologyView, PostType } from '@/shared/dtos';
import { formatDistanceToNow } from 'date-fns';
import routes from '@/lib/utils/routes';
import { postDomain } from '@/lib/utils/domain';
import { TechnologyTags } from '@/components/TechnologyTags';
import {
  Brain,
  Code2,
  Cpu,
  Smartphone,
  Layout,
  Server,
  Database,
  Cloud,
  Flame,
  Newspaper,
  Eye,
  ArrowRight,
  MessageSquare,
  Plus,
  Clock
} from 'lucide-react';

const POSTS_PER_PAGE = 25;

const POST_TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: PostType.Announcement, label: 'Announcement' },
  { value: PostType.Post, label: 'Post' },
  { value: PostType.Showcase, label: 'Showcase' },
];

interface CategoryConfig {
  name: string;
  icon: any;
  tags: string[];
  color: string;
}

const CATEGORIES_CONFIG: Record<string, CategoryConfig> = {
  ai: {
    name: 'AI & Machine Learning',
    icon: Brain,
    tags: ['AI', 'LLM', 'Claude', 'ChatGPT', 'Machine Learning', 'OpenAI', 'Claude Code', 'Computer Vision', 'Gemini', 'Qwen', 'Kimi', 'GLM', 'Meta AI', 'Codex', 'GenAI', 'Mistral', 'OpenClaw', 'xAI', 'DeepSeek', 'PyTorch', 'TensorFlow', 'vLLM', 'SGLang', 'Hugging Face', 'Chatbots', 'World Models', 'scikit-learn'],
    color: 'border-purple-500 text-purple-600 bg-purple-50 hover:bg-purple-100'
  },
  mobile: {
    name: 'Mobile',
    icon: Smartphone,
    tags: ['iOS', 'Android', 'Fuchsia', 'Swift', 'Kotlin', 'React Native', 'Flutter', 'Apple Pay', 'Google Pay', 'Apple News', 'Smart Device'],
    color: 'border-violet-500 text-violet-600 bg-violet-50 hover:bg-violet-100'
  },
  programming: {
    name: 'Programming',
    icon: Code2,
    tags: ['Programming', 'Python', 'JavaScript', 'node.js', 'C#', '.NET', 'Ruby', 'PHP', 'Swift', 'Dart', 'Lisp', 'WebAssembly', 'Go', 'C', 'C++', 'Objective-C', 'Rust', 'Clojure', 'ClojureScript', 'Elixr', 'Elixir', 'Java', 'F#', 'Perl', 'Lua', 'R', 'Scala', 'Zig', 'Haskell', 'OCaml', 'Erlang', 'Bash', 'Assembly', 'LLVM'],
    color: 'border-emerald-500 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
  },
  os: {
    name: 'Operating Systems',
    icon: Cpu,
    tags: ['Linux', 'Mac', 'macOS', 'Ubuntu', 'Windows', 'CoreOS', 'CentOS', 'FreeBSD', 'Wayland', 'WebKit', 'QEMU', 'KVM', 'io_uring', 'Arch Linux', 'Red Hat Linux'],
    color: 'border-sky-500 text-sky-600 bg-sky-50 hover:bg-sky-100'
  },
  clientFrameworks: {
    name: 'Client Frameworks',
    icon: Layout,
    tags: ['React', 'Vue', 'Angular', 'AngularJS', 'Svelte', 'Next.js', 'Blazor', 'React Native', 'Flutter', 'jQuery', 'Tailwind CSS', 'Bootstrap', 'Backbone.js', 'Ember', 'Astro', 'Nuxt', 'Three.js', 'WebGL', 'WebGPU', 'shadcn/ui'],
    color: 'border-pink-500 text-pink-600 bg-pink-50 hover:bg-pink-100'
  },
  serverFrameworks: {
    name: 'Server Frameworks',
    icon: Server,
    tags: ['node.js', 'Django', 'FastAPI', 'Flask', 'Ruby on Rails', 'Laravel', 'Spring', 'ASP.NET Core', 'ASP.NET MVC', 'ServiceStack', 'Express', 'NestJS', 'Phoenix', 'Sinatra', 'Play Framework', 'Docker', 'Kubernetes', 'Nginx', 'Caddy', 'HAProxy', 'RabbitMQ', 'gRPC', 'Apache Kafka', 'Apache Tomcat'],
    color: 'border-amber-500 text-amber-600 bg-amber-50 hover:bg-amber-100'
  },
  sql: {
    name: 'SQL Databases',
    icon: Database,
    tags: ['SQL', 'PostgreSQL', 'SQLite', 'SqlServer', 'MySQL', 'Oracle Database', 'MariaDB', 'BigQuery', 'Microsoft SQL Server', 'OrmLite'],
    color: 'border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100'
  },
  nosql: {
    name: 'NoSQL Databases',
    icon: Cloud,
    tags: ['NoSQL', 'Redis', 'MongoDB', 'mongoDB', 'Cassandra', 'LevelDB', 'Elasticsearch', 'CouchDB', 'Apache CouchDB', 'DynamoDB', 'Amazon DynamoDB', 'Neo4j', 'RocksDB', 'InfluxDB', 'Memcached', 'FoundationDB'],
    color: 'border-red-500 text-red-600 bg-red-50 hover:bg-red-100'
  },
};

function getCategoryGradient(categoryKey: string) {
  switch (categoryKey) {
    case 'ai':
      return 'from-violet-600 to-indigo-600';
    case 'programming':
      return 'from-emerald-500 to-teal-600';
    case 'os':
      return 'from-blue-600 to-cyan-500';
    case 'clientFrameworks':
      return 'from-pink-500 to-rose-600';
    case 'serverFrameworks':
      return 'from-amber-500 to-orange-600';
    case 'sql':
      return 'from-blue-700 to-indigo-700';
    case 'nosql':
      return 'from-red-500 to-rose-700';
    case 'mobile':
      return 'from-purple-600 to-fuchsia-600';
    default:
      return 'from-slate-600 to-gray-700';
  }
}

function PostVisual({ post, categoryKey, className = 'h-48' }: { post: Post; categoryKey: string | null; className?: string }) {
  if (post.imageUrl) {
    return (
      <img
        src={post.imageUrl}
        alt=""
        className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${className}`}
      />
    );
  }

  const gradient = getCategoryGradient(categoryKey || '');
  return (
    <div className={`w-full bg-gradient-to-br ${gradient} flex items-center justify-center p-4 text-white relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 opacity-10 mix-blend-overlay">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      <span className="text-white/20 text-sm font-black tracking-widest uppercase select-none pointer-events-none">
        {categoryKey || 'Tech'}
      </span>
    </div>
  );
}

function VoteWidget({
  postId,
  points,
  isUpVoted,
  isDownVoted,
  onVote,
  horizontal = false
}: {
  postId: number;
  points: number;
  isUpVoted: boolean;
  isDownVoted: boolean;
  onVote: (postId: number, weight: number, e: React.MouseEvent) => void;
  horizontal?: boolean;
}) {
  return (
    <div
      className={`flex items-center text-gray-500 ${
        horizontal ? 'flex-row space-x-2' : 'flex-col space-y-1'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => onVote(postId, 1, e)}
        className={`text-lg p-0.5 transition-colors leading-none hover:text-green-600 ${
          isUpVoted ? 'text-green-600 font-bold scale-110' : ''
        }`}
        title={isUpVoted ? 'Remove upvote' : 'Upvote'}
      >
        ▲
      </button>
      <span className="font-semibold text-sm min-w-[16px] text-center">{points}</span>
      <button
        type="button"
        onClick={(e) => onVote(postId, -1, e)}
        className={`text-lg p-0.5 transition-colors leading-none hover:text-red-600 ${
          isDownVoted ? 'text-red-600 font-bold scale-110' : ''
        }`}
        title={isDownVoted ? 'Remove downvote' : 'Downvote'}
      >
        ▼
      </button>
    </div>
  );
}

function FeaturedStory({
  post,
  categoryKey,
  onPostClick,
  onVote,
  upVotedPostIds,
  downVotedPostIds,
  localPoints
}: {
  post: Post;
  categoryKey: string | null;
  onPostClick: (postId: number, slug: string) => void;
  onVote: (postId: number, weight: number, e: React.MouseEvent) => void;
  upVotedPostIds: number[];
  downVotedPostIds: number[];
  localPoints: Record<number, number>;
}) {
  const gradient = getCategoryGradient(categoryKey || '');
  const hasImage = !!post.imageUrl;
  return (
    <article
      onClick={() => onPostClick(post.id!, post.slug)}
      className="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-300 cursor-pointer flex flex-col h-full"
    >
      {/* Hero Visual Area (only if it has a real imageUrl) */}
      {hasImage && (
        <div className="relative w-full h-48 overflow-hidden bg-gray-900 shrink-0">
          <img
            src={post.imageUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}

      {/* Content Area */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          {categoryKey && (
            <div className="mb-3">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded shadow-sm bg-gradient-to-r ${gradient} text-white`}>
                {categoryKey}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                Featured {post.type}
              </span>
              {post.userProfileUrl && (
                <img src={post.userProfileUrl} alt="" className="size-5 rounded-full" />
              )}
              <span>
                {formatDistanceToNow(new Date(post.created!), { addSuffix: true })}
              </span>
            </div>

            <h2 className="text-lg md:text-xl font-extrabold text-gray-900 group-hover:text-indigo-600 transition-colors leading-snug">
              {post.title}
              {postDomain(post.url) && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {postDomain(post.url)}
                </span>
              )}
            </h2>

            {post.content && (
              <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                {post.content.replace(/<[^>]*>/g, '').slice(0, 150)}...
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <VoteWidget
              postId={post.id!}
              points={localPoints[post.id!] ?? post.points ?? 0}
              isUpVoted={upVotedPostIds.includes(post.id!)}
              isDownVoted={downVotedPostIds.includes(post.id!)}
              onVote={onVote}
              horizontal
            />
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <MessageSquare className="size-4" /> {post.commentsCount || 0}
            </span>
          </div>
          {post.technologyIds && post.technologyIds.length > 0 && (
            <TechnologyTags technologyIds={post.technologyIds} />
          )}
        </div>
      </div>
    </article>
  );
}

function TrendingDiscussions({
  posts,
  onPostClick
}: {
  posts: Post[];
  onPostClick: (postId: number, slug: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex flex-col h-full">
      <div className="flex items-center gap-2 pb-4 mb-4 border-b border-gray-100">
        <Flame className="size-5 text-orange-500 fill-orange-500" />
        <h2 className="font-bold text-gray-900 text-lg tracking-tight">
          Trending Discussions
        </h2>
      </div>

      {posts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm italic py-10">
          No active discussions
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((post, index) => {
            return (
              <article
                key={post.id}
                onClick={() => onPostClick(post.id!, post.slug)}
                className="p-3 border border-gray-50 hover:border-indigo-100 hover:bg-gray-50/30 rounded-lg transition-colors cursor-pointer group flex items-start gap-4 h-full"
              >
                <span className="text-2xl font-black text-gray-200 group-hover:text-indigo-400 transition-colors select-none shrink-0 w-8">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <div className="space-y-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-relaxed">
                    {post.title}
                  </h3>
                  {postDomain(post.url) && (
                    <div className="text-[10px] text-gray-500 truncate">
                      {postDomain(post.url)}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryBlock({
  categoryKey,
  config,
  posts,
  onPostClick,
  onVote,
  upVotedPostIds,
  downVotedPostIds,
  localPoints,
  onViewAll
}: {
  categoryKey: string;
  config: CategoryConfig;
  posts: Post[];
  onPostClick: (postId: number, slug: string) => void;
  onVote: (postId: number, weight: number, e: React.MouseEvent) => void;
  upVotedPostIds: number[];
  downVotedPostIds: number[];
  localPoints: Record<number, number>;
  onViewAll: (categoryKey: string) => void;
}) {
  const Icon = config.icon;
  const primaryPost = posts[0];
  const secondaryPosts = posts.slice(1, 5);

  const borderClass = config.color.split(' ')[0] || 'border-gray-200';
  const badgeColors = config.color.split(' ').slice(1).join(' ') || 'text-gray-600 bg-gray-50';

  return (
    <section className={`bg-white rounded-lg shadow-sm border-t-4 ${borderClass} border border-gray-200 hover:shadow-md transition-shadow duration-300 flex flex-col h-full overflow-hidden`}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`p-1.5 rounded-lg ${badgeColors}`}>
            <Icon className="size-5" />
          </span>
          <h2 className="font-bold text-gray-900 text-lg tracking-tight">
            {config.name}
          </h2>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col space-y-4">
        {posts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-10 text-gray-400 text-sm italic">
            No recent news in this category
          </div>
        ) : (
          <>
            {primaryPost && (
              <article
                onClick={() => onPostClick(primaryPost.id!, primaryPost.slug)}
                className={`group cursor-pointer block border border-gray-100 rounded-lg overflow-hidden hover:border-gray-200 transition-all ${
                  !primaryPost.imageUrl ? `border-l-4 ${borderClass} bg-gray-50/20` : ''
                }`}
              >
                {primaryPost.imageUrl && (
                  <div className="relative w-full h-32 overflow-hidden bg-gray-900 shrink-0">
                    <img
                      src={primaryPost.imageUrl}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">
                    {primaryPost.title}
                  </h3>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1 font-medium bg-gray-50 px-1.5 py-0.5 rounded text-gray-600">
                      {primaryPost.type}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-3" /> {primaryPost.commentsCount || 0}
                      </span>
                      <VoteWidget
                        postId={primaryPost.id!}
                        points={localPoints[primaryPost.id!] ?? primaryPost.points ?? 0}
                        isUpVoted={upVotedPostIds.includes(primaryPost.id!)}
                        isDownVoted={downVotedPostIds.includes(primaryPost.id!)}
                        onVote={onVote}
                        horizontal
                      />
                    </div>
                  </div>
                  {primaryPost.technologyIds && primaryPost.technologyIds.length > 0 && (
                    <TechnologyTags technologyIds={primaryPost.technologyIds} className="mt-1" />
                  )}
                </div>
              </article>
            )}

            {secondaryPosts.length > 0 && (
              <div className="divide-y divide-gray-100 flex-1">
                {secondaryPosts.map((post) => (
                  <article
                    key={post.id}
                    onClick={() => onPostClick(post.id!, post.slug)}
                    className="py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50/50 px-1 -mx-1 rounded transition-colors cursor-pointer group flex items-start gap-3"
                  >
                    <div className="w-1.5 h-1.5 mt-2 rounded-full bg-gray-300 group-hover:bg-indigo-500 transition-colors shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-relaxed">
                        {post.title}
                      </h4>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        {postDomain(post.url) && (
                          <span className="truncate max-w-[10rem]">{postDomain(post.url)}</span>
                        )}
                        <span>{formatDistanceToNow(new Date(post.created!), { addSuffix: true })}</span>
                        <span className="flex items-center gap-0.5"><MessageSquare className="size-2.5" /> {post.commentsCount || 0}</span>
                        <span>▲ {localPoints[post.id!] ?? post.points ?? 0}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {posts.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/70 text-right">
          <button
            type="button"
            onClick={() => onViewAll(categoryKey)}
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-all cursor-pointer"
          >
            View Channel <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}

function PortalSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-200 rounded-lg h-96"></div>
        <div className="bg-gray-200 rounded-lg h-96"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-200 rounded-lg h-96"></div>
        ))}
      </div>
    </div>
  );
}

function HomePageContent() {
  useHeaderTitle('Latest Tech News');
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

  // Redesign state variables
  const [viewMode, setViewMode] = useState<'portal' | 'all' | 'watch'>('portal');
  const [techMap, setTechMap] = useState<Record<string, { id: number; name: string; slug: string }>>({});
  const [techsLoaded, setTechsLoaded] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [portalFilter, setPortalFilter] = useState<{ name: string; ids: number[]; tags: string[] } | null>(null);
  const [portalData, setPortalData] = useState<{
    hero: Post | null;
    trending: Post[];
    categories: Record<string, Post[]>;
  }>({ hero: null, trending: [], categories: {} });

  const [upVotedPostIds, setUpVotedPostIds] = useState<number[]>([]);
  const [downVotedPostIds, setDownVotedPostIds] = useState<number[]>([]);
  const [localPoints, setLocalPoints] = useState<Record<number, number>>({});

  const [watchEnabled] = useState(() => {
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

  // Load user vote activity
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

  // Map category tag names to database IDs
  const getCategoryTechIds = useCallback((tags: string[]) => {
    const ids = new Set<number>();
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim();
      if (techMap[normalized]) {
        ids.add(techMap[normalized].id);
      }
      const slugStyle = normalized.replace(/[\s.]+/g, '-');
      if (techMap[slugStyle]) {
        ids.add(techMap[slugStyle].id);
      }
    }
    return Array.from(ids);
  }, [techMap]);

  // Load all technologies once to populate the lookup map
  useEffect(() => {
    setMounted(true);
    gateway.getAllTechnologies()
      .then((res) => {
        const results = res.results || [];
        const mapping: Record<string, { id: number; name: string; slug: string }> = {};
        for (const tech of results) {
          if (tech.id && tech.name) {
            const lowerName = tech.name.toLowerCase().trim();
            mapping[lowerName] = { id: tech.id, name: tech.name, slug: tech.slug };
            const slugified = tech.slug.toLowerCase().trim();
            mapping[slugified] = { id: tech.id, name: tech.name, slug: tech.slug };
          }
        }
        setTechMap(mapping);
        setTechnologies(results.slice(0, 30));
        setTechsLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load all technologies:', err);
        setTechsLoaded(true);
      });
  }, []);

  const getCategoryForPost = useCallback((post: Post) => {
    if (!post.technologyIds || post.technologyIds.length === 0) return null;

    for (const [key, config] of Object.entries(CATEGORIES_CONFIG)) {
      const catIds = getCategoryTechIds(config.tags);
      if (post.technologyIds.some(id => catIds.includes(id))) {
        return {
          key,
          name: config.name,
          color: config.color.split(' ')[1] || 'text-indigo-600'
        };
      }
    }
    return null;
  }, [getCategoryTechIds]);

  const loadPosts = useCallback(async (
    page: number = 1,
    postType: string = '',
    watched: number[] = [],
    filterIds: number[] = []
  ) => {
    try {
      setLoading(true);
      setError(null);
      const skip = (page - 1) * POSTS_PER_PAGE;
      const query = new QueryPosts({ orderBy: '-id', take: POSTS_PER_PAGE, skip });

      const activeIds = filterIds.length > 0 ? filterIds : watched;
      if (activeIds.length > 0) {
        query.anyTechnologyIds = activeIds;
      }
      if (postType) {
        query.types = [postType];
      }
      const response = await gateway.queryPosts(query);
      setPosts(response.results || []);
      setTotal(response.total || 0);
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Failed to load posts:', err);
      setError(err.message || 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPortalData = useCallback(async (postType: string) => {
    if (Object.keys(techMap).length === 0) return;
    setLoadingPortal(true);
    try {
      // 1. Fetch latest overall posts
      const overallQuery = new QueryPosts({
        orderBy: '-id',
        take: 10
      });
      if (postType) {
        overallQuery.types = [postType];
      }
      const overallResponse = await gateway.queryPosts(overallQuery);
      const overallPosts = overallResponse.results || [];

      let hero: Post | null = null;
      let trending: Post[] = [];

      if (overallPosts.length > 0) {
        let bestIndex = 0;
        let maxPoints = -99999;
        for (let i = 0; i < overallPosts.length; i++) {
          const pts = overallPosts[i].points || 0;
          if (pts > maxPoints) {
            maxPoints = pts;
            bestIndex = i;
          }
        }
        hero = overallPosts[bestIndex];
        trending = overallPosts.filter((_, idx) => idx !== bestIndex).slice(0, 6);
      }

      // 2. Fetch category streams in parallel
      const catKeys = Object.keys(CATEGORIES_CONFIG);
      const catPromises = catKeys.map(async (key) => {
        const config = CATEGORIES_CONFIG[key];
        const ids = getCategoryTechIds(config.tags);
        if (ids.length === 0) {
          return [key, []];
        }
        const query = new QueryPosts({
          anyTechnologyIds: ids,
          orderBy: '-id',
          take: 5
        });
        if (postType) {
          query.types = [postType];
        }
        try {
          const res = await gateway.queryPosts(query);
          return [key, res.results || []];
        } catch {
          return [key, []];
        }
      });

      const catResults = await Promise.all(catPromises);
      const categoriesMap: Record<string, Post[]> = {};
      for (const [key, results] of catResults) {
        categoriesMap[key as string] = results as Post[];
      }

      setPortalData({ hero, trending, categories: categoriesMap });
    } catch (err) {
      console.error('Failed to load portal data:', err);
    } finally {
      setLoadingPortal(false);
    }
  }, [techMap, getCategoryTechIds]);

  // Synchronize route and search parameters with state
  useEffect(() => {
    if (!techsLoaded) return;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const postType = searchParams.get('type') || '';
    const view = searchParams.get('view') || 'portal';
    const categoryName = searchParams.get('category') || '';

    setSelectedPostType(postType);

    let resolvedFilter = null;
    if (categoryName) {
      const configEntry = Object.entries(CATEGORIES_CONFIG).find(([_, c]) => c.name === categoryName);
      if (configEntry) {
        const [_, config] = configEntry;
        const ids = getCategoryTechIds(config.tags);
        resolvedFilter = { name: config.name, ids, tags: config.tags };
        setPortalFilter(resolvedFilter);
      }
    }

    const activeView = view as 'portal' | 'all' | 'watch';
    setViewMode(activeView);

    if (activeView === 'portal' && !resolvedFilter) {
      loadPortalData(postType);
    } else {
      const activeWatched = activeView === 'watch' ? watchedTechIds : [];
      loadPosts(page, postType, activeWatched, resolvedFilter ? resolvedFilter.ids : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techsLoaded, searchParams]);

  const handlePostDone = () => {
    setShowPostForm(false);
    if (viewMode === 'portal' && !portalFilter) {
      loadPortalData(selectedPostType);
    } else {
      const activeWatched = viewMode === 'watch' ? watchedTechIds : [];
      loadPosts(1, selectedPostType, activeWatched, portalFilter ? portalFilter.ids : []);
    }
  };

  const handleWatchDialogClose = (open: boolean) => {
    const wasOpen = watchDialogOpen;
    setWatchDialogOpen(open);
    if (wasOpen && !open) {
      if (viewMode === 'watch') {
        const currentWatched = useAppStore.getState().watchedTechIds;
        loadPosts(1, selectedPostType, currentWatched, []);
      }
    }
  };

  const updateUrl = useCallback((mode: 'portal' | 'all' | 'watch', type: string, page: number, catName: string) => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', page.toString());
    if (type) params.set('type', type);
    if (mode !== 'portal') params.set('view', mode);
    if (catName) params.set('category', catName);

    const queryString = params.toString();
    router.replace(queryString ? `/?${queryString}` : '/');
  }, [router]);

  const handleViewChange = (mode: 'portal' | 'all' | 'watch') => {
    setViewMode(mode);
    setPortalFilter(null);
    setCurrentPage(1);

    updateUrl(mode, selectedPostType, 1, '');

    if (mode === 'portal') {
      loadPortalData(selectedPostType);
    } else {
      loadPosts(1, selectedPostType, mode === 'watch' ? watchedTechIds : [], []);
    }
  };

  const handlePostTypeChange = (postType: string) => {
    setSelectedPostType(postType);
    setCurrentPage(1);

    updateUrl(viewMode, postType, 1, portalFilter ? portalFilter.name : '');

    if (viewMode === 'portal' && !portalFilter) {
      loadPortalData(postType);
    } else {
      const activeWatched = viewMode === 'watch' ? watchedTechIds : [];
      loadPosts(1, postType, activeWatched, portalFilter ? portalFilter.ids : []);
    }
  };

  const handlePageChange = (page: number) => {
    updateUrl(viewMode, selectedPostType, page, portalFilter ? portalFilter.name : '');

    const activeWatched = viewMode === 'watch' ? watchedTechIds : [];
    loadPosts(page, selectedPostType, activeWatched, portalFilter ? portalFilter.ids : []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryViewAll = (categoryKey: string) => {
    const config = CATEGORIES_CONFIG[categoryKey];
    const ids = getCategoryTechIds(config.tags);
    const filter = { name: config.name, ids, tags: config.tags };

    setPortalFilter(filter);
    setViewMode('all');
    setCurrentPage(1);

    updateUrl('all', selectedPostType, 1, config.name);

    loadPosts(1, selectedPostType, [], ids);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearCategoryFilter = () => {
    setPortalFilter(null);
    setCurrentPage(1);

    updateUrl('all', selectedPostType, 1, '');

    loadPosts(1, selectedPostType, [], []);
  };

  const handleVote = async (postId: number, weight: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;

    try {
      const currentUpVoted = upVotedPostIds.includes(postId);
      const currentDownVoted = downVotedPostIds.includes(postId);

      let post = posts.find(p => p.id === postId);
      if (!post && portalData.hero?.id === postId) post = portalData.hero;
      if (!post) {
        for (const catPosts of Object.values(portalData.categories)) {
          const p = catPosts.find(x => x.id === postId);
          if (p) {
            post = p;
            break;
          }
        }
      }
      if (!post) post = portalData.trending.find(p => p.id === postId);

      const currentPoints = localPoints[postId] ?? post?.points ?? 0;
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

      setLocalPoints(prev => ({
        ...prev,
        [postId]: currentPoints + pointsDelta
      }));

      await gateway.votePost(postId, newWeight);
    } catch (err) {
      console.error('Failed to vote on post:', err);
    }
  };

  const totalPages = Math.ceil(total / POSTS_PER_PAGE);
  const showSidebar = viewMode !== 'portal' || !!portalFilter;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Top Header Section */}
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {mounted && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => handleViewChange('portal')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'portal'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-950'
                  }`}
                >
                  <Newspaper className="size-3.5" />
                  News Portal
                </button>
                <button
                  type="button"
                  onClick={() => handleViewChange('all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'all' && !portalFilter
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-950'
                  }`}
                >
                  <Clock className="size-3.5" />
                  Latest Feed
                </button>
                <button
                  type="button"
                  onClick={() => handleViewChange('watch')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'watch'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-950'
                  }`}
                >
                  <Eye className="size-3.5" />
                  Watch List
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Post Type Filters */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {POST_TYPE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => handlePostTypeChange(option.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    selectedPostType === option.value
                      ? 'bg-white text-gray-955 shadow-sm'
                      : 'text-gray-500 hover:text-gray-950'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {mounted && isAuthenticated && !showPostForm && (
              <PrimaryButton
                onClick={() => setShowPostForm(true)}
                className="whitespace-nowrap px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="size-4" />
                New Post
              </PrimaryButton>
            )}
            {mounted && showPostForm && (
              <SecondaryButton onClick={() => setShowPostForm(false)} className="font-semibold">
                Cancel
              </SecondaryButton>
            )}
          </div>
        </div>

        {/* Post Form */}
        {showPostForm && (
          <div className="mb-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <PostForm onDone={handlePostDone} />
          </div>
        )}

        {/* Main Grid Layout (Left Content, Right Sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (News Portal Grid OR Feed List) */}
          <div className={`${showSidebar ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-6`}>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium">{error}</p>
              </div>
            )}

            {/* 1. NEWS PORTAL MODE */}
            {viewMode === 'portal' && !portalFilter && (
              <>
                {loadingPortal ? (
                  <PortalSkeleton />
                ) : (
                  <div className="space-y-8">
                    {/* Hero & Trending Section */}
                    {portalData.hero && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                          <FeaturedStory
                            post={portalData.hero}
                            categoryKey={getCategoryForPost(portalData.hero)?.key || null}
                            onPostClick={(id, slug) => router.push(routes.post(id, slug))}
                            onVote={handleVote}
                            upVotedPostIds={upVotedPostIds}
                            downVotedPostIds={downVotedPostIds}
                            localPoints={localPoints}
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <TrendingDiscussions
                            posts={portalData.trending}
                            onPostClick={(id, slug) => router.push(routes.post(id, slug))}
                          />
                        </div>
                      </div>
                    )}

                    {/* Categories Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {Object.entries(CATEGORIES_CONFIG).map(([key, config]) => {
                        const posts = portalData.categories[key] || [];
                        return (
                          <CategoryBlock
                            key={key}
                            categoryKey={key}
                            config={config}
                            posts={posts}
                            onPostClick={(id, slug) => router.push(routes.post(id, slug))}
                            onVote={handleVote}
                            upVotedPostIds={upVotedPostIds}
                            downVotedPostIds={downVotedPostIds}
                            localPoints={localPoints}
                            onViewAll={handleCategoryViewAll}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 2. CHRONOLOGICAL FEED MODE (LATEST OR WATCH LIST OR CATEGORY FILTER) */}
            {((viewMode !== 'portal') || portalFilter) && (
              <>
                {/* Category Filter Banner */}
                {portalFilter && (
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                        <Newspaper className="size-5" />
                      </span>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">
                          Channel: {portalFilter.name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Showing articles covering tags: {portalFilter.tags.slice(0, 10).join(', ')}...
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearCategoryFilter}
                      className="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover:text-indigo-800 rounded-md text-xs font-bold transition-all cursor-pointer"
                    >
                      Clear Filter
                    </button>
                  </div>
                )}

                {/* Watch List Info Banner */}
                {viewMode === 'watch' && watchedTechIds.length === 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                    <Eye className="size-8 text-blue-500 mx-auto mb-3" />
                    <h3 className="font-bold text-blue-900 text-base">Watch List Empty</h3>
                    <p className="text-sm text-blue-700 mt-1 max-w-md mx-auto">
                      Add technologies using the "+ Add" button in the sidebar to build your personalized watch list feed.
                    </p>
                  </div>
                )}

                {loading ? (
                  <div className="flex justify-center items-center py-16 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      <span className="text-sm text-gray-500 font-medium">Loading posts...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <PostsList posts={posts} />

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="mt-6 flex items-center justify-center gap-2">
                        <button type="button"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Previous
                        </button>

                        <div className="flex items-center gap-1">
                          {currentPage > 3 && (
                            <>
                              <button type="button"
                                onClick={() => handlePageChange(1)}
                                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                              >
                                1
                              </button>
                              {currentPage > 4 && (
                                <span className="px-2 text-gray-500">...</span>
                              )}
                            </>
                          )}

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
                                className={`px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                                  page === currentPage
                                    ? 'bg-pink-600 text-white border-pink-600 font-semibold'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                {page}
                              </button>
                            ))}

                          {currentPage < totalPages - 2 && (
                            <>
                              {currentPage < totalPages - 3 && (
                                <span className="px-2 text-gray-500">...</span>
                              )}
                              <button type="button"
                                onClick={() => handlePageChange(totalPages)}
                                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                              >
                                {totalPages}
                              </button>
                            </>
                          )}
                        </div>

                        <button type="button"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    )}

                    {total > 0 && (
                      <div className="mt-4 text-center text-sm text-gray-600">
                        Showing {((currentPage - 1) * POSTS_PER_PAGE) + 1} to {Math.min(currentPage * POSTS_PER_PAGE, total)} of {total} posts
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Right Column (Sidebar) */}
          {showSidebar && (
            <div className="space-y-4">
              {/* Watch List Widget */}
              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Watch List
                  </h3>
                  <button type="button"
                    onClick={() => setWatchDialogOpen(true)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                  >
                    {watchedTechIds.length > 0 ? 'Edit' : '+ Add'}
                  </button>
                </div>
                {watchedTechIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {watchedTechIds.map((id) => {
                      const name = watchedTechNames[id] || technologies.find(t => t.id === id)?.name || `#${id}`;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {name}
                          <button type="button"
                            onClick={() => toggleWatchedTech(id)}
                            className="text-indigo-400 hover:text-indigo-700 cursor-pointer font-bold"
                            title={`Remove ${name}`}
                          >
                            &times;
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Add technologies to filter posts by your interests.
                  </p>
                )}
              </div>

              {/* Popular Technologies Widget */}
              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                  Popular Technologies
                </h3>
                <div className="flex flex-wrap gap-2">
                  {technologies.map((tech) => (
                    <Link
                      key={tech.id}
                      href={`/tech/${tech.slug}`}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 border border-transparent hover:border-indigo-100"
                      title={`${tech.name} (${tech.postsCount || 0} posts)`}
                    >
                      {tech.name}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Sponsored Widget */}
              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
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
          )}
        </div>
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
