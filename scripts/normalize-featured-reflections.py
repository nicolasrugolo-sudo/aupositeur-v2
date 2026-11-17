#!/usr/bin/env python3
"""Normalize the featured reflection after a content commit.

Operates only on tracked Markdown files in the supplied content directory.
The changed-file list comes from the workflow's HEAD^..HEAD diff.
"""
from pathlib import Path
import re
import subprocess

FRONTMATTER = re.compile(rb"\A(?:\xef\xbb\xbf)?---[ \t]*\r?\n(.*?)^---[ \t]*(?:\r?\n|$)", re.MULTILINE | re.DOTALL)
FEATURED = re.compile(rb"^featured:[ \t]*(true)(?=[ \t]*(?:#[^\r\n]*)?\r?$)", re.MULTILINE)
DRAFT = re.compile(rb"^draft:[ \t]*true(?=[ \t]*(?:#[^\r\n]*)?\r?$)", re.MULTILINE)


def featured_flag(data: bytes) -> tuple[int, int] | None:
    header = FRONTMATTER.match(data)
    if not header or DRAFT.search(header[1]):
        return None
    flag = FEATURED.search(header[1])
    if not flag:
        return None
    start, end = flag.span(1)
    return header.start(1) + start, header.start(1) + end


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
        if resolved.parent == root and resolved.is_file() and featured_flag(resolved.read_bytes()):
            candidates.append(resolved)

    if not candidates:
        return None, []

    winner = sorted(set(candidates), key=lambda path: path.as_posix())[-1]
    updated = []
    for path in sorted(root.glob("*.md")):
        if path.is_symlink() or path.resolve() == winner or not path.is_file():
            continue
        before = path.read_bytes()
        flag = featured_flag(before)
        if flag:
            start, end = flag
            path.write_bytes(before[:start] + b"false" + before[end:])
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
