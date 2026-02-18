#!/usr/bin/env python3
"""Extract top 30 posts from Hacker News and return as JSON.

Uses only Python standard library - no external dependencies required.
"""

import json
from pathlib import Path
import re
import sys
from urllib.request import urlopen, Request
from html.parser import HTMLParser

from utils import MIN_HN_POINTS, create_slug

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
                        m = re.search(r'item\?id=(\d+)', self._post["comments_url"])
                        if m:
                            post_id = int(m.group(1))
                    self.posts.append({
                        "id": post_id,
                        "title": title,
                        "slug": create_slug(title),
                        "url": self._post["url"],
                        "points": self._post["points"],
                        "comments": self._post["comments"],
                        "comments_url": self._post["comments_url"],
                    })
                self._post = {}

def fetch_hn_top(p=None) -> list[dict]:
    """Fetch and parse the top 30 posts from Hacker News."""
    url = f"https://news.ycombinator.com/?p={p}" if p else "https://news.ycombinator.com/"
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; HNScraper/1.0)"},)
    with urlopen(req, timeout=10) as resp:
        html = resp.read().decode("utf-8")

    parser = HNParser()
    parser.feed(html)
    posts = sorted(parser.posts, key=lambda p: p["points"], reverse=True)
    return posts


if __name__ == "__main__":
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else None
    top_posts = []
    try:
        for page in range(1, pages + 1) if pages else [None]:
            posts = fetch_hn_top(p=page)
            top_posts.extend([p for p in posts if p.get("points", 0) >= MIN_HN_POINTS])
    except Exception as e:
        print(f"Error fetching Hacker News: {e}", file=sys.stderr)
        sys.exit(1)

    top_json = json.dumps(top_posts, indent=2)
    print(top_json)
    Path("hn_top.json").write_text(top_json, encoding="utf-8")