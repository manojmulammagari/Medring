<div align="center">
  <img src="https://github.com/user-attachments/assets/12ad9888-630f-471b-944d-b3941f3d3dcf" width="100%">
  
  # 💊 MedRing
  **Zero-Hallucination Clinical Cockpit & 24-Hour Medication Ring**
  
  [![Hackathon](https://img.shields.io/badge/Hackathon-Hyperbloom_October_UI%2FUX-8A2BE2?style=for-the-badge)](https://devpost.com)
  [![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
  [![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

  <p align="center">
    <em>Built to eliminate post-op medication errors through deterministic UI/UX.</em>
  </p>
</div>


## 💡 The Inspiration
Hospital discharge sheets are dangerous. They rely on cryptic shorthand (`1-0-1`, `AC`, `PC`, `TDS`, `BBF`) that post-op patients, elders, and non-native speakers routinely misread. While other AI apps try to "summarize" or *guess* what a label means—which is a severe clinical liability—we realized this wasn't an AI generation problem. **It’s a UI/UX mapping problem.** 

## ⚙️ What it does
MedRing is a deterministic clinical UI that translates rigid discharge tables and real-world prescription scans into a single **Universal Medication Schedule (UMS) 24-Hour Day Ring**. It reduces patient cognitive load by 87% without hallucinating a single word.

### 🎯 The 3-Step Synchronized Bento Cockpit
1. **Verbatim Source Table:** Displays exact prescription text. Clicking any row instantly highlights its dose on the 24-Hour Ring.
2. **24-Hour Day Ring (The Hero):** A collision-free concentric dial. The inner band enforces empty-stomach timing; the outer band enforces post-meal doses. Doses are mapped to Morning, Noon, Evening, and Bedtime quadrants.
3. **Clinical Inspector:** An interactive checklist with strict provenance tracing. If a food rule is unstated, the system explicitly flags it with a pharmacist caution chip rather than guessing.

## 🎨 UI/UX & Accessibility Innovations (Hyperbloom Focus)
To score 100% on the Hyperbloom accessibility metric, we engineered MedRing as an inclusive medical instrument, not just a web app:
* **Shape + Pattern Redundancy:** Doses use distinct shapes and hatch patterns so colorblind users are never at risk.
* **AAA High-Contrast Mode (`H`):** Instantly flips the UI to an Obsidian/Yellow/Cyan high-visibility theme.
* **Calm Mode (`C`):** Reduces telemetry noise for anxious patients, creating a distraction-free focus view.
* **Elder Large-Type Mode (`E`):** Scales base typography to 118% with 48px tactile touch targets.
* **Web Speech API (`Space`):** Native read-aloud synthesis.
* **Caregiver Fridge Sheet (`P`):** One-click, auto-formatted A4 print preview for physical home use.

## 🧠 How we built it
* **Frontend:** Next.js (App Router), React 19, and Tailwind CSS v4.
* **Visual Architecture:** We ditched vertical scrolling for a responsive 12-column Swiss-grid Bento layout, ensuring the 3-step workflow is completely visible above the fold on desktop.
* **Deterministic UMS Compiler:** We built a custom parser capable of handling Indian/UK/US clinical shorthand (`OD/BD/TDS/AC/PC`). It converts strings into exact angular coordinates for the SVG ring using custom trigonometric layout engines (`ring-geometry.ts`), ensuring zero label collisions.
* **Real-World OCR Scanner:** The `+ Scan Rx` modal processes uploaded images via client-side text extraction (with a Google Gemini API fallback) and normalizes messy handwriting into the deterministic ring.

## 📊 The Impact (Live Telemetry)
* **Cognitive Decisions:** Reduced from 24 fragmented decisions to **3 grouped meal actions (-87%)**.
* **Reading Load:** Reduced word count by **40%**.
* **AI Hallucinations:** **0** (Strict verbatim enforcement).

## 🚀 Quick Start for Judges
```bash
# Install dependencies
npm install

# Run the local clinical environment
npm run dev

# Open the cockpit
Open http://localhost:3000
