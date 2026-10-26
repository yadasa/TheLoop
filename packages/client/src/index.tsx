import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  connectAuthEmulator,
  type Auth,
  type Persistence,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  limit,
  orderBy,
  documentId,
  getDocs,
  connectFirestoreEmulator,
  type Firestore,
  type Query,
} from "firebase/firestore";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
  type Functions,
} from "firebase/functions";
import {
  applyCommand,
  initialState,
  emptyState,
  defaultPreferences,
  type LoopState,
  type Command,
  type Preferences,
  type Message,
  type Profile,
  type Connection,
} from "@theloop/core";
import { documentIdBatches, matchesDirectory, mergeMessages, messageCursor, normalizeDirectoryQuery, previewChannelIds, type MessageCursor } from "./data";
import { directoryPageQuery, messagePageQuery } from "./queries";
export type StorageDriver = {
  load(): Promise<LoopState | null>;
  save(state: LoopState): Promise<void>;
};
export type LoopRole = "member" | "moderator" | "admin";
export type EmulatorConfig = {
  host?: string;
  authPort?: number;
  firestorePort?: number;
  functionsPort?: number;
};
type LoopContextValue = {
  state: LoopState;
  dispatch(command: Command): Promise<void>;
  mode: "demo" | "live";
  ready: boolean;
  error: string | null;
  clearError(): void;
  resetDemo(): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  pending: number;
  appealTrust(reason: string): Promise<void>;
  exportAccount(): Promise<Record<string, unknown>>;
  deleteAccount(confirmation: string): Promise<void>;
  registerPushToken(
    token: string,
    platform?: "ios" | "android" | "web",
    remove?: boolean,
  ): Promise<void>;
  getTrust(userId: string): Promise<unknown>;
  loadMore(collection: "posts" | "events"): void;
  hasMore: { posts: boolean; events: boolean };
  role: LoopRole;
  emailVerified: boolean;
  sendVerificationEmail(): Promise<void>;
  refreshVerification(): Promise<boolean>;
  watchConversation(channelId: string | null, topic?: string): void;
  loadOlderMessages(): Promise<void>;
  history: { loading: boolean; hasMore: boolean };
  directory: { results: Profile[]; loading: boolean; hasMore: boolean };
  setDirectoryQuery(query: string): void;
  loadMoreDirectory(): void;
  loadSavedPosts(): Promise<void>;
  loadProfile(userId: string): Promise<void>;
};
const Context = createContext<LoopContextValue | null>(null);
let cloud: { auth: Auth; db: Firestore; functions: Functions } | undefined;
function setup(
  config: FirebaseOptions,
  emulator = false,
  persistence?: Persistence,
  emulators: EmulatorConfig = {},
) {
  if (cloud) return cloud;
  const app =
    getApps().find((a) => a.name === "theloop") ??
    initializeApp(config, "theloop");
  const auth = persistence
      ? initializeAuth(app, { persistence })
      : getAuth(app),
    db = getFirestore(app),
    functions = getFunctions(app, "us-central1");
  if (emulator) {
    const host = (emulators.host || "127.0.0.1").trim();
    if (!host || /[\s/?#]/.test(host)) throw new Error("Use a hostname or IP address for the emulator host.");
    const address = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    const authPort = emulators.authPort ?? 9099;
    const firestorePort = emulators.firestorePort ?? 8080;
    const functionsPort = emulators.functionsPort ?? 5001;
    if ([authPort, firestorePort, functionsPort].some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Emulator ports must be whole numbers from 1 to 65,535.");
    connectAuthEmulator(auth, `http://${address}:${authPort}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, address, firestorePort);
    connectFunctionsEmulator(functions, address, functionsPort);
  }
  cloud = { auth, db, functions };
  return cloud;
}
const readableError = (e: unknown) => {
  const message =
    e instanceof Error ? e.message : "Something went wrong. Please try again.";
  return message
    .replace(/^Firebase:\s*/, "")
    .replace(/\s*\(auth\/[^)]+\)\.?/, "");
};
const requestId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
function restorePreview(saved: LoopState): LoopState {
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
  if (!object(saved) || saved.version !== 1 || typeof saved.currentUserId !== "string") throw new Error("Unsupported saved preview.");
  const arrays = ["profiles", "conferences", "channels", "messages", "communities", "posts", "events", "connections", "notifications", "directMessages", "reports"] as const;
  for (const key of arrays) if (!Array.isArray(saved[key]) || !saved[key].every(item => object(item) && typeof item.id === "string")) throw new Error("Invalid saved preview records.");
  if (saved.follows !== undefined && (!Array.isArray(saved.follows) || !saved.follows.every(item => object(item) && typeof item.id === "string"))) throw new Error("Invalid saved follow records.");
  if (saved.preferences !== undefined && !object(saved.preferences)) throw new Error("Invalid saved preferences.");
  const preferences = { ...defaultPreferences(), ...saved.preferences };
  for (const key of ["joinedCommunityIds", "followingIds", "blockedIds", "savedPostIds", "interests"] as const) if (!strings(preferences[key])) throw new Error("Invalid saved preference list.");
  if (!object(preferences.subscriptions) || Object.values(preferences.subscriptions).some(value => !["following", "muted", "hidden"].includes(value))) throw new Error("Invalid saved subscriptions.");
  if (!object(preferences.readChannels) || Object.values(preferences.readChannels).some(value => typeof value !== "string")) throw new Error("Invalid saved read markers.");
  for (const profile of saved.profiles) if (typeof profile.name !== "string" || typeof profile.initials !== "string" || !strings(profile.skills) || !strings(profile.interests) || !strings(profile.openTo) || !Array.isArray(profile.links) || !object(profile.trust) || !Number.isFinite(profile.trust.score) || !strings(profile.trust.reasons)) throw new Error("Invalid saved profile.");
  for (const channel of saved.channels) if (typeof channel.name !== "string" || !strings(channel.topics)) throw new Error("Invalid saved channel.");
  for (const message of saved.messages) if (typeof message.body !== "string" || !Number.isFinite(Date.parse(message.createdAt)) || !object(message.reactions) || Object.values(message.reactions).some(value => !strings(value))) throw new Error("Invalid saved message.");
  for (const community of saved.communities) if (typeof community.name !== "string" || !Number.isFinite(community.members) || !strings(community.rules)) throw new Error("Invalid saved community.");
  for (const post of saved.posts) if (typeof post.title !== "string" || typeof post.body !== "string" || !Array.isArray(post.comments) || !strings(post.tags) || !object(post.votes) || (post.poll && (!Array.isArray(post.poll.options) || post.poll.options.some(option => !strings(option.voterIds))))) throw new Error("Invalid saved post.");
  for (const event of saved.events) if (typeof event.title !== "string" || !Number.isFinite(Date.parse(event.startAt)) || !Number.isFinite(Date.parse(event.endAt)) || !strings(event.attendeeIds) || !strings(event.waitlistIds) || !strings(event.tags)) throw new Error("Invalid saved event.");
  return { ...saved, follows: saved.follows ?? [], preferences };
}
export function LoopProvider({
  children,
  storage,
  firebaseConfig,
  useEmulators = false,
  authPersistence,
  emulators,
}: {
  children: React.ReactNode;
  storage?: StorageDriver;
  firebaseConfig?: FirebaseOptions;
  useEmulators?: boolean;
  authPersistence?: Persistence;
  emulators?: EmulatorConfig;
}) {
  const mode = firebaseConfig?.apiKey ? "live" : "demo";
  const [state, setState] = useState<LoopState>(() =>
    mode === "demo" ? initialState() : emptyState(),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(0);
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const [hasMore, setHasMore] = useState({ posts: false, events: false });
  const [history, setHistory] = useState({ loading: false, hasMore: false });
  const [directory, setDirectory] = useState<{ results: Profile[]; loading: boolean; hasMore: boolean }>({ results: [], loading: false, hasMore: false });
  const [directoryQuery, updateDirectoryQuery] = useState("");
  const directoryQueryRef = useRef("");
  const conversationRef = useRef<{ channelId: string | null; topic?: string }>({ channelId: null });
  const liveActions = useRef<Partial<{
    watchConversation(channelId: string | null, topic?: string): void;
    loadOlderMessages(): Promise<void>;
    setDirectoryQuery(query: string): void;
    loadMoreDirectory(): void;
    loadSavedPosts(): Promise<void>;
    loadProfile(userId: string): Promise<void>;
  }>>({});
  const watchConversation = useCallback((channelId: string | null, topic?: string) => {
    const previous = conversationRef.current;
    if (previous.channelId === channelId && previous.topic === topic) return;
    conversationRef.current = { channelId, topic };
    if (liveActions.current.watchConversation) liveActions.current.watchConversation(channelId, topic);
    else setHistory({ loading: false, hasMore: false });
  }, []);
  const loadOlderMessages = useCallback(async () => { await liveActions.current.loadOlderMessages?.(); }, []);
  const setDirectoryQuery = useCallback((value: string) => {
    const normalized = normalizeDirectoryQuery(value);
    if (directoryQueryRef.current === normalized) return;
    directoryQueryRef.current = normalized;
    updateDirectoryQuery(normalized);
    liveActions.current.setDirectoryQuery?.(normalized);
  }, []);
  const loadMoreDirectory = useCallback(() => liveActions.current.loadMoreDirectory?.(), []);
  const loadSavedPosts = useCallback(async () => { await liveActions.current.loadSavedPosts?.(); }, []);
  const loadProfile = useCallback(async (userId: string) => { await liveActions.current.loadProfile?.(userId); }, []);
  const catalogLoaders = useRef<
    Partial<Record<"posts" | "events", () => void>>
  >({});
  const [role, setRole] = useState<LoopRole>("member"),
    [emailVerified, setEmailVerified] = useState(false);
  const registeredPushToken = useRef<{
    token: string;
    platform: "ios" | "android" | "web";
    userId: string;
  } | null>(null);
  const loadMore = useCallback(
    (collection: "posts" | "events") => catalogLoaders.current[collection]?.(),
    [],
  );
  useEffect(() => {
    if (mode === "demo") setDirectory({ results: state.profiles.filter(profile => matchesDirectory(profile, directoryQuery)), loading: false, hasMore: false });
  }, [mode, state.profiles, directoryQuery]);
  useEffect(() => {
    let active = true;
    if (mode === "demo") {
      storageRef.current
        ?.load()
        .then((saved) => {
          if (active && saved) setState(restorePreview(saved));
        })
        .catch(() =>
          setError(
            "Your saved preview could not be loaded. A fresh sample is ready.",
          ),
        )
        .finally(() => {
          if (active) setReady(true);
        });
      if (!storageRef.current) setReady(true);
      return () => {
        active = false;
      };
    }
    let c: ReturnType<typeof setup>;
    try {
      c = setup(firebaseConfig!, useEmulators, authPersistence, emulators);
    } catch (e) {
      setError(readableError(e));
      setReady(true);
      return () => {
        active = false;
      };
    }
    let dispose: (() => void)[] = [];
    let generation = 0;
    const off = onAuthStateChanged(c.auth, async (user) => {
      const turn = ++generation;
      dispose.forEach((fn) => fn());
      dispose = [];
      catalogLoaders.current = {};
      liveActions.current = {};
      setHasMore({ posts: false, events: false });
      setHistory({ loading: false, hasMore: false });
      setDirectory({ results: [], loading: false, hasMore: false });
      setRole("member");
      setEmailVerified(user?.emailVerified ?? false);
      setState(emptyState(user?.uid ?? ""));
      if (!user) {
        setReady(true);
        return;
      }
      setReady(false);
      try {
        await httpsCallable(
          c.functions,
          "bootstrap",
        )({ name: user.displayName ?? "" });
        if (!active || turn !== generation) return;
        const current = () => active && turn === generation;
        const waiting = new Set([
          "preferences",
          "owner",
          "publicProfiles",
          "conferences",
          "communities",
          "posts",
          "eventsUpcoming",
          "eventsPast",
          "connections",
          "follows",
          "directMessages",
          "notifications",
          "publicChannels",
          "privateChannels",
          "reports",
        ]);
        const loaded = (key: string) => {
          waiting.delete(key);
          if (current() && !waiting.size) setReady(true);
        };
        const failure = (e: unknown, key?: string) => {
          if (current()) {
            setError(readableError(e));
            if (key) loaded(key);
          }
        };
        const listen = (key: keyof LoopState, q: Query) => {
          dispose.push(
            onSnapshot(
              q,
              (snap) => {
                if (current())
                  setState((s) => ({
                    ...s,
                    [key]: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
                  }));
                loaded(key);
              },
              (e) => failure(e, key),
            ),
          );
        };
        listen(
          "conferences",
          query(collection(c.db, "conferences"), orderBy("name"), limit(300)),
        );
        listen(
          "communities",
          query(collection(c.db, "communities"), orderBy("name"), limit(300)),
        );

        // Independent caches prevent a public snapshot from erasing a private owner or friend profile.
        let ownProfile: Profile | undefined;
        let publicProfiles: Profile[] = [];
        let connections: Connection[] = [];
        let blockedIds: string[] = [];
        let subscriptions = defaultPreferences().subscriptions;
        let savedPostIds: string[] = [];
        let refreshMessageSubscriptions = () => {};
        const peerProfiles = new Map<string, Profile>(),
          peerListeners = new Map<string, () => void>();
        const targetedProfiles = new Map<string, Profile>(),
          targetedListeners = new Map<string, () => void>(),
          targetedRequests = new Map<string, Promise<void>>(),
          targetedPending = new Map<string, { resolve(): void }>(),
          revokedProfileIds = new Set<string>();
        const directoryPages = new Map<number, { rows: Profile[]; cursor?: { nameKey: string; id: string }; full: boolean }>(),
          directoryListeners = new Map<number, () => void>(), pendingDirectoryPages = new Set<number>();
        let directoryGeneration = 0, directoryLoading = false, directoryDesiredPages = 1;
        let allowedPeerIds = new Set<string>();
        const publishProfiles = () => {
          if (!current()) return;
          const profiles = new Map(
            publicProfiles.map((profile) => [profile.id, profile]),
          );
          for (const page of directoryPages.values()) for (const profile of page.rows) profiles.set(profile.id, profile);
          targetedProfiles.forEach((profile) => profiles.set(profile.id, profile));
          peerProfiles.forEach((profile) => profiles.set(profile.id, profile));
          if (ownProfile) profiles.set(ownProfile.id, ownProfile);
          setState((s) => ({ ...s, profiles: [...profiles.values()].filter(profile => !revokedProfileIds.has(profile.id)) }));
        };
        const publishDirectory = () => {
          if (!current()) return;
          const pages = [...directoryPages.entries()].sort(([a], [b]) => a - b);
          const rows = new Map(pages.flatMap(([, page]) => page.rows.map(profile => [profile.id, profile] as const)));
          setDirectory({ results: [...rows.values()].filter(profile => !revokedProfileIds.has(profile.id)), loading: directoryLoading, hasMore: pages.at(-1)?.[1].full ?? false });
          publishProfiles();
        };
        const subscribeDirectoryPage = (pageNumber: number, cursor?: { nameKey: string; id: string }) => {
          if (!current() || directoryLoading || directoryListeners.has(pageNumber)) return;
          const requestGeneration = directoryGeneration;
          pendingDirectoryPages.add(pageNumber);
          directoryLoading = true;
          publishDirectory();
          const text = directoryQueryRef.current;
          directoryListeners.set(pageNumber, onSnapshot(directoryPageQuery(c.db, text, cursor), snap => {
            if (!current() || requestGeneration !== directoryGeneration) return;
            const last = snap.docs.at(-1);
            const rows = snap.docs.map(record => ({ ...record.data(), id: record.id }) as Profile);
            const nextCursor = last ? { nameKey: last.data().nameKey as string, id: last.id } : cursor;
            const previousCursor = directoryPages.get(pageNumber)?.cursor;
            if (previousCursor && (previousCursor.nameKey !== nextCursor?.nameKey || previousCursor.id !== nextCursor?.id)) {
              for (const [number, unsubscribe] of directoryListeners) if (number > pageNumber) {
                unsubscribe();
                directoryListeners.delete(number);
                directoryPages.delete(number);
                pendingDirectoryPages.delete(number);
              }
            }
            rows.forEach(profile => revokedProfileIds.delete(profile.id));
            directoryPages.set(pageNumber, { rows, cursor: nextCursor, full: snap.size === 50 });
            pendingDirectoryPages.delete(pageNumber);
            directoryLoading = pendingDirectoryPages.size > 0;
            publishDirectory();
            if (snap.size === 50 && nextCursor && pageNumber + 1 < directoryDesiredPages) subscribeDirectoryPage(pageNumber + 1, nextCursor);
          }, error => {
            if (!current() || requestGeneration !== directoryGeneration) return;
            pendingDirectoryPages.delete(pageNumber);
            directoryLoading = pendingDirectoryPages.size > 0;
            directoryPages.delete(pageNumber);
            directoryListeners.delete(pageNumber);
            publishDirectory();
            failure(error);
          }));
        };
        liveActions.current.setDirectoryQuery = () => {
          directoryGeneration++;
          directoryListeners.forEach(unsubscribe => unsubscribe());
          directoryListeners.clear();
          directoryPages.clear();
          pendingDirectoryPages.clear();
          directoryLoading = false;
          directoryDesiredPages = 1;
          subscribeDirectoryPage(0);
        };
        liveActions.current.loadMoreDirectory = () => {
          const last = [...directoryPages.entries()].sort(([a], [b]) => a - b).at(-1);
          if (!directoryLoading && last?.[1].full && last[1].cursor) {
            directoryDesiredPages = last[0] + 2;
            subscribeDirectoryPage(last[0] + 1, last[1].cursor);
          }
        };
        liveActions.current.loadProfile = (id: string) => {
          if (!current() || !id || id.includes("/")) return Promise.resolve();
          if (id === user.uid || peerProfiles.has(id)) return Promise.resolve();
          const existing = targetedRequests.get(id);
          if (existing) return existing;
          // Keep explicit author lookups bounded; directory results have their own live pages.
          if (targetedListeners.size >= 100) {
            const oldest = targetedListeners.keys().next().value as string;
            targetedListeners.get(oldest)?.();
            targetedListeners.delete(oldest);
            targetedProfiles.delete(oldest);
            targetedRequests.delete(oldest);
            targetedPending.get(oldest)?.resolve();
            targetedPending.delete(oldest);
          }
          const request = new Promise<void>((resolve, reject) => {
            targetedPending.set(id, { resolve });
            targetedListeners.set(id, onSnapshot(doc(c.db, "profiles", id), snap => {
              if (!current() || !targetedListeners.has(id)) { resolve(); return; }
              const profile = snap.exists() ? { ...snap.data(), id: snap.id } as Profile : undefined;
              if (profile && (profile.visibility === "public" || allowedPeerIds.has(id))) {
                targetedProfiles.set(id, profile);
                revokedProfileIds.delete(id);
              } else {
                targetedProfiles.delete(id);
                revokedProfileIds.add(id);
              }
              publishDirectory();
              resolve();
              targetedPending.delete(id);
            }, error => {
              targetedProfiles.delete(id);
              revokedProfileIds.add(id);
              targetedRequests.delete(id);
              targetedListeners.delete(id);
              targetedPending.delete(id);
              publishDirectory();
              if ((error as { code?: string }).code !== "permission-denied") failure(error);
              reject(error);
            }));
          });
          targetedRequests.set(id, request);
          return request;
        };
        subscribeDirectoryPage(0);
        const refreshPeers = () => {
          if (!current()) return;
          const wanted = new Set(
            connections
              .filter((connection) => connection.status === "accepted")
              .map((connection) =>
                connection.fromId === user.uid
                  ? connection.toId
                  : connection.fromId,
              )
              .filter((id) => !blockedIds.includes(id)),
          );
          allowedPeerIds = wanted;
          targetedProfiles.forEach((profile, id) => {
            if (profile.visibility !== "public" && !wanted.has(id)) {
              targetedProfiles.delete(id);
              revokedProfileIds.add(id);
            }
          });
          peerListeners.forEach((unsubscribe, id) => {
            if (!wanted.has(id)) {
              unsubscribe();
              peerListeners.delete(id);
              peerProfiles.delete(id);
            }
          });
          for (const id of wanted)
            if (!peerListeners.has(id))
              peerListeners.set(
                id,
                onSnapshot(
                  doc(c.db, "profiles", id),
                  (snap) => {
                    if (!current() || !allowedPeerIds.has(id)) return;
                    if (snap.exists())
                      peerProfiles.set(id, {
                        ...snap.data(),
                        id: snap.id,
                      } as Profile);
                    else peerProfiles.delete(id);
                    if (snap.exists()) revokedProfileIds.delete(id);
                    publishProfiles();
                  },
                  (e) => {
                    peerProfiles.delete(id);
                    publishProfiles();
                    if ((e as { code?: string }).code !== "permission-denied")
                      failure(e);
                  },
                ),
              );
          publishProfiles();
        };
        dispose.push(() => {
          peerListeners.forEach((unsubscribe) => unsubscribe());
          peerListeners.clear();
          peerProfiles.clear();
          targetedListeners.forEach(unsubscribe => unsubscribe());
          targetedListeners.clear();
          targetedProfiles.clear();
          targetedRequests.clear();
          targetedPending.forEach(request => request.resolve());
          targetedPending.clear();
          directoryGeneration++;
          directoryListeners.forEach(unsubscribe => unsubscribe());
          directoryListeners.clear();
          directoryPages.clear();
          pendingDirectoryPages.clear();
        });
        dispose.push(
          onSnapshot(
            query(
              collection(c.db, "profiles"),
              where("visibility", "==", "public"),
              limit(300),
            ),
            (snap) => {
              if (current()) {
                publicProfiles = snap.docs.map(
                  (d) => ({ ...d.data(), id: d.id }) as Profile,
                );
                publicProfiles.forEach(profile => revokedProfileIds.delete(profile.id));
                publishProfiles();
              }
              loaded("publicProfiles");
            },
            (e) => failure(e, "publicProfiles"),
          ),
        );
        dispose.push(
          onSnapshot(
            doc(c.db, "profiles", user.uid),
            (snap) => {
              if (current()) {
                ownProfile = snap.exists()
                  ? ({ ...snap.data(), id: snap.id } as Profile)
                  : undefined;
                publishProfiles();
              }
              loaded("owner");
            },
            (e) => failure(e, "owner"),
          ),
        );
        let reportsRole: LoopRole | undefined,
          offReports: (() => void) | undefined;
        const watchReports = (nextRole: LoopRole) => {
          if (reportsRole === nextRole) return;
          reportsRole = nextRole;
          offReports?.();
          setState((s) => ({ ...s, reports: [] }));
          const constraints =
            nextRole === "moderator" || nextRole === "admin"
              ? [where("status", "==", "open")]
              : [where("reporterId", "==", user.uid)];
          offReports = onSnapshot(
            query(
              collection(c.db, "reports"),
              ...constraints,
              orderBy("createdAt", "desc"),
              limit(100),
            ),
            (snap) => {
              if (current() && reportsRole === nextRole)
                setState((s) => ({
                  ...s,
                  reports: snap.docs.map(
                    (d) =>
                      ({
                        ...d.data(),
                        id: d.id,
                      }) as LoopState["reports"][number],
                  ),
                }));
              loaded("reports");
            },
            (e) => failure(e, "reports"),
          );
        };
        dispose.push(() => offReports?.());
        dispose.push(
          onSnapshot(
            doc(c.db, "users", user.uid),
            (snap) => {
              if (snap.exists() && current()) {
                const data = snap.data();
                const preferences = {
                  ...defaultPreferences(),
                  ...(data.preferences ?? data),
                };
                const nextRole: LoopRole =
                  data.role === "moderator" || data.role === "admin"
                    ? data.role
                    : "member";
                setRole(nextRole);
                watchReports(nextRole);
                blockedIds = preferences.blockedIds;
                subscriptions = preferences.subscriptions;
                savedPostIds = preferences.savedPostIds;
                savedPosts.forEach((_, id) => { if (!savedPostIds.includes(id)) savedPosts.delete(id); });
                setState((s) => ({ ...s, preferences }));
                refreshPeers();
                refreshMessageSubscriptions();
                publishPosts();
              } else loaded("reports");
              loaded("preferences");
            },
            (e) => {
              failure(e, "preferences");
              loaded("reports");
            },
          ),
        );
        dispose.push(
          onSnapshot(
            query(
              collection(c.db, "connections"),
              where("participantIds", "array-contains", user.uid),
              orderBy("createdAt", "desc"),
              limit(300),
            ),
            (snap) => {
              if (current()) {
                connections = snap.docs.map(
                  (d) => ({ ...d.data(), id: d.id }) as Connection,
                );
                setState((s) => ({ ...s, connections }));
                refreshPeers();
              }
              loaded("connections");
            },
            (e) => failure(e, "connections"),
          ),
        );
        listen(
          "follows",
          query(
            collection(c.db, "follows"),
            where("participantIds", "array-contains", user.uid),
            orderBy("createdAt", "desc"),
            limit(300),
          ),
        );
        listen(
          "directMessages",
          query(
            collection(c.db, "directMessages"),
            where("participantIds", "array-contains", user.uid),
            orderBy("createdAt", "desc"),
            limit(200),
          ),
        );
        listen(
          "notifications",
          query(
            collection(c.db, "notifications"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(100),
          ),
        );

        // Bounded expanding windows keep recent posts live. UI can explicitly request more history.
        let postLimit = 100,
          offPosts: (() => void) | undefined;
        let feedPosts: LoopState["posts"] = [];
        const savedPosts = new Map<string, LoopState["posts"][number]>();
        const publishPosts = () => {
          if (!current()) return;
          const posts = new Map([...savedPosts.values(), ...feedPosts].map(post => [post.id, post]));
          setState(s => ({ ...s, posts: [...posts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)) }));
        };
        let savedLoadGeneration = 0;
        liveActions.current.loadSavedPosts = async () => {
          const requestGeneration = ++savedLoadGeneration;
          const wanted = [...savedPostIds];
          try {
            const snapshots = await Promise.all(documentIdBatches(wanted).map(ids => getDocs(query(collection(c.db, "posts"), where(documentId(), "in", ids)))));
            if (!current() || requestGeneration !== savedLoadGeneration) return;
            savedPosts.clear();
            for (const snap of snapshots) for (const record of snap.docs) if (savedPostIds.includes(record.id)) savedPosts.set(record.id, { ...record.data(), id: record.id } as LoopState["posts"][number]);
            publishPosts();
          } catch (error) {
            if (current() && requestGeneration === savedLoadGeneration) failure(error);
            throw error;
          }
        };
        const subscribePosts = () => {
          offPosts?.();
          offPosts = onSnapshot(
            query(
              collection(c.db, "posts"),
              orderBy("createdAt", "desc"),
              limit(postLimit),
            ),
            (snap) => {
              if (current()) {
                feedPosts = snap.docs.map(
                    (d) =>
                      ({ ...d.data(), id: d.id }) as LoopState["posts"][number],
                  );
                publishPosts();
                setHasMore((value) => ({
                  ...value,
                  posts: snap.size === postLimit && postLimit < 1000,
                }));
              }
              loaded("posts");
            },
            (e) => failure(e, "posts"),
          );
        };
        subscribePosts();
        dispose.push(() => offPosts?.());
        catalogLoaders.current.posts = () => {
          if (current() && postLimit < 1000) {
            postLimit = Math.min(1000, postLimit + 100);
            subscribePosts();
          }
        };

        // Separate future/history windows stop an old archive from crowding out upcoming plans.
        let eventLimit = 100,
          offUpcoming: (() => void) | undefined,
          offPast: (() => void) | undefined;
        const eventBoundary = new Date().toISOString();
        let futureEvents: LoopState["events"] = [],
          pastEvents: LoopState["events"] = [],
          futureMore = false,
          pastMore = false;
        const publishEvents = () => {
          if (current()) {
            const events = new Map(
              [...pastEvents, ...futureEvents].map((event) => [
                event.id,
                event,
              ]),
            );
            setState((s) => ({
              ...s,
              events: [...events.values()].sort((a, b) =>
                a.startAt.localeCompare(b.startAt),
              ),
            }));
            setHasMore((value) => ({
              ...value,
              events: (futureMore || pastMore) && eventLimit < 1000,
            }));
          }
        };
        const subscribeEvents = () => {
          offUpcoming?.();
          offPast?.();
          offUpcoming = onSnapshot(
            query(
              collection(c.db, "events"),
              where("endAt", ">=", eventBoundary),
              orderBy("endAt", "asc"),
              limit(eventLimit),
            ),
            (snap) => {
              futureEvents = snap.docs.map(
                (d) =>
                  ({ ...d.data(), id: d.id }) as LoopState["events"][number],
              );
              futureMore = snap.size === eventLimit;
              publishEvents();
              loaded("eventsUpcoming");
            },
            (e) => failure(e, "eventsUpcoming"),
          );
          offPast = onSnapshot(
            query(
              collection(c.db, "events"),
              where("endAt", "<", eventBoundary),
              orderBy("endAt", "desc"),
              limit(eventLimit),
            ),
            (snap) => {
              pastEvents = snap.docs.map(
                (d) =>
                  ({ ...d.data(), id: d.id }) as LoopState["events"][number],
              );
              pastMore = snap.size === eventLimit;
              publishEvents();
              loaded("eventsPast");
            },
            (e) => failure(e, "eventsPast"),
          );
        };
        subscribeEvents();
        dispose.push(() => {
          offUpcoming?.();
          offPast?.();
        });
        catalogLoaders.current.events = () => {
          if (current() && eventLimit < 1000) {
            eventLimit = Math.min(1000, eventLimit + 100);
            subscribeEvents();
          }
        };

        let publicChannels: LoopState["channels"] = [], privateChannels: LoopState["channels"] = [];
        const previewListeners = new Map<string, () => void>(), previewBuckets = new Map<string, Message[]>();
        const revokedChannelIds = new Set<string>();
        const activePages = new Map<number, { rows: Message[]; cursor?: MessageCursor; full: boolean }>(), activePageListeners = new Map<number, () => void>();
        const pendingMessagePages = new Set<number>();
        const historyRequests = new Map<number, { resolve(): void; reject(error: unknown): void }>();
        let activeChannel: LoopState["channels"][number] | undefined;
        let offActiveChannel: (() => void) | undefined;
        let conversationGeneration = 0, desiredHistoryPages = 1, historyLoading = false;
        const accessible = (channel: LoopState["channels"][number]) => channel.visibility === "public" || Boolean(channel.memberIds?.includes(user.uid));
        const allChannels = () => {
          const channels = new Map([...publicChannels, ...privateChannels].filter(channel => accessible(channel) && !revokedChannelIds.has(channel.id)).map(channel => [channel.id, channel]));
          if (activeChannel && accessible(activeChannel) && !revokedChannelIds.has(activeChannel.id)) channels.set(activeChannel.id, activeChannel);
          return [...channels.values()];
        };
        const publishMessages = () => {
          if (!current()) return;
          const allowed = new Set(allChannels().map(channel => channel.id));
          const pages = [...activePages.entries()].sort(([a], [b]) => b - a);
          // The latest active page wins if its IDs overlap an older page or preview.
          const messages = mergeMessages([...previewBuckets.values(), ...pages.map(([, page]) => page.rows)], allowed);
          setState(s => ({ ...s, messages }));
          const last = [...activePages.entries()].sort(([a], [b]) => a - b).at(-1);
          setHistory({ loading: historyLoading, hasMore: last?.[1].full ?? false });
        };
        const stopActivePages = () => {
          conversationGeneration++;
          activePageListeners.forEach(unsubscribe => unsubscribe());
          activePageListeners.clear();
          activePages.clear();
          pendingMessagePages.clear();
          historyRequests.forEach(request => request.resolve());
          historyRequests.clear();
          historyLoading = false;
        };
        const subscribeMessagePage = (pageNumber: number, cursor?: MessageCursor) => {
          const selected = conversationRef.current;
          if (!current() || !selected.channelId || !activeChannel || !accessible(activeChannel) || activePageListeners.has(pageNumber)) return;
          const requestGeneration = conversationGeneration;
          const channelId = selected.channelId;
          pendingMessagePages.add(pageNumber);
          historyLoading = true;
          publishMessages();
          activePageListeners.set(pageNumber, onSnapshot(messagePageQuery(c.db, channelId, selected.topic, cursor), snap => {
            if (!current() || requestGeneration !== conversationGeneration || !activeChannel || !accessible(activeChannel)) return;
            const rows = snap.docs.map(record => ({ ...record.data(), id: record.id }) as Message);
            const nextCursor = messageCursor(rows) ?? cursor;
            const previous = activePages.get(pageNumber)?.cursor;
            if (previous && (previous.createdAt !== nextCursor?.createdAt || previous.id !== nextCursor?.id)) {
              for (const [number, unsubscribe] of activePageListeners) if (number > pageNumber) {
                unsubscribe();
                activePageListeners.delete(number);
                activePages.delete(number);
                pendingMessagePages.delete(number);
              }
            }
            activePages.set(pageNumber, { rows, cursor: nextCursor, full: snap.size === 100 });
            pendingMessagePages.delete(pageNumber);
            historyLoading = pendingMessagePages.size > 0;
            publishMessages();
            historyRequests.get(pageNumber)?.resolve();
            historyRequests.delete(pageNumber);
            if (snap.size === 100 && nextCursor && pageNumber + 1 < desiredHistoryPages) subscribeMessagePage(pageNumber + 1, nextCursor);
          }, error => {
            if (!current() || requestGeneration !== conversationGeneration) return;
            activePages.delete(pageNumber);
            activePageListeners.delete(pageNumber);
            pendingMessagePages.delete(pageNumber);
            historyLoading = pendingMessagePages.size > 0;
            if ((error as { code?: string }).code === "permission-denied") {
              revokedChannelIds.add(channelId);
              activeChannel = undefined;
              previewBuckets.delete(channelId);
              stopActivePages();
            }
            publishMessages();
            historyRequests.get(pageNumber)?.reject(error);
            historyRequests.delete(pageNumber);
            failure(error);
          }));
        };
        refreshMessageSubscriptions = () => {
          if (!current()) return;
          const channels = allChannels();
          const wanted = previewChannelIds(channels, subscriptions);
          previewListeners.forEach((unsubscribe, id) => {
            if (!wanted.has(id)) {
              unsubscribe();
              previewListeners.delete(id);
              previewBuckets.delete(id);
            }
          });
          for (const id of wanted) if (!previewListeners.has(id)) {
            previewListeners.set(id, onSnapshot(query(collection(c.db, "messages"), where("channelId", "==", id), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), limit(100)), snap => {
              if (!current() || !previewListeners.has(id)) return;
              previewBuckets.set(id, snap.docs.map(record => ({ ...record.data(), id: record.id }) as Message));
              publishMessages();
            }, error => {
              previewBuckets.delete(id);
              if ((error as { code?: string }).code === "permission-denied") {
                revokedChannelIds.add(id);
                if (conversationRef.current.channelId === id) {
                  activeChannel = undefined;
                  stopActivePages();
                }
              }
              publishMessages();
              failure(error);
            }));
          }
          setState(s => ({ ...s, channels }));
          publishMessages();
        };
        liveActions.current.watchConversation = (id: string | null) => {
          offActiveChannel?.();
          offActiveChannel = undefined;
          stopActivePages();
          activeChannel = undefined;
          desiredHistoryPages = 1;
          refreshMessageSubscriptions();
          if (!id || id.includes("/")) return;
          const requestGeneration = conversationGeneration;
          historyLoading = true;
          publishMessages();
          offActiveChannel = onSnapshot(doc(c.db, "channels", id), snap => {
            if (!current() || requestGeneration !== conversationGeneration) return;
            const channel = snap.exists() ? { ...snap.data(), id: snap.id } as LoopState["channels"][number] : undefined;
            if (!channel || !accessible(channel)) {
              revokedChannelIds.add(id);
              activeChannel = undefined;
              previewBuckets.delete(id);
              stopActivePages();
            } else {
              revokedChannelIds.delete(id);
              activeChannel = channel;
              subscribeMessagePage(0);
            }
            refreshMessageSubscriptions();
          }, error => {
            if (!current() || requestGeneration !== conversationGeneration) return;
            if ((error as { code?: string }).code === "permission-denied") revokedChannelIds.add(id);
            activeChannel = undefined;
            previewBuckets.delete(id);
            stopActivePages();
            refreshMessageSubscriptions();
            failure(error);
          });
        };
        liveActions.current.loadOlderMessages = () => {
          if (historyLoading || !current()) return Promise.resolve();
          const last = [...activePages.entries()].sort(([a], [b]) => a - b).at(-1);
          if (!last?.[1].full || !last[1].cursor) return Promise.resolve();
          const pageNumber = last[0] + 1;
          desiredHistoryPages = pageNumber + 1;
          return new Promise<void>((resolve, reject) => {
            historyRequests.set(pageNumber, { resolve, reject });
            subscribeMessagePage(pageNumber, last[1].cursor);
          });
        };
        const refresh = refreshMessageSubscriptions;
        const selected = conversationRef.current;
        liveActions.current.watchConversation(selected.channelId, selected.topic);
        dispose.push(() => {
          offActiveChannel?.();
          stopActivePages();
          previewListeners.forEach(unsubscribe => unsubscribe());
          previewListeners.clear();
          previewBuckets.clear();
        });
        dispose.push(
          onSnapshot(
            query(
              collection(c.db, "channels"),
              where("visibility", "==", "public"),
              limit(100),
            ),
            (snap) => {
              publicChannels = snap.docs.map(
                (d) =>
                  ({ ...d.data(), id: d.id }) as LoopState["channels"][number],
              );
              publicChannels.forEach(channel => revokedChannelIds.delete(channel.id));
              refresh();
              loaded("publicChannels");
            },
            (e) => failure(e, "publicChannels"),
          ),
        );
        dispose.push(
          onSnapshot(
            query(
              collection(c.db, "channels"),
              where("memberIds", "array-contains", user.uid),
              limit(100),
            ),
            (snap) => {
              const previousIds = new Set(privateChannels.map(channel => channel.id));
              privateChannels = snap.docs
                .map(
                  (d) =>
                    ({
                      ...d.data(),
                      id: d.id,
                    }) as LoopState["channels"][number],
                )
                .filter((x) => x.visibility === "private");
              privateChannels.forEach(channel => {
                revokedChannelIds.delete(channel.id);
                previousIds.delete(channel.id);
              });
              // A membership query removal immediately hides cached private history. Re-read
              // an active room to distinguish revocation from a bounded catalog window shift.
              previousIds.forEach(id => revokedChannelIds.add(id));
              if (activeChannel && previousIds.has(activeChannel.id)) {
                const selected = conversationRef.current;
                liveActions.current.watchConversation?.(selected.channelId, selected.topic);
              }
              refresh();
              loaded("privateChannels");
            },
            (e) => failure(e, "privateChannels"),
          ),
        );
      } catch (e) {
        if (active && turn === generation) {
          failureOutside(e);
          setReady(true);
        }
      }
    });
    function failureOutside(e: unknown) {
      if (active) setError(readableError(e));
    }
    return () => {
      active = false;
      generation++;
      off();
      dispose.forEach((fn) => fn());
    };
  }, [mode, firebaseConfig?.projectId, useEmulators, emulators?.host, emulators?.authPort, emulators?.firestorePort, emulators?.functionsPort]);
  useEffect(() => {
    if (mode === "demo" && ready)
      storageRef.current
        ?.save(state)
        .catch(() =>
          setError(
            "Your changes are available for this session, but could not be saved on this device.",
          ),
        );
  }, [state, ready, mode]);
  const dispatch = useCallback(
    async (command: Command) => {
      setError(null);
      setPending((n) => n + 1);
      try {
        if (mode === "demo") {
          const next = applyCommand(stateRef.current, command, {
            now: new Date().toISOString(),
            id: requestId(),
          });
          stateRef.current = next;
          setState(next);
        } else {
          const c = setup(firebaseConfig!, useEmulators, authPersistence, emulators);
          if (!c.auth.currentUser) throw new Error("Sign in to continue.");
          await httpsCallable(
            c.functions,
            "executeCommand",
          )({ command, requestId: requestId() });
        }
      } catch (e) {
        const m = readableError(e);
        setError(m);
        throw new Error(m);
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    },
    [mode, firebaseConfig?.projectId, useEmulators, emulators?.host, emulators?.authPort, emulators?.firestorePort, emulators?.functionsPort],
  );
  const authAction = async (fn: (auth: Auth) => Promise<unknown>) => {
    setError(null);
    try {
      if (mode === "demo")
        throw new Error(
          "Account sign-in is available in the connected live app. This preview uses fictional sample data.",
        );
      await fn(setup(firebaseConfig!, useEmulators, authPersistence, emulators).auth);
    } catch (e) {
      const m = readableError(e);
      setError(m);
      throw new Error(m);
    }
  };
  const refreshVerification = async () => {
    let verified = false;
    await authAction(async (auth) => {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in to refresh your verification.");
      await reload(user);
      await user.getIdToken(true);
      verified = user.emailVerified;
      setEmailVerified(verified);
      if (verified)
        await httpsCallable(
          setup(firebaseConfig!, useEmulators, authPersistence, emulators).functions,
          "executeCommand",
        )({ command: { type: "profile.update", profile: {} }, requestId: requestId() });
    });
    return verified;
  };
  const sendVerificationEmail = () =>
    authAction(async (auth) => {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in to verify your email.");
      if (user.emailVerified)
        throw new Error("Your email is already verified.");
      await sendEmailVerification(user);
    });
  const accountCall = async (name: string, payload: unknown) => {
    setError(null);
    if (mode === "demo")
      throw new Error(
        "This account action is available in the connected live app.",
      );
    try {
      return (
        await httpsCallable(
          setup(firebaseConfig!, useEmulators, authPersistence, emulators).functions,
          name,
        )(payload)
      ).data;
    } catch (e) {
      const message = readableError(e);
      setError(message);
      throw new Error(message);
    }
  };
  const exportAccount = async (): Promise<Record<string, unknown>> => {
    if (mode === "demo") {
      const current = stateRef.current;
      return {
        version: 1,
        mode: "fictional demonstration",
        exportedAt: new Date().toISOString(),
        profile: current.profiles.find((p) => p.id === current.currentUserId),
        preferences: current.preferences,
        posts: current.posts.filter(
          (p) => p.authorId === current.currentUserId,
        ),
        messages: current.messages.filter(
          (m) => m.authorId === current.currentUserId,
        ),
        directMessages: current.directMessages.filter((m) =>
          [m.fromId, m.toId].includes(current.currentUserId),
        ),
        connections: current.connections.filter(connection =>
          [connection.fromId, connection.toId].includes(current.currentUserId),
        ),
        follows: current.follows.filter(follow =>
          follow.followerId === current.currentUserId || follow.followingId === current.currentUserId,
        ),
        events: current.events.filter(event =>
          event.hostId === current.currentUserId || event.attendeeIds.includes(current.currentUserId) || event.waitlistIds.includes(current.currentUserId),
        ),
      };
    }
    const header = (await accountCall("exportAccount", {})) as Record<
      string,
      unknown
    >;
    const result = { ...header };
    for (const collection of header.collections as string[]) {
      const records: unknown[] = [];
      let cursor: string | null = null;
      do {
        const page = (await accountCall("exportAccount", {
          collection,
          ...(cursor ? { cursor } : {}),
        })) as { records: unknown[]; nextCursor: string | null };
        records.push(...page.records);
        cursor = page.nextCursor;
      } while (cursor);
      result[collection] = records;
    }
    return result;
  };
  return (
    <Context.Provider
      value={{
        state,
        dispatch,
        mode,
        ready,
        error,
        pending,
        hasMore,
        loadMore,
        role,
        emailVerified,
        sendVerificationEmail,
        refreshVerification,
        watchConversation,
        loadOlderMessages,
        history,
        directory,
        setDirectoryQuery,
        loadMoreDirectory,
        loadSavedPosts,
        loadProfile,
        clearError: () => setError(null),
        resetDemo: () => {
          setState(initialState());
          setError(null);
        },
        signIn: (email, password) =>
          authAction((auth) =>
            signInWithEmailAndPassword(auth, email, password),
          ),
        signUp: (email, password, name) =>
          authAction(async (auth) => {
            if (name.trim().length < 2) throw new Error("Enter your name.");
            const result = await createUserWithEmailAndPassword(
              auth,
              email,
              password,
            );
            await updateProfile(result.user, { displayName: name.trim() });
            await httpsCallable(
              setup(firebaseConfig!, useEmulators, authPersistence, emulators).functions,
              "bootstrap",
            )({ name: name.trim() });
            await httpsCallable(
              setup(firebaseConfig!, useEmulators, authPersistence, emulators).functions,
              "executeCommand",
            )({
              command: {
                type: "profile.update",
                profile: { name: name.trim() },
              },
              requestId: requestId(),
            });
            await sendEmailVerification(result.user);
          }),
        signOut: () => authAction(async (auth) => {
          const registered = registeredPushToken.current;
          if (registered && registered.userId === auth.currentUser?.uid) {
            // Logging out remains possible offline; the native client also retains a token for retry.
            await httpsCallable(
              setup(firebaseConfig!, useEmulators, authPersistence, emulators).functions,
              "registerPushToken",
              { timeout: 5000 },
            )({ token: registered.token, platform: registered.platform, remove: true }).catch(() => undefined);
          }
          registeredPushToken.current = null;
          await firebaseSignOut(auth);
        }),
        resetPassword: (email) =>
          authAction((auth) => sendPasswordResetEmail(auth, email)),
        appealTrust: async (reason) => {
          await accountCall("appealTrust", { reason });
        },
        exportAccount,
        deleteAccount: async (confirmation) => {
          await accountCall("deleteAccount", { confirmation });
          await firebaseSignOut(setup(firebaseConfig!, useEmulators, authPersistence, emulators).auth);
        },
        registerPushToken: async (token, platform = "web", remove = false) => {
          const userId = mode === "live" ? setup(firebaseConfig!, useEmulators, authPersistence, emulators).auth.currentUser?.uid : undefined;
          await accountCall("registerPushToken", { token, platform, remove });
          if (remove) {
            if (registeredPushToken.current?.token === token) registeredPushToken.current = null;
          } else if (userId) registeredPushToken.current = { token, platform, userId };
        },
        getTrust: async (userId) =>
          mode === "demo"
            ? {
                userId,
                trust: stateRef.current.profiles.find((p) => p.id === userId)
                  ?.trust,
                explanation: "Fictional demonstration score.",
              }
            : accountCall("getTrust", { userId }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLoop() {
  const value = useContext(Context);
  if (!value) throw new Error("useLoop must be used within LoopProvider");
  return value;
}
