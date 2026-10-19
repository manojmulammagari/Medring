# MedRing

**Universal Medication Schedule (UMS) 24-Hour Day Ring — Clinical Cockpit for Discharge Prescriptions**

MedRing is a deterministic, zero-hallucination clinical UI that translates hospital discharge sheets and real-world prescription scans into a single **Universal Medication Schedule (UMS) 24-Hour Day Ring**. Built for the **Hyperbloom October UI/UX & Web Design Hackathon**.

---

## The Problem

Hospital discharge sheets use cryptic Latin/numeric shorthand — `1-0-1`, `AC`, `PC`, `HS`, `BBF`, `OD`, `BD`, `TDS`, `PRN` — that even careful patients and caregivers misread. Post-op patients, elders, and non-native speakers face dangerous medication errors when food rules (empty stomach vs. with food) are confused or dosing times are misunderstood. Existing apps rephrase, summarize, or *guess* what a label says. MedRing never guesses.

---

## Our Solution: MedRing

MedRing restates medication labels **verbatim** and places every dose on a collision-free **24-Hour Day Ring** with redundant **shape + pattern + color** encoding so colour is never the only signal.

### The 3-Step Synchronized Trace

1. **Step 1 · Source Prescription** — Verbatim source text with compact patient metadata and clickable medication rows. All drugs visible above the fold; no hidden scroll trap.
2. **Step 2 · 24-Hour Day Ring** — Concentric dial: inner band = empty stomach / before food, outer band = with or after food, centre hub = as-needed (PRN) medicines. One token per scheduled dose, zero label overlap.
3. **Step 3 · Clinical Detail** — Interactive dose checklist with provenance tracing, verbatim source spans, and ready-to-copy pharmacist questions for anything the compiler halts on.

Plus: **Caregiver Fridge Sheet** (print-ready A4), **Calm Mode** (single-slot focus), **AA+ Elder** (large type), **AAA High-Contrast**, **Read Aloud** (Web Speech API), and **Trilingual UI** (EN / हिन्दी / Español).

---

## Prescription Scanner — Real-World OCR & Free-Text Parsing

The `+ Scan Rx (S)` modal accepts **any** real-world prescription:

- **Image upload** (`.png`, `.jpg`, `.webp`) with live preview and client-side OCR text extraction that can be inspected and edited before rendering.
- **Text file upload** (`.txt`, `.pdf`) — paste OCR output or type messy clinical text directly.
- **3 One-Click Quick-Fill Chips** inside the modal:
  - `[Try Messy Handwritten OCR]` — unstructured handwritten-style prescription text
  - `[Try US/UK Pharmacy Bottle]` — pharmacy bottle label format
  - `[Try Indian OPD Abbreviations (OD/BD/TDS/BBF)]` — Indian outpatient shorthand

### Parser Handles

**Dosage forms:** `Tab.`, `Cap.`, `Syp.`, `Inj.`, `Oint.`, `Drops`, bare names with strengths (`500mg`, `40 mg`, `2.5mg`, `625 mg`, `10ml`, `0.4mg`)

**Shorthand frequencies:**
- `1-0-0`, `1-0-1`, `1-1-1`, `0-0-1`, `0-1-0`, `1-1-1-1`, `1/2-0-1/2`, `2-0-2`
- `OD` / `QD` / `once daily` / `mane` / `morning` → Morning
- `BD` / `BID` / `twice daily` / `q12h` → Morning + Bedtime
- `TDS` / `TID` / `thrice daily` / `q8h` → Morning + Noon + Bedtime
- `QID` / `q6h` → Morning + Noon + Evening + Bedtime
- `HS` / `QHS` / `bedtime` / `night` / `nocte` → Bedtime
- `SOS` / `PRN` / `as needed` / `for pain` / `for chest pain` → PRN Center Hub

**Meal / Timing codes:**
- Empty stomach (Inner Band): `AC`, `BBF`, `before food`, `before breakfast`, `before meals`, `empty stomach`, `30 min before`, `fasting`
- With/After food (Outer Band): `PC`, `ABF`, `after food`, `after meals`, `after breakfast`, `after lunch`, `after dinner`, `with food`, `with meals`
- **UNSTATED FOOD RULE — NEVER GUESSED**: If no meal rule is present on a line, it is explicitly flagged so the safety guardrail works dynamically on any input.

---

## Alignment with All 6 Hyperbloom Judging Criteria

### 1. Thoughtful UX & User Flows
Three-step synchronized trace: Verbatim Source → 24-Hour Ring → Clinical Detail. Bidirectional tapping — tap a medication row in Step 1, the matching token glows on the ring and its detail opens in Step 3. Includes a Caregiver Fridge Sheet for post-discharge use.

### 2. Intuitive & Visually Compelling UI
Warm clinical instrument aesthetic: Warm Clinical Daylight (`#F7F6F2`), Calm Mode (`#EEF2EF`), AAA High-Contrast Mode (`#09090B` bg / `#FFFFFF` text / `#FACC15` & `#38BDF8` accents). Zero-scroll 12-column Bento cockpit. Tactile pill tokens with shape + pattern + color redundancy.

### 3. Accessibility & Inclusive Design
- **Shape + pattern redundancy** for colorblind safety (each time-of-day has a unique hatch pattern)
- **AAA High-Contrast Mode** (`H` key) — `#09090B` background, `#FFFFFF` text, `#FACC15` / `#38BDF8` accents
- **Calm Mode** (`C` key) — distraction-free single-slot view
- **AA+ Elder Large-Type** (`E` key) — 17px base, 1.75 line height, 48px touch targets
- **Read Aloud** (`Space`) — Web Speech API synthesis in EN/HI/ES
- **Full keyboard navigation** — `←/→` cycle doses, `1-3` presets, `S` scan, `P` print, `V` preview, `L` language, `Escape` stop
- **Trilingual UI** — English, हिन्दी, Español

