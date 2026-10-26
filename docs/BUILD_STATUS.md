# TheLoop build status

## Product brief
A community platform growing from four years of AfroTech group chat: conference hubs and topic chat, intentional subscriptions, Reddit-style communities and social feed, professional profiles, explainable trust, connection requests and follows, direct messages, event and global calendars, RSVP/waitlists, social links, polls, wins, and useful serendipity. Monochrome, calm, and distinctly community-first. Native Expo app shares the same domain and Firebase backend with the web app.

## Work ownership
- Primary agent: repository setup, shared core/client, web app, integration, QA, commits and deployment.
- Backend agent: functions/, Firebase rules/indexes/configuration, backend tests and deployment documentation.
- Mobile agent: apps/mobile/ only, native Expo implementation and device/export validation.
- Research agent: open source evaluation and focused independent review.

## Operating rules
Keep pushes small and coherent. Never commit credentials, build output or caches. Fictional demonstration data must be clearly labeled. Never claim historical membership or migrate chat history without user-provided data and authorization. Preserve explicit mutes. Trust is server-owned, explainable, and appealable. Use dedicated TheLoop infrastructure only. The user's latest instruction is to continue until 80% of usage is used. At each 30-minute checkpoint inspect usage and progress; stop initiating new work at 80% used. Continue meaningful implementation, testing and hardening before that threshold.

## Progress
- Empty repository cloned; architecture and shared domain contracts established.
- 30-minute review heartbeat created: review-and-advance-theloop.
- Open source evaluation: Zulip, Rocket.Chat and Discourse; original implementation to fit Firebase/Expo, with reusable permissively licensed utilities.
- Dedicated Firebase project: theloop-community-2026. Web app registered, first free Standard Native Firestore database created in us-central1, Spark-safe rules/indexes deployed, email/password authentication enabled. No live users or historical chats imported. Billing is disabled; Cloud Functions deployment awaits the user's pending billing decision. See INFRASTRUCTURE.md.
- Sites preview registered once: appgprj_6adef8382bdc8191829c87ddd76ae3ef (.openai/hosting.json). Private publication in progress. Never create it again; recover a fresh source credential when needed. The initial source credential expired.
- Standard workspace typecheck PASS (web, native SDK58/TS6, shared packages, backend). Standard production web and backend build PASS. All 54 unit tests PASS (18 core +36 backend). Real Firestore rules tests 10/10 PASS; real two-account Auth/callable/Firestore integration 9/9 PASS (73 tests total across these suites).
- Browser QA PASS on sample post/create/vote/save, persistence/reload, quoted replies, preserved channel mute, hidden-channel restoration, RSVP, CSV timezone conversion/duplicate detection/import. Desktop and390px responsive layouts visually inspected. Supplementary cached-tooling preview http://127.0.0.1:5189 remains for ongoing UI QA; final standard Vite build also passes.
- Native export PASS on iOS/Android (Hermes bundles ~3.7MB). Expo install dependency alignment PASS; doctor final rerun follows removal of obsolete newArchEnabled. Actual phone runtime/push permission testing still requires a device; do not equate bundle export with device verification.
- EAS personal project registered: @keithazodeh/theloop-community (32f68c1f-9301-43d0-886b-93bbc35ea208). Internal Android APK build being queued through the existing account allowance; no purchases or store submission. Metadata is in apps/mobile/app.json.
- Client privacy caches, owner/accepted-connection profile access, pagination and real account export/delete/appeal methods implemented; email verification and role-sensitive report queue added.

## Verification and remaining work
Publish the private sample preview and verify its production URL. Finish actual Android APK build, device launch instructions/QR and Expo doctor. Await billing approval before any Cloud Functions/paid-service activation; testing can continue on isolated emulators. Next product hardening: active-channel/history pagination (current listener cap30channels/100messages), paginated professional directory/search (current public-profile cap300), safe image attachments, friend-created private squads, and live public Afrotech.guide calendar discovery. Ensure each enabled control has real behavior. Keep historical chat migration opt-in and unperformed unless supplied/authorized.

## Next
Continue meaningful implementation and verification until usage reaches80%. Last observed usage:22%. Preserve small coherent commits/pushes. Automation review-and-advance-theloop remains ACTIVE every30minutes; no reset credits or purchases authorized.
