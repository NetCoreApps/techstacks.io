#!/usr/bin/env python

# Post a link to x.com from the account the API credentials belong to.
#
# Either share an existing techstacks.io post (title + link to its post page,
# same text the "Share on X" icon on the post page produces):
#   python post_to_x.py --post-id 1234
#
# ...or post an arbitrary link:
#   python post_to_x.py --url https://example.org/article --text "Some headline"
#
# Add --dry-run to print the tweet without sending it.
#
# Credentials are read from the environment (see X_ENV_VARS below). Create them
# at https://developer.x.com under a Project + App with "Read and write" User
# authentication permissions, then generate an Access Token & Secret for your
# own account — the token identifies the account that will be posting.
#
#   export X_API_KEY=...              # App "API Key" (OAuth 1.0a consumer key)
#   export X_API_SECRET=...           # App "API Key Secret"
#   export X_ACCESS_TOKEN=...         # Access Token for the posting account
#   export X_ACCESS_TOKEN_SECRET=...  # Access Token Secret
#
# Keep them in the environment rather than in this file: scripts/ is committed
# to git, and an access token pair can post as you until it is revoked.

import argparse
import os
import sys
import webbrowser
from urllib.parse import urlencode

import requests
from requests_oauthlib import OAuth1Session

TECHSTACKS_BASE = "https://techstacks.io"
GET_POST_URL = f"{TECHSTACKS_BASE}/api/GetPost"
QUERY_TECHNOLOGY_URL = f"{TECHSTACKS_BASE}/api/QueryTechnology"
CREATE_TWEET_URL = "https://api.x.com/2/tweets"
ME_URL = "https://api.x.com/2/users/me"
INTENT_URL = "https://x.com/intent/post"

X_ENV_VARS = ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET")

# x.com counts every link as this many characters, whatever its real length,
# because links are rewritten to a fixed-width t.co URL when the post is created.
TWEET_MAX_CHARS = 280
TCO_URL_CHARS = 23

# Enough to categorise the post without the tweet reading as tag spam
MAX_HASHTAGS = 3


def x_session() -> OAuth1Session:
    """OAuth 1.0a session signed as the account the access token belongs to."""
    missing = [name for name in X_ENV_VARS if not os.getenv(name)]
    if missing:
        print(f"Error: missing environment variable(s): {', '.join(missing)}", file=sys.stderr)
        print(f"See the usage notes at the top of {os.path.basename(__file__)}", file=sys.stderr)
        sys.exit(1)

    return OAuth1Session(
        client_key=os.getenv("X_API_KEY"),
        client_secret=os.getenv("X_API_SECRET"),
        resource_owner_key=os.getenv("X_ACCESS_TOKEN"),
        resource_owner_secret=os.getenv("X_ACCESS_TOKEN_SECRET"),
    )


def fetch_post(post_id: int) -> dict:
    """Fetch a techstacks.io post by ID."""
    resp = requests.get(GET_POST_URL, params={"id": post_id})
    if resp.status_code != 200:
        print(f"Error fetching post {post_id} ({resp.status_code}): {resp.text[:200]}", file=sys.stderr)
        sys.exit(1)
    post = resp.json().get("post")
    if not post:
        print(f"Error: post {post_id} was not found", file=sys.stderr)
        sys.exit(1)
    return post


def post_page_url(post: dict) -> str:
    """Canonical techstacks.io page for a post, matching the site's /posts/{id}/{slug} route."""
    return f"{TECHSTACKS_BASE}/posts/{post['id']}/{post['slug']}"


def hashtag(name: str) -> str:
    """A technology name as a hashtag, or "" if nothing usable survives.

    Hashtags stop at the first non-alphanumeric character, so "ASP.NET Core"
    has to be closed up into "#ASPNETCore" rather than truncated to "#ASP".
    """
    word = "".join(c for c in name if c.isalnum() or c == "_")
    return f"#{word}" if word and not word.isdigit() else ""


def fetch_hashtags(technology_ids: list[int]) -> list[str]:
    """Hashtags for a post's technologies, in the order the post lists them."""
    if not technology_ids:
        return []

    resp = requests.get(QUERY_TECHNOLOGY_URL, params={"ids": ",".join(map(str, technology_ids))})
    if resp.status_code != 200:
        # Tags are a nicety; a tweet without them still beats no tweet
        print(f"Warning: could not resolve technologies ({resp.status_code})", file=sys.stderr)
        return []

    by_id = {t["id"]: t["name"] for t in resp.json().get("results", [])}
    tags = [hashtag(by_id[tid]) for tid in technology_ids if tid in by_id]
    return [t for t in tags if t][:MAX_HASHTAGS]


