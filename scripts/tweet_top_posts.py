#!/usr/bin/env python

# Tweet recently imported techstacks.io posts that scored well on their source,
# linking back to their techstacks.io post page.
#
# Usage:
#   python tweet_top_posts.py [--min-points 200] [--hours 24] [--limit 5] [--dry-run]
#
# --intent skips the API entirely: each post opens in x.com's compose window in
# your normal browser, pre-filled, and you press Post. Nothing is published
# without you, and it needs no credentials — just the browser you are signed in
# to. Slower per post, but there is no monthly cap and nothing to set up.
#
# Run it after publish_posts.py, on whatever schedule you import news on. Posts
# already tweeted are recorded in ids_tweeted.txt and never tweeted twice, so
# re-running it is safe.
#
# --hours bounds how far back a run will reach, which also keeps the first run
# from tweeting the whole back catalogue. Start with --dry-run to see the queue.
#
# Requires the same x.com credentials as post_to_x.py — see the notes at the
# top of that script.

import argparse
import os
import sys
import time
import webbrowser
from datetime import datetime, timedelta, timezone

import requests

from post_to_x import (
    build_tweet,
    create_tweet,
    fetch_hashtags,
    intent_url,
    post_page_url,
    x_session,
)
from utils import SCRIPT_DIR, TECHSTACKS_BASE, append_to_file, file_set

QUERY_POSTS_URL = f"{TECHSTACKS_BASE}/api/QueryPosts"
TWEETED_IDS_FILE = os.path.join(SCRIPT_DIR, "ids_tweeted.txt")
TWEETED_URLS_FILE = os.path.join(SCRIPT_DIR, "urls_tweeted.txt")

MIN_POINTS = 200
DEFAULT_HOURS = 24
DEFAULT_LIMIT = 5
DEFAULT_DELAY = 30  # seconds between posts, so a batch doesn't look automated


def fetch_recent_posts(min_points: int, take: int = 100) -> list[dict]:
    """Newest non-archived posts scoring at least min_points on their source."""
    params = {
        "pointsGreaterThanOrEqualTo": min_points,
        "archived": False,
        "orderBy": "-id",
        "take": take,
    }
    resp = requests.get(QUERY_POSTS_URL, params=params)
    if resp.status_code != 200:
        print(f"Error querying posts ({resp.status_code}): {resp.text[:200]}", file=sys.stderr)
        sys.exit(1)
    return resp.json().get("results", [])


def created_at(post: dict) -> datetime:
    """Post creation time as an aware UTC datetime (the API returns naive UTC)."""
    created = datetime.fromisoformat(post["created"])
    return created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created


def source_url(post: dict) -> str:
    """Normalised URL of the article a post links to, empty for posts without one."""
    return (post.get("url") or "").rstrip("/")


def select_posts(posts: list[dict], hours: int, limit: int) -> list[dict]:
    """Posts imported within the window that haven't been tweeted yet, oldest first."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    tweeted_ids = file_set(TWEETED_IDS_FILE)
    # The same article is sometimes imported more than once (HN and Reddit both
    # carried it, say). Tweeting each copy would just repeat the headline — and
    # x.com rejects identical text as a duplicate anyway — so one link wins.
    tweeted_urls = file_set(TWEETED_URLS_FILE)

    eligible = []
    for post in sorted(posts, key=lambda p: p["id"]):  # oldest first
        if created_at(post) < cutoff or str(post["id"]) in tweeted_ids:
            continue
        url = source_url(post)
        if url and url in tweeted_urls:
            continue
        if url:
            tweeted_urls.add(url)  # also dedupes within this batch
        eligible.append(post)
        if len(eligible) == limit:
            break
    return eligible


def main():
    parser = argparse.ArgumentParser(description="Tweet top techstacks.io posts")
    parser.add_argument("--min-points", type=int, default=MIN_POINTS,
                        help=f"Minimum source points (default: {MIN_POINTS})")
    parser.add_argument("--hours", type=int, default=DEFAULT_HOURS,
                        help=f"Only consider posts imported in the last N hours (default: {DEFAULT_HOURS})")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT,
                        help=f"Maximum posts to tweet in one run (default: {DEFAULT_LIMIT})")
    parser.add_argument("--delay", type=int, default=DEFAULT_DELAY,
                        help=f"Seconds to wait between posts (default: {DEFAULT_DELAY})")
    parser.add_argument("--intent", action="store_true",
                        help="Open each post in x.com's pre-filled compose window instead of "
                             "posting through the API (no credentials needed)")
    parser.add_argument("--no-tags", action="store_true",
                        help="Leave the posts' technology hashtags out of the tweets")
    parser.add_argument("--dry-run", action="store_true", help="Print the tweets but don't post them")
    args = parser.parse_args()

    posts = fetch_recent_posts(args.min_points)
    selected = select_posts(posts, args.hours, args.limit)

    print(f"Found {len(selected)} untweeted post(s) with >= {args.min_points} points "
          f"from the last {args.hours}h")
    if not selected:
        return

    for i, post in enumerate(selected, 1):
        print(f"\n[{i}/{len(selected)}] post {post['id']} ({post['points']} points)")
        hashtags = [] if args.no_tags else fetch_hashtags(post.get("technologyIds", []))

        if args.intent:
            compose = intent_url(post["title"], post_page_url(post), hashtags)
            print(f"  {compose}")
            if args.dry_run:
                continue
            webbrowser.open(compose)
            # Only you know whether you actually pressed Post, and recording a
            # post you skipped would quietly drop it from every future run.
            answer = input("  Posted it? [y/N] ").strip().lower()
            if answer not in ("y", "yes"):
                print("  Left unrecorded — it will come up again on the next run")
                continue
        else:
            tweet = build_tweet(post["title"], post_page_url(post), hashtags)
            print(f"  {tweet}")
            if args.dry_run:
                continue
            result = create_tweet(x_session(), tweet)
            tweet_id = result.get("data", {}).get("id")
            print(f"  Posted: https://x.com/i/web/status/{tweet_id}")

        append_to_file(TWEETED_IDS_FILE, str(post["id"]))
        if source_url(post):
            append_to_file(TWEETED_URLS_FILE, source_url(post))

        if not args.intent and i < len(selected) and args.delay:
            time.sleep(args.delay)

    if args.dry_run:
        print(f"\n(dry-run mode — nothing posted, ids_tweeted.txt not updated)")


if __name__ == "__main__":
    main()
