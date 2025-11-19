#!/usr/bin/env node
/**
 * Generate static JSON data files for build-time static site generation
 * This script fetches data from the API and saves it to ./src/data/*.json
 * so that GitHub Actions can build pages without calling APIs at build time.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// API base URL - can be overridden via environment variable
const API_URL = process.env.API_URL || 'https://react.techstacks.io';

console.log(`Fetching data from: ${API_URL}`);

/**
 * Fetch data from API endpoint
 */
async function fetchApi(path) {
  const url = `${API_URL}${path}`;
  console.log(`Fetching: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Save data to JSON file
 */
function saveJson(filename, data) {
  const dataDir = join(__dirname, '../src/data');
  mkdirSync(dataDir, { recursive: true });
  
  const filepath = join(dataDir, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`✓ Saved ${filename} (${JSON.stringify(data).length} bytes)`);
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Starting static data generation...\n');

    // Fetch posts (for generateStaticParams)
    console.log('Fetching posts...');
    const postsResponse = await fetchApi('/api/QueryPosts?take=1000&orderBy=-created&fields=id,slug');
    saveJson('posts.json', {
      results: postsResponse.results || [],
      total: postsResponse.total || 0,
      generated: new Date().toISOString()
    });

    // Fetch technologies (for generateStaticParams)
    console.log('\nFetching technologies...');
    const techResponse = await fetchApi('/api/GetAllTechnologies?include=total');
    saveJson('tech.json', {
      results: techResponse.results || [],
      total: techResponse.total || 0,
      generated: new Date().toISOString()
    });

    // Fetch tech stacks (for generateStaticParams)
    console.log('\nFetching tech stacks...');
    const stacksResponse = await fetchApi('/api/GetAllTechnologyStacks?include=total');
    saveJson('stacks.json', {
      results: stacksResponse.results || [],
      total: stacksResponse.total || 0,
      generated: new Date().toISOString()
    });

    console.log('\n✓ All static data generated successfully!');
    console.log(`\nGenerated files:`);
    console.log(`  - src/data/posts.json (${postsResponse.results?.length || 0} posts)`);
    console.log(`  - src/data/tech.json (${techResponse.results?.length || 0} technologies)`);
    console.log(`  - src/data/stacks.json (${stacksResponse.results?.length || 0} stacks)`);
    
  } catch (error) {
    console.error('\n✗ Error generating static data:', error.message);
    process.exit(1);
  }
}

main();

