#!/usr/bin/env python3

"""
Delete Posts 
================
Usage: delete_posts.py <search>
"""

async def main():
    import sys
    import requests
    from utils import TECHSTACKS_BASE, create_cookie_jar

    if len(sys.argv) < 2:
        print("Usage: delete_posts.py <search>")
        return

    SEARCH = sys.argv[1]

    # encode search
    encode_search = requests.utils.quote(SEARCH)
    search_url = f"{TECHSTACKS_BASE}/api/QueryPosts?fields=id,title&jsconfig=edv&titleContains={encode_search}&take=50"
    resp = requests.get(search_url, cookies=create_cookie_jar(), verify=False)
    if not resp.ok:
        print(f"Error searching posts: {resp.status_code} {resp.text}")
        return

    queryResponse = resp.json()
    posts = queryResponse.get("results", [])
    print(f"Found {len(posts)} posts matching '{SEARCH}'")

    for post in posts:
        post_id = post["id"]
        delete_url = f"{TECHSTACKS_BASE}/api/DeletePost?id={post_id}"
        del_resp = requests.delete(delete_url, cookies=create_cookie_jar(), verify=False)
        if del_resp.ok:
            print(f"Deleted post {post_id}: {post['title']}")
        else:
            print(f"Error deleting post {post_id}: {del_resp.status_code} {del_resp.text}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())