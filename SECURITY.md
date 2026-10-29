# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** using GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. (This is enabled once the repository is public.)

Do not open public issues for vulnerabilities.

## What to include

- What the problem is and where (file, endpoint or page number).
- Steps to reproduce, or a short proof of concept.
- The impact as you see it.
- Never include real secrets or other people's data.

## Scope

In scope:

- The Cloudflare Worker proxy in `proxy/`.
- Handling of the Yle API key (it must never reach the app, logs or the repository).
- The counts of opened pages made by the proxy (a pseudonymous daily visitor code, D45).
- How the app handles untrusted Yle content (parsing and rendering).

Out of scope:

- Yle's own services and content.
- Social engineering.
- Denial of service by sheer volume.

## Response

Satanen is a small hobby project. We aim to acknowledge a report within a week, but cannot promise fix times. There is no bug bounty.
