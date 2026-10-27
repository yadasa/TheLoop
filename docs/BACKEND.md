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

| Function            | Input                                   | Result                                                                                                 |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bootstrap`         | `{name?: string}`                       | `{userId, preferences, role}`; creates only the signed-in member's empty profile                       |
| `executeCommand`    | `{requestId, command}`                  | `{ok:true,id,...}`; duplicate retries return `duplicate:true`                                          |
| `getTrust`          | `{userId?: string}`                     | Authoritative trust score, reasons, verification flag, explanation                                     |
| `appealTrust`       | `{reason}`                              | Opens one private appeal per member per UTC day                                                        |
| `registerPushToken` | `{token,platform,remove?}`              | Registers/removes the signed-in member's Expo token; at most 10 devices                                |
| `exportAccount`     | `{collection?,cursor?}`                 | Own profile/preferences or a page of at most 100 own records with `nextCursor`                         |
| `deleteAccount`     | `{confirmation:'DELETE'}`               | Starts an idempotent deletion worker; requires authentication within the previous five minutes         |
| `uploadMedia`       | `{target,contentType,base64,requestId}` | Re-encodes one private still image; returns `{image}` with server-owned metadata                       |
| `getMedia`          | `{mediaId,reportId?}`                   | Returns `{image,base64}` only while the linked content is readable, or for its exact moderation report |

`requestId` is a fresh UUID (letters, digits, `_` and `-` only) per **logical action**, retained for retries of that same action. Receipts are per user, with an expiry timestamp seven days later. Automatic Firestore TTL cleanup is enabled only after billing approval; the Spark deployment excludes TTL. Changing the payload with the same ID returns the original result rather than executing twice. Member actions allow 45 successful commands per minute and 2,000 per UTC day. Automatic `channel.read`, `dm.read` and `squad.read` commands share a separate bounded allowance of 120 per minute and 10,000 per UTC day, so a busy conversation cannot consume posting capacity. Both counters are server-owned and per member. Rejected commands do not mutate data or consume successful-operation quota.

Commands follow the union in `packages/core/src/types.ts`. Additional backend operations:

- `report.review` takes `reportId`, `outcome:'dismiss'|'remove'`, optional `note`; requires server-owned `users/{uid}.role` equal to `admin` or `moderator`.
- `event.checkin` takes `eventId`, `userId`; only a global admin/moderator or an event host explicitly approved in the conference's server-owned `organizerIds` can confirm an existing RSVP, within six hours before the event or later. Creating an event does not confer this authority. An organizer cannot confirm their own attendance. New conferences approve their admin creator; the live catalog initializer approves the actual owner UID.
- `conference.create` takes a `conference` metadata object and requires a global admin role. `channel.create` takes a `channel` object and requires a global admin or moderator (creation limits: 1,000 per admin / 100 per moderator).
- `topic.create` takes `channelId`, `name` and requires a private-channel membership, a public-channel follow, or scoped moderation authority. Topic names are unique without case sensitivity, capped at 30 per channel; messages can only use existing topics.
- `channel.member` takes `channelId`, `userId`, `add`; only a global/channel moderator or the linked community's moderator can change private membership. Public channels use subscriptions instead. Channel creator/moderator IDs are server-owned.
- `dm.read` takes `userId` and advances that conversation's server-owned read watermark in one transaction, including histories larger than 1,000 messages. `notification.read` without an ID separately advances through bounded unread notices.
- `dm.edit` takes `messageId` and `body`; only the sender can edit, while the recipient's current initiation/reply policy and both block lists still allow the interaction. Only body/edited time change; participants, identity snapshots, image and read state are preserved. `dm.delete` is sender-only and remains available after a block. Source deletion immediately revokes linked-image retrieval.
- `dm.mute` takes `userId`, `muted`; it suppresses future DM in-app notices and delayed push delivery without revoking participant history or changing read state. Raw preferences cannot write the bounded muted-user list.

Subscription targets are a channel ID, conference ID, or `${channelId}:${topic}`. Posting never changes subscription preferences. `preferences.update` allows only quiet-hour, IANA-timezone, digest, DM-policy, visibility-of-unsubscribed, and event-reminder settings. The default timezone is explicitly UTC until a member sets theirs. Relationship, membership, saved-post and subscription arrays require their dedicated validated command. Public channel/conference counters track explicit channel/conference follows; private channel counters track access members.

## Reader queries

Public directory pages use server-computed `nameKey` and bounded normalized `searchKeys`. Bootstrap repairs the caller's legacy metadata, and profile changes recompute it; the client cannot supply either field. Search combines public visibility, an optional prefix key, and stable name/document-ID pagination. Existing imported profiles need the same server normalization before directory queries can find them.

Channel messages, posts and replies capture server-derived `authorName`/`authorInitials`; DMs capture sender/recipient name and initials. These minimal participation snapshots make history readable when the professional profile is private or outside a bounded directory page. They contain no headline, company, biography, email, trust badge or profile-access grant. Snapshot fields are client-unwritable and remain unchanged during content edits. Legacy records may omit them until a reviewed import/normalization; full private profiles still require their existing connection authorization.

## Author controls and report context

`post.edit` accepts only title/body/tags/URL; `url:''` clears an optional link, while a link-kind post must retain HTTPS. Post and reply edits require the original author, including when the caller has left that community. Global moderators can remove content but cannot rewrite it under its author's identity. `post.delete`, `comment.edit`, and `comment.delete` use exact IDs. Deletions create metadata-only moderation audit records and preserve other replies and contributions. Saved IDs can be removed after the original post disappears.

Reports capture at most 2,000 characters, the actual author ID, and capture time after checking access to the reported resource. Reply reports carry their parent post ID, so removal affects that exact reply. Private DM/Squad report snapshots give moderators bounded case context without granting broad private-message reads. Only current Squad members in the original message audience can capture a Squad report; a role alone grants no such access. Profile removal requires a separate account review, rather than pretending that deleting a profile field removes the account.

Scoped `onboarding.complete` with `replaceChannels:true` requires the exact displayed authorized `channelScopeIds`. Selected channels follow; deselected effective follows explicitly mute; existing muted/hidden choices and channels outside that scope remain unchanged. The default command stays additive. All authorization and counter changes commit atomically.

## Private friend Squads

Any active member can create a Squad and invite accepted connections. Every recipient must accept before membership, name/initials sharing, or message access begins. All members may invite their own accepted connections; the current owner can rename, remove members, revoke another member's reservation, or explicitly transfer ownership. Leaving transfers ownership to the oldest remaining member, with UID tie-breaking. The last departure archives the group and clears member IDs. Departure revokes outstanding invitations created by that member.

Limits are 12 active members plus reserved invitations, 50 active memberships per account, 20 owned groups when creating another group, and 50 unexpired incoming invitations. Automatic ownership transfer never prevents departure. Names are at most 60 characters, descriptions 500, and messages 4,000. Invitations expire after seven days; a group/recipient pair has a 24-hour reinvitation cooldown after its previous response. The expiry worker runs every five minutes, and group mutations prune expired reservations transactionally.

Each message captures its consenting audience at send time. Reads require both current membership and inclusion in that captured audience, so new members cannot read prior conversations and removed members immediately lose access. A returning member may see previously consented messages, but cannot see conversations from their absence. Replies retain only their original authorized audience. Edits narrow the audience to current, unblocked original recipients; no new recipient is added by editing. The author may remove their own message after leaving without regaining history access. An owner can remove another message only if they are in its readable audience. Global moderator roles do not grant Squad history.

Blocking keeps an existing shared membership but excludes either blocked party from the other's new sends. New reactions to old messages cannot disclose a blocked interaction; existing reactions can be withdrawn. Blocking revokes pending invitations between the pair and prevents future invitations/acceptance that conflict with a member's blocks. `squad.mute` suppresses future message notices for that member without changing access. `squad.read` maintains the private read marker; neither field can be written through raw preferences.

| Collection      | Authorized bounded query                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `squads`        | `memberIds array-contains uid`, `updatedAt desc`, limit 50; selected authorized document can be watched independently                                                                |
| `squadInvites`  | Participant history via `participantIds array-contains uid`; incoming pending via `toId==uid` and `status==pending`; current owner may query a selected `squadId` and pending status |
| `squadMessages` | Selected `squadId`, `audienceIds array-contains uid`, `createdAt desc` and document ID descending; pages of 100                                                                      |

Exports include active Squad records, the member's invitation records and their own authored Squad messages. Deletion transactionally transfers ownership/removes membership, revokes reservations, removes private invitations and authored messages, and removes the deleted UID from surviving message audiences/reactions. There are no fabricated memberships or historical conversations in the production initializer.

## Catalog and timeline queries

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

An active DM history page filters the exact canonical `conversationId` (sorted participant IDs joined by `~`), orders `createdAt` and document ID descending, and limits to 100. The separate participant-only `directConversations` catalog queries `participantIds array-contains uid`, then `lastAt` and document ID descending in pages of 50. It discovers old peers independently of the bounded recent-message listener. Summaries contain only minimal participant names/initials, an optional 180-character latest-message preview, chronological metadata and read state; they grant no professional-profile or image access. Edits update the latest preview. Author/moderator deletion clears a matching preview and decrements unread counts only when necessary, preserving the catalog entry and never retaining deleted text. Account deletion removes both participants' conversation summary.

Live sends increment a conversation sequence transactionally. `dm.read` stores `readThrough[uid]`, server `readAt[uid]`, and zeroes that participant's known unread count without rewriting message history. Clients must use shared `effectiveDirectRead(message, conversation)`: an already-read message remains read; a sequenced message compares its sequence with the recipient watermark; an unsequenced legacy message compares its creation time with the recipient's read cutoff. A new send at the same timestamp after a read remains unread because sequences order live writes. The raw legacy `read` and `unreadRecipientId` fields alone are no longer authoritative. Export projects effective read state.

Call authenticated `syncDirectConversations({})` repeatedly until `complete` is true to enumerate pre-catalog history. Each call processes at most 50 participant-owned messages using a server-held cursor, one transactional reread per source, and a three-minute processing lease; calls are limited to 30 pages per minute. Progress lives in the owner's private `users/{uid}.directCatalog` (`complete`, `processed`, `cursor`, `updatedAt`). Show discovery/counts as provisional until it finishes. A crash resumes the same page safely: an assigned message sequence prevents double counting. Legacy `read:true` survives migration; an earlier read cutoff covers legacy pages discovered later. Concurrent sends, edits and deletes reread or conflict on the shared summary; deleted sources cannot be resurrected. Disabled/deleting accounts stop migration, and no global backfill or public catalog getter exists. Legacy imports must retain valid participant IDs and timestamps; production import remains a separately reviewed operation.

DM policy controls who can start a private conversation. An accepted connection or `everyone` policy can allow initiation; a recipient who has previously sent an exact outbound message to this caller also permits that person to reply. This directional consent is shared by text sends/edits and image-upload authorization. An unanswered incoming message never grants consent, and a previous outbound to a different person does not qualify. `nobody` closes new conversations while people the member has messaged can reply. Blocking overrides all prior consent, prevents new connection requests/DMs and edits, removes the accepted-connection grant, and removes follow edges. Historical participant-owned DM records remain readable until account deletion; the client hides blocked people and content. Public posts are not private secrets merely because their author is blocked.

Following and connecting are separate actions. Each follow creates a directional server-owned edge and updates public follower/following counts atomically; followers never gain DM or private-profile access. Follow counts do not affect trust. Blocking removes follow edges in both directions and their counts. Deletion removes edges/counts idempotently, preserving unrelated followers.

## Event lifecycle

`event.create` accepts only explicit `EventDetails`, excluding host, attendee/waitlist, lifecycle and attendance metadata. Empty descriptions support spreadsheet plans. Create and edit timestamps must be absolute ISO instants with explicit `Z` or an offset; a strict wall-calendar check rejects rollover dates such as February 30, zone-less inputs and invalid offsets before normalizing to UTC. IANA timezone is validated separately for display.

`event.edit` takes `eventId`, `expectedSequence`, and a partial event-details patch. Only the actual host or a global administrator may edit or cancel. The conference, host, RSVP arrays, sequence/status and check-in signals cannot be forged. A stale sequence returns `ABORTED`; a normalized no-op does not increment the version or notify anyone. Edits may retain an ongoing event's past start, but its end must still be in the future. Completed events cannot be edited or cancelled. URL `''` clears a link. Finite capacity cannot drop below confirmed attendees; increases and open capacity promote the FIFO waitlist up to the 1,000-attendee system limit, preserving at most 500 waiting members.

`event.cancel` takes `eventId`, `expectedSequence`, and an optional reason of at most 500 characters. It retains the event, attendees, waitlist, calendar UID and prior attendance history; cancellation is terminal. A subsequent authorized cancel returns the existing state even when its supplied version is stale, without another version or notice. New RSVPs, promotions and check-ins stop. Existing members can withdraw from cancelled or completed events without promotion; full attendee/waitlist bounds never prevent withdrawal. Check-ins require an active target and occur only from six hours before start through 24 hours after end, in addition to the approved-organizer/global-role policy. Previously confirmed attendance is retained for review rather than silently rewriting trust history.

Each real edit/cancellation transaction also writes a deterministic server-only `eventChangeJobs` outbox containing at most 1,500 affected recipients. The creation trigger processes pages of 50, with cursor and deterministic recipient notices committed together; a scheduled recovery worker advances up to 20 pending jobs by two pages every five minutes. Superseded versions stop before sending obsolete updates. Critical change, cancellation and promotion notices remain in-app when reminder preferences are off; quiet hours still suppress push. Active-account/block checks apply at fanout and event status/version is rechecked immediately before push. Completed/superseded jobs expire through bounded worker cleanup after seven days, without a paid TTL requirement.

Reminder candidate queries do not authorize delivery: each notice transaction rereads the current event, RSVP and user settings. A reminder ID includes the actual start instant, so rescheduling permits a fresh reminder while cosmetic edits do not duplicate it. Generic in-app reminder text directs users to the latest details rather than retaining an outdated venue. Cancellation, rescheduling or withdrawal revokes stale reminder push eligibility; already delivered OS notifications cannot be recalled. Account deletion scrubs outbox recipients/actors with cursor adjustment, cancellation actors and check-in ownership, and prevents cancellation-time waitlist promotion. Export includes `hostedEvents` and `waitlistedEvents` alongside attendee events.

## Trust and privacy

Trust uses account standing (10), verified email (20), completed profile (10), account tenure (up to 20), accepted connections (up to 10), and organizer-confirmed attendance (up to 20). Repeated low-effort posting and unreviewed reports add no points or penalties. A server-only reviewed moderation penalty can reduce the score. Trust never verifies a professional credential, personal safety, or identity. The `verified` badge and historical founding year are not client editable and are never automatically inferred from this score.

Trust inputs, rate counters, idempotency receipts, Expo tokens, deletion jobs and profile-access grants are denied to all direct client reads/writes. Each member can read their own private role through their user document; roles are never client writable. Moderators can read reports and appeals. Push notifications use generic lock-screen text for DMs, respect quiet hours and event-reminder settings, and remove unregistered Expo devices. Production push requires a physical-device development build and Expo push credentials. Unregister the device token before signout/account switching.

Two real scheduled workers generate in-app notices: `sendCommunityDigests` runs hourly and sends daily highlights at 9am in the saved timezone, or weekly highlights Monday at 9am. It honors channel/topic follows, mutes, blocks, read markers and private membership. Highlights use the latest 1,000 messages/posts from the last seven days; these are bounded recent highlights rather than a guaranteed complete archive. `sendEventReminders` runs every five minutes and notifies opted-in RSVP attendees about events starting within 30 minutes. Stable notification IDs make worker retries idempotent. Quiet hours suppress push delivery while retaining the in-app notice. No email/SMS messages are sent.

Account export is paginated: request the collection names returned by the initial response until each `nextCursor` is null. The `contributions` export queries the server-maintained `posts.contributorIds` index and returns only the caller's comments, post vote, and selected poll-option IDs. It excludes other members' comments/votes and the post author's text. Comment/vote/poll mutations and deletion cleanup recompute this index; clients cannot supply it. Relationship cursors support directional IDs containing `~`. New deployments start with no historical content; legacy/imported posts must be normalized with `withContributors` before their contribution export is discoverable.

Account deletion disables authentication, deletes authored messages/posts and private edges, removes private memberships, follows/blocks/access grants, corrects membership and accepted-connection signals, releases RSVP capacity to the waitlist, scrubs embedded post comments/votes/polls and message reactions, anonymizes hosted events/community/channel ownership, removes the user's private document tree/profile/trust data, and deletes Firebase Auth. Mutable shared arrays are reread and changed in transactions so cleanup cannot overwrite another member's concurrent activity. A small completed deletion-job marker retains the UID and completion timestamp for operational idempotency; no content is retained there. Audit external integrations separately before enabling them.

## Private images

The image pipeline accepts JPEG, PNG and WebP still images up to 5 MiB. `uploadMedia` takes a target `{kind:'channel'|'squad'|'directMessage'|'community',id}`, a matching MIME type, canonical base64 without a data-URL prefix, and a stable request ID. Authorization and upload quotas run before pixel decoding. Raw bytes stay in function memory and are never stored or logged. Requests use 512 MiB, concurrency one and at most three instances.

Sharp checks signatures, decodes with strict warnings, rejects animations and images above 12 million input pixels, rotates pixels, resizes to at most 2,048 pixels per side, and fully re-encodes to a WebP of at most 1 MiB. EXIF/ICC and trailing input payloads are not copied. This is a restricted image transformation pipeline, not an antivirus or content-safety certification. Other file types remain unsupported. [Sharp input safety options](https://sharp.pixelplumbing.com/api-constructor/).

All direct Storage reads/writes remain denied. Only Admin saves the sanitized output without Firebase download-token metadata. Firebase client upload endpoints are intentionally unused. `privateMedia` metadata is server-only. A UID/request-ID/hash claim makes identical retries return the original image and rejects a changed payload under the same request ID; a newer processing claim prevents a stale encoder from finalizing it. There are at most five outstanding images per member, 10 upload attempts per minute and 100 per UTC day.

Send commands accept only `imageId`, never user-supplied image metadata or URLs. The server atomically checks the ready image's owner, exact destination, one-use link and one-hour expiry, then attaches bounded metadata to a channel/Squad/DM message or community post. A nonempty caption is required. Local picker bytes can provide an unsent preview; unlinked server images cannot be retrieved through `getMedia`.

`getMedia` rechecks the linked source and its current access: channel membership, Squad membership plus captured audience, DM participants, or an active account for public posts. The source must still carry that image ID. Moderators may pass only a report ID whose verified snapshot contains that exact linked image; their role does not open other private images. Source deletion denies retrieval immediately, including moderation retrieval. A response carries WebP base64 and dimensions, never a persistent download URL. Client caches must clear on authentication, selection, membership and block changes. Viewing is limited to 120 requests/30 MiB per minute and 10,000 requests/500 MiB per UTC day per member.

`cleanupPrivateMedia` runs every five minutes, prioritizing expired unlinked/failed uploads in bounded pages, then sweeping linked sources with a persisted cursor. Unlinked ready images expire after one hour; missing source records trigger deletion. Cleanup claims the metadata before deleting only that owner's image namespace. Account deletion removes owned images; an encoder still in flight keeps a short inaccessible cleanup tombstone until its three-minute claim expires, so late output is swept again. All operations are retry safe. Account exports retain image metadata in the member's authored records; image retrieval still requires current source authorization.

The standalone local Storage fixture uses `firebase.media-test.json` and port 9198. Start it only with project `demo-theloop-integration`; start Auth/Functions with the same project, `FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9198` and bucket `demo-theloop-integration.firebasestorage.app`. With Firestore on 53991, Auth on 9098 and Functions on 5019, run `THELOOP_MEDIA_INTEGRATION=1 pnpm --filter @theloop/functions test:media:integration`. The suite refuses non-loopback endpoints and cleans only its disposable UID/ID namespaces. Ordinary callable integration separately uses `THELOOP_INTEGRATION=1` and `test:integration`. Windows cold starts can use `FUNCTIONS_DISCOVERY_TIMEOUT=120`. Production image Functions/Storage remain undeployed until billing is authorized.

## Production provisioning

For the **free Spark stage**, deploy only Firestore rules and ordinary indexes:

```sh
node scripts/prepare-spark-config.mjs
firebase deploy --project theloop-community-2026 --config firebase.spark.json --only firestore:rules,firestore:indexes --non-interactive
```

The helper derives the index file from the canonical configuration and excludes the paid TTL override. `firebase.spark.json` contains no Functions/Hosting/Storage deployment targets. Do not deploy the full TTL configuration or enable Cloud Functions/Run/Build before billing authorization. Firestore's first Standard database can use the free quota; TTL, backups and PITR require billing. [Firestore quota documentation](https://firebase.google.com/docs/firestore/quotas).

The public `identityPlatform:initializeAuth` administrative endpoint is restricted to billing-enabled projects. When basic Firebase Auth has not been initialized on Spark, use the Firebase console's Authentication setup instead of invoking that paid-platform initialization route. [Official initialization endpoint](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.identityPlatform/initializeAuth).

After billing is approved and Authentication is configured:

1. Create a dedicated Firebase project; do not reuse other customer/community projects.
2. Enable Firestore Native mode, Firebase Auth Email/Password (and optional Google), add the web/mobile app, and set authorized web domains.
3. Configure client public Firebase values. Keep service-account and Expo server tokens out of source and client bundles.
4. Enable billing only through an authorized account flow if required by Cloud Functions. Verify region and quotas before deployment.
5. Deploy rules/indexes and built functions with an explicitly named project: `firebase deploy --project <theloop-project-id> --only firestore,functions`. Enable Firestore TTL for `requests.expiresAt` (included in index configuration).
6. Sign in with the real community owner's account; allow `bootstrap` to create the empty real profile.
7. Review the first-AfroTech initializer below with Application Default Credentials (or an ephemeral `FIREBASE_ADMIN_ACCESS_TOKEN` environment value). It defaults to a dry run. Apply only after the real owner has signed in, verified their email and completed bootstrap. The explicit apply creates only the first hub/chat and grants that owner the private admin role in the same transaction.
8. Enable App Check for released clients and set `THELOOP_ENFORCE_APP_CHECK=true` before production callable deployment. Emulator/development clients need registered debug providers. The web/mobile app must initialize App Check before this switch is enabled.
9. Run emulator rules tests and a two-account live smoke test covering membership, private messages, blocked requests, vote uniqueness and capacity before inviting the community.

Production does not claim that four years of historical GroupMe messages, member lists or event calendars have been imported. Migration requires the owner's authorized export, a consent/retention plan, a preview with duplicate detection, and a reviewed import job.

### First live group chat: AfroTech 2026

The live initializer prepares exactly these two records:

- `conferences/afrotech`: **AfroTech 2026**, Houston, TX, **November 2–6, 2026**. The description identifies this as a community-run hub and names the George R. Brown Convention Center. No session hours are invented.
- `channels/afrotech-general`: **AfroTech group chat**, with **General**, **Introductions**, **Jobs & referrals**, **Side events** and **Travel** topics. Its `public` visibility means any signed-in active TheLoop member can read it; no private membership is fabricated.

The [official AFROTECH conference site](https://afrotechconference.com/) and [official FAQ](https://afrotechconference.com/faqs) confirm the date range, city and venue (checked October 26, 2026). TheLoop's hub is an independent community space, not an official AFROTECH/Blavity product or schedule. Use the [official schedule](https://afrotechconference.com/schedule) for conference programming. No schedule or historical community content is imported by initialization.

First review the explicit project, owner UID, full two-record catalog and proposed owner admin grant:

```sh
pnpm --filter @theloop/functions seed:live --project theloop-community-2026 --owner <real-owner-uid> --dry-run
```

The owner must exist in Firebase Auth, have a verified email and remain active. Their matching `users/{uid}` and `profiles/{uid}` bootstrap records must already exist; disabled or deletion-pending private accounts are refused. The script does not create an Auth account or profile. It refuses emulator settings, non-TheLoop project names, missing/repeated identity arguments and unknown options. Dry runs perform reads only and never grant a role.

With `FIREBASE_ADMIN_ACCESS_TOKEN`, Admin Auth uses the existing short-lived bearer and Firestore uses an OAuth2 client carrying that same in-memory token. This avoids Admin's certificate-only Firestore factory restriction without creating a service-account key, refresh token or credential file. Supply a fresh token if it expires. Without this variable, the normal Application Default Credentials path remains unchanged.

After reviewing that output and confirming the actual owner UID, apply explicitly:

```sh
pnpm --filter @theloop/functions seed:live --project theloop-community-2026 --owner <real-owner-uid> --apply
```

Apply creates missing records with `transaction.create` and grants the supplied owner `users/{uid}.role = 'admin'` atomically. Existing owner preferences and profile data are preserved. Exact same-owner catalog reruns verify and skip those records, preserving their live member counts, creation timestamps and additional moderators. If the fixed IDs already contain conflicting metadata, ownership or community scope, the whole operation fails before any write; inspect and resolve that conflict separately. It never overwrites catalog records or deletes earlier resources. Both member counts start at zero and change only through actual member actions; no owner subscription, posts, messages, communities, RSVP history or other conference is fabricated.

Run the initializer's isolated guard/idempotency tests without connecting to any Firebase project:

```sh
pnpm --filter @theloop/functions exec tsx --test test/liveCatalog.test.ts
```
