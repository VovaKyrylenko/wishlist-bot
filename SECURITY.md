# Security Policy

## Supported versions

This is a small, single-branch project — only the latest code on `main` is supported.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities (e.g. ways to bypass reservation
ownership checks, leak another guest's contact info, or forge webhook requests).

Instead, use GitHub's private reporting: **Security → Report a vulnerability** (or
[open a draft security advisory](../../security/advisories/new) directly). You should get a response
within a few days.

## Scope

Things we consider in scope: authorization bugs (acting on another user's wishlist/reservation),
webhook signature/secret bypass, injection via scraped link previews or user-supplied text, and
leaking `contactPhone` or other guest data outside the intended privacy mode.

Not in scope: rate-limiting/DoS on a single self-hosted bot instance, or issues that only affect a
misconfigured deployment (e.g. a publicly leaked `BOT_TOKEN`).
