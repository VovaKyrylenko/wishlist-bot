route: pending triage
branch base: feat/page-reader is built on fix/wall-detection (PR #24) merged with docs/scraper-bot-protection-research (PR #21), both open at the time; it is rebased onto main once they merge.

# Facts measured before design (2026-09-24, @vercel/sandbox 3.3.0, project `wishlist`, the project's OIDC token)

- A sandbox is **persistent by default**, named or not; a persistent sandbox snapshots its disk on stop. The research spikes had left 39 stopped sandboxes and 40 snapshots (38 GB) behind; cleaned up the same day — 0 sandboxes and the 5 regional spike snapshots remain.
- `Sandbox.create({ name })` twice with the same name -> 400 "A sandbox with the name … already exists for this project".
- `Snapshot.list({ name })` returns the snapshots of that named sandbox, and nothing for another name; **after the named sandbox is deleted, its snapshots are no longer listed by name** (though they still boot).
- A named builder with `keepLastSnapshots: { count: 2, expiration: 0 }`: three explicit `snapshot({ expiration: 0 })` calls leave exactly 2 listed snapshots, `expiresAt` never; `Sandbox.get({ name })` resumes the stopped builder for the next build (snapshot 2.9-6.3 s after a trivial command).
- A reader booted from the newest snapshot with `persistent: false`: 2.0 s to a finished command, sees the builder's files; after `stop()` + `delete()` no new snapshot and no sandbox remains.
- Earlier (research §I/§J): Chrome 154 + Xvfb install ~45 s; boot from snapshot 0.5-0.9 s; windowed Chrome ready ~1.4 s; Rozetka read in the first wave of 3 (fra1/cdg1/lhr1) 4 of 4 times, 8-13 s per winning sandbox including spike overhead.

# Acceptance criteria (from #25, to be restated after triage)

# Objections
