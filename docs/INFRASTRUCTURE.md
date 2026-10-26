# TheLoop infrastructure status

Verified on 2026-10-26 using project-scoped Google administrative APIs. This describes observed infrastructure, not application feature completeness.

| Resource                      | Observed state                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dedicated project             | `theloop-community-2026`, active                                                                                    |
| Firebase web app              | `TheLoop web`, registered                                                                                           |
| Cloud Billing                 | No billing account attached; billing disabled at inspection                                                         |
| Firestore API                 | Enabled through the authorized free setup                                                                           |
| Firestore database            | First `(default)` database created, Standard Native, `us-central1`, `freeTier: true`                                |
| PITR/backups/TTL              | PITR explicitly disabled; backups and TTL not enabled by this setup                                                 |
| Firebase Auth                 | Initialized through the free console flow; Email/Password provider visibly enabled; no users created or emails sent |
| Cloud Functions / Run / Build | Disabled at readiness inspection; no paid service activation or Functions deployment performed                      |

The public Firebase SDK configuration is available only in the ignored local `.cache/firebase.public-sdk.json`. Account access/refresh tokens were read only into process memory and were neither printed nor written to project files.

The free database was created after an explicit authorization to enable the free Firestore API. The initial database CLI failure was caused by `SERVICE_DISABLED`; that blocker has been resolved. Functions deployment still needs an approved billing link and service activation. Basic Firebase Authentication was subsequently initialized through the authorized console flow using the existing project-owner account, and Email/Password was enabled. No Identity Platform upgrade or billing-gated initialization API was used. The original `CONFIGURATION_NOT_FOUND` blocker has been resolved.

The Firebase CLI confirmed that the Firestore-only Spark deployment completed successfully using `firebase.spark.json` and its generated index variant: rules released to `cloud.firestore` and 10 composite index definitions deployed. TTL was excluded. No Functions, Hosting, Storage, billing, or paid-platform targets were part of this deployment. The canonical full configuration remains available for the approved production deployment.

No four-year chat history, member directory, real profiles, messages, events, or fabricated member counts have been inserted into the live database.
