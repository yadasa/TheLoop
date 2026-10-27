import type { DirectMessage } from "@theloop/core";
import { canSearchPrivate, privateHistoryHits, type PrivateHistoryRequest, type PrivateSearchHit } from "./privateHistorySearch";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FirebaseOptions } from "firebase/app";
import type { Auth, Persistence } from "firebase/auth";
import type { Query } from "firebase/firestore";
import {
  applyCommand,
  pinnedIds,
  visiblePinnedMessages,
  initialState,
  emptyState,
  defaultPreferences,
  canReadPreviewImage,
  type LoopState,
  type Command,
  type Preferences,
  type Message,
  type Profile,
  type Connection,
  type Squad,
  type SquadInvite,
  type SquadMessage,
  type MediaTarget,
  type ImageAttachment,
  type DirectConversation,
  type DirectCatalogProgress,
} from "@theloop/core";
import { documentIdBatches, matchesDirectory, mergeMessages, mergeSquadInvites, normalizeDirectoryQuery, previewChannelIds, revokePrivateProfiles, visibleSquadMessages } from "./data";
import { MessagePages } from "./messagePages";
import { ReplyThread, type ReplyThreadHandle, type ReplyThreadState } from "./replyThread";
export { emptyReplyThread, type ReplyThreadHandle, type ReplyThreadState } from "./replyThread";
import { canSearchChannel, filterHistoryResults, validMessageSearch, type HistorySearchRequest, type HistorySearchPage } from "./historySearch";
export { HistorySearch, emptyHistorySearch, canSearchChannel, normalizeMessageSearch, validMessageSearch, type HistorySearchState, type HistorySearchRequest } from "./historySearch";
import { directConversationId, isDirectConversation, mergeDirectMessages, type DirectSnapshot } from "./directData";
import { lazyRuntime, resolveLiveRuntime } from "./lazyRuntime";
import { readableError } from "./errorCopy";
import { StartupGate, startupPreferences, startupProfile } from "./startupGate";
import { deriveDirectCatalog, emptyDirectCatalog, mergeDirectWatermark, newerDirectCatalogProgress, normalizeDirectConversation, normalizeDirectRead, parseDirectCatalogProgress, parseDirectConversation, type DirectCatalogState, type DirectWatermark } from "./directCatalog";
import { drainDirectRead } from "./directRead";
import { DocumentWatch, type DocumentStatus } from "./documentWatch";
import { DocumentCache, updateEventBuckets, type DocumentRead } from "./documentCache";
import { encodeImageBase64, imageMetadata, imageUploadBytes, ImageMemoryCache, MediaScopeChanged, mediaAuthority, mediaScope, previewImageData, safeMediaId, type ImageUploadInput, type ImageDataResult } from "./media";
export { useGuideEvents, type GuideEventsState } from "./guide";
export type { ImageUploadInput, ImageDataResult } from "./media";
export { stripWebPMetadata } from "./media";
export { directParticipantSnapshot, type DirectSnapshot } from "./directData";
export type { DocumentStatus } from "./documentWatch";
export type { DirectCatalogState } from "./directCatalog";
export { readableError } from "./errorCopy";
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
  startupError: string | null;
  retryStartup(): void;
  accountEmail: string | null;
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
  readChannelSearchPage(request: HistorySearchRequest): Promise<HistorySearchPage>;
  readPinnedMessages(channelId: string): Promise<Message[]>;
  watchReplyThread(channelId: string, messageId: string, publish: (state: ReplyThreadState) => void, failure: (error: unknown) => void): ReplyThreadHandle;
  readPrivateSearchPage(request: PrivateHistoryRequest): Promise<HistorySearchPage<PrivateSearchHit>>;
  history: { loading: boolean; hasMore: boolean };
  directory: { results: Profile[]; loading: boolean; hasMore: boolean };
  setDirectoryQuery(query: string): void;
  loadMoreDirectory(): void;
  loadSavedPosts(): Promise<void>;
  loadProfile(userId: string): Promise<void>;
  watchSquad(squadId: string | null): void;
  loadOlderSquadMessages(): Promise<void>;
  squadHistory: { loading: boolean; hasMore: boolean };
  uploadImage(target: MediaTarget, input: ImageUploadInput): Promise<ImageAttachment>;
  getImage(mediaId: string, reportId?: string): Promise<ImageDataResult>;
  discardImage(mediaId: string): void;
  mediaRevision: number;
  watchDirectConversation(userId: string | null): void;
  loadOlderDirectMessages(): Promise<void>;
  directHistory: { loading: boolean; hasMore: boolean };
  watchPost(id: string | null): void;
  watchEvent(id: string | null): void;
  postStatus: DocumentStatus;
  eventStatus: DocumentStatus;
  directCatalog: DirectCatalogState;
  loadMoreDirectConversations(): void;
  syncDirectConversations(): Promise<void>;
};
const Context = createContext<LoopContextValue | null>(null);
type FirebaseRuntime = typeof import("./firebaseRuntime");
type Cloud = ReturnType<FirebaseRuntime["setup"]>;
let cloud: Cloud | undefined;
const loadFirebaseRuntime = lazyRuntime(() => import("./firebaseRuntime"));
const requestId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export function restorePreview(saved: LoopState): LoopState {
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
  if (!object(saved) || saved.version !== 1 || typeof saved.currentUserId !== "string") throw new Error("Unsupported saved preview.");
  const arrays = ["profiles", "conferences", "channels", "messages", "communities", "posts", "events", "connections", "notifications", "directMessages", "reports"] as const;
  for (const key of arrays) if (!Array.isArray(saved[key]) || !saved[key].every(item => object(item) && typeof item.id === "string")) throw new Error("Invalid saved preview records.");
  if (saved.follows !== undefined && (!Array.isArray(saved.follows) || !saved.follows.every(item => object(item) && typeof item.id === "string"))) throw new Error("Invalid saved follow records.");
  for (const key of ["squads", "squadInvites", "squadMessages"] as const) if (saved[key] !== undefined && (!Array.isArray(saved[key]) || !saved[key].every(item => object(item) && typeof item.id === "string"))) throw new Error("Invalid saved squad records.");
  if (saved.preferences !== undefined && !object(saved.preferences)) throw new Error("Invalid saved preferences.");
  const preferences = { ...defaultPreferences(), ...saved.preferences };
  for (const key of ["joinedCommunityIds", "followingIds", "blockedIds", "savedPostIds", "interests"] as const) if (!strings(preferences[key])) throw new Error("Invalid saved preference list.");
  if (!object(preferences.subscriptions) || Object.values(preferences.subscriptions).some(value => !["following", "muted", "hidden"].includes(value))) throw new Error("Invalid saved subscriptions.");
  if (!object(preferences.readChannels) || Object.values(preferences.readChannels).some(value => typeof value !== "string")) throw new Error("Invalid saved read markers.");
  if (preferences.squadReadAt !== undefined && (!object(preferences.squadReadAt) || Object.values(preferences.squadReadAt).some(value => typeof value !== "string"))) throw new Error("Invalid saved squad read markers.");
  if (preferences.squadMutedIds !== undefined && !strings(preferences.squadMutedIds)) throw new Error("Invalid saved squad mutes.");
  if (preferences.dmMutedIds !== undefined && !strings(preferences.dmMutedIds)) throw new Error("Invalid saved direct-message mutes.");
  for (const profile of saved.profiles) if (typeof profile.name !== "string" || typeof profile.initials !== "string" || !strings(profile.skills) || !strings(profile.interests) || !strings(profile.openTo) || !Array.isArray(profile.links) || !object(profile.trust) || !Number.isFinite(profile.trust.score) || !strings(profile.trust.reasons)) throw new Error("Invalid saved profile.");
  for (const channel of saved.channels) if (typeof channel.name !== "string" || !strings(channel.topics)) throw new Error("Invalid saved channel.");
  for (const message of saved.messages) if (typeof message.body !== "string" || !Number.isFinite(Date.parse(message.createdAt)) || !object(message.reactions) || Object.values(message.reactions).some(value => !strings(value))) throw new Error("Invalid saved message.");
  for (const community of saved.communities) if (typeof community.name !== "string" || !Number.isFinite(community.members) || !strings(community.rules)) throw new Error("Invalid saved community.");
  for (const post of saved.posts) if (typeof post.title !== "string" || typeof post.body !== "string" || !Array.isArray(post.comments) || !strings(post.tags) || !object(post.votes) || (post.poll && (!Array.isArray(post.poll.options) || post.poll.options.some(option => !strings(option.voterIds))))) throw new Error("Invalid saved post.");
  for (const event of saved.events) if (typeof event.title !== "string" || !Number.isFinite(Date.parse(event.startAt)) || !Number.isFinite(Date.parse(event.endAt)) || !strings(event.attendeeIds) || !strings(event.waitlistIds) || !strings(event.tags)) throw new Error("Invalid saved event.");
  for (const squad of saved.squads ?? []) if (typeof squad.name !== "string" || !strings(squad.memberIds) || !strings(squad.pendingInviteeIds) || !object(squad.memberProfiles)) throw new Error("Invalid saved squad.");
  for (const invite of saved.squadInvites ?? []) if (typeof invite.squadId !== "string" || !strings(invite.participantIds) || !Number.isFinite(Date.parse(invite.expiresAt))) throw new Error("Invalid saved squad invitation.");
  for (const message of saved.squadMessages ?? []) if (typeof message.body !== "string" || !strings(message.audienceIds) || !Number.isFinite(Date.parse(message.createdAt)) || !object(message.reactions)) throw new Error("Invalid saved squad message.");
  for (const message of saved.directMessages) {
    if (typeof message.fromId !== "string" || typeof message.toId !== "string" || typeof message.body !== "string" || !Number.isFinite(Date.parse(message.createdAt)) || typeof message.read !== "boolean" || (message.participantIds !== undefined && !strings(message.participantIds))) throw new Error("Invalid saved direct message.");
    for (const key of ["fromName", "fromInitials", "toName", "toInitials"] as const) if (message[key] !== undefined && typeof message[key] !== "string") throw new Error("Invalid saved direct-message identity.");
    if (message.conversationId !== undefined && message.conversationId !== directConversationId(message.fromId, message.toId)) throw new Error("Invalid saved direct-message conversation.");
  }
  if (saved.directConversations !== undefined && (!Array.isArray(saved.directConversations) || saved.directConversations.some(conversation => !parseDirectConversation(conversation, conversation.id, saved.currentUserId)))) throw new Error("Invalid saved private conversation catalog.");
  if (saved.previewImages !== undefined) {
    if (!object(saved.previewImages) || Object.keys(saved.previewImages).length > 64) throw new Error("Invalid saved preview images.");
    let total = 0;
    for (const [id, entry] of Object.entries(saved.previewImages)) {
      if (!object(entry) || !object(entry.target) || !["channel", "squad", "directMessage", "community"].includes(entry.target.kind as string) || !safeMediaId(entry.target.id) || typeof entry.ownerId !== "string" || !Number.isFinite(Date.parse(entry.createdAt as string))) throw new Error("Invalid saved preview image scope.");
      const parsed = previewImageData(entry);
      if (parsed.image.id !== id) throw new Error("Invalid saved preview image ID.");
      if (entry.linkedTo !== undefined && (!object(entry.linkedTo) || !["message", "squadMessage", "directMessage", "post"].includes(entry.linkedTo.kind as string) || !safeMediaId(entry.linkedTo.id))) throw new Error("Invalid saved preview image source.");
      total += parsed.image.size;
    }
    if (total > 2 * 1024 * 1024) throw new Error("Saved preview images exceed 2 MB.");
  }
  return { ...saved, follows: saved.follows ?? [], squads: saved.squads ?? [], squadInvites: saved.squadInvites ?? [], squadMessages: saved.squadMessages ?? [], preferences: { ...preferences, squadReadAt: preferences.squadReadAt ?? {}, squadMutedIds: preferences.squadMutedIds ?? [], dmMutedIds: preferences.dmMutedIds ?? [] } };
}
export function LoopProvider({
  children,
  storage,
  firebaseConfig,
  useEmulators = false,
  authPersistence,
  authPersistenceFactory,
  emulators,
}: {
  children: React.ReactNode;
  storage?: StorageDriver;
  firebaseConfig?: FirebaseOptions;
  useEmulators?: boolean;
  authPersistence?: Persistence;
  authPersistenceFactory?: () => Promise<Persistence | undefined>;
  emulators?: EmulatorConfig;
}) {
  const mode = firebaseConfig?.apiKey ? "live" : "demo";
  const [state, setState] = useState<LoopState>(() =>
    mode === "demo" ? initialState() : emptyState(),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const transportGeneration = useRef(0);
  const liveCloud = async () => {
    const generation = transportGeneration.current, actorId = cloud?.auth.currentUser?.uid;
    const current = () => modeRef.current === "live" && generation === transportGeneration.current && cloud?.auth.currentUser?.uid === actorId;
    const resolved = await resolveLiveRuntime({ load: loadFirebaseRuntime, prepare: () => cloud ? undefined : authPersistence ?? authPersistenceFactory?.(), current });
    if (!resolved) throw new MediaScopeChanged();
    const sdk = resolved.runtime, c = sdk.setup(firebaseConfig!, useEmulators, resolved.prepared, emulators);
    cloud = c;
    return { sdk, c };
  };
  const imageCache = useRef(new ImageMemoryCache());
  const [mediaRevision, setMediaRevision] = useState(0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(0);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const startupCleanup = useRef<(() => void) | null>(null);
  const readyRef = useRef(ready); readyRef.current = ready;
  const retryStartup = useCallback(() => {
    if (modeRef.current !== "live") return;
    startupCleanup.current?.();
    readyRef.current = false;
    setReady(false);
    setStartupError(null);
    setError(null);
    setStartupAttempt(attempt => attempt + 1);
  }, []);
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const previewReady = useRef(false);
  const [hasMore, setHasMore] = useState({ posts: false, events: false });
  const [history, setHistory] = useState({ loading: false, hasMore: false });
  const [squadHistory, setSquadHistory] = useState({ loading: false, hasMore: false });
  const [directHistory, setDirectHistory] = useState({ loading: false, hasMore: false });
  const [postStatus, setPostStatus] = useState<DocumentStatus>({ id: null, loading: false, notFound: false, error: null });
  const [eventStatus, setEventStatus] = useState<DocumentStatus>({ id: null, loading: false, notFound: false, error: null });
  const [directCatalog, setDirectCatalog] = useState<DirectCatalogState>(emptyDirectCatalog);
  const [directory, setDirectory] = useState<{ results: Profile[]; loading: boolean; hasMore: boolean }>({ results: [], loading: false, hasMore: false });
  const [directoryQuery, updateDirectoryQuery] = useState("");
  const directoryQueryRef = useRef("");
  const conversationRef = useRef<{ channelId: string | null; topic?: string }>({ channelId: null });
  const squadRef = useRef<string | null>(null);
  const directRef = useRef<string | null>(null);
  const postRef = useRef<string | null>(null), eventRef = useRef<string | null>(null);
  const liveActions = useRef<Partial<{
    watchConversation(channelId: string | null, topic?: string): void;
    loadOlderMessages(): Promise<void>;
    setDirectoryQuery(query: string): void;
    loadMoreDirectory(): void;
    loadSavedPosts(): Promise<void>;
    loadProfile(userId: string): Promise<void>;
    watchSquad(squadId: string | null): void;
    loadOlderSquadMessages(): Promise<void>;
    uploadImage(payload: { target: MediaTarget; contentType: ImageUploadInput["contentType"]; base64: string; requestId: string }): Promise<unknown>;
    getImage(mediaId: string, reportId?: string): Promise<unknown>;
    watchDirectConversation(userId: string | null): void;
    loadOlderDirectMessages(): Promise<void>;
    watchPost(id: string | null): void;
    watchEvent(id: string | null): void;
    loadMoreDirectConversations(): void;
    syncDirectConversations(): Promise<void>;
  }>>({});
  const watchConversation = useCallback((channelId: string | null, topic?: string) => {
    const previous = conversationRef.current;
    if (previous.channelId === channelId && previous.topic === topic) return;
    conversationRef.current = { channelId, topic };
    synchronizeMedia();
    if (liveActions.current.watchConversation) liveActions.current.watchConversation(channelId, topic);
    else setHistory({ loading: false, hasMore: false });
  }, []);
  const loadOlderMessages = useCallback(async () => { await liveActions.current.loadOlderMessages?.(); }, []);
  const readChannelSearchPage = async (request: HistorySearchRequest): Promise<HistorySearchPage> => {
    if (!validMessageSearch(request.query)) throw new Error("Enter between 2 and 100 characters to search.");
    const userId = stateRef.current.currentUserId, generation = transportGeneration.current, requestMode = modeRef.current;
    const current = () => generation === transportGeneration.current && requestMode === modeRef.current &&
      stateRef.current.currentUserId === userId && canSearchChannel(stateRef.current, request.channelId);
    if (!current()) throw new Error("This group chat is no longer available to you.");
    let rows: Message[];
    if (requestMode === "demo") {
      rows = stateRef.current.messages.filter(message => message.channelId === request.channelId &&
        (request.topic === undefined || message.topic === request.topic) &&
        (!request.cursor || message.createdAt < request.cursor.createdAt ||
          (message.createdAt === request.cursor.createdAt && message.id < request.cursor.id)))
        .sort((a, b) => a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0).slice(0, 100);
    } else {
      const { sdk, c } = await liveCloud();
      if (!current() || !readyRef.current || c.auth.currentUser?.uid !== userId) throw new MediaScopeChanged();
      const page = await sdk.getDocsFromServer(sdk.messagePageQuery(c.db, request.channelId, request.topic, request.cursor));
      if (!current() || !readyRef.current || c.auth.currentUser?.uid !== userId) throw new MediaScopeChanged();
      rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as Message);
    }
    if (!current()) throw new MediaScopeChanged();
    const last = rows.at(-1);
    if (last && (typeof last.createdAt !== "string" || !Number.isFinite(Date.parse(last.createdAt)))) throw new Error("Could not read this part of the message history.");
    return { matches: filterHistoryResults(rows, request, stateRef.current), scanned: rows.length,
      hasMore: rows.length === 100, ...(last ? { cursor: { id: last.id, createdAt: last.createdAt } } : {}) };
  };
  const readPrivateSearchPage = async (request: PrivateHistoryRequest): Promise<HistorySearchPage<PrivateSearchHit>> => {
    if (!validMessageSearch(request.query)) throw new Error("Enter between 2 and 100 characters to search.");
    const userId = stateRef.current.currentUserId, generation = transportGeneration.current, requestMode = modeRef.current;
    const current = () => generation === transportGeneration.current && requestMode === modeRef.current && stateRef.current.currentUserId === userId && canSearchPrivate(stateRef.current, request);
    if (!current()) throw new Error("This conversation is no longer available to you.");
    let rows: (DirectMessage | SquadMessage)[];
    if (requestMode === "demo") {
      const source = request.kind === "dm" ? stateRef.current.directMessages.filter(message =>
        (message.fromId === userId && message.toId === request.id) || (message.toId === userId && message.fromId === request.id)) :
        stateRef.current.squadMessages.filter(message => message.squadId === request.id && message.audienceIds.includes(userId));
      rows = source.filter(message => !request.cursor || message.createdAt < request.cursor.createdAt || (message.createdAt === request.cursor.createdAt && message.id < request.cursor.id))
        .sort((a, b) => a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0).slice(0, 100);
    } else {
      const { sdk, c } = await liveCloud();
      if (!current() || !readyRef.current || c.auth.currentUser?.uid !== userId) throw new MediaScopeChanged();
      const query = request.kind === "dm" ? sdk.directMessagePageQuery(c.db, userId, request.id, request.cursor) : sdk.squadMessagePageQuery(c.db, request.id, userId, request.cursor);
      const page = await sdk.getDocsFromServer(query);
      if (!current() || !readyRef.current || c.auth.currentUser?.uid !== userId) throw new MediaScopeChanged();
      rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as DirectMessage | SquadMessage);
    }
    if (!current()) throw new MediaScopeChanged();
    const last = rows.at(-1);
    if (last && (typeof last.createdAt !== "string" || !Number.isFinite(Date.parse(last.createdAt)))) throw new Error("Could not read this part of the message history.");
    return { matches: privateHistoryHits(rows, request, stateRef.current), scanned: rows.length, hasMore: rows.length === 100,
      ...(last ? { cursor: { id: last.id, createdAt: last.createdAt } } : {}) };
  };
  const watchReplyThread = (channelId: string, messageId: string, publish: (state: ReplyThreadState) => void, failure: (error: unknown) => void): ReplyThreadHandle => {
    const userId = stateRef.current.currentUserId, generation = transportGeneration.current, requestMode = modeRef.current;
    let closed = false, thread: ReplyThread | undefined;
    const current = () => !closed && generation === transportGeneration.current && requestMode === modeRef.current && stateRef.current.currentUserId === userId && canSearchChannel(stateRef.current, channelId);
    const visible = (message: Message) => !stateRef.current.preferences.blockedIds.includes(message.authorId) && stateRef.current.preferences.subscriptions[`${channelId}:${message.topic}`] !== "hidden";
    const fail = (error: unknown) => { if (closed) return; closed = true; thread?.close(); failure(error); };
    if (!current() || !messageId || messageId.includes("/")) fail(new MediaScopeChanged());
    else if (requestMode === "demo") {
      thread = new ReplyThread({ channelId, messageId, visible,
        subscribeParent: next => { next(stateRef.current.messages.find(message => message.id === messageId && message.channelId === channelId) || null); return () => {}; },
        subscribeReplies: (cursor, next) => { next(stateRef.current.messages.filter(message => message.channelId === channelId && message.replyTo === messageId && (!cursor || message.createdAt < cursor.createdAt || (message.createdAt === cursor.createdAt && message.id < cursor.id))).sort((a, b) => a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0).slice(0, 100)); return () => {}; },
        publish: value => { if (current()) publish(value); }, failure: fail,
      });
      thread.start();
    } else void liveCloud().then(({ sdk, c }) => {
      const valid = () => current() && readyRef.current && c.auth.currentUser?.uid === userId;
      if (!valid()) { if (!closed) fail(new MediaScopeChanged()); return; }
      thread = new ReplyThread({ channelId, messageId, visible,
        subscribeParent: (next, error) => sdk.onSnapshot(sdk.pinnedMessageQuery(c.db, channelId, [messageId]), { includeMetadataChanges: true }, page => {
          if (!valid()) { fail(new MediaScopeChanged()); return; }
          if (page.metadata.fromCache || page.metadata.hasPendingWrites) return;
          const record = page.docs[0]; next(record ? { ...record.data(), id: record.id } as Message : null);
        }, error),
        subscribeReplies: (cursor, next, error) => sdk.onSnapshot(sdk.replyPageQuery(c.db, channelId, messageId, cursor), { includeMetadataChanges: true }, page => {
          if (!valid()) { fail(new MediaScopeChanged()); return; }
          if (page.metadata.fromCache || page.metadata.hasPendingWrites) return;
          next(page.docs.map(record => ({ ...record.data(), id: record.id }) as Message));
        }, error),
        publish: value => { if (valid()) publish(value); }, failure: fail,
      });
      thread.start();
    }).catch(fail);
    return { close: () => { closed = true; thread?.close(); }, loadMore: async () => { if (current()) await thread?.loadMore(); } };
  };
  const readPinnedMessages = async (channelId: string): Promise<Message[]> => {
    const userId = stateRef.current.currentUserId, generation = transportGeneration.current, requestMode = modeRef.current;
    const current = () => generation === transportGeneration.current && requestMode === modeRef.current && stateRef.current.currentUserId === userId && canSearchChannel(stateRef.current, channelId);
    if (!current()) throw new Error("This group chat is no longer available to you.");
    const channel = stateRef.current.channels.find(value => value.id === channelId)!;
    const ids = pinnedIds(channel);
    if (!ids.length) return [];
    let rows: Message[];
    if (requestMode === "demo") rows = stateRef.current.messages.filter(message => message.channelId === channelId && ids.includes(message.id));
    else {
      const { sdk, c } = await liveCloud();
      if (!current() || !readyRef.current || c.auth.currentUser?.uid !== userId) throw new MediaScopeChanged();
      const query = sdk.pinnedMessageQuery(c.db, channelId, ids);
      const page = await sdk.getDocsFromServer(query);
      if (!current() || !readyRef.current || c.auth.currentUser?.uid !== userId) throw new MediaScopeChanged();
      rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as Message);
    }
    if (!current()) throw new MediaScopeChanged();
    return visiblePinnedMessages(stateRef.current, stateRef.current.channels.find(value => value.id === channelId)!, rows);
  };
  const watchSquad = useCallback((squadId: string | null) => {
    if (squadRef.current === squadId) return;
    squadRef.current = squadId;
    synchronizeMedia();
    if (liveActions.current.watchSquad) liveActions.current.watchSquad(squadId);
    else setSquadHistory({ loading: false, hasMore: false });
  }, []);
  const loadOlderSquadMessages = useCallback(async () => { await liveActions.current.loadOlderSquadMessages?.(); }, []);
  const watchDirectConversation = useCallback((userId: string | null) => {
    if (directRef.current === userId) return;
    directRef.current = userId;
    synchronizeMedia();
    if (liveActions.current.watchDirectConversation) liveActions.current.watchDirectConversation(userId);
    else setDirectHistory({ loading: false, hasMore: false });
  }, []);
  const loadOlderDirectMessages = useCallback(async () => { await liveActions.current.loadOlderDirectMessages?.(); }, []);
  const localDocumentStatus = (id: string | null, kind: "post" | "event"): DocumentStatus => {
    if (!id) return { id: null, loading: false, notFound: false, error: null };
    if (modeRef.current === "demo") return { id, loading: !previewReady.current, notFound: previewReady.current && !stateRef.current[kind === "post" ? "posts" : "events"].some(record => record.id === id), error: null };
    return { id, loading: !readyRef.current, notFound: false, error: readyRef.current ? `Sign in or reconnect to open this ${kind}.` : null };
  };
  const watchPost = useCallback((id: string | null) => {
    postRef.current = id;
    if (liveActions.current.watchPost) liveActions.current.watchPost(id);
    else setPostStatus(localDocumentStatus(id, "post"));
  }, []);
  const watchEvent = useCallback((id: string | null) => {
    eventRef.current = id;
    if (liveActions.current.watchEvent) liveActions.current.watchEvent(id);
    else setEventStatus(localDocumentStatus(id, "event"));
  }, []);
  const loadMoreDirectConversations = useCallback(() => liveActions.current.loadMoreDirectConversations?.(), []);
  const syncDirectConversations = useCallback(async () => {
    if (modeRef.current === "demo") return;
    const action = liveActions.current.syncDirectConversations;
    if (!action) throw new Error("Sign in to find earlier conversations.");
    await action();
  }, []);
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
  const roleRef = useRef(role);
  roleRef.current = role;
  const currentMediaState = useCallback(() => {
    const current = stateRef.current;
    return modeRef.current === "live" ? { ...current, currentUserId: cloud?.auth.currentUser?.uid ?? "" } : current;
  }, []);
  const currentMediaAuthority = useCallback(() => {
    const selected = conversationRef.current;
    return mediaAuthority(currentMediaState(), { mode: modeRef.current, role: roleRef.current, conversation: selected.channelId ? `${selected.channelId}\u0000${selected.topic ?? ""}` : null, squad: squadRef.current, direct: directRef.current });
  }, [currentMediaState]);
  const synchronizeMedia = useCallback(() => {
    const selected = conversationRef.current;
    if (imageCache.current.setContext(mediaScope(currentMediaState(), { mode: modeRef.current, role: roleRef.current, conversation: selected.channelId ? `${selected.channelId}\u0000${selected.topic ?? ""}` : null, squad: squadRef.current, direct: directRef.current }))) setMediaRevision(value => value + 1);
    return imageCache.current.revision;
  }, [currentMediaState]);
  const uploadImage = useCallback(async (target: MediaTarget, input: ImageUploadInput): Promise<ImageAttachment> => {
    setError(null);
    synchronizeMedia();
    const authority = currentMediaAuthority(), selectedMode = modeRef.current;
    const ownerId = stateRef.current.currentUserId;
    try {
      if (!ownerId || !["channel", "squad", "directMessage", "community"].includes(target.kind) || !safeMediaId(target.id)) throw new Error("Choose a conversation before adding an image.");
      const bytes = await imageUploadBytes(input, selectedMode === "demo");
      synchronizeMedia();
      if (authority !== currentMediaAuthority()) throw new MediaScopeChanged();
      const base64 = encodeImageBase64(bytes);
      if (selectedMode === "demo") {
        const current = stateRef.current, entries = current.previewImages ?? {};
        if (Object.keys(entries).length >= 64 || Object.values(entries).reduce((total, entry) => total + entry.image.size, 0) + bytes.length > 2 * 1024 * 1024) throw new Error("Preview images are limited to 2 MB in total. Remove an unused image or delete a sample image post to make room.");
        const image: ImageAttachment = { id: `preview-${requestId()}`, mimeType: "image/webp", width: input.width!, height: input.height!, size: bytes.length };
        const next = { ...current, previewImages: { ...entries, [image.id]: { image, dataUrl: `data:image/webp;base64,${base64}`, target: { ...target }, ownerId, createdAt: new Date().toISOString() } } };
        stateRef.current = next; setState(next);
        return image;
      }
      const action = liveActions.current.uploadImage;
      if (!action) throw new Error("Sign in before adding an image.");
      const payload = { target, contentType: input.contentType, base64, requestId: requestId() };
      let value: unknown;
      try { value = await action(payload); }
      catch (error) {
        synchronizeMedia();
        if (authority !== currentMediaAuthority()) throw new MediaScopeChanged();
        if (!["functions/unavailable", "functions/deadline-exceeded"].includes((error as { code?: string }).code ?? "")) throw error;
        value = await action(payload);
      }
      synchronizeMedia();
      if (authority !== currentMediaAuthority()) throw new MediaScopeChanged();
      return imageMetadata((value as { image?: unknown })?.image);
    } catch (error) {
      if (!(error instanceof MediaScopeChanged)) setError(readableError(error));
      throw error;
    }
  }, [synchronizeMedia, currentMediaAuthority]);
  const getImage = useCallback(async (id: string, reportId?: string): Promise<ImageDataResult> => {
    synchronizeMedia();
    if (modeRef.current === "demo") {
      const current = stateRef.current, entry = current.previewImages?.[id];
      if (reportId || !entry || !canReadPreviewImage(current, entry)) throw new Error("This image is no longer available in this conversation.");
      return imageCache.current.get(id, undefined, async () => ({ image: entry.image, base64: entry.dataUrl.slice("data:image/webp;base64,".length) }));
    }
    const action = liveActions.current.getImage;
    if (!action) throw new Error("Sign in to view this image.");
    return imageCache.current.get(id, reportId, async () => {
      const value = await action(id, reportId);
      synchronizeMedia();
      return value;
    });
  }, [synchronizeMedia]);
  const discardImage = useCallback((id: string) => {
    if (modeRef.current !== "demo") return;
    const current = stateRef.current, entry = current.previewImages?.[id];
    if (!entry || entry.ownerId !== current.currentUserId || entry.linkedTo) return;
    const entries = { ...current.previewImages }; delete entries[id];
    const next = { ...current, previewImages: entries };
    stateRef.current = next; setState(next);
    imageCache.current.clear(); setMediaRevision(value => value + 1);
  }, []);
  const registeredPushToken = useRef<{
    token: string;
    platform: "ios" | "android" | "web";
    userId: string;
  } | null>(null);
  const loadMore = useCallback(
    (collection: "posts" | "events") => catalogLoaders.current[collection]?.(),
    [],
  );
  useEffect(() => { synchronizeMedia(); }, [state, role, mode, synchronizeMedia]);
  useEffect(() => {
    if (mode === "demo") { setPostStatus(localDocumentStatus(postRef.current, "post")); setEventStatus(localDocumentStatus(eventRef.current, "event")); }
  }, [mode, ready, state.posts, state.events]);
  useEffect(() => {
    if (mode !== "demo") return;
    const results = deriveDirectCatalog(state);
    setDirectCatalog({ results, loading: !ready, hasMore: false, progress: ready ? { complete: true, processed: state.directMessages.filter(message => [message.fromId, message.toId].includes(state.currentUserId)).length, cursor: null, updatedAt: new Date().toISOString() } : null, syncing: false, error: null });
  }, [mode, ready, state.directMessages, state.profiles, state.connections, state.preferences.blockedIds]);
  useEffect(() => {
    if (mode === "demo") setDirectory({ results: state.profiles.filter(profile => matchesDirectory(profile, directoryQuery)), loading: false, hasMore: false });
  }, [mode, state.profiles, directoryQuery]);
  useEffect(() => {
    let active = true;
    transportGeneration.current++;
    liveActions.current = {};
    catalogLoaders.current = {};
    previewReady.current = false;
    setStartupError(null);
    setAccountEmail(null);
    readyRef.current = false;
    setReady(false);
    setHistory({ loading: false, hasMore: false });
    setSquadHistory({ loading: false, hasMore: false });
    setDirectHistory({ loading: false, hasMore: false });
    setPostStatus({ id: postRef.current, loading: Boolean(postRef.current), notFound: false, error: null });
    setEventStatus({ id: eventRef.current, loading: Boolean(eventRef.current), notFound: false, error: null });
    setDirectCatalog(emptyDirectCatalog());
    if (mode === "demo") {
      setState(initialState());
      storageRef.current
        ?.load()
        .then((saved) => {
          if (active && saved) setState(restorePreview(saved));
        })
        .catch(() => {
          if (active) setError(
            "Your saved preview could not be loaded. A fresh sample is ready.",
          );
        })
        .finally(() => {
          if (active) { previewReady.current = true; setReady(true); }
        });
      if (!storageRef.current) { previewReady.current = true; setReady(true); }
      return () => {
        active = false;
        transportGeneration.current++;
        previewReady.current = false;
        imageCache.current.clear();
      };
    }
    let dispose: (() => void)[] = [];
    let generation = 0;
    let off = () => {};
    let observedAuth = false;
    let sessionStartup: StartupGate | undefined;
    const publishStartup = (status: { ready: boolean; error: string | null }) => {
      readyRef.current = status.ready;
      setReady(status.ready);
      setStartupError(status.error);
    };
    const abortStartup = (message: string) => {
      dispose.forEach(fn => fn());
      dispose = [];
      liveActions.current = {};
      catalogLoaders.current = {};
      imageCache.current.clear(); setMediaRevision(value => value + 1);
      setRole("member");
      setHasMore({ posts: false, events: false });
      setHistory({ loading: false, hasMore: false });
      setSquadHistory({ loading: false, hasMore: false });
      setDirectHistory({ loading: false, hasMore: false });
      setDirectory({ results: [], loading: false, hasMore: false });
      setDirectCatalog(emptyDirectCatalog());
      setPostStatus({ id: postRef.current, loading: false, notFound: false, error: postRef.current ? message : null });
      setEventStatus({ id: eventRef.current, loading: false, notFound: false, error: eventRef.current ? message : null });
      const empty = emptyState(cloud?.auth.currentUser?.uid ?? "");
      stateRef.current = empty;
      setState(empty);
    };
    const runtimeStartup = new StartupGate({ pending: ["runtime"], current: () => active && modeRef.current === "live", publish: publishStartup, describeError: readableError, abort: abortStartup });
    const cleanup = () => {
      if (!active) return;
      active = false;
      transportGeneration.current++;
      previewReady.current = false;
      imageCache.current.clear();
      generation++;
      runtimeStartup.stop();
      sessionStartup?.stop();
      off();
      dispose.forEach(fn => fn());
      dispose = [];
      liveActions.current = {};
      catalogLoaders.current = {};
      if (startupCleanup.current === cleanup) startupCleanup.current = null;
    };
    startupCleanup.current = cleanup;
    void (async () => {
      const resolved = await resolveLiveRuntime({ load: loadFirebaseRuntime, prepare: () => cloud ? undefined : authPersistence ?? authPersistenceFactory?.(), current: () => runtimeStartup.current });
      if (!resolved) return;
      const sdk = resolved.runtime, c = sdk.setup(firebaseConfig!, useEmulators, resolved.prepared, emulators);
      cloud = c;
      const { onAuthStateChanged, httpsCallable, collection, doc, onSnapshot, query, where, limit, orderBy, documentId, getDocs, directoryPageQuery, messagePageQuery, squadMessagePageQuery, squadMembershipQuery, squadParticipantInvitesQuery, squadIncomingInvitesQuery, squadOwnerInvitesQuery, directMessagePageQuery, directCatalogPageQuery } = sdk;
      off = onAuthStateChanged(c.auth, async (user) => {
      if (!active || (c.auth.currentUser?.uid ?? null) !== (user?.uid ?? null)) return;
      if (!observedAuth && !runtimeStartup.current && user) return;
      observedAuth = true;
      const turn = ++generation;
      setAccountEmail(user?.email ?? null);
      runtimeStartup.stop();
      sessionStartup?.stop();
      setStartupError(null);
      setError(null);
      imageCache.current.clear(); setMediaRevision(value => value + 1);
      dispose.forEach((fn) => fn());
      dispose = [];
      catalogLoaders.current = {};
      liveActions.current = {};
      setHasMore({ posts: false, events: false });
      setHistory({ loading: false, hasMore: false });
      setSquadHistory({ loading: false, hasMore: false });
      setDirectHistory({ loading: false, hasMore: false });
      setPostStatus({ id: postRef.current, loading: Boolean(user && postRef.current), notFound: false, error: !user && postRef.current ? "Sign in to open this post." : null });
      setEventStatus({ id: eventRef.current, loading: Boolean(user && eventRef.current), notFound: false, error: !user && eventRef.current ? "Sign in to open this event." : null });
      setDirectCatalog(emptyDirectCatalog());
      setDirectory({ results: [], loading: false, hasMore: false });
      setRole("member");
      setEmailVerified(user?.emailVerified ?? false);
      setState(emptyState(user?.uid ?? ""));
      if (!user) {
        readyRef.current = true;
        setReady(true);
        return;
      }
      readyRef.current = false;
      setReady(false);
      const startup = new StartupGate({
        pending: ["bootstrap", "preferences", "owner", "publicProfiles", "conferences", "communities", "posts", "eventsUpcoming", "eventsPast", "connections", "follows", "directMessages", "directCatalog", "notifications", "publicChannels", "privateChannels", "reports", "squads", "squadInvites", "squadIncomingInvites"],
        required: ["bootstrap", "owner", "preferences"],
        current: () => active && turn === generation && c.auth.currentUser?.uid === user.uid,
        publish: publishStartup,
        describeError: readableError,
        optionalError: e => setError(readableError(e)),
        abort: abortStartup,
      });
      sessionStartup = startup;
      try {
        await httpsCallable(
          c.functions,
          "bootstrap",
        )({ name: user.displayName ?? "" });
        if (!startup.current) return;
        startup.loaded("bootstrap");
        const current = () => startup.current;
        const loaded = (key: string) => startup.loaded(key);
        const failure = (e: unknown, key?: string) => {
          if (!current()) return;
          if (key) startup.fail(e, key);
          else setError(readableError(e));
        };
        liveActions.current.uploadImage = async payload => {
          if (!current()) throw new MediaScopeChanged();
          const value = (await httpsCallable(c.functions, "uploadMedia", { timeout: 90000 })(payload)).data;
          if (!current()) throw new MediaScopeChanged();
          return value;
        };
        liveActions.current.getImage = async (mediaId, reportId) => {
          if (!current()) throw new MediaScopeChanged();
          const value = (await httpsCallable(c.functions, "getMedia")({ mediaId, ...(reportId ? { reportId } : {}) })).data;
          if (!current()) throw new MediaScopeChanged();
          return value;
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
        let refreshDirectSubscriptions = () => {};
        let refreshDirectSummary = (_peerId: string | null) => {};
        let refreshDirectCatalog = () => {};
        let publishDirectCatalog = () => {};
        let maybeBootstrapDirectCatalog = () => {};
        let directCatalogProgress: DirectCatalogProgress | null = null;
        const directWatermarks = new Map<string, DirectWatermark>();
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
          revokePrivateProfiles([peerProfiles, targetedProfiles], wanted, revokedProfileIds);
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
            { includeMetadataChanges: true },
            (snap) => {
              startup.receive("owner", snap.metadata.fromCache, () => {
                if (!snap.exists()) throw new Error("Your profile could not be loaded. Try again or sign out.");
                ownProfile = startupProfile(snap.data(), snap.id);
                publishProfiles();
              });
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
            { includeMetadataChanges: true },
            (snap) => {
              startup.receive("preferences", snap.metadata.fromCache, () => {
                if (!snap.exists()) throw new Error("Your account settings could not be loaded. Try again or sign out.");
                const data = snap.data();
                const preferences = startupPreferences(data);
                const nextRole: LoopRole =
                  data.role === "moderator" || data.role === "admin"
                    ? data.role
                    : "member";
                if (nextRole !== roleRef.current || JSON.stringify(blockedIds) !== JSON.stringify(preferences.blockedIds)) { imageCache.current.clear(); setMediaRevision(value => value + 1); }
                setRole(nextRole);
                watchReports(nextRole);
                blockedIds = preferences.blockedIds;
                subscriptions = preferences.subscriptions;
                savedPostIds = preferences.savedPostIds;
                directCatalogProgress = newerDirectCatalogProgress(directCatalogProgress, parseDirectCatalogProgress(data.directCatalog));
                savedPosts.forEach((_, id) => { if (!savedPostIds.includes(id)) savedPosts.delete(id); });
                setState((s) => ({ ...s, preferences }));
                refreshPeers();
                refreshMessageSubscriptions();
                refreshDirectSubscriptions();
                refreshDirectCatalog();
                publishDirectCatalog();
                maybeBootstrapDirectCatalog();
                publishPosts();
              });
            },
            (e) => {
              failure(e, "preferences");
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
        let directPreviewRows: DirectSnapshot[] = [], directRows: DirectSnapshot[] = [];
        let directWindow: MessagePages<DirectSnapshot> | undefined, offDirectPreview: (() => void) | undefined;
        let directGeneration = 0, directPreviewGeneration = 0, directBlockScope = JSON.stringify([...blockedIds].sort());
        const publishDirectMessages = () => {
          if (!current()) return;
          const messages = normalizeDirectRead(mergeDirectMessages([directPreviewRows, directRows], user.uid, new Set(blockedIds)), directWatermarks);
          setState(s => ({ ...s, directMessages: messages }));
        };
        const stopDirectWindow = () => {
          directGeneration++;
          directWindow?.stop();
          directWindow = undefined;
          directRows = [];
          setDirectHistory({ loading: false, hasMore: false });
        };
        liveActions.current.watchDirectConversation = peerId => {
          if (!current()) return;
          stopDirectWindow();
          refreshDirectSummary(peerId);
          publishDirectMessages();
          if (!peerId || blockedIds.includes(peerId)) return;
          try { directConversationId(user.uid, peerId); }
          catch (error) { failure(error); return; }
          const requestGeneration = directGeneration;
          directWindow = new MessagePages<DirectSnapshot>({
            subscribe: (cursor, success, error) => onSnapshot(directMessagePageQuery(c.db, user.uid, peerId, cursor), snap => success(snap.docs.map(record => ({ ...record.data(), id: record.id }) as DirectSnapshot)), error),
            publish: (rows, history) => {
              if (!current() || requestGeneration !== directGeneration || blockedIds.includes(peerId)) return;
              directRows = rows.filter(message => isDirectConversation(message, user.uid, peerId));
              setDirectHistory(history);
              publishDirectMessages();
            },
            failure: error => {
              if (!current() || requestGeneration !== directGeneration) return;
              if ((error as { code?: string }).code === "permission-denied") {
                stopDirectWindow();
                directPreviewRows = [];
                directPreviewGeneration++;
                offDirectPreview?.(); offDirectPreview = undefined;
                loaded("directMessages");
                imageCache.current.clear(); setMediaRevision(value => value + 1);
              }
              publishDirectMessages();
              failure(error);
            },
          });
          directWindow.start();
        };
        liveActions.current.loadOlderDirectMessages = () => current() ? directWindow?.loadMore() ?? Promise.resolve() : Promise.resolve();
        const subscribeDirectPreviews = () => {
          offDirectPreview?.();
          const requestGeneration = ++directPreviewGeneration;
          offDirectPreview = onSnapshot(query(collection(c.db, "directMessages"), where("participantIds", "array-contains", user.uid), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), limit(200)), snap => {
            if (!current() || requestGeneration !== directPreviewGeneration) return;
            directPreviewRows = mergeDirectMessages([snap.docs.map(record => ({ ...record.data(), id: record.id }) as DirectSnapshot)], user.uid, new Set(blockedIds));
            publishDirectMessages();
            loaded("directMessages");
          }, error => {
            if (!current() || requestGeneration !== directPreviewGeneration) return;
            directPreviewRows = [];
            offDirectPreview = undefined;
            if ((error as { code?: string }).code === "permission-denied") stopDirectWindow();
            publishDirectMessages();
            failure(error, "directMessages");
          });
        };
        refreshDirectSubscriptions = () => {
          if (!current()) return;
          const scope = JSON.stringify([...blockedIds].sort());
          if (scope !== directBlockScope) {
            directBlockScope = scope;
            directPreviewRows = mergeDirectMessages([directPreviewRows], user.uid, new Set(blockedIds));
            const selected = directRef.current;
            if (selected && (blockedIds.includes(selected) || !directWindow)) liveActions.current.watchDirectConversation?.(selected);
            subscribeDirectPreviews();
          } else if (!offDirectPreview) subscribeDirectPreviews();
          publishDirectMessages();
        };
        subscribeDirectPreviews();
        liveActions.current.watchDirectConversation(directRef.current);
        dispose.push(() => {
          directPreviewGeneration++;
          offDirectPreview?.(); offDirectPreview = undefined;
          directGeneration++;
          directWindow?.stop(); directWindow = undefined;
          directPreviewRows = []; directRows = [];
        });

        let catalogRows: DirectConversation[] = [], activeSummary: DirectConversation | undefined;
        let catalogHistory = { loading: false, hasMore: false }, catalogQueryError: string | null = null, catalogSyncError: string | null = null;
        let catalogSyncing = false, catalogSyncPromise: Promise<void> | undefined, catalogAutoTried = false;
        let summaryScopeId: string | null = null, catalogBlockScope = JSON.stringify([...blockedIds].sort()), catalogProgressVersion = "";
        const visibleConversation = (conversation: DirectConversation) => conversation.participantIds.includes(user.uid) && conversation.participantIds.every(id => !blockedIds.includes(id));
        const rememberWatermark = (conversation: DirectConversation) => directWatermarks.set(conversation.id, mergeDirectWatermark(conversation, directWatermarks.get(conversation.id)));
        publishDirectCatalog = () => {
          if (!current()) return;
          const rows = new Map(catalogRows.filter(visibleConversation).map(conversation => [conversation.id, conversation]));
          // The point listener supplies off-page peers; it must not replace a
          // catalog row with an older cached preview from its own first snapshot.
          if (activeSummary && visibleConversation(activeSummary) && !rows.has(activeSummary.id)) rows.set(activeSummary.id, activeSummary);
          const results = [...rows.values()].map(conversation => normalizeDirectConversation(conversation, directWatermarks.get(conversation.id))).sort((a, b) => b.lastAt.localeCompare(a.lastAt) || b.id.localeCompare(a.id));
          setDirectCatalog({ results, ...catalogHistory, progress: directCatalogProgress, syncing: catalogSyncing, error: catalogQueryError ?? catalogSyncError });
          setState(s => ({ ...s, directConversations: results }));
          publishDirectMessages();
        };
        const summaryWatch = new DocumentWatch<DirectConversation>({
          current,
          subscribe: (id, success, error) => onSnapshot(doc(c.db, "directConversations", id), { includeMetadataChanges: true }, snap => {
            const conversation = snap.exists() ? parseDirectConversation(snap.data(), snap.id, user.uid) : undefined;
            if (snap.exists() && !conversation) { error(new Error("This conversation summary is unavailable.")); return; }
            success(conversation, snap.metadata.fromCache);
          }, error),
          publish: update => {
            if (!current()) return;
            activeSummary = update.record && visibleConversation(update.record) ? update.record : undefined;
            if (activeSummary) rememberWatermark(activeSummary);
            // A missing legacy summary may be permission-denied; no private record
            // or professional profile is fetched to manufacture a replacement.
            if ((update.status.error || update.status.notFound) && update.status.id) directWatermarks.delete(update.status.id);
            publishDirectCatalog();
          },
        });
        refreshDirectSummary = peerId => {
          if (!current()) return;
          let id: string | null = null;
          if (peerId && !blockedIds.includes(peerId)) try { id = directConversationId(user.uid, peerId); } catch {}
          if (summaryScopeId !== id) { summaryScopeId = id; activeSummary = undefined; }
          summaryWatch.watch(id);
          publishDirectCatalog();
        };
        const catalogWindow = new MessagePages<DirectConversation>({
          pageSize: 50, sortAt: conversation => conversation.lastAt, filter: visibleConversation,
          subscribe: (cursor, success, error) => onSnapshot(directCatalogPageQuery(c.db, user.uid, cursor), snap => {
            if (!current()) return;
            const rows = snap.docs.map(record => parseDirectConversation(record.data(), record.id, user.uid));
            if (rows.some(conversation => !conversation)) { error(new Error("Some conversation summaries could not be loaded. Try again.")); loaded("directCatalog"); return; }
            catalogQueryError = null;
            success(rows as DirectConversation[]);
            loaded("directCatalog");
          }, error),
          publish: (rows, history) => {
            if (!current()) return;
            catalogRows = rows; catalogHistory = history;
            rows.filter(visibleConversation).forEach(rememberWatermark);
            publishDirectCatalog();
          },
          failure: error => {
            if (!current()) return;
            catalogQueryError = readableError(error);
            if ((error as { code?: string }).code === "permission-denied") { catalogRows = []; activeSummary = undefined; directWatermarks.clear(); summaryWatch.stop(); catalogWindow.stop(); }
            publishDirectCatalog(); loaded("directCatalog");
          },
        });
        liveActions.current.loadMoreDirectConversations = () => {
          if (!current()) return;
          if (catalogQueryError) { catalogQueryError = null; catalogWindow.restart(); }
          else if (catalogSyncError) void liveActions.current.syncDirectConversations?.().catch(() => {});
          else void catalogWindow.loadMore().catch(() => {});
        };
        liveActions.current.syncDirectConversations = () => {
          if (!current()) return Promise.reject(new MediaScopeChanged());
          if (catalogSyncPromise) return catalogSyncPromise;
          catalogSyncing = true; catalogSyncError = null; publishDirectCatalog();
          const request = Promise.resolve().then(async () => {
            try {
              if (!current()) throw new MediaScopeChanged();
              const value = (await httpsCallable(c.functions, "syncDirectConversations")({})).data;
              if (!current()) throw new MediaScopeChanged();
              const progress = parseDirectCatalogProgress(value);
              if (!progress) throw new Error("Conversation discovery returned invalid progress. Try again.");
              directCatalogProgress = newerDirectCatalogProgress(directCatalogProgress, progress);
              refreshDirectSummary(directRef.current);
              if (catalogQueryError) { catalogQueryError = null; catalogWindow.restart(); }
            } catch (error) {
              if (current()) catalogSyncError = (error as { code?: string }).code === "functions/aborted" ? "Another conversation refresh is running. Try again in a moment." : readableError(error);
              throw error;
            } finally {
              if (current()) { catalogSyncing = false; publishDirectCatalog(); }
              catalogSyncPromise = undefined;
            }
          });
          catalogSyncPromise = request; return request;
        };
        maybeBootstrapDirectCatalog = () => {
          if (!current() || catalogAutoTried || directCatalogProgress) return;
          catalogAutoTried = true;
          void liveActions.current.syncDirectConversations?.().catch(() => {});
        };
        refreshDirectCatalog = () => {
          if (!current()) return;
          const progressVersion = JSON.stringify(directCatalogProgress);
          if (progressVersion !== catalogProgressVersion) { catalogProgressVersion = progressVersion; if (directCatalogProgress) catalogSyncError = null; }
          const scope = JSON.stringify([...blockedIds].sort());
          if (scope !== catalogBlockScope) {
            catalogBlockScope = scope;
            directWatermarks.forEach((value, id) => { if (value.participantIds.some(peer => blockedIds.includes(peer))) directWatermarks.delete(id); });
            catalogWindow.restart();
          }
          refreshDirectSummary(directRef.current);
        };
        catalogWindow.start();
        refreshDirectSummary(directRef.current);
        dispose.push(() => { catalogWindow.stop(); summaryWatch.stop(); catalogRows = []; activeSummary = undefined; directWatermarks.clear(); });
        listen(
          "notifications",
          query(
            collection(c.db, "notifications"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(100),
          ),
        );

        let memberSquads: Squad[] = [], activeSquad: Squad | undefined;
        let participantInvites: SquadInvite[] = [], incomingInvites: SquadInvite[] = [], ownerInvites: SquadInvite[] = [];
        let squadRows: SquadMessage[] = [], squadGeneration = 0;
        let offSquad: (() => void) | undefined, offOwnerInvites: (() => void) | undefined;
        let ownerInviteScope: string | undefined, squadWindow: MessagePages<SquadMessage> | undefined;
        const revokedSquadIds = new Set<string>();
        const squadMember = (squad: Squad) => !squad.archived && squad.memberIds.includes(user.uid);
        const accessibleSquads = () => {
          const squads = new Map(memberSquads.filter(squad => squadMember(squad) && !revokedSquadIds.has(squad.id)).map(squad => [squad.id, squad]));
          if (activeSquad && squadMember(activeSquad) && !revokedSquadIds.has(activeSquad.id)) squads.set(activeSquad.id, activeSquad);
          return [...squads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
        };
        const publishSquads = () => {
          if (!current()) return;
          const squads = accessibleSquads();
          const ownerScope = activeSquad?.ownerId === user.uid && squadMember(activeSquad) && !revokedSquadIds.has(activeSquad.id) ? activeSquad.id : undefined;
          const invites = mergeSquadInvites([participantInvites, incomingInvites, ownerInvites], user.uid, ownerScope);
          setState(s => ({ ...s, squads, squadInvites: invites, squadMessages: visibleSquadMessages(squadRows, squads, user.uid) }));
        };
        const stopOwnerInvites = () => {
          offOwnerInvites?.();
          offOwnerInvites = undefined;
          ownerInviteScope = undefined;
          ownerInvites = [];
        };
        const watchOwnerInvites = () => {
          const id = activeSquad?.ownerId === user.uid && squadMember(activeSquad) ? activeSquad.id : undefined;
          if (id === ownerInviteScope) return;
          stopOwnerInvites();
          if (!id) return;
          ownerInviteScope = id;
          const requestGeneration = squadGeneration;
          offOwnerInvites = onSnapshot(squadOwnerInvitesQuery(c.db, id), snap => {
            if (!current() || requestGeneration !== squadGeneration || ownerInviteScope !== id || activeSquad?.ownerId !== user.uid) return;
            ownerInvites = snap.docs.map(record => ({ ...record.data(), id: record.id }) as SquadInvite);
            publishSquads();
          }, error => {
            if (!current() || requestGeneration !== squadGeneration || ownerInviteScope !== id) return;
            stopOwnerInvites();
            publishSquads();
            if ((error as { code?: string }).code !== "permission-denied") failure(error);
          });
        };
        liveActions.current.watchSquad = id => {
          if (!current()) return;
          const requestGeneration = ++squadGeneration;
          offSquad?.();
          offSquad = undefined;
          squadWindow?.stop();
          squadWindow = undefined;
          squadRows = [];
          activeSquad = undefined;
          stopOwnerInvites();
          setSquadHistory({ loading: false, hasMore: false });
          publishSquads();
          if (!id || id.includes("/")) return;
          setSquadHistory({ loading: true, hasMore: false });
          offSquad = onSnapshot(doc(c.db, "squads", id), snap => {
            if (!current() || requestGeneration !== squadGeneration) return;
            const squad = snap.exists() ? { ...snap.data(), id: snap.id } as Squad : undefined;
            if (!squad || !squadMember(squad)) {
              revokedSquadIds.add(id);
              activeSquad = undefined;
              squadWindow?.stop();
              squadWindow = undefined;
              squadRows = [];
              stopOwnerInvites();
              setSquadHistory({ loading: false, hasMore: false });
            } else {
              revokedSquadIds.delete(id);
              activeSquad = squad;
              watchOwnerInvites();
              if (!squadWindow) {
                squadWindow = new MessagePages<SquadMessage>({
                  subscribe: (cursor, success, failure) => onSnapshot(squadMessagePageQuery(c.db, id, user.uid, cursor), page => success(page.docs.map(record => ({ ...record.data(), id: record.id }) as SquadMessage)), failure),
                  publish: (rows, history) => {
                    if (!current() || requestGeneration !== squadGeneration) return;
                    squadRows = rows;
                    setSquadHistory(history);
                    publishSquads();
                  },
                  failure: error => {
                    if (!current() || requestGeneration !== squadGeneration) return;
                    if ((error as { code?: string }).code === "permission-denied") {
                      revokedSquadIds.add(id);
                      activeSquad = undefined;
                      squadWindow?.stop();
                      squadWindow = undefined;
                      squadRows = [];
                      stopOwnerInvites();
                      publishSquads();
                    } else failure(error);
                  },
                });
                squadWindow.start();
              }
            }
            publishSquads();
          }, error => {
            if (!current() || requestGeneration !== squadGeneration) return;
            revokedSquadIds.add(id);
            activeSquad = undefined;
            squadWindow?.stop();
            squadWindow = undefined;
            squadRows = [];
            stopOwnerInvites();
            setSquadHistory({ loading: false, hasMore: false });
            publishSquads();
            if ((error as { code?: string }).code !== "permission-denied") failure(error);
          });
        };
        liveActions.current.loadOlderSquadMessages = () => current() ? squadWindow?.loadMore() ?? Promise.resolve() : Promise.resolve();
        dispose.push(onSnapshot(squadMembershipQuery(c.db, user.uid), snap => {
          if (!current()) return;
          const previousIds = new Set(memberSquads.map(squad => squad.id));
          memberSquads = snap.docs.map(record => ({ ...record.data(), id: record.id }) as Squad).filter(squadMember);
          memberSquads.forEach(squad => { previousIds.delete(squad.id); revokedSquadIds.delete(squad.id); });
          previousIds.forEach(id => revokedSquadIds.add(id));
          if (previousIds.size) { imageCache.current.clear(); setMediaRevision(value => value + 1); }
          const selected = squadRef.current;
          if (activeSquad) {
            const updated = memberSquads.find(squad => squad.id === activeSquad?.id);
            if (updated) { activeSquad = updated; watchOwnerInvites(); }
          }
          if (selected && (previousIds.has(selected) || (!activeSquad && memberSquads.some(squad => squad.id === selected)))) liveActions.current.watchSquad?.(selected);
          publishSquads();
          loaded("squads");
        }, error => {
          if (!current()) return;
          memberSquads = [];
          squadRows = [];
          activeSquad = undefined;
          squadWindow?.stop();
          stopOwnerInvites();
          publishSquads();
          failure(error, "squads");
        }));
        const watchInvites = (incoming: boolean) => onSnapshot(incoming ? squadIncomingInvitesQuery(c.db, user.uid) : squadParticipantInvitesQuery(c.db, user.uid), snap => {
          if (!current()) return;
          const invites = snap.docs.map(record => ({ ...record.data(), id: record.id }) as SquadInvite);
          if (incoming) incomingInvites = invites; else participantInvites = invites;
          publishSquads();
          loaded(incoming ? "squadIncomingInvites" : "squadInvites");
        }, error => {
          if (!current()) return;
          if (incoming) incomingInvites = []; else participantInvites = [];
          publishSquads();
          failure(error, incoming ? "squadIncomingInvites" : "squadInvites");
        });
        dispose.push(watchInvites(false), watchInvites(true), () => {
          squadGeneration++;
          offSquad?.();
          squadWindow?.stop();
          squadWindow = undefined;
          squadRows = [];
          activeSquad = undefined;
          stopOwnerInvites();
        });
        liveActions.current.watchSquad(squadRef.current);

        // Bounded expanding windows keep recent posts live. UI can explicitly request more history.
        let postLimit = 100,
          offPosts: (() => void) | undefined;
        let feedPosts: LoopState["posts"] = [];
        const savedPosts = new Map<string, LoopState["posts"][number]>();
        const postCache = new DocumentCache<LoopState["posts"][number]>();
        let savedReads: DocumentRead[] = [], postSubscriptionGeneration = 0;
        const publishPosts = () => {
          if (!current()) return;
          const posts = postCache.merge([[...savedPosts.values()], feedPosts]);
          setState(s => ({ ...s, posts: posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)) }));
        };
        const forgetPost = (id: string) => { savedPosts.delete(id); feedPosts = feedPosts.filter(post => post.id !== id); };
        const postWatch = new DocumentWatch<LoopState["posts"][number]>({
          current,
          subscribe: (id, success, error) => {
            if (!safeMediaId(id)) throw new Error("This shared post link is not valid.");
            return onSnapshot(doc(c.db, "posts", id), { includeMetadataChanges: true }, snap => success(snap.exists() ? { ...snap.data(), id: snap.id } as LoopState["posts"][number] : undefined, snap.metadata.fromCache), error);
          },
          describeError: readableError,
          publish: update => {
            if (!current()) return;
            const next = postCache.apply(update);
            setPostStatus(next.status);
            if (next.status.id && next.status.notFound && !next.fromCache) {
              forgetPost(next.status.id);
              imageCache.current.clear(); setMediaRevision(value => value + 1);
            } else if (next.record && !next.fromCache) {
              const record = next.record;
              if (savedPostIds.includes(record.id)) savedPosts.set(record.id, record);
              feedPosts = feedPosts.map(post => post.id === record.id ? record : post);
            }
            publishPosts();
          },
        });
        liveActions.current.watchPost = id => { if (current()) { postCache.select(id); postWatch.watch(id); } };
        liveActions.current.watchPost(postRef.current);
        let savedLoadGeneration = 0;
        liveActions.current.loadSavedPosts = async () => {
          const requestGeneration = ++savedLoadGeneration;
          const wanted = [...savedPostIds];
          savedReads.forEach(read => postCache.endRead(read));
          const batches = documentIdBatches(wanted), reads = batches.map(ids => postCache.beginRead(ids));
          savedReads = reads;
          try {
            const snapshots = await Promise.all(batches.map(ids => getDocs(query(collection(c.db, "posts"), where(documentId(), "in", ids)))));
            if (!current() || requestGeneration !== savedLoadGeneration) return;
            snapshots.forEach((snap, index) => {
              const records = snap.docs.map(record => ({ ...record.data(), id: record.id }) as LoopState["posts"][number]);
              postCache.mergeRead(savedPosts, reads[index], records, !snap.metadata.fromCache).forEach(forgetPost);
            });
            savedPosts.forEach((_, id) => { if (!savedPostIds.includes(id)) savedPosts.delete(id); });
            publishPosts();
          } catch (error) {
            if (current() && requestGeneration === savedLoadGeneration) failure(error);
            throw error;
          } finally {
            reads.forEach(read => postCache.endRead(read));
            if (savedReads === reads) savedReads = [];
          }
        };
        const subscribePosts = () => {
          offPosts?.();
          const requestGeneration = ++postSubscriptionGeneration;
          offPosts = onSnapshot(
            query(
              collection(c.db, "posts"),
              orderBy("createdAt", "desc"),
              limit(postLimit),
            ),
            (snap) => {
              if (current() && requestGeneration === postSubscriptionGeneration) {
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
            (e) => { if (requestGeneration === postSubscriptionGeneration) failure(e, "posts"); },
          );
        };
        subscribePosts();
        dispose.push(() => { postSubscriptionGeneration++; savedLoadGeneration++; offPosts?.(); postWatch.stop(); savedReads.forEach(read => postCache.endRead(read)); savedReads = []; postCache.clear(); savedPosts.clear(); feedPosts = []; });
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
        const eventCache = new DocumentCache<LoopState["events"][number]>();
        let eventSubscriptionGeneration = 0;
        let futureEvents: LoopState["events"] = [],
          pastEvents: LoopState["events"] = [],
          futureMore = false,
          pastMore = false;
        const publishEvents = () => {
          if (current()) {
            const events = eventCache.merge([pastEvents, futureEvents]);
            setState((s) => ({
              ...s,
              events: events.sort((a, b) =>
                a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
              ),
            }));
            setHasMore((value) => ({
              ...value,
              events: (futureMore || pastMore) && eventLimit < 1000,
            }));
          }
        };
        const eventWatch = new DocumentWatch<LoopState["events"][number]>({
          current,
          subscribe: (id, success, error) => {
            if (!safeMediaId(id)) throw new Error("This shared event link is not valid.");
            return onSnapshot(doc(c.db, "events", id), { includeMetadataChanges: true }, snap => success(snap.exists() ? { ...snap.data(), id: snap.id } as LoopState["events"][number] : undefined, snap.metadata.fromCache), error);
          },
          describeError: readableError,
          publish: update => {
            if (!current()) return;
            const next = eventCache.apply(update); setEventStatus(next.status);
            if (next.status.id && next.status.notFound && !next.fromCache) {
              futureEvents = futureEvents.filter(event => event.id !== next.status.id);
              pastEvents = pastEvents.filter(event => event.id !== next.status.id);
            } else if (next.record && !next.fromCache) {
              const record = next.record;
              const buckets = updateEventBuckets(futureEvents, pastEvents, record, eventBoundary);
              futureEvents = buckets.future; pastEvents = buckets.past;
            }
            publishEvents();
          },
        });
        liveActions.current.watchEvent = id => { if (current()) { eventCache.select(id); eventWatch.watch(id); } };
        liveActions.current.watchEvent(eventRef.current);
        const subscribeEvents = () => {
          offUpcoming?.();
          offPast?.();
          const requestGeneration = ++eventSubscriptionGeneration;
          offUpcoming = onSnapshot(
            query(
              collection(c.db, "events"),
              where("endAt", ">=", eventBoundary),
              orderBy("endAt", "asc"),
              limit(eventLimit),
            ),
            (snap) => {
              if (!current() || requestGeneration !== eventSubscriptionGeneration) return;
              futureEvents = snap.docs.map(
                (d) =>
                  ({ ...d.data(), id: d.id }) as LoopState["events"][number],
              );
              futureMore = snap.size === eventLimit;
              publishEvents();
              loaded("eventsUpcoming");
            },
            (e) => { if (requestGeneration === eventSubscriptionGeneration) failure(e, "eventsUpcoming"); },
          );
          offPast = onSnapshot(
            query(
              collection(c.db, "events"),
              where("endAt", "<", eventBoundary),
              orderBy("endAt", "desc"),
              limit(eventLimit),
            ),
            (snap) => {
              if (!current() || requestGeneration !== eventSubscriptionGeneration) return;
              pastEvents = snap.docs.map(
                (d) =>
                  ({ ...d.data(), id: d.id }) as LoopState["events"][number],
              );
              pastMore = snap.size === eventLimit;
              publishEvents();
              loaded("eventsPast");
            },
            (e) => { if (requestGeneration === eventSubscriptionGeneration) failure(e, "eventsPast"); },
          );
        };
        subscribeEvents();
        dispose.push(() => {
          eventSubscriptionGeneration++;
          offUpcoming?.();
          offPast?.();
          eventWatch.stop(); eventCache.clear(); futureEvents = []; pastEvents = [];
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
        let activeRows: Message[] = [], activeWindow: MessagePages<Message> | undefined;
        let activeChannel: LoopState["channels"][number] | undefined;
        let offActiveChannel: (() => void) | undefined;
        let conversationGeneration = 0;
        let roomHistory = { loading: false, hasMore: false };
        const accessible = (channel: LoopState["channels"][number]) => channel.visibility === "public" || Boolean(channel.memberIds?.includes(user.uid));
        const allChannels = () => {
          const channels = new Map([...publicChannels, ...privateChannels].filter(channel => accessible(channel) && !revokedChannelIds.has(channel.id)).map(channel => [channel.id, channel]));
          if (activeChannel && accessible(activeChannel) && !revokedChannelIds.has(activeChannel.id)) channels.set(activeChannel.id, activeChannel);
          return [...channels.values()];
        };
        const publishMessages = () => {
          if (!current()) return;
          const allowed = new Set(allChannels().map(channel => channel.id));
          const messages = mergeMessages([...previewBuckets.values(), activeRows], allowed);
          setState(s => ({ ...s, messages }));
          setHistory(roomHistory);
        };
        const stopActivePages = () => {
          conversationGeneration++;
          activeWindow?.stop();
          activeWindow = undefined;
          activeRows = [];
          roomHistory = { loading: false, hasMore: false };
        };
        const startActiveMessages = () => {
          const selected = conversationRef.current;
          if (!current() || !selected.channelId || !activeChannel || !accessible(activeChannel) || activeWindow) return;
          const requestGeneration = conversationGeneration, channelId = selected.channelId;
          activeWindow = new MessagePages<Message>({
            subscribe: (cursor, success, failure) => onSnapshot(messagePageQuery(c.db, channelId, selected.topic, cursor), page => success(page.docs.map(record => ({ ...record.data(), id: record.id }) as Message)), failure),
            publish: (rows, history) => {
              if (!current() || requestGeneration !== conversationGeneration) return;
              activeRows = rows;
              roomHistory = history;
              publishMessages();
            },
            failure: error => {
              if (!current() || requestGeneration !== conversationGeneration) return;
              if ((error as { code?: string }).code === "permission-denied") {
                revokedChannelIds.add(channelId);
                activeChannel = undefined;
                previewBuckets.delete(channelId);
                stopActivePages();
              }
              publishMessages();
              failure(error);
            },
          });
          activeWindow.start();
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
          if (!current()) return;
          offActiveChannel?.();
          offActiveChannel = undefined;
          stopActivePages();
          activeChannel = undefined;
          refreshMessageSubscriptions();
          if (!id || id.includes("/")) return;
          const requestGeneration = conversationGeneration;
          roomHistory = { loading: true, hasMore: false };
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
              startActiveMessages();
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
        liveActions.current.loadOlderMessages = () => current() ? activeWindow?.loadMore() ?? Promise.resolve() : Promise.resolve();
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
              if (previousIds.size) { imageCache.current.clear(); setMediaRevision(value => value + 1); }
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
        startup.fail(e);
      }
      });
    })().catch(e => {
      runtimeStartup.fail(e);
    });
    return cleanup;
  }, [mode, firebaseConfig?.projectId, useEmulators, authPersistence, authPersistenceFactory, emulators?.host, emulators?.authPort, emulators?.firestorePort, emulators?.functionsPort, startupAttempt]);
  useEffect(() => {
    let active = true;
    if (mode === "demo" && ready && previewReady.current)
      storageRef.current
        ?.save(state)
        .catch(() => {
          if (active) setError(
            "Your changes are available for this session, but could not be saved on this device.",
          );
        });
    return () => { active = false; };
  }, [state, ready, mode]);
  const dispatch = useCallback(
    async (command: Command) => {
      const actionGeneration = transportGeneration.current;
      setError(null);
      setPending((n) => n + 1);
      try {
        if (modeRef.current !== mode) throw new MediaScopeChanged();
        if (mode === "demo") {
          const next = applyCommand(stateRef.current, command, {
            now: new Date().toISOString(),
            id: requestId(),
          });
          stateRef.current = next;
          setState(next);
        } else {
          const { sdk, c } = await liveCloud();
          if (!c.auth.currentUser) throw new Error("Sign in to continue.");
          const actorId = c.auth.currentUser.uid;
          const execute = sdk.httpsCallable(c.functions, "executeCommand");
          if (command.type === "dm.read") {
            await drainDirectRead({
              send: async id => (await execute({ command, requestId: id })).data,
              requestId,
              current: () => modeRef.current === "live" && c.auth.currentUser?.uid === actorId && directRef.current === command.userId && !stateRef.current.preferences.blockedIds.includes(command.userId),
            });
          } else await execute({ command, requestId: requestId() });
        }
      } catch (e) {
        const m = readableError(e);
        if (actionGeneration === transportGeneration.current && modeRef.current === mode) setError(m);
        throw new Error(m);
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    },
    [mode, firebaseConfig?.projectId, useEmulators, authPersistence, authPersistenceFactory, emulators?.host, emulators?.authPort, emulators?.firestorePort, emulators?.functionsPort],
  );
  const authAction = async (fn: (auth: Auth, sdk: FirebaseRuntime, c: Cloud) => Promise<unknown>) => {
    const actionGeneration = transportGeneration.current;
    setError(null);
    try {
      if (mode === "demo")
        throw new Error(
          "Account sign-in is available in the connected live app. This preview uses fictional sample data.",
        );
      const { sdk, c } = await liveCloud();
      await fn(c.auth, sdk, c);
    } catch (e) {
      const m = readableError(e);
      if (actionGeneration === transportGeneration.current && modeRef.current === mode) setError(m);
      throw new Error(m);
    }
  };
  const refreshVerification = async () => {
    let verified = false;
    await authAction(async (auth, sdk, c) => {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in to refresh your verification.");
      await sdk.reload(user);
      await user.getIdToken(true);
      if (auth.currentUser?.uid !== user.uid || modeRef.current !== "live") throw new MediaScopeChanged();
      verified = user.emailVerified;
      setEmailVerified(verified);
      if (verified)
        await sdk.httpsCallable(
          c.functions,
          "executeCommand",
        )({ command: { type: "profile.update", profile: {} }, requestId: requestId() });
    });
    return verified;
  };
  const sendVerificationEmail = () =>
    authAction(async (auth, sdk) => {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in to verify your email.");
      if (user.emailVerified)
        throw new Error("Your email is already verified.");
      await sdk.sendEmailVerification(user);
    });
  const accountCall = async (name: string, payload: unknown) => {
    const actionGeneration = transportGeneration.current;
    setError(null);
    if (mode === "demo")
      throw new Error(
        "This account action is available in the connected live app.",
      );
    try {
      const { sdk, c } = await liveCloud();
      const actorId = c.auth.currentUser?.uid;
      const result = (
        await sdk.httpsCallable(
          c.functions,
          name,
        )(payload)
      ).data;
      if (actionGeneration !== transportGeneration.current || modeRef.current !== "live" || c.auth.currentUser?.uid !== actorId) throw new MediaScopeChanged();
      return result;
    } catch (e) {
      const message = readableError(e);
      if (actionGeneration === transportGeneration.current && modeRef.current === mode) setError(message);
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
        startupError,
        retryStartup,
        accountEmail: mode === "live" ? accountEmail : null,
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
        readChannelSearchPage,
        readPinnedMessages,
        watchReplyThread,
        readPrivateSearchPage,
        history,
        directory,
        setDirectoryQuery,
        loadMoreDirectory,
        loadSavedPosts,
        loadProfile,
        watchSquad,
        loadOlderSquadMessages,
        squadHistory,
        uploadImage,
        getImage,
        discardImage,
        mediaRevision,
        watchDirectConversation,
        loadOlderDirectMessages,
        directHistory,
        watchPost,
        watchEvent,
        postStatus,
        eventStatus,
        directCatalog,
        loadMoreDirectConversations,
        syncDirectConversations,
        clearError: () => setError(null),
        resetDemo: () => {
          setState(initialState());
          setError(null);
        },
        signIn: (email, password) =>
          authAction((auth, sdk) =>
            sdk.signInWithEmailAndPassword(auth, email, password),
          ),
        signUp: (email, password, name) =>
          authAction(async (auth, sdk, c) => {
            if (name.trim().length < 2) throw new Error("Enter your name.");
            const result = await sdk.createUserWithEmailAndPassword(
              auth,
              email,
              password,
            );
            await sdk.updateProfile(result.user, { displayName: name.trim() });
            const current = () => auth.currentUser?.uid === result.user.uid && modeRef.current === "live";
            if (!current()) throw new MediaScopeChanged();
            await sdk.httpsCallable(
              c.functions,
              "bootstrap",
            )({ name: name.trim() });
            if (!current()) throw new MediaScopeChanged();
            await sdk.httpsCallable(
              c.functions,
              "executeCommand",
            )({
              command: {
                type: "profile.update",
                profile: { name: name.trim() },
              },
              requestId: requestId(),
            });
            if (!current()) throw new MediaScopeChanged();
            await sdk.sendEmailVerification(result.user);
          }),
        signOut: () => authAction(async (auth, sdk, c) => {
          const actorId = auth.currentUser?.uid;
          const registered = registeredPushToken.current;
          if (registered && registered.userId === auth.currentUser?.uid) {
            // Logging out remains possible offline; the native client also retains a token for retry.
            await sdk.httpsCallable(
              c.functions,
              "registerPushToken",
              { timeout: 5000 },
            )({ token: registered.token, platform: registered.platform, remove: true }).catch(() => undefined);
          }
          if (auth.currentUser?.uid !== actorId || modeRef.current !== "live") throw new MediaScopeChanged();
          registeredPushToken.current = null;
          await sdk.firebaseSignOut(auth);
        }),
        resetPassword: (email) =>
          authAction((auth, sdk) => sdk.sendPasswordResetEmail(auth, email)),
        appealTrust: async (reason) => {
          await accountCall("appealTrust", { reason });
        },
        exportAccount,
        deleteAccount: async (confirmation) => {
          await accountCall("deleteAccount", { confirmation });
          await authAction((auth, sdk) => sdk.firebaseSignOut(auth));
        },
        registerPushToken: async (token, platform = "web", remove = false) => {
          const userId = mode === "live" ? cloud?.auth.currentUser?.uid : undefined;
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

export * from "./privateHistorySearch";
