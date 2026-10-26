# TheLoop mobile

Native React Native application on Expo SDK 58. Web and mobile share the domain model, validation, sample state and Firebase client through workspace packages.

## Try it

From the repository root:

```sh
pnpm install
pnpm mobile
```

Use an installed SDK 58 development build for reliable device testing. Expo's [SDK 58 Go installation page](https://expo.dev/go?platform=android&sdkVersion=58&device=true) links to the Android store release. Your Expo Go installation must support SDK 58; use an internal preview APK if it does not. The phone and development computer must be on the same network when using Metro. If LAN discovery is blocked, start `pnpm --filter @theloop/mobile start --tunnel`. A tunnel requires Expo's tunnel dependency and an internet connection.

The app opens in dark mode. The sun/moon control in the main header and every screen switches between dark and light, including sign-in and onboarding; **You → Privacy & notifications** also has an appearance control. This explicit choice is saved on the device independently of Firebase or account data. Forms and app status bars follow the choice; image viewing deliberately keeps a dark canvas, and external system dialogs may follow device settings.

A first-visit quick tour makes **Group chats** explicit and offers **Open group chats** immediately. Skip saves your place without repeated prompts. Reopen **Your quick tour** under **You** to resume; completion is versioned and stored locally. Shared incoming links and initial account onboarding take priority over the tour. Transitions respect reduced motion.

The app starts in **SAMPLE LOOP** mode when no Firebase API key is configured. All people, messages, reputation and events are fictional. Actions persist in AsyncStorage on the device. Reset sample data under **You** to start over. This lets the native interactions be tested immediately without creating accounts or touching production data.

Firebase and native auth persistence initialize only when live configuration is present. The module-stable `loadAuthPersistence` factory keeps sample startup independent of the Firebase runtime; the installed app still uses AsyncStorage auth persistence for live accounts.

For live accounts, copy `.env.example` to `.env.local`, fill in the dedicated TheLoop Firebase public app configuration, and restart Expo. These are public Firebase client identifiers; never put Admin SDK credentials or service account keys in the app. Deploy the backend and its security rules before attempting live use. Live data starts empty until the community's actual catalog is provisioned.

Set optional `EXPO_PUBLIC_WEB_URL` to your own deployed web app (for example `https://your-web-domain.example`) to share links that also open in a browser. Without it, sharing uses the installed app's `theloop://` scheme. Native incoming links also understand web hash routes such as `#/post/<id>`, `#/calendar/<id>`, `#/profile/<id>`, and `#/conversations/<id>?topic=<topic>`, plus legacy `?post=<id>` and `?event=<id>` links. A shared link waits for sign-in and initial onboarding, and grants no room or Squad membership. Post/event details load the exact record independently of recent feed/calendar pages; a loading or network/permission error is distinct from a confirmed missing record and offers retry.

For local Firebase emulator testing, set `EXPO_PUBLIC_EMULATOR_HOST` to your computer's LAN IP (for example `192.168.1.50`) when using a physical phone. `127.0.0.1` on a phone refers to the phone itself. Firebase emulators bind to loopback by default; set the auth, Firestore, and Functions emulator `host` fields in your local Firebase configuration to the LAN interface and make the ports reachable on your local network. Auth defaults to `9099`, Firestore to `8080`, and Functions to `5001`; the `.env.example` port variables can override them. Use a demo Firebase app configuration for emulator tests, such as API key `demo-api-key`, project ID `demo-theloop`, and auth domain `demo-theloop.firebaseapp.com`. Run the emulator CLI with `--project demo-theloop`, never an existing production project.

## Build an installable preview

