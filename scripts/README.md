Run:

```bash
./process_news.sh
```

If everything looks good, then run:

```bash
./publish_posts.sh
```

---

Open https://llmspy.org type CTRL+K to open the search box, then type "latest features" into Search, then navigate to the first link in the search results
---

Update hn_top.json with the latest top 30 HN posts

`bash
./hn_top.py
```
Create posts/*.json for all new posts in hn_top.json, then run:

```bash
./process_posts.py
```

List all new technologies found in the new posts:

```bash
./process_technologies.py
```

Check the new technologies against the existing ones in data/all-technologies.json and data/alias-technologies.json, then add any new ones to data/new-technologies.json. Finally, run:

```bash
./create_technology.py "Technology Name"
```

If no new technologies are needed, you can skip the last step.

```bash
./publish_posts.sh
```

---

Tweet the best of the newly published posts, linking back to their techstacks.io page:

```bash
./tweet_top_posts.py --dry-run
```

Drop `--dry-run` to actually post. Defaults to posts from the last 24h with 200+
source points, 5 per run; already-tweeted posts are recorded in `ids_tweeted.txt`
so re-runs never repeat one.

Without API credentials, `--intent` opens each one pre-filled in x.com's compose
window in your normal browser, and you press Post:

```bash
./tweet_top_posts.py --intent
```

The API path instead needs `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN` and `X_ACCESS_TOKEN_SECRET`
in the environment — see the notes at the top of `post_to_x.py`, which can also
tweet a single post or an arbitrary link:

```bash
./post_to_x.py --post-id 17583
```

To check the credentials are wired up and which account they post as:

```bash
./post_to_x.py --whoami
```
