# Phase 1 — Remaining Sora surface

Generated 2026-04-21 after the Sora font loader was removed from
`client/index.html`. The `.font-sora` class in `client/src/index.css` is now
aliased to Inter, so all usages below render in Inter until Phase 3 replaces
them with `font-ui` / `font-display` / `font-body` per context.

## Locations

| File | Line | Form | Phase 3 replacement |
|---|---|---|---|
| `client/src/index.css` | 165 | Comment (harmless) | Delete when all page usages are gone |
| `client/src/index.css` | 168 | `.font-sora` class definition (aliased → Inter) | Delete when all page usages are gone |
| `client/src/companion/EtherAvatar.tsx` | 85 | `className="… font-sora"` on root panel | `font-ui` |
| `client/src/pages/InterviewMode.tsx` | 228 | `className="… font-sora"` (loading frame) | `font-ui` (chrome); `font-body` for the question text |
| `client/src/pages/InterviewMode.tsx` | 260 | `className="… font-sora"` (completion frame) | `font-ui` |
| `client/src/pages/InterviewMode.tsx` | 410 | `className="… font-sora"` (main interview frame) | `font-ui` (chrome); `font-body` for question text |
| `client/src/pages/Home.tsx` | 58 | `className="… font-sora"` (root wrapper) | `font-ui` |
| `client/src/pages/Home.tsx` | 91 | `className="… font-sora"` on locked-card label | `font-ui` |
| `client/src/pages/Home.tsx` | 140 | `className="… font-sora"` on companion highlight reason | `font-ui` |
| `client/src/pages/MindMap.tsx` | 466 | Canvas 2D `ctx.font = \`... Sora, system-ui, sans-serif\`` | Swap `Sora` → `Inter` in the font string |
| `client/src/pages/MindMap.tsx` | 629 | `className="… font-sora"` (root wrapper) | `font-ui` |

## Count

- 9 `font-sora` class usages across 4 files
- 1 direct `Sora` reference in canvas font string (MindMap)
- 2 supporting lines in `index.css` (alias + comment)

## Notes

- MindMap's canvas `ctx.font` string is the only *non-Tailwind* reference. It
  currently falls through to `system-ui` since Sora is unloaded; not breaking
  but produces different glyph metrics than before Phase 1.
- All class usages currently render in Inter via the `.font-sora` alias, so
  the app is visually consistent during the transition.
