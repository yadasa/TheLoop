# TheLoop infrastructure status

Verified on 2026-10-26 using project-scoped Google administrative APIs. This describes observed infrastructure, not application feature completeness.

| Resource                      | Observed state                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dedicated project             | `theloop-community-2026`, active                                                                                    |
| Firebase web app              | `TheLoop web`, registered                                                                                           |
| Firebase Android app          | `TheLoop Android`, `co.theloop.community`, ACTIVE; public config fetched to ignored `.cache/google-services.android.json` |
| Cloud Billing                 | User approved linking an existing account and delegated account choice; an eligible existing Firebase Payment account is linked and billingEnabled was verified true |
| Firestore API                 | Enabled through the authorized free setup                                                                           |
| Firestore database            | First `(default)` database created, Standard Native, `us-central1`, `freeTier: true`                                |
| PITR/backups/TTL              | PITR explicitly disabled and no backups configured; request TTL is declared in canonical indexes, but its live post-deployment field state was not re-read                                                 |
| Firebase Auth                 | Initialized through the free console flow; Email/Password provider visibly enabled; no users created or emails sent |
| Cloud Storage                 | Default theloop-community-2026.firebasestorage.app bucket created through the Firebase API in US-CENTRAL1 after billing approval |
| Cloud Functions / Run / Build | Deployment completed from clean3c4b493 source; all18 Node22/us-central1 functions verified ACTIVE |

The public Firebase SDK configuration is available only in the ignored local `.cache/firebase.public-sdk.json`. Account access/refresh tokens were read only into process memory and were neither printed nor written to project files.

The free database was created after explicit authorization to enable the free Firestore API. The initial `SERVICE_DISABLED` blocker was resolved. The user subsequently approved linking an existing billing account and authorized choosing one that accepts the link. The first account returned a precondition failure with billing still disabled; an eligible existing Firebase Payment account succeeded, and the project association was read back to verify billingEnabled=true. Cloud Functions, Run, Build, Artifact Registry, Eventarc, Scheduler, Pub/Sub, Storage and IAM APIs were then enabled for this dedicated project. No billing account, payment method, Codex credits or reset credits were purchased or created.

Basic Firebase Authentication was initialized through the authorized console flow using the existing project-owner account, and Email/Password is enabled. No Identity Platform upgrade was used. The original `CONFIGURATION_NOT_FOUND` blocker was resolved. A real owner must sign in/bootstrap before the guarded live catalog initializer can assign community ownership; no fictional live users will be substituted for that owner.

The first production attempt compiled rules but stopped before function publication because Windows source discovery exceeded its default10-second limit. Release deployment now uses FUNCTIONS_DISCOVERY_TIMEOUT=120 and a direct compiler predeploy hook. Functions runtime features passed103 unit tests,14 emulator rule tests and27 real callable/image integration checks before this deployment. The full production deployment completed after first-use source-bucket and Eventarc service-agent permissions propagated. All18 functions were read back as ACTIVE. Firestore rules/indexes and private Storage rules are released; Artifact Registry cleanup removes stale images after1day. Bootstrap preflight returns204 for the private site origin; an unsigned call returns401 UNAUTHENTICATED. No real account or catalog has been seeded.

The Firebase CLI confirmed that the Firestore-only Spark deployment completed successfully using `firebase.spark.json` and its generated index variant: rules released to `cloud.firestore` and 10 composite index definitions deployed. TTL was excluded. No Functions, Hosting, Storage, billing, or paid-platform targets were part of this deployment. The canonical full configuration remains available for the approved production deployment.

No four-year chat history, member directory, real profiles, messages, events, or fabricated member counts have been inserted into the live database.

## Native configuration preparation

The Expo app configuration now has an explicit mode. `apps/mobile/app.config.js` publishes only the validated public `extra.theloop` runtime configuration; it does not publish environment variables wholesale. The default and EAS `preview` profile are sample-only, even when unrelated Firebase identifiers are inherited. The existing sample launcher also clears inherited public/emulator variables and disables dotenv loading. EAS `livepreview` and `production` require `THELOOP_NATIVE_MODE=live`, all six public Firebase fields from `apps/mobile/.env.example`, and the dedicated project, domain, bucket, sender ID and app-ID namespace. Missing/wrong configuration stops configuration evaluation before bundling. No Admin credential belongs in these fields.

