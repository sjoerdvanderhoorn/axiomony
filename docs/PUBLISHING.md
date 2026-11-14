# Publishing the Axiomony docs to GitHub Pages

All files in this `docs/` directory are static HTML, CSS, JavaScript, and SVG. No build command, dependencies, API credentials, or backend are required.

## Enable GitHub Pages

1. Open the `sjoerdvanderhoorn/axiomony` repository on GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select **main** and **/docs**, then click **Save**.
5. Once GitHub finishes publishing, the default project URL should be `https://sjoerdvanderhoorn.github.io/axiomony/`.

**Important:** the repository is currently private. On GitHub Free, Pages generally requires a public repository; GitHub Pro/Team/Enterprise support Pages from private repositories, depending on account and organization settings. If your plan does not support Pages for a private repository, use a paid plan or a separate public documentation repository. Do not make the entire source repository public solely to enable documentation unless you intend to publish all its contents.

Pages websites are normally publicly viewable even when the source repository is private. Never include secrets, private data, or real user credentials in the published `docs/` directory.

## Structure

- `index.html`: project overview and philosophy
- `getting-started.html`: bundled/external installation and environment variables
- `connect.html`: how to connect to the current MCP endpoint
- `tools.html`: searchable tool reference and privilege requirements
- `concepts.html`: design, architecture and security status
- `assets/styles.css`, `assets/site.js`, `assets/favicon.svg`: local static assets
- `.nojekyll`: disable Jekyll processing

All links and assets use relative paths so the site works at `/axiomony/` and under a custom domain.
