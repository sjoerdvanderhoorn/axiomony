# Publishing Axiomony documentation via GitHub Pages

The website lives in `docs/` and consists only of static HTML, CSS, JavaScript, and SVG files. It does not require a build or any environment secrets.

## One-time GitHub Pages activation

The repository includes an automated deployment workflow at `.github/workflows/pages.yml`. **Repository administrators must first enable GitHub Pages in GitHub's repository settings.** The GitHub integration used to manage the source code cannot change that setting.

1. Open [Axiomony — Settings → Pages](https://github.com/sjoerdvanderhoorn/axiomony/settings/pages).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Save the setting if GitHub asks you to.
4. Open the [Publish Axiomony docs workflow](https://github.com/sjoerdvanderhoorn/axiomony/actions/workflows/pages.yml) and choose **Run workflow** on branch `main`. Future changes to `docs/**` will deploy automatically.
5. After a successful run, open **https://sjoerdvanderhoorn.github.io/axiomony/**.

If GitHub Pages is already enabled with **GitHub Actions** as the source, the workflow may start automatically when it is committed; otherwise run it after activation.

## Public repository

Axiomony is now a **public GitHub repository**, so its documentation can be published through GitHub Pages on eligible GitHub plans. Enable Pages once through **Settings → Pages → Build and deployment → GitHub Actions**; then the existing workflow handles changes to `docs/**` automatically.

The GitHub Actions default `GITHUB_TOKEN` cannot activate Pages through `actions/configure-pages` if no Pages site exists. If Pages has not been enabled, a repository administrator must turn it on in Settings; merely pushing the files is insufficient.

Never place secrets, database credentials, or confidential records in `docs/`.

## Deployment

The workflow uploads the `docs/` directory using `actions/upload-pages-artifact@v4` and deploys using `actions/deploy-pages@v4`. It runs when documentation or the workflow changes on `main`, and supports manual runs.

- Website homepage: `docs/index.html`
- Installation: `docs/getting-started.html`
- MCP connection: `docs/connect.html`
- Tools and permissions: `docs/tools.html`
- Architecture and limitations: `docs/concepts.html`
- Assets: `docs/assets/`

No Jekyll processing is needed because `docs/.nojekyll` is included. All internal links and resources are relative, so the site works at `/axiomony/`.
