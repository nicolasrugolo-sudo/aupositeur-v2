#!/usr/bin/env python3
"""Regression tests: no edits to real poems, reflections, or production."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("normalize-featured-reflections.py")
spec = importlib.util.spec_from_file_location("featured_reflections", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FeaturedReflectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "src/content/reflexions"
        self.root.mkdir(parents=True)

    def add(self, name, featured):
        path = self.root / name
        path.write_text(
            f"---\ntitle: Test {name}\nfeatured: {str(featured).lower()}\n---\nTexte conservé.\n",
            encoding="utf-8",
        )
        return path

    def test_two_promotions_leave_one(self):
        a = self.add("a.md", True)
        b = self.add("b.md", True)
        c = self.add("c.md", True)
        winner, changed = module.normalize(self.root, [str(a), str(b)])
        self.assertEqual(winner, "b.md")
        self.assertEqual(changed, ["a.md", "c.md"])
        self.assertIn("featured: true", b.read_text(encoding="utf-8"))
        for path in (a, c):
            self.assertIn("featured: false", path.read_text(encoding="utf-8"))
            self.assertIn("Texte conservé.", path.read_text(encoding="utf-8"))

    def test_no_promotion_makes_no_changes(self):
        a = self.add("a.md", True)
        b = self.add("b.md", False)
        before = a.read_bytes()
        self.assertEqual(module.normalize(self.root, [str(b)]), (None, []))
        self.assertEqual(a.read_bytes(), before)

    def test_one_promotion_is_idempotent(self):
        a = self.add("a.md", True)
        b = self.add("b.md", True)
        self.assertEqual(module.normalize(self.root, [str(a)]), ("a.md", ["b.md"]))
        self.assertEqual(module.normalize(self.root, [str(a)]), ("a.md", []))

    def test_outside_paths_are_ignored(self):
        a = self.add("a.md", True)
        other = Path(self.temp.name) / "outside.md"
        other.write_text("featured: true\n", encoding="utf-8")
        self.assertEqual(module.normalize(self.root, [str(other)]), (None, []))
        self.assertIn("featured: true", a.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
