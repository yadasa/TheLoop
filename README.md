# TheLoop

**Good people. Real connection.** A community platform that keeps the energy of a conference group chat going all year — without making everyone read every conversation.

TheLoop includes a React web app, a native Expo app, shared TypeScript behavior, and a Firebase backend. The monochrome identity uses overlapping loops as a temporary mark. This is an independent community project, not an official AfroTech product.

## Try it locally

Requires Node 22+, pnpm 9, and Java 21 for Firebase emulator tests.

```sh
pnpm install
pnpm dev
# In a second terminal:
pnpm mobile
```

With no Firebase environment variables, both apps open an **offline sample preview**. All people, messages, counts, trust scores, and events in that preview are fictional test fixtures. Changes persist only on the current browser/device. Reset the preview in settings. The four years of historical GroupMe conversations have not been imported.

For a phone, run the Expo command on the same network, scan its QR with Expo Go, and use the SDK version reported by Expo. Native push notifications require a configured EAS development build and physical device. See [mobile setup](apps/mobile/README.md).

## What is here

- Conference hubs → channels → topics, with independent follow, mute, and hide choices. Posting does not silently override a mute.
- Communities with discussions, wins, opportunities, polls, comments, votes, saves, and sharing.
- Professional profiles, social links, shared-interest suggestions, requests, public follows, and private conversations.
- Explainable, server-owned trust from verified participation signals; review/appeal support.
- Global, conference, and personal calendars; RSVP capacity, FIFO waitlists, calendar export, and CSV import preview with timezone and duplicate validation.
- Notification preferences, quiet hours, blocking/reporting, moderator actions, account export/deletion, and access rules.

The sample preview is immediately usable. Production account, realtime, push, and scheduled behavior requires the Firebase setup below; a local preview does not prove a production deployment.

## Connect Firebase

The dedicated project is `theloop-community-2026`. Do not point this app at an unrelated production project. Read [backend setup and deployment](docs/BACKEND.md) before deploying functions or initializing catalogs.

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill the public web app config. Mobile uses the matching `EXPO_PUBLIC_FIREBASE_*` variables described in its README. Public Firebase configuration is not an authorization boundary: Firestore rules and callable checks enforce access. Never put service credentials in client environment variables.

Cloud Functions and scheduled jobs need an eligible billing plan. Email/password auth must be enabled, the app origin authorized, Firestore initialized, rules/indexes deployed, and the empty live catalogs initialized for a real owner UID. The live initializer deliberately creates no fake users or history.

## Validate

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:rules
pnpm --filter @theloop/mobile export:native
```

Core tests cover notification inheritance, privacy boundaries, waitlist promotion, vote semantics, calendar escaping, and spreadsheet/timezone edge cases. Backend tests exercise actual command authorization, idempotency, private rooms, DM privacy, moderation, rate limits, and security rules.

## Workspace

| Path | Responsibility |
| --- | --- |
| `apps/web` | Responsive React/Vite web app |
| `apps/mobile` | Native Expo app for iOS and Android |
| `packages/core` | Models, sample fixtures, pure domain logic, selectors, calendar/CSV utilities |
| `packages/client` | Shared React state, device persistence and Firebase realtime/auth adapter |
| `functions` | Authenticated callable commands, trust, moderation, privacy and scheduled jobs |

## Foundations and progress

[Open source evaluation](docs/OPEN_SOURCE.md) compares Zulip, Rocket.Chat and Discourse and records the architecture decisions. [Third-party notices](THIRD_PARTY_NOTICES.md) tracks bundled dependencies. [Build status](docs/BUILD_STATUS.md) records verification, deployment status, and outstanding work. Work is pushed in coherent batches to preserve reviewable history.
