import { ImageDrafts } from "./imageDrafts";
import { removeCreatedImage } from "./mediaFiles";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  state: () => LoopState;
} | null>(null);
export function DraftProvider({ children }: { children: React.ReactNode }) {
  const { state } = useLoop();
  const current = useRef(state);
  current.current = state;
  const book = useMemo(
    () => new ConversationDrafts(state.currentUserId),
    [state.currentUserId],
  );
  const images = useMemo(
    () =>
      new ImageDrafts(state.currentUserId, (choice) => {
        void removeCreatedImage(choice.uri);
      }),
    [state.currentUserId],
  );
  const context = useMemo(
    () => ({ book, images, state: () => current.current }),
    [book, images],
  );
  useEffect(() => {
    book.prune(state);
    images.prune(state);
  }, [book, images, state]);
  useEffect(
    () => () => {
      book.clear();
      images.clear();
    },
    [book, images],
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
