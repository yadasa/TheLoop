# TheLoop mobile

Native React Native application on Expo SDK 58. Web and mobile share the domain model, validation, sample state and Firebase client through workspace packages.

## Try it

From the repository root:

```sh
pnpm install
pnpm mobile
```

Use an installed SDK 58 development build for reliable device testing. Expo's [SDK 58 release notes](https://expo.dev/changelog/sdk-58) say the matching Expo Go store release follows the SDK release; use Expo Go only when your installed version supports SDK 58. The phone and development computer must be on the same network. If LAN discovery is blocked, start `pnpm --filter @theloop/mobile start --tunnel`. A tunnel requires Expo's tunnel dependency and an internet connection.

The app starts in **SAMPLE LOOP** mode when no Firebase API key is configured. All people, messages, reputation and events are fictional. Actions persist in AsyncStorage on the device. Reset sample data under **You** to start over. This lets the native interactions be tested immediately without creating accounts or touching production data.

For live accounts, copy `.env.example` to `.env.local`, fill in the dedicated TheLoop Firebase public app configuration, and restart Expo. These are public Firebase client identifiers; never put Admin SDK credentials or service account keys in the app. Deploy the backend and its security rules before attempting live use. Live data starts empty until the community's actual catalog is provisioned.

For local Firebase emulator testing, set `EXPO_PUBLIC_EMULATOR_HOST` to your computer's LAN IP (for example `192.168.1.50`) when using a physical phone. `127.0.0.1` on a phone refers to the phone itself. Firebase emulators bind to loopback by default; set the auth, Firestore, and Functions emulator `host` fields in your local Firebase configuration to the LAN interface and make the ports reachable on your local network. Auth defaults to `9099`, Firestore to `8080`, and Functions to `5001`; the `.env.example` port variables can override them. Use a demo Firebase app configuration for emulator tests, such as API key `demo-api-key`, project ID `demo-theloop`, and auth domain `demo-theloop.firebaseapp.com`. Run the emulator CLI with `--project demo-theloop`, never an existing production project.

## Build an installable preview

```sh
cd apps/mobile
npx eas-cli login
npx eas-cli build --profile preview --platform android
```

The preview profile produces an Android APK for internal testing. An iOS internal build requires an Apple developer account, registered devices and signing credentials. `npx eas-cli build --profile preview --platform ios` follows the interactive signing workflow. The repository does not contain signing credentials or an EAS project ID; EAS associates the project with the account you choose during setup.

For a development build that connects to the local Metro server, use `npx eas-cli build --profile development --platform android` (or `ios`), install it, then run `pnpm --filter @theloop/mobile start --dev-client`. Configure the public Firebase environment variables in your selected EAS environment for a live cloud build; an ignored local `.env.local` is not automatically uploaded to EAS.

Remote push notifications require a physical device, an EAS project and a development/preview build with push credentials. They are explicitly opt-in under **You → Privacy & notifications**. Expo Go is not a remote-push test environment. The app stores the device registration so it can unlink it before signing out or switching accounts, including after restarting the app. [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)

## Native verification

```sh
pnpm --filter @theloop/mobile typecheck
pnpm --filter @theloop/mobile export:native
```

Native bundle export verifies module resolution for both platforms. It does not replace an installed-device test or App Store review. Calendar permission, OS share sheets, haptics and deep links must be exercised on a device.

## Interaction checks

1. Pick interests and rooms in onboarding. Browse Home, switch feed/community filters, vote, save, reply, post a win, and vote in a poll.
2. Open Chat, choose a conference and room, then a topic. Follow, mute and hide independently. Create a topic, send a message, reply, react, edit and delete your own message. Explicit mutes must persist after reopening the app.
3. In Events, compare global, conference and My plans scopes. Switch list/month views, choose a date, inspect a plan and RSVP. Fill a small event to test waitlisting, then cancel an RSVP to test promotion. Add an event through the OS calendar dialog and share it.
4. In People, inspect shared-interest suggestions, send a request, accept an incoming request, follow, view social links, and start a private conversation. Block a member and confirm content disappears.
5. Edit the professional profile, change profile visibility, inspect trust reasons, submit a live trust review request, change notification/DM preferences and quiet hours, and export personal information as a JSON file through the native share sheet. The export file is written inside the app's private cache and replaced by the next export.
6. Reopen the app to check persistence. In an installed build, test `theloop://post/<id>`, `theloop://event/<id>`, `theloop://channel/<id>` and `theloop://profile/<id>` against existing record IDs. Expo Go uses Expo's development URL rather than registering the custom app scheme.
7. With a moderator test account, create a private room, invite a member, remove that member, and verify an outsider cannot read it. Review a message/post report. Admins can create conference hubs. Only an approved conference organizer or global moderator/admin can confirm event attendance for trust; self-confirmation is denied.

The native UI uses native views, input controls, modal navigation and platform share/calendar APIs. It is not a website embedded in a WebView.
