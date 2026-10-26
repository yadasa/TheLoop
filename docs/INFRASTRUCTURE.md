# TheLoop infrastructure status

Verified on 2026-10-26 using project-scoped Google administrative APIs. This describes observed infrastructure, not application feature completeness.

| Resource                      | Observed state                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dedicated project             | `theloop-community-2026`, active                                                                                    |
| Firebase web app              | `TheLoop web`, registered                                                                                           |
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

Local validation from the repository root:

```powershell
node --test scripts/native-config.test.cjs
node node_modules/tsx/dist/cli.mjs --test scripts/native-runtime.test.ts
node scripts/start-native-live.mjs --public-firebase-config .cache/firebase.public-sdk.json --check
```

The first two commands cover build-time validation and the pure device-side runtime decoder, including cross-contract tests. The third reads the ignored public SDK JSON, validates its six allowed fields, and does not start a server, create an account, send email, build an APK or deploy. After explicitly choosing to start the separate live preview:

```powershell
node scripts/start-native-live.mjs --public-firebase-config .cache/firebase.public-sdk.json --start
```

This starts Expo Go on LAN port `8098`, separate from the sample preview on `8097`. The launcher removes inherited `EXPO_PUBLIC_*`, mode/profile and Firebase emulator variables; only validated public Firebase identifiers are added, with dotenv loading disabled. Configure an HTTPS web-sharing origin separately if wanted; the isolated launcher uses installed-app links by default. A real member must create/sign into their own account. The guarded catalog initializer still requires the actual owner's bootstrapped UID and is never run by this launcher.

For EAS, configure the six public identifiers in the selected environment before using `eas build --profile livepreview --platform android`. The existing `preview` profile remains fictional sample data; do not describe its APK as a live community build. `production` also requires live configuration. Local emulator mode is explicit (`THELOOP_NATIVE_MODE=emulator`), accepts only a `demo-*` project with a loopback/private IP or a single-label/`.local` LAN hostname, and requires valid distinct Auth/Firestore/Functions ports. A production project combined with emulators is rejected.

Read-only inspection on October 26, 2026 reconfirmed active dedicated infrastructure, linked billing, Email/Password enabled, one registered Firebase web app, and the same three authorized Auth domains (`localhost`, the Firebase app domain and Firebase hosting domain). These domains do not include the private ChatGPT-hosted website; basic Email/Password sign-in is distinct from OAuth redirect/email continue-URL authorization. No project settings or user records were changed by this inspection.

Remote Android push is a separate setup gate: the current source has no `android.googleServicesFile` and the observed Firebase registrations contain only the web app. Registering the Android application and supplying its matching public `google-services.json`, together with FCM V1 delivery credentials in EAS, must precede an installed-device push claim. The notifications plugin, opt-in UI and deployed server delivery handler alone do not establish FCM readiness. [Expo's FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/) describes both the client configuration and EAS delivery credential requirements. No Android registration, private key, push message or credential upload was performed in this milestone.
