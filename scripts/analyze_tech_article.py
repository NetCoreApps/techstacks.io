#!/usr/bin/env python3
"""
Tech Article Analyzer
=====================
Extracts content from a technology article URL and uses an OpenAI-compatible
Chat Completion API to return structured analysis as JSON.

Usage:
    python analyze_tech_article.py <URL> [--base-url <BASE_URL>] [--api-key <KEY>] [--model <MODEL>]

Requirements:
    pip install requests beautifulsoup4 markdownify
"""

import argparse
import contextlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup, Comment
from markdownify import markdownify as md
from prompts import ARTICLE_PROMPT, ARTICLE_SCHEMA, EXTRACTION_FAILED
from utils import (
    SCRIPT_DIR,
    REPO_ROOT,
    LLMS_SH,
    LLMS_ANALYTICS_MODEL,
    USER_AGENT,
    controversy_ratio,
    extract_domain,
    parse_json_response,
    reading_time_mins,
)

# ── Content Extraction ───────────────────────────────────────────────────────

REMOVE_TAGS = [
    "script",
    "style",
    "nav",
    "footer",
    "header",
    "aside",
    "iframe",
    "noscript",
    "svg",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "advertisement",
    "figure",  # figures often just add noise
]

ARTICLE_SELECTORS = [
    "article",
    '[role="main"]',
    "main",
    ".post-content",
    ".article-content",
    ".entry-content",
    ".content",
    "#content",
    ".post-body",
    ".article-body",
    ".story-body",
]


def load_done_urls() -> set:
    done = set()
    for name in ("urls_completed.txt", "urls_failed.txt"):
        urls_path = Path(SCRIPT_DIR) / name
        if urls_path.exists():
            done.update(
                line.strip().rstrip("/") for line in urls_path.read_text().splitlines() if line.strip()
            )
    return done


# Pages that render as a wall rather than an article. Checked against the
# extracted body so a summary is never generated from a paywall notice.
PAYWALL_MARKERS = [
    r"subscribe to (?:continue|read)",
    r"subscribers? only",
    r"this (?:article|content) is for subscribers",
    r"create a free account to (?:continue|read)",
    r"sign in to (?:continue|read)",
    r"you have reached your (?:free )?article limit",
    r"enable javascript",
    r"please turn on javascript",
    r"verify you are (?:a )?human",
    r"checking your browser",
    r"access denied",
    r"are you a robot",
    r"accept (?:all )?cookies to continue",
]

MIN_CONTENT_CHARS = 600


WALL_PREFIX = "paywall/blocked"


def detect_extraction_failure(extracted: dict) -> str | None:
    """Return a reason if the extracted page has no usable article body, else None.

    Reasons starting with WALL_PREFIX mean the page is positively identified as a
    wall; anything else is only a suspicion (a terse README is short but valid).
    """
    text = extracted.get("text_plain", "")
    # Only look at the head of the page: the markers routinely appear in footers
    # and cookie banners of pages that did extract fine.
    head = text[:1500].lower()
    for marker in PAYWALL_MARKERS:
        if re.search(marker, head):
            return f"{WALL_PREFIX} marker matched: {marker!r}"
    if len(text) < MIN_CONTENT_CHARS:
        return f"content too short ({len(text)} chars)"
    return None


PUBLISHED_META = [
    ("meta", {"property": "article:published_time"}, "content"),
    ("meta", {"property": "og:published_time"}, "content"),
    ("meta", {"name": "publish_date"}, "content"),
    ("meta", {"name": "publication_date"}, "content"),
    ("meta", {"name": "date"}, "content"),
    ("meta", {"itemprop": "datePublished"}, "content"),
    ("meta", {"name": "DC.date.issued"}, "content"),
    ("time", {"itemprop": "datePublished"}, "datetime"),
]


def extract_published_date(soup: BeautifulSoup) -> str:
    """Best-effort publication date as an ISO-8601 string, or '' if not found.

    HN and Reddit routinely resurface years-old articles, so the date is often the
    single most useful thing a reader is missing.
    """
    for tag, attrs, key in PUBLISHED_META:
        el = soup.find(tag, attrs=attrs)
        if el and el.get(key):
            return el[key].strip()

    # JSON-LD is the common fallback on news sites
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        candidates = data if isinstance(data, list) else [data]
        for entry in candidates:
            if isinstance(entry, dict):
                date = entry.get("datePublished") or entry.get("dateCreated")
                if date and isinstance(date, str):
                    return date.strip()

    # Bare <time datetime="..."> as a last resort
    el = soup.find("time")
    if el and el.get("datetime"):
        return el["datetime"].strip()
    return ""


