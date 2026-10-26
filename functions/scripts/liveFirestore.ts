import { Firestore, getFirestore } from "firebase-admin/firestore";
import { OAuth2Client } from "google-auth-library";

/** Admin Auth accepts a custom token credential; its Firestore factory does not. */
export function createLiveFirestore(
  projectId: string,
  accessToken?: string,
): Firestore {
  if (!accessToken) return getFirestore();
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: accessToken });
  // Firestore forwards authClient to google-gax/GoogleAuth. The caller's existing
  // short-lived bearer stays in memory; no certificate, refresh token or key file is created.
  return new Firestore({ projectId, authClient });
}
