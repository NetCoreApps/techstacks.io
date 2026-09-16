#!/usr/bin/env python3
"""Extract top posts from Hacker News and return as JSON.

Tries direct HTML scraping with realistic browser headers first, and falls back
to the official Algolia / Firebase APIs if rate-limited (HTTP 429) or blocked.
"""

import html as html_lib
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path

import requests
from utils import MIN_HN_POINTS, SCRIPT_DIR, USER_AGENT, create_slug

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "DNT": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
    }
)


class HNParser(HTMLParser):
    """Parse Hacker News HTML to extract post data."""

    def __init__(self):
        super().__init__()
        self.posts = []
        self._post = {}
        self._in_titleline = False
        self._in_title_link = False
        self._in_subline = False
        self._in_score = False
        self._in_comments = False
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")

        # New post row
        if tag == "tr" and "athing" in cls:
            self._post = {"id": 0, "title": "", "url": "", "points": 0, "comments": 0, "comments_url": ""}
            post_id = a.get("id", "")
            if post_id.isdigit():
                self._post["id"] = int(post_id)

        # Title container
        if tag == "span" and "titleline" in cls:
            self._in_titleline = True

        # Title link (first <a> without a class inside titleline)
        if self._in_titleline and tag == "a" and not a.get("class") and not self._in_title_link:
            href = a.get("href", "")
            if href and self._post.get("url") == "":
                self._in_title_link = True
                self._post["url"] = href

        # Subtext row (points + comments)
        if tag == "td" and "subtext" in cls:
            self._in_subline = True

        # Score span
        if self._in_subline and tag == "span" and "score" in cls:
            self._in_score = True
            self._buf = ""

        # Comments link
        if self._in_subline and tag == "a" and "item?id=" in a.get("href", ""):
            self._in_comments = True
            self._buf = ""
            href = a.get("href", "")
            if href:
                self._post["comments_url"] = f"https://news.ycombinator.com/{href}"

    def handle_data(self, data):
        if self._in_title_link:
            self._post["title"] += data
        if self._in_score:
            self._buf += data
        if self._in_comments:
            self._buf += data

    def handle_endtag(self, tag):
        if tag == "a" and self._in_title_link:
            self._in_title_link = False

        if tag == "span" and self._in_titleline and not self._in_score:
            self._in_titleline = False

        if tag == "span" and self._in_score:
            self._in_score = False
            m = re.search(r"(\d+)\s*point", self._buf)
            if m:
                self._post["points"] = int(m.group(1))

        if tag == "a" and self._in_comments:
            self._in_comments = False
            m = re.search(r"(\d+)\s*comment", self._buf)
            if m:
                self._post["comments"] = int(m.group(1))

        if tag == "td" and self._in_subline:
            self._in_subline = False
            if self._post and self._post.get("title"):
                url = self._post["url"]
                if url and not url.startswith("http"):
                    self._post["url"] = f"https://news.ycombinator.com/{url}"
                title = self._post["title"].strip()
                if title and url:
                    post_id = self._post["id"]
                    if not post_id:
                        m = re.search(r"item\?id=(\d+)", self._post["comments_url"])
                        if m:
                            post_id = int(m.group(1))
                    self.posts.append(
                        {
                            "id": post_id,
                            "title": title,
                            "slug": create_slug(title),
                            "url": self._post["url"],
                            "points": self._post["points"],
                            "comments": self._post["comments"],
                            "comments_url": self._post["comments_url"],
                        }
                    )
                self._post = {}


def fetch_hn_html(p=None) -> list[dict]:
    """Fetch and parse top posts from Hacker News web page."""
    url = f"https://news.ycombinator.com/?p={p}" if p else "https://news.ycombinator.com/"
    resp = SESSION.get(url, timeout=15)
    resp.raise_for_status()

    parser = HNParser()
    parser.feed(resp.text)
    return parser.posts


