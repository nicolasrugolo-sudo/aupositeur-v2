#!/usr/bin/env python3
"""Normalize the featured reflection after a content commit.

Operates only on tracked Markdown files in the supplied content directory.
The changed-file list comes from the workflow's HEAD^..HEAD diff.
"""
from pathlib import Path
import re
import subprocess

FEATURED = re.compile(r"(?m)^featured:\s*true\s*$")


def normalize(root: Path, changed: list[str]) -> tuple[str | None, list[str]]:
    root = root.resolve()
    candidates = []
    for filename in changed:
        path = Path(filename)
        if path.suffix != ".md":
            continue
        try:
            resolved = path.resolve()
            resolved.relative_to(root)
        except ValueError:
            continue
        if resolved.is_file() and FEATURED.search(resolved.read_text(encoding="utf-8")):
            candidates.append(resolved)

    if not candidates:
        return None, []

    winner = sorted(set(candidates), key=lambda path: path.as_posix())[-1]
    updated = []
    for path in sorted(root.glob("*.md")):
        if path.resolve() == winner:
            continue
        before = path.read_text(encoding="utf-8")
        after = FEATURED.sub("featured: false", before)
        if after != before:
            path.write_text(after, encoding="utf-8", newline="\n")
            updated.append(path.name)
    return winner.name, updated


if __name__ == "__main__":
    folder = Path("src/content/reflexions")
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", "HEAD^", "HEAD", "--", str(folder)],
        text=True,
    ).splitlines()
    winner, updated = normalize(folder, changed)
    print(f"Selected: {winner or 'none'}; normalized: {len(updated)}")
    for filename in updated:
        print(f"Unfeatured: {filename}")
