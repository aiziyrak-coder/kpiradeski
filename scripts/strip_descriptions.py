from pathlib import Path
import re

root = Path(r"E:\KPIRadeski\apps\web\src\app")
for p in root.rglob("page.tsx"):
    t = p.read_text(encoding="utf-8")
    orig = t
    t = re.sub(r"\n\s*eyebrow=\{[^}]+\}", "", t)
    t = re.sub(r'\n\s*eyebrow="[^"]*"', "", t)
    t = re.sub(r"\n\s*eyebrow='[^']*'", "", t)
    t = re.sub(r'\n\s*description="[^"]*"', "", t)
    t = re.sub(r"\n\s*description='[^']*'", "", t)
    t = re.sub(r"\n\s*description=\{`[^`]*`\}", "", t)
    t = re.sub(r"\n\s*description=\{t\([^)]+\)\}", "", t)
    if t != orig:
        p.write_text(t, encoding="utf-8")
        print("cleaned", p.relative_to(root))
