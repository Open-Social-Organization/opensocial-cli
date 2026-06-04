<p align="center">
  <img src="./assets/open-social-network-logo.png" width="96" alt="Open Social Network logo" />
</p>

# Open Social Network CLI

Open Social Network CLI is the terminal path for creating, updating, checking, previewing, and publishing a sovereign Open Social Network page.

It turns the protocol into a real user flow:

1. create your page
2. write posts
3. like, dislike, and comment with signed portable actions
4. send encrypted direct messages
5. read encrypted direct messages
6. import received messages into the public encrypted inbox
7. check that everything verifies
8. preview locally
9. publish anywhere static files can be hosted

## In One Minute

Run:

```bash
npx open-social-network
```

The CLI asks simple questions and creates a standalone Open Social Network page project.
The page it creates shows the profile, signed posts, and the public following list in a normal social-page layout.

The generated project contains:

```text
my-page/
├── open-social-network.config.json
├── public/
│   ├── .well-known/open-social-network.json
│   ├── assets/
│   ├── feed.json
│   ├── index.html
│   ├── opensocial/
│   │   ├── actions/
│   │   │   ├── index.json
│   │   │   └── inbox/index.json
│   │   ├── follows/
│   │   │   └── index.json
│   │   └── messages/
│   │       └── inbox/index.json
│   ├── page.js
│   ├── page-social.js
│   ├── profile.json
│   └── styles.css
└── private/
    ├── identity.private.jwk.json
    ├── messages.private.jwk.json
    └── messages/
        └── outbox/
```

The `public/` directory is safe to deploy. It includes the page, feed, profile, the owner's public action log, the page's public action inbox, the portable follow list, and encrypted message inbox. The actor-owned action log at `public/opensocial/actions/index.json` lets compatible aggregators read portable likes, dislikes, and comments from your own page. The follow list at `public/opensocial/follows/index.json` lets compatible aggregators move your social graph with your page. The `private/` directory is not safe to publish. Encrypted message files created by the CLI are saved in `private/messages/outbox/` so they are not accidentally hosted with your public site.

## Why This Exists

The internet has protocols for websites, domain names, email, feeds, files, and even AI tool connections.

Social identity still mostly lives inside platforms.

Open Social Network changes that by making a social profile a page on the internet. Open Social Network CLI makes that idea usable without asking people to understand JSON, cryptographic signatures, or static hosting internals.

## Quick Start

Create your page:

```bash
npx open-social-network create my-page
```

Add a post:

```bash
cd my-page
npx open-social-network post "Hello from my sovereign Open Social Network page."
```

Like a post from another page:

```bash
npx open-social-network react like --post post_001 --author ada@example.com
```

Comment on a post:

```bash
npx open-social-network comment "This should travel with the protocol." --post post_001 --author ada@example.com
```

These commands create signed public actions in your page. Compatible aggregators can read them without owning your account.

Send a private message:

```bash
npx open-social-network message "Private hello" --to ./their-page
```

The CLI encrypts the text for the recipient page and saves a message file in `private/messages/outbox/`. Send that file to the recipient by any channel you trust. Only the recipient page's message key can read the text.

Read a private message:

```bash
npx open-social-network read-message ./message.json --from ./their-page
```

The CLI uses your page's private message key and the sender's public profile to verify and open the message locally.

Save a received message in your page inbox:

```bash
npx open-social-network import-message ./message.json --from ./their-page
```

This verifies and opens the message, then saves only the encrypted envelope to `public/opensocial/messages/inbox/index.json`. That public inbox is safe to host because it does not contain the plaintext message. The simpler alias `receive-message` works too.

Check that the page is valid:

```bash
npx open-social-network check
```

Preview locally:

```bash
npx open-social-network preview
```

Prepare files for any static host:

```bash
npx open-social-network publish --target folder --output ./public-site
```

Or use a built-in shortcut:

```bash
npx open-social-network publish --target github
```

or:

```bash
npx open-social-network publish --target cloudflare
```

GitHub Pages and Cloudflare Pages are examples. Open Social Network pages can be hosted anywhere that serves static files.

## Deployment Targets

### GitHub Pages

GitHub Pages deployment uses the official GitHub CLI.

Install and log in:

```bash
gh auth login
```

Then publish:

```bash
npx open-social-network publish --target github
```

The CLI publishes only the generated `public/` files to a `gh-pages` branch. It never publishes `private/`.

### Cloudflare Pages

Cloudflare Pages deployment uses Wrangler.

Install and log in:

```bash
npm install -g wrangler
wrangler login
```

Then publish:

```bash
npx open-social-network publish --target cloudflare
```

The CLI runs a direct upload of the generated `public/` directory.

## Private Key Safety

The private key is written to:

```text
private/identity.private.jwk.json
```

The private message key is written to:

```text
private/messages.private.jwk.json
```

Back it up.

If you lose these files, you lose the ability to publish new posts for that identity or read encrypted messages sent to that page.

If someone else gets these files, they can publish as that identity or read that page's encrypted messages.

The generated `.gitignore` includes `private/` automatically.

Encrypted direct-message files created from the CLI are written to:

```text
private/messages/outbox/
```

They are not part of the public site export.

## Commands

