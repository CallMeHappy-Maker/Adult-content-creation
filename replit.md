# Adult Content Creation Appointment Request

## Overview
A static website with an age gate and an adult content creation appointment request form. Built with plain HTML, CSS, and vanilla JavaScript, served by Express.js.

## Project Architecture
- `index.html` — Main page with age gate overlay and request form
- `css/style.css` — Dark theme styling
- `js/age-gate.js` — Age gate toggle logic
- `js/form-validation.js` — Form submission handler (currently shows an alert)
- `server.js` — Express.js static file server on port 5000

## How to Run
- The app runs via `node server.js` on port 5000

## Recent Changes
- 2026-02-07: Set up Express server to serve static files, configured for Replit environment

## Notes
- `js/package.jason` is a misnamed file containing test code, not a real package config
- `adult-form.zip` is a zip archive sitting in the project root
- Form submission currently only shows an alert — no backend processing yet
