#!/usr/bin/env python3
"""
Test script for fetch_reddit_comments() in analyze_reddit_comments.py

Fetches a real Reddit comments thread and reports success/failure,
including the HTTP status code on failure so you can tell whether
Reddit is blocking the request.

Usage:
    python test_fetch_reddit_comments.py [POST_URL_OR_ID]

Example:
    python test_fetch_reddit_comments.py 1r1zlqx
    python test_fetch_reddit_comments.py https://www.reddit.com/r/programming/comments/1r1zlqx/
"""

import sys

import requests

from analyze_reddit_comments import fetch_reddit_comments

DEFAULT_POST_ID = "1v1yjbl"
DEFAULT_SUBREDDIT = "r/technology"


def resolve_url(arg: str | None) -> str:
    if not arg:
        return f"https://www.reddit.com/{DEFAULT_SUBREDDIT}/comments/{DEFAULT_POST_ID}/"
    if arg.startswith("http"):
        return arg
    # Treat bare argument as a post ID
    return f"https://www.reddit.com/{DEFAULT_SUBREDDIT}/comments/{arg}/"


def main():
    url = resolve_url(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"Testing fetch_reddit_comments against:\n  {url}\n")

    try:
        post_data, trees = fetch_reddit_comments(url)
    except requests.HTTPError as e:
        print(f"FAILED: HTTP {e.response.status_code} {e.response.reason}")
        print(f"Response body (truncated):\n{e.response.text[:500]}")
        sys.exit(1)
    except Exception as e:
        print(f"FAILED: {type(e).__name__}: {e}")
        sys.exit(1)

    print("OK")
    print(f"  title: {post_data.get('title')!r}")
    print(f"  top-level comments: {len(trees)}")
    if trees:
        first = trees[0]
        print(f"  first comment by {first['by']!r}: {first['text'][:80]!r}")


if __name__ == "__main__":
    main()
