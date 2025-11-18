'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import routes from '@/lib/utils/routes';
import * as gateway from '@/lib/api/gateway';
import { TextInput, SelectInput, CheckboxInput, SecondaryButton, PrimaryButton } from '@servicestack/react';
import { useAppStore } from '@/lib/stores/useAppStore';

const orderByOptions = [
  { text: 'Most Views', value: '-ViewCount' },
  { text: 'Most Favorited', value: '-FavCount' },
  { text: 'Recently Updated', value: '-LastModified' },
  { text: 'Name', value: 'Name' },
  { text: 'Vendor', value: 'VendorName' },
  { text: 'Modified', value: 'LastModified' },
  { text: 'Created', value: 'Created' },
];

function TechnologiesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config } = useAppStore();

  const [technologies, setTechnologies] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [querying, setQuerying] = useState(false);

  // Search state
  const [name, setName] = useState(() => searchParams.get('nameContains') || '');
  const [vendor, setVendor] = useState(() => searchParams.get('vendorNameContains') || '');
  const [tier, setTier] = useState(() => searchParams.get('tier') || '');

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

  const reset = () => {
    setName('');
    setVendor('');
    setTier('');
    setOrderByField('');
    setSortDesc(false);
  };

  const runQuery = useCallback(async () => {
    setQuerying(true);

    // Build query object
    const hasQuery = name || vendor || tier || orderByField;
    const query = hasQuery ? {} as any : null;

    if (query) {
      if (name) query.nameContains = name;
      if (vendor) query.vendorNameContains = vendor;
      if (tier) query.tier = tier;
      if (orderByField) {
        // Strip any existing '-' prefix to get the base field name
        const baseField = orderByField[0] === '-' ? orderByField.substring(1) : orderByField;
        // Add '-' prefix if sortDesc is checked
        query.orderBy = sortDesc ? '-' + baseField : baseField;
      }
    }

    // Update URL with query parameters
    const params = new URLSearchParams();
    if (name) params.set('nameContains', name);
    if (vendor) params.set('vendorNameContains', vendor);
    if (tier) params.set('tier', tier);
    if (orderByField) {
      const baseField = orderByField[0] === '-' ? orderByField.substring(1) : orderByField;
      params.set('orderBy', sortDesc ? '-' + baseField : baseField);
    }
    router.replace(`/tech${params.toString() ? '?' + params.toString() : ''}`);

    try {
      let response;
      if (query) {
        response = await gateway.queryTechnology(query);
      } else {
        response = await gateway.getAllTechnologies();
      }
      setTechnologies(response.results || []);
      setTotal(response.total || response.results?.length || 0);
    } catch (err) {
      console.error('Failed to load technologies:', err);
    } finally {
      setQuerying(false);
    }
  }, [name, vendor, tier, orderByField, sortDesc, router]);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Title and Add Button */}
        <div className="relative flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Find Technologies</h1>
          <PrimaryButton
            href="/tech/new"
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
          >
            + Add Technology
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

            <SelectInput
              id="tier"
              label="Technology Tier"
              value={tier}
              onChange={setTier}
              entries={[{ key: '', value: 'Select tier...' }, ...(config?.allTiers?.map((t: any) => ({ key: t.name, value: t.title })) || [])]}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div className="flex items-end">
              <SecondaryButton onClick={reset} className="w-full">
                Reset
              </SecondaryButton>
            </div>
          </div>
        </div>

        {total > 0 && (
          <div className="mb-4 text-center text-lg font-semibold text-gray-700">
            Found {total} results...
          </div>
        )}

        {technologies.length === 0 && !querying && (
          <div className="text-center text-gray-600 py-8">
            No results matched your query
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {technologies.map((tech: any) => (
            <Link
              key={tech.id}
              href={routes.tech(tech.slug)}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
            >
              <div className="flex items-start gap-4">
                {tech.logoUrl && (
                  <img
                    src={tech.logoUrl}
                    alt={tech.name}
                    className="w-16 h-16 object-contain"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 hover:text-primary-600">
                    {tech.name}
                  </h3>
                  {tech.vendorName && (
                    <p className="text-sm text-gray-600">by {tech.vendorName}</p>
                  )}
                  {tech.description && (
                    <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                      {tech.description}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TechnologiesPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading technologies...</div>
        </div>
      </div>
    }>
      <TechnologiesContent />
    </Suspense>
  );
}
