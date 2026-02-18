import json
import os
import re
import sys
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


def create_cookie_jar():
    parsed = urlparse(TECHSTACKS_BASE)
    jar = requests.cookies.RequestsCookieJar()
    for name, value in COOKIES.items():
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
