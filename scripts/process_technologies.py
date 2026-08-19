#!/usr/bin/env python3
import argparse
import glob
import json
import os
import subprocess
import sys
from pathlib import Path

from utils import (
    LLMS_SH,
    LLMS_TECH_MODEL,
    REPO_ROOT,
    SCRIPT_DIR,
    parse_json_response,
)

MATCH_TECHNOLOGIES_SCHEMA = {
    "name": "match_technologies",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "matches": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tag": {
                            "type": "string",
                            "description": "The candidate tag being evaluated",
                        },
                        "matched_technology": {
                            "type": "string",
                            "description": "The exact name of the existing technology from the provided list that this tag is an alias/synonym/sub-component for, or empty string if no high-confidence match",
                        },
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium", "low", "none"],
                            "description": "Confidence level in the match. Only mark 'high' if the candidate tag is a clear synonym, alias, abbreviation, or specific sub-library of the existing technology.",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Brief explanation of why it was matched or rejected.",
                        },
                    },
                    "required": ["tag", "matched_technology", "confidence", "reason"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["matches"],
        "additionalProperties": False,
    },
}


def apply_alias_to_posts(dir_path: str, name: str, alias: str):
    """Replace `name` with `alias` in the technologies of unsent posts (still in posts/)."""
    updated = []
    for post_file in glob.glob(os.path.join(dir_path, "posts/*.json")):
        with open(post_file) as f:
            post = json.load(f)

        techs = post.get("technologies", [])
        if name not in techs:
            continue

        processed = []
        seen = set()
        for tech in techs:
            tech = alias if tech == name else tech
            if tech not in seen:
                processed.append(tech)
                seen.add(tech)

        post["technologies"] = processed
        with open(post_file, "w") as f:
            json.dump(post, f, indent=4)
        updated.append(os.path.basename(post_file))

    if updated:
        print(f"Updated tags in {len(updated)} unsent post(s): {', '.join(updated)}")


def add_to_blacklist(blacklist_path: str, tags: list[str]) -> list[str]:
    """Add tags to blacklist-technologies.json (sorted case-insensitively)."""
    if os.path.exists(blacklist_path):
        with open(blacklist_path) as f:
            blacklist_list = json.load(f)
    else:
        blacklist_list = []

    blacklist_set = {t.casefold() for t in blacklist_list}
    added = []
    for tech in tags:
        if tech.casefold() not in blacklist_set:
            blacklist_list.append(tech)
            blacklist_set.add(tech.casefold())
            added.append(tech)

    if added:
        blacklist_list.sort(key=str.casefold)
        with open(blacklist_path, "w") as f:
            json.dump(blacklist_list, f, indent=2)
            f.write("\n")
    return added


def add_alias(alias_path: str, tag: str, alias: str):
    """Add an alias mapping to alias-technologies.json (sorted case-insensitively)."""
    if os.path.exists(alias_path):
        with open(alias_path) as f:
            aliases = json.load(f)
    else:
        aliases = {}

    aliases[tag] = alias
    sorted_aliases = dict(sorted(aliases.items(), key=lambda x: x[0].casefold()))
    with open(alias_path, "w") as f:
        json.dump(sorted_aliases, f, indent=2)
        f.write("\n")


def add_to_review(review_path: str, tag: str, post_ids: list[str], reason: str = ""):
    """Add or update an entry in review-technologies.json."""
    reviews = []
    if os.path.exists(review_path):
        try:
            with open(review_path) as f:
                data = json.load(f)
                if isinstance(data, list):
                    reviews = data
                elif isinstance(data, dict):
                    reviews = [{"tag": k, "post_ids": v if isinstance(v, list) else [v]} for k, v in data.items()]
        except Exception:
            reviews = []

    existing = next((r for r in reviews if r.get("tag", "").casefold() == tag.casefold()), None)
    if existing:
        existing_pids = set(existing.get("post_ids", []))
        if "post_id" in existing:
            existing_pids.add(str(existing.pop("post_id")))
        existing_pids.update(str(p) for p in post_ids if p)
        existing["post_ids"] = sorted(existing_pids)
        if reason:
            existing["reason"] = reason
    else:
        new_entry = {
            "tag": tag,
            "post_ids": sorted(set(str(p) for p in post_ids if p)),
        }
        if reason:
            new_entry["reason"] = reason
        reviews.append(new_entry)

    reviews.sort(key=lambda r: r.get("tag", "").casefold())
    with open(review_path, "w") as f:
        json.dump(reviews, f, indent=2)
        f.write("\n")


