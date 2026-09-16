#!/usr/bin/env python3

"""
Delete Posts 
================
Usage: delete_posts.py <search>
"""
import sys
import requests
from utils import TECHSTACKS_BASE, create_cookie_jar

def main():
    if len(sys.argv) < 2:
        print("Usage: delete_posts.py <search>")
        return

    search = sys.argv[1]
    search_url = f"{TECHSTACKS_BASE}/api/QueryPosts"
    params = {
        "fields": "id,title",
        "jsconfig": "edv",
        "titleContains": search,
        "take": 50,
    }
    resp = requests.get(search_url, params=params, cookies=create_cookie_jar(), verify=False)
    if not resp.ok:
        print(f"Error searching posts: {resp.status_code} {resp.text}")
        return

    query_response = resp.json()
    posts = query_response.get("results", [])
    print(f"Found {len(posts)} posts matching '{search}'")

    for post in posts:
        post_id = post["id"]
        delete_url = f"{TECHSTACKS_BASE}/api/DeletePost"
        del_resp = requests.delete(delete_url, params={"id": post_id}, cookies=create_cookie_jar(), verify=False)
        if del_resp.ok:
            print(f"Deleted post {post_id}: {post['title']}")
        else:
            print(f"Error deleting post {post_id}: {del_resp.status_code} {del_resp.text}")

if __name__ == "__main__":
    main()