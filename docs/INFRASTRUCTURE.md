# TheLoop infrastructure status

Verified on 2026-10-26 using project-scoped Google administrative APIs. This describes observed infrastructure, not application feature completeness.

| Resource                      | Observed state                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dedicated project             | `theloop-community-2026`, active                                                                                    |
| Firebase web app              | `TheLoop web`, registered                                                                                           |
| Cloud Billing                 | User approved linking an existing account and delegated account choice; an eligible existing Firebase Payment account is linked and billingEnabled was verified true |
| Firestore API                 | Enabled through the authorized free setup                                                                           |
| Firestore database            | First `(default)` database created, Standard Native, `us-central1`, `freeTier: true`                                |
| PITR/backups/TTL              | PITR explicitly disabled; backups and TTL not enabled by this setup                                                 |
| Firebase Auth                 | Initialized through the free console flow; Email/Password provider visibly enabled; no users created or emails sent |
| Cloud Storage                 | Default theloop-community-2026.firebasestorage.app bucket created through the Firebase API in US-CENTRAL1 after billing approval |
| Cloud Functions / Run / Build | Deployment completed from clean3c4b493 source; all18 Node22/us-central1 functions verified ACTIVE |

The public Firebase SDK configuration is available only in the ignored local `.cache/firebase.public-sdk.json`. Account access/refresh tokens were read only into process memory and were neither printed nor written to project files.

The free database was created after explicit authorization to enable the free Firestore API. The initial `SERVICE_DISABLED` blocker was resolved. The user subsequently approved linking an existing billing account and authorized choosing one that accepts the link. The first account returned a precondition failure with billing still disabled; an eligible existing Firebase Payment account succeeded, and the project association was read back to verify billingEnabled=true. Cloud Functions, Run, Build, Artifact Registry, Eventarc, Scheduler, Pub/Sub, Storage and IAM APIs were then enabled for this dedicated project. No billing account, payment method, Codex credits or reset credits were purchased or created.

Basic Firebase Authentication was initialized through the authorized console flow using the existing project-owner account, and Email/Password is enabled. No Identity Platform upgrade was used. The original `CONFIGURATION_NOT_FOUND` blocker was resolved. A real owner must sign in/bootstrap before the guarded live catalog initializer can assign community ownership; no fictional live users will be substituted for that owner.

The first production attempt compiled rules but stopped before function publication because Windows source discovery exceeded its default10-second limit. Release deployment now uses FUNCTIONS_DISCOVERY_TIMEOUT=120 and a direct compiler predeploy hook. Functions runtime features passed103 unit tests,14 emulator rule tests and27 real callable/image integration checks before this deployment. The full production deployment completed after first-use source-bucket and Eventarc service-agent permissions propagated. All18 functions were read back as ACTIVE. Firestore rules/indexes and private Storage rules are released; Artifact Registry cleanup removes stale images after1day. Bootstrap preflight returns204 for the private site origin; an unsigned call returns401 UNAUTHENTICATED. No real account or catalog has been seeded.

The Firebase CLI confirmed that the Firestore-only Spark deployment completed successfully using `firebase.spark.json` and its generated index variant: rules released to `cloud.firestore` and 10 composite index definitions deployed. TTL was excluded. No Functions, Hosting, Storage, billing, or paid-platform targets were part of this deployment. The canonical full configuration remains available for the approved production deployment.

No four-year chat history, member directory, real profiles, messages, events, or fabricated member counts have been inserted into the live database.
