# Test TheLoop

Run `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root. Unit suites cover domain transitions, authorization, trust, cleanup, notifications, author controls, report context and pagination helpers. `pnpm --filter @theloop/mobile export:native` builds both native bundles. See the mobile README for installed-device checks.

The latest verified Android download is [LIVE 0.4.0, build 6](https://expo.dev/artifacts/eas/PZn7BdUgOYWQLBVs4XtVDJFc8mzWdjlfy61j4oQbvQc.apk), built from `ecbeae8052c519e99c745a42c325f2d77cf5748c`. It connects to the real TheLoop project. This release includes the current Expo visuals/tutorial, profile photos and QR cards, personal saved messages, moderator pins, topic read state, reply views, notification filters, sharing, DM/Squad search and date dividers, session message/photo/post drafts, offline feedback and larger tap targets. The APK passed ZIP integrity, package/version, non-debuggable configuration, Hermes and four-ABI checks; its embedded public Firebase fields match the dedicated live project. SHA256: `D15B610C8BDBFAEC06E68FE1BE10D0B1306A11D93F87250F7D77ABCDD3925D5D`. Actual phone behavior is still a device verification gate.

For fictional sample data on this computer, run `pnpm --filter @theloop/mobile start:stable` and open http://localhost:8097/. For the signed-in live Expo preview, use http://127.0.0.1:8109/. Sample actions stay on the device; actions in LIVE community mode are real. Older APKs and the private published web sample are historical snapshots, not this Expo release.

## Firestore rules and cursor queries

Start an isolated loopback Firestore emulator with a demo project. `FIRESTORE_EMULATOR_HOST` must name its loopback host and port. Run `pnpm --filter @theloop/functions test:rules` and `pnpm --filter @theloop/client test:pagination`. The suites use separate named demo namespaces and remove only their own fixtures. The cursor suite exercises 301 equal-timestamp topic messages, a room outside the preview window, a 111-person directory, private exclusions and access revocation.

CI runs these inside a dedicated Firebase emulator process. Do not point tests at the deployed TheLoop project or clear an unrelated emulator database.

For a long-lived local test server, build Functions and run `firebase emulators:start --config firebase.integration.json --project demo-theloop-integration --only auth,firestore,functions,storage`. This root-level config keeps rules and source paths inside the Firebase project directory. It binds only loopback, using Firestore53991,Auth9098,Functions5019 andStorage9198. Set `FUNCTIONS_DISCOVERY_TIMEOUT=120` for a cold Windows start. The test runners still require their explicit demo-namespace/loopback flags; this config does not deploy anything.

The production predeploy hook runs `node scripts/build-functions.mjs`, which invokes the project compiler directly and propagates its exit status. This avoids a workspace filter reporting success without compiling in an isolated Windows release checkout. Set `FUNCTIONS_DISCOVERY_TIMEOUT=120` for cold Windows deployment analysis as well as emulator startup.

## Real callable integration

Build Functions and start loopback Auth, Firestore and Functions emulators under `demo-theloop-integration`. The test is disabled unless `THELOOP_INTEGRATION=1`. Supply `THELOOP_INTEGRATION_FUNCTIONS_HOST`, `THELOOP_INTEGRATION_AUTH_HOST` and `THELOOP_INTEGRATION_FIRESTORE_HOST` explicitly, then run `pnpm --filter @theloop/functions exec tsx --test test/integration.test.ts`. Only the exact demo namespace and loopback addresses are accepted. Tests create temporary accounts and fixture IDs, then clean up those IDs.

## React provider startup recovery

On October 26, 2026, an independent browser harness mounted the actual `LoopProvider` and `useLoop` with existing React DOM/esbuild tooling, replacing only the dynamically loaded `firebaseRuntime` module with a deterministic in-memory SDK. All **11 provider-level scenarios passed** against the startup recovery implementation:

- Bootstrap failure blocks readiness; explicit retry bootstraps again and hydrates. Optional collection failure preserves readiness with an ordinary error.
- Signout during pending bootstrap and account switches reject late bootstrap, Auth and profile callbacks without restoring stale private data.
- Cached owner/settings documents wait for metadata-only server confirmation. Critical snapshot errors clear private caches/listeners while retaining the Auth observer for recovery.
- Missing/malformed owner profiles and malformed/empty preferences fail closed instead of authorizing defaults-only onboarding; signout and retry remain available.
- The actual 45-second initial-Auth timeout remains terminal after a late authenticated callback, then recovers only after explicit retry.

The harness also verified that transient account email follows the current Auth identity, clears on signout, remains available during a same-account startup error, and never enters serializable `LoopState`. Its first run exposed malformed owner profiles reaching readiness; the owner-profile validator fixed that observed failure before the complete passing run. The scratch harness is stored under ignored `work/provider-startup-harness`, with a report/screenshot in the task outputs. It created no production users, emails, network calls or backend writes, and did not touch the live preview on port 8109. This controlled-SDK React verification complements, rather than replaces, the real Firebase emulator suites and installed-device checks.

## Interaction checkpoint

1. Refine onboarding choices, deselect a followed room, and check that it becomes muted. Existing explicit hidden/muted choices must survive. Interest-only changes must preserve channel follows.
2. Write a post, edit it, add/edit/remove your reply, and delete the post with confirmation. Votes and community destination must survive text edits. Another member cannot edit it.
3. Open a busy room, select an older topic and load earlier messages. There must be no gaps/duplicates or jumps to the newest message during history loading. New messages scroll into view only while already near the bottom.
4. Search members by name, role or skill, page through results and open a targeted profile. A revoked private profile must disappear from caches. An empty search should explain how to try again.
5. Save an old post outside the feed window; reopen Saved and verify hydration. Unsave a deleted post without an error.
6. Report a specific reply or received private message. The report must share only its bounded excerpt with moderators. Removing a reported reply leaves its parent thread and other replies intact.
7. Sign out/switch accounts and ensure open routes, drafts and private content do not carry over. Native new-account onboarding must survive successful signup.
8. Open a private conversation, load older history, send/edit/delete your own message and mute the peer. Incoming author-only controls must not appear. A block hides the conversation and prevents new delivery. A message sent while a read marker is in flight must still be shown and handled after the first read completes.
9. Open an old post/event via a shared link; refresh and use browser back/forward. A cache-only miss must remain loading, server permission denial must show retryable error, and a confirmed deletion must disappear from feed/Saved. Resolving a post must not fetch its author's private professional profile. Hidden-room links must preserve the subscription choice.
10. Make a future plan in a different IANA timezone. Reject an impossible calendar date, a spring clock-change gap and an ambiguous repeated hour. Resolve a repeated hour with an explicit offset and verify displayed start/end zones; for example November1,2026,1:30AM America/Chicago at-05:00 through3AM shows CDT then CST. Capacity1001, HTTP links and overlong tags must be rejected before submitting. Repeat the same title/start and verify duplicate feedback without losing the form.

Calendar permissions, push registration/delivery, OS share sheets, haptics and native deep links require a physical device. Export success and phone-sized browser screenshots do not establish these checks.

## Private images

Choose a JPEG, PNG or WebP photo, add a caption and send it in a room, Squad, DM or post. Web/native prepare a bounded still WebP; sample mode persists only canonical bytes on this device (2MiB total). Verify reload, viewer close/focus, removal and blocked/left-squad visibility. Images outside the web viewport are fetched on approach rather than all at once.

Live uploads use authenticated callables and server Sharp normalization. There are no client Storage uploads or public download URLs. `functions/test/media.integration.test.ts` checks real Auth/Functions/Storage authorization, normalization, request retry, audience revocation, report-specific image access and cleanup. CI runs this and the main callable suite with `scripts/run-callable-integration.mjs`; the runner requires both opt-in flags, the exact demo namespace, loopback endpoints and zero skipped tests. See BACKEND.md for local emulator commands. Do not run integration fixtures against production.


## Expo 0.3 release checkpoint

Native source `46c7bee` adds dark/light appearance, motion, new branding, a first-visit guide and visible Group chats navigation, with tutorial scroll/reduced-motion/background-read fixes. Both native exports and typecheck pass; CI for `f950035` passes with this same implementation. [Android 0.3.0/build 3](https://expo.dev/accounts/keithazodeh/projects/theloop-community/builds/c8b628c7-b12c-4286-a7a1-a622d52d5619) finished at 14:41:25 UTC on October 26, 2026. The downloaded 71,780,854-byte APK passed ZIP CRC checks, manifest package `co.theloop.community` and version `0.3.0`/code `3`, non-debuggable release configuration, Hermes bytecode, and `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` library checks. SHA256: `54ADF39C89A8770EC624E798DBA2C5E0C1E30BB51EF304FCFCB598EDA5B7A274`.

Replay the tour under You, test a light/dark toggle inside an unsent compose draft, reload to check preference persistence, scroll the tutorial footer and advance to check top reset, then background a conversation and check unread state on return. The tour scroll regression passed in the native Expo-web renderer at 390×844. Physical-device OS/push/calendar/share/deep-link checks remain required; archive and bundle validation do not establish those results. V3 is now the default install QR/testing guide, with v1/v2 retained as backups. No paid queue upgrade was made.

## Android 0.4 acceptance pass

1. Open the LIVE build, sign in and navigate Home → Find the group chat → AfroTech group chat → General. Confirm the account and real hub load without sample people. Existing mute/hide choices should stay intact. Open the notification menu only if you want to change them.
2. Replay You → Quick tour, switch light/dark with an unfinished draft, and enable the device's reduced-motion setting. The draft must remain intact; motion should become static. Check keyboard/composer visibility on small phones and large text settings.
3. In a controlled conversation, prepare a text/photo draft, navigate away and resume it through Group chats → Drafts. Repeat with a community poll and photo. Cancel editing to restore the earlier draft. Successful sending or confirmed discard should remove the draft badge. Restarting/signing out intentionally clears session drafts.
4. Check copy text in another app, private image selection/cropping/viewing, and access revocation with a second account. Save a message, reopen it through Saved messages, edit/delete its source and check the result. Do not use a real private conversation as disposable test data.
5. Show You → Show my QR card. Scan from a second phone with TheLoop installed; check sign-in and profile privacy before opening. Verify conference/topic/event links and the native share sheet. The QR contains only a profile link.
6. Put a physical phone offline while drafting. The offline banner should appear, the draft should stay editable, and a failed send must not clear it. Reconnect and send explicitly. There is no promise of queued background delivery.
7. Check calendar month/day selection, RSVP conflicts, OS calendar insertion and the separate public Guide calendar flow. Event times must match the displayed host/device timezone.
8. Remote notifications remain a separate gate: configure FCM V1 credentials and App Check through their approved setup, register a real device with explicit opt-in, and verify delivery, mutes, blocks, read state and sign-out cleanup. Browser UI and successful APK export do not verify push delivery.

For broader release, finish two-account live privacy checks and a representative load test. Global indexed message search, voice/video/screenshare, rich non-image attachments, independent thread subscriptions and custom role matrices remain outside the current release; see the product map.