def match_technologies_with_ai(missing_tags: list[str], all_technologies: list[str], model: str) -> list[dict]:
    """Use AI to compare candidate tags with existing canonical technologies."""
    all_tech_str = "\n".join(f"- {t}" for t in sorted(all_technologies, key=str.casefold))
    candidate_str = "\n".join(f"- {t}" for t in missing_tags)

    prompt = f"""You are an expert developer taxonomist for techstacks.io.
Evaluate the following candidate tags against the list of EXISTING canonical technologies on TechStacks.

Goal:
Determine if each candidate tag is a direct alias, abbreviation, version variant, or specific sub-library of an EXISTING technology from the list below.

Rules:
1. 'matched_technology' MUST be an EXACT string match from the EXISTING TECHNOLOGIES list below, or empty string "" if no valid match exists.
2. 'confidence':
   - 'high': The candidate tag is a direct synonym, abbreviation, sub-library, or version of the existing technology (e.g., "PyTorch Geometric" -> "PyTorch", "React 19" -> "React", "K8s" -> "Kubernetes", "Golang" -> "Go", "TS" -> "TypeScript", "AWS Lambda" -> "AWS", "Vue3" -> "Vue.js").
   - 'medium': Plausible connection or category, but NOT a direct alias or sub-library of the existing technology.
   - 'low' or 'none': Unrelated technology, generic term, non-tech word, or no appropriate technology exists in the list.
3. If confidence is NOT 'high', set matched_technology to "".

CANDIDATE TAGS TO EVALUATE:
{candidate_str}

EXISTING TECHNOLOGIES:
{all_tech_str}
"""

    chat_request = {
        "model": model,
        "temperature": 0.0,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {
            "type": "json_schema",
            "json_schema": MATCH_TECHNOLOGIES_SCHEMA,
        },
    }

    chat_json_path = os.path.join(SCRIPT_DIR, "chat.technology.match.json")
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
        return []

    content = result.stdout.strip()
    try:
        parsed = parse_json_response(content)
        return parsed.get("matches", [])
    except Exception as e:
        print(f"Error parsing AI response: {e}\nResponse text: {content}", file=sys.stderr)
        return []


def remove_from_blacklist(blacklist_path: str, tag: str) -> bool:
    """Remove a tag from blacklist-technologies.json (case-insensitive)."""
    if not os.path.exists(blacklist_path):
        return False
    with open(blacklist_path) as f:
        blacklist = json.load(f)
    new_blacklist = [b for b in blacklist if b.casefold() != tag.casefold()]
    if len(new_blacklist) != len(blacklist):
        with open(blacklist_path, "w") as f:
            json.dump(new_blacklist, f, indent=2)
            f.write("\n")
        return True
    return False


def load_review_items(review_path: str) -> list[dict]:
    """Load items from review-technologies.json."""
    if not os.path.exists(review_path):
        return []
    try:
        with open(review_path) as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                return [{"tag": k, "post_ids": v if isinstance(v, list) else [v]} for k, v in data.items()]
    except Exception:
        pass
    return []


def remove_from_review(review_path: str, tag: str) -> bool:
    """Remove a tag from review-technologies.json (case-insensitive)."""
    if not os.path.exists(review_path):
        return False
    reviews = load_review_items(review_path)
    new_reviews = [r for r in reviews if r.get("tag", "").casefold() != tag.casefold()]
    if len(new_reviews) != len(reviews):
        with open(review_path, "w") as f:
            json.dump(new_reviews, f, indent=2)
            f.write("\n")
        return True
    return False


