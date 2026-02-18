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
from utils import USER_AGENT

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
LLMS_SH = os.path.join(REPO_ROOT, "llms.sh")
LLMS_MODEL = os.getenv("LLMS_MODEL", "moonshotai/kimi-k2.5")

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


def flatten_comments(tree: dict, depth: int = 0) -> list[dict]:
    """Flatten a comment tree into a list with depth info."""
    result = [{"by": tree["by"], "text": tree["text"], "depth": depth}]
    for child in tree.get("children", []):
        result.extend(flatten_comments(child, depth + 1))
    return result


def comments_to_text(comments: list[dict], max_comments: int = 200, max_chars: int = 30000) -> str:
    """Convert comment trees into a readable text block for the LLM, capped at max_comments."""
    lines = []
    count = 0
    for tree in comments:
        for c in flatten_comments(tree):
            if count >= max_comments:
                break
            indent = "  " * c["depth"]
            lines.append(f"{indent}[{c['by']}]: {c['text']}")
            lines.append("")
            count += 1
        if count >= max_comments:
            break
    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[...comments truncated...]"
    return text


SENTIMENT_PROMPT = """\
You are an expert at analyzing online discussion threads. You will receive \
the full comment thread from a Hacker News post. Analyze the overall sentiment \
and key themes, then produce a markdown summary.

Your output must be a JSON object with exactly this schema (no markdown fences, just raw JSON):

{
  "sentiment": "string — markdown-formatted sentiment analysis"
}

The "sentiment" field should contain well-structured markdown with these sections:

## Overall Sentiment
A 1-2 sentence summary of the overall tone (positive, negative, mixed, etc.) \
with an approximate breakdown (e.g. "~60% negative, ~30% neutral, ~10% positive").

## Key Themes
Bullet points covering the main topics and arguments being discussed.

## Notable Perspectives
2-4 standout comments or viewpoints that represent the range of opinions, \
paraphrased and attributed by username.

## Consensus & Disagreements
What do commenters generally agree on? Where are the main fault lines?

Rules:
- Be objective and balanced — represent all sides fairly
- Use specific examples and usernames from the comments
- Keep the total output under 500 words
- Return ONLY valid JSON"""


def parse_json_response(text: str) -> dict:
    """Parse JSON from an LLM response."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    match = re.search(r"(\{[\s\S]*\})", text)
    if match:
        return json.loads(match.group(1))
    raise ValueError("Could not parse JSON from LLM response")


def analyze_sentiment(post_title: str, comments_text: str, model: str) -> str:
    """Use LLM to generate sentiment analysis markdown."""
    user_message = f"Post Title: {post_title}\n\n--- COMMENTS ---\n{comments_text}"

    chat_request = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": SENTIMENT_PROMPT},
            {"role": "user", "content": user_message},
        ],
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

    parsed = parse_json_response(content)
    return parsed.get("sentiment", content)


def main():
    parser = argparse.ArgumentParser(description="Analyze comments from a Hacker News post.")
    parser.add_argument("url", help="HN comments URL or item ID (e.g. https://news.ycombinator.com/item?id=46978710)")
    parser.add_argument("--model", default=LLMS_MODEL, help=f"Model name (default: {LLMS_MODEL})")
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
    total_flat = sum(len(flatten_comments(c)) for c in all_comments)
    print(f"Total comments fetched: {total_flat}", file=sys.stderr)

    sentiment_count = min(total_flat, 200)
    comments_text = comments_to_text(all_comments, max_comments=200, max_chars=args.max_chars)
    print(f"Using first {sentiment_count} comments for sentiment analysis", file=sys.stderr)

    # LLM sentiment analysis
    print(f"Analyzing sentiment with {args.model} ...", file=sys.stderr)
    sentiment_md = analyze_sentiment(post_title, comments_text, args.model)

    # Add sentiment and top_comment to existing post info
    post_info["sentiment"] = sentiment_md
    post_info["top_comment"] = first_tree

    print(json.dumps({"sentiment": sentiment_md, "top_comment": first_tree}, indent=2))

    with open(post_path, "w", encoding="utf-8") as f:
        json.dump(post_info, f, indent=2)


if __name__ == "__main__":
    main()
