# -*- coding: utf-8 -*-
"""Compare uz.ts / ru.ts keys and find missing t() usages."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UZ = ROOT / "apps/web/src/locales/uz.ts"
RU = ROOT / "apps/web/src/locales/ru.ts"
SRC = ROOT / "apps/web/src"


def parse_ts_object(text: str) -> dict:
    # Match `export const uz = {` or `export const ru: LocaleDict = {`
    m = re.search(r"export const \w+(?:\s*:\s*\w+)?\s*=\s*(\{)", text, re.S)
    if not m:
        raise SystemExit("no export object")
    start = m.start(1)
    i = start
    n = len(text)
    depth = 0
    in_str = None
    esc = False
    end = None
    while i < n:
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == in_str:
                in_str = None
        else:
            if c in ("'", '"', "`"):
                in_str = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        i += 1
    if end is None:
        raise SystemExit("unbalanced")
    obj = text[start:end]

    # strip trailing commas and convert keys/strings to JSON
    def to_json(s: str) -> str:
        out = []
        i = 0
        n = len(s)
        in_str = None
        esc = False
        while i < n:
            c = s[i]
            if in_str:
                out.append(c)
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == in_str:
                    in_str = None
                i += 1
                continue
            if c in ("'", '"'):
                # normalize to double quotes
                q = c
                out.append('"')
                i += 1
                while i < n:
                    ch = s[i]
                    if ch == "\\" and i + 1 < n:
                        nxt = s[i + 1]
                        if nxt == q:
                            out.append(q)
                            i += 2
                            continue
                        if nxt == "\\":
                            out.append("\\\\")
                            i += 2
                            continue
                        if nxt == "n":
                            out.append("\\n")
                            i += 2
                            continue
                        if nxt == "t":
                            out.append("\\t")
                            i += 2
                            continue
                        out.append(ch)
                        i += 1
                        continue
                    if ch == q:
                        out.append('"')
                        i += 1
                        break
                    if ch == '"':
                        out.append('\\"')
                        i += 1
                        continue
                    if ch == "\n":
                        out.append("\\n")
                        i += 1
                        continue
                    out.append(ch)
                    i += 1
                continue
            if c == "`":
                # template not expected
                out.append('"')
                i += 1
                while i < n and s[i] != "`":
                    ch = s[i]
                    if ch == '"':
                        out.append('\\"')
                    elif ch == "\n":
                        out.append("\\n")
                    else:
                        out.append(ch)
                    i += 1
                out.append('"')
                i += 1
                continue
            # unquoted key
            if c.isalpha() or c in "_$":
                j = i
                while i < n and (s[i].isalnum() or s[i] in "_$"):
                    i += 1
                ident = s[j:i]
                # look ahead for :
                k = i
                while k < n and s[k] in " \t\n\r":
                    k += 1
                if k < n and s[k] == ":":
                    out.append(f'"{ident}"')
                else:
                    out.append(ident)
                continue
            # trailing commas before } or ]
            if c == ",":
                k = i + 1
                while k < n and s[k] in " \t\n\r":
                    k += 1
                if k < n and s[k] in "}]":
                    i += 1
                    continue
            # // comments
            if c == "/" and i + 1 < n and s[i + 1] == "/":
                while i < n and s[i] != "\n":
                    i += 1
                continue
            # /* */
            if c == "/" and i + 1 < n and s[i + 1] == "*":
                i += 2
                while i + 1 < n and not (s[i] == "*" and s[i + 1] == "/"):
                    i += 1
                i += 2
                continue
            out.append(c)
            i += 1
        return "".join(out)

    js = to_json(obj)
    try:
        return json.loads(js)
    except json.JSONDecodeError as e:
        Path("_locale_debug.json").write_text(js[: e.pos + 200], encoding="utf-8")
        raise


def flatten(d: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in d.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, path))
        else:
            out[path] = str(v)
    return out


def collect_t_keys() -> set[str]:
    keys: set[str] = set()
    for p in SRC.rglob("*.tsx"):
        text = p.read_text(encoding="utf-8")
        for m in re.finditer(r"""\bt\(\s*['\"]([^'\"]+)['\"]""", text):
            keys.add(m.group(1))
    for p in SRC.rglob("*.ts"):
        if "locales" in p.parts:
            continue
        text = p.read_text(encoding="utf-8")
        for m in re.finditer(r"""\bt\(\s*['\"]([^'\"]+)['\"]""", text):
            keys.add(m.group(1))
    return keys


def main() -> None:
    uz = flatten(parse_ts_object(UZ.read_text(encoding="utf-8")))
    ru = flatten(parse_ts_object(RU.read_text(encoding="utf-8")))
    used = collect_t_keys()

    only_uz = sorted(set(uz) - set(ru))
    only_ru = sorted(set(ru) - set(uz))
    missing_in_uz = sorted(k for k in used if k not in uz)
    missing_in_ru = sorted(k for k in used if k not in ru)

    same = []
    for k in sorted(set(uz) & set(ru)):
        if uz[k] == ru[k] and len(uz[k]) > 1:
            same.append((k, uz[k]))

    report = {
        "uz_count": len(uz),
        "ru_count": len(ru),
        "used_t_keys": len(used),
        "only_uz": only_uz,
        "only_ru": only_ru,
        "missing_in_uz": missing_in_uz,
        "missing_in_ru": missing_in_ru,
        "identical": same,
    }
    out = ROOT / "_locale_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"uz={len(uz)} ru={len(ru)} used={len(used)} "
        f"only_uz={len(only_uz)} only_ru={len(only_ru)} "
        f"miss_uz={len(missing_in_uz)} miss_ru={len(missing_in_ru)} same={len(same)}"
    )
    print("wrote", out)


if __name__ == "__main__":
    main()
