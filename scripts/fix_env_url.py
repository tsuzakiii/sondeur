import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from pathlib import Path

p = Path("C:/ClaudeCode/sondeur/.env.local")
lines = p.read_text(encoding="utf-8").splitlines()
out = []
for line in lines:
    if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
        url = line.split("=", 1)[1].strip()
        # https://xxxx.supabase.co までに切り詰める
        idx = url.find(".supabase.co")
        if idx != -1:
            url = url[: idx + len(".supabase.co")]
        out.append("NEXT_PUBLIC_SUPABASE_URL=" + url)
    else:
        out.append(line)
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("fixed: NEXT_PUBLIC_SUPABASE_URL=" + [l for l in out if l.startswith("NEXT_PUBLIC_SUPABASE_URL=")][0].split("=", 1)[1])
