# TheLoop build status

## Product brief
A community platform growing from four years of AfroTech group chat: conference hubs and topic chat, intentional subscriptions, Reddit-style communities and social feed, professional profiles, explainable trust, connection requests and follows, direct messages, event and global calendars, RSVP/waitlists, social links, polls, wins, and useful serendipity. Monochrome, calm, and distinctly community-first. Native Expo app shares the same domain and Firebase backend with the web app.

## Work ownership
- Primary agent: repository setup, shared core/client, web app, integration, QA, commits and deployment.
- Backend agent: functions/, Firebase rules/indexes/configuration, backend tests and deployment documentation.
- Mobile agent: apps/mobile/ only, native Expo implementation and device/export validation.
- Research agent: open source evaluation and focused independent review.

## Operating rules
Keep pushes small and coherent. Never commit credentials, build output or caches. Fictional demonstration data must be clearly labeled. Never claim historical membership or migrate chat history without user-provided data and authorization. Preserve explicit mutes. Trust is server-owned, explainable, and appealable. Use dedicated TheLoop infrastructure only. At each 30-minute checkpoint inspect usage and progress; stop initiating new work at 90% used.

## Progress
- Empty repository cloned; architecture and shared domain contracts established.
- 30-minute review heartbeat created: review-and-advance-theloop.
- Open source evaluation: Zulip, Rocket.Chat and Discourse; original implementation to fit Firebase/Expo, with reusable permissively licensed utilities.

## Next
Implement shared state and secure backend; complete web and Expo flows; run meaningful domain/security tests, web browser QA and native export checks; push batches and publish a testable preview. Record exact deployment and mobile test instructions.