def build_tweet(text: str, url: str, hashtags: list[str] | None = None) -> str:
    """Compose the tweet, trimming the text so the whole thing fits:

        <text>
        <hashtags>
        <url>

    Neither the link nor the hashtags are truncated — they are fixed-size and
    the point of the post — so the text absorbs the whole overflow, on a word
    boundary where one is available.
    """
    text = " ".join(text.split())  # collapse newlines/runs of whitespace
    tags = " ".join(hashtags or [])

    budget = TWEET_MAX_CHARS - TCO_URL_CHARS - 1  # -1 for the space before the link
    if tags:
        budget -= len(tags) + 1  # and one for the newline before the hashtags

    if len(text) > budget:
        trimmed = text[: budget - 1]  # -1 for the ellipsis
        # Prefer cutting at the last space, unless that throws away most of the text
        space = trimmed.rfind(" ")
        if space > budget // 2:
            trimmed = trimmed[:space]
        text = trimmed.rstrip(" ,.;:-") + "…"

    return f"{text}\n{tags}\n{url}" if tags else f"{text} {url}"


def intent_url(text: str, url: str, hashtags: list[str] | None = None) -> str:
    """x.com's compose window, pre-filled — the same link the site's Share on X icon opens.

    Needs no API credentials: it opens in whichever browser you are already
    signed in to, and nothing is published until you press Post yourself.
    """
    text = " ".join(text.split())
    if hashtags:
        text = f"{text}\n{' '.join(hashtags)}"
    return f"\n{INTENT_URL}?{urlencode({'text': text, 'url': url})}"


def whoami(session: OAuth1Session) -> dict:
    """The account the credentials post as — worth checking before a first run."""
    resp = session.get(ME_URL)
    if resp.status_code != 200:
        print(f"Error checking credentials ({resp.status_code}): {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json().get("data", {})


def create_tweet(session: OAuth1Session, tweet: str) -> dict:
    """POST a tweet, exiting with the API's error body if it is rejected."""
    resp = session.post(CREATE_TWEET_URL, json={"text": tweet})
    if resp.status_code != 201:
        print(f"Error posting to x.com ({resp.status_code}): {resp.text}", file=sys.stderr)
        if resp.status_code == 403:
            print("403 usually means the App lacks 'Read and write' permission (regenerate the "
                  "access token after changing it), or this exact text was posted recently.",
                  file=sys.stderr)
        elif resp.status_code == 429:
            print("429 means the account hit its posting cap for the current API access tier.",
                  file=sys.stderr)
        sys.exit(1)
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Post a link to x.com")
    parser.add_argument("--post-id", type=int, help="techstacks.io post ID to share")
    parser.add_argument("--url", help="URL to post (instead of --post-id)")
    parser.add_argument("--text", help="Text to post before the URL (defaults to the post title)")
    parser.add_argument("--dry-run", action="store_true", help="Print the tweet but don't post it")
    parser.add_argument("--intent", action="store_true",
                        help="Open x.com's compose window pre-filled instead of posting via the API")
    parser.add_argument("--no-tags", action="store_true",
                        help="Leave the post's technology hashtags out of the tweet")
    parser.add_argument("--whoami", action="store_true",
                        help="Print the account the credentials post as, then exit")
    args = parser.parse_args()

    if args.whoami:
        me = whoami(x_session())
        print(f"Posting as @{me.get('username')} ({me.get('name')})")
        return

    if args.post_id:
        post = fetch_post(args.post_id)
        url = args.url or post_page_url(post)
        text = args.text or post["title"]
        hashtags = [] if args.no_tags else fetch_hashtags(post.get("technologyIds", []))
    elif args.url:
        url = args.url
        text = args.text or ""
        hashtags = []  # nothing to derive tags from for an arbitrary link
    else:
        parser.error("either --post-id or --url is required")

    if args.intent:
        compose = intent_url(text, url, hashtags)
        print(compose)
        if not args.dry_run:
            webbrowser.open(compose)
        return

    tweet = build_tweet(text, url, hashtags)
    print(f"Tweet ({len(tweet)} chars):\n{tweet}\n")

    if args.dry_run:
        print("(dry-run mode — not posting)")
        return

    result = create_tweet(x_session(), tweet)
    tweet_id = result.get("data", {}).get("id")
    print(f"Posted: https://x.com/i/web/status/{tweet_id}")


if __name__ == "__main__":
    main()
