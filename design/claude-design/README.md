# Claude Design canvas: Third Time

Source for the design exploration canvas (Claude Design). Each `*.dc.html` is one
artboard, `canvas.json` is the layout index. These are design references, not app
code. Nothing in `src/` has changed yet.

Canvas: https://claude.ai/artifact/6oaydnk3GURVUPqdwkZZzV (private)

## Chosen direction: Sun and Wires (`Dawn.dc.html`, `Scene.dc.html`)

- **Palette:** true black ground (AMOLED), paper `#EDE6D3`, forest `#2F6B4A`, moss
  `#86B594`. Vermilion `#D9503A` only for the seal, debt and overdue.
- **Should is forest, Want is paper.** Color alone tells them apart. No shape markers;
  checkboxes are the same rounded square in both lists.
- **Type:** Space Grotesk for words, JetBrains Mono for numbers and labels.
- **Japanese influence through design language, not text.** Flat color, a framed
  print border, a red square seal, asymmetric spacing, one branch in the corner,
  Mount Fuji, power lines. Kanji only in the 三 logo seal.
- **Timer card is a scene** (`Scene.dc.html`). Inputs: Should/Want/rest mode,
  daily target progress (sun or moon height), season, time of day, weather.
  `Scenes.dc.html` is the library of vistas.
- **Motion:** press squash with a small spring, mode change floods the scene,
  tick draws in on check, live dot pulses, particles drift. All off under
  `prefers-reduced-motion`.

## AMOLED notes

Off-white text (about 90%) rather than pure white, flat colors to avoid banding,
thin outlines instead of lifted grey panels, bright fills used sparingly because
the screen can stay on while timing. Manifest `background_color`, `theme_color` and
the page background should all be `#000`.

## Screens in the chosen direction

`Dawn` (Today and Later, interactive), `Settings`, `SignIn` (email, code, password),
`ItemEditor` (edit and new, bottom sheet), `FixTimer` (bottom sheet with live preview).
The quick add button in the bottom bar is meant to open `ItemEditor` in new mode.

## Earlier explorations (kept for reference)

`Main`, `ShouldRunning`, `WantDebt`: the app as built. `Language`, `Today`: Instrument
Panel. `Orbit*`: planet and ring in three palettes plus true black. `Poster`,
`Terminal`: the other two layouts from the final round.

## Ideas parked

- Weather from local weather (opt-in location, Open-Meteo style service, fall back
  to clear).
- More vistas: coast, rice terrace, train line, mountain village.
