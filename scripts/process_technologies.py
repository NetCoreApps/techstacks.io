#!/usr/bin/env python3
import json
import glob
import os
import subprocess
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blacklist", nargs="+", help="Add technologies to the blacklist")
    parser.add_argument("--alias", nargs=2, metavar=("NAME", "ALIAS"), help="Add a technology alias (NAME -> ALIAS)")
    args = parser.parse_args()

    dir_path = os.path.dirname(os.path.abspath(__file__))
    blacklist_path = os.path.join(dir_path, "data/blacklist-technologies.json")
    alias_path = os.path.join(dir_path, "data/alias-technologies.json")

    if args.alias:
        name, alias = args.alias
        with open(alias_path) as f:
            aliases = json.load(f)
        if name in aliases and aliases[name] == alias:
            print(f"Alias already exists: {name} -> {alias}")
        else:
            aliases[name] = alias
            sorted_aliases = dict(sorted(aliases.items(), key=lambda x: x[0].casefold()))
            with open(alias_path, "w") as f:
                json.dump(sorted_aliases, f, indent=2)
                f.write("\n")
            print(f"Added alias: {name} -> {alias}")
        return

    if args.blacklist:
        with open(blacklist_path) as f:
            blacklist_list = json.load(f)
        blacklist_set = set(blacklist_list)
        added = []
        for tech in args.blacklist:
            if tech not in blacklist_set:
                blacklist_list.append(tech)
                blacklist_set.add(tech)
                added.append(tech)
        if added:
            blacklist_list.sort(key=str.casefold)
            with open(blacklist_path, "w") as f:
                json.dump(blacklist_list, f, indent=2)
                f.write("\n")
            print(f"Added to blacklist: {', '.join(added)}")
        else:
            print("All specified technologies are already blacklisted.")
        return

    subprocess.run(["./update.sh"], cwd=os.path.join(dir_path, "data"), check=True)

    with open(blacklist_path) as f:
        blacklist = set(json.load(f))

    with open(alias_path) as f:
        aliases = json.load(f)

    with open(os.path.join(dir_path, "data/all-technologies.json")) as f:
        all_known = json.load(f)  # dict of {name: id}

    new_technologies = set()

    for post_file in glob.glob(os.path.join(dir_path, "posts/*.json")):
        with open(post_file) as f:
            post = json.load(f)

        techs = post.get("technologies", [])
        if not techs:
            continue

        # Remove empty strings, blacklisted, apply aliases, deduplicate
        processed = []
        seen = set()
        for tech in techs:
            if not tech or tech in blacklist:
                continue
            tech = aliases.get(tech, tech)
            if tech not in seen:
                processed.append(tech)
                seen.add(tech)

        # Track new technologies
        for i, tech in enumerate(processed):
            if tech not in all_known:
                # check if it exists ignoring case
                if not any(tech.lower() == known.lower() for known in all_known):
                    new_technologies.add(tech)
                else:
                    existing = next(known for known in all_known if tech.lower() == known.lower())
                    print(f"Technology '{tech}' already exists with different casing as '{existing}'")
                    processed[i] = existing

        # Remove posts with no technologies after processing
        if not processed:
            os.remove(post_file)
            print(f"Removed {os.path.basename(post_file)} (no technologies after processing)")
            continue

        # Update post if changed
        if processed != techs:
            post["technologies"] = processed
            with open(post_file, "w") as f:
                json.dump(post, f, indent=4)

    if new_technologies:
        sorted_new = sorted(new_technologies)
        print(f"\nFound {len(sorted_new)} new technologies:")
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
                with open(blacklist_path) as f:
                    blacklist_list = json.load(f)
                if tech not in set(blacklist_list):
                    blacklist_list.append(tech)
                    blacklist_list.sort(key=str.casefold)
                    with open(blacklist_path, "w") as f:
                        json.dump(blacklist_list, f, indent=2)
                        f.write("\n")
                    print(f"Added to blacklist: {tech}")
                else:
                    print(f"Already blacklisted: {tech}")

            elif choice == "2":
                alias_to = input(f"Alias '{tech}' -> ").strip()
                if alias_to:
                    with open(alias_path) as f:
                        alias_data = json.load(f)
                    alias_data[tech] = alias_to
                    sorted_aliases = dict(sorted(alias_data.items(), key=lambda x: x[0].casefold()))
                    with open(alias_path, "w") as f:
                        json.dump(sorted_aliases, f, indent=2)
                        f.write("\n")
                    print(f"Added alias: {tech} -> {alias_to}")

            elif choice == "3":
                subprocess.run(
                    [os.path.join(dir_path, "create_technology.py"), tech],
                    cwd=dir_path, check=True
                )

            else:
                print(f"Skipped: {tech}")
    else:
        print("No new technologies found.")

if __name__ == "__main__":
    main()
