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
- Age verification gate on all pages (server-side + client-side enforcement)
- AI-moderated messaging (dual-layer: regex pre-filter + GPT-5-mini contextual detection, intent-based flags, soft warnings before hard blocks, creator-side message reporting)
- Creator sign-up page with DOB-based age verification and profile setup
- Navigation bar linking pages (Home + auth nav area with login/verify/messages/settings/admin)
- Dark theme (black/#8B0000 dark red/#CC0033 lipstick red)
- Built with plain HTML, CSS, and vanilla JavaScript
- Served by Express.js on port 5000
- User authentication via Replit OIDC (OpenID Connect) with Passport.js
- PostgreSQL database for users, sessions, profiles, conversations, messages, attestations, creator settings, booking disclaimers, platform settings
- Identity verification system with ID document upload (base64 storage)
- Profile management (account type, legal identity, display name, location, bio, specialties)
- Creator Legal Self-Attestation (18+, content rights, legal compliance, consent) with timestamp + IP + version tracking
- Stripe integration: buyer checkout sessions, creator Connect onboarding with delayed payouts (72h), payout guards
- Payment flow guardrails: payouts blocked until profile complete + attestation accepted, neutral Stripe metadata, booking disclaimer required for availability bookings
- In-person session hardening: neutral terminology ("availability booking"), booking disclaimer logging with IP/timestamp, Stripe metadata (time_based_booking), address detection/blocking, emergency kill switch for admin
- Access control: messaging, ordering, and creator setup require verified accounts
- Server-side auth middleware on all sensitive API routes
- Admin dashboard for user management, platform stats, message overview
- Messages link only visible to logged-in users (in auth nav area, not main nav)
- Creator settings page: availability windows, cancellation buffer, manual booking approval, auto-block buyers
- Platform Policies page (role disclosure + moderation authority + appeal process)
- Fee Philosophy page (15% rationale, refund policy, payout schedule)
- Site footer on all pages linking to Platform Policies and Fees & Refunds

## Project Architecture
- `index.html` — Marketplace landing page with hero section and featured creators grid
- `account.html` — Account page with Log In / Create Account options, Creator vs Client account type choice
- `signup.html` — Creator sign-up page with DOB age verification and profile setup (stage name, profile pic, bio, specialties)
- `client-signup.html` — Client sign-up page with display name, location, interests setup
- `creators.html` — Creator registration form + public storefront with services and ordering
- `verify.html` — Identity verification page (account type, legal identity, DOB, location, ID upload, bio, specialties, creator attestation)
- `chat.html` — Moderated messaging console with AI moderation
- `admin.html` — Admin dashboard (user management, stats, message overview) — admin-only access
- `creator-settings.html` — Creator settings (availability, cancellation buffer, approval, auto-block)
- `platform-role.html` — Platform Policies (role disclosure, moderation authority, appeal process)
- `fees.html` — Fee Philosophy (15% rationale, refund policy, payout schedule)
- `css/style.css` — Dark theme styling (black background, dark red accents, lipstick red highlights)
- `js/age-gate.js` — Age gate toggle logic (button-based, used on index/creators/messaging)
- `js/auth.js` — Client-side auth utilities (initAuth, getCurrentUser, requireAuth, requireVerified, updateNavAuth, checkAdminStatus)
- `js/verify.js` — Verification page logic (form validation, ID upload, profile submission, Stripe Connect setup)
- `js/admin.js` — Admin dashboard logic (stats, user management, message overview, user removal)
- `js/client-signup.js` — Client sign-up logic (display name, location, bio, interests, profile save)
- `js/signup.js` — Creator sign-up logic (DOB verification, profile pic upload, specialties, localStorage save)
- `js/marketplace.js` — Landing page logic (loads creator cards from localStorage)
- `js/creators.js` — Creator registration, storefront rendering, ordering with fee calculation, in-person safety checklist + disclaimer
- `js/creator-settings.js` — Creator settings page logic (load/save availability, cancellation, approval, auto-block)
- `js/checkout.js` — Shared checkout/fee calculation utilities (legacy, functions duplicated in creators.js)
- `server.js` — Express.js server on port 5000 with OIDC auth, session management, profile/auth APIs, messaging APIs, admin APIs
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
- 2026-02-07: In-person hardening — Neutral terminology, booking disclaimer logging, address detection/blocking, emergency kill switch, Stripe metadata (time_based_booking), wired checkout flow
- 2026-02-07: MVP Hardening — Platform Policies page, Fee Philosophy page, site footer on all pages
- 2026-02-07: MVP Hardening — Creator Legal Self-Attestation (18+, content rights, legal compliance, consent) with timestamp + IP + version
- 2026-02-07: MVP Hardening — Payment guardrails: delayed payouts (72h), payout blocking until profile + attestation, neutral Stripe metadata
- 2026-02-07: MVP Hardening — Server-side age gate enforcement (session-based, middleware on API routes)
- 2026-02-07: MVP Hardening — Creator settings page (availability windows, cancellation buffer, manual approval, auto-block buyers)
- 2026-02-07: MVP Hardening — Auto-block buyers after X moderation violations (per creator setting)
- 2026-02-07: Added account page (account.html) with Log In / Create Account flow, Creator vs Client choice
- 2026-02-07: Added client sign-up page (client-signup.html) for buyer profile setup
- 2026-02-07: Updated login flow to support redirect after auth and account type storage in session
- 2026-02-07: Removed Sign Up from main nav, replaced with Login/Sign Up button linking to account page
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
