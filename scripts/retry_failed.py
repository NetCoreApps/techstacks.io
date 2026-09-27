#!/usr/bin/env python3
"""
Retry Failed Posts
==================
Inspect, clear, and re-run failed news posts from done/failed/.

Usage:
    ./retry_failed.py                     # List recent failed posts with errors
    ./retry_failed.py --list [--last 20]  # List recent failed posts
    ./retry_failed.py <post_id> ...       # Re-run specific failed post(s)
    ./retry_failed.py --last 5            # Re-run the last 5 failed posts
    ./retry_failed.py --all               # Re-run all failed posts
    ./retry_failed.py --clear <post_id>   # Remove from failed tracking without re-running
"""

import os
import sys

# Auto re-exec in .venv if available and not already inside it
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_PYTHON = os.path.join(SCRIPT_DIR, ".venv", "bin", "python")
if os.path.exists(VENV_PYTHON) and sys.executable != VENV_PYTHON:
    os.execv(VENV_PYTHON, [VENV_PYTHON] + sys.argv)

import argparse
import glob
import json
import re
import subprocess
from pathlib import Path

from utils import (
    COMPLETED_DIR,
    FAILED_DIR,
    POSTS_DIR,
    PYTHON,
    SCRIPT_DIR,
    SKIPPED_DIR,
    append_to_file,
    remove_symbols_from_file,
)


def load_failed_posts() -> list[dict]:
    """Load all failed posts sorted by file modification time (newest first)."""
    if not os.path.exists(FAILED_DIR):
        return []

    files = glob.glob(os.path.join(FAILED_DIR, "*.json"))
    files.sort(key=os.path.getmtime, reverse=True)

    posts = []
    for f in files:
        try:
            data = json.loads(Path(f).read_text(encoding="utf-8"))
            data["_filepath"] = f
            if "id" not in data:
                data["id"] = Path(f).stem
            posts.append(data)
        except Exception as e:
            print(f"Warning: Could not read {f}: {e}", file=sys.stderr)
    return posts


def get_all_ids_for_post(post: dict) -> set[str]:
    """Collect primary ID and any secondary / related discussion IDs."""
    ids = {str(post["id"])}
    for sec_id in post.get("secondary_ids", []):
        ids.add(str(sec_id))
    for rel in post.get("related_discussions", []):
        url = rel.get("url", "")
        m_hn = re.search(r"item\?id=(\d+)", url)
        if m_hn:
            ids.add(m_hn.group(1))
        m_red = re.search(r"/comments/([a-z0-9]+)", url)
        if m_red:
            ids.add(m_red.group(1))
    return ids


def unmark_failed(post: dict):
    """Remove post from ids_failed.txt, urls_failed.txt, and done/failed/."""
    all_ids = get_all_ids_for_post(post)
    remove_symbols_from_file(os.path.join(SCRIPT_DIR, "ids_failed.txt"), all_ids)

    urls = set()
    if post.get("url"):
        urls.add(post["url"].rstrip("/"))
    for rel in post.get("related_discussions", []):
        if rel.get("url"):
            urls.add(rel["url"].rstrip("/"))
    remove_symbols_from_file(os.path.join(SCRIPT_DIR, "urls_failed.txt"), urls)

    filepath = post.get("_filepath") or os.path.join(FAILED_DIR, f"{post['id']}.json")
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except OSError:
            pass


def list_failed(posts: list[dict], limit: int | None = None):
    """Print a readable summary of failed posts."""
    if not posts:
        print("\n✅ No failed posts found in done/failed/.")
        return

    display_posts = posts[:limit] if limit else posts
    print(f"\nFound {len(posts)} failed post(s) (showing {len(display_posts)}):")
    print("=" * 80)
    for i, p in enumerate(display_posts, 1):
        pid = p.get("id", "N/A")
        title = p.get("title", "No title")
        url = p.get("url", "No URL")
        error = p.get("error", "Unknown error")
        # Truncate error for table view
        first_error_line = error.strip().splitlines()[-1] if error else "Unknown error"
        print(f"[{i}] ID: {pid}")
        print(f"    Title: {title}")
        print(f"    URL:   {url}")
        print(f"    Error: {first_error_line}")
        print("-" * 80)

    print("\nTo retry:")
    print("  ./retry_failed.py <ID> ...       # Retry specific post(s)")
    print("  ./retry_failed.py --last 5       # Retry the last 5 posts")
    print("  ./retry_failed.py --all          # Retry all failed posts")
    print("=" * 80)