def process_review_queue(review_path: str, blacklist_path: str, alias_path: str, dir_path: str):
    """Interactively process tags logged in review-technologies.json."""
    reviews = load_review_items(review_path)
    if not reviews:
        print("No tags pending review in review-technologies.json.")
        return

    print(f"\n==========================================")
    print(f" Review Queue: {len(reviews)} tag(s) pending review")
    print(f"==========================================")

    for item in list(reviews):
        tech = item.get("tag", "")
        post_ids = item.get("post_ids", [])
        reason = item.get("reason", "")

        print(f"\n--- [Review] {tech} ---")
        if post_ids:
            print(f"  Posts: {', '.join(str(p) for p in post_ids)}")
        if reason:
            print(f"  Reason: {reason}")
        print("  1. Keep Blacklisted (Dismiss from review queue)")
        print("  2. Add Alias (Remove from blacklist & map to canonical tech)")
        print("  3. Create New Technology (Remove from blacklist & create on TechStacks)")
        print("  4. Skip (Leave in review queue)")
        print("  5. Remove from Review & Blacklist")
        print("  q. Quit Review")

        choice = input("Choose [1-5, q]: ").strip().lower()

        if choice == "1":
            remove_from_review(review_path, tech)
            print(f"Confirmed blacklisted. Removed '{tech}' from review queue.")

        elif choice == "2":
            alias_to = input(f"Alias '{tech}' -> ").strip()
            if alias_to:
                remove_from_blacklist(blacklist_path, tech)
                add_alias(alias_path, tech, alias_to)
                apply_alias_to_posts(dir_path, tech, alias_to)
                remove_from_review(review_path, tech)
                print(f"Added alias: '{tech}' -> '{alias_to}' (removed from blacklist and review queue).")

        elif choice == "3":
            remove_from_blacklist(blacklist_path, tech)
            try:
                subprocess.run(
                    [os.path.join(dir_path, "create_technology.py"), tech],
                    cwd=dir_path, check=True
                )
                update_script = os.path.join(dir_path, "data/update.sh")
                if os.path.exists(update_script):
                    subprocess.run(["./update.sh"], cwd=os.path.join(dir_path, "data"), check=True)
                remove_from_review(review_path, tech)
                print(f"Created technology '{tech}' (removed from blacklist and review queue).")
            except Exception as e:
                print(f"Error creating technology '{tech}': {e}", file=sys.stderr)

        elif choice == "5":
            remove_from_blacklist(blacklist_path, tech)
            remove_from_review(review_path, tech)
            print(f"Removed '{tech}' from review queue and blacklist.")

        elif choice == "q":
            print("Exiting review queue.")
            break
        else:
            print(f"Skipped: '{tech}' (remains in review queue).")


