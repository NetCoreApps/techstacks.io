#!/usr/bin/env python3
"""
Analyze pasted article content from stdin using the LLM tech-article analyzer.

Usage:
    pbpaste | python analyze_tech_content.py
    python analyze_tech_content.py < article.txt
"""

import json
import sys

from analyze_tech_article import build_user_message, call_llm
from utils import LLMS_ANALYTICS_MODEL

def main():
    content = sys.stdin.read().strip()
    if not content:
        print("Error: no content received on stdin", file=sys.stderr)
        sys.exit(1)

    extracted = {
        "url": "",
        "title": "",
        "description": "",
        "text_markdown": content,
    }

    user_message = build_user_message(extracted)
    result = call_llm(user_message, LLMS_ANALYTICS_MODEL)
    print(json.dumps(result, indent=2))

    print("\n---\n")
    print(result.get("summary"))

if __name__ == "__main__":
    main()
