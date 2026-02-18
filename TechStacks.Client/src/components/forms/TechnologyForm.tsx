'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import {
  TextInput, TextareaInput, SelectInput, CheckboxInput, ConfirmDelete, PrimaryButton,
  useClient, ApiStateContext, ErrorSummary, CloseButton, SecondaryButton
} from '@servicestack/react';
import { ResponseStatus, toFormData } from '@servicestack/client';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useAppStore } from '@/lib/stores/useAppStore';
import * as gateway from '@/lib/api/gateway';
import routes from '@/lib/utils/routes';
import { CreateTechnology, UpdateTechnology } from '@/shared/dtos';

interface TechnologyFormProps {
  slug?: string;
  onDone?: () => void;
}

export function TechnologyForm({ slug, onDone }: TechnologyFormProps) {
  const router = useRouter();
  const isAuthenticated = useRequireAuth();
  const client = useClient();
  const { config } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ResponseStatus>();

  const [formData, setFormData] = useState({
    id: 0 as number | undefined,
    name: '',
    slug: '',
    vendorName: '',
    description: '',
    productUrl: '',
    vendorUrl: '',
    tier: '',
    isLocked: false,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');

  const isUpdate = !!slug;

  useEffect(() => {
    if (slug && isAuthenticated) {
      loadTechnology();
    }
  }, [slug, isAuthenticated]);

  const loadTechnology = async () => {
    try {
      setLoading(true);
      const tech = await gateway.getTechnology(slug!);
      setFormData({
        id: tech.id,
        name: tech.name,
        slug: tech.slug,
        vendorName: tech.vendorName || '',
        description: tech.description || '',
        productUrl: tech.productUrl || '',
        vendorUrl: tech.vendorUrl || '',
        tier: tech.tier || '',
        isLocked: tech.isLocked || false,
      });
      if (tech.logoUrl) {
        setLogoPreview(tech.logoUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load technology');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (name: string) => (value: any) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-generate slug from name for new technologies
    if (name === 'name' && !isUpdate) {
      const slugValue = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      setFormData(prev => ({ ...prev, slug: slugValue }));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let api;
      if (isUpdate) {
        const body = toFormData({ ...formData, logo: logoFile || undefined });
        api = await client.apiForm(new UpdateTechnology(), body);
      } else {
        const body = toFormData({ ...formData, logo: logoFile || undefined });
        api = await client.apiForm(new CreateTechnology(), body);
      }

      if (api.succeeded) {
        gateway.clearTechnologiesCache();
        if (onDone) {
          onDone();
        } else {
          router.push(routes.tech(formData.slug));
        }
      } else {
        setError(api.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this technology?')) return;

    setLoading(true);
    const api = await gateway.deleteTechnology(formData.id!);
    if (api.succeeded) {
      router.push(routes.tech());
    } else {
      setError(api.error);
    }
    setLoading(false);
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
      <div className="shadow sm:overflow-hidden sm:rounded-md">
        {slug && onDone && (<CloseButton onClose={onDone} />)}
        <div className="space-y-6 py-6 px-4 sm:p-6 bg-white dark:bg-black">
          <h2 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
            {isUpdate ? 'Edit Technology' : 'Add New Technology'}
          </h2>
          <fieldset>
            <ErrorSummary except={['name', 'slug', 'vendorName', 'description', 'productUrl', 'tier']} status={error} className="mb-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <TextInput
                id="name"
                label="Technology Name"
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
                required
                maxLength={100}
              />

              <SelectInput
                id="tier"
                label="Category"
                value={formData.tier}
                onChange={handleChange('tier')}
                required
                entries={config?.allTiers?.map((tier: any) => ({ key: tier.name, value: tier.title })) || []}
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo (minimum 150 x 100)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                {logoPreview && (
                  <div className="mt-4">
                    <img src={logoPreview} alt="Logo preview" className="max-w-full max-h-32 object-contain" />
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
              rows={6}
              maxLength={1000}
              help={`${formData.description.length}/1000`}
            />
          </div>

          <TextInput
            id="productUrl"
            label="Product URL"
            type="url"
            value={formData.productUrl}
            onChange={handleChange('productUrl')}
            required
            maxLength={200}
          />

          <TextInput
            id="vendorUrl"
            label="Vendor URL"
            type="url"
            className="my-4"
            value={formData.vendorUrl}
            onChange={handleChange('vendorUrl')}
            maxLength={200}
          />

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <CheckboxInput
              id="isLocked"
              label="Prevent others from editing this Technology?"
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
                  {loading ? (isUpdate ? 'Updating...' : 'Creating...') : (isUpdate ? 'Update Technology' : 'Create Technology')}
                </PrimaryButton>
              </div>
            </div>
          </div>

        </div>
    </form>
    </ApiStateContext.Provider>
  );
}
