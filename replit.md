# Adult Content Creator Marketplace

## Overview
A web-based adult content creator marketplace where creators set up storefronts, list their services (custom videos, photos, in-person sessions, video calls), and buyers browse, order, and pay. Built mobile-first as a proof of concept inside Replit.

## Core Philosophy
- Creator-first: Creators control their services, pricing, and availability
- Consent-first: Age verification required before accessing any content
- Safety-aware: Moderation and compliance built-in from the start
- Transparent pricing: Clear fee breakdowns (creator fee, platform 15%, Stripe processing)

## Development Approach
- Build feature by feature
- Keep everything phone-editable
- Avoid premature complexity
- Lock decisions into documentation
- Prioritize usability over hype

## Current State
- Marketplace landing page with creator directory
- Creator registration with service builder (custom video, photos, in-person, video call)
- Creator storefront pages showing services with pricing
- Order flow with fee breakdown and in-person session booking (date/time/location)
- Age verification gate on all pages
- Moderated messaging console with consent overlay, violation detection, audit logs
- Navigation bar linking all pages (Home, Creators, Messages)
- Dark theme (black/#8B0000 dark red/#0ff cyan)
- Built with plain HTML, CSS, and vanilla JavaScript
- Served by Express.js on port 5000
- Data persisted in localStorage (no backend database yet)

## Project Architecture
- `index.html` — Marketplace landing page with hero section and featured creators grid
- `creators.html` — Creator registration form + public storefront with services and ordering
- `messaging.html` — Moderated messaging console with consent overlay
- `css/style.css` — Dark theme styling (black background, dark red accents, cyan highlights)
- `js/age-gate.js` — Age gate toggle logic
- `js/marketplace.js` — Landing page logic (loads creator cards from localStorage)
- `js/creators.js` — Creator registration, storefront rendering, ordering with fee calculation
- `js/checkout.js` — Shared checkout/fee calculation utilities (legacy, functions duplicated in creators.js)
- `server.js` — Express.js static file server on port 5000 with cache-control
- `docs/` — Trust & safety, compliance documentation, conversation history
- `legal/` — Terms of service, privacy policy, disclaimer placeholders

## localStorage Data Structure
```json
{
  "creatorProfiles": {
    "CreatorName": {
      "name": "CreatorName",
      "bio": "About me text",
      "services": [
        {
          "id": "svc_1234",
          "type": "custom-video",
          "title": "Personalized Video",
          "description": "Custom video just for you",
          "price": 25.00
        }
      ]
    }
  }
}
```

## Service Types
- `custom-video` — Personalized video content
- `custom-photos` — Custom photo sets
- `in-person` — In-person content creation session (includes date/time/location booking)
- `video-call` — Live video call session

## Fee Structure
- Platform Fee: 15% of creator fee
- Stripe Processing: 2.9% + $0.30
- Total = Creator Fee + Platform Fee + Processing Fee

## Roadmap

### Phase 1 — Foundation (Current)
- Static frontend marketplace
- Creator registration and storefronts
- Service listing and ordering UI
- Age verification
- Fee calculation

### Phase 2 — Backend Introduction
- Authentication (creator/buyer accounts)
- Database for profiles, services, orders
- Real Stripe payment integration
- Order management and fulfillment tracking

### Phase 3 — Communication & Moderation
- Creator-buyer messaging (already PoC'd)
- Automated moderation
- Notification system

### Phase 4 — Compliance & Scaling
- 2257 recordkeeping
- Content attribution
- Admin/moderation tools
- Reporting workflows

## How to Run
- `node server.js` — starts the app on port 5000

## Recent Changes
- 2026-02-07: Rebuilt app as content creator marketplace (was community posting site)
- 2026-02-07: Created marketplace landing page with creator directory
- 2026-02-07: Built creator registration with service builder
- 2026-02-07: Built storefront pages with ordering and fee breakdown
- 2026-02-07: Added in-person session booking (date/time/location)
- 2026-02-07: Added moderated messaging console (messaging.html)
- 2026-02-07: Set up Express server, configured for Replit environment

## User Preferences
- Mobile-first development (Android primary device)
- Feature-by-feature iterative build
- Phone-editable code preferred
- Safety, consent, and sustainability over speed
- This is a marketplace/storefront app, NOT a community posting site

## Notes
- `js/package.jason` is a misnamed file containing test code, not a real package config
- Backend (Node/API/DB) will be added in later phases
- Full legal compliance is a later implementation phase, but architecture accounts for it
- Project owner retains full creative and operational control
- Stripe payment integration ready but not yet connected (placeholder in place)
