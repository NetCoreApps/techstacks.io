'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { TechnologyStack } from '@/shared/dtos';
import { TextInput, SelectInput, CheckboxInput, SecondaryButton, PrimaryButton } from '@servicestack/react';

const orderByOptions = [
  { text: 'Most Views', value: '-ViewCount' },
  { text: 'Most Favorited', value: '-FavCount' },
  { text: 'Recently Updated', value: '-LastModified' },
  { text: 'Name', value: 'Name' },
  { text: 'Vendor', value: 'VendorName' },
  { text: 'Modified', value: 'LastModified' },
  { text: 'Created', value: 'Created' },
];

function prettifyUrl(url: string | undefined) {
  if (!url) return '';
  url = url.split('://').pop() || '';
  return url && url[url.length - 1] === '/' ? url.substring(0, url.length - 1) : url;
}

function TechStacksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stacks, setStacks] = useState<TechnologyStack[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [querying, setQuerying] = useState(false);

  // Search form state - initialize from URL query parameters
  const [name, setName] = useState(() => searchParams.get('nameContains') || '');
  const [vendor, setVendor] = useState(() => searchParams.get('vendorNameContains') || '');
  const [orderByField, setOrderByField] = useState(() => {
    const orderBy = searchParams.get('orderBy') || '';
    if (orderBy) {
      // Strip the '-' prefix if present to get the base field
      const baseOrderBy = orderBy[0] === '-' ? orderBy.substring(1) : orderBy;
      // Find the matching option by checking if the base field matches
      const orderItem = orderByOptions.find(x => {
        const baseValue = x.value[0] === '-' ? x.value.substring(1) : x.value;
        return baseValue === baseOrderBy;
      });
      return orderItem?.value || '';
    }
    return '';
  });
  const [sortDesc, setSortDesc] = useState(() => {
    const orderBy = searchParams.get('orderBy') || '';
    // If orderBy starts with '-', it's descending
    return orderBy[0] === '-';
  });

  // Run query
  const runQuery = useCallback(async () => {
    setQuerying(true);

    // Build query object
    const hasQuery = name || vendor || orderByField;
    const query = hasQuery ? {} as any : null;

    if (query) {
      if (name) query.nameContains = name;
      if (vendor) query.vendorNameContains = vendor;
      if (orderByField) {
        // Strip any existing '-' prefix to get the base field name
        const baseField = orderByField[0] === '-' ? orderByField.substring(1) : orderByField;
        // Add '-' prefix if sortDesc is checked
        query.orderBy = sortDesc ? '-' + baseField : baseField;
      }
    }

    // Update URL
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value) params.set(key, String(value));
      });
    }
    router.replace(`/stacks${params.toString() ? '?' + params.toString() : ''}`);

    try {
      if (query) {
        const response = await gateway.queryTechStacks(query);
        setStacks(response.results || []);
        setTotal(response.total || 0);
      } else {
        const response = await gateway.getAllTechStacks();
        setStacks(response.results || []);
        setTotal(response.total || 0);
      }
    } catch (err) {
      console.error('Failed to load tech stacks:', err);
    } finally {
      setQuerying(false);
      setLoading(false);
    }
  }, [name, vendor, orderByField, sortDesc, router]);

  // Load initial data
  useEffect(() => {
    runQuery();
  }, [runQuery]);

  // Note: runQuery already has dependencies, so it will re-run when they change

  const reset = () => {
    setName('');
    setVendor('');
    setOrderByField('');
    setSortDesc(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading tech stacks...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Title and Add Button */}
        <div className="relative flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Find Technology Stacks</h1>
          <PrimaryButton
            href="/stacks/new"
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
          >
            + Add Tech Stack
          </PrimaryButton>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <TextInput
              id="name"
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Search by name..."
            />

            <TextInput
              id="vendor"
              label="Vendor"
              value={vendor}
              onChange={setVendor}
              placeholder="Search by vendor..."
            />

            <div className="flex items-end">
              <SecondaryButton onClick={reset} className="w-full">
                Reset
              </SecondaryButton>
            </div>

            <SelectInput
              id="orderBy"
              label="Order By"
              value={orderByField}
              onChange={(value) => {
                setOrderByField(value);
                // Set sortDesc based on whether the field has a '-' prefix
                if (value) {
                  setSortDesc(value[0] === '-');
                }
              }}
              entries={[{ key: '', value: 'Select order...' }, ...orderByOptions.map(o => ({ key: o.value, value: o.text }))]}
            />

            <div className="mt-4 flex items-center">
              <CheckboxInput
                id="descending"
                label="Descending"
                value={sortDesc as any}
                onChange={setSortDesc}
                disabled={!orderByField}
              />
            </div>

          </div>
        </div>

          {total > 0 && (
            <div className="mb-4 text-center text-lg font-semibold text-gray-700">
              Found {total} results...
            </div>
          )}

        {/* Results Grid */}
        {!querying && stacks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stacks.map((stack: any) => (
              <Link
                key={stack.id}
                href={routes.stack(stack.slug)}
                prefetch={false}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
              >
                {stack.screenshotUrl && (
                  <img
                    src={stack.screenshotUrl}
                    alt={stack.name}
                    className="w-full h-48 object-cover"
                  />
                )}
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 hover:text-primary-600">
                    {stack.name}
                  </h3>
                  {stack.vendorName && (
                    <p className="text-sm text-gray-600 mt-1">by {stack.vendorName}</p>
                  )}
                  {stack.appUrl && (
                    <p className="text-xs text-gray-500 mt-1">{prettifyUrl(stack.appUrl)}</p>
                  )}
                  {stack.description && (
                    <p className="text-sm text-gray-700 mt-2 line-clamp-3">
                      {stack.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {!querying && stacks.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-blue-700">No results matched your query</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TechStacksPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading tech stacks...</div>
        </div>
      </div>
    }>
      <TechStacksContent />
    </Suspense>
  );
}
