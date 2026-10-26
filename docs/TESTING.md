# Test TheLoop

Run `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root. Unit suites cover domain transitions, authorization, trust, cleanup, notifications, author controls, report context and pagination helpers. `pnpm --filter @theloop/mobile export:native` builds both native bundles. See the mobile README for installed-device checks.

Without Firebase environment values, both clients open fictional sample data and persist only on the device. Run `pnpm dev` or `pnpm mobile`. No sample actions create cloud users or messages. The private published sample is https://theloop-community.h2vmw6.chatgpt.site and requires the owner's ChatGPT sign-in. The latest installed preview is [Android0.2](https://expo.dev/accounts/keithazodeh/projects/theloop-community/builds/f865aa5b-23a3-4113-b6e8-40d336a89ec4), exact8a2df83; the private site serves that same source. They include Squads, public Guide discovery and photos. Newer DM/targeted-link/date-entry work is currently available from main source; check BUILD_STATUS.md before assuming it is in the installed APK.

## Firestore rules and cursor queries

Start an isolated loopback Firestore emulator with a demo project. `FIRESTORE_EMULATOR_HOST` must name its loopback host and port. Run `pnpm --filter @theloop/functions test:rules` and `pnpm --filter @theloop/client test:pagination`. The suites use separate named demo namespaces and remove only their own fixtures. The cursor suite exercises 301 equal-timestamp topic messages, a room outside the preview window, a 111-person directory, private exclusions and access revocation.

CI runs these inside a dedicated Firebase emulator process. Do not point tests at the deployed TheLoop project or clear an unrelated emulator database.

For a long-lived local test server, build Functions and run `firebase emulators:start --config firebase.integration.json --project demo-theloop-integration --only auth,firestore,functions,storage`. This root-level config keeps rules and source paths inside the Firebase project directory. It binds only loopback, using Firestore53991,Auth9098,Functions5019 andStorage9198. Set `FUNCTIONS_DISCOVERY_TIMEOUT=120` for a cold Windows start. The test runners still require their explicit demo-namespace/loopback flags; this config does not deploy anything.

The production predeploy hook runs `node scripts/build-functions.mjs`, which invokes the project compiler directly and propagates its exit status. This avoids a workspace filter reporting success without compiling in an isolated Windows release checkout. Set `FUNCTIONS_DISCOVERY_TIMEOUT=120` for cold Windows deployment analysis as well as emulator startup.

## Real callable integration

Build Functions and start loopback Auth, Firestore and Functions emulators under `demo-theloop-integration`. The test is disabled unless `THELOOP_INTEGRATION=1`. Supply `THELOOP_INTEGRATION_FUNCTIONS_HOST`, `THELOOP_INTEGRATION_AUTH_HOST` and `THELOOP_INTEGRATION_FIRESTORE_HOST` explicitly, then run `pnpm --filter @theloop/functions exec tsx --test test/integration.test.ts`. Only the exact demo namespace and loopback addresses are accepted. Tests create temporary accounts and fixture IDs, then clean up those IDs.

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


## Expo0.3 release checkpoint
Native source46c7bee adds dark/light appearance, motion, new branding, a first-visit guide and visible Group chats navigation, with tutorial scroll/reduced-motion/background-read fixes. Both native exports and typecheck pass; CI forf950035 passes with this same implementation. Android0.3.0/build3 is queued at https://expo.dev/accounts/keithazodeh/projects/theloop-community/builds/c8b628c7-b12c-4286-a7a1-a622d52d5619 . Until that job finishes and its APK is verified, the existing v2 APK/default install QR remain the last verified installation and do not include these UI updates. In the native source, replay the tour under You, test a light/dark toggle inside an unsent compose draft, reload to check preference persistence, scroll the tutorial footer and advance to check top reset, then background a conversation and check unread state on return. Physical device OS/push/calendar/share/deep-link checks remain required. Automation is paused at the requested80% usage threshold; no paid queue upgrade was made.
