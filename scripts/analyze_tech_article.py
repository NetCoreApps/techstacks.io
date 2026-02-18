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
from utils import USER_AGENT, parse_json_response

PYTHON = sys.executable
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # llms repo root
LLMS_SH = os.path.join(REPO_ROOT, "llms.sh")
# LLMS_MODEL = os.getenv("LLMS_MODEL","MiniMax-M2.1")
LLMS_MODEL = os.getenv("LLMS_MODEL", "moonshotai/kimi-k2.5")  # moonshotai/kimi-k2.5

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
    urls_path = Path(SCRIPT_DIR) / "completed" / "urls.txt"
    if urls_path.exists():
        return {line.strip().rstrip("/") for line in urls_path.read_text().splitlines() if line.strip()}
    return set()


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
        "url": url,
        "text_markdown": text_md,
        "text_plain": text_plain,
    }


# ── LLM Integration ─────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a technology content analyst. You will receive the extracted content \
of a web page about technology. Analyze it and return a JSON object with \
exactly this schema (no markdown fences, just raw JSON):

{
  "title": "string — the page/article title",
  "type": "string — one of: Announcement, Showcase, Question, Post",
  "technologies": [
    "string — top referenced technology #1",
    "string — top referenced technology #2",
    "string — top referenced technology #3"
  ],
  "relevance_score": <number 0-100 — how relevant this page is to developer \
technology, a programming language, framework, or library. 100 = entirely \
about a dev technology, 0 = completely unrelated>,
  "summary": "string — a concise summary in markdown format highlighting the \
most important insights, key takeaways, and notable technical details. Use \
bullet points for key insights. Keep it under 300 words."
}

Rules:
- technologies: Pick the top 3 most prominently referenced technologies, \
frameworks, languages, or libraries. Be specific (e.g. "React" not "JavaScript framework"). \
Use concise names: prefer well-known acronyms (e.g. "AI" not "Artificial Intelligence", \
"LLM" not "Large Language Model"). \
Use the broad technology name without version numbers (e.g. "Python" not "Python 3", \
"React" not "React 19", ".NET" not ".NET 9").
- relevance_score: Score strictly based on how much the content is about a \
developer-facing technology, programming language, framework, or library.
- summary: Focus on what matters most to a developer audience. Include \
concrete details like version numbers, benchmarks, or migration paths if present.
- type: Classify the post into exactly one of these categories:
  - "Announcement" — Official news, product updates, releases, and important notices from the team or organization.
  - "Showcase" — Demonstrations of projects, builds, integrations, or creative work to share with the community.
  - "Question" - Requests for help, advice, troubleshooting, or general inquiries seeking answers from others.
  - "Post" — General discussion, opinions, tutorials, articles, and content that doesn't fit the other categories.
- Return ONLY valid JSON. No explanation, no markdown code fences."""


def build_user_message(extracted: dict, max_chars: int = 12000) -> str:
    """Build the user message from extracted content, truncated to fit context."""
    body = extracted["text_markdown"]
    if len(body) > max_chars:
        body = body[:max_chars] + "\n\n[...content truncated...]"

    parts = [
        f"URL: {extracted['url']}",
        f"Page Title: {extracted['title']}",
    ]
    if extracted["description"]:
        parts.append(f"Meta Description: {extracted['description']}")
    parts.append(f"\n--- PAGE CONTENT ---\n{body}")
    return "\n".join(parts)


def call_llm(user_message: str, model: str) -> dict:
    """Send an OpenAI Chat Completion request and parse the JSON response."""

    chat_request = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "tech_article_analysis",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "The page or article title",
                        },
                        "type": {
                            "type": "string",
                            "enum": ["Announcement", "Showcase", "Post"],
                            "description": "The type of post: Announcement, Showcase, or Post",
                        },
                        "technologies": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 1,
                            "maxItems": 3,
                            "description": "Top 3 most prominently referenced technologies, frameworks, languages, or libraries. Use concise names with well-known acronyms (e.g. AI, ML, K8s, JS) and broad names without version numbers (e.g. Python not Python 3)",
                        },
                        "relevance_score": {
                            "type": "integer",
                            "description": "0-100 score for how relevant the page is to developer technology, a programming language, framework, or library",
                        },
                        "summary": {
                            "type": "string",
                            "description": "Concise summary in markdown format highlighting the most important insights and key takeaways",
                        },
                    },
                    "required": ["title", "type", "technologies", "relevance_score", "summary"],
                    "additionalProperties": False,
                },
            },
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
        default=LLMS_MODEL,
        help=f"Model name (default: $LLMS_MODEL or ${LLMS_MODEL})",
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

    # Step 3: Build the LLM request
    user_message = build_user_message(extracted, max_chars=args.max_chars)

    # Step 4: Call the LLM
    print(f"🤖 Sending to {args.model} ...", file=sys.stderr)
    result = call_llm(user_message, args.model)
    # result["slug"] = create_slug(result.get("title"))
    result["url"] = post_url

    # Step 5: Output
    post_json = json.dumps(result, indent=2)
    print(post_json)

    if post_ref:
        result.update(post_ref)
        post_json = json.dumps(result, indent=2)
        post_path.write_text(post_json, encoding="utf-8")

    return result


if __name__ == "__main__":
    main()
