# RealS AI (reals.media)

**AI Audio Workflow Automation & REAPER MCP Platform** — Founded January 2025 · Built on Anthropic Claude API & Model Context Protocol (MCP).

- **Website:** [https://reals.media](https://reals.media/en)
- **Organization:** RealS AI (`reals.media`)
- **Founder & CEO:** Bao Phuc Nguyen ([`ceo@reals.media`](mailto:ceo@reals.media))
- **Technical Support:** [`founder@reals.media`](mailto:founder@reals.media)

---

## Overview

RealS AI builds an AI workflow automation platform and developer ecosystem for media and audio engineering teams. Our platform solves repetitive post-production setup, multi-track routing, and digital signal processing (DSP) scripting for the REAPER digital audio workstation (DAW).

### Core Platform Architecture

1. **Claude MCP Studio Agent (Production)**
   - Powered by **Anthropic Claude Sonnet 4.5** and the **Model Context Protocol (MCP)**.
   - Parses natural-language studio briefs into structured MCP tool calls, Lua ReaScript automation, and EEL2/JSFX DSP code.
   - Enforces a **human-in-the-loop review** workflow so audio engineers inspect and approve generated tool calls and DSP parameters before applying project changes.

2. **AI Audio Lab & Stem Automation**
   - GPU-accelerated multi-track stem separation (`vocals`, `drums`, `bass`, `other`) via BS-RoFormer and Demucs pipelines (`apps/stem-app`).
   - Automated harmonic chord recognition, tempo/key detection, MIDI transcription, and DAW session routing templates.

3. **Applied AI & Evaluation Roadmap**
   - Automated multi-step DAW session diagnostics across complex multi-turn MCP server workflows.
   - Strict JSON schema extraction and automated DSP code evaluation (`evals`) pipelines benchmarking ReaScript and JSFX generation accuracy.
   - Low-latency studio session context management using Anthropic prompt caching.

---

## Repository Structure

| Path | Role |
|---|---|
| `src/app/` | Next.js 16 App Router pages, localized SEO routes (`/[locale]`), and REST API endpoints |
| `src/components/` | UI components, AI platform architecture overview, marketplace catalog, and audio preview player |
| `src/i18n/` | Multi-locale internationalization (`en`, `vi`, `zh`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `th`, `ru`) and structured SEO metadata |
| `apps/stem-app/` | Python FastAPI & Modal GPU inference service for AI stem separation, chord analysis, and MIDI extraction |
| `prisma/` | PostgreSQL (`Neon`) database schema and migrations |

---

## Development

```bash
npm install
npx prisma generate
npm run dev
```

---

## Contact

- **General & Partnerships:** [ceo@reals.media](mailto:ceo@reals.media)
- **Engineering & Support:** [founder@reals.media](mailto:founder@reals.media)
- **Website:** [https://reals.media/en](https://reals.media/en)
