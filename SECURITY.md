# Security Policy

OpenSocial CLI is early alpha software.

## Private Key Safety

The CLI writes private identity keys to `private/identity.private.jwk.json` inside generated projects. The generated `.gitignore` excludes `private/`.

Do not publish private keys. If a private key is exposed, generate a new identity.

## Reporting Security Issues

Please report suspected vulnerabilities privately through GitHub Security Advisories when available. If advisories are not enabled, open a minimal public issue without exploit details and request a private channel.

## Areas of Interest

We especially care about:

- accidental private key publication
- key rotation without user intent
- invalid signatures passing validation
- deploy adapters uploading more than `public/`
- unsafe rendering in generated pages
- confusing recovery or backup instructions