### 4. Creative Interaction & Information Architecture
Concentric **Inner Band** (empty stomach / before food) vs **Outer Band** (with / after food) + central **PRN Hub** for as-needed medicines. Period dividers, 24-hour bezel, quadrant chips, and dashed/solid track rings make the food-rule geometry instantly legible.

### 5. Strong Problem-Solving & Originality
**"Never Guessed" Safety Guardrail**: The compiler refuses to hallucinate missing food rules, doses, or frequencies. Anything torn, truncated, or inconsistent is halted with a ready-to-copy pharmacist question. Real-time Flesch-Kincaid & cognitive-load telemetry quantifies the simplification.

### 6. Polished Prototype
Real-time custom Rx scanner supporting `1-0-1` and `OD/BD/TDS/AC/PC` formats. Interactive dose checklist with taken/untaken states. Print-ready Fridge Sheet. Deterministic offline compiler — no model calls required for the core scheduling logic.

---

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS v4**
- **Lucide React** icons, **Framer Motion**
- `@google/genai` for optional cloud OCR (graceful fallback to client-side text parsing)
- **Vitest** for unit tests

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

### Environment (optional, for cloud OCR)

Create `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

The app works fully offline without an API key — demo presets and client-side text parsing are always available.

---

## Judge Walkthrough Guide

1. **Open http://localhost:3000** — Default state shows Preset 1 (6-med cardiac discharge) in English.
2. **Step 1** — All 6 medications (Aspirin EC, Pantoprazole, Clopidogrel, Metoprolol, Atorvastatin, Ramipril) are visible as clickable rows above the fold. Patient header is compact (2-line metadata bar).
3. **Step 2** — The 24-Hour Day Ring shows all doses with zero overlapping labels. Morning quadrant: Aspirin EC & Pantoprazole (inner band, before food), Clopidogrel & Metoprolol (outer band, after food). Bedtime: 3 outer-band doses.
4. **Step 3** — Click any medication row to see its clinical detail with provenance, dose checklist, and verbatim source span.
5. **Period filter** — Click Morning / Noon / Evening / Bedtime chips (full words, no abbreviations).
6. **Scan Rx** — Click `+ Scan Rx (S)`, then `[Try Indian OPD Abbreviations]` → `Render 24-Hour Ring`. Verify OD/BD/TDS/AC/PC parse correctly into the ring.
7. **Accessibility** — Press `C` (Calm), `H` (High Contrast), `E` (Elder), `Space` (Read Aloud), `L` (Language).
8. **Telemetry** — 6-column KPI strip shows Reading Load, Grade, Decisions, Fasting rules, Tokens, Guardrail (0 hallucinations).
9. **Print** — Press `P` for the Caregiver Fridge Sheet.
10. **Reset** — Press `1` to return to Preset 1, and ensure language is `EN`.

---

## Testing & Verification

```bash
# TypeScript typecheck (0 errors required)
npx tsc --noEmit

# Production build
npm run build
npm run start

# Clinical fixture smoke test
npx tsx scripts/smoke-fixtures.ts
```

---

## Project Structure

```
medring/
├── app/
│   ├── api/parse-label/     # Serverless OCR endpoint (Gemini Vision)
│   ├── globals.css          # Clinical design system (CSS variables, no legacy borders)
│   ├── layout.tsx           # Root layout, fonts, metadata
│   └── page.tsx             # Entry → Studio
├── components/
│   ├── calm/                # CalmCard single-slot focus view
│   ├── hud/                 # Accessibility HUD (Calm C, Contrast H, Elder E, Speak, Lang)
│   ├── print/               # FridgeSheet & PrintPreviewModal
│   ├── ring/                # DayRing 24h SVG dial, PillGlyph tactile tokens
│   ├── studio/              # Studio cockpit, SourcePane, ScanModal, DetailPanel
│   ├── telemetry/           # TelemetryDock (KPI strip)
│   └── judge/               # WhyMedRingModal
├── data/
│   └── clinical-fixtures.ts # 3 validated demo prescriptions
├── hooks/
│   └── useHud.ts            # Keyboard hotkeys + persistent state
├── lib/
│   ├── text-parser.ts       # Client-free-text / OCR prescription normalizer
│   ├── ums-compiler.ts      # Deterministic UMS rule compiler (never guesses)
│   ├── ui-model.ts          # Glyph style mapping, selection sequencing
│   ├── ring-geometry.ts     # Trigonometric ring layout engine
│   ├── phrasebook.ts        # EN/HI/ES deterministic templates
│   ├── scan-client.ts       # Browser upload + sample image generator
│   ├── gemini-extract.ts    # Cloud OCR extraction pipeline
│   └── speech.ts            # Web Speech API wrapper
├── scripts/
│   └── smoke-fixtures.ts    # CLI verification harness
├── tests/
│   └── ums-compiler.test.ts # Vitest suite (compiler, sanitiser, fixtures)
├── types/
│   ├── api.ts               # OCR request/response contracts
│   └── ums.ts               # UMS schedule, medication, geometry schemas
├── next.config.ts           # devIndicators: false
└── README.md
```

---

## Safety & Disclaimer

MedRing is a prototype for the Hyperbloom Hackathon. It restates labels verbatim and never guesses, but it is **not medical advice**. Always follow the original label and consult your pharmacist or clinician. Demo data uses fictional patients — not real medical records.

MIT © Hyperbloom October 2026 Hackathon Entry
