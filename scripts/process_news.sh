##!/bin/bash

echo "Updating Hacker News top posts..."
./hn_top.py 4

echo "Updating Reddit top posts..."
./reddit_top.py

echo "Process posts..."
./process_posts.py

echo "Process technologies..."
./process_technologies.py

POST_COUNT=$(ls ./posts/*.json 2>/dev/null | wc -l)
if [ "$POST_COUNT" -eq 0 ]; then
    echo "No posts found in ./posts/, exiting."
    exit 0
fi

# Check for technologies in posts that aren't in all-technologies.json
MISSING=$(python3 -c "
import json, glob
with open('data/all-technologies.json') as f:
    known = set(json.load(f).keys())
missing = set()
for f in glob.glob('posts/*.json'):
    with open(f) as fh:
        for t in json.load(fh).get('technologies', []):
            if t and t not in known:
                missing.add(t)
if missing:
    for t in sorted(missing):
        print(t)
")

if [ -n "$MISSING" ]; then
    echo ""
    echo "Missing technologies found:"
    echo "$MISSING"
    echo ""
    echo "Run ./process_technologies.py to resolve them before publishing."
    exit 1
fi

echo "Publishing posts..."
./publish_posts.py
