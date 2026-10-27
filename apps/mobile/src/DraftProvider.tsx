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
  const context = useMemo(
    () => ({ book, state: () => current.current }),
    [book],
  );
  useEffect(() => book.prune(state), [book, state]);
  useEffect(() => () => book.clear(), [book]);
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
  const { book, state } = context;
  const initial = useMemo(
    () => book.read(target, state()),
    [book, target.kind, target.id, target.topic, state],
  );
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
