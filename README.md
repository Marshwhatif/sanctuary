# Marsh's Dog Sanctuary website

Live at **https://marshtown.com**: GitHub Pages, with the domain registered at Cloudflare (DNS only, grey cloud).

A one-page 3D site where followers find their dog. It uses the same 3D kit as the videos (`lib/lowpoly-*.js`, copied from `template/assets/js/`). All of the content comes from one file, `data/sanctuary.json`.

- `index.html`, `site/style.css`, `site/app.js`: the page.
- `data/sanctuary.json`: the day, dogs, builds, log and shop settings.
- `tools/add-day.py`: the daily update script. It only ever edits `data/sanctuary.json`.
- Add `?demo` to the address to see the grounds full of sample dogs. Add `?dog=name` to jump to a dog (the share button makes these links).

## Every day, with the video

1. Make a CSV of the new followers and their breeds, one per line: `handle,breed`.
2. Run, from this folder:

   ```bash
   python3 tools/add-day.py --day 2 --title "The first dogs move in" --text "One line about today." --reel https://www.instagram.com/reel/XXXX/ --dogs new-dogs.csv --build supermarket --build library --build gym --build cinema
   ```

   Leave out `--build` on days with no new build. Use `--dry-run` first if you want a preview.
3. Upload the new `data/sanctuary.json` to GitHub (see below). The site updates within a minute or two.

Other jobs: `--followers 833` (the dog total shown at the top), `--reel-for 1=<link>` (add a reel to an earlier day), `--remove @name` (opt-outs), `--collar @name=rainbow` and `--hat @name=party|crown|tophat|shades` (paid upgrades), `--shop on` and `--link rainbow=<payment link>`.

How it works:
- The first 100 followers get gold collars and followers 101–600 get silver, by join order (`goldCollars` and `silverCollars` in the data). Paid upgrades never change these.
- Hats and rainbow collars only appear on dogs given them with `--hat` or `--collar`. The `?demo` dogs get random ones just for show.
- What each dog is "doing today" changes every day by itself.
- Breeds come from `lib/lowpoly-breeds.js` (70 breeds). The tool matches the breed named first in a comment, then reads colour and size words (black, white, dapple, mini…) that only recolour or resize that breed. The card still shows what they actually wrote. `breeds.html` previews every breed locally; it and the `days/` folder don't need uploading.
- When kennels run out, dogs share: each day one is inside and the others are out playing or visiting a building.
- The sanctuary is a city of blocks (Marsh Town). Kennel numbers count out from the gate.
- Each build goes to its own district: supermarket to the Market District, library to the Book Quarter, gym to the Sports District, cinema to the Entertainment District. Other builds fill New Town, then Uptown. The next empty plot always shows the building site with the crane. New kinds of build go in `template/assets/js/lowpoly-town.js`, then get copied into `lib/`.
- Gold and silver dogs have a shiny collar with sparkles and a medal with their number.

## When the code changes

The daily data file is always fetched fresh. If you change any `.js` or `.css` file, bump the `?v=` number on every `<script>` and `<link>` in `index.html` (for example `?v=4` to `?v=5`). Otherwise phones may keep the old copy.

## Preview on your Mac

```bash
python3 -m http.server 8123 --directory sanctuary-site
```

Then open http://localhost:8123. It has to be served this way, because opening the file directly can't load the data.
