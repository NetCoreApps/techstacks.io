#!/usr/bin/env python3
"""
Process News Pipeline
=====================
Automated end-to-end pipeline to fetch, analyze, resolve technologies,
and publish developer news to TechStacks.

Steps:
  1. Fetch top posts from Hacker News and Reddit.
  2. Analyze articles and comments via LLM (process_posts.py).
  3. Resolve technologies and aliases automatically using AI (process_technologies.py).
  4. Publish valid posts to TechStacks (publish_posts.py).

Usage:
  python process_news.py [--hn-pages 4] [--min-points 100] [--model MODEL] [--skip-fetch] [--no-publish]
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
import subprocess
from pathlib import Path

from utils import PYTHON, SCRIPT_DIR, print_pipeline_summary


def run_step(cmd: list[str], desc: str, check: bool = True):
    print(f"\n{'='*60}")
    print(f">> {desc}")
    print(f"   Command: {' '.join(cmd)}")
    print(f"{'='*60}\n")
    result = subprocess.run(cmd, cwd=SCRIPT_DIR)
    if check and result.returncode != 0:
        print(f"\nError: Step '{desc}' failed with exit code {result.returncode}", file=sys.stderr)
        sys.exit(result.returncode)
    return result


def main():
    parser = argparse.ArgumentParser(description="Automated news ingestion and publishing pipeline.")
    parser.add_argument("--hn-pages", type=int, default=4, help="Number of Hacker News pages to fetch (default: 4)")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip fetching HN/Reddit posts and process existing json feeds")
    parser.add_argument("--min-points", type=int, default=None, help="Minimum HN points threshold")
    parser.add_argument("--model", default=None, help="Override default LLM model for analysis and technology matching")
    parser.add_argument("-i", "--interactive", action="store_true", help="Prompt interactively for new technologies and review queue instead of using AI")
    parser.add_argument("--review", action="store_true", help="Run interactive review queue for review-technologies.json")
    parser.add_argument("--no-publish", action="store_true", help="Do not run publish_posts.py at the end")
    parser.add_argument("--retry-failed", action="store_true", help="Re-run failed posts from done/failed/")
    args = parser.parse_args()

    # Step 1: Fetch latest posts (non-fatal if one source encounters a transient error)
    if not args.skip_fetch and not args.review:
        run_step([PYTHON, os.path.join(SCRIPT_DIR, "hn_top.py"), str(args.hn_pages)], "Fetching Hacker News top posts", check=False)
        run_step([PYTHON, os.path.join(SCRIPT_DIR, "reddit_top.py")], "Fetching Reddit top posts", check=False)

    # Step 2: Process posts (articles + comments analysis)
    if not args.review:
        process_posts_cmd = [PYTHON, os.path.join(SCRIPT_DIR, "process_posts.py")]
        if args.min_points is not None:
            process_posts_cmd.extend(["--min-points", str(args.min_points)])
        if args.model:
            process_posts_cmd.extend(["--model", args.model])
        if args.retry_failed:
            process_posts_cmd.append("--retry-failed")
        run_step(process_posts_cmd, "Analyzing posts and comments")

    # Step 3: Process technologies (AI tag matching / aliasing / blacklisting / review queue)
    process_tech_cmd = [PYTHON, os.path.join(SCRIPT_DIR, "process_technologies.py")]
    if args.model:
        process_tech_cmd.extend(["--model", args.model])
    if args.review:
        process_tech_cmd.append("--review")
    elif args.interactive:
        process_tech_cmd.append("--interactive")
    run_step(process_tech_cmd, "Resolving technologies and aliases")

    # Step 4: Check if any posts are ready in posts/
    pending_posts = [f for f in glob.glob(os.path.join(SCRIPT_DIR, "posts/*.json")) if Path(f).name != "all.json"]
    if not pending_posts:
        print("\nNo posts found in ./posts/ ready to publish. Exiting.")
        return

    print(f"\nFound {len(pending_posts)} post(s) ready for publishing.")

    # Step 5: Publish posts
    if not args.no_publish:
        run_step([PYTHON, os.path.join(SCRIPT_DIR, "publish_posts.py")], "Publishing posts to TechStacks")
    else:
        print("\nSkipping publication (--no-publish specified).")

    # Step 6: Print pipeline status summary (pending reviews, failed items, next steps)
    print_pipeline_summary()


if __name__ == "__main__":
    main()
