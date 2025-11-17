import * as gateway from '@/lib/api/gateway';
import { Technology } from '@/shared/dtos';

interface CacheEntry {
  data: Technology;
  timestamp: number;
}

interface PendingRequest {
  promise: Promise<Technology[]>;
  ids: Set<number>;
}

class TechnologyCache {
  private cache: Map<number, CacheEntry> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  /**
   * Get technologies by IDs, using cache when available
   */
  async getTechnologies(ids: number[]): Promise<Technology[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const now = Date.now();
    const result: Technology[] = [];
    const missingIds: number[] = [];

    // Check cache for each ID
    for (const id of ids) {
      const cached = this.cache.get(id);
      if (cached && (now - cached.timestamp) < this.TTL) {
        result.push(cached.data);
      } else {
        missingIds.push(id);
      }
    }

    // If all IDs are cached, return immediately
    if (missingIds.length === 0) {
      return result;
    }

    // Create a cache key for this set of missing IDs
    const cacheKey = missingIds.sort((a, b) => a - b).join(',');

    // Check if there's already a pending request for these IDs
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      // Wait for the existing request
      const fetchedTechs = await pending.promise;
      return [...result, ...fetchedTechs];
    }

    // Create a new request for missing IDs
    const promise = this.fetchAndCache(missingIds);
    this.pendingRequests.set(cacheKey, {
      promise,
      ids: new Set(missingIds)
    });

    try {
      const fetchedTechs = await promise;
      return [...result, ...fetchedTechs];
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Fetch technologies from API and cache them
   */
  private async fetchAndCache(ids: number[]): Promise<Technology[]> {
    try {
      const response = await gateway.queryTechnology({
        ids: ids.join(','),
        fields: 'id,name,slug'
      });

      const technologies = response.results || [];
      const now = Date.now();

      // Cache each technology
      for (const tech of technologies) {
        if (tech.id) {
          this.cache.set(tech.id, {
            data: tech,
            timestamp: now
          });
        }
      }

      return technologies;
    } catch (err) {
      console.error('Failed to fetch technologies:', err);
      return [];
    }
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Remove specific IDs from cache
   */
  invalidate(ids: number[]): void {
    for (const id of ids) {
      this.cache.delete(id);
    }
  }

  /**
   * Get cache statistics (for debugging)
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size
    };
  }
}

// Export a singleton instance
export const technologyCache = new TechnologyCache();

