'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { ResponseStatus, toFormData } from '@servicestack/client';
import { 
  PrimaryButton, ErrorSummary, TextInput, MarkdownInput, SelectInput, FileInput, ConfirmDelete, 
  CloseButton, SecondaryButton, Combobox, useClient, ApiStateContext 
} from '@servicestack/react';
import { CreatePost, UpdatePost } from '@/shared/dtos';

interface PostFormProps {
  postId?: number;
  onDone?: () => void;
}

const NEWS_CATEGORY_ID = 55;

export function PostForm({ postId, onDone }: PostFormProps) {
  const router = useRouter();
  const isAuthenticated = useRequireAuth();
  const client = useClient()
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ResponseStatus>();
  const [loadingPost, setLoadingPost] = useState(!!postId);
  const [organizationId, setOrganizationId] = useState<number>();
  const [technologies, setTechnologies] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    type: 'Announcement',
    title: '',
    url: '',
    content: '',
    imageUrl: '',
    technologyIds: [] as string[],
  });

  // Load technologies on mount
  useEffect(() => {
    const loadTechnologies = async () => {
      try {
        const response = await gateway.queryTechnology({
          orderBy: 'name',
          fields: 'id,name'
        });

        // Convert to dictionary format: { id: name }
        // Use string keys for Combobox compatibility
        const techDict: Record<string, string> = {};
        response.results?.forEach((tech: any) => {
          techDict[tech.id.toString()] = tech.name;
        });
        setTechnologies(techDict);
      } catch (err) {
        console.error('Failed to load technologies:', err);
      }
    };

    loadTechnologies();
  }, []);

  // Load existing post if editing
  useEffect(() => {
    const loadPost = async () => {
      if (!postId) return;

      try {
        setLoadingPost(true);
        const response = await gateway.getPost(postId);
        const post = response.post;

        const techIds = Array.isArray(post.technologyIds) ? post.technologyIds : [];

        setFormData({
          type: post.type || 'Announcement',
          title: post.title || '',
          url: post.url || '',
          content: post.content || '',
          imageUrl: post.imageUrl || '',
          technologyIds: techIds.map(id => id.toString()),
        });
        setOrganizationId(post.organizationId);
      } catch (err) {
        console.error('Failed to load post:', err);
      } finally {
        setLoadingPost(false);
      }
    };

    if (isAuthenticated) {
      loadPost();
    }
  }, [postId, isAuthenticated]);

  // Load the techstacks organization on mount (for new posts)
  useEffect(() => {
    const loadOrganization = async () => {
      try {
        const org = await gateway.getOrganizationBySlug('techstacks');
        setOrganizationId(org.id);
      } catch (err) {
        console.error('Failed to load techstacks organization:', err);
      }
    };

    if (isAuthenticated && !postId) {
      loadOrganization();
    }
  }, [isAuthenticated, postId]);

  const updateField = (name: string, value: string | number[]) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!organizationId) {
      console.error('Organization not loaded');
      return;
    }

    setLoading(true);

    try {
      // Get the file from the form's FileInput
      const form = e.currentTarget;
      const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
      const iconFile = fileInput?.files?.[0];

      const postData = {
        ...formData,
        organizationId,
        categoryId: NEWS_CATEGORY_ID,
      };

      let api;
      if (postId) {
        // Update existing post
        //await gateway.updatePost({ ...postData, id: postId }, iconFile);
        const body = toFormData({ ...postData, id: postId, icon: iconFile });
        api = await client.apiForm(new UpdatePost(), body);
      } else {
        // Create new post
        //await gateway.createPost(postData, iconFile);
        const body = toFormData({ ...postData, icon: iconFile });
        api = await client.apiForm(new CreatePost(), body);
      }

      if (api.succeeded) {
        if (onDone) {
          onDone();
        } else {
          router.push('/');
        }
      } else {
        setError(api.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!postId) return;

    try {
      setLoading(true);
      await gateway.deletePost(postId);
      router.push('/');
    } catch (err: any) {
      console.error('Failed to delete post:', err);
      if (err.responseStatus) {
        setError(err.responseStatus);
      } else {
        setError({ message: err.message || 'Failed to delete post' });
      }
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          Please{' '}
          <Link href={routes.signUp()} className="underline hover:text-yellow-900 font-semibold">
            sign up
          </Link>{' '}
          to {postId ? 'edit' : 'create'} a post
        </p>
      </div>
    );
  }

  if (loadingPost) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">Loading post...</div>
      </div>
    );
  }

  return (
    <ApiStateContext.Provider value={client}>
    <form onSubmit={handleSubmit}>
      <div className="relative shadow sm:overflow-hidden sm:rounded-md">
        {postId && (<CloseButton onClose={onDone} />)}
        <div className="space-y-6 py-6 px-4 sm:p-6 bg-white dark:bg-black">
          <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
            {postId ? 'Edit Post' : 'Create New Post'}
          </h3>
          <fieldset>
            <ErrorSummary except={['type', 'title', 'url', 'content', 'technologyIds']} status={error} className="mb-4" />
            <div className="grid grid-cols-6 gap-6">
              <div className="col-span-3">
                <SelectInput
                  id="type"
                  value={formData.type}
                  onChange={(value) => updateField('type', value)}
                  values={['Announcement', 'Post', 'Showcase', 'Question', 'Request']}
                />
              </div>
              <div className="col-span-3">
                <FileInput id="icon" value={formData.imageUrl} 
                  imageClass="block max-w-36 max-h-32 object-cover" />
              </div>
              <div className="col-span-6">
                <TextInput
                  id="title"
                  value={formData.title}
                  onChange={(value) => updateField('title', value)}
                  required
                  placeholder="Enter post title"
                  maxLength={200}
                />
              </div>
              <div className="col-span-6">
                <TextInput
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(value) => updateField('url', value)}
                  placeholder="Optional URL"
                  maxLength={500}
                />
              </div>
              <div className="col-span-6">
                <MarkdownInput
                  id="content"
                  value={formData.content}
                  onChange={(value) => updateField('content', value)}
                  placeholder="Enter post content"
                  rows={8}
                />
              </div>
              <div
                className="col-span-6"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
              >
                <Combobox
                  id="technologyIds"
                  label="Technologies"
                  multiple
                  value={formData.technologyIds}
                  options={technologies}
                  onChange={(value) => updateField('technologyIds', value || [])}
                  placeholder="Select up to 5 technologies"
                  help="Select the technologies related to this post (max 5)"
                  status={error}
                />
              </div>
            </div>
          </fieldset>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 text-right sm:px-6">
          <div className="flex justify-between space-x-3">
            <div>
            {postId && (
                <ConfirmDelete onDelete={handleDelete} disabled={loading}>
                    Delete
                </ConfirmDelete>
            )}
            </div>
            <div className="flex gap-4">
              <SecondaryButton onClick={onDone}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={loading}>
                {loading ? (postId ? 'Updating...' : 'Creating...') : (postId ? 'Update Post' : 'Create Post')}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </form>
    </ApiStateContext.Provider>
  );
}
