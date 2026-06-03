<p align="center">
  <img src="./assets/open-social-logo.png" width="96" alt="OpenSocial logo" />
</p>

# OpenSocial CLI

OpenSocial CLI is the easiest way to create, update, validate, preview, and publish a sovereign OpenSocial page.

It turns the protocol into a real user flow:

1. create an identity
2. generate a private signing key
3. publish `profile.json`
4. publish `feed.json`
5. sign every post
6. preview the page locally
7. deploy to a free static host

## In One Minute

Run:

```bash
npx opensocial
```

The CLI asks simple questions and creates a standalone OpenSocial page project.

The generated project contains:

```text
my-page/
├── opensocial.config.json
├── public/
│   ├── .well-known/opensocial.json
│   ├── assets/
│   ├── feed.json
│   ├── index.html
│   ├── page.js
│   ├── profile.json
│   └── styles.css
└── private/
    └── identity.private.jwk.json
```

The `public/` directory is safe to deploy. The `private/` directory is not.

## Why This Exists

The internet has protocols for websites, domain names, email, feeds, files, and even AI tool connections.

Social identity still mostly lives inside platforms.

OpenSocial changes that by making a social profile a page on the internet. OpenSocial CLI makes that idea usable without asking people to understand JSON, cryptographic signatures, or static hosting internals.

## Quick Start

Create a page:

```bash
npx opensocial init my-page
```

Add a post:

```bash
cd my-page
npx opensocial post "Hello from my sovereign OpenSocial page."
```

Validate signatures and protocol files:

```bash
npx opensocial validate
```

Preview locally:

```bash
npx opensocial preview
```

Deploy:

```bash
npx opensocial deploy --target github
```

or:

```bash
npx opensocial deploy --target cloudflare
```

## Deployment Targets

### GitHub Pages

GitHub Pages deployment uses the official GitHub CLI.

Install and log in:

```bash
gh auth login
```

Then deploy:

```bash
npx opensocial deploy --target github
```

The CLI publishes only the generated `public/` files to a `gh-pages` branch. It never publishes `private/`.

### Cloudflare Pages

Cloudflare Pages deployment uses Wrangler.

Install and log in:

```bash
npm install -g wrangler
wrangler login
```

Then deploy:

```bash
npx opensocial deploy --target cloudflare
```

The CLI runs a direct upload of the generated `public/` directory.

## Private Key Safety

The private key is written to:

```text
private/identity.private.jwk.json
```

Back it up.

If you lose this file, you lose the ability to publish new posts for that identity.

If someone else gets this file, they can publish as that identity.

The generated `.gitignore` includes `private/` automatically.

## Commands

```bash
opensocial init [folder]
opensocial post "Your post" --project ./my-page
opensocial validate --project ./my-page
opensocial preview --project ./my-page --port 4173
opensocial deploy --project ./my-page --target github
opensocial deploy --project ./my-page --target cloudflare
```

Running `opensocial` with no command starts the guided setup.

## Related Repositories

- [`opensocial-core`](https://github.com/Open-Social-Organization/opensocial-core) - protocol primitives, schemas, and specification
- [`opensocial-web`](https://github.com/Open-Social-Organization/opensocial-web) - the official web aggregator
- [`opensocial-page`](https://github.com/Open-Social-Organization/opensocial-page) - sovereign page template

## Status

OpenSocial CLI is early alpha. The current priority is simple, safe publishing for real sovereign profiles.
