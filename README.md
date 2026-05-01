# Weraki Strategy Engine

> Don't solve the stated problem. Solve the real one.

A structured consulting operating system built on Next.js + Claude API. Enforces structured thinking across Diagnosis, Workstreams, Hypothesis, Kill Check, Analysis, BA Tasks, Deck, and Case Audit — all locked to a single Decision.

---

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Claude API** via secure server-side route (`/api/claude`)
- No database — all state is in-memory per session
- No auth — internal tool MVP

---

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Set your API key
cp .env.example .env.local
# Edit .env.local and add your key:
# ANTHROPIC_API_KEY=sk-ant-...

# 3. Run dev server
npm run dev
# → http://localhost:3000
```

---

## Vercel Deploy

### Option A — Vercel CLI
```bash
npm i -g vercel
vercel
# Follow prompts, then set env var:
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

### Option B — GitHub → Vercel Dashboard
1. Push this repo to GitHub
2. Import at vercel.com/new
3. Add `ANTHROPIC_API_KEY` in Project Settings → Environment Variables
4. Deploy

---

## Project Structure

```
weraki/
├── app/
│   ├── api/claude/route.ts   # Secure Claude API proxy
│   ├── globals.css           # Global styles + keyframe animations
│   ├── layout.tsx
│   └── page.tsx              # Main orchestrator (all phase logic)
├── components/
│   ├── diagnosis/
│   │   └── DiagnosisView.tsx     # 5 structured sub-cards
│   ├── workstreams/
│   │   └── WorkstreamsView.tsx   # Parsed workstream cards
│   ├── partner/
│   │   ├── PartnerControlPanel.tsx  # Approve / Refocus / Kill
│   │   ├── PartnerDrawer.tsx        # Slide-in audit log
│   │   └── StatusBadge.tsx          # Per-module status indicator
│   └── shared/
│       ├── Spinner.tsx
│       └── DecisionLockBar.tsx
├── lib/
│   ├── api.ts        # callClaude() — hits /api/claude
│   ├── constants.ts  # Tabs, sectors, design tokens (G)
│   ├── parse.ts      # All text parsing utilities
│   └── prompts.ts    # All LLM prompts
├── types/
│   └── index.ts      # Shared TypeScript interfaces
├── .env.example
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## Adding Modules

Each new module (Hypothesis, Kill Check, etc.) follows this pattern:

1. Add prompt to `lib/prompts.ts`
2. Add parser to `lib/parse.ts`
3. Create component in `components/`
4. Wire into `app/page.tsx` tab handler
5. All modules receive `PartnerControlPanel` at the bottom

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Anthropic API key |

The API key is **never exposed to the client**. All Claude calls go through `/api/claude`.
