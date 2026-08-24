from pathlib import Path
import re

p = Path(r"E:\KPIRadeski\apps\api\prisma\kpi-catalog.seed.ts")
t = p.read_text(encoding="utf-8")

if "frequency?:" not in t:
    t = t.replace(
        "proofRequired?: boolean;\n};",
        "proofRequired?: boolean;\n  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';\n};",
    )

freq = {
    "clinic_inspection": "DAILY",
    "reception": "DAILY",
    "calls_new": "DAILY",
    "calls_repeat": "DAILY",
    "calls_missed": "DAILY",
    "reviews": "DAILY",
    "uniform": "DAILY",
    "warehouse": "WEEKLY",
    "seo": "WEEKLY",
    "instagram": "WEEKLY",
    "telegram_youtube": "WEEKLY",
    "ads_tv": "MONTHLY",
    "flyers": "MONTHLY",
    "doctor_patients": "DAILY",
}

for k, f in freq.items():
    needle = f"key: '{k}',"
    idx = t.find(needle)
    if idx < 0:
        continue
    # object chunk until next top-level-ish closing at indent 2
    end = t.find("\n  },", idx)
    if end < 0:
        end = idx + 600
    chunk = t[idx:end]
    if "frequency:" in chunk:
        continue
    if "proofRequired: true" in chunk:
        new_chunk = chunk.replace(
            "proofRequired: true", f"proofRequired: true,\n    frequency: '{f}'", 1
        )
    elif "proofRequired: false" in chunk:
        new_chunk = chunk.replace(
            "proofRequired: false", f"proofRequired: false,\n    frequency: '{f}'", 1
        )
    else:
        m = re.search(r"sortOrder: \d+,", chunk)
        if not m:
            continue
        new_chunk = chunk.replace(m.group(0), m.group(0) + f"\n    frequency: '{f}',", 1)
    t = t[:idx] + new_chunk + t[end:]

# children inherit: set frequency on nested by parent prefix
# clinic.* -> DAILY, reception.* -> DAILY, uniform.* -> DAILY
for prefix, f in [
    ("clinic.", "DAILY"),
    ("reception.", "DAILY"),
    ("uniform.", "DAILY"),
]:
    for m in re.finditer(rf"key: '({re.escape(prefix)}[^']+)',", t):
        k = m.group(1)
        idx = m.start()
        end = t.find("\n  },", idx)
        if end < 0:
            continue
        chunk = t[idx:end]
        if "frequency:" in chunk:
            continue
        if "proofRequired:" in chunk:
            new_chunk = re.sub(
                r"(proofRequired: (?:true|false),?)",
                rf"\1\n    frequency: '{f}',",
                chunk,
                count=1,
            )
        else:
            new_chunk = re.sub(
                r"(sortOrder: \d+,)",
                rf"\1\n    frequency: '{f}',",
                chunk,
                count=1,
            )
        t = t[:idx] + new_chunk + t[end:]

p.write_text(t, encoding="utf-8")
print("frequency count", t.count("frequency:"))
