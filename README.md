# Medring ⚕️
### Universal Medication Schedule (UMS) 24-Hour Visual Dial & Clinical Command Center

Medring is a clinical-grade visual medication adherence and schedule compilation system. Built around the **Universal Medication Schedule (UMS)** standard, Medring eliminates medication errors and cognitive fatigue in complex polypharmacy regimens by translating confusing prescription labels into a deterministic, collision-free 24-hour radial clock dial.

---

## 🎯 Clinical Problems Solved

- **Polypharmacy Confusion**: Patients taking 5+ medications daily face high rates of adverse drug events (ADEs) due to overlapping, ambiguous directions (*"take twice daily"*, *"every 12 hours"*, *"as directed"*).
- **Food Rule Conflicts**: Food dependencies (*"empty stomach / before meals"* vs. *"with food"* vs. *"after food"*) are often missed on standard prescription bottles.
- **Cognitive & Visual Accessibility**: Small fonts, dense warnings, and complex dosage fractions cause compliance failures, especially among geriatric and visually impaired patients.

---

## ⚙️ Architecture & Key Innovations

### 1. 24-Hour 4-Period Radial Dial (`DayRing`)
- **4 Standardized Periods**:
  - **Morning** (`06:00 – 10:00` / `08:00` anchor)
  - **Noon** (`11:00 – 14:00` / `12:00` anchor)
  - **Evening** (`17:00 – 20:00` / `18:00` anchor)
  - **Bedtime** (`21:00 – 23:59` / `22:00` anchor)
- **Concentric Dual Tracks**:
  - **Inner Track**: Before food / empty stomach requirements.
  - **Outer Track**: With food or after food requirements.
- **Center Hub**: Dedicated PRN (*Pro Re Nata* / "as needed") reservoir with visual dosage badges.

### 2. Tactile High-Contrast Pill Glyphs (`PillGlyph`)
- Shape + Pattern + Color redundant encoding:
  - **Shapes**: Circle, Capsule, Oval, Shield, Diamond, Hexagon.
  - **Patterns**: Solid, Split, Striped, Dotted, Quartered, Checked.
  - **Score Line Rendering**: Split tablets render with half-dashed physical geometries.

### 3. Multimodal Vision OCR (`Gemini 2.5 Flash`)
- Directly scans prescription bottles, blister packs, and clinical discharge summaries using `@google/genai`.
- Strict structured JSON extraction with clinical hallucination guards and fallback models.

### 4. Accessibility & Voice Assistance
- Built-in **Web Speech API** synthesizer for natural spoken dosage reminders in multiple languages.
- Floating **Accessibility HUD** with instant text resizing, high-contrast modes, and reduced-motion enforcement.

### 5. Printable Fridge Sheet & Calm Focus Mode
- Single-page **High-Contrast Fridge Schedule** ready for A4 printing.
- **CalmCard** mode for distraction-free single-dose focus.

---

## 🚀 Getting Started

### Prerequisites
- Node.js `20.x` or higher
- npm `10.x` or higher

### Installation

```bash
git clone https://github.com/manojmulammagari/Medring.git
cd Medring
npm install
```

### Environment Setup
Create a `.env.local` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

- **Run Clinical Fixtures Smoke Test:**
  ```bash
  npx tsx scripts/smoke-fixtures.ts
  ```

- **Run TypeScript Typecheck:**
  ```bash
  npx tsc --noEmit
  ```

- **Run Production Build:**
  ```bash
  npm run build
  npm run start
  ```

---

## 📦 Project Structure

```
├── app/
│   ├── api/parse-label/     # Serverless Gemini Vision OCR endpoint
│   ├── globals.css          # Tactile Swiss high-contrast clinical design system
│   ├── layout.tsx           # Metadata, fonts, and root layout
│   └── page.tsx             # 3-column clinical command center
├── components/
│   ├── calm/                # Single-dose distraction-free CalmCard
│   ├── hud/                 # Floating accessibility and speech HUD
│   ├── print/               # High-contrast printable fridge schedule
│   ├── ring/                # DayRing 24-hour radial SVG dial & PillGlyph
│   ├── studio/              # Source editor, preset selector, and camera scanner
│   └── telemetry/           # Executive live safety telemetry bar
├── data/
│   └── clinical-fixtures.ts # Validated polypharmacy clinical test cases
├── hooks/
│   └── useHud.ts            # Accessibility state and speech narration hook
├── lib/
│   ├── gemini-extract.ts    # Multimodal label parser pipeline
│   ├── phrasebook.ts        # Multilingual clinical terminology
│   ├── ring-geometry.ts     # Deterministic trigonometric layout engine
│   ├── speech.ts            # Web Speech API speech synthesis
│   ├── ui-model.ts          # Color-safe glyph style mapping
│   └── ums-compiler.ts      # UMS scheduling rule engine & validator
├── scripts/
│   └── smoke-fixtures.ts    # CLI verification harness
└── types/
    ├── api.ts               # OCR request/response contracts
    └── ums.ts               # UMS schedule, medication, and geometry schemas
```

---

## 📄 License
MIT © Manoj Mulammagari
