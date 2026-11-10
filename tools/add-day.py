#!/usr/bin/env python3
"""Update Marsh's Dog Sanctuary for a new day. Edits data/sanctuary.json; nothing else changes.

Typical day (run from the sanctuary-site folder):
  python3 tools/add-day.py --day 2 --title "The first dogs move in" \
      --text "42 new dogs, and the town opened." \
      --reel https://www.instagram.com/reel/XXXX/ \
      --dogs new-dogs.csv --build supermarket --build library

new-dogs.csv has one dog per line: handle,breed   (a header line "handle,breed" is fine)
  @sam.jones,golden retriever
  pip_22,sausage dog
Followers already in the sanctuary keep their number; a new breed just replaces the old one.

Other jobs:
  --remove @name           opt-out: their dog goes home (repeatable)
  --collar @name=rainbow   paid upgrade (rainbow or red). Gold (first 100) and silver (up to 1,000) are earned by join order, not set here.
  --hat @name=party        paid upgrade (party, crown, tophat, shades, wizard, chef, bobble, cowboy, or none)
  --shop on|off            show or hide the shop
  --link rainbow=https://buy.stripe.com/...   set a shop item's payment link
  --adsense ca-pub-123...  turn ads on (needs your own domain and AdSense approval)
  --dry-run                show what would change without saving
"""
import argparse, csv, datetime, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "sanctuary.json"
MODELS = ["golden", "lab", "chocolate", "dalmatian", "dachshund", "corgi", "husky", "pug", "poodle", "shepherd", "beagle", "chihuahua"]
BUILDS = ["supermarket", "library", "gym", "cinema"]  # what the 3D kit can draw today; new builds go in lowpoly-town.js
HATS = ["party", "crown", "tophat", "shades", "wizard", "chef", "bobble", "cowboy"]
# Words in a comment -> the closest 3D model. First match wins, so specific names come first.
ALIASES = [
    ("chocolate lab", "chocolate"), ("choc lab", "chocolate"), ("golden", "golden"), ("retriever", "golden"), ("goldendoodle", "poodle"),
    ("doodle", "poodle"), ("cockapoo", "poodle"), ("cavapoo", "poodle"), ("bichon", "poodle"), ("maltese", "poodle"), ("poodle", "poodle"), ("samoyed", "poodle"),
    ("lab", "lab"), ("black", "lab"), ("rottweiler", "lab"), ("doberman", "lab"), ("cane corso", "lab"), ("great dane", "lab"), ("greyhound", "lab"), ("whippet", "lab"),
    ("dalmatian", "dalmatian"), ("sausage", "dachshund"), ("dachshund", "dachshund"), ("weiner", "dachshund"), ("wiener", "dachshund"), ("doxie", "dachshund"),
    ("corgi", "corgi"), ("shiba", "corgi"), ("husky", "husky"), ("malamute", "husky"), ("wolf", "husky"),
    ("pug", "pug"), ("frenchie", "pug"), ("french bulldog", "pug"), ("bulldog", "pug"), ("boxer", "pug"), ("shih tzu", "pug"), ("staff", "pug"), ("pit", "pug"),
    ("shepherd", "shepherd"), ("alsatian", "shepherd"), ("malinois", "shepherd"), ("collie", "shepherd"), ("aussie", "shepherd"),
    ("beagle", "beagle"), ("jack russell", "beagle"), ("spaniel", "beagle"), ("springer", "beagle"), ("basset", "beagle"), ("foxhound", "beagle"), ("terrier", "beagle"),
    ("chihuahua", "chihuahua"), ("pomeranian", "chihuahua"), ("yorkie", "chihuahua"), ("yorkshire", "chihuahua"), ("papillon", "chihuahua"), ("min pin", "chihuahua"),
]


def handle_of(s, soft=False):
    h = s.strip().lstrip("@").strip().lower()
    if not re.fullmatch(r"[a-z0-9._]{1,30}", h):
        if soft:
            return None
        sys.exit(f"Not an Instagram name: {s!r}")
    return h


def model_of(breed):
    b = breed.lower()
    for word, m in ALIASES:
        if word in b:
            return m
    return "golden"


