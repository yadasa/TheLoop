# Firebase backend

TheLoop uses one dedicated Firebase project. Cloud Functions validate every mutation. Firestore clients have read access only to resources authorized by `firestore.rules`; no client can directly write profiles, trust, roles, messages, preferences, connections, RSVPs, or moderation data.

## Local execution

From the repository root:

```sh
pnpm install
pnpm --filter @theloop/functions build
pnpm emulators
```

Use project `demo-theloop`. Set the web/mobile Firebase configuration to that emulator project and enable emulator connections in the shared client. Android hardware/emulators need the development computer's reachable host (Android emulator normally `10.0.2.2`); physical phones cannot use the computer's `localhost`.

To populate **only the emulators** with the clearly fictional sample community:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-theloop pnpm --filter @theloop/functions seed:emulator
```

PowerShell uses `$env:NAME='value'` for environment variables. Test account: `me@example.test`, password `TheLoop-emulator-only-2026`. This password is for disposable emulators only. The script rejects missing emulator hosts and any project not prefixed `demo-`.

```sh
pnpm --filter @theloop/functions test
pnpm test:rules
```

## Callable API

Region: `us-central1`. Every callable requires Firebase Authentication. `bootstrap` runs after sign-in and before listeners begin. Authentication identity comes from the verified callable context, never a client-supplied user ID.

| Function            | Input                      | Result                                                                                         |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `bootstrap`         | `{name?: string}`          | `{userId, preferences, role}`; creates only the signed-in member's empty profile               |
| `executeCommand`    | `{requestId, command}`     | `{ok:true,id,...}`; duplicate retries return `duplicate:true`                                  |
| `getTrust`          | `{userId?: string}`        | Authoritative trust score, reasons, verification flag, explanation                             |
| `appealTrust`       | `{reason}`                 | Opens one private appeal per member per UTC day                                                |
| `registerPushToken` | `{token,platform,remove?}` | Registers/removes the signed-in member's Expo token; at most 10 devices                        |
| `exportAccount`     | `{collection?,cursor?}`    | Own profile/preferences or a page of at most 100 own records with `nextCursor`                 |
| `deleteAccount`     | `{confirmation:'DELETE'}`  | Starts an idempotent deletion worker; requires authentication within the previous five minutes |

`requestId` is a fresh UUID (letters, digits, `_` and `-` only) per **logical action**, retained for retries of that same action. Receipts are per user and expire after seven days through Firestore TTL. Changing the payload with the same ID returns the original result rather than executing twice. Limits are 45 successful commands per minute and 2,000 per UTC day per member. Rejected commands do not mutate data or consume successful-operation quota.

Commands follow the union in `packages/core/src/types.ts`. Additional backend operations:

- `report.review` takes `reportId`, `outcome:'dismiss'|'remove'`, optional `note`; requires server-owned `users/{uid}.role` equal to `admin` or `moderator`.
- `event.checkin` takes `eventId`, `userId`; only a global admin/moderator or an event host explicitly approved in the conference's server-owned `organizerIds` can confirm an existing RSVP, within six hours before the event or later. Creating an event does not confer this authority. An organizer cannot confirm their own attendance. New conferences approve their admin creator; the live catalog initializer approves the actual owner UID.
- `conference.create` takes a `conference` metadata object and requires a global admin role. `channel.create` takes a `channel` object and requires a global admin or moderator (creation limits: 1,000 per admin / 100 per moderator).
- `topic.create` takes `channelId`, `name` and requires a private-channel membership, a public-channel follow, or scoped moderation authority. Topic names are unique without case sensitivity, capped at 30 per channel; messages can only use existing topics.
- `channel.member` takes `channelId`, `userId`, `add`; only a global/channel moderator or the linked community's moderator can change private membership. Public channels use subscriptions instead. Channel creator/moderator IDs are server-owned.
- `dm.read` takes `userId` and marks up to 200 received unread messages from that peer. Repeat if `hasMore` is true. `notification.read` without an ID similarly advances through unread notices rather than reprocessing already-read records.

Subscription targets are a channel ID, conference ID, or `${channelId}:${topic}`. Posting never changes subscription preferences. `preferences.update` allows only quiet-hour, IANA-timezone, digest, DM-policy, visibility-of-unsubscribed, and event-reminder settings. The default timezone is explicitly UTC until a member sets theirs. Relationship, membership, saved-post and subscription arrays require their dedicated validated command. Public channel/conference counters track explicit channel/conference follows; private channel counters track access members.

## Reader queries

| Collection                                      | Required client filter                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                      | `where('visibility','==','public')`; connection-only profiles may be individually fetched by their owner/accepted connections |
| `conferences`, `communities`, `posts`, `events` | Signed-in, active account; use bounded/paginated queries                                                                      |
| `channels`                                      | `where('visibility','==','public')`; separately query `memberIds array-contains uid` for private memberships                  |
| `messages`                                      | `where('channelId','==',channelId)`; authorization reads that channel's membership                                            |
| `connections`, `directMessages`                 | `where('participantIds','array-contains',uid)`                                                                                |
| `follows`                                       | `where('participantIds','array-contains',uid)`; directional follow edges are private to their two participants                |
| `notifications`                                 | `where('userId','==',uid)`                                                                                                    |
| `reports`                                       | Own `reporterId`, or moderator-only queue                                                                                     |
| `users/{uid}`                                   | Signed-in owner only; contains private preferences and server-owned role                                                      |

Rules are authorization checks, not result filters. A collection-wide messages or private-profiles listener is intentionally rejected. The supplied composite indexes cover channel/topic chronology, community posts, conference events and private timelines.

Blocking prevents new connection requests/DMs, removes the accepted-connection grant, and removes the blocker's follow. Historical participant-owned DM records remain readable until account deletion; the client hides blocked people and content. Public posts are not private secrets merely because their author is blocked.

Following and connecting are separate actions. Each follow creates a directional server-owned edge and updates public follower/following counts atomically; followers never gain DM or private-profile access. Follow counts do not affect trust. Blocking removes follow edges in both directions and their counts. Deletion removes edges/counts idempotently, preserving unrelated followers.

## Trust and privacy

Trust uses account standing (10), verified email (20), completed profile (10), account tenure (up to 20), accepted connections (up to 10), and organizer-confirmed attendance (up to 20). Repeated low-effort posting and unreviewed reports add no points or penalties. A server-only reviewed moderation penalty can reduce the score. Trust never verifies a professional credential, personal safety, or identity. The `verified` badge and historical founding year are not client editable and are never automatically inferred from this score.

Trust inputs, rate counters, idempotency receipts, Expo tokens, deletion jobs and profile-access grants are denied to all direct client reads/writes. Each member can read their own private role through their user document; roles are never client writable. Moderators can read reports and appeals. Push notifications use generic lock-screen text for DMs, respect quiet hours and event-reminder settings, and remove unregistered Expo devices. Production push requires a physical-device development build and Expo push credentials. Unregister the device token before signout/account switching.

Two real scheduled workers generate in-app notices: `sendCommunityDigests` runs hourly and sends daily highlights at 9am in the saved timezone, or weekly highlights Monday at 9am. It honors channel/topic follows, mutes, blocks, read markers and private membership. Highlights use the latest 1,000 messages/posts from the last seven days; these are bounded recent highlights rather than a guaranteed complete archive. `sendEventReminders` runs every five minutes and notifies opted-in RSVP attendees about events starting within 30 minutes. Stable notification IDs make worker retries idempotent. Quiet hours suppress push delivery while retaining the in-app notice. No email/SMS messages are sent.

Account export is paginated: request the collection names returned by the initial response until each `nextCursor` is null. Account deletion disables authentication, deletes authored messages/posts and private edges, removes private memberships, follows/blocks/access grants, corrects membership and accepted-connection signals, releases RSVP capacity to the waitlist, scrubs embedded post comments/votes/polls and message reactions, anonymizes hosted events/community/channel ownership, removes the user's private document tree/profile/trust data, and deletes Firebase Auth. Mutable shared arrays are reread and changed in transactions so cleanup cannot overwrite another member's concurrent activity. A small completed deletion-job marker retains the UID and completion timestamp for operational idempotency; no content is retained there. Audit external integrations separately before enabling them.

Untrusted file uploads remain disabled in `storage.rules` until malware scanning, upload completion checks, image metadata stripping and retention policies are provisioned. HTTPS link sharing works without an upload bucket.

## Production provisioning

1. Create a dedicated Firebase project; do not reuse other customer/community projects.
2. Enable Firestore Native mode, Firebase Auth Email/Password (and optional Google), add the web/mobile app, and set authorized web domains.
3. Configure client public Firebase values. Keep service-account and Expo server tokens out of source and client bundles.
4. Enable billing only through an authorized account flow if required by Cloud Functions. Verify region and quotas before deployment.
5. Deploy rules/indexes and built functions with an explicitly named project: `firebase deploy --project <theloop-project-id> --only firestore,functions`. Enable Firestore TTL for `requests.expiresAt` (included in index configuration).
6. Sign in with the real community owner's account; allow `bootstrap` to create the empty real profile.
7. Run the explicit, create-only catalog initializer with Application Default Credentials (or an ephemeral `FIREBASE_ADMIN_ACCESS_TOKEN` environment value): `pnpm --filter @theloop/functions seed:live --project theloop-community-2026 --owner <real-owner-uid>`. It refuses non-TheLoop projects and does not overwrite existing catalog resources. It inserts zero invented profiles, messages, events or member counts, and grants the supplied real owner the private admin role.
8. Enable App Check for released clients and set `THELOOP_ENFORCE_APP_CHECK=true` before production callable deployment. Emulator/development clients need registered debug providers. The web/mobile app must initialize App Check before this switch is enabled.
9. Run emulator rules tests and a two-account live smoke test covering membership, private messages, blocked requests, vote uniqueness and capacity before inviting the community.

Production does not claim that four years of historical GroupMe messages, member lists or event calendars have been imported. Migration requires the owner's authorized export, a consent/retention plan, a preview with duplicate detection, and a reviewed import job.