def subprocess_error(result: subprocess.CompletedProcess) -> str:
    """Return a useful one-line error, skipping deprecation warnings."""
    stderr = result.stderr.strip()
    if not stderr:
        return f"exit code {result.returncode}"
    lines = [line.strip() for line in stderr.splitlines() if line.strip()]
    for line in reversed(lines):
        if "DeprecationWarning:" in line or line.startswith("VersionedUnionType =") or line.startswith("Error from llms.sh ("):
            continue
        return line
    return f"exit code {result.returncode}"


def retry_single_post(post: dict, model: str | None = None) -> bool:
    """Re-run extraction and comment analysis for a single post."""
    post_id = str(post["id"])
    title = post.get("title", "N/A")
    url = post.get("url", "")
    comments_url = post.get("comments_url", "")

    print(f"\n{'='*70}")
    print(f"Retrying: [{post_id}] {title}")
    print(f"URL:      {url}")
    print(f"{'='*70}")

    failed_file = post.get("_filepath") or os.path.join(FAILED_DIR, f"{post_id}.json")

    # Unmark from failed tracking files so it won't be blocked by done_urls
    all_ids = get_all_ids_for_post(post)
    remove_symbols_from_file(os.path.join(SCRIPT_DIR, "ids_failed.txt"), all_ids)
    urls = set()
    if post.get("url"):
        urls.add(post["url"].rstrip("/"))
    for rel in post.get("related_discussions", []):
        if rel.get("url"):
            urls.add(rel["url"].rstrip("/"))
    remove_symbols_from_file(os.path.join(SCRIPT_DIR, "urls_failed.txt"), urls)

    # 1. Analyze Article
    print(f"\n--- Analyzing article: {url} ---")
    article_cmd = [
        PYTHON,
        os.path.join(SCRIPT_DIR, "analyze_tech_article.py"),
        post_id,
        "--force",
    ]
    if os.path.exists(failed_file):
        article_cmd.extend(["--post-file", failed_file])
    if model:
        article_cmd.extend(["--model", model])

    result = subprocess.run(article_cmd, cwd=SCRIPT_DIR, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if result.returncode != 0:
        err = subprocess_error(result)
        print(f"Failed again in article analysis: {err}", file=sys.stderr)
        # Re-record failure
        post["error"] = err
        all_ids = get_all_ids_for_post(post)
        for i in all_ids:
            append_to_file(os.path.join(SCRIPT_DIR, "ids_failed.txt"), str(i))
        if url:
            append_to_file(os.path.join(SCRIPT_DIR, "urls_failed.txt"), url.rstrip("/"))
        with open(failed_file, "w") as f:
            json.dump(post, f, indent=2)
        return False

    if result.stdout:
        print(result.stdout, end="")

    # Patch secondary/related discussions if present
    related = post.get("related_discussions")
    sec_ids = post.get("secondary_ids")
    if related or sec_ids:
        post_path = Path(POSTS_DIR) / f"{post_id}.json"
        if post_path.exists():
            post_data = json.loads(post_path.read_text())
            if related:
                post_data["related_discussions"] = related
            if sec_ids:
                post_data["secondary_ids"] = sec_ids
            post_path.write_text(json.dumps(post_data, indent=2), encoding="utf-8")

    # 2. Analyze Comments
    if comments_url:
        print(f"\n--- Analyzing comments: {comments_url} ---")
        is_reddit = "reddit.com" in comments_url
        analyzer = "analyze_reddit_comments.py" if is_reddit else "analyze_hn_comments.py"
        comments_cmd = [PYTHON, os.path.join(SCRIPT_DIR, analyzer), post_id]
        if model:
            comments_cmd.extend(["--model", model])
        res_comments = subprocess.run(comments_cmd, cwd=SCRIPT_DIR, capture_output=True, text=True, stdin=subprocess.DEVNULL)
        if res_comments.returncode != 0:
            err = subprocess_error(res_comments)
            print(f"Warning: {analyzer} failed for post {post_id}: {err}", file=sys.stderr)
        if res_comments.stdout:
            print(res_comments.stdout, end="")

    # Clean up the failed json file now that the retry succeeded
    if os.path.exists(failed_file):
        try:
            os.remove(failed_file)
        except OSError:
            pass

    print(f"\n Successfully retried post {post_id}! Saved to posts/{post_id}.json")
    return True


def main():
    parser = argparse.ArgumentParser(description="Inspect, clear, and re-run failed news posts.")
    parser.add_argument("post_ids", nargs="*", help="Specific post ID(s) to retry")
    parser.add_argument("--list", action="store_true", help="List failed posts without running")
    parser.add_argument("--last", type=int, default=None, help="Retry or list the last N failed posts")
    parser.add_argument("--all", action="store_true", help="Retry all failed posts")
    parser.add_argument("--clear", action="store_true", help="Remove specified post(s) from failed tracking without re-running")
    parser.add_argument("--model", default=None, help="Override LLM model for retrying")
    parser.add_argument("--force", action="store_true", help="Force re-processing even if post already completed")
    args = parser.parse_args()

    failed_posts = load_failed_posts()

    if args.list or (not args.post_ids and not args.all and args.last is None and not args.clear):
        list_failed(failed_posts, limit=args.last or 15)
        return

    # Select target posts
    targets: list[dict] = []
    failed_by_id = {str(p["id"]): p for p in failed_posts}

    if args.post_ids:
        for pid in args.post_ids:
            spid = str(pid)
            if spid in failed_by_id:
                targets.append(failed_by_id[spid])
            else:
                # Check if it was already processed or exists in another directory
                posts_file = Path(POSTS_DIR) / f"{spid}.json"
                completed_file = Path(COMPLETED_DIR) / f"{spid}.json"
                skipped_file = Path(SKIPPED_DIR) / f"{spid}.json"

                if posts_file.exists():
                    if args.force:
                        targets.append(json.loads(posts_file.read_text()))
                    else:
                        print(f"✅ Post {spid} is already processed and waiting in posts/{spid}.json. (Use --force to re-run)")
                elif completed_file.exists():
                    if args.force:
                        targets.append(json.loads(completed_file.read_text()))
                    else:
                        print(f"✅ Post {spid} was already published in done/completed/{spid}.json. (Use --force to re-run)")
                elif skipped_file.exists():
                    if args.force:
                        targets.append(json.loads(skipped_file.read_text()))
                    else:
                        print(f"ℹ️ Post {spid} was previously handled in done/skipped/{spid}.json. (Use --force to re-run)")
                else:
                    print(f"❌ Post {spid} not found in done/failed/, posts/, or done/completed/.")
    elif args.all:
        targets = list(failed_posts)
    elif args.last is not None:
        targets = failed_posts[:args.last]

    if not targets:
        print("No matching failed posts to process.")
        return

    # Clear mode
    if args.clear:
        print(f"Clearing {len(targets)} post(s) from failed tracking...")
        for p in targets:
            unmark_failed(p)
            print(f"  Cleared post {p['id']}: {p.get('title', 'N/A')}")
        print("Done.")
        return

    # Retry mode
    print(f"Retrying {len(targets)} post(s)...")
    succeeded = 0
    failed = 0
    for p in targets:
        ok = retry_single_post(p, model=args.model)
        if ok:
            succeeded += 1
        else:
            failed += 1

    print(f"\n{'='*70}")
    print(f"Retry complete: {succeeded} succeeded, {failed} failed.")
    if succeeded > 0:
        print("Run './process_technologies.py' and './publish_posts.py' (or './process_news.sh') to publish recovered posts.")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
