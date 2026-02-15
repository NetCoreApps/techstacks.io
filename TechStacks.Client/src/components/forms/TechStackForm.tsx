'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TextInput, TextareaInput, MarkdownInput, CheckboxInput, ConfirmDelete, PrimaryButton,
  Combobox, CloseButton, useClient, ApiStateContext, ErrorSummary, SecondaryButton, FileInput
} from '@servicestack/react';
import { ResponseStatus, toFormData } from '@servicestack/client';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import * as gateway from '@/lib/api/gateway';
import routes from '@/lib/utils/routes';
import { CreateTechnologyStack, UpdateTechnologyStack } from '@/shared/dtos';

interface TechStackFormProps {
  slug?: string;
  onDone?: () => void;
}

export function TechStackForm({ slug, onDone }: TechStackFormProps) {
  const router = useRouter();
  const isAuthenticated = useRequireAuth();
  const client = useClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ResponseStatus>();
  const [technologies, setTechnologies] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    id: undefined as number | undefined,
    name: '',
    slug: '',
    vendorName: '',
    description: '',
    appUrl: '',
    screenshotUrl: '',
    details: '',
    isLocked: false,
    technologyIds: [] as string[],
  });
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');

  const isUpdate = !!slug;

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

  useEffect(() => {
    if (slug && isAuthenticated) {
      loadTechStack();
    }
  }, [slug, isAuthenticated]);

  const loadTechStack = async () => {
    try {
      setLoading(true);
      const response = await gateway.getTechnologyStack(slug!);
      const stack = response.result;

      const techIds = Array.isArray(stack.technologyChoices) ? stack.technologyChoices : [];

      setFormData({
        id: stack.id,
        name: stack.name,
        slug: stack.slug,
        vendorName: stack.vendorName || '',
        description: stack.description || '',
        appUrl: stack.appUrl || '',
        screenshotUrl: stack.screenshotUrl || '',
        details: stack.details || '',
        isLocked: stack.isLocked || false,
        technologyIds: techIds.map((t: any) => t.technologyId.toString()),
      });
      if (stack.screenshotUrl) {
        setScreenshotPreview(stack.screenshotUrl);
      }
    } catch (err: any) {
      setError(err.responseStatus || { message: err.message || 'Failed to load tech stack' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (name: string) => (value: any) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-generate slug from name for new stacks
    if (name === 'name' && !isUpdate) {
      const slugValue = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      setFormData(prev => ({ ...prev, slug: slugValue }));
    }
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshotFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convert technologyIds from strings to numbers for the API
      const submitData = {
        ...formData,
        technologyIds: formData.technologyIds.map(id => parseInt(id, 10))
      };

      let api;
      if (isUpdate) {
        const body = toFormData({ ...submitData, screenshot: screenshotFile || undefined });
        api = await client.apiForm(new UpdateTechnologyStack(), body);
      } else {
        const body = toFormData({ ...submitData, screenshot: screenshotFile || undefined });
        api = await client.apiForm(new CreateTechnologyStack(), body);
      }

      if (api.succeeded) {
        gateway.clearTechStacksCache();
        if (onDone) {
          onDone();
        } else {
          router.push(routes.stack(formData.slug));
        }
      } else {
        setError(api.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this tech stack?')) return;

    try {
      setLoading(true);
      await gateway.deleteTechStack(formData.id!);
      router.push(routes.stack());
    } catch (err: any) {
      if (err.responseStatus) {
        setError(err.responseStatus);
      } else {
        setError({ message: err.message || 'Failed to delete tech stack' });
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
          to continue
        </p>
      </div>
    );
  }

  return (
    <ApiStateContext.Provider value={client}>
    <form onSubmit={handleSubmit}>
      <div className="relative shadow sm:overflow-hidden sm:rounded-md">
        {slug && onDone && (<CloseButton onClose={onDone} />)}
        <div className="space-y-6 py-6 px-4 sm:p-6 bg-white dark:bg-black">
          <h2 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
            {isUpdate ? 'Edit Tech Stack' : 'Add New Tech Stack'}
          </h2>
          <fieldset>
            <ErrorSummary except={['name', 'slug', 'vendorName', 'description', 'appUrl', 'technologyIds']} status={error} className="mb-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <TextInput
                id="name"
                label="Stack Name"
                value={formData.name}
                onChange={handleChange('name')}
                required
                maxLength={100}
              />

              <TextInput
                id="slug"
                label="Slug"
                value={formData.slug}
                onChange={handleChange('slug')}
                required
                disabled={isUpdate}
                maxLength={100}
              />

              <TextInput
                id="vendorName"
                label="Vendor Name"
                value={formData.vendorName}
                onChange={handleChange('vendorName')}
                maxLength={100}
              />

              <TextInput
                id="appUrl"
                label="App URL"
                type="url"
                value={formData.appUrl}
                onChange={handleChange('appUrl')}
                maxLength={200}
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Screenshot (minimum 858 x 689)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                {screenshotPreview && (
                  <div className="mt-4">
                    <img src={screenshotPreview} alt="Screenshot preview" className="max-w-full max-h-48 object-contain" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="my-4">
            <TextareaInput
              id="description"
              label="Description"
              value={formData.description}
              onChange={handleChange('description')}
              required
              rows={4}
              maxLength={500}
              help={`${formData.description.length}/500`}
            />
          </div>

          <MarkdownInput
            id="details"
            label="Details"
            value={formData.details}
            onChange={handleChange('details')}
          />

          <div
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
              onChange={(value) => handleChange('technologyIds')(value || [])}
              placeholder="Select technologies"
              help="Select the technologies used in this stack"
              status={error}
            />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <CheckboxInput
              id="isLocked"
              label="Prevent others from editing this Tech Stack?"
              value={formData.isLocked as any}
              onChange={handleChange('isLocked')}
            />
          </div>
          </fieldset>
        </div>

          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 text-right sm:px-6">
            <div className="flex justify-between space-x-3">
              <div>
              {isUpdate && (
                  <ConfirmDelete onDelete={handleDelete} disabled={loading}>
                    Delete
                  </ConfirmDelete>
              )}
              </div>
              <div className="flex gap-4">
                {onDone && <SecondaryButton onClick={onDone}>Cancel</SecondaryButton>}
                <PrimaryButton type="submit" disabled={loading}>
                  {loading ? (isUpdate ? 'Updating...' : 'Creating...') : (isUpdate ? 'Update Tech Stack' : 'Create Tech Stack')}
                </PrimaryButton>
              </div>
            </div>
          </div>

        </div>
    </form>
    </ApiStateContext.Provider>
  );
}

