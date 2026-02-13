'use client';

import { useEffect, useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as gateway from '@/lib/api/gateway';
import { useAppStore } from '@/lib/stores/useAppStore';
import { TechnologyTier } from '@/shared/dtos';

interface TechItem {
  id: number;
  name: string;
  slug: string;
  tier: TechnologyTier;
}

const TIER_LABELS: Record<string, string> = {
  [TechnologyTier.ProgrammingLanguage]: 'Programming Languages',
  [TechnologyTier.Client]: 'Client Libraries',
  [TechnologyTier.Http]: 'HTTP',
  [TechnologyTier.Server]: 'Server',
  [TechnologyTier.Data]: 'Data',
  [TechnologyTier.SoftwareInfrastructure]: 'Software Infrastructure',
  [TechnologyTier.OperatingSystem]: 'Operating Systems',
  [TechnologyTier.HardwareInfrastructure]: 'Hardware Infrastructure',
  [TechnologyTier.ThirdPartyServices]: 'Third Party Services',
};

const TIER_ORDER = Object.keys(TIER_LABELS);

interface WatchListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WatchListDialog({ open, onOpenChange }: WatchListDialogProps) {
  const [allTechs, setAllTechs] = useState<TechItem[]>([]);
  const [search, setSearch] = useState('');
  const [loadingTechs, setLoadingTechs] = useState(false);
  const watchedTechIds = useAppStore((s) => s.watchedTechIds);
  const toggleWatchedTech = useAppStore((s) => s.toggleWatchedTech);

  useEffect(() => {
    if (open && allTechs.length === 0) {
      setLoadingTechs(true);
      gateway.getTechnologyTiers().then((techs) => {
        setAllTechs((techs || []) as TechItem[]);
      }).catch(console.error).finally(() => setLoadingTechs(false));
    }
  }, [open, allTechs.length]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allTechs;
    const q = search.toLowerCase();
    return allTechs.filter(t => t.name.toLowerCase().includes(q));
  }, [allTechs, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, TechItem[]>();
    for (const tech of filtered) {
      const tier = tech.tier || 'Other';
      if (!map.has(tier)) map.set(tier, []);
      map.get(tier)!.push(tech);
    }
    // Sort by defined tier order
    const sorted = new Map<string, TechItem[]>();
    for (const tier of TIER_ORDER) {
      if (map.has(tier)) sorted.set(tier, map.get(tier)!);
    }
    // Any remaining tiers not in the predefined list
    for (const [tier, techs] of map) {
      if (!sorted.has(tier)) sorted.set(tier, techs);
    }
    return sorted;
  }, [filtered]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl z-50 w-full max-w-lg max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Edit Watch List
            </Dialog.Title>
            <Dialog.Close className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              &times;
            </Dialog.Close>
          </div>

          <div className="px-6 pb-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Filter technologies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                autoFocus
              />
              {search && (
                <button
                  type="button" title={"clear filter"}
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-5">
            {loadingTechs ? (
              <p className="text-sm text-gray-500 py-4 text-center">Loading technologies...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No technologies found</p>
            ) : (
              Array.from(grouped.entries()).map(([tier, techs]) => (
                <div key={tier} className="mb-4 last:mb-0">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {TIER_LABELS[tier] || tier}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {techs.map((tech) => {
                      const isWatched = watchedTechIds.includes(tech.id);
                      return (
                        <button
                          type="button"
                          key={tech.id}
                          onClick={() => toggleWatchedTech(tech.id, tech.name)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            isWatched
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {tech.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
