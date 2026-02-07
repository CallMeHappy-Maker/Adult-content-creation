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
- AI-moderated messaging (dual-layer: regex pre-filter + GPT-5-mini contextual detection)
- Creator sign-up page with DOB-based age verification and profile setup
- Navigation bar linking all pages (Home, Creators, Sign Up, Messages)
- Dark theme (black/#8B0000 dark red/#0ff cyan)
- Built with plain HTML, CSS, and vanilla JavaScript
- Served by Express.js on port 5000
- User authentication via Replit OIDC (OpenID Connect) with Passport.js
- PostgreSQL database for users, sessions, profiles, conversations, messages
- Identity verification system with ID document upload (base64 storage)
- Profile management (account type, legal identity, display name, location, bio, specialties)
- Stripe integration: buyer checkout sessions, creator Connect onboarding for payouts
- Access control: messaging, ordering, and creator setup require verified accounts
- Server-side auth middleware on all sensitive API routes

## Project Architecture
- `index.html` — Marketplace landing page with hero section and featured creators grid
- `signup.html` — Creator sign-up page with DOB age verification and profile setup (stage name, profile pic, bio, specialties)
- `creators.html` — Creator registration form + public storefront with services and ordering
- `verify.html` — Identity verification page (account type, legal identity, DOB, location, ID upload, bio, specialties)
- `messaging.html` — Moderated messaging console with consent overlay
- `css/style.css` — Dark theme styling (black background, dark red accents, cyan highlights)
- `js/age-gate.js` — Age gate toggle logic (button-based, used on index/creators/messaging)
- `js/auth.js` — Client-side auth utilities (initAuth, getCurrentUser, requireAuth, updateNavAuth)
- `js/verify.js` — Verification page logic (form validation, ID upload, profile submission)
- `js/signup.js` — Creator sign-up logic (DOB verification, profile pic upload, specialties, localStorage save)
- `js/marketplace.js` — Landing page logic (loads creator cards from localStorage)
- `js/creators.js` — Creator registration, storefront rendering, ordering with fee calculation
- `js/checkout.js` — Shared checkout/fee calculation utilities (legacy, functions duplicated in creators.js)
- `server.js` — Express.js server on port 5000 with OIDC auth, session management, profile/auth APIs, messaging APIs
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
- 2026-02-07: Added access control — messaging, ordering require verified accounts (client + server-side)
- 2026-02-07: Added Stripe Connect onboarding for creators on verify page with status display
- 2026-02-07: Integrated Stripe payments: checkout sessions, Connect payouts, webhook handling
- 2026-02-07: Added AI-moderated messaging (regex pre-filter + GPT-5-mini contextual detection)
- 2026-02-07: Added OIDC authentication (Replit login) with Passport.js, session management, user upsert
- 2026-02-07: Added identity verification page (verify.html) with account type, legal identity, DOB, location, ID document upload
- 2026-02-07: Added profile management API routes (GET/POST /api/profile, POST /api/profile/upload-id)
- 2026-02-07: Added client-side auth utilities (js/auth.js) with nav bar auth state display
- 2026-02-07: Updated all HTML pages with auth nav integration
- 2026-02-07: Rebuilt app as content creator marketplace (was community posting site)
- 2026-02-07: Created marketplace landing page with creator directory
- 2026-02-07: Built creator registration with service builder
- 2026-02-07: Built storefront pages with ordering and fee breakdown
- 2026-02-07: Added moderated messaging console (chat.html)
- 2026-02-07: Set up Express server, configured for Replit environment

## User Preferences
- Mobile-first development (Android primary device)
- Feature-by-feature iterative build
- Phone-editable code preferred
- Safety, consent, and sustainability over speed
- This is a marketplace/storefront app, NOT a community posting site

## Notes
- `js/package.jason` is a misnamed file containing test code, not a real package config
- Full legal compliance is a later implementation phase, but architecture accounts for it
- Project owner retains full creative and operational control
- Stripe integration active (checkout + Connect) via Replit Stripe integration with managed webhooks
- OpenAI integration for AI moderation via Replit AI Integrations (billed to Replit credits)
- Creator profiles/services still stored in localStorage (migration to database planned)
