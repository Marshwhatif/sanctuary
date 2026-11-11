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
  --collar @name=rainbow   paid upgrade (rainbow or red). Gold (first 100) and silver (the next 500) are earned by join order, not set here.
  --hat @name=party        paid upgrade (party, crown, tophat, shades, wizard, chef, bobble, cowboy, propeller, or none)
  --shop on|off            show or hide the shop
  --link rainbow=https://buy.stripe.com/...   set a shop item's payment link
  --followers 833          the follower count shown as the dog total
  --reel-for 1=https://... set the reel link on an earlier day
  --dry-run                show what would change without saving
  --out data/preview.json  save to the preview file instead: marshtown.com/?demo shows it, the live page is untouched
"""
import argparse, csv, datetime, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "sanctuary.json"
# The 3D breeds in lib/lowpoly-breeds.js (LPB). Keep this list in step with that file.
MODELS = ["golden", "lab", "shepherd", "malinois", "husky", "malamute", "pitbull", "staffy", "bully", "dachshund", "corgi", "chihuahua",
          "pomeranian", "doberman", "rottweiler", "canecorso", "greatdane", "dalmatian", "pug", "shihtzu", "poodle", "doodle", "beagle",
          "stbernard", "bernese", "newfoundland", "pyrenees", "tibetanmastiff", "mastiff", "dogo", "kangal", "borzoi", "whippet",
          "wolfhound", "shiba", "akita", "samoyed", "wolfdog", "bordercollie", "sheltie", "aussie", "cavalier", "cocker", "springer",
          "jackrussell", "yorkie", "boston", "frenchie", "bulldog", "boxer", "maltese", "bichon", "pekingese", "papillon", "spitz",
          "chow", "leonberger", "airedale", "scottie", "westie", "norwich", "otterhound", "bloodhound", "coonhound", "pointer",
          "vizsla", "setter", "heeler", "griffon", "norfolk", "schnauzer", "xolo", "oes", "mutt"]
BUILDS = ["supermarket", "library", "gym", "cinema", "waterpark"]  # what the 3D kit can draw today; new builds go in lowpoly-town.js
HATS = ["party", "crown", "tophat", "shades", "wizard", "chef", "bobble", "cowboy", "propeller"]
# Words in a comment -> (3D breed, extra look words). The breed named FIRST in the comment wins (so "pomeranian chihuahua
# mix" is a Pomeranian); colour words never choose the breed, they only recolour it (see look_of).
ALIASES = [
    ("golden retriever", "golden", ""), ("retriever", "golden", ""), ("golden doodle", "doodle", "golden"), ("goldendoodle", "doodle", "golden"),
    ("golden poodle", "doodle", "golden"), ("labradoodle", "doodle", "cream"), ("bernedoodle", "doodle", "black white brown"),
    ("cockapoo", "doodle", "mini"), ("cavapoo", "doodle", "mini"), ("maltipoo", "doodle", "mini white"), ("yorkiepoo", "doodle", "mini"),
    ("poochon", "bichon", "cream"), ("doodle", "doodle", ""), ("poodle", "poodle", ""), ("pudel", "poodle", ""),
    ("nova scotia", "golden", "red"), ("duck toll", "golden", "red"),
    ("labrador", "lab", ""), ("lablador", "lab", ""), ("borador", "lab", "black"), ("boxador", "lab", "brown"), ("bassador", "lab", ""), ("lab", "lab", ""),
    ("german shepherd", "shepherd", ""), ("german sheperd", "shepherd", ""), ("german shepard", "shepherd", ""), ("gsd", "shepherd", ""),
    ("old german shepherd", "shepherd", ""), ("shepherd", "shepherd", ""), ("sheperd", "shepherd", ""), ("shepard", "shepherd", ""), ("alsatian", "shepherd", ""),
    ("belgian shepherd", "malinois", ""), ("belgium shepherd", "malinois", ""), ("belgium shepard", "malinois", ""), ("malinois", "malinois", ""),
    ("malino", "malinois", ""), ("mallinois", "malinois", ""), ("bel mal", "malinois", ""), ("belgian mal", "malinois", ""),
    ("australian shepherd", "aussie", ""), ("australian shepard", "aussie", ""), ("aussie", "aussie", ""),
    ("husky", "husky", ""), ("huskey", "husky", ""), ("hushkey", "husky", ""), ("malamute", "malamute", ""), ("sled", "malamute", ""),
    ("wolfdog", "wolfdog", ""), ("wolf dog", "wolfdog", ""), ("wolfhound", "wolfhound", ""), ("wolf hound", "wolfhound", ""),
    ("american staffordshire", "staffy", ""), ("american stafford", "staffy", ""), ("american staff", "staffy", ""),
    ("staffordshire", "staffy", ""), ("stafford", "staffy", ""), ("staffie", "staffy", ""), ("staffy", "staffy", ""),
    ("pit bull", "pitbull", ""), ("pitbull", "pitbull", ""), ("pittbull", "pitbull", ""), ("pet pull", "pitbull", ""), ("pit", "pitbull", ""),
    ("xl bully", "bully", "big"), ("bully", "bully", ""), ("american bulldog", "bully", "white"), ("bull terrier", "staffy", "white"),
    ("french bulldog", "frenchie", ""), ("frenchi", "frenchie", ""), ("english bulldog", "bulldog", ""), ("bulldog", "bulldog", ""),
    ("dachshund", "dachshund", ""), ("daschund", "dachshund", ""), ("dashound", "dachshund", ""), ("dauschaund", "dachshund", ""),
    ("weiner", "dachshund", ""), ("wiener", "dachshund", ""), ("winer", "dachshund", ""), ("weeni", "dachshund", ""), ("wennie", "dachshund", ""), ("sausage", "dachshund", ""),
    ("corgi", "corgi", ""), ("chihuahua", "chihuahua", ""), ("chiwawa", "chihuahua", ""), ("chug", "pug", "mini"),
    ("pomeranian", "pomeranian", ""), ("pomarainain", "pomeranian", ""), ("pom ", "pomeranian", ""),
    ("doberman", "doberman", ""), ("dobermann", "doberman", ""), ("dobberman", "doberman", ""), ("dovermin", "doberman", ""),
    ("rottweiler", "rottweiler", ""), ("rotwieler", "rottweiler", ""),
    ("cane corso", "canecorso", ""), ("caine corso", "canecorso", ""), ("italian mastiff", "canecorso", ""),
    ("great dane", "greatdane", ""), ("dalmatian", "dalmatian", ""), ("dalmation", "dalmatian", ""),
    ("puggle", "beagle", "fawn"), ("pug", "pug", ""), ("shih tzu", "shihtzu", ""), ("shi tzu", "shihtzu", ""), ("shitzu", "shihtzu", ""),
    ("shihtzu", "shihtzu", ""), ("shit tzu", "shihtzu", ""), ("shitzoo", "shihtzu", ""), ("maltese shih", "maltese", ""),
    ("border beagle", "beagle", ""), ("beagle", "beagle", ""),
    ("st bernard", "stbernard", ""), ("saint bernard", "stbernard", ""), ("bernese", "bernese", ""), ("burmese mountain", "bernese", ""),
    ("bernies mountain", "bernese", ""), ("bernese mountain doug", "bernese", ""), ("newfoundland", "newfoundland", ""),
    ("great pyr", "pyrenees", ""), ("pyrenees", "pyrenees", ""), ("tibetan mastif", "tibetanmastiff", ""),
    ("african mastiff", "mastiff", ""), ("boerboel", "mastiff", ""), ("presa canario", "mastiff", ""), ("mastiff", "mastiff", ""),
    ("dogo", "dogo", ""), ("kangal", "kangal", ""), ("borzoi", "borzoi", ""), ("whippet", "whippet", ""), ("greyhound", "whippet", "grey big"),
    ("shiba", "shiba", ""), ("shibu", "shiba", ""), ("american akita", "akita", ""), ("akita", "akita", ""),
    ("samoyed", "samoyed", ""), ("border collie", "bordercollie", ""), ("shetland", "sheltie", ""), ("sheltie", "sheltie", ""),
    ("collie", "sheltie", "big"), ("kolie", "sheltie", "big"),
    ("king charles", "cavalier", ""), ("cavalier", "cavalier", ""), ("cocker", "cocker", ""), ("springer", "springer", ""),
    ("boykin", "springer", "brown"), ("spaniel", "cocker", ""),
    ("jack russel", "jackrussell", ""), ("jack russle", "jackrussell", ""), ("yorkshire", "yorkie", ""), ("yorkish", "yorkie", ""),
    ("yorkie", "yorkie", ""), ("yorki", "yorkie", ""), ("boston", "boston", ""), ("boxer", "boxer", ""), ("maltese", "maltese", ""),
    ("bichon", "bichon", ""), ("bishon", "bichon", ""), ("bison", "bichon", ""), ("havane", "bichon", "cream"), ("havanese", "bichon", "cream"),
    ("pekingese", "pekingese", ""), ("pekinese", "pekingese", ""), ("pikanese", "pekingese", ""), ("papillon", "papillon", ""),
    ("keeshond", "spitz", "grey"), ("lapphund", "spitz", "black"), ("lapbog", "spitz", "black"), ("kintamani", "spitz", "white"),
    ("spitz", "spitz", ""), ("chow", "chow", ""), ("leonberger", "leonberger", ""), ("airedale", "airedale", ""),
    ("scottish terrier", "scottie", ""), ("scottie", "scottie", ""), ("westie", "westie", ""), ("west highland", "westie", ""),
    ("norfolk", "norfolk", ""), ("schnauzer", "schnauzer", ""), ("xolo", "xolo", ""), ("mexican hairless", "xolo", ""),
    ("old english sheepdog", "oes", ""), ("sheepdog", "oes", ""), ("sheep dog", "oes", ""), ("dutch shepherd", "malinois", "brindle"),
    ("lhasa", "shihtzu", ""), ("kai ken", "shiba", ""), ("lundehund", "spitz", ""), ("ridgeback", "vizsla", ""),
    ("norwich", "norwich", ""), ("otterhound", "otterhound", ""), ("bloodhound", "bloodhound", ""), ("coonhound", "coonhound", ""),
    ("shorthaired pointer", "pointer", ""), ("short hair pointer", "pointer", ""), ("gsp", "pointer", ""), ("pointer", "pointer", ""),
    ("vizsla", "vizsla", ""), ("visla", "vizsla", ""), ("irish setter", "setter", ""), ("setter", "setter", ""),
    ("heeler", "heeler", ""), ("heleler", "heeler", ""), ("cattle dog", "heeler", ""), ("griffon", "griffon", ""), ("griffin", "griffon", ""),
    ("fox terrier", "jackrussell", ""), ("terrier", "jackrussell", ""), ("aspin", "mutt", ""), ("mutt", "mutt", ""), ("mix", "mutt", ""),
]
LOOK_WORDS = ["light brown", "dark brown", "light tan", "irish cream", "black", "white", "brown", "chocolate", "liver", "grey", "gray", "blue",
              "silver", "red", "ginger", "orange", "cream", "tan", "fawn", "golden", "gold", "yellow", "apricot", "beige", "wheaten",
              "dapple", "merle", "brindle", "sable", "spotted", "spots", "mini", "miniature", "toy", "tiny", "little", "baby", "puppy",
              "long haired", "long hair", "fluffy", "big", "giant", "xxl"]


def clean(text):
    return " " + re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", text.lower().replace("-", " ").replace("'", ""))) + " "


def match_of(breed):
    """(model, look): the breed named first in the text, then the colour and size words around it."""
    b = clean(breed)
    best = None
    for phrase, model, extra in ALIASES:
        i = b.find(phrase if phrase.endswith(" ") else phrase)
        if i < 0:
            continue
        if best is None or i < best[0] or (i == best[0] and len(phrase) > best[1]):
            best = (i, len(phrase), model, extra, phrase)
    if not best:
        return "mutt", ""
    i, n, model, extra, phrase = best
    rest = b[:i] + " " + b[i + n:]
    rest = rest.replace("redbone", " ")
    for ph in sorted({a[0] for a in ALIASES}, key=len, reverse=True):  # words of any second breed ("x golden retriever") aren't colours
        if len(ph) > 3:
            rest = rest.replace(ph, " ")
    found = []
    for w in LOOK_WORDS:
        j = rest.find(" " + w + " ")
        if j >= 0 and not any(w in f for _, f in found):
            found.append((j, w))
    if "golden" in phrase:
        found = [f for f in found if f[1] not in ("golden", "gold")]
    COLOURS = set(LOOK_WORDS[:24])
    if any(w in COLOURS for _, w in found):  # their own colour beats the breed's usual one
        extra = " ".join(x for x in extra.split() if x not in COLOURS)
    look = " ".join([extra] + [w for _, w in sorted(found)]).strip()
    if "blue nose" in b:
        look += " blue nose"
    if "red nose" in b:
        look += " red nose"
    return model, look.strip()


def model_of(breed):
    return match_of(breed)[0]

def handle_of(s, soft=False):
    h = s.strip().lstrip("@").strip().lower()
    if not re.fullmatch(r"[a-z0-9._]{1,30}", h):
        if soft:
            return None
        sys.exit(f"Not an Instagram name: {s!r}")
    return h



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
    ap.add_argument("--followers", type=int, help="current follower count, shown as the dog total")
    ap.add_argument("--out", default="", help="save to this file instead (e.g. data/preview.json for the ?demo page); reads data/sanctuary.json either way")
    ap.add_argument("--reel-for", action="append", default=[], help="DAY=URL: set the reel link on an earlier day's log")
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
                        d["breed"], (d["model"], d["look"]) = breed, match_of(breed); changed += 1
                    continue
                if d and d.get("removed"):
                    d.pop("removed"); m, lk = match_of(breed); d.update(breed=breed, model=m, look=lk); changed += 1
                    continue
                m, lk = match_of(breed); dogs[h] = {"handle": h, "breed": breed, "model": m, "look": lk, "n": nxt, "day": day}
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

    if a.followers is not None:
        data["followers"] = a.followers; notes.append(f"followers {a.followers}")
    for it in a.reel_for:
        k, _, url = it.partition("=")
        if not url.startswith("https://"): sys.exit(f"--reel-for needs DAY=https://... ({it!r})")
        entry = next((l for l in data["log"] if str(l.get("day")) == k.strip()), None)
        if not entry: sys.exit(f"No log entry for day {k}")
        entry["reel"] = url; notes.append(f"day {k} reel link set")
    data["dogs"] = sorted(dogs.values(), key=lambda d: d["n"])
    live = [d for d in data["dogs"] if not d.get("removed")]
    print("\n".join(notes) or "Nothing to change.")
    g, sv = data["goldCollars"], data.get("silverCollars", 600)
    print(f"Day {data['day']}: {len(live)} dogs, {sum(d['n'] <= g for d in live)}/{g} gold collars, {sum(g < d['n'] <= sv for d in live)}/{sv - g} silver, builds: {', '.join(b['type'] for b in data['builds']) or 'none'}")
    if a.dry_run:
        print("(dry run, nothing saved)"); return
    out = pathlib.Path(a.out).resolve() if a.out else DATA
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"Saved {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")


if __name__ == "__main__":
    main()