Metro's transform-cache version also includes a digest of the complete validated runtime and resolved public Expo configuration while preserving Expo's original cache version. This separates sample/live/emulator transforms, Firebase identity/endpoint changes and public app name/version/icon metadata. It fixes an observed Expo web Constants collision: the live server's native protocol manifest was correct, but its web bundle reused the sample server's inlined config from the shared transform cache. After restarting only the two owned previews, the actual served bundles concurrently inline sample on `8097` and live on `8109`. No global cache deletion is required. Check both the native protocol manifest and the served web bundle/browser when verifying mode; a correct manifest alone did not prove the rendered web app's configuration. Inherited `APP_MANIFEST` overrides are removed by the isolated launchers and rejected by direct build configuration, because Expo's inline-manifest transformer otherwise prefers them to the validated app config.

The override guard passed actual sample/live Expo public-config evaluation and a normal live Expo web export; exported Constants resolve to live. A hostile override was rejected before bundling. The installed Expo58 CLI/config source does not assign that override during its normal pipeline. These are configuration smoke checks, separate from the final exact native release exports.

Local validation from the repository root:

```powershell
node --test scripts/native-config.test.cjs
node node_modules/tsx/dist/cli.mjs --test scripts/native-runtime.test.ts
node scripts/start-native-live.mjs --public-firebase-config .cache/firebase.public-sdk.json --check
```

The first two commands cover build-time validation and the pure device-side runtime decoder, including cross-contract tests. The third reads the ignored public SDK JSON, validates its six allowed fields, and does not start a server, create an account, send email, build an APK or deploy. After explicitly choosing to start the separate live preview:

```powershell
node scripts/start-native-live.mjs --public-firebase-config .cache/firebase.public-sdk.json --start
# If the default port is occupied, select a free separate port explicitly:
node scripts/start-native-live.mjs --public-firebase-config .cache/firebase.public-sdk.json --start --port 8109
```

This starts Expo Go on LAN port `8098` by default, separate from the sample preview on `8097`; `--port 8109` chooses another validated port. Before starting, the launcher checks availability on both IPv4 and IPv6 and rejects a port already used by another service. It never stops that service. The launcher removes inherited `EXPO_PUBLIC_*`, mode/profile and Firebase emulator variables; only validated public Firebase identifiers are added, with dotenv loading disabled. Configure an HTTPS web-sharing origin separately if wanted; the isolated launcher uses installed-app links by default. A real member must create/sign into their own account. The guarded catalog initializer still requires the actual owner's bootstrapped UID and is never run by this launcher.

For EAS, configure the six public identifiers in the selected environment before using `eas build --profile livepreview --platform android`. The existing `preview` profile remains fictional sample data; do not describe its APK as a live community build. `production` also requires live configuration. Local emulator mode is explicit (`THELOOP_NATIVE_MODE=emulator`), accepts only a `demo-*` project with a loopback/private IP or a single-label/`.local` LAN hostname, and requires valid distinct Auth/Firestore/Functions ports. A production project combined with emulators is rejected.

Read-only inspection on October 26, 2026 reconfirmed active dedicated infrastructure, linked billing, Email/Password enabled, one registered Firebase web app, and the same three authorized Auth domains (`localhost`, the Firebase app domain and Firebase hosting domain). These domains do not include the private ChatGPT-hosted website; basic Email/Password sign-in is distinct from OAuth redirect/email continue-URL authorization. No project settings or user records were changed by this inspection.

## Android public Firebase configuration

After the native configuration checkpoint, the dedicated project's Android apps were listed and no `co.theloop.community` registration existed. The explicitly authorized registration was created and read back as ACTIVE: `1:36048778692:android:8b34aa011b64d04b5d6091`. Its public configuration was downloaded through Firebase's Android app configuration API and saved only at ignored `.cache/google-services.android.json`. Project ID/number, storage bucket, package and app ID were verified against the registration. No Auth account, service-account key, billing change, push, email or FCM credential upload was created by this operation.

