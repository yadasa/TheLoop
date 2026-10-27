import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth, initializeAuth, connectAuthEmulator, type Auth, type Persistence } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";

export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut as firebaseSignOut, sendPasswordResetEmail, sendEmailVerification, reload } from "firebase/auth";
export { collection, doc, onSnapshot, query, where, limit, orderBy, documentId, getDocs, getDocsFromServer } from "firebase/firestore";
export { httpsCallable } from "firebase/functions";
export { replyPageQuery, pinnedMessageQuery, directoryPageQuery, messagePageQuery, squadMessagePageQuery, squadMembershipQuery, squadParticipantInvitesQuery, squadIncomingInvitesQuery, squadOwnerInvitesQuery } from "./queries";
export { directMessagePageQuery, directCatalogPageQuery } from "./directQueries";

type EmulatorConfig = { host?: string; authPort?: number; firestorePort?: number; functionsPort?: number };
let cloud: { auth: Auth; db: Firestore; functions: Functions } | undefined;
export function setup(config: FirebaseOptions, emulator = false, persistence?: Persistence, emulators: EmulatorConfig = {}) {
  if (cloud) return cloud;
  const app = getApps().find(app => app.name === "theloop") ?? initializeApp(config, "theloop");
  const auth = persistence ? initializeAuth(app, { persistence }) : getAuth(app), db = getFirestore(app), functions = getFunctions(app, "us-central1");
  if (emulator) {
    const host = (emulators.host || "127.0.0.1").trim();
    if (!host || /[\s/?#]/.test(host)) throw new Error("Use a hostname or IP address for the emulator host.");
    const address = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    const authPort = emulators.authPort ?? 9099, firestorePort = emulators.firestorePort ?? 8080, functionsPort = emulators.functionsPort ?? 5001;
    if ([authPort, firestorePort, functionsPort].some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Emulator ports must be whole numbers from 1 to 65,535.");
    connectAuthEmulator(auth, `http://${address}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, address, firestorePort);
    connectFunctionsEmulator(functions, address, functionsPort);
  }
  cloud = { auth, db, functions };
  return cloud;
}
