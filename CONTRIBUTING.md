# Contributing to OpenSocial CLI

OpenSocial CLI should make sovereign publishing safe for people who do not want to think about keys, JSON, or deploy internals.

## Principles

- Keep user-facing language clear and calm.
- Never publish `private/`.
- Never rotate a key without explicit user intent.
- Validate before deploy.
- Prefer official provider CLIs for authentication.
- Keep the generated page static-host friendly.

## Local Development

```bash
npm install
npm test
npm run build
```

## Pull Requests

Pull requests should include:

- user impact
- command behavior changes
- tests or validation output
- screenshots for generated page changes
- notes on compatibility with OpenSocial v0.1
