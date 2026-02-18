#!/usr/bin/env python

# Scan Hacker News for top technology news about programming languages,
# developer technologies and frameworks, then generate CreatePost entries
# for techstacks.io with matched technology IDs.
# Usage: python create_post.py [--model MODEL] [--dry-run] [--limit N]

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys

import aiohttp
from yarl import URL

from utils import COOKIES

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # llms repo root
LLMS_SH = os.path.join(REPO_ROOT, "llms.sh")
LLMS_MODEL = os.getenv("LLMS_MODEL", "MiniMax-M2.1")

TECHSTACKS_BASE = "https://techstacks.io"
SEARCH_TECH_URL = f"{TECHSTACKS_BASE}/api/QueryTechnology"
CREATE_POST_URL = f"{TECHSTACKS_BASE}/api/CreatePost"
HN_TOP_STORIES = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"

POST_TYPES = ["Announcement", "Post", "Showcase", "Request"]

CREATE_POSTS_SCHEMA = {
    "type": "object",
    "properties": {
        "posts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": POST_TYPES,
                        "description": "The type of post",
                    },
                    "title": {
                        "type": "string",
                        "description": "A concise, engaging title for the post",
                    },
                    "url": {
                        "type": "string",
                        "description": "The original URL of the article/news item",
                    },
                    "imageUrl": {
                        "type": "string",
                        "description": "URL to a relevant image, or empty string if none",
                    },
                    "content": {
                        "type": "string",
                        "description": "A short Markdown summary of the news item (2-4 sentences)",
                    },
                    "technologyNames": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Names of technologies mentioned (e.g. 'Flutter', 'Kubernetes', 'Python')",
                    },
                },
                "required": ["type", "title", "url", "imageUrl", "content", "technologyNames"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["posts"],
    "additionalProperties": False,
}


async def fetch_hn_top_stories(session: aiohttp.ClientSession, limit: int = 30) -> list[dict]:
    """Fetch top stories from Hacker News API."""
    async with session.get(HN_TOP_STORIES) as resp:
        story_ids = await resp.json()

    stories = []
    tasks = [fetch_hn_item(session, sid) for sid in story_ids[:limit]]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for item in results:
        if isinstance(item, dict) and item.get("type") == "story" and item.get("url"):
            stories.append(item)
    return stories


async def fetch_hn_item(session: aiohttp.ClientSession, item_id: int) -> dict:
    """Fetch a single HN item by ID."""
    async with session.get(HN_ITEM_URL.format(item_id)) as resp:
        return await resp.json()


async def search_technology(session: aiohttp.ClientSession, name: str) -> list:
    """Search techstacks.io for a technology by name."""
    params = {"nameContains": name}
    async with session.get(SEARCH_TECH_URL, params=params) as resp:
        data = await resp.json()
        return data.get("results", [])


async def resolve_technology_ids(session: aiohttp.ClientSession, names: list[str]) -> list[int]:
    """Look up technology IDs on techstacks.io for a list of technology names."""
    ids = []
    for name in names:
        results = await search_technology(session, name)
        # Find exact or close match
        for r in results:
            if r["name"].lower() == name.lower() or r.get("slug", "").lower() == name.lower():
                ids.append(r["id"])
                break
        else:
            # Use first result if available
            if results:
                ids.append(results[0]["id"])
    return ids


def extract_json(text: str) -> str:
    """Extract JSON from LLM output, stripping ERROR lines and markdown fences."""
    # Remove lines starting with ERROR:
    lines = [line for line in text.splitlines() if not line.startswith("ERROR:")]
    text = "\n".join(lines).strip()
    # Strip markdown code fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n", "", text)
        text = re.sub(r"\n```\s*$", "", text)
    return text.strip()


def parse_json_response(text):
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON object/array
    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if match:
        return json.loads(match.group(1))

    raise ValueError("Could not parse JSON from response")