```bash
open-social-network init [folder]
open-social-network create [folder]
open-social-network post "Your post" --project ./my-page
open-social-network react like --post post_001 --author person@example.com --project ./my-page
open-social-network react dislike --post post_001 --author person@example.com --project ./my-page
open-social-network react none --post post_001 --author person@example.com --project ./my-page
open-social-network comment "Great post" --post post_001 --author person@example.com --project ./my-page
open-social-network message "Private hello" --to ./their-page --project ./my-page
open-social-network read-message ./message.json --from ./their-page --project ./my-page
open-social-network import-message ./message.json --from ./their-page --project ./my-page
open-social-network receive-message ./message.json --from ./their-page --project ./my-page
open-social-network validate --project ./my-page
open-social-network check --project ./my-page
open-social-network preview --project ./my-page --port 4173
open-social-network deploy --project ./my-page --target github
open-social-network deploy --project ./my-page --target cloudflare
open-social-network publish --project ./my-page --target folder --output ./public-site
open-social-network publish --project ./my-page --target github
open-social-network publish --project ./my-page --target cloudflare
```

Running `open-social-network` with no command starts the guided setup. The original command names remain supported; the simpler names are recommended for new users.

## Related Repositories

- [`open-social-network-core`](https://github.com/Open-Social-Network/open-social-network-core) - protocol primitives, schemas, and specification
- [`open-social-network-web`](https://github.com/Open-Social-Network/open-social-network-web) - the official web aggregator
- [`open-social-network-page`](https://github.com/Open-Social-Network/open-social-network-page) - sovereign page template

## Status

Open Social Network CLI is early alpha. The current priority is simple, safe publishing for real sovereign profiles.

## How Open Social Network Differs From Existing Decentralized Social Platforms

Open Social Network does not claim that decentralized social media starts here.

Mastodon, ActivityPub, Nostr, Bluesky/AT Protocol, Diaspora, Matrix, and the broader fediverse have already advanced open social infrastructure in important ways. They have explored federation, portable identity, relays, moderation, community governance, and protocol-based communication at real scale.

Open Social Network exists because we believe a few hard problems still need a simpler path for mainstream adoption.

Email has protocols. DNS has protocols. The web has protocols. AI systems are beginning to use open interoperability layers. Social identity should have the same kind of open, inspectable foundation instead of living only inside applications that can change the rules, the algorithm, or the audience relationship at any time.

This CLI is the guided path for creating, posting, validating, previewing, and publishing that identity without turning the user into an infrastructure operator.

### What Still Feels Unresolved

- **Identity is often attached to infrastructure.** Many systems still ask users to depend on an instance, relay, provider, app, or hosted account namespace. Open Social Network starts from a sovereign web identity: a page and key that can move across hosts and interfaces.
- **The user experience is still too technical.** Most people want a profile, posts, follows, reactions, comments, messages, discoverability, and portability. They should not need to understand federation, relays, static hosting, keys, or JSON to participate.
- **Creator ownership remains fragile.** Visibility, reputation, audiences, and social history can still become tied to one app, one server, or one algorithm. Open Social Network is designed so followers, public actions, and reputation can become portable protocol data instead of platform data.
- **Core systems can become too large to explain.** Open Social Network keeps the base layer small: profiles, feeds, signed posts, signed public actions, encrypted messages, and discovery. More complex systems should be optional modules, not requirements for reading a page.

### The Open Social Network Direction

- **Profiles belong to users, not platforms.** A profile is a sovereign web identity, closer to a website, domain, or email identity than an account rented from an app.
- **Followers belong to creators.** Audience, reputation, and social history should be portable protocol data, not assets trapped inside one company database.
- **Profiles are independent web pages.** A social identity should be able to live on static hosting, a personal server, a community host, object storage, mirrors, or future compatible storage layers.
- **Aggregators are replaceable.** Aggregators browse, verify, rank, moderate, and display the network. They do not own the identities underneath.
- **Algorithms should compete.** Recommendation systems should influence discovery, not decide whether a person effectively exists online.
- **The protocol has no global ban switch.** Safety and moderation are real requirements, but they should be handled by hosts, apps, communities, filters, user choice, and applicable infrastructure law rather than a central protocol owner.
- **Identity must be portable.** Users should be able to migrate hosts, change providers, self-host, or create mirrors without losing identity or audience.
- **Self-hosting must remain possible.** Hosted providers can make the network easier, but the protocol must preserve the right to fully own and host a presence independently.
- **The protocol belongs to nobody.** Open Social Network is open source infrastructure, not a platform controlled by one company.
- **Decentralization must stay practical.** Users should experience simple actions: create a page, post, follow, react, comment, message, and publish. Protocol details should support verification without becoming a daily burden.
- **Evolution must protect users.** The protocol should remain modular, extensible, and forward-compatible so new capabilities do not break existing identities.

### What v0.1 Is Trying To Prove

v0.1 is intentionally small. It focuses on sovereign profiles, signed feeds, signed public actions, portable follow lists, encrypted direct-message envelopes, and static web compatibility.

The goal is not to defeat every previous approach. The goal is to learn from them and test a different primitive: social identity as ordinary web infrastructure, inspectable by developers and usable by normal people.

The protocol should feel closer to HTML or RSS for social identity than to a massive distributed operating system.

### Final Thought

Open Social Network has not solved every hard problem in decentralized social media. Spam, safety, abuse, discovery, onboarding, moderation, scaling, and creator incentives require serious work.

This project exists to make that work possible on top of a simple foundation: user-owned social identity, signed public records, portable relationships, encrypted private communication, and interfaces that ordinary people can use.

The long-term goal is not to create the dominant social platform. The goal is to make social platforms optional.
