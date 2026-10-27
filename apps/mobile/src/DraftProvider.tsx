import { PostDrafts, postDraftTarget, type PostDraft } from "./postDrafts";
import { DraftChanges } from "./draftChanges";
import { ImageDrafts } from "./imageDrafts";
import { removeCreatedImage } from "./mediaFiles";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useLoop } from "@theloop/client";
import type { LoopState } from "@theloop/core";
import {
  ConversationDrafts,
  type ConversationDraft,
  type DraftTarget,
} from "./conversationDrafts";

const DraftContext = createContext<{
  book: ConversationDrafts;
  images: ImageDrafts;
  posts: PostDrafts;
  changes: DraftChanges;
  state: () => LoopState;
} | null>(null);
export function DraftProvider({ children }: { children: React.ReactNode }) {
  const { state } = useLoop();
  const current = useRef(state);
  current.current = state;
  const changes = useMemo(() => new DraftChanges(), [state.currentUserId]);
  const book = useMemo(
    () => new ConversationDrafts(state.currentUserId, 50, changes.changed),
    [state.currentUserId, changes],
  );
  const images = useMemo(
    () =>
      new ImageDrafts(
        state.currentUserId,
        (choice) => {
          void removeCreatedImage(choice.uri);
        },
        10,
        10 * 1024 * 1024,
        changes.changed,
      ),
    [state.currentUserId, changes],
  );
  const posts = useMemo(
    () => new PostDrafts(state.currentUserId, changes.changed),
    [state.currentUserId, changes],
  );
  const context = useMemo(
    () => ({ book, images, posts, changes, state: () => current.current }),
    [book, images, posts, changes],
  );
  useEffect(() => {
    book.prune(state);
    images.prune(state);
  }, [book, images, state]);
  useEffect(
    () => () => {
      posts.clear();
      book.clear();
      images.clear();
    },
    [book, images, posts],
  );
  return (
    <DraftContext.Provider value={context}>
      <React.Fragment key={state.currentUserId}>{children}</React.Fragment>
    </DraftContext.Provider>
  );
}

export function useConversationDraft(target: DraftTarget) {
  const context = useContext(DraftContext);
  if (!context)
    throw new Error("Conversation drafts require the signed-in workspace.");
  const { book, images, state } = context;
  const initial = useMemo(() => {
    const text = book.read(target, state());
    if (text || target.kind !== "channel" || target.topic !== undefined)
      return text;
    const topic = images.latestTopic(target.id, state());
    return topic === undefined ? undefined : { body: "", topic };
  }, [book, images, target.kind, target.id, target.topic, state]);
  const remember = useCallback(
    (value: ConversationDraft) => book.remember(target, value, state()),
    [book, target.kind, target.id, target.topic, state],
  );
  const readTopic = useCallback(
    (topic: string) => book.read({ ...target, topic }, state()),
    [book, target.kind, target.id, state],
  );
  return { initial, remember, readTopic };
}

export function useImageDrafts() {
  const context = useContext(DraftContext);
  if (!context)
    throw new Error("Image drafts require the signed-in workspace.");
  return { book: context.images, state: context.state };
}

export function useSessionDrafts() {
  const context = useContext(DraftContext);
  if (!context) throw new Error("Drafts require the signed-in workspace.");
  useSyncExternalStore(
    context.changes.subscribe,
    context.changes.getSnapshot,
    context.changes.getSnapshot,
  );
  const state = context.state();
  const entries = new Map<
    string,
    { target: DraftTarget; body: string; hasReply: boolean; hasImage: boolean }
  >();
  const slot = (target: DraftTarget) =>
    JSON.stringify([target.kind, target.id, target.topic]);
  for (const { target, value } of context.book.list(state))
    entries.set(slot(target), {
      target,
      body: value.body,
      hasReply: !!value.reply,
      hasImage: false,
    });
  const post = context.posts.read(state.currentUserId);
  if (post)
    entries.set(slot(postDraftTarget), {
      target: postDraftTarget,
      body: [post.title, post.body].filter(Boolean).join("\n"),
      hasReply: false,
      hasImage: false,
    });
  for (const target of context.images.targets(state)) {
    const previous = entries.get(slot(target));
    entries.set(slot(target), {
      target,
      body: previous?.body || "",
      hasReply: previous?.hasReply || false,
      hasImage: true,
    });
  }
  return {
    entries: [...entries.values()],
    remove: (target: DraftTarget) => {
      if (target.kind === "post") context.posts.clear();
      context.book.remove(target);
      context.images.remove(target);
    },
  };
}

export function usePostDraft() {
  const context = useContext(DraftContext);
  if (!context) throw new Error("Post drafts require the signed-in workspace.");
  const { posts, state } = context;
  const initial = useMemo(
    () => posts.read(state().currentUserId),
    [posts, state],
  );
  const remember = useCallback(
    (value: PostDraft) => posts.remember(state().currentUserId, value),
    [posts, state],
  );
  const clear = useCallback(() => posts.clear(), [posts]);
  return { initial, remember, clear };
}
