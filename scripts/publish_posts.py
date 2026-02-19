#!/usr/bin/env python3
"""
Publish Posts
=============
Import all posts in ./posts by POSTing to TechStacks.

Usage:
    python publish_posts.py [post_id]
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

import requests
from utils import TECHSTACKS_BASE, SCRIPT_DIR, create_cookie_jar

POSTS_DIR = os.path.join(SCRIPT_DIR, "posts")
COMPLETED_DIR = os.path.join(SCRIPT_DIR, "completed")
FAILED_DIR = os.path.join(SCRIPT_DIR, "failed")

IMPORT_POST_URL = f"{TECHSTACKS_BASE}/api/ImportNewsPost"
SYNC_POST_URL = f"{TECHSTACKS_BASE}/api/SyncStats"

def import_post(post_file):
    """Import a single post JSON file into TechStacks."""
    post_id = Path(post_file).stem

    with open(post_file) as f:
        post_data = json.load(f)

    print(f"  Importing post {post_id}: {post_data.get('title', 'N/A')}")

    resp = requests.post(
        IMPORT_POST_URL,
        json=post_data,
        cookies=create_cookie_jar(),
        verify=False,
    )

    if resp.ok:
        print(f"  Success: {resp.status_code}")
        os.makedirs(COMPLETED_DIR, exist_ok=True)
        dest = os.path.join(COMPLETED_DIR, f"{post_id}.json")
        shutil.move(post_file, dest)
        print(f"  Moved to {dest}")
        return True
    else:
        error_msg = f"{resp.status_code}: {resp.text}"
        print(f"  Error: {error_msg}", file=sys.stderr)
        post_data["error"] = error_msg
        os.makedirs(FAILED_DIR, exist_ok=True)
        failed_dest = os.path.join(FAILED_DIR, f"{post_id}.json")
        with open(failed_dest, "w") as f:
            json.dump(post_data, f, indent=2)
        os.remove(post_file)
        print(f"  Moved to {failed_dest}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Publish posts to TechStacks.")
    parser.add_argument("post_id", nargs="?", default=None, help="Optional post ID to publish a single post")
    args = parser.parse_args()

    posts_dir = Path(POSTS_DIR)

    if args.post_id:
        post_file = posts_dir / f"{args.post_id}.json"
        if not post_file.exists():
            print(f"Error: Post file not found: {post_file}", file=sys.stderr)
            sys.exit(1)
        post_files = [post_file]
    else:
        post_files = sorted(posts_dir.glob("*.json"))
        post_files = [f for f in post_files if f.name != "all.json"]

    print("Syncing posts...")
    requests.post(SYNC_POST_URL, cookies=create_cookie_jar(), verify=False)

    if not post_files:
        print("No posts to import.")
        return

    print(f"Importing {len(post_files)} post{'s' if len(post_files) != 1 else ''}...")
    failures = 0
    for pf in post_files:
        if not import_post(str(pf)):
            failures += 1

    print(f"Publishing complete. {len(post_files) - failures} succeeded, {failures} failed.")


if __name__ == "__main__":
    main()
