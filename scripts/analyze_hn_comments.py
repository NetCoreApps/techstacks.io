#!/usr/bin/env python3
"""
HN Post Comment Analyzer
========================
Extracts the first comment tree from a Hacker News post and generates
a sentiment analysis of the entire comment thread.

Usage:
    python analyze_hn_comments.py <HN_COMMENTS_URL> [--model <MODEL>]

Example:
    python analyze_hn_comments.py https://news.ycombinator.com/item?id=46978710

Requirements:
    pip install requests
"""

import argparse
import html
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from prompts import SENTIMENT_SCHEMA, sentiment_prompt, sentiment_user_message
from utils import (
    SCRIPT_DIR,
    REPO_ROOT,
    LLMS_SH,
    LLMS_ANALYTICS_MODEL,
    USER_AGENT,
    count_comments,
    parse_json_response,
    sample_comments,
)

HN_API = "https://hacker-news.firebaseio.com/v0/item/{}.json"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = USER_AGENT


def parse_hn_id(url: str) -> int:
    """Extract the item ID from a Hacker News URL or raw ID."""
    url = url.strip().strip("'\"")
    if url.isdigit():
        return int(url)
    m = re.search(r"item\?id=(\d+)", url)
    if m:
        return int(m.group(1))
    raise ValueError(f"Cannot extract HN item ID from: {url}")


def fetch_item(item_id: int) -> dict | None:
    """Fetch a single HN item by ID."""
    resp = SESSION.get(HN_API.format(item_id), timeout=15)
    if resp.status_code != 200:
        return None
    data = resp.json()
    if not data or data.get("dead") or data.get("deleted"):
        return None
    return data


def clean_html(text: str) -> str:
    """Convert HN comment HTML to plain text."""
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<p>", "\n\n", text)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r'<a\s+href="([^"]*)"[^>]*>([^<]*)</a>', r"\2 (\1)", text)
    text = re.sub(r"<i>([^<]*)</i>", r"*\1*", text)
    text = re.sub(r"<pre><code>([\s\S]*?)</code></pre>", r"\n```\n\1\n```\n", text)
    text = re.sub(r"<code>([^<]*)</code>", r"`\1`", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def fetch_comment_tree(item_id: int, max_depth: int = 50) -> dict | None:
    """Recursively fetch a comment and all its children."""
    item = fetch_item(item_id)
    if not item or item.get("type") != "comment":
        return None

    comment = {
        "id": item["id"],
        "by": item.get("by", "[deleted]"),
        "text": clean_html(item.get("text", "")),
        "time": item.get("time", 0),
        "children": [],
    }

    kid_ids = item.get("kids", [])
    if kid_ids and max_depth > 0:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(fetch_comment_tree, kid, max_depth - 1): kid for kid in kid_ids}
            results = {}
            for f in as_completed(futures):
                kid_id = futures[f]
                try:
                    child = f.result()
                    if child:
                        results[kid_id] = child
                except Exception:
                    pass
            # preserve original order
            for kid in kid_ids:
                if kid in results:
                    comment["children"].append(results[kid])

    return comment


def collect_all_comments(post_data: dict) -> list[dict]:
    """Fetch all top-level comment trees from a post."""
    kid_ids = post_data.get("kids", [])
    if not kid_ids:
        return []

    comments = []
    total = len(kid_ids)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_comment_tree, kid): kid for kid in kid_ids}
        results = {}
        done_count = 0
        for f in as_completed(futures):
            kid_id = futures[f]
            done_count += 1
            try:
                tree = f.result()
                if tree:
                    results[kid_id] = tree
            except Exception:
                pass
            if done_count % 10 == 0 or done_count == total:
                print(f"   Fetched {done_count}/{total} top-level threads", file=sys.stderr)

    for kid in kid_ids:
        if kid in results:
            comments.append(results[kid])
    return comments