def fetch_hn_algolia(limit: int = 100) -> list[dict]:
    """Fallback 1: Fetch top front page stories via Algolia API."""
    url = f"https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage={limit}"
    resp = SESSION.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    posts = []
    for hit in data.get("hits", []):
        object_id = hit.get("objectID")
        if not object_id or not str(object_id).isdigit():
            continue
        post_id = int(object_id)
        title = html_lib.unescape(hit.get("title") or "").strip()
        if not title:
            continue
        url_link = hit.get("url") or f"https://news.ycombinator.com/item?id={post_id}"
        points = hit.get("points") or 0
        comments = hit.get("num_comments") or 0
        posts.append(
            {
                "id": post_id,
                "title": title,
                "slug": create_slug(title),
                "url": url_link,
                "points": points,
                "comments": comments,
                "comments_url": f"https://news.ycombinator.com/item?id={post_id}",
            }
        )
    return posts


def fetch_hn_firebase(limit: int = 60) -> list[dict]:
    """Fallback 2: Fetch top stories via official Firebase API."""
    top_ids_url = "https://hacker-news.firebaseio.com/v0/topstories.json"
    resp = SESSION.get(top_ids_url, timeout=15)
    resp.raise_for_status()
    item_ids = resp.json()[:limit]

    def fetch_single(item_id):
        try:
            r = SESSION.get(f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json", timeout=10)
            if r.status_code == 200:
                item = r.json()
                if item and item.get("type") == "story" and not item.get("deleted") and not item.get("dead"):
                    title = item.get("title", "").strip()
                    url_link = item.get("url") or f"https://news.ycombinator.com/item?id={item_id}"
                    return {
                        "id": item_id,
                        "title": title,
                        "slug": create_slug(title),
                        "url": url_link,
                        "points": item.get("score", 0),
                        "comments": item.get("descendants", len(item.get("kids", []))),
                        "comments_url": f"https://news.ycombinator.com/item?id={item_id}",
                    }
        except Exception:
            pass
        return None

    posts = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(fetch_single, i) for i in item_ids]
        for f in as_completed(futures):
            res = f.result()
            if res:
                posts.append(res)
    return posts


def fetch_all_hn(pages: int = 4) -> list[dict]:
    """Fetch top HN posts across pages with retries and API fallbacks."""
    all_posts = []
    html_succeeded = False

    # Attempt 1: Web HTML Scraping with delay
    try:
        for page in range(1, pages + 1):
            if page > 1:
                time.sleep(1.0)
            page_posts = fetch_hn_html(p=page)
            all_posts.extend(page_posts)
        if all_posts:
            html_succeeded = True
    except Exception as e:
        print(f"Notice: Web scraping HN returned error ({e}). Falling back to official APIs...", file=sys.stderr)

    # Attempt 2: Algolia API fallback
    if not html_succeeded or len(all_posts) == 0:
        try:
            print("Fetching from Algolia HN API...", file=sys.stderr)
            all_posts = fetch_hn_algolia(limit=pages * 30)
        except Exception as e:
            print(f"Notice: Algolia API failed ({e}). Falling back to Firebase API...", file=sys.stderr)
            try:
                all_posts = fetch_hn_firebase(limit=pages * 30)
            except Exception as e2:
                print(f"Error: Firebase API also failed: {e2}", file=sys.stderr)
                if not all_posts:
                    raise e2

    # Deduplicate and sort
    seen = set()
    unique = []
    for p in all_posts:
        if p["id"] not in seen:
            seen.add(p["id"])
            if p.get("points", 0) >= MIN_HN_POINTS:
                unique.append(p)

    unique.sort(key=lambda p: p["points"], reverse=True)
    return unique


if __name__ == "__main__":
    pages = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 4
    try:
        top_posts = fetch_all_hn(pages=pages)
    except Exception as e:
        print(f"Error fetching Hacker News: {e}", file=sys.stderr)
        sys.exit(1)

    top_json = json.dumps(top_posts, indent=2)
    print(top_json)
    output_path = os.path.join(SCRIPT_DIR, "hn_top.json")
    Path(output_path).write_text(top_json, encoding="utf-8")