def fetch_page(url: str) -> str:
    """Fetch raw HTML from a URL."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    resp = requests.get(url, headers=headers, timeout=30, allow_redirects=True)
    resp.raise_for_status()
    return resp.text


def extract_content(html: str, url: str) -> dict:
    """
    Extract the meaningful content from an HTML page.
    Returns a dict with 'title', 'url', 'text_markdown', and 'text_plain'.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Page title
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"].strip()

    # Meta description (useful context)
    description = ""
    meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
    if meta_desc and meta_desc.get("content"):
        description = meta_desc["content"].strip()

    # Publication date, read before the noisy elements (incl. <time> in headers) are stripped
    published = extract_published_date(soup)

    # Remove noisy elements
    for tag_name in REMOVE_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    # Find the best content container
    content_el = None
    for selector in ARTICLE_SELECTORS:
        content_el = soup.select_one(selector)
        if content_el:
            break

    if not content_el:
        content_el = soup.body if soup.body else soup

    # Convert to markdown for a clean LLM-friendly representation
    text_md = md(str(content_el), heading_style="ATX", strip=["img", "a"])
    # Collapse excessive whitespace
    text_md = re.sub(r"\n{3,}", "\n\n", text_md).strip()

    # Plain text fallback (for token counting / truncation)
    text_plain = content_el.get_text(separator="\n", strip=True)
    text_plain = re.sub(r"\n{3,}", "\n\n", text_plain).strip()

    return {
        "title": title,
        "description": description,
        "published": published,
        "url": url,
        "text_markdown": text_md,
        "text_plain": text_plain,
    }


# ── LLM Integration ─────────────────────────────────────────────────────────

def build_user_message(extracted: dict, max_chars: int = 12000) -> str:
    """Build the user message from extracted content, truncated to fit context."""
    body = extracted["text_markdown"]
    if len(body) > max_chars:
        body = body[:max_chars] + "\n\n[...content truncated...]"

    parts = [
        f"URL: {extracted['url']}",
        f"Source: {extract_domain(extracted['url'])}",
        f"Page Title: {extracted['title']}",
    ]
    if extracted.get("description"):
        parts.append(f"Meta Description: {extracted['description']}")
    if extracted.get("published"):
        parts.append(f"Published: {extracted['published']}")
    parts.append(f"\n--- PAGE CONTENT ---\n{body}")
    return "\n".join(parts)


def call_llm(user_message: str, model: str) -> dict:
    """Send an OpenAI Chat Completion request and parse the JSON response."""

    chat_request = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": ARTICLE_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": ARTICLE_SCHEMA,
        },
    }

    chat_json_path = os.path.join(SCRIPT_DIR, "chat.post.analyze.json")
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

    print(content + "\n\n")
    post = parse_json_response(content)
    return post


def create_slug(title):
    slug = title.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug


