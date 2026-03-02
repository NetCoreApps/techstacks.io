#!/usr/bin/env python3
"""Build a map of url => id from all completed post JSON files."""

import json
import glob
import os

def build_url_map():
    completed_dir = os.path.join(os.path.dirname(__file__), 'completed')
    url_map = {}

    for filepath in sorted(glob.glob(os.path.join(completed_dir, '*.json'))):
        with open(filepath) as f:
            data = json.load(f)
        url = data.get('url')
        post_id = data.get('id')
        if url and post_id:
            url_map[url] = post_id

    return url_map

if __name__ == '__main__':
    url_map = build_url_map()
    # print(json.dumps(url_map, indent=2))
    print(f"\nTotal: {len(url_map)} entries", file=__import__('sys').stderr)

    for url, post_id in url_map.items():
        # if post_id is not a number
        if not isinstance(post_id, int):        
            print(f"UPDATE post set ref_id = '{post_id}', ref_urn = 'urn:reddit:post:{post_id}' where url = '{url}';")