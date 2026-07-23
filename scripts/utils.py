import json
import os
import re
import sys
import shutil
from collections import deque
from urllib.parse import urlparse

import requests

TECHSTACKS_BASE = "https://techstacks.io"
# News user https://techstacks.io
COOKIES = {
    ".AspNetCore.Identity.Application": os.getenv("TECHSTACKS_IDENTITY"),
}

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.52 Safari/537.36"

MIN_HN_POINTS = 100
MIN_REDDIT_POINTS = 200
TOP_REDDIT_LIMIT = 100

# Posts the analyzer itself judged as barely dev-relevant are not worth publishing
MIN_RELEVANCE_SCORE = int(os.getenv("MIN_RELEVANCE_SCORE", "40"))

PYTHON = sys.executable
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
POSTS_DIR = os.path.join(SCRIPT_DIR, "posts")
COMPLETED_DIR = os.path.join(SCRIPT_DIR, "done", "completed")
FAILED_DIR = os.path.join(SCRIPT_DIR, "done", "failed")
SKIPPED_DIR = os.path.join(SCRIPT_DIR, "done", "skipped")

REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # llms repo root
LLMS_SH = shutil.which("llms")
LLMS_MODEL = os.getenv("LLMS_MODEL", "DeepSeek V4 Flash")
LLMS_TECH_MODEL = os.getenv("LLMS_TECH_MODEL", "GLM-5.2")
LLMS_ANALYTICS_MODEL = os.getenv("LLMS_ANALYTICS_MODEL", "MiMo-V2.5-Pro")  # moonshotai/kimi-k2.5 / Kimi K2.5

if not LLMS_SH:
    raise RuntimeError("llms command not found in PATH. Please ensure llms is installed and available.")

def file_set(ids_file):
    """Return a set of post IDs from an ids_*.txt file."""
    if os.path.exists(ids_file):
        with open(ids_file, "r") as f:
            return set(line.strip() for line in f)
    return set()

def append_to_file(file_path, symbol: str):
    """Append a post ID to ids_*.txt if not already present."""
    existing_symbols = file_set(file_path)
    if symbol not in existing_symbols:
        with open(file_path, "a") as f:
            f.write(f"{symbol}\n")

def create_cookie_jar():
    parsed = urlparse(TECHSTACKS_BASE)
    jar = requests.cookies.RequestsCookieJar()
    for name, value in COOKIES.items():
        jar.set(name, value, domain=parsed.hostname, path="/")
    return jar


def create_reddit_cookie_jar():
    """Cookie jar loaded from reddit_cookies.json, needed to avoid Reddit's 403 on anonymous requests."""
    with open(os.path.join(SCRIPT_DIR, "reddit_cookies.json")) as f:
        reddit_cookies = json.load(f)
    parsed = urlparse("https://www.reddit.com")
    jar = requests.cookies.RequestsCookieJar()
    for name, value in reddit_cookies.items():
        jar.set(name, value, domain=parsed.hostname, path="/")
    return jar


def parse_json_response(text):
    # Try direct parse first
    try:
        return json.loads(text)
    except Exception:
        pass

    # Strip markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Try to extract JSON object/array
    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception as e:
            print(f"Error parsing extracted JSON: {e}\nExtracted text:\n{match.group(1)}", file=sys.stderr)

    raise ValueError("Could not parse JSON from response")


def create_slug(title):
    slug = title.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug


# ── Comment Sampling ────────────────────────────────────────────────────────
#
# Comment trees arrive in the source's own ranked order (HN's `kids` ordering,
# Reddit's `sort=top`). A naive depth-first walk capped at N comments spends the
# entire budget on the first thread, so the LLM sees one conversation and reports
# on it as if it were the whole discussion. These helpers sample breadth-first:
# every thread contributes its root before any thread contributes its 2nd reply.

MAX_COMMENT_CHARS = 1500


def count_comments(tree: dict) -> int:
    """Total number of comments in a tree, including the root."""
    return 1 + sum(count_comments(c) for c in tree.get("children", []))


def _bfs(tree: dict):
    """Yield (node, depth) for a comment tree in breadth-first order."""
    queue = deque([(tree, 0)])
    while queue:
        node, depth = queue.popleft()
        yield node, depth
        for child in node.get("children", []):
            queue.append((child, depth + 1))


def _format_comment(node: dict, depth: int) -> str:
    indent = "  " * depth
    text = (node.get("text") or "").strip()
    if len(text) > MAX_COMMENT_CHARS:
        text = text[:MAX_COMMENT_CHARS] + " [...]"
    # Reddit exposes per-comment scores; HN does not, so it is omitted there
    score = node.get("score")
    author = node.get("by", "[deleted]")
    byline = f"{author} +{score}" if score is not None else author
    return f"{indent}[{byline}]: {text}"


def sample_comments(trees: list[dict], max_threads: int = 40, max_comments: int = 200,
                    max_chars: int = 30000) -> tuple[str, dict]:
    """Render comment trees for the LLM, sampled breadth-first across threads.

    Pulls one comment at a time from each thread in round-robin, so the budget is
    spread across the discussion instead of being consumed by whichever thread
    happens to be first and largest.

    Returns (text, stats).
    """
    total_threads = len(trees)
    total_comments = sum(count_comments(t) for t in trees)

    iterators = [(rank, _bfs(tree)) for rank, tree in enumerate(trees[:max_threads], 1)]
    picked: dict[int, list[tuple[dict, int]]] = {}
    n_picked = 0

    while iterators and n_picked < max_comments:
        remaining = []
        for rank, it in iterators:
            if n_picked >= max_comments:
                remaining.append((rank, it))
                continue
            try:
                node, depth = next(it)
            except StopIteration:
                continue  # thread exhausted, drop it
            picked.setdefault(rank, []).append((node, depth))
            n_picked += 1
            remaining.append((rank, it))
        iterators = remaining

    # Group by thread so each conversation reads coherently, ordered by rank
    lines = []
    used_chars = 0
    rendered = 0
    truncated = False
    for rank in sorted(picked):
        header = f"--- Thread {rank} of {total_threads} ---"
        block = [header] + [_format_comment(node, depth) for node, depth in picked[rank]]
        chunk = "\n".join(block)
        if used_chars + len(chunk) > max_chars:
            truncated = True
            # A single oversized thread would otherwise render nothing at all
            if not lines:
                lines.append(chunk[:max_chars])
                rendered = len(picked[rank])
            break
        lines.append(chunk)
        used_chars += len(chunk) + 2
        rendered += len(picked[rank])

    text = "\n\n".join(lines)

    omitted = total_comments - rendered
    if omitted > 0 or truncated:
        text += (
            f"\n\n[Showing {rendered} of {total_comments} comments across "
            f"{min(len(picked), total_threads)} of {total_threads} threads, "
            f"sampled from the highest-ranked threads.]"
        )

    stats = {
        "total_threads": total_threads,
        "total_comments": total_comments,
        "sampled_comments": rendered,
        "truncated": omitted > 0 or truncated,
    }
    return text, stats


# ── Post Metadata ───────────────────────────────────────────────────────────

def extract_domain(url: str) -> str:
    """Bare hostname of a URL, without a leading www."""
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def reading_time_mins(text: str) -> int:
    """Estimated reading time in minutes at ~220 wpm, minimum 1."""
    words = len(text.split())
    return max(1, round(words / 220))


def controversy_ratio(comments: int, points: int) -> float:
    """Comments per point. High values indicate an argument rather than a consensus."""
    if not points:
        return 0.0
    return round(comments / points, 2)
