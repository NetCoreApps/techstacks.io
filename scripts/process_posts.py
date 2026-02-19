#!/usr/bin/env python3
"""
Process HN Top 30 Posts
=======================
Iterates through all posts in hn_top.json with more than 100 points
and runs analyze_tech_article.py and analyze_hn_comments.py on each.

Usage:
    python process_posts.py [--min-points 100] [--model MODEL]
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from utils import MIN_HN_POINTS, MIN_REDDIT_POINTS, SCRIPT_DIR, PYTHON

def load_done_urls() -> set:
    urls = set()
    for d in ["completed", "failed"]:
        urls_path = Path(SCRIPT_DIR) / d / "urls.txt"
        if urls_path.exists():
            urls.update(line.strip().rstrip('/') for line in urls_path.read_text().splitlines() if line.strip())
    return urls


def load_done() -> set:
    done = set()
    for d in ["posts", "completed", "failed"]:
        dir_path = Path(SCRIPT_DIR) / d
        if dir_path.is_dir():
            for f in dir_path.glob("*.json"):
                done.add(f.stem)
    return done


def mark_failed(post: dict, error_msg: str):
    failed_dir = Path(SCRIPT_DIR) / "failed"
    failed_dir.mkdir(exist_ok=True)
    failed_path = failed_dir / f"{post['id']}.json"
    failed_data = {**post, "error": error_msg}
    failed_path.write_text(json.dumps(failed_data, indent=2))
    # Remove from posts if it exists there
    posts_path = Path(SCRIPT_DIR) / "posts" / f"{post['id']}.json"
    if posts_path.exists():
        posts_path.unlink()


def run_comments_analyzer(post: dict, comments_url: str, model: str | None):
    is_reddit = "reddit.com" in comments_url
    analyzer = "analyze_reddit_comments.py" if is_reddit else "analyze_hn_comments.py"
    comments_cmd = [PYTHON, os.path.join(SCRIPT_DIR, analyzer), str(post["id"])]
    if model:
        comments_cmd.extend(["--model", model])
    result = subprocess.run(comments_cmd, cwd=SCRIPT_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        error_msg = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else f"exit code {result.returncode}"
        print(f"Warning: {analyzer} failed for post {post['id']}: {error_msg}", file=sys.stderr)
    if result.stdout:
        print(result.stdout, end="")


def main():
    parser = argparse.ArgumentParser(description="Process HN top posts through article and comment analyzers.")
    parser.add_argument("--min-points", type=int, default=MIN_HN_POINTS, help=f"Minimum points threshold (default: {MIN_HN_POINTS})")
    parser.add_argument("--model", default=None, help="Model to pass to analyzers (default: use analyzer defaults)")
    args = parser.parse_args()

    hntop_path = Path(SCRIPT_DIR) / "hn_top.json"
    if not hntop_path.exists():
        print("Error: hn_top.json not found. Run hn_top.py first.", file=sys.stderr)
        sys.exit(1)

    hn_posts = json.loads(hntop_path.read_text())
    eligible = [p for p in hn_posts if p.get("points", 0) > args.min_points]
    print(f"Found {len(eligible)} Hacker News posts with > {args.min_points} points (out of {len(hn_posts)} total)")

    reddit_posts_path = Path(SCRIPT_DIR) / "reddit_top.json"
    if reddit_posts_path.exists():
        reddit_posts = json.loads(reddit_posts_path.read_text())
        reddit_eligible = [p for p in reddit_posts if p.get("points", 0) > MIN_REDDIT_POINTS]
        print(f"Found {len(reddit_eligible)} Reddit posts with > {MIN_REDDIT_POINTS} points (out of {len(reddit_posts)} total)")
        eligible.extend(reddit_eligible)
    else:
        print("Warning: reddit_top.json not found. Run reddit_top.py to include Reddit posts.", file=sys.stderr)

    IMAGE_EXTENSIONS = ('.png', '.jpg', '.svg', '.webp')

    def is_image_url(url: str) -> bool:
        return url.startswith("https://i.redd.it") or "imgur.com" in url or url.lower().endswith(IMAGE_EXTENSIONS)

    def is_video_url(url: str) -> bool:
        return url.startswith("https://v.redd.it")
    
    def is_blacklisted_url(url: str) -> bool:
        BLACKLISTED_DOMAINS = [
            "reddit.com",
            "ycombinator.com",
        ]
        return any(domain in url for domain in BLACKLISTED_DOMAINS)
    
    def is_content_url(url: str) -> bool:
        return url.startswith("http") and not is_image_url(url) and not is_video_url(url) and not is_blacklisted_url(url)

    done = load_done()
    done_urls = load_done_urls()
    to_process = [p for p in eligible if str(p["id"]) not in done and p.get("url", "").rstrip('/') not in done_urls and is_content_url(p.get("url", ""))]
    print(f"Already processed: {len(eligible) - len(to_process)}, remaining: {len(to_process)}")

    # Find posts that have article analysis but are missing comments analysis
    needs_comments = []
    posts_dir = Path(SCRIPT_DIR) / "posts"
    for p in eligible:
        pid = str(p["id"])
        post_path = posts_dir / f"{pid}.json"
        if post_path.exists() and p.get("comments_url"):
            post_data = json.loads(post_path.read_text())
            if "sentiment" not in post_data:
                needs_comments.append(p)
    if needs_comments:
        print(f"Posts needing comments analysis: {len(needs_comments)}")

    for i, post in enumerate(to_process, 1):
        post_id = post["id"]
        title = post.get("title", "")
        url = post.get("url", "")
        comments_url = post.get("comments_url", "")

        print(f"\n{'='*60}")
        print(f"[{i}/{len(to_process)}] {title}")
        print(f"  ID: {post_id} | Points: {post.get('points', 0)} | Comments: {post.get('comments', 0)}")
        print(f"{'='*60}")

        # Step 1: Analyze the tech article
        print(f"\n--- Analyzing article: {url} ---")
        article_cmd = [PYTHON, os.path.join(SCRIPT_DIR, "analyze_tech_article.py"), str(post_id)]
        if args.model:
            article_cmd.extend(["--model", args.model])

        result = subprocess.run(article_cmd, cwd=SCRIPT_DIR, capture_output=True, text=True)
        if result.returncode != 0:
            error_msg = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else f"exit code {result.returncode}"
            print(f"Warning: analyze_tech_article.py failed for post {post_id}: {error_msg}", file=sys.stderr)
            mark_failed(post, error_msg)
            continue
        if result.stdout:
            print(result.stdout, end="")

        # Step 2: Analyze the post comments
        if comments_url:
            print(f"\n--- Analyzing comments: {comments_url} ---")
            run_comments_analyzer(post, comments_url, args.model)

        print(f"\nDone with post {post_id}")

    # Process posts that have article analysis but are missing comments
    for i, post in enumerate(needs_comments, 1):
        post_id = post["id"]
        comments_url = post.get("comments_url", "")
        print(f"\n{'='*60}")
        print(f"[{i}/{len(needs_comments)}] (comments only) {post.get('title', '')}")
        print(f"  ID: {post_id}")
        print(f"{'='*60}")
        print(f"\n--- Analyzing comments: {comments_url} ---")
        run_comments_analyzer(post, comments_url, args.model)
        print(f"\nDone with comments for post {post_id}")

    print(f"\n{'='*60}")
    total = len(to_process) + len(needs_comments)
    print(f"Processing complete. {total} posts processed.")

    # Update completed and failed indexes
    update_script = Path(SCRIPT_DIR) / "update.sh"
    if update_script.exists():
        print(f"\nRunning ./update.sh...")
        subprocess.run(["./update.sh"], cwd=Path(SCRIPT_DIR))

if __name__ == "__main__":
    main()
