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

import requests

from prompts import SENTIMENT_SCHEMA, sentiment_prompt, sentiment_user_message
from utils import (
    SCRIPT_DIR,
    REPO_ROOT,
    LLMS_SH,
    LLMS_ANALYTICS_MODEL,
    USER_AGENT,
    count_comments,
    create_reddit_cookie_jar,
    parse_json_response,
    sample_comments,
)


def fetch_reddit_comments(comments_url: str) -> tuple[dict, list[dict]]:
    """Fetch post data and comment trees from a Reddit comments URL.

    Returns (post_data, comment_trees) where each comment tree is a dict with
    keys: by, text, score, children.
    """
    # Ask for the top-voted comments and a deep tree: the default page returns a
    # shallow slice and leaves most of the discussion behind "more" stubs.
    json_url = comments_url.rstrip("/") + ".json?limit=500&sort=top&depth=10"
    resp = requests.get(
        json_url, headers={"User-Agent": USER_AGENT}, cookies=create_reddit_cookie_jar(), timeout=30
    )
    resp.raise_for_status()
    data = resp.json()

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
        # Score is the strongest relevance signal Reddit gives us; it lets the
        # model weight consensus by what the crowd actually endorsed.
        "score": comment_data.get("score"),
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


def analyze_sentiment(post_title: str, comments_text: str, model: str,
                      article_summary: str = "", selftext: str = "") -> dict:
    """Use LLM to generate the sentiment analysis, returning the parsed result."""
    user_message = sentiment_user_message(post_title, comments_text, article_summary, selftext)

    chat_request = {
        "model": model,
        # Low temperature: this is an extraction and attribution task, not a
        # creative one, and quotes must be verbatim.
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": sentiment_prompt("Reddit")},
            {"role": "user", "content": user_message},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": SENTIMENT_SCHEMA,
        },
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

    return parse_json_response(content)


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

    total_flat = sum(count_comments(c) for c in all_comments)
    print(f"Post: {post_title} ({len(all_comments)} top-level comments, {total_flat} total)", file=sys.stderr)

    # First comment tree for top_comment
    first_tree = all_comments[0] if all_comments else None

    # Sampled breadth-first across threads: a depth-first cap would spend the whole
    # budget inside the first thread and misrepresent the discussion.
    comments_text, stats = sample_comments(all_comments, max_chars=args.max_chars)
    print(
        f"Sampled {stats['sampled_comments']} of {stats['total_comments']} comments "
        f"across {stats['total_threads']} threads",
        file=sys.stderr,
    )

    # On a self-post the body IS the article, so it must reach the model
    selftext = post_data.get("selftext", "")
    article_summary = post_info.get("summary", "")

    # LLM sentiment analysis
    print(f"Analyzing sentiment with {args.model} ...", file=sys.stderr)
    analysis = analyze_sentiment(post_title, comments_text, args.model, article_summary, selftext)

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
