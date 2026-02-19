#!/usr/bin/env python

# Create missing technologies on techstacks.io using AI to generate the metadata.
# Usage: python create_technology.py "Tech1" "Tech2" "Tech3"

import argparse
import asyncio
import json
import os
import subprocess
import sys

import aiohttp
from yarl import URL

from utils import TECHSTACKS_BASE, SCRIPT_DIR, REPO_ROOT, LLMS_SH, LLMS_TECH_MODEL, COOKIES, parse_json_response, create_slug

CREATE_URL = f"{TECHSTACKS_BASE}/api/CreateTechnology"

TECHNOLOGY_TIERS = [
    "ProgrammingLanguage",
    "Client",
    "Http",
    "Server",
    "Data",
    "SoftwareInfrastructure",
    "OperatingSystem",
    "HardwareInfrastructure",
    "ThirdPartyServices",
]

CREATE_TECHNOLOGY_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "The official name of the technology"},
        "slug": {"type": "string", "description": "URL-friendly kebab-case identifier"},
        "vendorName": {"type": "string", "description": "The company or organization behind the technology"},
        "vendorUrl": {"type": "string", "description": "URL of the vendor's website"},
        "productUrl": {"type": "string", "description": "URL of the technology's product page or documentation"},
        "description": {"type": "string", "description": "A concise description of the technology (1-2 sentences)"},
        "tier": {
            "type": "string",
            "enum": TECHNOLOGY_TIERS,
            "description": "The technology tier/category",
        },
    },
    "required": ["name", "slug", "vendorName", "vendorUrl", "productUrl", "description", "tier"],
}


def sanitize(name: str) -> str:
    """Remove hyphens and lowercase for fuzzy matching."""
    return create_slug(name).replace("-", "")


def find_technology(name: str) -> bool:
    """Check if a technology exists in the local all-technologies.json."""
    data_path = os.path.join(SCRIPT_DIR, "data", "all-technologies.json")
    with open(data_path) as f:
        all_technologies = json.load(f)
    name_lower = name.lower()
    name_sanitized = sanitize(name)
    return any(
        t.lower() == name_lower or sanitize(t) == name_sanitized
        for t in all_technologies
    )


def generate_technology_json(name: str, model: str) -> dict:
    """Use llms.sh to generate the CreateTechnology JSON."""
    prompt = f"""Return a JSON object for creating a new technology entry for "{name}" on techstacks.io.

The JSON must match this schema exactly:
- name: The official name of the technology
- slug: URL-friendly kebab-case identifier (e.g. "ruby-on-rails")
- vendorName: The company or organization behind the technology
- vendorUrl: URL of the vendor's main website
- productUrl: URL of the technology's product page or official docs
- description: A concise 1-2 sentence description of what the technology is and does
- tier: One of: {", ".join(TECHNOLOGY_TIERS)}

Return ONLY the JSON object, no markdown fences or extra text."""

    chat_request = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "CreateTechnology",
                "strict": True,
                "schema": CREATE_TECHNOLOGY_SCHEMA,
            },
        },
    }

    chat_json_path = os.path.join(SCRIPT_DIR, "chat.technology.json")
    with open(chat_json_path, "w") as f:
        json.dump(chat_request, f, indent=2)

    result = subprocess.run(
        [LLMS_SH, "--chat", chat_json_path, "--nohistory"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        print(f"Error from llms.sh ({result.returncode}):\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    content = result.stdout.strip()
    return parse_json_response(content)


async def create_technology(session: aiohttp.ClientSession, tech: dict) -> dict:
    """POST the technology to techstacks.io using session cookies."""
    tech["logoUrl"] = "https://techstacks.io/img/placeholder.webp"
    async with session.post(CREATE_URL, json=tech) as resp:
        body = await resp.text()
        if resp.status not in (200, 201):
            print(f"Error creating technology ({resp.status}): {body}", file=sys.stderr)
            sys.exit(1)
        return parse_json_response(body)


async def main():
    parser = argparse.ArgumentParser(description="Create missing technologies on techstacks.io")
    parser.add_argument("names", nargs="+", help="Names of the technologies to search for / create")
    parser.add_argument("--model", default=LLMS_TECH_MODEL, help=f"OpenAI model to use (default: {LLMS_TECH_MODEL})")
    parser.add_argument("--dry-run", action="store_true", help="Generate JSON but don't create the technology")
    args = parser.parse_args()

    # Create session with techstacks.io auth cookies
    cookie_jar = aiohttp.CookieJar()
    for name, value in COOKIES.items():
        cookie_jar.update_cookies({name: value}, URL(TECHSTACKS_BASE))

    async with aiohttp.ClientSession(cookie_jar=cookie_jar) as session:
        for tech_name in args.names:
            print(f"\n--- {tech_name} ---")

            # Step 1: Check if technology already exists locally
            if find_technology(tech_name):
                print(f"Technology '{tech_name}' already exists, skipping.")
                continue

            try:
                # Step 2: Generate technology metadata via AI
                print(f"Not found. Generating technology metadata using {args.model}...")
                tech = generate_technology_json(tech_name, args.model)

                print(f"\nGenerated CreateTechnology:")
                print(json.dumps(tech, indent=2))

                if args.dry_run:
                    print("(dry-run mode — not creating)")
                    continue

                # Step 3: Create the technology
                print(f"\nCreating technology on techstacks.io...")
                result = await create_technology(session, tech)
                print(f"Created successfully!")
                print(json.dumps(result, indent=2))
            except Exception as e:
                print(f"Error processing '{tech_name}': {e}", file=sys.stderr)

if __name__ == "__main__":
    asyncio.run(main())
