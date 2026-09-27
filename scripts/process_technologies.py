#!/usr/bin/env python3
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from utils import (
    LLMS_SH,
    LLMS_TECH_MODEL,
    SCRIPT_DIR,
    SKIPPED_DIR,
    append_to_file,
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


def input_with_autocomplete(prompt: str, options: list[str]) -> str:
    """Prompt for input with TAB autocomplete against the given options."""
    try:
        import readline
    except ImportError:
        return input(prompt)

    matches: list[str] = []

    def completer(text: str, state: int):
        if state == 0:
            query = text.strip().casefold()
            matches[:] = [o for o in options if o.casefold().startswith(query)]
            if not matches:
                matches[:] = [o for o in options if query in o.casefold()]
        return matches[state] if state < len(matches) else None

    old_completer = readline.get_completer()
    old_delims = readline.get_completer_delims()
    readline.set_completer(completer)
    readline.set_completer_delims("")
    try:
        # macOS ships libedit instead of GNU readline, which needs a different binding
        if "libedit" in (readline.__doc__ or ""):
            readline.parse_and_bind("bind ^I rl_complete")
        else:
            readline.parse_and_bind("tab: complete")
        return input(prompt)
    finally:
        readline.set_completer(old_completer)
        if old_delims is not None:
            readline.set_completer_delims(old_delims)


def load_aliases(alias_path: str) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """Load aliases and return (exact_alias_map_lower, wildcard_aliases).

    wildcard_aliases is a list of (prefix_lower, target) sorted by prefix length descending.
    """
    if not os.path.exists(alias_path):
        return {}, []

    with open(alias_path) as f:
        aliases = json.load(f)

    exact_map_lower = {}
    wildcards = []

    for k, v in aliases.items():
        kl = k.casefold()
        if kl.endswith("*") and len(kl[:-1].strip()) >= 2:
            prefix = kl[:-1].rstrip()
            wildcards.append((prefix, v))
        if kl not in exact_map_lower:
            exact_map_lower[kl] = v

    wildcards.sort(key=lambda x: len(x[0]), reverse=True)
    return exact_map_lower, wildcards


def resolve_technology(
    tech: str,
    all_known: dict,
    known_tech_map: dict,
    alias_map_lower: dict,
    wildcard_aliases: list[tuple[str, str]],
) -> tuple[str, str | None]:
    """Resolve a technology tag against known technologies, exact aliases, wildcards, and prefixes.

    Returns (resolved_tech, match_type) where match_type is:
    - 'known': exact match in all_known or known_tech_map
    - 'alias': exact alias match
    - 'wildcard': matched wildcard alias (e.g. "Nvidia*")
    - 'prefix': first-word or multi-word prefix matched existing known tech or alias
    - None: no match found (new technology candidate)
    """
    if not tech or not tech.strip():
        return tech, None

    tech_clean = tech.strip()
    tech_lower = tech_clean.casefold()

    # 1. Exact known technology (preserve canonical casing)
    if tech_clean in all_known:
        return tech_clean, "known"
    if tech_lower in known_tech_map:
        return known_tech_map[tech_lower], "known"

    # 2. Exact alias match (case-insensitive)
    if tech_lower in alias_map_lower:
        target = alias_map_lower[tech_lower]
        target = known_tech_map.get(target.casefold(), target)
        return target, "alias"

    # 3. Wildcard alias match (e.g. "Nvidia*" -> "NVIDIA")
    for prefix, target in wildcard_aliases:
        if tech_lower.startswith(prefix):
            target = known_tech_map.get(target.casefold(), target)
            return target, "wildcard"

    # 4. First-word / multi-word prefix match
    words = tech_clean.split()
    if len(words) > 1:
        for i in range(len(words) - 1, 0, -1):
            prefix = " ".join(words[:i]).strip(":,.;-").casefold()
            if not prefix:
                continue
            if prefix in alias_map_lower:
                target = alias_map_lower[prefix]
                target = known_tech_map.get(target.casefold(), target)
                return target, "prefix"
            if prefix in known_tech_map:
                return known_tech_map[prefix], "prefix"

    return tech_clean, None


def apply_alias_to_posts(dir_path: str, name: str, alias: str):
    """Replace `name` (or wildcard pattern `name*`) with `alias` in technologies of unsent posts."""
    updated = []
    is_wildcard = name.endswith("*")
    prefix = name[:-1].rstrip().casefold() if is_wildcard else name.casefold()

    for post_file in glob.glob(os.path.join(dir_path, "posts/*.json")):
        with open(post_file) as f:
            post = json.load(f)

        techs = post.get("technologies", [])
        def matches(t: str) -> bool:
            return t.casefold().startswith(prefix) if is_wildcard else t.casefold() == prefix

        if not any(matches(t) for t in techs):
            continue

        processed = []
        seen = set()
        for tech in techs:
            tech = alias if matches(tech) else tech
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
    if tag.casefold() == alias.casefold():
        return

    if os.path.exists(alias_path):
        with open(alias_path) as f:
            aliases = json.load(f)
    else:
        aliases = {}

    new_aliases = {k: v for k, v in aliases.items() if k.casefold() != tag.casefold()}
    new_aliases[tag] = alias
    sorted_aliases = dict(sorted(new_aliases.items(), key=lambda x: x[0].casefold()))
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

    prompt = f"""You are an expert developer taxonomist for techstacks.page.
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
        [LLMS_SH, "--chat", os.path.basename(chat_json_path), "--nohistory"],
        capture_output=True,
        text=True,
        cwd=SCRIPT_DIR,
        stdin=subprocess.DEVNULL,
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

    all_tech_path = os.path.join(dir_path, "data/all-technologies.json")

    def load_known_technologies():
        names = []
        if os.path.exists(all_tech_path):
            with open(all_tech_path) as f:
                names = sorted(json.load(f).keys(), key=str.casefold)
        tech_map = {k.casefold(): k for k in names}
        return names, tech_map

    all_tech_names, known_tech_map = load_known_technologies()
    alias_map_lower, wildcard_aliases = load_aliases(alias_path)

    print(f"\n==========================================")
    print(f" Review Queue: {len(reviews)} tag(s) pending review")
    print(f"==========================================")

    for item in list(reviews):
        tech = item.get("tag", "")
        post_ids = item.get("post_ids", [])
        reason = item.get("reason", "")

        # Check if the tag matches an exact alias, wildcard, or first-word prefix
        resolved, match_type = resolve_technology(tech, {}, known_tech_map, alias_map_lower, wildcard_aliases)
        if match_type in ("known", "alias", "wildcard", "prefix"):
            remove_from_blacklist(blacklist_path, tech)
            add_alias(alias_path, tech, resolved)
            apply_alias_to_posts(dir_path, tech, resolved)
            remove_from_review(review_path, tech)
            alias_map_lower, wildcard_aliases = load_aliases(alias_path)
            print(f"\n--- [Auto-Resolved] '{tech}' -> '{resolved}' (matched {match_type}) ---")
            print(f"Removed '{tech}' from review queue and blacklist.")
            continue

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
            print("  (TAB to autocomplete against existing technologies)")
            alias_to = input_with_autocomplete(f"Alias '{tech}' -> ", all_tech_names).strip()
            if not alias_to:
                print(f"No alias entered; '{tech}' skipped.")
            elif alias_to.casefold() == tech.casefold():
                print(f"Cannot alias '{tech}' to itself; skipped.")
            else:
                canonical_target = known_tech_map.get(alias_to.casefold(), alias_to)
                remove_from_blacklist(blacklist_path, tech)
                add_alias(alias_path, tech, canonical_target)
                apply_alias_to_posts(dir_path, tech, canonical_target)
                remove_from_review(review_path, tech)
                print(f"Added alias: '{tech}' -> '{canonical_target}' (removed from blacklist and review queue).")

        elif choice == "3":
            try:
                subprocess.run(
                    [os.path.join(dir_path, "create_technology.py"), tech],
                    cwd=dir_path, check=True
                )
                update_script = os.path.join(dir_path, "data/update.sh")
                if os.path.exists(update_script):
                    subprocess.run(["./update.sh"], cwd=os.path.join(dir_path, "data"), check=True)
                remove_from_blacklist(blacklist_path, tech)
                remove_from_review(review_path, tech)
                all_tech_names, known_tech_map = load_known_technologies()
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

    alias_map_lower, wildcard_aliases = load_aliases(alias_path)

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
            resolved, match_type = resolve_technology(tech, all_known, known_tech_map, alias_map_lower, wildcard_aliases)
            if match_type in ("wildcard", "prefix"):
                print(f"  [AUTO ALIAS] '{tech}' -> '{resolved}' (matched {match_type})")
            tech = resolved
            if tech in blacklist or tech.casefold() in blacklist_lower:
                continue
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
                alias_to = input_with_autocomplete(f"Alias '{tech}' -> ", sorted(all_known.keys(), key=str.casefold)).strip()
                if not alias_to:
                    print(f"No alias entered; '{tech}' skipped.")
                elif alias_to.casefold() == tech.casefold():
                    print(f"Cannot alias '{tech}' to itself; skipped.")
                else:
                    canonical_target = known_tech_map.get(alias_to.casefold(), alias_to)
                    add_alias(alias_path, tech, canonical_target)
                    print(f"Added alias: {tech} -> {canonical_target}")
                    apply_alias_to_posts(dir_path, tech, canonical_target)

            elif choice == "3":
                try:
                    subprocess.run(
                        [os.path.join(dir_path, "create_technology.py"), tech],
                        cwd=dir_path, check=True
                    )
                    update_script = os.path.join(dir_path, "data/update.sh")
                    if os.path.exists(update_script):
                        subprocess.run(["./update.sh"], cwd=os.path.join(dir_path, "data"), check=True)
                    all_known_path = os.path.join(dir_path, "data/all-technologies.json")
                    if os.path.exists(all_known_path):
                        with open(all_known_path) as f:
                            all_known = json.load(f)
                        known_tech_map = {k.casefold(): k for k in all_known.keys()}
                except Exception as e:
                    print(f"Error creating technology '{tech}': {e}", file=sys.stderr)

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

    alias_map_lower, wildcard_aliases = load_aliases(alias_path)

    for post_file in glob.glob(os.path.join(dir_path, "posts/*.json")):
        post_id = Path(post_file).stem
        with open(post_file) as f:
            post = json.load(f)

        techs = post.get("technologies", [])
        processed = []
        seen = set()
        for tech in techs:
            if not tech or not tech.strip() or tech in blacklist or tech.casefold() in blacklist_lower:
                continue
            resolved, _ = resolve_technology(tech, all_known, known_tech_map, alias_map_lower, wildcard_aliases)
            tech = resolved
            if tech in blacklist or tech.casefold() in blacklist_lower:
                continue
            if tech not in seen:
                processed.append(tech)
                seen.add(tech)

        if not processed:
            os.makedirs(SKIPPED_DIR, exist_ok=True)
            skipped_dest = os.path.join(SKIPPED_DIR, os.path.basename(post_file))
            shutil.move(post_file, skipped_dest)
            append_to_file(os.path.join(dir_path, "ids_completed.txt"), str(post_id))
            for sec_id in post.get("secondary_ids", []):
                append_to_file(os.path.join(dir_path, "ids_completed.txt"), str(sec_id))
            for rel in post.get("related_discussions", []):
                url = rel.get("url", "")
                m_hn = re.search(r"item\?id=(\d+)", url)
                if m_hn:
                    append_to_file(os.path.join(dir_path, "ids_completed.txt"), m_hn.group(1))
                m_red = re.search(r"/comments/([a-z0-9]+)", url)
                if m_red:
                    append_to_file(os.path.join(dir_path, "ids_completed.txt"), m_red.group(1))
            post_url = post.get("url", "")
            if post_url:
                append_to_file(os.path.join(dir_path, "urls_completed.txt"), post_url.rstrip("/"))
            print(f"Skipped {os.path.basename(post_file)} -> moved to done/skipped (no valid technologies remaining)")
        elif processed != techs:
            post["technologies"] = processed
            with open(post_file, "w") as f:
                json.dump(post, f, indent=4)


if __name__ == "__main__":
    main()
