# Atelier — custom apparel design & tailor handoff

A web studio for designing a garment and producing the document a tailor cuts from.
Pick a silhouette, work it over in a real-time 3D editor — cloth, colour, wash, lettering,
graphics, pockets, zips, hardware, distressing — then export a spec sheet with measurements,
itemised construction notes, annotated flat pattern pieces and reference renders.

Lives at **`/atelier/`**. It is entirely static except for one optional endpoint, and it shares
this repository's Netlify deployment.

## The idea

The mockup is not the deliverable. Every change a user makes resolves into a structured
`DesignState` record — zone, material code, colour, placement in centimetres, technique,
hardware finish — and the 3D view and the printed spec sheet are two renderings of that one
record. If something is not in `DesignState`, it does not reach the tailor.

## What's in it

- **Six categories, 31 base patterns** — jeans, pants, t-shirts, shirts, hoodies, puffers, each
  with fit variants that differ in real finished measurements, not just labels.
- **Zone maps** — every template declares what each region can carry. A cuff cannot take a cargo
  pocket; a t-shirt has no hood. This one record gates the manual editor *and* the assistant, so
  the two can never disagree about what is possible.
- **Procedural 3D** — garments are lofted from the same numbers that drive the pattern pieces.
  No model files: geometry, weave textures, normal maps and roughness are all generated in the
  browser, so denim reads as twill and fleece as matted pile under the same lighting.
- **Manual editing** — click a zone on the garment (or pick it from the rail) and get a panel
  offering only what that zone supports. Place lettering and artwork by dragging directly on the
  garment, or by typing exact numbers.
- **Design assistant** — a chat overlay that dims the canvas without hiding it. Describe a change
  in plain words; it resolves to concrete operations, applies them live, and names exactly what
  it did. It asks a clarifying question only when a request is genuinely ambiguous, and refuses
  — with the reason — anything the pattern cannot carry.
- **Spec sheet** — PDF and machine-readable JSON. Measurements, an itemised construction list
  with orderable codes and centimetre placements, flat pattern pieces with numbered marks, and
  multi-angle renders.
- **Mix & match** — a separate styling mode where saved designs (rendered from the real 3D
  pipeline) and an accessory library compose into outfits.

## Architecture

```
public/atelier/
  index.html                Single-page shell; hash-routed screens
  css/atelier.css           Design system: white / black / silver / chrome
  vendor/                   three.js (MIT), vendored — no CDN, no build step
  js/
    catalog/                Templates + zone maps, materials, hardware, type, graphics,
                            accessories. Pure data; the only place any of it is enumerated.
    state/design-state.js   The schema, the capability gate, and every mutation
    state/store.js          Reactive store: undo/redo, coalescing, localStorage
    render/metrics.js       Panel sizes in cm — shared by the loft, textures and the pattern
    render/garment-builder.js  Lofted geometry with drape and puffer baffles
    render/texture-lab.js   Height fields per weave → albedo / normal / roughness tiles
    render/compositor.js    Layers cloth, wash, distressing, stitching and artwork per panel
    render/attachments.js   Pockets, zips, buttons, rivets, drawcords as real geometry
    render/scene.js         Lighting, camera, zone picking, capture
    assistant/intent.js     Natural language → operations, checked against the zone map
    assistant/remote.js     Optional Claude-backed interpreter (same gate on the way back)
    export/pdf.js           Self-contained PDF writer (vector + JPEG, standard fonts)
    export/flats.js         Flat pattern geometry, rendered to both SVG and PDF
    export/spec-sheet.js    Assembles the PDF and the JSON export
    ui/                     Screens: landing, picker, studio, review, outfit, assistant
netlify/functions/assistant.js   Optional interpreter endpoint
```

There is no bundler and no build step. Modules load natively; three.js is vendored so the app
works offline and under a strict `script-src 'self'` policy.

### One source of truth, three consumers

`render/metrics.js` states each panel's physical size in centimetres. The 3D loft, the texture
compositor (which converts centimetres to texels) and the flat pattern diagrams all read it, so
a 13 cm pocket is 13 cm in the render, in the texture and on the paper.

### The capability gate

`checkOp()` in `state/design-state.js` answers one question — *may this operation land on this
zone?* — and returns a reason when the answer is no. Manual controls are generated from the same
record, and the assistant runs every operation through it, including operations proposed by a
model. Nothing writes to a design without passing it.

## The design assistant

The assistant works with **no configuration**: `assistant/intent.js` parses requests in the
browser, resolves zones, fills in sensible defaults and states its assumptions. It is a
deterministic intent engine, not a language model, and the interface says so.

If a deployment sets `ANTHROPIC_API_KEY`, the studio additionally routes requests through
`netlify/functions/assistant.js`, which asks Claude (`claude-opus-5`, structured outputs) to
produce the same operation list given that specific garment's zone map. Two guarantees:

1. The model is told what the garment can carry, **and** every operation it returns is re-checked
   against the zone map in the browser. A model that invents a hood on a pair of jeans gets the
   same refusal a user would.
2. Any failure — no key, cold start, timeout, rate limit — falls back to the local engine for
   that turn. The assistant never stops working because a network call did.

The endpoint is served at `/api/assistant`; the browser probes it once with `GET` to decide
whether to offer the remote path, and Netlify's serverless timeout is why it runs at low effort.

## Running it

The studio is static, so anything that serves `public/` will do:

```bash
cd public && python3 -m http.server 8080   # → http://localhost:8080/atelier/
```

`npm start` also serves it at `http://localhost:3000/atelier/` alongside the resident board, and
adds the `/api/assistant` endpoint — but that entry point needs `DATABASE_URL` for the board.

| Variable            | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY` | Optional. Widens what the assistant understands; unset is fine.     |

## Scope notes

Deliberate boundaries, stated so they read as decisions rather than gaps:

- **Curated, not infinite.** 42 materials, 48 typefaces, 36 graphics, 19 hardware parts, 12
  finishes, 24 accessories. Each catalog is a plain array in `js/catalog/` — adding to any of
  them is appending an entry, and nothing else enumerates them.
- **Typefaces resolve through system font stacks.** The studio renders lettering with faces
  already on the viewer's machine; what ships to the tailor is the `specName` — the typeface to
  set or digitise from — plus the width, slant and tracking applied on top, printed as explicit
  type instructions. The handoff never depends on what happened to be installed in a browser.
- **Export-based handoff.** No accounts, no tailor-side portal. Designs are saved to the browser;
  the deliverables are a PDF, a JSON file and a plain-text summary to paste into a message.
- **Accessories are styling stand-ins.** Mix & match composes; it does not specify. An accessory
  produces no spec sheet.
