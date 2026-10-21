# eStudy24 Campus

University ambassadors: [roles, university isolation, Owner workflow and Plesk migration](docs/AMBASSADORS.md).

Bulk news deletion: [permissions, safeguards, verification and Plesk update](docs/BULK-NEWS.md).

University news categories: [approved taxonomy, safe seed and Plesk release](docs/NEWS-CATEGORIES.md).

Current content-automation release: [migration, logo seed, publication policy and n8n changes](docs/CONTENT-AUTOMATION.md), [verification](docs/CONTENT-AUTOMATION-VERIFICATION.md).

Earlier university/n8n/counter release: [Plesk migration and explicit production seed](docs/INTEGRATIONS.md), [verification results](docs/INTEGRATIONS-VERIFICATION.md).

Production deployment: [Plesk setup, browser owner provisioning and release workflow](docs/PLESK.md).
Administrator release checks: [Plesk/admin release verification](docs/PLESK-VERIFICATION.md).

An Arabic university life portal for `campus.estudy24.com`, built on the approved design system and existing Next.js/PostgreSQL backend. See [phase-three setup and features](docs/CAMPUS.md), [current verification results](docs/CAMPUS-VERIFICATION.md), and the [backend foundation](docs/BACKEND.md).

The homepage features eStudy24 editorial content only. University news, programs, dates, schedules, and services live under `/universities/[slug]`. Administration remains isolated at its existing private route. There are no public user accounts.

## Run locally

```sh
npm install
npm run dev
```

After configuring the database as described in the setup guide, open http://localhost:3000. The approved showcase is still available at `/design-system`.

The root URL now renders the eStudy24 homepage.
If Turbopack keeps waiting for filesystem changes after dependency installation
has finished, stop the development server and use `npm run dev:webpack`.
Errors whose source starts with `chrome-extension://` originate in browser
extensions; try a browser profile without extensions to isolate them.

```sh
npm run typecheck
npm run build
```

## Structure

- `src/app/globals.css`: semantic color, typography, spacing, and elevation foundations using Tailwind CSS 4.
- `src/components/ui`: reusable shadcn/ui-style primitives using Radix UI, CVA, and the configured `components.json` aliases.
- `src/components/portal`: reusable news and university cards, separate from showcase content.
- `src/components/design-system`: the interactive visual showcase.

IBM Plex Sans Arabic is bundled locally through Fontsource, with weights 400, 500, and 600. No runtime Google Fonts dependency.

Dropdowns and selection controls use Radix keyboard interaction and explicit RTL direction. The page includes color copying, sample loading states, search filtering, save toggles, a native article preview dialog, university selection, and pagination examples. All data is illustrative; form controls do not transmit data. University icons are placeholders, and Unsplash images are illustrative external assets rather than official campus photography.
