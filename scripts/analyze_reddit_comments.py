#!/usr/bin/env python3
"""
Reddit Post Comment Analyzer
=============================
Fetches comment threads from a Reddit post and generates
a sentiment analysis of the entire comment thread.

Usage:
    python analyze_reddit_comments.py <POST_ID> [--model <MODEL>]

Example:
    python analyze_reddit_comments.py 1r1zlqx
"""

import argparse
import json
import os
import re
import subprocess
import sys
from urllib.request import urlopen, Request

from utils import SCRIPT_DIR, REPO_ROOT, LLMS_SH, LLMS_ANALYTICS_MODEL, USER_AGENT, parse_json_response

def fetch_reddit_comments(comments_url: str) -> tuple[dict, list[dict]]:
    """Fetch post data and comment trees from a Reddit comments URL.

    Returns (post_data, comment_trees) where each comment tree is a dict with
    keys: by, text, children.
    """
    # Ensure URL ends with .json
    json_url = comments_url.rstrip("/") + ".json"
    req = Request(json_url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    # Reddit returns a 2-element array: [post_listing, comments_listing]
    post_listing = data[0]["data"]["children"][0]["data"]
    post_data = {
        "title": post_listing.get("title", ""),
        "selftext": post_listing.get("selftext", ""),
    }

    comment_listing = data[1]["data"]["children"]
    trees = []
    for child in comment_listing:
        tree = parse_comment(child)
        if tree:
            trees.append(tree)

    return post_data, trees


def parse_comment(thing: dict, max_depth: int = 50) -> dict | None:
    """Recursively parse a Reddit comment 'thing' into a normalized tree."""
    if thing.get("kind") != "t1":
        return None
    comment_data = thing.get("data", {})

    if comment_data.get("body") in ("[deleted]", "[removed]"):
        return None

    comment = {
        "id": comment_data.get("id", ""),
        "by": comment_data.get("author", "[deleted]"),
        "text": comment_data.get("body", ""),
        "time": int(comment_data.get("created_utc", 0)),
        "children": [],
    }

    if max_depth > 0:
        replies = comment_data.get("replies")
        if isinstance(replies, dict):
            for child in replies.get("data", {}).get("children", []):
                parsed = parse_comment(child, max_depth - 1)
                if parsed:
                    comment["children"].append(parsed)

    return comment


def flatten_comments(tree: dict, depth: int = 0) -> list[dict]:
    """Flatten a comment tree into a list with depth info."""
    result = [{"by": tree["by"], "text": tree["text"], "depth": depth}]
    for child in tree.get("children", []):
        result.extend(flatten_comments(child, depth + 1))
    return result


def comments_to_text(comments: list[dict], max_comments: int = 200, max_chars: int = 30000) -> str:
    """Convert comment trees into a readable text block for the LLM."""
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
the full comment thread from a Reddit post. Analyze the overall sentiment \
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

    chat_json_path = os.path.join(SCRIPT_DIR, "chat.reddit.comments.json")
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
    parser = argparse.ArgumentParser(description="Analyze comments from a Reddit post.")
    parser.add_argument("post_id", help="Reddit post ID (e.g. 1r1zlqx)")
    parser.add_argument("--model", default=LLMS_ANALYTICS_MODEL, help=f"Model name (default: {LLMS_ANALYTICS_MODEL})")
    parser.add_argument(
        "--max-chars", type=int, default=30000, help="Max chars of comments to send to LLM (default: 30000)"
    )
    args = parser.parse_args()

    post_id = args.post_id

    # Load existing post info
    post_path = os.path.join(SCRIPT_DIR, "posts", f"{post_id}.json")
    if not os.path.exists(post_path):
        print(f"Error: Post file not found at {post_path}", file=sys.stderr)
        sys.exit(1)

    with open(post_path, "r", encoding="utf-8") as f:
        post_info = json.load(f)

    if post_info.get("sentiment") and post_info.get("top_comment"):
        print(f"Post {post_id} already has sentiment and top_comment", file=sys.stderr)
        sys.exit(0)

    comments_url = post_info.get("comments_url", "")
    if not comments_url:
        print(f"Error: No comments_url in post {post_id}", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching Reddit comments for {post_id} ...", file=sys.stderr)
    print(f"  URL: {comments_url}", file=sys.stderr)

    post_data, all_comments = fetch_reddit_comments(comments_url)
    post_title = post_data.get("title") or post_info.get("title", f"Reddit Post {post_id}")

    total_flat = sum(len(flatten_comments(c)) for c in all_comments)
    print(f"Post: {post_title} ({len(all_comments)} top-level comments, {total_flat} total)", file=sys.stderr)

    # First comment tree for top_comment
    first_tree = all_comments[0] if all_comments else None

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