def pairs(items, allowed=None):
    out = []
    for it in items or []:
        if "=" not in it:
            sys.exit(f"Use name=value, got {it!r}")
        k, v = it.split("=", 1)
        v = v.strip().lower()
        if allowed and v not in allowed:
            sys.exit(f"{v!r} must be one of {', '.join(allowed)}")
        out.append((k, v))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--day", type=int, help="the new day number (adds a log entry)")
    ap.add_argument("--title", help="log title for the day")
    ap.add_argument("--text", default="", help="one or two lines for the log")
    ap.add_argument("--reel", default="", help="link to the day's reel")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--dogs", help="CSV of handle,breed")
    ap.add_argument("--build", choices=BUILDS, action="append", default=[], help="what got built today (repeatable)")
    ap.add_argument("--remove", action="append", default=[])
    ap.add_argument("--collar", action="append", default=[])
    ap.add_argument("--hat", action="append", default=[])
    ap.add_argument("--shop", choices=["on", "off"])
    ap.add_argument("--link", action="append", default=[])
    ap.add_argument("--adsense")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    data = json.loads(DATA.read_text())
    dogs = {d["handle"]: d for d in data["dogs"]}
    day = a.day or data["day"]
    notes = []

    if a.day:
        if a.day < data["day"]:
            sys.exit(f"Day {a.day} is before the current day {data['day']}.")
        data["day"] = a.day
        if not a.title:
            sys.exit("--day needs a --title for the log.")
        data["log"] = [l for l in data["log"] if l["day"] != a.day]
        data["log"].append({"day": a.day, "date": a.date, "title": a.title, "text": a.text, "reel": a.reel})
        notes.append(f"Day {a.day} log: {a.title}")
    data["updated"] = a.date

    if a.dogs:
        added = changed = 0; skipped = []
        nxt = max([d["n"] for d in data["dogs"]] + [0]) + 1
        with open(a.dogs, newline="", encoding="utf-8-sig") as f:
            for row in csv.reader(f):
                if not row or not any(c.strip() for c in row) or row[0].strip().lower() == "handle":
                    continue
                h = handle_of(row[0], soft=True)
                if not h:  # a typo on one line shouldn't stop the whole day's update
                    skipped.append(row[0].strip() or "(no name)"); continue
                breed = (row[1] if len(row) > 1 else "").strip() or "Golden retriever"
                breed = breed[:40][0].upper() + breed[:40][1:]
                d = dogs.get(h)
                if d and not d.get("removed"):
                    if d["breed"].lower() != breed.lower():
                        d["breed"], d["model"] = breed, model_of(breed); changed += 1
                    continue
                if d and d.get("removed"):
                    d.pop("removed"); d.update(breed=breed, model=model_of(breed)); changed += 1
                    continue
                dogs[h] = {"handle": h, "breed": breed, "model": model_of(breed), "n": nxt, "day": day}
                nxt += 1; added += 1
        notes.append(f"{added} new dogs, {changed} changed breed")
        if skipped:
            notes.append(f"SKIPPED {len(skipped)} line(s) without a valid Instagram name: {', '.join(skipped)}")

    for h in a.remove:
        h = handle_of(h)
        if h in dogs:
            dogs[h]["removed"] = True; notes.append(f"removed @{h}")
        else:
            notes.append(f"@{h} wasn't in the sanctuary")
    for h, v in pairs(a.collar, ["rainbow", "red"]):
        h = handle_of(h)
        if h not in dogs: sys.exit(f"No dog for @{h}")
        if v == "red": dogs[h].pop("collar", None)
        else: dogs[h]["collar"] = v
        notes.append(f"@{h} collar: {v}")
    for h, v in pairs(a.hat, HATS + ["none"]):
        h = handle_of(h)
        if h not in dogs: sys.exit(f"No dog for @{h}")
        if v == "none": dogs[h].pop("hat", None)
        else: dogs[h]["hat"] = v
        notes.append(f"@{h} hat: {v}")

    for bt in a.build:
        if any(b["type"] == bt for b in data["builds"]):
            notes.append(f"{bt} was already built")
        else:
            used = {b["slot"] for b in data["builds"]}
            free = [s for s in range(8) if s not in used]
            if not free: sys.exit("All eight town plots are full. Add more SLOTS in lowpoly-town.js first.")
            data["builds"].append({"type": bt, "day": day, "slot": free[0]})
            notes.append(f"built the {bt}")

    if a.shop:
        data["shop"]["enabled"] = a.shop == "on"; notes.append(f"shop {a.shop}")
    for k, url in pairs(a.link):
        item = next((i for i in data["shop"]["items"] if i["id"] == k), None)
        if not item: sys.exit(f"No shop item {k!r}")
        if not url.startswith("https://"): sys.exit(f"Payment links must start with https:// ({url!r})")
        item["link"] = url; item.pop("soon", None); notes.append(f"shop link set for {k} (now on sale)")
    if a.adsense:
        data["ads"]["adsenseClient"] = a.adsense; notes.append("ads on")

    data["dogs"] = sorted(dogs.values(), key=lambda d: d["n"])
    live = [d for d in data["dogs"] if not d.get("removed")]
    print("\n".join(notes) or "Nothing to change.")
    g, sv = data["goldCollars"], data.get("silverCollars", 1000)
    print(f"Day {data['day']}: {len(live)} dogs, {sum(d['n'] <= g for d in live)}/{g} gold collars, {sum(g < d['n'] <= sv for d in live)}/{sv - g} silver, builds: {', '.join(b['type'] for b in data['builds']) or 'none'}")
    if a.dry_run:
        print("(dry run, nothing saved)"); return
    DATA.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"Saved {DATA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
