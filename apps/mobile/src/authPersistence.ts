import type { Persistence } from "firebase/auth";
// The web preview uses Firebase's browser persistence. Metro selects the native
// sibling for the installed iOS/Android app. Neither module eagerly loads Firebase.
export async function loadAuthPersistence(): Promise<Persistence | undefined> {
  return undefined;
}
