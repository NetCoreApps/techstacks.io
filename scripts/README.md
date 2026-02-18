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