The verified Android preview is [0.3.0, build 3](https://expo.dev/artifacts/eas/3myzZDxLMUjtLFFnIkTnXffLjtNtVuHAincGf7euhj0.apk), built from `46c7bee99363b8237ab555fd07c09d16eab65085`. [EAS build details](https://expo.dev/accounts/keithazodeh/projects/theloop-community/builds/c8b628c7-b12c-4286-a7a1-a622d52d5619) confirm completion on October 26, 2026. The downloaded APK passed ZIP integrity, manifest version/package, Hermes and four native ABI checks. Its SHA256 is `54ADF39C89A8770EC624E798DBA2C5E0C1E30BB51EF304FCFCB598EDA5B7A274`. This establishes the artifact contents; installed-device behavior still needs the checks below.

If Metro file watching times out on Windows, run `pnpm --filter @theloop/mobile start:stable` from the repository root. This optional preview mode uses two workers and disables file watching through Expo's CI mode. Restart it after source changes. It uses port 8097 and Expo Go; enter `exp://YOUR_COMPUTER_LAN_IP:8097` on your phone. The normal `pnpm mobile` command retains hot reload. Preview metadata is version **0.3.0**, Android version code **3**, and iOS build number **3**.

```sh
cd apps/mobile
npx eas-cli login
npx eas-cli build --profile preview --platform android
```

The preview profile produces an Android APK for internal testing. The project is registered as [`@keithazodeh/theloop-community`](https://expo.dev/accounts/keithazodeh/projects/theloop-community); `app.json` contains its public owner and project ID. Signing credentials remain in EAS and are not in the repository. The first Android preview built successfully on October 26, 2026; get current builds from the project dashboard. An iOS internal build requires an Apple developer account, registered devices and signing credentials. `npx eas-cli build --profile preview --platform ios` follows the interactive signing workflow.

For a development build that connects to the local Metro server, use `npx eas-cli build --profile development --platform android` (or `ios`), install it, then run `pnpm --filter @theloop/mobile start --dev-client`. Configure the public Firebase environment variables in your selected EAS environment for a live cloud build; an ignored local `.env.local` is not automatically uploaded to EAS.

Remote push notifications require a physical device, an EAS project and a development/preview build with push credentials. They are explicitly opt-in under **You → Privacy & notifications**. Expo Go is not a remote-push test environment. The app stores the device registration so it can unlink it before signing out or switching accounts, including after restarting the app. [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)

## Native verification

```sh
pnpm --filter @theloop/mobile typecheck
pnpm --filter @theloop/mobile export:native
```

Native bundle export verifies module resolution for both platforms. It does not replace an installed-device test or App Store review. Calendar permission, OS share sheets, haptics and deep links must be exercised on a device.

## Interaction checks

1. Pick interests and rooms in onboarding. Refine your loop and deselect a followed room; it should become muted while existing hidden rooms stay hidden. Browse Home, switch feed/community filters, vote, save, reply, post a win, and vote in a poll. Edit your own post and reply, then remove them with the confirmation. Report another reply and verify it targets that reply only.
2. Open Chat, choose a conference and room, then a topic. Follow, mute and hide independently. Create a topic, send a message, reply, react, edit and delete your own message. Explicit mutes must persist after reopening the app. In a live room with more than 100 messages, load earlier history; selecting a topic should retrieve its own history.
3. In Events, compare global, conference and My plans scopes. Switch list/month views, choose a date, inspect a plan and RSVP. Fill a small event to test waitlisting, then cancel an RSVP to test promotion. Add an event through the OS calendar dialog and share it. When hosting, choose the event's IANA timezone and verify impossible calendar dates, skipped/repeated daylight-saving times, invalid websites/capacity, and duplicates show inline errors. Use an explicit UTC offset to choose a repeated local time. Description is optional. As host/admin, edit event details, clear its website, and confirm an unchanged ambiguous time keeps its original instant. The conference is fixed; finite capacity cannot drop below confirmed attendance. Live edits retain their initial version and draft, show a conflict when another edit arrives, and require an explicit reload before overwriting. Cancel with an optional reason and explicit confirmation; the event, attendee list and calendar file remain available, while edit/join/check-in controls close. Your own RSVP can still be withdrawn. Device calendar entries need manual updating/removal; sharing the latest ICS preserves its UID, status and revision.
4. In People, inspect shared-interest suggestions, send a request, accept an incoming request, follow, view social links, and start a private conversation. Block a member and confirm content disappears.
5. Edit the professional profile, change profile visibility, inspect trust reasons, submit a live trust review request, change notification/DM preferences and quiet hours, and export personal information as a JSON file through the native share sheet. The export file is written inside the app's private cache and replaced by the next export.
6. Reopen the app to check persistence. In an installed build, test `theloop://post/<id>`, `theloop://event/<id>`, `theloop://channel/<id>?topic=<topic>` and `theloop://profile/<id>` against existing record IDs. Test a cold link while signed out, then sign in and complete onboarding; the intended detail should open. Try an older post/event outside the recent window, a removed record, and offline retry; no unrelated cached record should appear. Expo Go uses `exp://YOUR_COMPUTER_LAN_IP:8097/--/post/<id>` rather than registering the custom app scheme.
7. With a moderator test account, create a private room, invite a member, remove that member, and verify an outsider cannot read it. Review a message/post report. Admins can create conference hubs. Only an approved conference organizer or global moderator/admin can confirm event attendance for trust; self-confirmation is denied.
8. In Chat → Your squads, create a private squad and invite an accepted connection. Verify they remain invited until they accept. Review the invitation disclosure, accept or decline, and compare the visible history before and after joining. Send, reply, edit, react, and mute message alerts. In Members, edit details as host, revoke an invitation, remove a member, transfer ownership, and leave. Only messages whose captured audience includes the current member are readable; blocked pairs do not receive each other's new content. Leaving a hosted squad transfers ownership to the longest-standing remaining member, or archives the squad when nobody remains. Invitations expire after seven days; active members plus reserved invitations cannot exceed twelve.

9. Open **Chat → Private conversations**. The inbox uses a separately paged conversation catalog, so an older peer remains discoverable when other peers fill the recent message window. Use **Load more conversations**, and **Find earlier conversations** to advance one bounded legacy-history batch at a time; progress and retry remain visible. Search covers loaded conversations. Verify unread counts clear after reading and remain correct when older messages load. In a private conversation, edit and delete your own message, mute that peer's alerts, then block them and confirm their conversation disappears. With a live history of more than 100 messages, load earlier messages without jumping to the bottom. Name/initial snapshots can identify a participant while their professional profile stays private.

The native UI uses native views, input controls, modal navigation and platform share/calendar APIs. It is not a website embedded in a WebView.
