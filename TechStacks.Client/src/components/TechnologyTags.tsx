'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import routes from '@/lib/utils/routes';
import { technologyCache } from '@/lib/utils/technologyCache';
import { Technology } from '@/shared/dtos';

interface TechnologyTagsProps {
  technologyIds?: number[];
  className?: string;
}

export function TechnologyTags({ technologyIds, className = '' }: TechnologyTagsProps) {
  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadTechnologies = async () => {
      if (!technologyIds || technologyIds.length === 0) {
        setTechnologies([]);
        return;
      }

      setLoading(true);
      try {
        const techs = await technologyCache.getTechnologies(technologyIds);
        setTechnologies(techs);
      } catch (err) {
        console.error('Failed to load technologies:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTechnologies();
  }, [technologyIds?.join(',')]);

  if (!technologyIds || technologyIds.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className={`flex gap-2 ${className}`}>
        <span className="text-xs text-gray-500">Loading technologies...</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 flex-wrap ${className}`}>
      {technologies.map((tech) => (
        <Link
          key={tech.id}
          href={routes.tech(tech.slug)}
          className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {tech.name}
        </Link>
      ))}
    </div>
  );
}

