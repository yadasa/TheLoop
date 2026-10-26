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
- Private web preview published: https://theloop-community.h2vmw6.chatgpt.site (owner ChatGPT sign-in required), project appgprj_6adef8382bdc8191829c87ddd76ae3ef. It currently serves baseline e2fff2b. Preserve its private audience. Never recreate it; obtain a fresh source credential for each later publication.
- Standard workspace typecheck PASS (web, native SDK58/TS6, shared packages, backend). Standard production web and backend build PASS. Current units: core25 +client5 +backend51 PASS. Real Firestore rules11/11 PASS, real client pagination/privacy4/4 PASS. Original real two-account Auth/callable/Firestore integration9/9 PASS; expanded phase2 callable cases are being run before the next checkpoint.
- Browser QA PASS on sample post/create/vote/save, persistence/reload, quoted replies, preserved channel mute, hidden-channel restoration, RSVP, CSV timezone conversion/duplicate detection/import. Desktop and390px responsive layouts visually inspected. Supplementary cached-tooling preview http://127.0.0.1:5189 remains for ongoing UI QA; final standard Vite build also passes.
- Native export PASS on iOS/Android (phase2 Hermes bundles ~3.8MB). Expo dependency alignment PASS and doctor20/20 PASS. Native component browser QA covers phone layouts and interactions; actual phone runtime/push permission testing still requires a device.
- EAS project @keithazodeh/theloop-community (32f68c1f-9301-43d0-886b-93bbc35ea208). First internal Android APK FINISHED successfully, build2bcffbdb-8b46-456b-9989-5c2fbe5463f8, baseline e2fff2b. APK, install/Expo Go QR codes and testing guide are saved in the task outputs. No purchases or store submission. This installed preview uses fictional sample mode without Firebase configuration.
- Client privacy caches, owner/accepted-connection profile access, pagination and real account export/delete/appeal methods implemented; email verification and role-sensitive report queue added.
- Phase2: independent active-room listener and topic cursor history beyond cached windows; professional directory50/page with server normalized name/role/skill search, targeted profiles and old saved-post hydration. Equal-timestamp pagination and private access revocation tested on the real Firestore emulator. Author post/reply/message edits and removals, scoped onboarding deselection, exact reply/DM reports with bounded content snapshots, account navigation cleanup, modal focus/stacking and scrollable web chat are implemented across clients.
- Backend/core phase2 pushed as5902648. Client, web and native changes are being pushed in separate coherent commits. The next consent-based private Squad feature is drafted independently so it does not overlap this checkpoint.

## Verification and remaining work
Await billing approval before any Cloud Functions/paid-service activation; testing continues on isolated emulators. Next: consent-based private squads, safe image attachments, live public Afrotech.guide calendar discovery, web routing/back navigation and bundle splitting. Publish later verified source to the existing private site and create a refreshed APK after a coherent native milestone. Physical device OS permissions, push delivery, share sheets and custom scheme checks remain unverified. Keep historical chat migration opt-in and unperformed unless supplied/authorized.

## Next
Continue meaningful implementation and verification until usage reaches80%. Last observed usage:33% (October26,2026 checkpoint); ordinary usage allowed. Preserve small coherent commits/pushes. Automation review-and-advance-theloop remains ACTIVE every30minutes; no reset credits or purchases authorized.