def analyze_sentiment(post_title: str, comments_text: str, model: str,
                      article_summary: str = "") -> dict:
    """Use LLM to generate the sentiment analysis, returning the parsed result."""
    user_message = sentiment_user_message(post_title, comments_text, article_summary)

    chat_request = {
        "model": model,
        # Low temperature: this is an extraction and attribution task, not a
        # creative one, and quotes must be verbatim.
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": sentiment_prompt("Hacker News")},
            {"role": "user", "content": user_message},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": SENTIMENT_SCHEMA,
        },
    }

    chat_json_path = os.path.join(SCRIPT_DIR, "chat.post.comments.json")
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
            print(f"stdout: {content}", file=sys.stderr)
        sys.exit(1)

    if not content:
        print("Error: llms.sh returned empty response", file=sys.stderr)
        sys.exit(1)

    return parse_json_response(content)


def main():
    parser = argparse.ArgumentParser(description="Analyze comments from a Hacker News post.")
    parser.add_argument("url", help="HN comments URL or item ID (e.g. https://news.ycombinator.com/item?id=46978710)")
    parser.add_argument("--model", default=LLMS_ANALYTICS_MODEL, help=f"Model name (default: {LLMS_ANALYTICS_MODEL})")
    parser.add_argument(
        "--max-chars", type=int, default=30000, help="Max chars of comments to send to LLM (default: 30000)"
    )
    args = parser.parse_args()

    item_id = parse_hn_id(args.url)

    # Check if post info already has sentiment analysis
    post_path = os.path.join(SCRIPT_DIR, "posts", f"{item_id}.json")
    if not os.path.exists(post_path):
        print(f"Error: Post file not found at {post_path}", file=sys.stderr)
        sys.exit(1)

    with open(post_path, "r", encoding="utf-8") as f:
        post_info = json.load(f)

    if post_info.get("sentiment") and post_info.get("top_comment"):
        print(f"Post {item_id} already has sentiment and top_comment", file=sys.stderr)
        sys.exit(0)

    print(f"Fetching HN post {item_id} ...", file=sys.stderr)

    post_data = fetch_item(item_id)
    if not post_data:
        print(f"Error: Could not fetch item {item_id}", file=sys.stderr)
        sys.exit(1)

    post_title = post_data.get("title", f"HN Post {item_id}")
    kid_ids = post_data.get("kids", [])
    print(f"Post: {post_title} ({len(kid_ids)} top-level comments)", file=sys.stderr)

    # Fetch first comment tree
    first_tree = None
    if kid_ids:
        print("Fetching first comment tree ...", file=sys.stderr)
        first_tree = fetch_comment_tree(kid_ids[0])

    # Fetch all comments for sentiment analysis
    print("Fetching all comment threads ...", file=sys.stderr)
    all_comments = collect_all_comments(post_data)
    total_flat = sum(count_comments(c) for c in all_comments)
    print(f"Total comments fetched: {total_flat}", file=sys.stderr)

    # Sampled breadth-first across threads: a depth-first cap would spend the whole
    # budget inside the first thread and misrepresent the discussion.
    comments_text, stats = sample_comments(all_comments, max_chars=args.max_chars)
    print(
        f"Sampled {stats['sampled_comments']} of {stats['total_comments']} comments "
        f"across {stats['total_threads']} threads",
        file=sys.stderr,
    )

    # The article summary is already in the post file — commenters are reacting to
    # it, so the model needs it to tell agreement from correction.
    article_summary = post_info.get("summary", "")

    # LLM sentiment analysis
    print(f"Analyzing sentiment with {args.model} ...", file=sys.stderr)
    analysis = analyze_sentiment(post_title, comments_text, args.model, article_summary)

    sentiment_md = analysis.get("sentiment", "")

    # Add sentiment and top_comment to existing post info
    post_info["sentiment"] = sentiment_md
    post_info["mood"] = analysis.get("mood", "")
    post_info["sentiment_confidence"] = analysis.get("confidence", "")
    post_info["alternatives"] = analysis.get("alternatives", [])
    post_info["discussion_stats"] = stats
    post_info["top_comment"] = first_tree

    print(json.dumps({**analysis, "top_comment": first_tree}, indent=2))

    with open(post_path, "w", encoding="utf-8") as f:
        json.dump(post_info, f, indent=2)


if __name__ == "__main__":
    main()