# ── CLI ──────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Analyze a technology article URL using an LLM.")
    parser.add_argument("url", help="URL of the technology article to analyze")
    parser.add_argument(
        "--model",
        default=LLMS_ANALYTICS_MODEL,
        help=f"Model name (default: $LLMS_MODEL or ${LLMS_ANALYTICS_MODEL})",
    )
    parser.add_argument(
        "--max-chars",
        type=int,
        default=12000,
        help="Max characters of page content to send to the LLM (default: 12000)",
    )

    args = parser.parse_args()

    args.url = args.url.strip('"').strip("'")

    hn_top = None
    hn_top_path = "hn_top.json"
    # Allow passing a Hacker News post ID or URL to auto-resolve the article URL from the top 30 posts
    post_id = int(args.url) if args.url.isdigit() else None
    post_ref = None

    # if the argument looks like a short string (less than 10 chars) and isn't a URL, treat it as a Reddit post ID
    if post_id is None and len(args.url) < 10:
        post_id = args.url
        reddit_top_path = "reddit_top.json"
        if os.path.exists(reddit_top_path):
            reddit_top = json.loads(Path(reddit_top_path).read_text())
            for post in reddit_top:
                if post.get("id") == post_id:
                    post_ref = post
                    break

    if not post_ref and os.path.exists(hn_top_path):
        hn_top = json.loads(Path(hn_top_path).read_text())
        for post in hn_top:
            if post_id and post.get("id") == post_id:
                post_ref = post
                args.url = post.get("url")
                break
            if post.get("url") == args.url:
                post_ref = post
                break

    post_url = post_ref.get("url") if post_ref else args.url
    post_id = post_ref.get("id") if post_ref else None

    if post_url.startswith("https://twitter.com") or post_url.startswith("https://x.com"):
        post_url = "https://xcancel.com" + post_url[post_url.index("/", 8):]

    if not post_url.startswith("http"):
        print(f"Error: URL must start with http:// or https://", file=sys.stderr)
        sys.exit(1)

    done_urls = load_done_urls()
    if post_url.rstrip("/") in done_urls:
        print(f"URL {post_url} has already been processed")
        exit(0)

    if post_id:
        post_filename = f"{post_id}.json"
        post_path = Path("posts") / post_filename
        if post_path.exists():
            print(f"Post ID {post_id} has already been created")
            exit(0)

    # Step 1: Fetch the page
    print(f"⏳ Fetching {post_url} ...", file=sys.stderr)
    html = fetch_page(post_url)

    # Step 2: Extract content
    print("📄 Extracting content ...", file=sys.stderr)
    extracted = extract_content(html, post_url)
    print(
        f"   Title: {extracted['title']}\n   Content length: {len(extracted['text_markdown']):,} chars",
        file=sys.stderr,
    )

    # Step 2b: If the page is a paywall/wall rather than an article, retry via
    # archive.is before giving up — otherwise the LLM summarizes the wall itself.
    paywalled = False
    archive_url = ""
    failure = detect_extraction_failure(extracted)
    if failure:
        print(f"⚠️  No usable article body ({failure}), trying archive.is ...", file=sys.stderr)
        try:
            from archive_is_fetch import fetch_latest

            # fetch_latest prints progress to stdout, which would corrupt our JSON
            with contextlib.redirect_stdout(sys.stderr):
                archive_url, archive_html = fetch_latest(post_url)
            archived = extract_content(archive_html, post_url)
            archive_failure = detect_extraction_failure(archived)
            if archive_failure:
                # Fall through with the original: a short page may still be a real
                # article (a terse README), and the model is told to report
                # EXTRACTION_FAILED if it truly gets handed a wall.
                print(f"   Archive also looks unusable ({archive_failure}), letting the model decide",
                      file=sys.stderr)
                archive_url = ""
            else:
                extracted = archived
                # Only now is it certain the original was actually walled
                paywalled = failure.startswith(WALL_PREFIX)
                print(f"   Recovered from {archive_url} ({len(extracted['text_markdown']):,} chars)",
                      file=sys.stderr)
        except Exception as e:
            print(f"   Archive fetch failed ({e}), letting the model decide", file=sys.stderr)
            archive_url = ""

    # Step 3: Build the LLM request
    user_message = build_user_message(extracted, max_chars=args.max_chars)

    # Step 4: Call the LLM
    print(f"🤖 Sending to {args.model} ...", file=sys.stderr)
    result = call_llm(user_message, args.model)
    # result["slug"] = create_slug(result.get("title"))
    result["url"] = post_url

    # The model is told to emit this when handed a page with no article body
    if result.get("summary", "").strip() == EXTRACTION_FAILED:
        print(f"❌ Model reported no usable article body at {post_url}", file=sys.stderr)
        sys.exit(1)

    # Step 4b: Metadata the reader wants that doesn't need an LLM
    result["source"] = extract_domain(post_url)
    result["published"] = extracted.get("published", "")
    result["reading_time"] = reading_time_mins(extracted["text_plain"])
    result["paywalled"] = paywalled
    if archive_url:
        result["archive_url"] = archive_url

    # Step 5: Output
    post_json = json.dumps(result, indent=2)
    print(post_json)

    if post_ref:
        result.update(post_ref)
        # Comments per point: a 300-point post with 400 comments is an argument,
        # one with 20 comments is a consensus.
        result["controversy"] = controversy_ratio(result.get("comments", 0), result.get("points", 0))
        post_json = json.dumps(result, indent=2)
        post_path.write_text(post_json, encoding="utf-8")

    return result


if __name__ == "__main__":
    main()
