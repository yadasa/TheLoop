import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Flag,
  Mail,
  MoreHorizontal,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import { directParticipantSnapshot, useLoop } from "@theloop/client";
import {
  connected,
  displayDate,
  type Command,
  type Report,
} from "@theloop/core";
import { Avatar, Empty } from "./ui";
import { ImageComposer, ProtectedImage, useImageDraft } from "./images";
import type { ContentTarget } from "./ContentDialog";
type Props = {
  peerId: string;
  select: (id: string) => void;
  openProfile: (id: string) => void;
  meetPeople: () => void;
  run: (cmd: Command, success?: string) => Promise<boolean>;
  showContent: (target: ContentTarget) => void;
  report: (target: { id: string; type: Report["targetType"] }) => void;
};
export default function DirectInbox({
  peerId,
  select,
  openProfile,
  meetPeople,
  run,
  showContent,
  report,
}: Props) {
  const {
    state: s,
    pending,
    watchDirectConversation,
    loadOlderDirectMessages,
    directHistory,
  } = useLoop();
  const blocked = s.preferences.blockedIds.includes(peerId),
    selected = peerId && !blocked && peerId !== s.currentUserId ? peerId : "";
  const photo = useImageDraft(
    selected ? { kind: "directMessage", id: selected } : null,
  );
  const [away, setAway] = useState(false),
    list = useRef<HTMLDivElement>(null),
    contents = useRef<HTMLDivElement>(null),
    pinned = useRef(true),
    anchor = useRef<{ height: number; top: number } | null>(null),
    previous = useRef("");
  const messages = useMemo(
    () =>
      s.directMessages
        .filter(
          (d) =>
            (d.fromId === s.currentUserId && d.toId === selected) ||
            (d.toId === s.currentUserId && d.fromId === selected),
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        ),
    [s.directMessages, s.currentUserId, selected],
  );
  const profile = (id: string) => s.profiles.find((p) => p.id === id);
  const identity = (id: string) =>
    profile(id) ??
    directParticipantSnapshot(s.directMessages, s.currentUserId, id) ?? {
      id,
      name: "Community member",
      initials: "?",
    };
  const peerIds = new Set(
    s.profiles
      .filter((p) => p.id !== s.currentUserId && connected(s, p.id))
      .map((p) => p.id),
  );
  for (const d of s.directMessages) {
    if (d.fromId === s.currentUserId) peerIds.add(d.toId);
    else if (d.toId === s.currentUserId) peerIds.add(d.fromId);
  }
  if (selected) peerIds.add(selected);
  const peers = [...peerIds]
    .filter(
      (id) => id !== s.currentUserId && !s.preferences.blockedIds.includes(id),
    )
    .map((id) => ({
      person: identity(id),
      latest: s.directMessages
        .filter(
          (d) =>
            (d.fromId === id && d.toId === s.currentUserId) ||
            (d.toId === id && d.fromId === s.currentUserId),
        )
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        )[0],
      unread: s.directMessages.filter(
        (d) => d.fromId === id && d.toId === s.currentUserId && !d.read,
      ).length,
    }))
    .sort(
      (a, b) =>
        (b.latest?.createdAt ?? "").localeCompare(a.latest?.createdAt ?? "") ||
        a.person.name.localeCompare(b.person.name),
    );
  useEffect(() => {
    watchDirectConversation(selected || null);
    return () => watchDirectConversation(null);
  }, [selected, watchDirectConversation]);
  useEffect(() => {
    if (blocked) select("");
  }, [blocked]);
  const lastRead = useRef({ peer: "", first: "" }),
    reading = useRef<string | null>(null),
    unreadKey = messages
      .filter((d) => d.fromId === selected && !d.read)
      .map((d) => d.id)
      .join("|");
  useEffect(() => {
    if (!selected || reading.current === selected) return;
    const first = messages[0]?.id ?? "";
    if (
      lastRead.current.peer === selected &&
      lastRead.current.first === first &&
      !unreadKey
    )
      return;
    lastRead.current = { peer: selected, first };
    reading.current = selected;
    void run({ type: "dm.read", userId: selected }).finally(() => {
      if (reading.current === selected) reading.current = null;
    });
  }, [selected, unreadKey, messages[0]?.id]);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (previous.current !== selected) {
      previous.current = selected;
      anchor.current = null;
      pinned.current = true;
      setAway(false);
      el.scrollTop = el.scrollHeight;
    } else if (anchor.current) {
      el.scrollTop =
        el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
    } else if (pinned.current) el.scrollTop = el.scrollHeight;
  }, [selected, messages.length, messages.at(-1)?.id]);
  useEffect(() => {
    const el = contents.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinned.current && !anchor.current && list.current)
        list.current.scrollTop = list.current.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [selected]);
  const older = async () => {
    if (directHistory.loading) return;
    const el = list.current;
    if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    try {
      await loadOlderDirectMessages();
    } catch {
      anchor.current = null;
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KEEP THE CONVERSATION GOING</span>
          <h1>A little closer.</h1>
          <p>Private conversations. A warm hello. The next good connection.</p>
        </div>
      </div>
      <div className={`dm-layout direct-inbox ${selected ? "has-active" : ""}`}>
        <aside>
          <div className="section-label">
            <span>YOUR CONVERSATIONS</span>
            <Mail size={14} />
          </div>
          {peers.map(({ person, latest, unread }) => (
            <button
              className={selected === person.id ? "active" : ""}
              key={person.id}
              onClick={() => select(person.id)}
            >
              <Avatar person={person} />
              <span>
                <strong>{person.name}</strong>
                <small>{latest?.body ?? "Say a little hello."}</small>
              </span>
              {unread > 0 ? (
                <b className="direct-unread">{unread}</b>
              ) : s.preferences.dmMutedIds?.includes(person.id) ? (
                <VolumeX size={13} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          ))}
          {!peers.length && (
            <p className="squad-note">
              A new connection can become a good conversation.
            </p>
          )}
        </aside>
        <section>
          {!selected ? (
            <Empty
              title="The next conversation is yours."
              body="Choose a conversation, or meet someone new in the community."
              action={
                <button className="button subtle" onClick={meetPeople}>
                  Find your people
                  <ChevronRight size={15} />
                </button>
              }
            />
          ) : (
            <>
              <header>
                <button
                  className="icon-button direct-back"
                  aria-label="All conversations"
                  onClick={() => select("")}
                >
                  <ChevronLeft size={18} />
                </button>
                <Avatar
                  person={identity(selected)}
                  onClick={() => openProfile(selected)}
                />
                <div>
                  <h3>{identity(selected).name}</h3>
                  <p>
                    {connected(s, selected)
                      ? "Your connection. A private conversation."
                      : "A private community conversation."}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Mark conversation read"
                  onClick={() =>
                    void run({ type: "dm.read", userId: selected })
                  }
                  disabled={pending > 0}
                >
                  <CheckCheck size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={
                    s.preferences.dmMutedIds?.includes(selected)
                      ? "Unmute private conversation"
                      : "Mute private conversation"
                  }
                  disabled={pending > 0}
                  onClick={() =>
                    void run({
                      type: "dm.mute",
                      userId: selected,
                      muted: !s.preferences.dmMutedIds?.includes(selected),
                    })
                  }
                >
                  {s.preferences.dmMutedIds?.includes(selected) ? (
                    <VolumeX size={17} />
                  ) : (
                    <Volume2 size={17} />
                  )}
                </button>
              </header>
              <div
                className="dm-messages"
                ref={list}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  pinned.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 90;
                  setAway(!pinned.current);
                }}
              >
                <div ref={contents} className="direct-message-content">
                  {directHistory.hasMore && (
                    <button
                      className="button subtle history-button"
                      onClick={() => void older()}
                      disabled={directHistory.loading}
                    >
                      {directHistory.loading
                        ? "Finding earlier messages…"
                        : "Earlier between you"}
                      <ArrowDown size={13} />
                    </button>
                  )}
                  {!messages.length && (
                    <Empty
                      title="Make the first little move."
                      body="A good conversation can start with a thoughtful hello."
                    />
                  )}
                  {messages.map((d) => (
                    <div
                      className={`dm-bubble ${d.fromId === s.currentUserId ? "mine" : ""}`}
                      key={d.id}
                    >
                      <p>{d.body}</p>
                      {d.image && (
                        <ProtectedImage image={d.image} alt={d.body} />
                      )}
                      <div className="direct-message-meta">
                        <small>
                          {displayDate(d.createdAt, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {d.editedAt ? " · edited" : ""}
                        </small>
                        {d.fromId === s.currentUserId ? (
                          <button
                            className="dm-report"
                            aria-label="Options for your private message"
                            onClick={() =>
                              showContent({ kind: "directMessage", message: d })
                            }
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        ) : (
                          <button
                            className="dm-report"
                            aria-label="Report this private message"
                            onClick={() =>
                              report({ id: d.id, type: "directMessage" })
                            }
                          >
                            <Flag size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {away && (
                <button
                  className="squad-jump direct-jump"
                  onClick={() => {
                    if (list.current)
                      list.current.scrollTop = list.current.scrollHeight;
                    pinned.current = true;
                    setAway(false);
                  }}
                >
                  Jump to latest
                  <ArrowDown size={13} />
                </button>
              )}
              <form
                className="dm-composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (pending > 0 || photo.busy) return;
                  const form = e.currentTarget,
                    body = String(new FormData(form).get("body"));
                  const uploaded = await photo.prepare();
                  if (!uploaded.ok) return;
                  if (
                    await run({
                      type: "dm.send",
                      userId: selected,
                      body,
                      ...(uploaded.imageId
                        ? { imageId: uploaded.imageId }
                        : {}),
                    })
                  ) {
                    pinned.current = true;
                    form.reset();
                    photo.clear();
                  }
                }}
              >
                <input
                  key={selected}
                  name="body"
                  placeholder="A good conversation starts here…"
                  required
                  maxLength={4000}
                  aria-label="Private message"
                />
                <button
                  className="send-button"
                  aria-label="Send private message"
                  disabled={pending > 0 || photo.busy}
                >
                  <Send size={17} />
                </button>
                <ImageComposer value={photo} disabled={pending > 0} />
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