def main():
    parser = argparse.ArgumentParser(description="Process and validate technologies across pending posts.")
    parser.add_argument("--blacklist", nargs="+", help="Add technologies to the blacklist")
    parser.add_argument("--alias", nargs=2, metavar=("NAME", "ALIAS"), help="Add a technology alias (NAME -> ALIAS)")
    parser.add_argument("--review", action="store_true", help="Interactively review tags in review-technologies.json")
    parser.add_argument("-i", "--interactive", action="store_true", help="Prompt interactively for new technologies and pending review tags")
    parser.add_argument("--model", default=LLMS_TECH_MODEL, help=f"AI model to use for technology matching (default: {LLMS_TECH_MODEL})")
    args = parser.parse_args()

    dir_path = SCRIPT_DIR
    blacklist_path = os.path.join(dir_path, "data/blacklist-technologies.json")
    alias_path = os.path.join(dir_path, "data/alias-technologies.json")
    review_path = os.path.join(dir_path, "data/review-technologies.json")

    if args.review:
        process_review_queue(review_path, blacklist_path, alias_path, dir_path)
        return

    if args.alias:
        name, alias = args.alias
        with open(alias_path) as f:
            aliases = json.load(f)
        if name in aliases and aliases[name] == alias:
            print(f"Alias already exists: {name} -> {alias}")
        else:
            add_alias(alias_path, name, alias)
            print(f"Added alias: {name} -> {alias}")
            apply_alias_to_posts(dir_path, name, alias)
        return

    if args.blacklist:
        added = add_to_blacklist(blacklist_path, args.blacklist)
        if added:
            print(f"Added to blacklist: {', '.join(added)}")
        else:
            print("All specified technologies are already blacklisted.")
        return

    update_script = os.path.join(dir_path, "data/update.sh")
    if os.path.exists(update_script):
        subprocess.run(["./update.sh"], cwd=os.path.join(dir_path, "data"), check=True)

    with open(blacklist_path) as f:
        blacklist = set(json.load(f))
    blacklist_lower = {b.casefold() for b in blacklist}

    with open(alias_path) as f:
        aliases = json.load(f)

    with open(os.path.join(dir_path, "data/all-technologies.json")) as f:
        all_known = json.load(f)  # dict of {name: id}
    known_tech_map = {k.casefold(): k for k in all_known.keys()}

    new_technologies = set()
    tag_to_post_ids: dict[str, set[str]] = {}

    for post_file in glob.glob(os.path.join(dir_path, "posts/*.json")):
        post_id = Path(post_file).stem
        with open(post_file) as f:
            post = json.load(f)

        techs = post.get("technologies", [])
        if not techs:
            continue

        # Remove empty strings, blacklisted, apply aliases, deduplicate
        processed = []
        seen = set()
        for tech in techs:
            if not tech or not tech.strip() or tech in blacklist or tech.casefold() in blacklist_lower:
                continue
            tech = aliases.get(tech, tech)
            if tech not in seen:
                processed.append(tech)
                seen.add(tech)

        # Track new technologies and normalize casing
        for i, tech in enumerate(processed):
            if tech in all_known:
                continue
            if tech.casefold() in known_tech_map:
                existing = known_tech_map[tech.casefold()]
                processed[i] = existing
            else:
                new_technologies.add(tech)
                tag_to_post_ids.setdefault(tech, set()).add(post_id)

        # Update post if changed
        if processed != techs:
            post["technologies"] = processed
            with open(post_file, "w") as f:
                json.dump(post, f, indent=4)

    if not new_technologies:
        print("No new technologies found in pending posts.")
    elif args.interactive:
        sorted_new = sorted(new_technologies)
        print(f"\nFound {len(sorted_new)} new technologies in pending posts:")
        for tech in sorted_new:
            print(f"  {tech}")

        for tech in sorted_new:
            print(f"\n--- {tech} ---")
            print("  1. Blacklist")
            print("  2. Add Alias")
            print("  3. Create New Technology")
            print("  4. Skip")
            choice = input("Choose [1-4]: ").strip()

            if choice == "1":
                add_to_blacklist(blacklist_path, [tech])
                print(f"Added to blacklist: {tech}")

            elif choice == "2":
                alias_to = input(f"Alias '{tech}' -> ").strip()
                if alias_to:
                    add_alias(alias_path, tech, alias_to)
                    print(f"Added alias: {tech} -> {alias_to}")
                    apply_alias_to_posts(dir_path, tech, alias_to)

            elif choice == "3":
                subprocess.run(
                    [os.path.join(dir_path, "create_technology.py"), tech],
                    cwd=dir_path, check=True
                )

            else:
                print(f"Skipped: {tech}")
    else:
        sorted_new = sorted(new_technologies)
        print(f"\nEvaluating {len(sorted_new)} candidate technologies using AI ({args.model})...")
        matches = match_technologies_with_ai(sorted_new, list(all_known.keys()), model=args.model)
        match_by_tag = {m.get("tag", "").casefold(): m for m in matches if m.get("tag")}

        for tech in sorted_new:
            m = match_by_tag.get(tech.casefold())
            matched_target = m.get("matched_technology", "").strip() if m else ""
            confidence = m.get("confidence", "none") if m else "none"
            reason = m.get("reason", "") if m else "No AI match returned"
            post_ids = sorted(tag_to_post_ids.get(tech, []))

            # High confidence alias match
            if confidence == "high" and matched_target and (matched_target in all_known or matched_target.casefold() in known_tech_map):
                canonical_target = matched_target if matched_target in all_known else known_tech_map[matched_target.casefold()]
                add_alias(alias_path, tech, canonical_target)
                apply_alias_to_posts(dir_path, tech, canonical_target)
                print(f"  [AI ALIAS] '{tech}' -> '{canonical_target}' (confidence: high, reason: {reason})")
            else:
                add_to_review(review_path, tech, post_ids, reason)
                add_to_blacklist(blacklist_path, [tech])
                print(f"  [AI BLACKLIST] '{tech}' (confidence: {confidence}, reason: {reason}) -> logged to review-technologies.json for post(s): {', '.join(post_ids)}")

    # In interactive mode, also prompt to review any pending tags in review-technologies.json
    if args.interactive:
        pending_reviews = load_review_items(review_path)
        if pending_reviews:
            print(f"\nFound {len(pending_reviews)} tag(s) pending in review-technologies.json.")
            choice = input("Review these pending tags now? [Y/n]: ").strip().lower()
            if choice not in ("n", "no"):
                process_review_queue(review_path, blacklist_path, alias_path, dir_path)

    # Final cleanup pass for all pending posts
    with open(blacklist_path) as f:
        blacklist = set(json.load(f))
    blacklist_lower = {b.casefold() for b in blacklist}

    with open(alias_path) as f:
        aliases = json.load(f)

    for post_file in glob.glob(os.path.join(dir_path, "posts/*.json")):
        with open(post_file) as f:
            post = json.load(f)

        techs = post.get("technologies", [])
        processed = []
        seen = set()
        for tech in techs:
            if not tech or not tech.strip() or tech in blacklist or tech.casefold() in blacklist_lower:
                continue
            tech = aliases.get(tech, tech)
            if tech.casefold() in known_tech_map:
                tech = known_tech_map[tech.casefold()]
            if tech not in seen:
                processed.append(tech)
                seen.add(tech)

        if not processed:
            os.remove(post_file)
            print(f"Removed {os.path.basename(post_file)} (no valid technologies remaining)")
        elif processed != techs:
            post["technologies"] = processed
            with open(post_file, "w") as f:
                json.dump(post, f, indent=4)


if __name__ == "__main__":
    main()