`THELOOP_GOOGLE_SERVICES_FILE` accepts a local path or an EAS **file** environment variable containing this public `google-services.json`. It is not an `EXPO_PUBLIC_*` variable and does not accept a service-account key. `app.config.js` validates file bytes, the dedicated project/bucket, the exact Android package and Android app-ID namespace before setting `android.googleServicesFile`. Sample and emulator configurations remove any inherited/static native file reference without reading it. EAS Android builds under `livepreview` or `production` require the file; local live Expo Go and iOS do not require Android configuration.

For a local config/prebuild command, the path is relative to `apps/mobile` unless absolute:

```powershell
$env:THELOOP_GOOGLE_SERVICES_FILE = '../../.cache/google-services.android.json'
```

The isolated Expo Go launcher intentionally clears this inherited variable because Expo Go sign-in does not require native FCM configuration. For an EAS cloud build, create/select the matching **file** variable in its EAS environment; ignored `.cache` files are not automatically uploaded. Do not use a private FCM service-account key for this client file. The public configuration is necessary client setup; actual FCM V1 delivery credentials in EAS and installed-device delivery verification are still separate gates. The notifications plugin, opt-in UI, public config and deployed server handler alone do not prove delivery. [Expo's FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/) describes these separate requirements; [Firebase's getConfig API](https://firebase.google.com/docs/reference/firebase-management/rest/v1beta1/projects.androidApps/getConfig) documents the public artifact download.


## October 27 updates
The real owner is verified and the AfroTech conference/group chat were initialized on October26; earlier setup notes above describe the pre-initialization state. The live hub contains no imported historical chats or fabricated activity. The executeCommand function was updated successfully from2f84a5e on October27 to support moderator-managed pins; existing rules/indexes and other functions were unchanged by that scoped deployment.

The EAS project preview environment initially had no variables. Its six validated public Firebase SDK identifiers are now configured as project-scoped plaintext variables, and THELOOP_GOOGLE_SERVICES_FILE is configured as a sensitive file variable containing the validated public Android google-services.json. These are client configuration, not an Admin or FCM service-account key. No signing credential was created or changed. The sample preview profile still forces sample mode; livepreview uses the real dedicated project. FCM delivery credentials and installed-device push verification remain outstanding.

### October 27 notification release
Verified CI 40470588145 at 9a144f52a727459eb35d145b95ca66270f29eb77. Deployed executeCommand, deliverPushNotification and sendCommunityDigests to theloop-community-2026. Includes bounded explicit notification read batches, reply topic metadata, queued sender-block checks and per-topic digest read markers. Local real emulator suites passed 30/30; no real user notifications or messages were fabricated for testing.

### October 27 profile photos and saved messages deployment
Verified backend through 0b0ad67 (CI40475404717). Successfully deployed uploadMedia, getMedia, executeCommand, cleanupPrivateMedia and deleteAccount. No new collections, indexes or rules were required. Profile media is owner-uploaded, authorized against current profile visibility/blocks, and deleted/replaced photos lose access. Message saves are private user preferences containing references only.

## October 27 — reply alert access and mute enforcement
Verified commit4dab3f2 passed full GitHub CI40480130121 and all33 real callable/media integration cases. executeCommand and deliverPushNotification were successfully updated in theloop-community-2026. New group replies require current membership and following the topic, store a generic body plus source message ID, and recheck source access/read state before push. No production test messages or device pushes were sent.

## October 27 — conference dates and read status budgets
Full CI40485207672 passed for4a9d792 (131 functions units and34 real callable/media cases locally). executeCommand was successfully updated in the dedicated project with strict conference day validation and separate bounded read status allowances. No new rules or indexes were required. A read-only Firebase index listing confirmed26 deployed composite indexes and TTL enabled on requests.expiresAt. No production test records were created.
