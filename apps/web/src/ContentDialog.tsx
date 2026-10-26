import React from "react";
import { ArrowUpRight, Check, Flag, Pencil, Trash2 } from "lucide-react";
import { useLoop } from "@theloop/client";
import type { Command, Message, Post, Comment, Report } from "@theloop/core";
import { Field, ModalShell } from "./ui";
export type ContentTarget =
  | { kind: "post"; post: Post }
  | { kind: "comment"; postId: string; comment: Comment }
  | { kind: "message"; message: Message };
export type ContentMode = "menu" | "edit" | "delete";
type Props = {
  target: ContentTarget;
  mode: ContentMode;
  setMode: (mode: ContentMode) => void;
  close: () => void;
  run: (command: Command, success?: string) => Promise<boolean>;
  deleted: () => void;
  report: (target: {
    id: string;
    type: Report["targetType"];
    postId?: string;
  }) => void;
};
export function ContentDialog({
  target,
  mode,
  setMode,
  close,
  run,
  deleted,
  report,
}: Props) {
  const { state, pending } = useLoop();
  const item =
    target.kind === "post"
      ? target.post
      : target.kind === "comment"
        ? target.comment
        : target.message;
  const noun = target.kind === "comment" ? "reply" : target.kind;
  const mine = item.authorId === state.currentUserId;
  const reportTarget = {
    id: item.id,
    type: target.kind,
    ...(target.kind === "comment" ? { postId: target.postId } : {}),
  };
  if (mode === "menu")
    return (
      <ModalShell
        key={mode}
        title={mine ? "Make it a little more you." : "Keep this corner good."}
        subtitle={
          target.kind === "post"
            ? target.post.title
            : "Every conversation deserves a little care."
        }
        close={close}
      >
        <div className="modal-form content-actions">
          {mine && (
            <>
              <button className="action-row" onClick={() => setMode("edit")}>
                <Pencil size={18} />
                <span>
                  <strong>Edit {noun}</strong>
                  <small>A second thought. A clearer word.</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
              <button className="action-row" onClick={() => setMode("delete")}>
                <Trash2 size={18} />
                <span>
                  <strong>Delete {noun}</strong>
                  <small>Take this contribution out of the conversation.</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            </>
          )}
          {!mine && (
            <button className="action-row" onClick={() => report(reportTarget)}>
              <Flag size={18} />
              <span>
                <strong>Report {noun}</strong>
                <small>Share a concern privately with community care.</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </ModalShell>
    );
  if (!mine) return null;
  if (mode === "delete")
    return (
      <ModalShell
        key={mode}
        title={`Delete this ${noun}?`}
        subtitle={
          target.kind === "post"
            ? "This removes the post and its replies."
            : "This removes your contribution from the conversation."
        }
        close={close}
      >
        <form
          className="modal-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const command: Command =
              target.kind === "post"
                ? { type: "post.delete", postId: item.id }
                : target.kind === "comment"
                  ? {
                      type: "comment.delete",
                      postId: target.postId,
                      commentId: item.id,
                    }
                  : { type: "message.delete", messageId: item.id };
            if (
              await run(
                command,
                `${noun[0].toUpperCase() + noun.slice(1)} deleted.`,
              )
            )
              deleted();
          }}
        >
          <div className="callout">
            <p>{item.body}</p>
          </div>
          <footer>
            <button type="button" className="button subtle" onClick={close}>
              Keep it
            </button>
            <button className="button primary" disabled={pending > 0}>
              <Trash2 size={15} />
              Delete {noun}
            </button>
          </footer>
        </form>
      </ModalShell>
    );
  return (
    <ModalShell
      key={mode}
      title={`A little edit to your ${noun}.`}
      subtitle="Update your words, then bring them back to the conversation."
      close={close}
      wide={target.kind === "post"}
    >
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body = String(f.get("body"));
          const command: Command =
            target.kind === "post"
              ? {
                  type: "post.edit",
                  postId: target.post.id,
                  post: {
                    title: String(f.get("title")),
                    body,
                    tags: String(f.get("tags") ?? "")
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                    ...(f.has("url")
                      ? { url: String(f.get("url") ?? "") }
                      : {}),
                  },
                }
              : target.kind === "comment"
                ? {
                    type: "comment.edit",
                    postId: target.postId,
                    commentId: target.comment.id,
                    body,
                  }
                : { type: "message.edit", messageId: target.message.id, body };
          if (
            await run(
              command,
              `${noun[0].toUpperCase() + noun.slice(1)} updated.`,
            )
          )
            close();
        }}
      >
        {target.kind === "post" && (
          <Field label="The opening">
            <input
              name="title"
              required
              maxLength={180}
              defaultValue={target.post.title}
            />
          </Field>
        )}
        <Field
          label={
            target.kind === "post" ? "The rest of the story" : "Your words"
          }
        >
          <textarea
            name="body"
            required
            rows={5}
            maxLength={
              target.kind === "post"
                ? 10000
                : target.kind === "comment"
                  ? 2000
                  : 4000
            }
            defaultValue={item.body}
          />
        </Field>
        {target.kind === "post" && (
          <>
            <Field label="Tags, separated by commas">
              <input
                name="tags"
                defaultValue={target.post.tags.join(", ")}
                maxLength={220}
              />
            </Field>
            {(target.post.url || target.post.kind === "link") && (
              <Field label="Shared link">
                <input
                  name="url"
                  type="url"
                  required={target.post.kind === "link"}
                  defaultValue={target.post.url}
                />
              </Field>
            )}
          </>
        )}
        <footer>
          <button type="button" className="button subtle" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={pending > 0}>
            Save changes
            <Check size={15} />
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
