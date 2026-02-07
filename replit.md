# FET Platform

## Overview
FET is a consent-first adult community and creator platform designed for fetish-positive spaces that prioritize safety, autonomy, and compliance. Currently in early development as a proof of concept, built with a mobile-first mindset inside Replit.

## Core Philosophy
- Consent-first: Visibility, interaction, and access are intentional
- Creator-first: Creators control how, when, and where content appears
- Adult-positive: Fetish-friendly without becoming a low-effort content dump
- Safety-aware: Moderation and compliance are built-in, not bolted on later

## Development Approach
- Build feature by feature
- Keep everything phone-editable
- Avoid premature complexity
- Lock decisions into documentation
- Prioritize usability over hype

## Current State
- Project scaffolding is live
- Frontend loads successfully
- Modular structure ready for expansion
- Safe baseline to build from without breaking paths
- Static website with age gate and adult content appointment request form
- Built with plain HTML, CSS, and vanilla JavaScript
- Served by Express.js on port 5000
- No backend/database yet — form submission shows an alert only

## Project Architecture
- `index.html` — Main page with age gate overlay and request form
- `css/style.css` — Dark theme styling (black background, dark red accents)
- `js/age-gate.js` — Age gate toggle logic
- `js/form-validation.js` — Form submission handler
- `server.js` — Express.js static file server on port 5000
- `docs/` — Trust & safety, compliance documentation
- `legal/` — Terms of service, privacy policy, disclaimer placeholders

## Planned Modules
1. Community Feed (user posts, media, consent-aware visibility)
2. Creator Tools (post management, visibility controls, monetization hooks)
3. Consent & Age Gating (verification, persistent consent state)
4. Admin & Moderation (review tools, flagging, takedown workflows)
5. Compliance (2257 recordkeeping, content attribution, reporting)

## Roadmap

### Phase 1 — Foundation (Current)
- Static frontend
- UI layout
- Mock data
- Consent flow (frontend)

### Phase 2 — Interactivity
- Feed logic
- Creator posting UI
- Client-side state handling

### Phase 3 — Backend Introduction
- Authentication
- Data persistence
- Role separation (user / creator / admin)

### Phase 4 — Compliance & Scaling
- Moderation tooling
- Reporting workflows
- Legal/compliance integrations
- Monetization (optional)

## How to Run
- `node server.js` — starts the app on port 5000

## Recent Changes
- 2026-02-07: Set up Express server, configured for Replit environment
- 2026-02-07: Extracted legal/docs files from uploaded zip
- 2026-02-07: Documented FET platform vision and roadmap

## User Preferences
- Mobile-first development (Android primary device)
- Feature-by-feature iterative build
- Phone-editable code preferred
- Safety, consent, and sustainability over speed

## Notes
- `js/package.jason` is a misnamed file containing test code, not a real package config
- Backend (Node/API/DB) will be added in later phases
- Full legal compliance is a later implementation phase, but architecture accounts for it
- Project owner retains full creative and operational control