def generate_posts_json(stories: list[dict], model: str) -> list[dict]:
    """Use llms.sh to filter HN stories and generate CreatePost entries."""
    stories_text = "\n".join(f"- Title: {s['title']}\n  URL: {s['url']}\n  Score: {s.get('score', 0)}" for s in stories)

    prompt = f"""Below is a list of top Hacker News stories. Select ONLY stories that are about:
- Programming languages (new releases, features, comparisons)
- Developer technologies, tools, and frameworks
- Software development practices and infrastructure
- Developer platforms and services
- Open source projects related to software development

EXCLUDE stories about:
- General news, politics, science, culture, business
- Hardware unless directly related to software development
- Non-technical topics

For each selected story, create a post entry with:
- type: Use "Announcement" for new releases/launches, "Post" for articles/blog posts, "Showcase" for Show HN posts, "Question" for Ask HN posts
- title: Use the original title, clean up if needed
- url: The original URL
- imageUrl: Empty string (we don't have images)
- content: Write a 2-4 sentence Markdown summary explaining what the story is about and why it's relevant to developers
- technologyNames: List of up to 3 specific popular technologies mentioned (use official names like "Flutter", "Kubernetes", "Python", "React", etc.)

Stories:
{stories_text}

Return a JSON object with a "posts" array. If no stories match the criteria, return an empty array."""

    chat_request = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "CreatePosts",
                "strict": True,
                "schema": CREATE_POSTS_SCHEMA,
            },
        },
    }

    chat_json_path = os.path.join(SCRIPT_DIR, "chat.post.json")
    with open(chat_json_path, "w") as f:
        json.dump(chat_request, f, indent=2)

    result = subprocess.run(
        [LLMS_SH, "--model", model, "--chat", chat_json_path, "--nohistory"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    content = result.stdout.strip()
    if result.returncode != 0:
        print(f"Error from llms.sh ({result.returncode}):\n{result.stderr}", file=sys.stderr)
        if content:
            print(f"stdout: {content}")
        sys.exit(1)

    if not content:
        print(f"Error: llms.sh returned empty response", file=sys.stderr)
        if result.stderr.strip():
            print(f"stderr: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)

    content = parse_json_response(content)

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON from llms.sh: {e}", file=sys.stderr)
        print(f"Raw output:\n{content}", file=sys.stderr)
        sys.exit(1)
    return data.get("posts", [])


async def create_post(session: aiohttp.ClientSession, post: dict) -> dict:
    """POST a single post to techstacks.io."""
    async with session.post(CREATE_POST_URL, json=post) as resp:
        body = await resp.text()
        if resp.status not in (200, 201):
            print(f"Error creating post ({resp.status}): {body}", file=sys.stderr)
            return {"error": body, "status": resp.status}
        return json.loads(body)


async def main():
    parser = argparse.ArgumentParser(description="Scan HN for dev technology news and create posts on techstacks.io")
    parser.add_argument("--model", default=LLMS_MODEL, help=f"LLM model to use (default: {LLMS_MODEL})")
    parser.add_argument("--dry-run", action="store_true", help="Generate posts but don't create them")
    parser.add_argument("--limit", type=int, default=30, help="Number of HN stories to fetch (default: 30)")
    args = parser.parse_args()

    # Create session with techstacks.io auth cookies
    cookie_jar = aiohttp.CookieJar()
    for name, value in COOKIES.items():
        cookie_jar.update_cookies({name: value}, URL(TECHSTACKS_BASE))

    async with aiohttp.ClientSession(cookie_jar=cookie_jar) as session:
        # Step 1: Fetch top HN stories
        print(f"Fetching top {args.limit} stories from Hacker News...")
        stories = await fetch_hn_top_stories(session, args.limit)
        print(f"Found {len(stories)} stories with URLs")

        if not stories:
            print("No stories found.")
            sys.exit(0)

        # Step 2: Use AI to filter and generate post entries
        print(f"Filtering for dev technology news using {args.model}...")
        posts = generate_posts_json(stories, args.model)

        if not posts:
            print("No relevant technology posts found.")
            sys.exit(0)

        print(f"\nFound {len(posts)} relevant technology posts:")

        # Step 3: Resolve technology IDs
        for post in posts:
            tech_names = post.pop("technologyNames", [])
            if tech_names:
                print(f"  Resolving technologies for '{post['title']}': {tech_names}")
                tech_ids = await resolve_technology_ids(session, tech_names)
                post["technologyIds"] = tech_ids
            else:
                post["technologyIds"] = []

        # Step 4: Display results
        print(f"\nGenerated CreatePost entries:")
        print(json.dumps(posts, indent=2))

        if args.dry_run:
            print("\n(dry-run mode — not creating posts)")
            sys.exit(0)

        # Step 5: Create posts on techstacks.io
        print(f"\nCreating {len(posts)} posts on techstacks.io...")
        for i, post in enumerate(posts, 1):
            print(f"  [{i}/{len(posts)}] Creating: {post['title']}")
            result = await create_post(session, post)
            if "error" in result:
                print(f"    FAILED: {result['error'][:120]}")
            else:
                print(f"    Created successfully (id={result.get('result', {}).get('id', 'N/A')})")

        print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
