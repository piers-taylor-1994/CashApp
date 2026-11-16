# Real photos (optional)

The Identify quiz uses a photo from this folder when one exists. If there isn't one, it loads the
Wikipedia image for that denomination (see `WIKI_FILE` in `js/art.js`). If that fails too, it
shows the drawn picture.

The Wikipedia images are official designs, which are copyright (Royal Mint for coins, Bank of
England for notes). The hotlink is for personal, local use only. Don't publish the app with it.
For a public site, use your own photos here instead.

## File names

Put one file per denomination in this folder, as `.jpg` or `.png`:

| Denomination | File name |
| --- | --- |
| 1p, 2p, 5p, 10p, 20p, 50p | `1p.jpg`, `2p.jpg`, `5p.jpg`, `10p.jpg`, `20p.jpg`, `50p.jpg` |
| £1, £2 | `1pound.jpg`, `2pound.jpg` |
| £5, £10, £20, £50 | `5pound.jpg`, `10pound.jpg`, `20pound.jpg`, `50pound.jpg` |

## Tips

- Photograph on a plain, dark or neutral background, in good light, straight on. Keep the
  coin or note the same way up in each photo.
- Crop tightly. A square photo works best for coins; notes can be landscape.
- Keep files small (about 600px wide) so the app loads quickly. On a Mac, this shrinks an
  image to 600px wide: `sips -Z 600 20p.jpg`
- Transparent PNGs (no background) also work well.

After you change photos, bump `CACHE_VERSION` in `sw.js` so phones that already installed the
app pick up the new files.
