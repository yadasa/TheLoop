import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  Lock,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useLoop } from "@theloop/client";
import {
  connected,
  displayDate,
  type Command,
  type Report,
  type Squad,
  type SquadMessage,
} from "@theloop/core";
import { Empty, Field, ModalShell } from "./ui";
type Props = {
  selectedId: string;
  select: (id: string) => void;
  openProfile: (id: string) => void;
  run: (command: Command, success?: string) => Promise<boolean>;
  report: (target: { id: string; type: Report["targetType"] }) => void;
};
type Dialog =
  | { kind: "create" }
  | { kind: "manage" }
  | { kind: "invite" }
  | { kind: "leave" }
  | { kind: "remove" | "transfer"; userId: string }
  | { kind: "editMessage" | "deleteMessage"; message: SquadMessage }
  | null;
export default function Squads({
  selectedId,
  select,
  openProfile,
  run,
  report,
}: Props) {
  const {
    state: s,
    pending,
    watchSquad,
    loadOlderSquadMessages,
    squadHistory,
  } = useLoop();
  const [dialog, setDialog] = useState<Dialog>(null),
    [replyId, setReplyId] = useState(""),
    [away, setAway] = useState(false);
  const groups = s.squads
    .filter((g) => !g.archived && g.memberIds.includes(s.currentUserId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = groups.find((g) => g.id === selectedId),
    mine = active?.ownerId === s.currentUserId;
  const incoming = s.squadInvites.filter(
    (i) =>
      i.toId === s.currentUserId &&
      i.status === "pending" &&
      Date.parse(i.expiresAt) > Date.now() &&
      !s.preferences.blockedIds.includes(i.fromId),
  );
  const messages = useMemo(
    () =>
      s.squadMessages
        .filter(
          (m) =>
            m.squadId === active?.id &&
            m.audienceIds.includes(s.currentUserId) &&
            !s.preferences.blockedIds.includes(m.authorId),
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        ),
    [s.squadMessages, active?.id, s.currentUserId, s.preferences.blockedIds],
  );
  const list = useRef<HTMLDivElement>(null),
    pinned = useRef(true),
    anchor = useRef<{ height: number; top: number } | null>(null),
    previous = useRef("");
  useEffect(() => {
    watchSquad(selectedId || null);
    setReplyId("");
    setDialog(null);
    return () => watchSquad(null);
  }, [selectedId, watchSquad]);
  useEffect(() => {
    if (active) void run({ type: "squad.read", squadId: active.id });
  }, [active?.id, messages.at(-1)?.id]);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (previous.current !== active?.id) {
      previous.current = active?.id ?? "";
      anchor.current = null;
      pinned.current = true;
      setAway(false);
      el.scrollTop = el.scrollHeight;
    } else if (anchor.current) {
      el.scrollTop =
        el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
    } else if (pinned.current) el.scrollTop = el.scrollHeight;
  }, [active?.id, messages.length, messages.at(-1)?.id]);
  const older = async () => {
    if (squadHistory.loading) return;
    const el = list.current;
    if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    try {
      await loadOlderSquadMessages();
    } catch {
      anchor.current = null;
    }
  };
  const profile = (id: string) => s.profiles.find((p) => p.id === id);
  const name = (id: string) =>
    active?.memberProfiles[id]?.name ?? profile(id)?.name ?? "A connection";
  const invitations = active
    ? s.squadInvites.filter(
        (i) =>
          i.squadId === active.id &&
          i.status === "pending" &&
          Date.parse(i.expiresAt) > Date.now(),
      )
    : [];
  const invitees = active
    ? s.profiles.filter(
        (p) =>
          connected(s, p.id) &&
          !active.memberIds.includes(p.id) &&
          !active.pendingInviteeIds.includes(p.id) &&
          !s.preferences.blockedIds.includes(p.id),
      )
    : [];
  const close = () => setDialog(null);
  const bubbleName = (m: SquadMessage) =>
    profile(m.authorId)?.name ?? m.authorName;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE CLOSER</span>
          <h1>Your small circle.</h1>
          <p>
            Private squads for coffee crews, conference friends, and all the
            in-between.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => setDialog({ kind: "create" })}
        >
          <Plus size={17} />
          Start a squad
        </button>
      </div>
      <div className={`squads-layout ${active ? "has-active" : ""}`}>
        <aside className="squad-catalog">
          <div className="section-label">
            <span>YOUR SQUADS · {groups.length}</span>
            <Lock size={13} />
          </div>
          {groups.map((g) => (
            <button
              key={g.id}
              className={`squad-card ${active?.id === g.id ? "active" : ""}`}
              onClick={() => select(g.id)}
            >
              <span className="squad-symbol">
                {g.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{g.name}</strong>
                <small>
                  {g.memberIds.length}{" "}
                  {g.memberIds.length === 1 ? "person" : "people"}
                  {s.preferences.squadMutedIds?.includes(g.id)
                    ? " · muted"
                    : ""}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!groups.length && (
            <p className="squad-note">A small circle starts with one hello.</p>
          )}
          {!!incoming.length && (
            <div className="squad-invitations">
              <div className="section-label">
                <span>YOUR INVITATIONS</span>
                <UserPlus size={13} />
              </div>
              {incoming.map((i) => (
                <article key={i.id}>
                  <span className="eyebrow">
                    FROM {profile(i.fromId)?.name ?? "A CONNECTION"}
                  </span>
                  <h3>{i.squadName}</h3>
                  <p>
                    {i.description ||
                      "A private corner for a good conversation."}
                  </p>
                  <small>
                    Expires {displayDate(i.expiresAt)}. Your history starts when
                    you join.
                  </small>
                  <div>
                    <button
                      className="button primary small-button"
                      disabled={pending > 0}
                      onClick={async () => {
                        if (
                          await run(
                            {
                              type: "squad.respond",
                              inviteId: i.id,
                              accept: true,
                            },
                            "You’re in. Say a little hello.",
                          )
                        )
                          select(i.squadId);
                      }}
                    >
                      Join squad
                      <Check size={13} />
                    </button>
                    <button
                      className="text-button"
                      disabled={pending > 0}
                      onClick={() =>
                        void run(
                          {
                            type: "squad.respond",
                            inviteId: i.id,
                            accept: false,
                          },
                          "Invitation declined.",
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="squad-assurance">
            <ShieldCheck size={19} />
            <p>
              Invitation first. Conversation second.
              <br />
              Up to 12 people. Your choice to join.
            </p>
          </div>
        </aside>
        <section className="squad-conversation">
          {!active ? (
            <Empty
              title="Make room for your people."
              body="Pick a squad or start one with your accepted connections. Invitations never add someone without their say-so."
              action={
                <button
                  className="button subtle"
                  onClick={() => setDialog({ kind: "create" })}
                >
                  Bring a circle together
                  <ArrowUpRight size={15} />
                </button>
              }
            />
          ) : (
            <>
              <header className="squad-chat-heading">
                <button
                  className="icon-button squad-back"
                  aria-label="All squads"
                  onClick={() => select("")}
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="squad-symbol">
                  {active.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h2>{active.name}</h2>
                  <p>{active.memberIds.length} people · Private squad</p>
                </div>
                <button
                  className="icon-button"
                  aria-label={
                    s.preferences.squadMutedIds?.includes(active.id)
                      ? "Unmute squad"
                      : "Mute squad"
                  }
                  disabled={pending > 0}
                  onClick={() =>
                    void run({
                      type: "squad.mute",
                      squadId: active.id,
                      muted: !s.preferences.squadMutedIds?.includes(active.id),
                    })
                  }
                >
                  {s.preferences.squadMutedIds?.includes(active.id) ? (
                    <VolumeX size={18} />
                  ) : (
                    <Volume2 size={18} />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="Squad details and members"
                  onClick={() => setDialog({ kind: "manage" })}
                >
                  <MoreHorizontal size={20} />
                </button>
              </header>
              <div
                className="squad-history"
                ref={list}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  pinned.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 90;
                  setAway(!pinned.current);
                }}
              >
                <p className="squad-history-note">
                  <Lock size={12} />
                  You can see messages sent to you while you’re a member. New
                  members start fresh.
                </p>
                {squadHistory.hasMore && (
                  <button
                    className="button subtle history-button"
                    disabled={squadHistory.loading}
                    onClick={() => void older()}
                  >
                    {squadHistory.loading
                      ? "Finding earlier messages…"
                      : "Earlier in this circle"}
                    <ArrowDown size={14} />
                  </button>
                )}
                {!messages.length && (
                  <Empty
                    title="The next hello is yours."
                    body="Send a note to the people in this small circle."
                  />
                )}
                {messages.map((m) => (
                  <article
                    className={`message squad-message ${m.authorId === s.currentUserId ? "mine" : ""}`}
                    key={m.id}
                  >
                    <button
                      className="squad-avatar"
                      onClick={() => openProfile(m.authorId)}
                      aria-label={`View ${bubbleName(m)}’s profile`}
                    >
                      {m.authorInitials}
                    </button>
                    <div className="message-content">
                      <header>
                        <button
                          className="name-button"
                          onClick={() => openProfile(m.authorId)}
                        >
                          {bubbleName(m)}
                        </button>
                        <time>
                          {displayDate(m.createdAt, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {m.editedAt ? " · edited" : ""}
                        </time>
                      </header>
                      {m.replyTo && (
                        <div className="reply-preview">
                          ↳{" "}
                          {messages.find((x) => x.id === m.replyTo)?.body ??
                            "Earlier message"}
                        </div>
                      )}
                      <p>{m.body}</p>
                      <div className="reactions">
                        {Object.entries(m.reactions)
                          .filter(([, ids]) => ids.length)
                          .map(([emoji, ids]) => (
                            <button
                              key={emoji}
                              className={
                                ids.includes(s.currentUserId) ? "selected" : ""
                              }
                              onClick={() =>
                                void run({
                                  type: "squad.message.react",
                                  messageId: m.id,
                                  emoji,
                                })
                              }
                            >
                              {emoji}
                              <span>{ids.length}</span>
                            </button>
                          ))}
                        <button
                          aria-label={`React to ${bubbleName(m)}’s message with heart`}
                          onClick={() =>
                            void run({
                              type: "squad.message.react",
                              messageId: m.id,
                              emoji: "🖤",
                            })
                          }
                        >
                          <Heart size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setReplyId(m.id);
                            document.getElementById("squad-body")?.focus();
                          }}
                        >
                          Reply
                        </button>
                        {m.authorId === s.currentUserId && (
                          <button
                            onClick={() =>
                              setDialog({ kind: "editMessage", message: m })
                            }
                          >
                            Edit
                          </button>
                        )}
                        {(m.authorId === s.currentUserId || mine) && (
                          <button
                            onClick={() =>
                              setDialog({ kind: "deleteMessage", message: m })
                            }
                          >
                            Delete
                          </button>
                        )}
                        {m.authorId !== s.currentUserId && (
                          <button
                            aria-label="Report this squad message"
                            onClick={() =>
                              report({ id: m.id, type: "squadMessage" })
                            }
                          >
                            <Flag size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {away && (
                <button
                  className="squad-jump"
                  onClick={() => {
                    const el = list.current;
                    if (el) el.scrollTop = el.scrollHeight;
                    pinned.current = true;
                    setAway(false);
                  }}
                >
                  Jump to latest
                  <ArrowDown size={13} />
                </button>
              )}
              <form
                className="squad-composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const body = String(new FormData(form).get("body"));
                  if (
                    await run({
                      type: "squad.message.send",
                      squadId: active.id,
                      body,
                      ...(replyId ? { replyTo: replyId } : {}),
                    })
                  ) {
                    pinned.current = true;
                    form.reset();
                    setReplyId("");
                  }
                }}
              >
                {replyId && (
                  <div className="reply-preview">
                    Replying to{" "}
                    {bubbleName(
                      messages.find((m) => m.id === replyId) ??
                        ({
                          authorId: "",
                          authorName: "an earlier message",
                        } as SquadMessage),
                    )}
                    <button
                      type="button"
                      aria-label="Cancel reply"
                      onClick={() => setReplyId("")}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                <div>
                  <textarea
                    id="squad-body"
                    name="body"
                    rows={2}
                    required
                    maxLength={4000}
                    placeholder={`Say something to ${active.name}…`}
                    aria-label="Squad message"
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    className="send-button"
                    aria-label="Send squad message"
                    disabled={pending > 0}
                  >
                    <Send size={17} />
                  </button>
                </div>
                <small>
                  For the people here now. Make it a good little corner.
                </small>
              </form>
            </>
          )}
        </section>
      </div>
      {dialog?.kind === "create" && (
        <ModalShell
          title="A small circle. Good company."
          subtitle="Start with a name. Invite accepted connections after you create it."
          close={close}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(
                  {
                    type: "squad.create",
                    name: String(f.get("name")),
                    description: String(f.get("description")),
                  },
                  "Your squad is ready. Invite your people.",
                )
              )
                close();
            }}
          >
            <Field label="Your squad’s name">
              <input
                name="name"
                required
                maxLength={60}
                placeholder="The coffee crew"
              />
            </Field>
            <Field label="A little about this circle">
              <textarea
                name="description"
                maxLength={500}
                rows={3}
                placeholder="What brings your people together?"
              />
            </Field>
            <div className="callout">
              <p>
                Up to 12 people. Each person accepts an invitation before
                joining. Their message history starts when they join.
              </p>
            </div>
            <button className="button primary" disabled={pending > 0}>
              Start the squad
              <Plus size={16} />
            </button>
          </form>
        </ModalShell>
      )}
      {dialog?.kind === "manage" && active && (
        <ModalShell
          title={active.name}
          subtitle={active.description || "A small circle for your people."}
          close={close}
        >
          <div className="modal-form squad-details">
            <div className="section-label">
              <span>YOUR PEOPLE · {active.memberIds.length}/12</span>
              <Users size={14} />
            </div>
            {active.memberIds.map((id) => (
              <div className="squad-member" key={id}>
                <button
                  className="squad-avatar"
                  onClick={() => {
                    close();
                    openProfile(id);
                  }}
                >
                  {active.memberProfiles[id]?.initials ?? "?"}
                </button>
                <div>
                  <strong>{name(id)}</strong>
                  <small>
                    {id === active.ownerId ? "Squad owner" : "Member"}
                  </small>
                </div>
                {mine && id !== s.currentUserId && (
                  <>
                    <button
                      className="text-button"
                      onClick={() =>
                        setDialog({ kind: "transfer", userId: id })
                      }
                    >
                      Make owner
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${name(id)} from squad`}
                      onClick={() => setDialog({ kind: "remove", userId: id })}
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
            ))}
            <button
              className="button subtle"
              disabled={
                active.memberIds.length + active.pendingInviteeIds.length >= 12
              }
              onClick={() => setDialog({ kind: "invite" })}
            >
              <UserPlus size={16} />
              Invite a connection
            </button>
            {invitations.length > 0 && (
              <div className="squad-pending">
                <span className="eyebrow">
                  INVITATIONS · {active.pendingInviteeIds.length} RESERVED
                </span>
                {invitations.map((i) => (
                  <div key={i.id}>
                    <span>
                      {profile(i.toId)?.name ?? "A connection"}
                      <small>Expires {displayDate(i.expiresAt)}</small>
                    </span>
                    {(mine || i.fromId === s.currentUserId) && (
                      <button
                        className="text-button"
                        disabled={pending > 0}
                        onClick={() =>
                          void run(
                            { type: "squad.revoke", inviteId: i.id },
                            "Invitation withdrawn.",
                          )
                        }
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {mine && (
              <form
                className="squad-edit"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await run(
                    {
                      type: "squad.update",
                      squadId: active.id,
                      squad: {
                        name: String(f.get("name")),
                        description: String(f.get("description")),
                      },
                    },
                    "Your circle has a little update.",
                  );
                }}
              >
                <Field label="Squad name">
                  <input
                    name="name"
                    required
                    maxLength={60}
                    defaultValue={active.name}
                  />
                </Field>
                <Field label="About this circle">
                  <textarea
                    name="description"
                    rows={2}
                    maxLength={500}
                    defaultValue={active.description}
                  />
                </Field>
                <button
                  className="button subtle small-button"
                  disabled={pending > 0}
                >
                  <Pencil size={14} />
                  Save details
                </button>
              </form>
            )}
            <button
              className="action-row"
              onClick={() => setDialog({ kind: "leave" })}
            >
              <LogOut size={17} />
              <span>
                <strong>Leave this squad</strong>
                <small>Your next chapter is yours to choose.</small>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        </ModalShell>
      )}
      {dialog?.kind === "invite" && active && (
        <ModalShell
          title="Bring a little good company."
          subtitle={`${12 - active.memberIds.length - active.pendingInviteeIds.length} spaces available. Invitations expire after seven days.`}
          close={() => setDialog({ kind: "manage" })}
        >
          <div className="modal-form">
            {invitees.map((p) => (
              <div className="squad-member" key={p.id}>
                <span className="squad-avatar">{p.initials}</span>
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.headline}</small>
                </div>
                <button
                  className="button subtle small-button"
                  disabled={
                    pending > 0 ||
                    active.memberIds.length + active.pendingInviteeIds.length >=
                      12
                  }
                  onClick={() =>
                    void run(
                      {
                        type: "squad.invite",
                        squadId: active.id,
                        userId: p.id,
                      },
                      "Invitation sent. They decide when to join.",
                    )
                  }
                >
                  Invite
                  <UserPlus size={14} />
                </button>
              </div>
            ))}
            {!invitees.length && (
              <Empty
                title="Your circle is all caught up."
                body="Connect with someone first. Accepted connections can receive squad invitations."
              />
            )}
          </div>
        </ModalShell>
      )}
      {(dialog?.kind === "leave" ||
        dialog?.kind === "remove" ||
        dialog?.kind === "transfer") &&
        active && (
          <SquadDecision
            key={`${dialog.kind}-${"userId" in dialog ? dialog.userId : ""}`}
            squad={active}
            dialog={dialog}
            name={name}
            close={() => setDialog({ kind: "manage" })}
            run={run}
            done={() => {
              if (dialog.kind === "leave") select("");
              close();
            }}
          />
        )}
      {(dialog?.kind === "editMessage" || dialog?.kind === "deleteMessage") && (
        <ModalShell
          key={dialog.kind}
          title={
            dialog.kind === "editMessage"
              ? "A clearer thought."
              : "Delete this message?"
          }
          subtitle={
            dialog.kind === "editMessage"
              ? "Keep the conversation clear."
              : "This removes the message from this conversation."
          }
          close={close}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const command: Command =
                dialog.kind === "editMessage"
                  ? {
                      type: "squad.message.edit",
                      messageId: dialog.message.id,
                      body: String(new FormData(e.currentTarget).get("body")),
                    }
                  : {
                      type: "squad.message.delete",
                      messageId: dialog.message.id,
                    };
              if (
                await run(
                  command,
                  dialog.kind === "editMessage"
                    ? "Message updated."
                    : "Message deleted.",
                )
              ) {
                if (replyId === dialog.message.id) setReplyId("");
                close();
              }
            }}
          >
            {dialog.kind === "editMessage" ? (
              <Field label="Your words">
                <textarea
                  name="body"
                  required
                  maxLength={4000}
                  rows={5}
                  defaultValue={dialog.message.body}
                />
              </Field>
            ) : (
              <div className="callout">
                <p>{dialog.message.body}</p>
              </div>
            )}
            <footer>
              <button type="button" className="button subtle" onClick={close}>
                Cancel
              </button>
              <button className="button primary" disabled={pending > 0}>
                {dialog.kind === "editMessage" ? (
                  <>
                    <Check size={15} />
                    Save changes
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    Delete message
                  </>
                )}
              </button>
            </footer>
          </form>
        </ModalShell>
      )}
    </>
  );
}
function SquadDecision({
  squad,
  dialog,
  name,
  close,
  run,
  done,
}: {
  squad: Squad;
  dialog: Exclude<Dialog, null> & { kind: "leave" | "remove" | "transfer" };
  name: (id: string) => string;
  close: () => void;
  run: Props["run"];
  done: () => void;
}) {
  const { state, pending } = useLoop();
  const successor = [...squad.memberIds]
    .filter((id) => id !== state.currentUserId)
    .sort(
      (a, b) =>
        squad.memberProfiles[a].joinedAt.localeCompare(
          squad.memberProfiles[b].joinedAt,
        ) || a.localeCompare(b),
    )[0];
  const title =
    dialog.kind === "leave"
      ? "Step out of this circle?"
      : dialog.kind === "remove"
        ? `Remove ${name(dialog.userId)}?`
        : `Make ${name(dialog.userId)} the owner?`;
  const body =
    dialog.kind === "leave"
      ? squad.memberIds.length === 1
        ? "This archives the squad and withdraws any pending invitations."
        : `You will lose access to its conversation.${squad.ownerId === state.currentUserId ? ` Ownership passes to ${name(successor)}.` : ""}`
      : dialog.kind === "remove"
        ? "They will lose access to this conversation. A new invitation and acceptance are required to rejoin."
        : "They will manage members and details. You stay in the circle as a member.";
  return (
    <ModalShell title={title} subtitle={body} close={close}>
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const command: Command =
            dialog.kind === "leave"
              ? { type: "squad.leave", squadId: squad.id }
              : dialog.kind === "remove"
                ? {
                    type: "squad.remove",
                    squadId: squad.id,
                    userId: dialog.userId,
                  }
                : {
                    type: "squad.transfer",
                    squadId: squad.id,
                    userId: dialog.userId,
                  };
          if (await run(command, "Your squad has been updated.")) done();
        }}
      >
        <footer>
          <button type="button" className="button subtle" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={pending > 0}>
            {dialog.kind === "leave"
              ? "Leave squad"
              : dialog.kind === "remove"
                ? "Remove member"
                : "Transfer ownership"}
            <Check size={15} />
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
