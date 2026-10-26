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
export type StorageDriver = {
  load(): Promise<LoopState | null>;
  save(state: LoopState): Promise<void>;
};
export type LoopRole = "member" | "moderator" | "admin";
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
};
const Context = createContext<LoopContextValue | null>(null);
let cloud: { auth: Auth; db: Firestore; functions: Functions } | undefined;
function setup(
  config: FirebaseOptions,
  emulator = false,
  persistence?: Persistence,
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
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
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
}: {
  children: React.ReactNode;
  storage?: StorageDriver;
  firebaseConfig?: FirebaseOptions;
  useEmulators?: boolean;
  authPersistence?: Persistence;
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
      c = setup(firebaseConfig!, useEmulators, authPersistence);
    } catch (e) {
      setError(readableError(e));
      setReady(true);
      return () => {
        active = false;
      };
    }
    let dispose: (() => void)[] = [];
    let messageDispose: (() => void)[] = [];
    let generation = 0;
    const off = onAuthStateChanged(c.auth, async (user) => {
      const turn = ++generation;
      dispose.forEach((fn) => fn());
      messageDispose.forEach((fn) => fn());
      dispose = [];
      messageDispose = [];
      catalogLoaders.current = {};
      setHasMore({ posts: false, events: false });
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
        const peerProfiles = new Map<string, Profile>(),
          peerListeners = new Map<string, () => void>();
        let allowedPeerIds = new Set<string>();
        const publishProfiles = () => {
          if (!current()) return;
          const profiles = new Map(
            publicProfiles.map((profile) => [profile.id, profile]),
          );
          peerProfiles.forEach((profile) => profiles.set(profile.id, profile));
          if (ownProfile) profiles.set(ownProfile.id, ownProfile);
          setState((s) => ({ ...s, profiles: [...profiles.values()] }));
        };
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
                setState((s) => ({ ...s, preferences }));
                refreshPeers();
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
                setState((s) => ({
                  ...s,
                  posts: snap.docs.map(
                    (d) =>
                      ({ ...d.data(), id: d.id }) as LoopState["posts"][number],
                  ),
                }));
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

        const attachMessages = (channels: LoopState["channels"]) => {
          messageDispose.forEach((fn) => fn());
          messageDispose = [];
          const buckets = new Map<string, Message[]>();
          channels.slice(0, 30).forEach((channel) => {
            messageDispose.push(
              onSnapshot(
                query(
                  collection(c.db, "messages"),
                  where("channelId", "==", channel.id),
                  orderBy("createdAt", "desc"),
                  limit(100),
                ),
                (snap) => {
                  buckets.set(
                    channel.id,
                    snap.docs.map(
                      (d) => ({ ...d.data(), id: d.id }) as Message,
                    ),
                  );
                  if (current())
                    setState((s) => ({
                      ...s,
                      messages: [...buckets.values()]
                        .flat()
                        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
                    }));
                },
                (e) => failure(e),
              ),
            );
          });
        };
        let publicChannels: LoopState["channels"] = [],
          privateChannels: LoopState["channels"] = [];
        const refresh = () => {
          if (!current()) return;
          const all = [...publicChannels, ...privateChannels];
          setState((s) => ({ ...s, channels: all }));
          attachMessages(all);
        };
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
              privateChannels = snap.docs
                .map(
                  (d) =>
                    ({
                      ...d.data(),
                      id: d.id,
                    }) as LoopState["channels"][number],
                )
                .filter((x) => x.visibility === "private");
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
      messageDispose.forEach((fn) => fn());
    };
  }, [mode, firebaseConfig?.projectId, useEmulators]);
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
          const c = setup(firebaseConfig!, useEmulators);
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
    [mode, firebaseConfig?.projectId, useEmulators],
  );
  const authAction = async (fn: (auth: Auth) => Promise<unknown>) => {
    setError(null);
    try {
      if (mode === "demo")
        throw new Error(
          "Account sign-in is available in the connected live app. This preview uses fictional sample data.",
        );
      await fn(setup(firebaseConfig!, useEmulators).auth);
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
          setup(firebaseConfig!, useEmulators).functions,
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
          setup(firebaseConfig!, useEmulators).functions,
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
              setup(firebaseConfig!, useEmulators).functions,
              "bootstrap",
            )({ name: name.trim() });
            await httpsCallable(
              setup(firebaseConfig!, useEmulators).functions,
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
              setup(firebaseConfig!, useEmulators).functions,
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
          await firebaseSignOut(setup(firebaseConfig!, useEmulators).auth);
        },
        registerPushToken: async (token, platform = "web", remove = false) => {
          const userId = mode === "live" ? setup(firebaseConfig!, useEmulators).auth.currentUser?.uid : undefined;
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
