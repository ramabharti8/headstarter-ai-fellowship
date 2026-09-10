from __future__ import annotations

import pytest

from app.reviewer import (
    ReviewOutcome,
    _parse_outcome,
    detect_language,
    heuristic_review,
)

_LANG_SAMPLES = {
    "python": "from os import path\n\n\ndef main():\n    print('hi')\n",
    "javascript": "const x = 1;\nfunction go() { console.log(x); }\n",
    "typescript": "interface User { name: string }\nconst u: User = { name: 'a' };\n",
    "go": 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println(1) }\n',
    "rust": 'fn main() {\n    let mut x = 1;\n    println!("{}", x);\n}\n',
    "java": "public class A {\n  public static void main(String[] a) {\n"
    "    System.out.println(1);\n  }\n}\n",
    "csharp": "using System;\n\nclass C {\n  static void Main() { Console.WriteLine(1); }\n}\n",  # noqa: E501
    "cpp": "#include <iostream>\n\nint main() { std::cout << 1; }\n",
    "ruby": "require 'json'\n\ndef go\n  puts 'hi'\nend\n",
    "php": "<?php\n$x = 1;\necho $x;\n",
    "sql": "SELECT id, name FROM users WHERE id = 1;\n",
    "bash": "#!/bin/bash\nfor f in *; do echo $f; done\n",
}


@pytest.mark.parametrize("lang,src", list(_LANG_SAMPLES.items()))
def test_detect_language_covers_common_languages(lang: str, src: str):
    assert detect_language(src) == lang


def test_detect_language_unknown():
    assert detect_language("the quick brown fox jumps over the lazy dog") == "unknown"


def test_detect_language_shebang_beats_body():
    assert detect_language("#!/usr/bin/env python3\nx = eval(1)\n") == "python"


def test_detect_language_from_diff_header():
    diff = "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-a\n+b\n"
    assert detect_language(diff) == "typescript"


def test_heuristic_flags_eval_in_unknown_language():
    out = heuristic_review("result = eval(user_input)\n", "unknown", is_diff=False)
    assert any(i.title == "Use of eval/exec" for i in out.issues)


EVAL_CODE = (
    "def f(x):\n"
    "    try:\n"
    "        return eval(x)\n"
    "    except:\n"
    "        return None\n"
)


def test_heuristic_flags_eval_and_bare_except():
    out = heuristic_review(EVAL_CODE, "python", is_diff=False)
    assert isinstance(out, ReviewOutcome)
    titles = {i.title for i in out.issues}
    assert "Use of eval/exec" in titles
    assert "Bare except" in titles
    # eval is critical -> blocks
    assert out.verdict == "request_changes"
    assert out.score < 7


def test_heuristic_clean_code_approves():
    code = '"""A tiny module."""\n\n\ndef add(a: int, b: int) -> int:\n    return a + b\n'
    out = heuristic_review(code, "python", is_diff=False)
    assert out.verdict in {"approve", "comment"}
    assert not any(i.severity in {"critical", "high"} for i in out.issues)


def test_heuristic_detects_hardcoded_secret():
    out = heuristic_review('API_KEY = "abcdef123456"\n', "python", is_diff=False)
    assert any(i.category == "security" for i in out.issues)


def test_parse_outcome_recovers_from_wrapped_json():
    raw = (
        'Here you go:\n```json\n{"summary": "ok", "score": 7, "verdict": "approve", '
        '"issues": [], "improvements": [], "refactored_code": ""}\n```'
    )
    out = _parse_outcome(raw, fallback_language="python")
    assert out.summary == "ok"
    assert out.score == 7.0
    assert out.verdict == "approve"


def test_parse_outcome_normalises_bad_severity_and_sorts():
    raw = """{
      "summary": "s", "score": 3, "verdict": "",
      "issues": [
        {"severity": "banana", "category": "x", "title": "A", "detail": "d"},
        {"severity": "critical", "category": "bug", "title": "B", "detail": "d"}
      ],
      "improvements": [], "refactored_code": ""
    }"""
    out = _parse_outcome(raw, fallback_language="python")
    assert out.issues[0].severity == "critical"  # sorted first
    assert out.issues[1].severity == "info"  # "banana" normalised
    assert out.verdict == "request_changes"  # derived from a blocking issue


def test_parse_outcome_empty_on_garbage():
    out = _parse_outcome("not json at all", fallback_language="go")
    assert out.language == "go"
    assert out.score == 0.0
    assert out.issues == []
