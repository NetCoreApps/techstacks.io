# Static Data for Build-Time Generation

This directory contains static JSON data files used for Next.js static site generation (SSG) during the build process.

## Overview

Instead of calling APIs at build time in GitHub Actions, we pre-generate static JSON data files that are committed to the repository.

### Why Static Data?

- **Eliminates API dependencies** - GitHub Actions doesn't need network access to the API during builds
- **Faster builds** - No network latency from API calls
- **More reliable** - Builds won't fail if the API is temporarily unavailable
- **Reproducible** - Same data files produce consistent builds every time
- **Offline capable** - Can build without network access

### What Changed?

**Before:**
```typescript
// Page called API at build time
const buildClient = new JsonServiceClient('https://react.techstacks.io');
const response = await buildClient.get(new QueryPosts({...}));
```

**After:**
```typescript
// Page reads from static JSON file
import postsData from '@/data/posts.json';
const posts = postsData.results;
```

## Data Files

| File | Purpose | Size | Count |
|------|---------|------|-------|
| `posts.json` | Posts for `/posts/[id]/[slug]` pages | ~541 KB | 500 posts |
| `tech.json` | Technologies for `/tech/[slug]` pages | ~101 KB | 100 technologies |
| `stacks.json` | Tech stacks for `/stacks/[slug]` pages | ~188 KB | 100 stacks |

### Data Structure

Each JSON file follows this structure:

```json
{
  "results": [...],      // Array of items (posts, technologies, or stacks)
  "total": 4039,         // Total count in database
  "generated": "2025-11-19T04:07:33.370Z"  // ISO timestamp
}
```

## How to Use

### Building Locally

The build process automatically generates fresh data:

```bash
cd TechStacks.Client
npm run build  # Runs generate-data automatically via prebuild script
```

### Generating Data Manually

To regenerate the static data files:

```bash
npm run generate-data
```

This fetches fresh data from the API (default: `https://react.techstacks.io`) and updates the JSON files.

**With custom API URL:**
```bash
API_URL=https://localhost:5001 npm run generate-data
```

### Committing Updated Data

After generating new data, commit the files:

```bash
git add src/data/*.json
git commit -m "Update static data"
git push
```

## When to Regenerate

Regenerate the data files when:

- ✅ New posts, technologies, or stacks are added to production
- ✅ Existing items are updated (slugs, names, descriptions, etc.)
- ✅ Before deploying to production
- ✅ As part of your regular deployment workflow

## CI/CD Integration

### GitHub Actions Workflow

The data files are **committed to the repository**, so GitHub Actions builds use the committed data without calling APIs.

If you want to generate fresh data during CI/CD, uncomment this step in `.github/workflows/build-container.yml`:

```yaml
- name: Generate static data
  if: steps.check_client.outputs.client_exists == 'true'
  working-directory: ./TechStacks.Client
  env:
    API_URL: https://react.techstacks.io
  run: npm run generate-data
```

**Note:** Currently commented out to avoid API calls during builds. Data is updated manually and committed.

## Implementation Details

### Generation Script

**Location:** `../scripts/generate-static-data.mjs`

The script:
1. Fetches data from API endpoints
2. Saves to JSON files in this directory
3. Includes error handling and progress logging
4. Can be configured via `API_URL` environment variable

### Page Components

Three page components were updated to use static data:

- `src/app/posts/[id]/[slug]/page.tsx`
- `src/app/tech/[slug]/page.tsx`
- `src/app/stacks/[slug]/page.tsx`

Each imports the corresponding JSON file and uses it in `generateStaticParams()`.

### Package Scripts

```json
{
  "scripts": {
    "generate-data": "node scripts/generate-static-data.mjs",
    "prebuild": "npm run generate-data"
  }
}
```

The `prebuild` script ensures data is always fresh before building locally.

## Troubleshooting

### Build fails with "Cannot find module '@/data/posts.json'"

Make sure the JSON files exist:
```bash
ls -lh src/data/*.json
```

If missing, generate them:
```bash
npm run generate-data
```

### Data generation fails

Check the API URL is accessible:
```bash
curl https://react.techstacks.io/api/QueryPosts?take=1
```

Or use a different API:
```bash
API_URL=https://localhost:5001 npm run generate-data
```

### Stale data in builds

Regenerate and commit:
```bash
npm run generate-data
git add src/data/*.json
git commit -m "Update static data"
```

## Benefits Summary

| Benefit | Description |
|---------|-------------|
| **Speed** | No network calls during build = faster builds |
| **Reliability** | Builds work even if API is down |
| **Reproducibility** | Same data files = identical builds |
| **Transparency** | Data is versioned in git, easy to review changes |
| **Offline** | Can build without internet connection |

## Quick Reference

```bash
# Generate data
npm run generate-data

# Build (auto-generates data)
npm run build

# Custom API
API_URL=https://your-api.com npm run generate-data

# Commit changes
git add src/data/*.json
git commit -m "Update static data"
```