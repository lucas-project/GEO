# Extension Icons

Chrome MV3 requires PNG icons at 16/32/48/128px. This skeleton ships an
SVG source (`icon.svg`); regenerate the PNGs with:

```bash
# any PNG export tool works; here's an example using Inkscape:
inkscape icon.svg -w 16  -o icon-16.png
inkscape icon.svg -w 32  -o icon-32.png
inkscape icon.svg -w 48  -o icon-48.png
inkscape icon.svg -w 128 -o icon-128.png
```

The extension still loads without PNGs (Chrome falls back to a default).
