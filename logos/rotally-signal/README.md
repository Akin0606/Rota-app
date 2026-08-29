# Rotally — Direction C (The Signal), variant 3

## Polarity — the one rule
The wordmark takes the **opposite** of its ground. Never white on light.

| Ground | Letters   | Accent    | Wheel track |
|--------|-----------|-----------|-------------|
| Dark   | `#F4F4F2` | `#FF6B00` | `#4A4A4E`   |
| Light  | `#0C0C0D` | `#B04D0B` | `#C9C9C4`   |

No single orange clears contrast on both grounds — `#FF6B00` measures 2.59:1 on
paper, under the 3:1 floor even for display type. The accent switches with the
polarity.

The light value is `#B04D0B` rather than the `#C2570F` first specced: the token
is used for real UI text (`text-accent` labels and links), not just the
logotype, and `#C2570F` measured 4.27:1 on the app's light page ground — under
AA. `#B04D0B` clears 4.5 on every light surface and as a button under white.

## Files
- `icon-accent.svg`  — mark for dark grounds
- `icon-light.svg`   — mark for light grounds
- `icon-mono.svg`    — single-colour build (one ink: emboss, engrave, 1-plate)
- `app-icon.svg`     — rounded-square app icon, dark plate
- `favicon.svg`      — **thicker stroke, shorter gaps.** Use below 32px; the
                       display mark's seven segments blur into a plain ring.
- `wordmark-dark.svg`— full lockup. Type is live, not outlined — **outline it
                       before production**, Archivo will not travel in a bare SVG.

## Other rules
- Orange is the mark, never the interface. No orange buttons or links.
- Colour in the UI only ever reports coverage: `#31C46B` covered,
  `#E5C100` short, `#E5484D` uncovered.
- Minimum: wordmark stops at 13px / 18mm. Below that use the icon.
- Always lowercase. One segment filled, fifth position, static in the logo.
