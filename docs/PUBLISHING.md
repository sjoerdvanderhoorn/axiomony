# Publishing Axiomony documentation via GitHub Pages

**Live documentation:** https://sjoerdvanderhoorn.github.io/axiomony/

The GitHub Pages website is **enabled and deployed** from this public repository using the GitHub Actions workflow at `.github/workflows/pages.yml`. Its deployment completed successfully on 15 November 2026.

## Updating the website

1. Edit any static file under `docs/` on branch `main`.
2. GitHub automatically starts the [Publish Axiomony docs workflow](https://github.com/sjoerdvanderhoorn/axiomony/actions/workflows/pages.yml).
3. The workflow uploads the `docs/` directory and deploys it to GitHub Pages.
4. Check the [latest workflow run](https://github.com/sjoerdvanderhoorn/axiomony/actions/workflows/pages.yml) if a change does not appear.

A manual deployment can be started with **Run workflow** if needed. The workflow uses `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4` and `actions/deploy-pages@v4`.

## Existing GitHub Pages configuration

- Repository visibility: **public**
- Build source: **GitHub Actions**
- Website path: `/axiomony/`
- Source folder: `docs/`
- No Jekyll or build process required (`.nojekyll` is present)

Changes to `.github/workflows/pages.yml` also trigger the publication workflow. The repository's Pages settings are available at [Settings → Pages](https://github.com/sjoerdvanderhoorn/axiomony/settings/pages).

## Content

- `index.html`: project overview and philosophy
- `getting-started.html`: bundled/external installation and configuration
- `connect.html`: MCP client connection examples
- `tools.html`: 23 MCP tools, filters and permissions
- `concepts.html`: architecture and security details
- `acme-demo.html` and `demo/acme.js`: interactive, editable JavaScript walkthrough
- `assets/acme-software-demo.mp4`: Full HD 1920×1080, 30 fps example video
- `assets/acme-walkthrough.gif`: compact animated GitHub README preview
- `assets/acme-poster.webp`: lightweight video poster
- `../demo/acme/render.mjs`: reproducible Node.js + FFmpeg video and GIF export

This public documentation website does **not** host the MCP service. Do not publish secrets, passwords, API tokens, sensitive data or customer records in `docs/`. Static pages and assets are publicly visible.
