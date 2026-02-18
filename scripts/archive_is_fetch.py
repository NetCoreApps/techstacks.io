#!/usr/bin/env python3
"""
Fetch archived pages from archive.is (archive.today)

Usage:
    python archive_is_fetch.py <url> [options]

Examples:
    python archive_is_fetch.py https://example.com
    python archive_is_fetch.py https://example.com --latest
    python archive_is_fetch.py https://example.com --list
    python archive_is_fetch.py https://example.com --save output.html
"""

import argparse
import sys
import re
import json
from urllib.parse import quote_plus, urljoin
from datetime import datetime

try:
    import requests
except ImportError:
    print("Error: 'requests' is required. Install with: pip install requests")
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

ARCHIVE_BASE = "https://archive.is"
# archive.is sometimes redirects to archive.today or archive.ph
ARCHIVE_ALIASES = ["archive.is", "archive.today", "archive.ph", "archive.org"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def get_archive_url(url: str) -> str:
    """Build the archive.is search/timemap URL for a given URL."""
    return f"{ARCHIVE_BASE}/newest/{url}"


def list_snapshots(url: str) -> list[dict]:
    """List all available snapshots for a URL on archive.is."""
    search_url = f"{ARCHIVE_BASE}/{url}"
    print(f"Searching: {search_url}")

    session = requests.Session()
    session.headers.update(HEADERS)

    resp = session.get(search_url, allow_redirects=True, timeout=30)
    resp.raise_for_status()

    snapshots = []

    if not HAS_BS4:
        # Fallback: extract links with regex
        pattern = re.compile(r'https?://archive\.\w+/\w+/https?://\S+')
        matches = pattern.findall(resp.text)
        for match in matches:
            snapshots.append({"url": match, "date": None})
    else:
        soup = BeautifulSoup(resp.text, "html.parser")
        # archive.is lists snapshots in divs or as links
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            if re.match(r"https?://archive\.\w+/\w+", href) and url.split("//")[-1].split("/")[0] in href:
                date_text = link.get_text(strip=True) or None
                snapshots.append({"url": href, "date": date_text})

    # Deduplicate
    seen = set()
    unique = []
    for s in snapshots:
        if s["url"] not in seen:
            seen.add(s["url"])
            unique.append(s)

    return unique


def fetch_latest(url: str) -> tuple[str, str]:
    """
    Fetch the latest archived version of a URL.
    Returns (final_url, html_content).
    """
    archive_url = get_archive_url(url)
    print(f"Fetching: {archive_url}")

    session = requests.Session()
    session.headers.update(HEADERS)

    resp = session.get(archive_url, allow_redirects=True, timeout=30)
    resp.raise_for_status()

    return resp.url, resp.text


def fetch_snapshot(snapshot_url: str) -> tuple[str, str]:
    """Fetch a specific archive.is snapshot URL."""
    print(f"Fetching snapshot: {snapshot_url}")

    session = requests.Session()
    session.headers.update(HEADERS)

    resp = session.get(snapshot_url, allow_redirects=True, timeout=30)
    resp.raise_for_status()

    return resp.url, resp.text


def extract_text(html: str) -> str:
    """Extract readable text from HTML (requires beautifulsoup4)."""
    if not HAS_BS4:
        # Basic tag stripping fallback
        clean = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        clean = re.sub(r'<style[^>]*>.*?</style>', '', clean, flags=re.DOTALL)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = re.sub(r'\s+', ' ', clean).strip()
        return clean

    soup = BeautifulSoup(html, "html.parser")

    # Remove script/style elements
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    # Remove archive.is toolbar/banner if present
    for tag in soup.find_all(id=re.compile(r"HEADER|wm-ipp|__wm_toolbar")):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    # Collapse blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


def submit_archive(url: str) -> str | None:
    """
    Submit a URL to archive.is for archiving.
    Returns the archive URL if successful.
    """
    print(f"Submitting {url} for archiving...")

    session = requests.Session()
    session.headers.update(HEADERS)

    # First get the main page to obtain the submitid token
    main_page = session.get(ARCHIVE_BASE, timeout=30)
    main_page.raise_for_status()

    # Extract submitid
    submitid = None
    if HAS_BS4:
        soup = BeautifulSoup(main_page.text, "html.parser")
        submitid_input = soup.find("input", {"name": "submitid"})
        if submitid_input:
            submitid = submitid_input.get("value")
    else:
        match = re.search(r'name="submitid"\s+value="([^"]+)"', main_page.text)
        if match:
            submitid = match.group(1)

    if not submitid:
        print("Warning: Could not find submitid token, submission may fail.")

    data = {"url": url}
    if submitid:
        data["submitid"] = submitid

    resp = session.post(
        f"{ARCHIVE_BASE}/submit/",
        data=data,
        allow_redirects=True,
        timeout=60,
    )
    resp.raise_for_status()

    # The final URL after redirect should be the archive page
    if "archive" in resp.url and resp.url != ARCHIVE_BASE:
        return resp.url

    return None


def main():
    parser = argparse.ArgumentParser(
        description="Fetch archived pages from archive.is",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s https://example.com                  # Fetch latest snapshot
  %(prog)s https://example.com --list            # List all snapshots
  %(prog)s https://example.com --text            # Extract text only
  %(prog)s https://example.com --save page.html  # Save HTML to file
  %(prog)s https://example.com --submit          # Archive the URL now
        """,
    )
    parser.add_argument("url", help="URL to look up on archive.is")
    parser.add_argument("--latest", action="store_true", default=True,
                        help="Fetch the latest snapshot (default)")
    parser.add_argument("--list", action="store_true",
                        help="List all available snapshots")
    parser.add_argument("--snapshot", type=str, default=None,
                        help="Fetch a specific snapshot URL")
    parser.add_argument("--text", action="store_true",
                        help="Extract and print text content only")
    parser.add_argument("--save", type=str, default=None,
                        help="Save the HTML content to a file")
    parser.add_argument("--submit", action="store_true",
                        help="Submit the URL for archiving")
    parser.add_argument("--quiet", action="store_true",
                        help="Suppress progress messages")

    args = parser.parse_args()

    try:
        if args.list:
            snapshots = list_snapshots(args.url)
            if not snapshots:
                print(f"No snapshots found for: {args.url}")
                sys.exit(1)
            print(f"\nFound {len(snapshots)} snapshot(s):\n")
            for i, snap in enumerate(snapshots, 1):
                date_str = f" ({snap['date']})" if snap.get("date") else ""
                print(f"  {i}. {snap['url']}{date_str}")
            return

        if args.submit:
            result = submit_archive(args.url)
            if result:
                print(f"\nArchived at: {result}")
            else:
                print("\nSubmission completed but could not determine archive URL.")
                print(f"Check manually: {ARCHIVE_BASE}/{args.url}")
            return

        # Fetch snapshot
        if args.snapshot:
            final_url, html = fetch_snapshot(args.snapshot)
        else:
            final_url, html = fetch_latest(args.url)

        print(f"Resolved URL: {final_url}")
        print(f"Content length: {len(html)} bytes\n")

        if args.save:
            with open(args.save, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"Saved to: {args.save}")
            return

        if args.text:
            text = extract_text(html)
            print(text)
            return

        # Default: print first portion of HTML
        preview_len = 2000
        if len(html) > preview_len:
            print(html[:preview_len])
            print(f"\n... [{len(html) - preview_len} more bytes, use --save to get full content]")
        else:
            print(html)

    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            print(f"No archive found for: {args.url}")
            print(f"You can submit it with: {sys.argv[0]} {args.url} --submit")
        else:
            print(f"HTTP Error: {e}")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"Request Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()