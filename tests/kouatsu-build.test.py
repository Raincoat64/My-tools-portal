"""生成器の衝突検査を、製品ファイルを書き換えずに確認する。"""
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("kouatsu_builder", ROOT / "scripts/build_kouatsu.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildChecks(unittest.TestCase):
    def test_current_source(self):
        self.assertIn('"use strict"', builder.build_script_body())

    def test_collision_kinds(self):
        for declaration in ("function duplicate() {}", "const duplicate = 1;",
                            "let duplicate = 1;", "class duplicate {}",
                            "async function duplicate() {}"):
            with self.subTest(declaration=declaration):
                with self.assertRaisesRegex(ValueError, r"duplicate.*first.js.*second.js"):
                    builder.check_top_level_names([("first.js", declaration), ("second.js", declaration)])

    def test_same_file_and_mixed_kinds(self):
        with self.assertRaisesRegex(ValueError, r"collision.*same.js.*same.js"):
            builder.check_top_level_names([("same.js", "const collision=1; function collision() {}")])

    def test_ignore_local_names_and_literals(self):
        source = """
        const one = "function duplicate() {}", two = /{function duplicate}/;
        const text = TICKtext DOLLAR{(() => { const duplicate = TICKnested DOLLAR{1}TICK; return duplicate; })()}TICK;
        function outer() { const duplicate = 1; function inner() {} }
        function next() { const duplicate = 2; function inner() {} }
        const named = function duplicate() {};
        // function duplicate() {}
        /* const duplicate = 1; */
        class Good { method() { let duplicate; } }
        """.replace("TICK", chr(96)).replace("DOLLAR", "$")
        self.assertEqual(builder.top_level_names(source), ["one", "two", "text", "outer", "next", "named", "Good"])

    def test_build_and_check_both_reject_injected_source(self):
        original_read = Path.read_text
        def read(path, *args, **kwargs):
            text = original_read(path, *args, **kwargs)
            if path.name == "render.js":
                text += "\nfunction buildChapters() {}\n"
            return text
        for check in (False, True):
            with self.subTest(check=check):
                with patch.object(Path, "read_text", read), patch.object(sys, "argv", ["build_kouatsu.py"] + (["--check"] if check else [])):
                    with self.assertRaisesRegex(ValueError, r"buildChapters.*lawTree.js.*render.js"):
                        builder.main()

    def test_destructuring(self):
        source = "const { key: renamed, short, deep: [nested = 3], ...rest } = obj, [first, , ...remaining] = list;"
        self.assertEqual(builder.top_level_names(source), ["renamed", "short", "nested", "rest", "first", "remaining"])
        with self.assertRaisesRegex(ValueError, "renamed.*a.js.*b.js"):
            builder.check_top_level_names([("a.js", source), ("b.js", "let renamed;")])

    def test_unicode_identifier(self):
        with self.assertRaisesRegex(ValueError, "名前.*a.js.*b.js"):
            builder.check_top_level_names([("a.js", "const 名前 = 1;"), ("b.js", "function 名前() {}")])

    def test_exported_class(self):
        self.assertEqual(builder.top_level_names(builder.strip_module_syntax("export class Example {}\n")), ["Example"])


if __name__ == "__main__":
    unittest.main()
