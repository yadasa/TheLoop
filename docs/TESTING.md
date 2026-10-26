# Test TheLoop

Run `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root. Unit suites cover domain transitions, authorization, trust, cleanup, notifications, author controls, report context and pagination helpers. `pnpm --filter @theloop/mobile export:native` builds both native bundles. See the mobile README for installed-device checks.

Without Firebase environment values, both clients open fictional sample data and persist only on the device. Run `pnpm dev` or `pnpm mobile`. No sample actions create cloud users or messages. The current private published sample is https://theloop-community.h2vmw6.chatgpt.site and requires the owner's ChatGPT sign-in. The first APK is available from the [EAS build](https://expo.dev/accounts/keithazodeh/projects/theloop-community/builds/2bcffbdb-8b46-456b-9989-5c2fbe5463f8); its baseline commit is e2fff2b.

## Firestore rules and cursor queries

Start an isolated loopback Firestore emulator with a demo project. `FIRESTORE_EMULATOR_HOST` must name its loopback host and port. Run `pnpm --filter @theloop/functions test:rules` and `pnpm --filter @theloop/client test:pagination`. The suites use separate named demo namespaces and remove only their own fixtures. The cursor suite exercises 301 equal-timestamp topic messages, a room outside the preview window, a 111-person directory, private exclusions and access revocation.

CI runs these inside a dedicated Firebase emulator process. Do not point tests at the deployed TheLoop project or clear an unrelated emulator database.

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

Calendar permissions, push registration/delivery, OS share sheets, haptics and native deep links require a physical device. Export success and phone-sized browser screenshots do not establish these checks.
