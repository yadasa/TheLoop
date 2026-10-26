import type { Persistence } from "firebase/auth";
// The web preview uses Firebase's browser persistence. Metro selects the native
// sibling for the installed iOS/Android app.
export const authPersistence: Persistence | undefined = undefined;
