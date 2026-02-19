import json
import os
import re
import sys
import shutil
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

PYTHON = sys.executable
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # llms repo root
LLMS_SH = shutil.which("llms")
LLMS_MODEL = os.getenv("LLMS_MODEL", "MiniMax-M2.1")
LLMS_TECH_MODEL = os.getenv("LLMS_TECH_MODEL", "glm-4.7")
LLMS_ANALYTICS_MODEL = os.getenv("LLMS_ANALYTICS_MODEL", "moonshotai/kimi-k2.5")  # moonshotai/kimi-k2.5

if not LLMS_SH:
    raise RuntimeError("llms command not found in PATH. Please ensure llms is installed and available.")

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
