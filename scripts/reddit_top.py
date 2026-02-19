#!/usr/bin/env python3
"""Extract top posts from Reddit and return as JSON.

Uses only Python standard library - no external dependencies required.
Fetches from r/programming, r/technology, and Reddit front page.
"""

import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

from utils import MIN_REDDIT_POINTS, TOP_REDDIT_LIMIT, USER_AGENT, create_slug

SUBREDDITS = [
    "r/react",
    "r/angular/",
    "r/vuejs/",
    "r/python",
    "r/dotnet",
    "r/csharp",
    "r/golang",
    "r/rust",
    "r/Zig",
    "r/LocalLLaMA",
    "r/ollama",
    "r/claude",
    "r/OpenAI",
    "/r/Qwen_AI",
    "r/machinelearning",
    "r/programming",
    "r/technology",
    "r/webdev",
]

# SUBREDDITS = ["r/dotnet", "r/csharp"]


def fetch_subreddit_posts(subreddit: str, limit: int = 50) -> list[dict]:
    """Fetch top posts from a subreddit using Reddit's JSON API."""
    url = f"https://www.reddit.com/{subreddit}/hot.json?limit={limit}"
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    posts = []
    for child in data.get("data", {}).get("children", []):
        post = child.get("data", {})
        if post.get("stickied"):
            continue

        post_url = post.get("url", "")
        permalink = post.get("permalink", "")
        comments_url = f"https://www.reddit.com{permalink}" if permalink else ""

        # Use external URL if it's a link post, otherwise use the Reddit comments URL
        if post.get("is_self") or not post_url:
            post_url = comments_url

        posts.append(
            {
                "id": post.get("id", ""),
                "title": post.get("title", "").strip(),
                "slug": create_slug(post.get("title", "")),
                "url": post_url,
                "subreddit": post.get("subreddit_name_prefixed", subreddit),
                "points": post.get("score", 0),
                "comments": post.get("num_comments", 0),
                "comments_url": comments_url,
            }
        )
    return posts


def fetch_reddit_top(limit: int = TOP_REDDIT_LIMIT) -> list[dict]:
    """Fetch and aggregate top posts across multiple subreddits."""
    all_posts = []
    for subreddit in SUBREDDITS:
        try:
            posts = fetch_subreddit_posts(subreddit)
            all_posts.extend(posts)
        except Exception as e:
            print(f"Warning: failed to fetch {subreddit}: {e}", file=sys.stderr)

    # Deduplicate by id
    seen = set()
    unique = []
    for p in all_posts:
        if p["id"] not in seen:
            seen.add(p["id"])
            unique.append(p)

    # Filter to posts with >MIN_REDDIT_POINTS points, sort by points descending, take top N
    unique = [p for p in unique if p["points"] > MIN_REDDIT_POINTS]
    unique.sort(key=lambda p: p["points"], reverse=True)
    return unique[:limit]


if __name__ == "__main__":
    try:
        posts = fetch_reddit_top()
    except Exception as e:
        print(f"Error fetching Reddit: {e}", file=sys.stderr)
        sys.exit(1)

    top_json = json.dumps(posts, indent=2)
    print(top_json)
    Path("reddit_top.json").write_text(top_json, encoding="utf-8")
