# Contributing to Navichrome

Navichrome is stabilizing its first beta. Keep changes focused on Navidrome/OpenSubsonic compatibility, defects,
accessibility, security, performance, tests, or documentation. Discuss large features before implementing them.

## Setup

```bash
git clone https://github.com/lozza/monochrome-navidrome.git
cd monochrome-navidrome
npm ci
npx playwright install chromium
npm run dev
```

Use deterministic mocks for automated tests. Never commit real Navidrome credentials, API keys, tunnel tokens, signed
media URLs, personal domains, or credential-shaped fixtures.

## Required local checks

```bash
npm run format:check
npm run lint:js
npm run lint:css
npm run lint:html
npm run test:navidrome
npm run test:unit
npm run build
npm run audit:bundle
npx playwright test
```

Do not use automatic lint fixing in CI. If you intentionally format locally, review the resulting diff.

## Pull requests

- Create a topic branch and open a pull request against `main`; do not push directly to `main`.
- Explain user-visible changes, compatibility impact, tests, security/outbound-network changes, and remaining manual
  checks.
- Preserve the repository URL, image name, port mapping, `/navidrome` proxy, and existing Portainer contract.
- Keep music downloads working. The removed “Download” feature was an obsolete application-download page.
- Do not reintroduce old Monochrome/Samidy accounts, Appwrite, PocketBase, promotions, or upstream service endpoints.

See [docs/BETA_TESTING.md](docs/BETA_TESTING.md) for the current beta test matrix.
