import { notificationAccessible } from "@theloop/core";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Hash,
  Heart,
  Home,
  Link as LinkIcon,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
  Bell,
  Globe,
  MapPin,
  Clock,
  Download,
  Flag,
  UserPlus,
  Mail,
  LogOut,
  SlidersHorizontal,
  ExternalLink,
  Menu,
  CheckCheck,
  Copy,
  UsersRound,
  CircleHelp,
} from "lucide-react";
import { useLoop } from "@theloop/client";
import { Avatar, Empty, Field, Logo, ModalShell } from "./ui";
import {
  ContentDialog,
  type ContentMode,
  type ContentTarget,
} from "./ContentDialog";
import Squads from "./Squads";
import GuideDialog from "./GuideDialog";
import DirectInbox from "./DirectInbox";
import EventEditor from "./EventEditor";
import EventManager, { type EventManagementAction } from "./EventManager";
import { useWebRoute } from "./useWebRoute";
import type { Page } from "./routes";
import Tutorial, { hasSeenTour } from "./Tutorial";
import { ThemeSwitcher } from "./theme";
import { ImageComposer, ProtectedImage, useImageDraft } from "./images";
import {
  channelUnread,
  connected,
  displayDate,
  eventICS,
  interests,
  postScore,
  subscriptionFor,
  suggestedConnections,
  trustLabel,
  visibleChannels,
  type Command,
  type LoopEvent,
  type Post,
  type Profile,
  type Subscription,
  previewEventCSV,
  type EventDraft,
  type Conference,
  type Community,
  type Report,
  sharedTargetPath,
} from "@theloop/core";
type SquadPage = "squads";
type Modal =
  | "compose"
  | "event"
  | "interests"
  | "settings"
  | "community"
  | "notifications"
  | "import"
  | "report"
  | "delete"
  | "appeal"
  | "moderate"
  | "organize"
  | "topic"
  | "followers"
  | "guide"
  | null;
const nav = [
  ["home", Home, "Your loop"],
  ["chat", MessageCircle, "Group chats"],
  ["communities", Compass, "Communities"],
  ["calendar", CalendarDays, "Calendar"],
  ["people", Users, "People"],
  ["inbox", Mail, "Inbox"],
  ["squads", UsersRound, "Squads"],
] as const;
export default function App() {
  const {
    state: s,
    dispatch,
    mode,
    ready,
    startupError,
    retryStartup,
    error,
    clearError,
    pending,
    resetDemo,
    signIn,
    signUp,
    signOut,
    resetPassword,
    exportAccount,
    deleteAccount,
    appealTrust,
    role,
    hasMore,
    loadMore,
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
    watchPost,
    watchEvent,
    postStatus,
    eventStatus,
    directCatalog,
  } = useLoop();
  const {
    route,
    set: setRoute,
    reset: resetRoute,
    closeDetail,
  } = useWebRoute();
  const {
    page,
    channelId,
    topic,
    communityId,
    profileId,
    dmId,
    squadId,
    postDetail,
    eventDetail,
    conferenceId: calendarScope,
  } = route;
  const setPage = (value: Page) => setRoute("page", value);
  const setCalendarScope = (value: string) => setRoute("conferenceId", value);
  const setChannelId = (value: string) => {
    setRoute("channelId", value);
    setRoute("topic", "All topics");
  };
  const setTopic = (value: string) => setRoute("topic", value);
  const setCommunityId = (value: string) => setRoute("communityId", value);
  const setProfileId = (value: string) => setRoute("profileId", value);
  const setDmId = (value: string) => setRoute("dmId", value);
  const setSquadId = (value: string) => setRoute("squadId", value);
  const setPostDetail = (value: string | null) => setRoute("postDetail", value);
  const setEventDetail = (value: string | null) =>
    setRoute("eventDetail", value);
  const [modal, setModal] = useState<Modal>(null),
    [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [feedTab, setFeedTab] = useState("For you"),
    [notice, setNotice] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [reportTarget, setReportTarget] = useState<{
      id: string;
      type: Report["targetType"];
      postId?: string;
    }>({
      id: "",
      type: "post",
    }),
    [replyTo, setReplyTo] = useState<string | null>(null),
    [month, setMonth] = useState(new Date(2026, 10, 1)),
    [authRegister, setAuthRegister] = useState(false),
    [intro, setIntro] = useState(false),
    [tourOpen, setTourOpen] = useState(false),
    [contentTarget, setContentTarget] = useState<ContentTarget | null>(null),
    [contentMode, setContentMode] = useState<ContentMode>("menu"),
    [eventAction, setEventAction] = useState<EventManagementAction | null>(
      null,
    ),
    [composeKind, setComposeKind] = useState<Post["kind"]>("discussion"),
    [composeCommunityId, setComposeCommunityId] = useState(""),
    [followerMode, setFollowerMode] = useState<"followers" | "following">(
      "followers",
    );
  const me = s.profiles.find((p) => p.id === s.currentUserId);
  const person = (id: string) => s.profiles.find((p) => p.id === id);
  const participant = (id: string, name?: string, initials?: string) =>
    person(id) ?? {
      name: name || "Community member",
      initials: initials || "?",
      verified: false,
    };
  const availableChannels = visibleChannels(s);
  const activeChannel = availableChannels.find((c) => c.id === channelId);
  const activeCommunity = s.communities.find((c) => c.id === communityId);
  const chatImage = useImageDraft(
    page === "chat" && activeChannel
      ? { kind: "channel", id: activeChannel.id }
      : null,
  );
  const composeImage = useImageDraft(
    modal === "compose" && composeCommunityId
      ? { kind: "community", id: composeCommunityId }
      : null,
  );
  const reportImage =
    reportTarget.type === "post"
      ? s.posts.find((p) => p.id === reportTarget.id)?.image
      : reportTarget.type === "message"
        ? s.messages.find((m) => m.id === reportTarget.id)?.image
        : reportTarget.type === "directMessage"
          ? s.directMessages.find((d) => d.id === reportTarget.id)?.image
          : reportTarget.type === "squadMessage"
            ? s.squadMessages.find((m) => m.id === reportTarget.id)?.image
            : undefined;
  const myNotifications = s.notifications.filter(
    (n) => notificationAccessible(s, n),
  );
  const unread = myNotifications.filter((n) => !n.read).length;
  const toast = (text: string) => {
    setNotice(text);
  };
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  const act = async (cmd: Command, success?: string) => {
    try {
      await dispatch(cmd);
      if (success) toast(success);
      return true;
    } catch {
      return false;
    }
  };
  const navigate = (target: Page | SquadPage) => {
    setEventAction(null);
    setPage(target);
    setModal(null);
    setPostDetail(null);
    setEventDetail(null);
    setContentTarget(null);
    setMobileNav(false);
    setSearchOpen(false);
    setQuery("");
  };
  const openProfile = (id: string) => {
    setProfileId(id);
    void loadProfile(id).catch(() => {});
    navigate("profile");
  };
  const showContent = (target: ContentTarget, mode: ContentMode = "menu") => {
    setContentTarget(target);
    setContentMode(mode);
  };
  const accountId = useRef(s.currentUserId);
  useEffect(() => {
    if (accountId.current === s.currentUserId) return;
    const hadAccount = !!accountId.current;
    accountId.current = s.currentUserId;
    setTourOpen(false);
    setEventAction(null);
    welcomed.current = false;
    setModal(null);
    setContentTarget(null);
    setReplyTo(null);
    if (hadAccount) resetRoute();
    setQuery("");
    setSearchOpen(false);
    setMobileNav(false);
  }, [s.currentUserId]);
  useEffect(() => {
    setModal(null);
    setEventAction(null);
    setContentTarget(null);
    setSearchOpen(false);
    setMobileNav(false);
  }, [
    page,
    channelId,
    communityId,
    profileId,
    dmId,
    squadId,
    postDetail,
    eventDetail,
  ]);
  useEffect(() => {
    if (ready && s.currentUserId && page === "profile" && profileId)
      void loadProfile(profileId).catch(() => {});
  }, [ready, s.currentUserId, page, profileId, loadProfile]);
  useEffect(() => {
    watchPost(postDetail);
    return () => watchPost(null);
  }, [postDetail, watchPost]);
  const watchedEventId = eventAction?.event.id ?? eventDetail;
  useEffect(() => {
    watchEvent(watchedEventId);
    return () => watchEvent(null);
  }, [watchedEventId, watchEvent]);
  useEffect(() => {
    watchConversation(
      page === "chat" ? (activeChannel?.id ?? null) : null,
      topic === "All topics" ? undefined : topic,
    );
    return () => watchConversation(null);
  }, [page, activeChannel?.id, topic, watchConversation]);
  useEffect(() => {
    if (page === "saved") void loadSavedPosts().catch(() => {});
  }, [page, loadSavedPosts, s.preferences.savedPostIds.join("|")]);
  useEffect(() => {
    const timer = setTimeout(
      () => setDirectoryQuery(page === "people" || searchOpen ? query : ""),
      300,
    );
    return () => clearTimeout(timer);
  }, [query, page, searchOpen, setDirectoryQuery]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (tourOpen) return;
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tourOpen]);
  useEffect(() => {
    if (page === "chat" && activeChannel && !tourOpen)
      void act({ type: "channel.read", channelId: activeChannel.id, ...(topic !== "All topics" ? { topic } : { visibleTopics: true }) });
  }, [page, activeChannel?.id, topic, tourOpen]);
  useEffect(() => {
    setReplyTo(null);
  }, [channelId]);
  useEffect(() => {
    if (
      activeChannel &&
      topic !== "All topics" &&
      subscriptionFor(s, `${activeChannel.id}:${topic}`, activeChannel.id) ===
        "hidden"
    )
      setTopic("All topics");
  }, [s.preferences.subscriptions]);
  const welcomed = useRef(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = document.getElementById("main")?.animate?.(
      [{ opacity: 0.6, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    return () => animation?.cancel();
  }, [page]);
  const tourChecked = useRef(false);
  useEffect(() => {
    if (ready && me && s.preferences.onboardingComplete && page === "home" && !modal && !searchOpen && !postDetail && !eventDetail && !tourChecked.current) {
      tourChecked.current = true;
      if (!hasSeenTour()) setTourOpen(true);
    }
  }, [ready, me?.id, s.preferences.onboardingComplete, page, modal, searchOpen, postDetail, eventDetail]);
  useEffect(() => {
    if (modal === "compose") {
      setComposeKind("discussion");
      setComposeCommunityId(
        communityId === "all"
          ? (s.preferences.joinedCommunityIds[0] ?? "")
          : communityId,
      );
    }
  }, [modal]);
  useEffect(() => {
    if (ready && me && !s.preferences.onboardingComplete && !welcomed.current) {
      welcomed.current = true;
      setModal("interests");
      void act({
        type: "preferences.update",
        preferences: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
    }
  }, [ready, me?.id]);
  const posts = useMemo(
    () =>
      s.posts
        .filter(
          (p) =>
            !s.preferences.blockedIds.includes(p.authorId) &&
            (communityId === "all" ||
              page !== "communities" ||
              p.communityId === communityId) &&
            (page !== "saved" || s.preferences.savedPostIds.includes(p.id)) &&
            (page !== "home" ||
              feedTab !== "For you" ||
              s.preferences.joinedCommunityIds.includes(p.communityId)) &&
            (page !== "home" ||
              feedTab !== "Following" ||
              s.preferences.followingIds.includes(p.authorId)) &&
            (page !== "home" ||
              feedTab !== "My communities" ||
              s.preferences.joinedCommunityIds.includes(p.communityId)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [s.posts, s.preferences, communityId, page, feedTab],
  );
  const suggestions = suggestedConnections(s);
  const activeMessages = useMemo(
    () =>
      s.messages
        .filter(
          (m) =>
            m.channelId === activeChannel?.id &&
            !s.preferences.blockedIds.includes(m.authorId) &&
            (topic === "All topics"
              ? subscriptionFor(
                  s,
                  `${activeChannel.id}:${m.topic}`,
                  activeChannel.id,
                ) !== "hidden"
              : m.topic === topic),
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        ),
    [s.messages, s.preferences, activeChannel?.id, topic],
  );
  const messageList = useRef<HTMLDivElement>(null),
    pinnedToBottom = useRef(true),
    historyAnchor = useRef<{ height: number; top: number } | null>(null),
    lastConversation = useRef("");
  const conversationKey =
    page === "chat" ? `${activeChannel?.id ?? ""}:${topic}` : "";
  useLayoutEffect(() => {
    const el = messageList.current;
    if (!el) return;
    if (lastConversation.current !== conversationKey) {
      lastConversation.current = conversationKey;
      historyAnchor.current = null;
      pinnedToBottom.current = true;
      el.scrollTop = el.scrollHeight;
    } else if (historyAnchor.current) {
      el.scrollTop =
        el.scrollHeight -
        historyAnchor.current.height +
        historyAnchor.current.top;
      historyAnchor.current = null;
    } else if (pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [conversationKey, activeMessages.length, activeMessages.at(-1)?.id]);
  const earlierMessages = async () => {
    const el = messageList.current;
    if (el)
      historyAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
    try {
      await loadOlderMessages();
    } catch {
      historyAnchor.current = null;
    }
  };
  const quotedMessage = (id: string) => {
    const m = s.messages.find((x) => x.id === id);
    return m
      ? s.preferences.blockedIds.includes(m.authorId)
        ? "Message from a blocked member"
        : m.body
      : "Earlier message";
  };
  const directoryPeople = directory.results.filter(
    (p) => p.id !== s.currentUserId && !s.preferences.blockedIds.includes(p.id),
  );
  const upcoming = s.events
    .filter((e) => new Date(e.endAt).getTime() > Date.now())
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const nextPlans = upcoming.filter((event) => event.status !== "cancelled");
  const share = async (
    title: string,
    text: string,
    url = window.location.origin,
  ) => {
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else {
        await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
        toast("Copied. Keep the connection going.");
      }
    } catch {
      toast("Sharing cancelled or unavailable.");
    }
  };
  const download = (filename: string, content: string, type = "text/plain") => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (startupError)
    return (
      <main className="loading">
        <Empty
          title={s.currentUserId ? "We couldn’t load your account" : "TheLoop couldn’t connect"}
          body={startupError}
          action={
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <button className="button primary" disabled={pending > 0} onClick={retryStartup}>
                Try again
              </button>
              {s.currentUserId && (
                <button className="button" disabled={pending > 0} onClick={() => void signOut().catch(() => {})}>
                  Sign out
                </button>
              )}
            </div>
          }
        />
        {error && error !== startupError && <p role="alert" className="form-error">{error}</p>}
      </main>
    );
  if (!ready)
    return (
      <div className="loading">
        <Logo />
        <p>Finding your people…</p>
      </div>
    );
  if (mode === "live" && !s.currentUserId)
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <Logo />
          <span>TheLoop</span>
          <ThemeSwitcher />
        </div>
        <div className="auth-story">
          <span className="eyebrow">GOOD PEOPLE. REAL CONNECTION.</span>
          <h1>
            The group chat.
            <br />
            <em>Grown up.</em>
          </h1>
          <p>
            A space for your people, your interests, and everything that happens
            beyond the conference.
          </p>
          <div className="hero-rings">
            <i />
            <i />
            <i />
          </div>
        </div>
        <form
          className="auth-card"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              if (authRegister)
                await signUp(
                  String(f.get("email")),
                  String(f.get("password")),
                  String(f.get("name")),
                );
              else
                await signIn(String(f.get("email")), String(f.get("password")));
            } catch {}
          }}
        >
          <h2>
            {authRegister ? "Find your place in the loop." : "Welcome back."}
          </h2>
          <p>
            {authRegister
              ? "Good connections start with a hello."
              : "Your people are right here."}
          </p>
          {authRegister && (
            <Field label="Your name">
              <input name="name" required minLength={2} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={authRegister ? "new-password" : "current-password"}
            />
          </Field>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={pending > 0}>
            {authRegister ? "Create your account" : "Sign in"}
            <ArrowUpRight size={16} />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setAuthRegister(!authRegister);
              clearError();
            }}
          >
            {authRegister
              ? "Already in the loop? Sign in"
              : "New here? Create an account"}
          </button>
          {!authRegister && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const email = (
                  document.querySelector("[name=email]") as HTMLInputElement
                )?.value;
                if (email)
                  void resetPassword(email)
                    .then(() => toast("Check your email for a reset link."))
                    .catch(() => {});
                else toast("Enter your email first.");
              }}
            >
              Forgot password?
            </button>
          )}
          {notice && <p role="status">{notice}</p>}
        </form>
      </div>
    );
  const postCard = (post: Post) => {
    const author = participant(
        post.authorId,
        post.authorName,
        post.authorInitials,
      ),
      community = s.communities.find((c) => c.id === post.communityId);
    const score = postScore(post.votes);
    const selected = post.votes[s.currentUserId];
    return (
      <article className="post-card" key={post.id}>
        <div className="post-author">
          <Avatar person={author} onClick={() => openProfile(post.authorId)} />
          <div>
            <button
              className="name-button"
              onClick={() => openProfile(post.authorId)}
            >
              {author?.name ?? "Community member"}
              {author?.verified && (
                <span title="Email verified" aria-label="Email verified">
                  <ShieldCheck size={13} />
                </span>
              )}
            </button>
            <span>
              <button
                className="community-link"
                onClick={() => {
                  setPostDetail(null);
                  setCommunityId(post.communityId);
                  navigate("communities");
                }}
              >
                {community?.name}
              </button>{" "}
              <b>·</b> {displayDate(post.createdAt)}
              {post.editedAt ? " · edited" : ""}
            </span>
          </div>
          <button
            className="icon-button more"
            aria-label={`More options for ${post.title}`}
            onClick={() => {
              showContent({ kind: "post", post });
            }}
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
        <div className="post-body">
          <span className={`post-kind ${post.kind}`}>
            {post.kind === "win"
              ? "✦ A LITTLE WIN"
              : post.kind === "opportunity"
                ? "↗ OPENING DOORS"
                : post.kind === "poll"
                  ? "◉ THE PEOPLE HAVE THE FLOOR"
                  : "THE CONVERSATION"}
          </span>
          <button className="post-title" onClick={() => setPostDetail(post.id)}>
            {post.title}
          </button>
          <p>{post.body}</p>
          {post.image && <ProtectedImage image={post.image} alt={post.title} />}
          {post.url && (
            <a
              className="external-link"
              href={post.url}
              target="_blank"
              rel="noreferrer"
            >
              Open shared link <ExternalLink size={13} />
            </a>
          )}
          {post.poll && (
            <div className="poll">
              {post.poll.options.map((o) => {
                const total = post.poll!.options.reduce(
                  (n, x) => n + x.voterIds.length,
                  0,
                );
                const voted = o.voterIds.includes(s.currentUserId);
                return (
                  <button
                    key={o.id}
                    onClick={() =>
                      void act({
                        type: "poll.vote",
                        postId: post.id,
                        optionId: o.id,
                      })
                    }
                    className={voted ? "selected" : ""}
                  >
                    <span
                      className="poll-bar"
                      style={{
                        width: `${total ? (o.voterIds.length / total) * 100 : 0}%`,
                      }}
                    />
                    <span>
                      {voted && <Check size={13} />} {o.label}
                    </span>
                    <small>
                      {total
                        ? Math.round((o.voterIds.length / total) * 100)
                        : 0}
                      %
                    </small>
                  </button>
                );
              })}
              <small>
                {post.poll.options.reduce((n, o) => n + o.voterIds.length, 0)}{" "}
                votes · closes {displayDate(post.poll.closesAt)}
              </small>
            </div>
          )}
          <div className="tags">
            {post.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
        <footer className="post-actions">
          <div className="vote">
            <button
              aria-label="Upvote post"
              className={selected === 1 ? "selected" : ""}
              onClick={() =>
                void act({ type: "post.vote", postId: post.id, value: 1 })
              }
            >
              <ArrowUp size={16} />
            </button>
            <strong>{score}</strong>
            <button
              aria-label="Downvote post"
              className={selected === -1 ? "selected" : ""}
              onClick={() =>
                void act({ type: "post.vote", postId: post.id, value: -1 })
              }
            >
              <ArrowDown size={16} />
            </button>
          </div>
          <button onClick={() => setPostDetail(post.id)}>
            <MessageCircle size={16} />
            <span>
              {post.comments.length}{" "}
              <span className="desktop-word">replies</span>
            </span>
          </button>
          <button
            onClick={() =>
              void share(
                post.title,
                post.body,
                `${window.location.origin}${window.location.pathname}${sharedTargetPath({ kind: "post", id: post.id })}`,
              )
            }
          >
            <ArrowUpRight size={16} />
            <span>Share</span>
          </button>
          <button
            className={`save ${s.preferences.savedPostIds.includes(post.id) ? "selected" : ""}`}
            aria-label="Save post"
            onClick={() => void act({ type: "post.save", postId: post.id })}
          >
            <Bookmark size={17} />
          </button>
        </footer>
      </article>
    );
  };
  const eventCard = (event: LoopEvent, compact = false) => {
    const going = event.attendeeIds.includes(s.currentUserId),
      waiting = event.waitlistIds.includes(s.currentUserId),
      full = event.capacity > 0 && event.attendeeIds.length >= event.capacity,
      cancelled = event.status === "cancelled",
      ended = Date.parse(event.endAt) <= Date.now(),
      closed = cancelled || ended,
      limitReached = !full && event.attendeeIds.length >= 1000,
      waitlistFull = full && event.waitlistIds.length >= 500;
    return (
      <article
        key={event.id}
        className={`event-card ${compact ? "compact" : ""}`}
      >
        <div className="event-date">
          <span>
            {displayDate(event.startAt, {
              month: "short",
              timeZone: event.timezone,
            })}
          </span>
          <strong>
            {displayDate(event.startAt, {
              day: "numeric",
              timeZone: event.timezone,
            })}
          </strong>
        </div>
        <div className="event-info">
          <span className="eyebrow">
            {event.kind} ·{" "}
            {s.conferences.find((c) => c.id === event.conferenceId)
              ?.shortName ?? "THE LOOP"}
            {closed && (
              <strong className="event-status">
                {cancelled ? "Cancelled" : "Ended"}
              </strong>
            )}
          </span>
          <h3>
            <button
              className="event-title"
              onClick={() => setEventDetail(event.id)}
            >
              {event.title}
            </button>
          </h3>
          <p>
            <Clock size={12} />
            {displayDate(event.startAt, {
              hour: "numeric",
              minute: "2-digit",
              timeZone: event.timezone,
              timeZoneName: "short",
            })}
          </p>
          <p>
            <MapPin size={12} />
            {event.location}
          </p>
          {!compact && <p className="event-description">{event.description}</p>}
          {!compact && cancelled && event.cancellationReason && (
            <p className="event-cancellation-note">
              {event.cancellationReason}
            </p>
          )}
          <div className="event-attendees">
            <div className="avatar-stack">
              {event.attendeeIds.slice(0, 3).map((id) => (
                <Avatar
                  key={id}
                  size="tiny"
                  person={person(id)}
                  onClick={() => openProfile(id)}
                />
              ))}
            </div>
            <span>
              {event.attendeeIds.length} {closed ? "RSVPs retained" : "going"}
              {full && !closed ? " · Full" : ""}
              {waiting ? " · You’re on the waitlist" : ""}
            </span>
          </div>
          <div className="event-actions">
            <button
              className={`button ${going || waiting ? "subtle" : "primary"} small-button`}
              onClick={() =>
                void act(
                  { type: "event.rsvp", eventId: event.id },
                  going || waiting
                    ? "Your RSVP has been removed."
                    : full
                      ? "You’re on the waitlist."
                      : "You’re on the list. See you there.",
                )
              }
              disabled={
                pending > 0 ||
                (!(going || waiting) &&
                  (closed || limitReached || waitlistFull))
              }
            >
              {closed && (going || waiting) ? (
                "Remove my RSVP"
              ) : closed ? (
                cancelled ? (
                  "Cancelled"
                ) : (
                  "Event ended"
                )
              ) : !going && !waiting && waitlistFull ? (
                "Waitlist full"
              ) : !going && !waiting && limitReached ? (
                "RSVP limit reached"
              ) : going ? (
                <>
                  <Check size={13} />
                  Going
                </>
              ) : waiting ? (
                "Leave waitlist"
              ) : full ? (
                "Join waitlist"
              ) : (
                "Count me in"
              )}
              {!going &&
                !waiting &&
                !closed &&
                !waitlistFull &&
                !limitReached && <ArrowUpRight size={13} />}
            </button>
            {!compact && (
              <>
                <button
                  className="icon-button"
                  title={
                    cancelled
                      ? "Export event cancellation"
                      : "Export event to calendar"
                  }
                  onClick={() =>
                    download(
                      `${event.id}.ics`,
                      eventICS(event),
                      "text/calendar",
                    )
                  }
                >
                  <Download size={16} />
                </button>
                <button
                  className="icon-button"
                  title="Share event"
                  onClick={() =>
                    void share(
                      cancelled ? `Cancelled: ${event.title}` : event.title,
                      event.description,
                      `${window.location.origin}${window.location.pathname}${sharedTargetPath({ kind: "event", id: event.id })}`,
                    )
                  }
                >
                  <ArrowUpRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    );
  };
  const rail = (
    <aside className="right-rail">
      <section className="rail-section">
        <div className="section-label">
          <span>UP NEXT</span>
          <button onClick={() => navigate("calendar")}>
            View calendar <ArrowUpRight size={13} />
          </button>
        </div>
        {nextPlans.slice(0, 2).map((e) => eventCard(e, true))}
        {!nextPlans.length && (
          <p className="muted">
            Nothing on the calendar yet. Make the first plan.
          </p>
        )}
      </section>
      <section className="rail-section">
        <div className="section-label">
          <span>GOOD PEOPLE TO KNOW</span>
          <Sparkles size={14} />
        </div>
        <p className="rail-intro">A shared interest. A new possibility.</p>
        {suggestions.slice(0, 3).map((p) => (
          <div className="person-mini" key={p.id}>
            <Avatar person={p} onClick={() => openProfile(p.id)} />
            <div>
              <button className="name-button" onClick={() => openProfile(p.id)}>
                {p.name}
              </button>
              <p>{p.headline}</p>
              <button
                className="connect-link"
                onClick={() =>
                  void act(
                    { type: "connection.request", userId: p.id },
                    "Connection request sent.",
                  )
                }
              >
                <Plus size={12} />
                Connect
              </button>
            </div>
          </div>
        ))}
        <button className="rail-link" onClick={() => navigate("people")}>
          Find your people <ArrowUpRight size={15} />
        </button>
      </section>
      <section className="daily-prompt">
        <span className="eyebrow">A LITTLE NUDGE</span>
        <span className="prompt-mark">“</span>
        <h3>What’s one thing you wish more people asked you about?</h3>
        <button
          onClick={() => {
            setIntro(true);
            setModal("compose");
          }}
        >
          Start a conversation <ArrowUpRight size={15} />
        </button>
      </section>
      <footer className="rail-footer">
        <Logo small />
        <span>
          Built for connection.
          <br />
          Made with community.
        </span>
      </footer>
    </aside>
  );
  return (
    <div className="app-shell">
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="space-rail">
        <button
          onClick={() => navigate("home")}
          aria-label="TheLoop home"
          className="brand-square"
        >
          <Logo />
        </button>
        <div className="space-divider" />
        <button
          className="space-icon selected"
          onClick={() => {
            setCalendarScope("afrotech");
            navigate("home");
          }}
          title="AfroTech community"
        >
          AF
          <span />
        </button>
        <button
          className="space-icon"
          onClick={() => {
            setCalendarScope("everyday");
            navigate("communities");
          }}
          title="Beyond the conference"
        >
          ∞
        </button>
        <button
          className="space-add"
          onClick={() => setModal("community")}
          title="Create a community"
        >
          <Plus size={21} />
        </button>
        <div className="space-bottom">
          <button
            onClick={() => setModal("interests")}
            title="Tune your loop"
            aria-label="Tune your loop"
          >
            <SlidersHorizontal size={20} />
          </button>
          <button
            onClick={() => setModal("settings")}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </aside>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="wordmark">
          TheLoop<span>STAY CLOSE. GO FURTHER.</span>
        </div>
        <button className="sidebar-search" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
          <span>Find your next thing</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-list">
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={page === id ? "active" : ""}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "chat" && (
                <b>
                  {s.channels.reduce((n, c) => n + channelUnread(s, c.id), 0) ||
                    ""}
                </b>
              )}
              {id === "people" &&
                s.connections.some(
                  (c) => c.toId === s.currentUserId && c.status === "pending",
                ) && <i className="nav-dot" />}
              {id === "inbox" &&
                (directCatalog.results.some(
                  (conversation) =>
                    Number(conversation.unreadCounts[s.currentUserId] || 0) >
                      0 &&
                    conversation.participantIds.every(
                      (uid) => !s.preferences.blockedIds.includes(uid),
                    ),
                ) ||
                  s.directMessages.some(
                    (message) =>
                      message.toId === s.currentUserId &&
                      !message.read &&
                      !s.preferences.blockedIds.includes(message.fromId),
                  )) && (
                  <i className="nav-dot" title="Unread private messages" />
                )}
            </button>
          ))}
        </div>
        <div className="section-label sidebar-label">
          <span>YOUR SPACES</span>
          <button
            aria-label="Manage subscriptions"
            onClick={() => setModal("interests")}
          >
            <Plus size={15} />
          </button>
        </div>
        <button
          className="conference-select"
          onClick={() => {
            navigate("chat");
            setChannelId("the-lobby");
          }}
        >
          <span className="conference-symbol">AF</span>
          <span>
            <strong>AfroTech community</strong>
            <small>The connection continues</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="channel-nav">
          {visibleChannels(s).map((c) => (
            <button
              key={c.id}
              className={page === "chat" && channelId === c.id ? "active" : ""}
              onClick={() => {
                setChannelId(c.id);
                setTopic("All topics");
                navigate("chat");
              }}
            >
              <Hash size={14} />
              <span>{c.name}</span>
              {subscriptionFor(s, c.id, c.conferenceId) === "muted" ? (
                <VolumeX size={12} />
              ) : (
                channelUnread(s, c.id) > 0 && <b>{channelUnread(s, c.id)}</b>
              )}
            </button>
          ))}
          <button
            className="browse-channels"
            onClick={() => setModal("interests")}
          >
            <Plus size={14} />
            Discover & tune spaces
          </button>
        </div>
        <button
          className={`saved-nav ${page === "saved" ? "active" : ""}`}
          onClick={() => navigate("saved")}
        >
          <Bookmark size={17} />
          Saved for later<span>{s.preferences.savedPostIds.length || ""}</span>
        </button>
        <div className="sidebar-bottom">
          {(role === "admin" || role === "moderator") && (
            <div className="heading-actions">
              <button
                className="button subtle small-button"
                onClick={() => setModal("moderate")}
              >
                <ShieldCheck size={13} />
                Community care
              </button>
              <button
                className="icon-button"
                title="Organizer tools"
                onClick={() => setModal("organize")}
              >
                <Plus size={16} />
              </button>
            </div>
          )}
          <div className="members-note">
            <span>GOOD COMPANY, ALL YEAR.</span>
            <p>
              Beyond the conference.
              <br />
              Always in the loop.
            </p>
            <ArrowUpRight size={22} />
          </div>
          <button
            className="my-profile"
            onClick={() => openProfile(s.currentUserId)}
          >
            <Avatar person={me} />
            <span>
              <strong>{me?.name ?? "Your profile"}</strong>
              <small>{trustLabel(me?.trust.score ?? 0)}</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Your space <span>/</span>{" "}
            <strong>
              {nav.find((n) => n[0] === page)?.[2] ??
                (page === "profile" ? "Profile" : "Saved")}
            </strong>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Show me around TheLoop" title="Show me around" onClick={() => { setModal(null); setSearchOpen(false); setTourOpen(true); }}><CircleHelp size={19}/></button>
            <ThemeSwitcher />
            {mode === "demo" && (
              <span className="preview-badge">
                <i />
                SAMPLE PREVIEW
              </span>
            )}
            <button
              className="icon-button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              <Search size={19} />
            </button>
            <button
              className="icon-button notification-bell"
              onClick={() => setModal("notifications")}
              aria-label={`Notifications, ${unread} unread`}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <button
              className="button primary small-button"
              onClick={() => {
                setIntro(false);
                setModal(page === "calendar" ? "event" : "compose");
              }}
            >
              <Plus size={16} />
              <span>Create</span>
            </button>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className={`main-content ${page === "chat" ? "chat-main" : ""}`}
        >
          {(page === "home" || page === "saved") && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {page === "saved"
                      ? "A FEW THINGS WORTH KEEPING"
                      : displayDate(new Date().toISOString(), {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        }).toUpperCase()}
                  </span>
                  <h1>
                    {page === "saved" ? (
                      "Keep the good stuff."
                    ) : (
                      <>
                        Hey {me?.name.split(" ")[0] ?? "friend"}. You’re in good
                        company<span className="period">.</span>
                      </>
                    )}
                  </h1>
                  <p>
                    {page === "saved"
                      ? "Your saved conversations, ideas, and next steps."
                      : "Less noise. More connection. A little closer to your people."}
                  </p>
                </div>
                <button
                  className="button subtle"
                  onClick={() => setModal("interests")}
                >
                  <SlidersHorizontal size={15} />
                  Tune your loop
                </button>
              </div>
              <div className="content-columns">
                <div className="feed-column">
                  {page === "home" && (
                    <section className="hero">
                      <div className="hero-rings">
                        <i />
                        <i />
                        <i />
                      </div>
                      <div className="hero-content">
                        <span className="eyebrow">
                          <span className="live-dot" /> THE NEXT CHAPTER STARTS
                          HERE
                        </span>
                        <h2>
                          The group chat.
                          <br />
                          <em>Grown up.</em>
                        </h2>
                        <p>
                          Same people. New possibilities.
                          <br />A space that moves with you.
                        </p>
                        <button onClick={() => navigate("communities")}>
                          Find your corner <ArrowUpRight size={17} />
                        </button>
                        <div className="hero-bottom">
                          <div className="avatar-stack">
                            {s.profiles.slice(1, 5).map((p) => (
                              <Avatar
                                key={p.id}
                                person={p}
                                size="tiny"
                                onClick={() => openProfile(p.id)}
                              />
                            ))}
                          </div>
                          <span>Good people. Already here.</span>
                          <span className="hero-sign">
                            IN THE LOOP, TOGETHER.
                          </span>
                        </div>
                      </div>
                    </section>
                  )}
                  {page === "home" && (
                    <>
                      <div className="feed-tabs">
                        {["For you", "Following", "My communities"].map((t) => (
                          <button
                            className={feedTab === t ? "active" : ""}
                            onClick={() => setFeedTab(t)}
                            key={t}
                          >
                            {t}
                          </button>
                        ))}
                        <button
                          className="feed-filter"
                          aria-label="Feed preferences"
                          onClick={() => setModal("interests")}
                        >
                          <SlidersHorizontal size={16} />
                        </button>
                      </div>
                      <button
                        className="composer-prompt"
                        onClick={() => {
                          setIntro(false);
                          setModal("compose");
                        }}
                      >
                        <Avatar person={me} />
                        <span>
                          Something on your mind,{" "}
                          {me?.name.split(" ")[0] ?? "friend"}?
                        </span>
                        <Plus size={20} />
                      </button>
                    </>
                  )}
                  {posts.map(postCard)}
                  {hasMore.posts && (
                    <button
                      className="button subtle"
                      onClick={() => loadMore("posts")}
                    >
                      More from your circle
                      <ChevronDown size={14} />
                    </button>
                  )}
                  {!posts.length && (
                    <Empty
                      title={
                        page === "saved"
                          ? "Good things go here."
                          : "A quieter corner of the internet."
                      }
                      body={
                        page === "saved"
                          ? "Save a post to come back to it later."
                          : "Follow someone or join a community to shape your feed."
                      }
                      action={
                        <button
                          className="button primary"
                          onClick={() => navigate("communities")}
                        >
                          Explore communities
                        </button>
                      }
                    />
                  )}
                  <div className="caught-up">
                    <Logo small />
                    <span>You’re right where you belong.</span>
                  </div>
                </div>
                {rail}
              </div>
            </>
          )}
          {page === "chat" && (
            <div className="chat-layout">
              <section className="chat-panel">
                {!activeChannel ? (
                  <Empty
                    title="This conversation isn’t in your loop."
                    body="It may be hidden by your subscriptions or no longer available. Choose what you want to follow."
                    action={
                      <button
                        className="button subtle"
                        onClick={() => setModal("interests")}
                      >
                        Manage subscriptions
                      </button>
                    }
                  />
                ) : (
                  <>
                    <header className="chat-heading">
                      <div className="channel-heading-icon">
                        <Hash size={24} />
                      </div>
                      <div>
                        <h1>{activeChannel.name}</h1>
                        <p>{activeChannel.description}</p>
                      </div>
                      <button
                        className="icon-button"
                        title="Manage channel subscription"
                        onClick={() => setModal("interests")}
                      >
                        {subscriptionFor(
                          s,
                          activeChannel.id,
                          activeChannel.conferenceId,
                        ) === "following" ? (
                          <Volume2 size={18} />
                        ) : (
                          <VolumeX size={18} />
                        )}
                      </button>
                    </header>
                    <div className="topic-tabs">
                      <button
                        aria-label="Start a new topic"
                        onClick={() => setModal("topic")}
                      >
                        <Plus size={14} />
                      </button>
                      {[
                        "All topics",
                        ...activeChannel.topics.filter(
                          (t) =>
                            subscriptionFor(
                              s,
                              `${activeChannel.id}:${t}`,
                              activeChannel.id,
                            ) !== "hidden",
                        ),
                      ].map((t) => (
                        <button
                          key={t}
                          className={topic === t ? "active" : ""}
                          onClick={() => setTopic(t)}
                        >
                          {t === "All topics" ? <Hash size={13} /> : null}
                          {t}
                        </button>
                      ))}
                    </div>
                    <div
                      className="message-list"
                      ref={messageList}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        pinnedToBottom.current =
                          el.scrollHeight - el.scrollTop - el.clientHeight < 90;
                      }}
                    >
                      {history.hasMore && (
                        <button
                          className="button subtle history-button"
                          disabled={history.loading}
                          onClick={() => void earlierMessages()}
                        >
                          {history.loading
                            ? "Finding the earlier conversation…"
                            : "Earlier in the conversation"}
                          <ChevronDown size={14} />
                        </button>
                      )}
                      {!activeMessages.length && (
                        <div className="chat-welcome">
                          <span>{activeChannel.icon}</span>
                          <h2>Good conversations start with a hello.</h2>
                          <p>
                            You’re in #{activeChannel.name}. Find a topic, find
                            your people.
                          </p>
                          <small>
                            Choose what you follow. Everything else stays quiet.
                          </small>
                        </div>
                      )}
                      {activeMessages.map((m) => (
                        <article className="message" key={m.id}>
                          <Avatar
                            person={participant(
                              m.authorId,
                              m.authorName,
                              m.authorInitials,
                            )}
                            onClick={() => openProfile(m.authorId)}
                          />
                          <div className="message-content">
                            <header>
                              <button
                                className="name-button"
                                onClick={() => openProfile(m.authorId)}
                              >
                                {
                                  participant(
                                    m.authorId,
                                    m.authorName,
                                    m.authorInitials,
                                  ).name
                                }
                              </button>
                              <time>
                                {displayDate(m.createdAt, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </time>
                              <button
                                className="topic-label"
                                onClick={() => setTopic(m.topic)}
                              >
                                {m.topic}
                              </button>
                            </header>
                            {m.replyTo && (
                              <div className="reply-preview">
                                ↳ {quotedMessage(m.replyTo)}
                              </div>
                            )}
                            <p>{m.body}</p>
                            {m.image && (
                              <ProtectedImage image={m.image} alt={m.body} />
                            )}
                            <div className="reactions">
                              {Object.entries(m.reactions)
                                .filter(([, ids]) => ids.length)
                                .map(([emoji, ids]) => (
                                  <button
                                    className={
                                      ids.includes(s.currentUserId)
                                        ? "selected"
                                        : ""
                                    }
                                    key={emoji}
                                    onClick={() =>
                                      void act({
                                        type: "message.react",
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
                                title="React with heart"
                                onClick={() =>
                                  void act({
                                    type: "message.react",
                                    messageId: m.id,
                                    emoji: "🖤",
                                  })
                                }
                              >
                                <Heart size={13} />
                                <Plus size={10} />
                              </button>
                              <button
                                title="Reply in topic"
                                onClick={() => {
                                  setTopic(m.topic);
                                  setReplyTo(m.id);
                                  (
                                    document.getElementById(
                                      "chat-body",
                                    ) as HTMLTextAreaElement
                                  )?.focus();
                                }}
                              >
                                Reply
                              </button>
                              {m.authorId === s.currentUserId && (
                                <>
                                  <button
                                    title="Edit your message"
                                    onClick={() =>
                                      showContent(
                                        { kind: "message", message: m },
                                        "edit",
                                      )
                                    }
                                  >
                                    Edit
                                  </button>
                                  <button
                                    title="Delete your message"
                                    onClick={() =>
                                      showContent(
                                        { kind: "message", message: m },
                                        "delete",
                                      )
                                    }
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                              <button
                                className="message-report"
                                title="Report message"
                                onClick={() => {
                                  setReportTarget({
                                    id: m.id,
                                    type: "message",
                                  });
                                  setModal("report");
                                }}
                              >
                                <Flag size={12} />
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <form
                      key={`${s.currentUserId}:${activeChannel.id}`}
                      className="chat-composer"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (pending > 0 || chatImage.busy) return;
                        const form = e.currentTarget;
                        const f = new FormData(form);
                        const uploaded = await chatImage.prepare();
                        if (!uploaded.ok || !form.isConnected) return;
                        if (
                          await act({
                            type: "message.send",
                            channelId: activeChannel.id,
                            topic: String(f.get("topic")),
                            body: String(f.get("body")),
                            ...(uploaded.imageId
                              ? { imageId: uploaded.imageId }
                              : {}),
                            ...(replyTo ? { replyTo } : {}),
                          })
                        ) {
                          if (!form.isConnected) return;
                          const field = form.elements.namedItem(
                            "body",
                          ) as HTMLTextAreaElement;
                          if (field.value === String(f.get("body")))
                            field.value = "";
                          chatImage.clear();
                          setReplyTo((current) =>
                            current === replyTo ? null : current,
                          );
                        }
                      }}
                    >
                      <div className="composer-topic">
                        {replyTo && (
                          <div className="reply-preview">
                            Replying to{" "}
                            {person(
                              s.messages.find((m) => m.id === replyTo)
                                ?.authorId ?? "",
                            )?.name ?? "a message"}
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Cancel reply"
                              onClick={() => setReplyTo(null)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                        <Hash size={13} />
                        <select
                          name="topic"
                          value={
                            topic === "All topics"
                              ? activeChannel.topics[0]
                              : topic
                          }
                          onChange={(e) => setTopic(e.target.value)}
                        >
                          {activeChannel.topics.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        <span>Messages stay in their topic.</span>
                      </div>
                      <ImageComposer value={chatImage} disabled={pending > 0} />
                      <textarea
                        id="chat-body"
                        name="body"
                        required
                        maxLength={4000}
                        placeholder={`Say something in #${activeChannel.name}…`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                      <footer>
                        <span>Be kind. Be curious. Be you.</span>
                        <button
                          className="send-button"
                          disabled={pending > 0 || chatImage.busy}
                          aria-label="Send message"
                        >
                          <Send size={17} />
                        </button>
                      </footer>
                    </form>
                  </>
                )}
              </section>
              <aside className="chat-details">
                <span className="eyebrow">IN THIS CORNER</span>
                <h2>
                  Make yourself
                  <br />
                  at home.
                </h2>
                <p>
                  Follow the conversations that matter to you. Your attention
                  belongs to you.
                </p>
                <button
                  className="button subtle"
                  onClick={() => setModal("interests")}
                >
                  <SlidersHorizontal size={15} />
                  Manage subscriptions
                </button>
                <hr />
                <div className="section-label">
                  <span>TOPICS</span>
                  <Hash size={14} />
                </div>
                {activeChannel?.topics.map((t) => (
                  <div className="topic-setting" key={t}>
                    <button onClick={() => setTopic(t)}>{t}</button>
                    <select
                      aria-label={`Subscription for ${t}`}
                      value={subscriptionFor(
                        s,
                        `${activeChannel.id}:${t}`,
                        activeChannel.id,
                      )}
                      onChange={(e) =>
                        void act({
                          type: "subscription.set",
                          targetId: `${activeChannel.id}:${t}`,
                          value: e.target.value as Subscription,
                        })
                      }
                    >
                      <option value="following">Follow</option>
                      <option value="muted">Mute</option>
                      <option value="hidden">Hide</option>
                    </select>
                  </div>
                ))}
                <hr />
                <span className="eyebrow">THE NEXT HELLO</span>
                {nextPlans.slice(0, 1).map((e) => eventCard(e, true))}
              </aside>
            </div>
          )}
          {page === "communities" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    SMALLER CIRCLES. STRONGER CONNECTIONS.
                  </span>
                  <h1>Find your corner.</h1>
                  <p>Big interests deserve a little space of their own.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("community")}
                >
                  <Plus size={16} />
                  Start a community
                </button>
              </div>
              <div className="community-tabs">
                <button
                  className={communityId === "all" ? "active" : ""}
                  onClick={() => setCommunityId("all")}
                >
                  Explore all
                </button>
                {s.communities.map((c) => (
                  <button
                    className={communityId === c.id ? "active" : ""}
                    key={c.id}
                    onClick={() => setCommunityId(c.id)}
                  >
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
              {communityId === "all" ? (
                <div className="community-grid">
                  {s.communities.map((c, i) => (
                    <article className="community-card" key={c.id}>
                      <div className={`community-art art-${i}`}>
                        <span>{c.icon}</span>
                        <small>L / {String(i + 1).padStart(2, "0")}</small>
                      </div>
                      <div>
                        <span className="eyebrow">l/{c.slug}</span>
                        <h2>
                          <button onClick={() => setCommunityId(c.id)}>
                            {c.name}
                          </button>
                        </h2>
                        <p>{c.description}</p>
                        <footer>
                          <span>
                            <Users size={13} />
                            {c.members.toLocaleString()} members
                          </span>
                          <button
                            className={`button small-button ${s.preferences.joinedCommunityIds.includes(c.id) ? "subtle" : "primary"}`}
                            onClick={() =>
                              void act({
                                type: "community.join",
                                communityId: c.id,
                              })
                            }
                          >
                            {s.preferences.joinedCommunityIds.includes(c.id) ? (
                              <>
                                <Check size={13} />
                                Joined
                              </>
                            ) : (
                              <>
                                Join circle
                                <Plus size={13} />
                              </>
                            )}
                          </button>
                        </footer>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="content-columns">
                  <div className="feed-column">
                    <div className="community-banner">
                      <span>{activeCommunity?.icon}</span>
                      <h2>{activeCommunity?.name}</h2>
                      <p>{activeCommunity?.description}</p>
                      <button
                        className="button primary"
                        onClick={() =>
                          void act({ type: "community.join", communityId })
                        }
                      >
                        {s.preferences.joinedCommunityIds.includes(communityId)
                          ? "Leave community"
                          : "Join this community"}
                      </button>
                    </div>
                    <button
                      className="composer-prompt"
                      onClick={() => setModal("compose")}
                    >
                      <Avatar person={me} />
                      <span>Start something good.</span>
                      <Plus size={20} />
                    </button>
                    {posts.map(postCard)}
                    {!posts.length && (
                      <Empty
                        title="Be the first to say hello."
                        body="Every great community starts with a conversation."
                      />
                    )}
                  </div>
                  <aside className="right-rail">
                    <section className="rail-section">
                      <span className="eyebrow">HOW WE SHOW UP</span>
                      <h3>A little care goes a long way.</h3>
                      {activeCommunity?.rules.map((r, i) => (
                        <p key={r} className="community-rule">
                          <b>{String(i + 1).padStart(2, "0")}</b>
                          {r}
                        </p>
                      ))}
                    </section>
                    {rail.props.children?.[2]}
                  </aside>
                </div>
              )}
            </>
          )}
          {page === "calendar" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MAKE PLANS. MAKE MEMORIES.</span>
                  <h1>Something to look forward to.</h1>
                  <p>
                    From the main stage to the coffee after. Keep your plans in
                    one place.
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button subtle"
                    onClick={() => setModal("guide")}
                  >
                    <Globe size={15} />
                    AfroTech guide
                    <ArrowUpRight size={14} />
                  </button>
                  <button
                    className="button subtle"
                    onClick={() => setModal("import")}
                  >
                    <Download size={15} />
                    Import CSV
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setModal("event")}
                  >
                    <Plus size={16} />
                    Make a plan
                  </button>
                </div>
              </div>
              <div className="calendar-toolbar">
                <div className="community-tabs">
                  <button
                    className={calendarScope === "all" ? "active" : ""}
                    onClick={() => setCalendarScope("all")}
                  >
                    <Globe size={14} />
                    All events
                  </button>
                  <button
                    className={calendarScope === "mine" ? "active" : ""}
                    onClick={() => setCalendarScope("mine")}
                  >
                    My plans
                  </button>
                  {s.conferences.map((c) => (
                    <button
                      className={calendarScope === c.id ? "active" : ""}
                      onClick={() => setCalendarScope(c.id)}
                      key={c.id}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="calendar-box">
                <header>
                  <h2>
                    {month.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <div>
                    <button
                      className="icon-button"
                      aria-label="Previous month"
                      onClick={() =>
                        setMonth(
                          new Date(
                            month.getFullYear(),
                            month.getMonth() - 1,
                            1,
                          ),
                        )
                      }
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="button subtle small-button"
                      onClick={() => setMonth(new Date())}
                    >
                      Today
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Next month"
                      onClick={() =>
                        setMonth(
                          new Date(
                            month.getFullYear(),
                            month.getMonth() + 1,
                            1,
                          ),
                        )
                      }
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </header>
                <div className="calendar-grid">
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                    (d) => (
                      <div className="weekday" key={d}>
                        {d}
                      </div>
                    ),
                  )}
                  {Array.from(
                    {
                      length:
                        Math.ceil(
                          (new Date(
                            month.getFullYear(),
                            month.getMonth(),
                            1,
                          ).getDay() +
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              0,
                            ).getDate()) /
                            7,
                        ) * 7,
                    },
                    (_, i) => {
                      const day = new Date(
                        month.getFullYear(),
                        month.getMonth(),
                        i -
                          new Date(
                            month.getFullYear(),
                            month.getMonth(),
                            1,
                          ).getDay() +
                          1,
                      );
                      const inMonth = day.getMonth() === month.getMonth();
                      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                      const events = s.events.filter(
                        (e) =>
                          (calendarScope === "all" ||
                            (calendarScope === "mine"
                              ? e.attendeeIds.includes(s.currentUserId) ||
                                e.waitlistIds.includes(s.currentUserId)
                              : e.conferenceId === calendarScope)) &&
                          new Intl.DateTimeFormat("en-CA", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            timeZone: e.timezone,
                          }).format(new Date(e.startAt)) === date,
                      );
                      return (
                        <div
                          key={i}
                          className={`calendar-day ${!inMonth ? "outside" : ""} ${day.toDateString() === new Date().toDateString() ? "today" : ""}`}
                        >
                          <span>{day.getDate()}</span>
                          {events.map((e) => (
                            <button
                              key={e.id}
                              onClick={() => setEventDetail(e.id)}
                            >
                              <i />
                              {e.title}
                            </button>
                          ))}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
              <div className="section-label event-list-heading">
                <span>ON THE HORIZON</span>
                <small>Times shown in each event’s timezone</small>
              </div>
              <div className="events-grid">
                {s.events
                  .filter(
                    (e) =>
                      calendarScope === "all" ||
                      (calendarScope === "mine"
                        ? e.attendeeIds.includes(s.currentUserId) ||
                          e.waitlistIds.includes(s.currentUserId)
                        : e.conferenceId === calendarScope),
                  )
                  .sort((a, b) => a.startAt.localeCompare(b.startAt))
                  .map((e) => (
                    <div id={`event-${e.id}`} key={e.id}>
                      {eventCard(e)}
                    </div>
                  ))}
              </div>
            </>
          )}
          {page === "people" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR NEXT GOOD CONVERSATION</span>
                  <h1>Good people find good people.</h1>
                  <p>A shared interest is just the beginning.</p>
                </div>
                <span className="count-pill">
                  <Users size={15} />A community of possibilities
                </span>
              </div>
              <div className="people-search">
                <Search size={19} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people, skills, companies, or cities"
                  aria-label="Search members"
                />
                <SlidersHorizontal size={18} />
              </div>
              {s.connections.filter(
                (c) => c.toId === s.currentUserId && c.status === "pending",
              ).length > 0 && (
                <section className="requests">
                  <div className="section-label">
                    <span>YOUR CIRCLE IS GROWING</span>
                  </div>
                  {s.connections
                    .filter(
                      (c) =>
                        c.toId === s.currentUserId && c.status === "pending",
                    )
                    .map((c) => (
                      <div key={c.id}>
                        <Avatar
                          person={person(c.fromId)}
                          onClick={() => openProfile(c.fromId)}
                        />
                        <p>
                          <strong>{person(c.fromId)?.name}</strong>
                          <span>would like to connect</span>
                        </p>
                        <button
                          className="button primary small-button"
                          onClick={() =>
                            void act(
                              {
                                type: "connection.respond",
                                connectionId: c.id,
                                accept: true,
                              },
                              "A new connection. Say hello!",
                            )
                          }
                        >
                          Accept
                          <Check size={13} />
                        </button>
                        <button
                          className="icon-button"
                          title="Decline request"
                          onClick={() =>
                            void act({
                              type: "connection.respond",
                              connectionId: c.id,
                              accept: false,
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                </section>
              )}
              <div className="people-grid">
                {directoryPeople.map((p) => {
                  const isConnected = connected(s, p.id),
                    requested = s.connections.some(
                      (c) =>
                        c.status === "pending" &&
                        [c.fromId, c.toId].includes(s.currentUserId) &&
                        [c.fromId, c.toId].includes(p.id),
                    );
                  return (
                    <article className="person-card" key={p.id}>
                      <div className="person-card-top">
                        <Avatar
                          person={p}
                          size="large"
                          onClick={() => openProfile(p.id)}
                        />
                        <span className="trust-pill">
                          <ShieldCheck size={12} />
                          {p.trust.score}
                        </span>
                      </div>
                      <button
                        className="person-title"
                        onClick={() => openProfile(p.id)}
                      >
                        {p.name}
                        {p.verified && <ShieldCheck size={15} />}
                      </button>
                      <p>{p.headline}</p>
                      <span className="person-location">
                        <MapPin size={12} />
                        {p.location}
                      </span>
                      <div className="tags">
                        {p.interests.slice(0, 3).map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                      <div className="match-note">
                        <Sparkles size={12} />
                        {
                          p.interests.filter((i) =>
                            s.preferences.interests.includes(i),
                          ).length
                        }{" "}
                        shared interests
                      </div>
                      <footer>
                        <button
                          className={`button ${isConnected ? "subtle" : "primary"} small-button`}
                          disabled={requested}
                          onClick={() =>
                            isConnected
                              ? (setDmId(p.id), navigate("inbox"))
                              : void act(
                                  {
                                    type: "connection.request",
                                    userId: p.id,
                                  },
                                  "Connection request sent.",
                                )
                          }
                        >
                          {isConnected ? (
                            <>
                              <MessageCircle size={14} />
                              Say hello
                            </>
                          ) : requested ? (
                            "Request sent"
                          ) : (
                            <>
                              <UserPlus size={14} />
                              Connect
                            </>
                          )}
                        </button>
                        <button
                          className={`icon-button ${s.preferences.followingIds.includes(p.id) ? "selected" : ""}`}
                          onClick={() =>
                            void act({ type: "profile.follow", userId: p.id })
                          }
                          title={
                            s.preferences.followingIds.includes(p.id)
                              ? "Unfollow"
                              : "Follow"
                          }
                        >
                          <Heart size={17} />
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
              {directory.loading && (
                <p className="directory-status" role="status">
                  Finding your people…
                </p>
              )}
              {!directory.loading && !directoryPeople.length && (
                <Empty
                  title="Your people are out there."
                  body={
                    query
                      ? "Try another name, role, skill, or interest."
                      : "The directory is quiet for now. Invite a connection to join."
                  }
                />
              )}
              {directory.hasMore && (
                <button
                  className="button subtle directory-more"
                  disabled={directory.loading}
                  onClick={loadMoreDirectory}
                >
                  Meet more people
                  <ArrowDown size={15} />
                </button>
              )}
            </>
          )}
          {page === "profile" &&
            (() => {
              const p = person(profileId) || (profileId ? undefined : me);
              if (!p)
                return (
                  <Empty
                    title="This profile isn’t available."
                    body="The member may keep their profile private. Please try again later."
                  />
                );
              const mine = p.id === s.currentUserId;
              return (
                <>
                  <div className="profile-cover">
                    <div className="hero-rings">
                      <i />
                      <i />
                      <i />
                    </div>
                    <span>GOOD PEOPLE. REAL CONNECTION.</span>
                    <Logo />
                  </div>
                  <div className="profile-top">
                    <Avatar person={p} size="large" />
                    <div className="profile-actions">
                      {mine ? (
                        <button
                          className="button subtle"
                          onClick={() => setModal("settings")}
                        >
                          <Settings size={15} />
                          Edit your profile
                        </button>
                      ) : (
                        <>
                          <button
                            className="button primary"
                            onClick={() =>
                              void act(
                                { type: "connection.request", userId: p.id },
                                "Connection request sent.",
                              )
                            }
                            disabled={s.connections.some(
                              (c) =>
                                [c.fromId, c.toId].includes(p.id) &&
                                [c.fromId, c.toId].includes(s.currentUserId),
                            )}
                          >
                            <UserPlus size={15} />
                            {connected(s, p.id) ? "Connected" : "Connect"}
                          </button>
                          <button
                            className="button subtle"
                            onClick={() => {
                              setDmId(p.id);
                              navigate("inbox");
                            }}
                          >
                            <MessageCircle size={15} />
                            Message
                          </button>
                          <button
                            className="icon-button"
                            title="Block member"
                            onClick={() =>
                              void act(
                                { type: "profile.block", userId: p.id },
                                s.preferences.blockedIds.includes(p.id)
                                  ? "Member unblocked."
                                  : "Member blocked. Their content is hidden.",
                              )
                            }
                          >
                            <X size={17} />
                          </button>
                        </>
                      )}
                    </div>
                    <h1>
                      {p.name} {p.verified && <ShieldCheck size={23} />}
                    </h1>
                    <p>{p.headline}</p>
                    <div className="profile-counts">
                      <button
                        disabled={!mine}
                        onClick={() => {
                          setFollowerMode("followers");
                          setModal("followers");
                        }}
                      >
                        <strong>{p.followerCount ?? 0}</strong> followers
                      </button>
                      <button
                        disabled={!mine}
                        onClick={() => {
                          setFollowerMode("following");
                          setModal("followers");
                        }}
                      >
                        <strong>{p.followingCount ?? 0}</strong> following
                      </button>
                      <span>
                        <strong>
                          {
                            s.connections.filter(
                              (c) =>
                                c.status === "accepted" &&
                                [c.fromId, c.toId].includes(p.id),
                            ).length
                          }
                        </strong>{" "}
                        connections in your circle
                      </span>
                    </div>
                    <span>
                      <MapPin size={14} />
                      {p.location}
                      <b>·</b>
                      {p.company}
                    </span>
                  </div>
                  <div className="profile-columns">
                    <section>
                      <div className="profile-section">
                        <span className="eyebrow">A LITTLE ABOUT ME</span>
                        <p>
                          {p.bio ||
                            "Your story belongs here. Add a little about yourself."}
                        </p>
                      </div>
                      <div className="profile-section">
                        <span className="eyebrow">
                          WHAT I BRING TO THE TABLE
                        </span>
                        <div className="tags">
                          {p.skills.map((skill) => (
                            <span key={skill}>{skill}</span>
                          ))}
                        </div>
                      </div>
                      <div className="profile-section">
                        <span className="eyebrow">ALWAYS OPEN TO</span>
                        <div className="open-to">
                          {p.openTo.map((t) => (
                            <span key={t}>
                              <ArrowUpRight size={15} />
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="profile-section">
                        <span className="eyebrow">
                          ELSEWHERE ON THE INTERNET
                        </span>
                        {p.links.length ? (
                          p.links.map((l) => (
                            <a
                              key={l.url}
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              className="profile-link"
                            >
                              <LinkIcon size={15} />
                              {l.label}
                              <ExternalLink size={13} />
                            </a>
                          ))
                        ) : (
                          <p className="muted">
                            Add your LinkedIn, portfolio, GitHub, or other
                            social links.
                          </p>
                        )}
                      </div>
                    </section>
                    <aside>
                      <div className="trust-card">
                        <ShieldCheck size={28} />
                        <span className="eyebrow">COMMUNITY TRUST</span>
                        <strong>
                          {p.trust.score}
                          <small>/100</small>
                        </strong>
                        <h3>{trustLabel(p.trust.score)}</h3>
                        <p>Earned through how you show up. Never purchased.</p>
                        {p.trust.reasons.map((r) => (
                          <span className="trust-reason" key={r}>
                            <Check size={13} />
                            {r}
                          </span>
                        ))}
                        <small>
                          {mode === "demo"
                            ? "Sample score for this fictional profile."
                            : "Scores reflect capped, server-verified participation signals."}
                        </small>
                        <button
                          className="text-button"
                          onClick={() => {
                            setReportTarget({ id: p.id, type: "profile" });
                            setModal(
                              mine && mode === "live" ? "appeal" : "report",
                            );
                          }}
                        >
                          Ask for a review or report a concern{" "}
                          <ArrowUpRight size={12} />
                        </button>
                      </div>
                    </aside>
                  </div>
                </>
              );
            })()}
          {page === "squads" && (
            <Squads
              key={`${s.currentUserId}:${squadId}`}
              selectedId={squadId}
              select={setSquadId}
              openProfile={openProfile}
              run={act}
              report={(target) => {
                setReportTarget(target);
                setModal("report");
              }}
            />
          )}
          {page === "inbox" && (
            <DirectInbox
              key={`${s.currentUserId}:${dmId}`}
              peerId={dmId}
              select={setDmId}
              openProfile={openProfile}
              meetPeople={() => navigate("people")}
              run={act}
              showContent={showContent}
              report={(target) => {
                setReportTarget(target);
                setModal("report");
              }}
            />
          )}
        </main>
        <footer className="workspace-footer">
          <span>THE LOOP © {new Date().getFullYear()}</span>
          <span>
            {mode === "demo"
              ? "Fictional sample community · live Guide listings show their source."
              : "Your attention belongs to you."}
          </span>
          <button onClick={() => setModal("settings")}>
            Privacy & preferences
          </button>
        </footer>
      </div>
      <nav className="mobile-primary-nav" aria-label="Main navigation">
        <button className={page === "chat" ? "active" : ""} aria-current={page === "chat" ? "page" : undefined} onClick={() => navigate("chat")}><MessageCircle size={21}/><span>Group chats</span></button>
        <button className={page === "home" ? "active" : ""} aria-current={page === "home" ? "page" : undefined} onClick={() => navigate("home")}><Home size={21}/><span>Your loop</span></button>
        <button className={page === "calendar" ? "active" : ""} aria-current={page === "calendar" ? "page" : undefined} onClick={() => navigate("calendar")}><CalendarDays size={21}/><span>Calendar</span></button>
        <button className={page === "inbox" ? "active" : ""} aria-current={page === "inbox" ? "page" : undefined} onClick={() => navigate("inbox")}><Mail size={21}/><span>Inbox</span></button>
        <button aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Menu size={21}/><span>More</span></button>
      </nav>
      {tourOpen && <Tutorial navigate={navigate} tune={() => setModal("interests")} close={() => setTourOpen(false)}/>}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button onClick={clearError} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      {searchOpen && !tourOpen && (
        <ModalShell
          title="Find your next thing."
          subtitle="People, communities, channels, and plans."
          close={() => {
            setSearchOpen(false);
            setQuery("");
          }}
        >
          <div className="search-modal">
            <div className="people-search">
              <Search size={18} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your loop…"
                aria-label="Search all content"
              />
            </div>
            {query.length > 1 ? (
              <div className="search-results">
                {directory.results
                  .filter((p) => !s.preferences.blockedIds.includes(p.id))
                  .slice(0, 5)
                  .map((p) => (
                    <button key={p.id} onClick={() => openProfile(p.id)}>
                      <Avatar person={p} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.headline}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                {directory.loading && (
                  <p className="directory-status" role="status">
                    Looking for people…
                  </p>
                )}
                {visibleChannels(s)
                  .filter((c) =>
                    `${c.name} ${c.description}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setChannelId(c.id);
                        setTopic("All topics");
                        navigate("chat");
                      }}
                    >
                      <Hash size={20} />
                      <span>
                        {c.name}
                        <small>Conversation</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                {s.posts
                  .filter(
                    (p) =>
                      `${p.title} ${p.body}`
                        .toLowerCase()
                        .includes(query.toLowerCase()) &&
                      !s.preferences.blockedIds.includes(p.authorId),
                  )
                  .slice(0, 5)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSearchOpen(false);
                        setQuery("");
                        setPostDetail(p.id);
                      }}
                    >
                      <MessageCircle size={20} />
                      <span>
                        {p.title}
                        <small>Community post</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                {s.events
                  .filter((e) =>
                    `${e.title} ${e.location}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        navigate("calendar");
                        setCalendarScope(e.conferenceId);
                      }}
                    >
                      <CalendarDays size={20} />
                      <span>
                        {e.title}
                        <small>{e.location}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
              </div>
            ) : (
              <div className="search-hint">
                <Sparkles size={22} />
                <p>Your next good connection might be one search away.</p>
              </div>
            )}
          </div>
        </ModalShell>
      )}
      {modal === "compose" && (
        <ModalShell
          title="Start something good."
          subtitle="An idea, a win, a question. Your people are listening."
          close={() => setModal(null)}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pending > 0 || composeImage.busy) return;
              const f = new FormData(e.currentTarget);
              const uploaded = await composeImage.prepare();
              if (!uploaded.ok) return;
              const options = String(f.get("options") ?? "")
                .split("\n")
                .filter(Boolean);
              if (
                await act(
                  {
                    type: "post.create",
                    communityId: String(f.get("communityId")),
                    title: String(f.get("title")),
                    body: String(f.get("body")),
                    ...(uploaded.imageId ? { imageId: uploaded.imageId } : {}),
                    kind: String(f.get("kind")) as Post["kind"],
                    tags: String(f.get("tags") ?? "")
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                    ...(String(f.get("url") ?? "")
                      ? { url: String(f.get("url")) }
                      : {}),
                    ...(options.length ? { options } : {}),
                  },
                  "Your conversation is in the loop.",
                )
              ) {
                setModal(null);
                composeImage.clear();
                setIntro(false);
              }
            }}
          >
            <div className="form-row">
              <Field label="Your community">
                <select
                  name="communityId"
                  value={composeCommunityId}
                  onChange={(e) => setComposeCommunityId(e.currentTarget.value)}
                >
                  {s.communities
                    .filter((c) =>
                      s.preferences.joinedCommunityIds.includes(c.id),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="What are you sharing?">
                <select
                  name="kind"
                  value={composeKind}
                  onChange={(e) =>
                    setComposeKind(e.target.value as Post["kind"])
                  }
                >
                  <option value="discussion">A conversation</option>
                  <option value="win">A little win</option>
                  <option value="opportunity">An opportunity</option>
                  <option value="poll">A poll</option>
                  <option value="link">A shared link</option>
                </select>
              </Field>
            </div>
            <Field label="Give it a good opening">
              <input
                name="title"
                required
                maxLength={180}
                placeholder="What is on your mind?"
                defaultValue={
                  intro
                    ? "What’s one thing you wish more people asked you about?"
                    : ""
                }
              />
            </Field>
            <Field label="The rest of the story">
              <textarea
                name="body"
                required
                maxLength={10000}
                rows={5}
                placeholder="A little context goes a long way…"
              />
            </Field>
            {composeKind === "poll" && (
              <Field label="Poll choices, one per line">
                <textarea
                  name="options"
                  rows={2}
                  placeholder="Coffee and conversation&#10;Dinner with the crew"
                />
              </Field>
            )}
            <div className="form-row">
              <Field label="Tags, separated by commas">
                <input name="tags" placeholder="Community, Technology" />
              </Field>
              {composeKind === "link" && (
                <Field label="Shared link">
                  <input
                    name="url"
                    type="url"
                    placeholder="https://…"
                    required
                  />
                </Field>
              )}
            </div>
            <ImageComposer value={composeImage} disabled={pending > 0} />
            <footer>
              <span>Show up with care. Make room for others.</span>
              <button
                className="button primary"
                disabled={
                  pending > 0 ||
                  composeImage.busy ||
                  !s.preferences.joinedCommunityIds.length
                }
              >
                Share with the circle
                <ArrowUpRight size={16} />
              </button>
            </footer>
            {!s.preferences.joinedCommunityIds.length && (
              <p className="form-error">Join a community before posting.</p>
            )}
          </form>
        </ModalShell>
      )}
      {modal === "community" && (
        <ModalShell
          title="Make a little room."
          subtitle="Start a circle around something you care about."
          close={() => setModal(null)}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await act(
                  {
                    type: "community.create",
                    name: String(f.get("name")),
                    description: String(f.get("description")),
                  },
                  "Your circle is ready. Make the first introduction.",
                )
              ) {
                setModal(null);
                navigate("communities");
                setCommunityId("all");
              }
            }}
          >
            <Field label="Community name">
              <input
                name="name"
                required
                maxLength={60}
                placeholder="The idea you keep coming back to"
              />
            </Field>
            <Field label="What brings you together?">
              <textarea name="description" rows={4} required maxLength={500} />
            </Field>
            <div className="callout">
              <ShieldCheck size={19} />
              <p>
                You’ll be the first moderator. Set the tone with care, clear
                expectations, and room for other perspectives.
              </p>
            </div>
            <button className="button primary" disabled={pending > 0}>
              Create your circle
              <Plus size={15} />
            </button>
          </form>
        </ModalShell>
      )}
      {modal === "event" && (
        <EventEditor
          close={() => setModal(null)}
          saved={() => navigate("calendar")}
          submit={(event) =>
            act(
              { type: "event.create", event },
              "A good plan is in the calendar.",
            )
          }
        />
      )}
      {modal === "interests" && (
        <ModalShell
          title="A loop that feels like you."
          subtitle="Follow what matters. Mute the rest. Hide it if you need the space."
          close={() => setModal(null)}
          wide
        >
          <div className="modal-form">
            <span className="eyebrow">YOUR INTERESTS</span>
            <div className="interest-chips">
              {interests.map((i) => (
                <button
                  className={
                    s.preferences.interests.includes(i) ? "selected" : ""
                  }
                  key={i}
                  onClick={() =>
                    void act({
                      type: "onboarding.complete",
                      interests: s.preferences.interests.includes(i)
                        ? s.preferences.interests.filter((x) => x !== i)
                        : [...s.preferences.interests, i],
                      channelIds: [],
                    })
                  }
                >
                  {s.preferences.interests.includes(i) ? (
                    <Check size={13} />
                  ) : (
                    <Plus size={13} />
                  )}{" "}
                  {i}
                </button>
              ))}
            </div>
            <div className="subscription-legend">
              <span>
                <Volume2 size={14} />
                <b>Follow</b> stays in your loop
              </span>
              <span>
                <VolumeX size={14} />
                <b>Mute</b> stays quiet
              </span>
              <span>
                <X size={14} />
                <b>Hide</b> leaves your view
              </span>
            </div>
            {s.conferences.map((conf) => (
              <section className="subscription-section" key={conf.id}>
                <div className="conference-default">
                  <h3>{conf.name}</h3>
                  <select
                    aria-label={`Default subscription for ${conf.name}`}
                    value={s.preferences.subscriptions[conf.id] ?? "muted"}
                    onChange={(e) =>
                      void act({
                        type: "subscription.set",
                        targetId: conf.id,
                        value: e.target.value as Subscription,
                      })
                    }
                  >
                    <option value="following">Follow by default</option>
                    <option value="muted">Mute by default</option>
                    <option value="hidden">Hide by default</option>
                  </select>
                </div>
                <p className="subscription-note">
                  Each channel choice below takes priority over the conference
                  default.
                </p>
                {s.channels
                  .filter((c) => c.conferenceId === conf.id)
                  .map((c) => (
                    <div className="subscription-row" key={c.id}>
                      <span className="subscription-icon">{c.icon}</span>
                      <div>
                        <strong>{c.name}</strong>
                        <p>{c.description}</p>
                      </div>
                      <select
                        aria-label={`Subscription for ${c.name}`}
                        value={subscriptionFor(s, c.id, c.conferenceId)}
                        onChange={(e) =>
                          void act({
                            type: "subscription.set",
                            targetId: c.id,
                            value: e.target.value as Subscription,
                          })
                        }
                      >
                        <option value="following">Following</option>
                        <option value="muted">Muted</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </div>
                  ))}
              </section>
            ))}
            <label className="switch-row">
              <span>
                <strong>Show only followed channels</strong>
                <small>A little less noise in your sidebar.</small>
              </span>
              <input
                type="checkbox"
                checked={s.preferences.hideUnsubscribed}
                onChange={(e) =>
                  void act({
                    type: "preferences.update",
                    preferences: { hideUnsubscribed: e.target.checked },
                  })
                }
              />
            </label>
            <button
              className="button primary"
              onClick={() => {
                void act({
                  type: "onboarding.complete",
                  interests: s.preferences.interests,
                  channelIds: [],
                });
                setModal(null);
              }}
            >
              Looks like my kind of loop
              <Check size={16} />
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "notifications" && (
        <ModalShell
          title="You’re in the loop."
          subtitle="A few things worth your attention."
          close={() => setModal(null)}
        >
          <div className="modal-form">
            <button
              className="text-button"
              onClick={() =>
                void act({ type: "notification.read" }, "All caught up.")
              }
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
            {myNotifications.map((n) => (
              <button
                className={`notification-item ${!n.read ? "unread" : ""}`}
                key={n.id}
                onClick={() => {
                  void act({ type: "notification.read", notificationId: n.id });
                  setModal(null);
                  if (n.kind === "connection") navigate("people");
                  else if (n.kind === "event") {
                    navigate("calendar");
                    setEventDetail(n.targetId);
                  } else if (n.kind === "squad") {
                    setSquadId(
                      s.squads.some(
                        (g) =>
                          g.id === n.targetId &&
                          g.memberIds.includes(s.currentUserId),
                      )
                        ? n.targetId
                        : "",
                    );
                    navigate("squads");
                  } else if (n.kind === "community") {
                    setPostDetail(n.targetId);
                  } else if (s.channels.some((c) => c.id === n.targetId)) {
                    setChannelId(n.targetId);
                    setTopic("All topics");
                    navigate("chat");
                  } else if (s.profiles.some((p) => p.id === n.targetId)) {
                    setDmId(n.targetId);
                    navigate("inbox");
                  } else navigate("chat");
                }}
              >
                <span className="notification-symbol">
                  {n.kind === "event" ? (
                    <CalendarDays size={20} />
                  ) : n.kind === "connection" ? (
                    <UserPlus size={20} />
                  ) : (
                    <MessageCircle size={20} />
                  )}
                </span>
                <span>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{displayDate(n.createdAt)}</small>
                </span>
                {!n.read && <i />}
              </button>
            ))}
            {!myNotifications.length && (
              <Empty
                title="A little peace and quiet."
                body="Your notifications will show up here."
              />
            )}
          </div>
        </ModalShell>
      )}
      {modal === "settings" && (
        <ModalShell
          title="Your loop. Your terms."
          subtitle="A little about you. A little room to choose."
          close={() => setModal(null)}
          wide
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const linkLabels = [
                "LinkedIn",
                "Portfolio",
                "GitHub",
                "Instagram",
              ];
              const links = linkLabels
                .map((label) => ({ label, url: String(f.get(label) ?? "") }))
                .filter((l) => l.url);
              if (
                await act(
                  {
                    type: "profile.update",
                    profile: {
                      name: String(f.get("name")),
                      headline: String(f.get("headline")),
                      company: String(f.get("company")),
                      location: String(f.get("location")),
                      bio: String(f.get("bio")),
                      skills: String(f.get("skills"))
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                      links,
                      visibility: String(
                        f.get("visibility"),
                      ) as Profile["visibility"],
                    },
                  },
                  "Your profile feels a little more like you.",
                )
              )
                setModal(null);
            }}
          >
            <div className="form-row">
              <Field label="Your name">
                <input
                  name="name"
                  defaultValue={me?.name}
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="What do you do?">
                <input
                  name="headline"
                  defaultValue={me?.headline}
                  maxLength={160}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Company or project">
                <input
                  name="company"
                  defaultValue={me?.company}
                  maxLength={160}
                />
              </Field>
              <Field label="Home base">
                <input
                  name="location"
                  defaultValue={me?.location}
                  maxLength={160}
                />
              </Field>
            </div>
            <Field label="Your story">
              <textarea
                name="bio"
                defaultValue={me?.bio}
                maxLength={1500}
                rows={3}
              />
            </Field>
            <Field label="Skills, separated by commas">
              <input
                name="skills"
                defaultValue={me?.skills.join(", ")}
                maxLength={500}
              />
            </Field>
            <div className="form-row">
              {["LinkedIn", "Portfolio", "GitHub", "Instagram"].map((label) => (
                <Field label={label} key={label}>
                  <input
                    name={label}
                    type="url"
                    defaultValue={me?.links.find((l) => l.label === label)?.url}
                    placeholder="https://…"
                  />
                </Field>
              ))}
            </div>
            <Field label="Profile visibility">
              <select name="visibility" defaultValue={me?.visibility}>
                <option value="public">Visible to the community</option>
                <option value="connections">Connections only</option>
              </select>
            </Field>
            <div className="settings-divider" />
            <span className="eyebrow">YOUR ATTENTION BELONGS TO YOU</span>
            {mode === "live" && !emailVerified && (
              <div className="callout">
                <ShieldCheck size={18} />
                <div>
                  <p>
                    Verify your email to add a verified signal to your community
                    trust.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void sendVerificationEmail()
                        .then(() => toast("Verification email sent."))
                        .catch(() => {})
                    }
                  >
                    Send verification email
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void refreshVerification()
                        .then((verified) =>
                          toast(
                            verified
                              ? "Email verified. Your trust will refresh with your next activity."
                              : "Check your email and try again.",
                          ),
                        )
                        .catch(() => {})
                    }
                  >
                    I’ve verified my email
                  </button>
                </div>
              </div>
            )}
            <Field label="Your timezone">
              <input
                defaultValue={s.preferences.timezone}
                onBlur={(e) =>
                  void act({
                    type: "preferences.update",
                    preferences: { timezone: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Who can start a private conversation with you?">
              <select
                value={s.preferences.dmPolicy}
                onChange={(e) =>
                  void act({
                    type: "preferences.update",
                    preferences: {
                      dmPolicy: e.target.value as
                        | "connections"
                        | "everyone"
                        | "nobody",
                    },
                  })
                }
              >
                <option value="connections">My connections</option>
                <option value="everyone">Everyone in the community</option>
                <option value="nobody">No new conversations</option>
              </select>
            </Field>
            <p className="muted privacy-help">
              People you message can reply. Block a member to stop future
              messages, or mute a conversation to keep it quiet.
            </p>
            <Field label="A quieter way to catch up">
              <select
                value={s.preferences.digest}
                onChange={(e) =>
                  void act({
                    type: "preferences.update",
                    preferences: {
                      digest: e.target.value as "off" | "daily" | "weekly",
                    },
                  })
                }
              >
                <option value="off">No digest</option>
                <option value="daily">Daily digest</option>
                <option value="weekly">Weekly digest</option>
              </select>
            </Field>
            <label className="switch-row">
              <span>
                <strong>Quiet hours</strong>
                <small>Make a little room for life offline.</small>
              </span>
              <input
                type="checkbox"
                checked={s.preferences.quietHours}
                onChange={(e) =>
                  void act({
                    type: "preferences.update",
                    preferences: { quietHours: e.target.checked },
                  })
                }
              />
            </label>
            {s.preferences.quietHours && (
              <div className="form-row">
                <Field label="Quiet from">
                  <input
                    type="time"
                    value={s.preferences.quietStart}
                    onChange={(e) =>
                      void act({
                        type: "preferences.update",
                        preferences: { quietStart: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Until">
                  <input
                    type="time"
                    value={s.preferences.quietEnd}
                    onChange={(e) =>
                      void act({
                        type: "preferences.update",
                        preferences: { quietEnd: e.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            )}
            <label className="switch-row">
              <span>
                <strong>Event reminders</strong>
                <small>A nudge before your next good plan.</small>
              </span>
              <input
                type="checkbox"
                checked={s.preferences.eventReminders}
                onChange={(e) =>
                  void act({
                    type: "preferences.update",
                    preferences: { eventReminders: e.target.checked },
                  })
                }
              />
            </label>
            {s.preferences.blockedIds.length > 0 && (
              <div>
                <span className="eyebrow">BLOCKED MEMBERS</span>
                {s.preferences.blockedIds.map((id) => (
                  <button
                    type="button"
                    key={id}
                    className="text-button"
                    onClick={() =>
                      void act(
                        { type: "profile.block", userId: id },
                        "Member unblocked.",
                      )
                    }
                  >
                    {person(id)?.name ?? id} · Unblock
                  </button>
                ))}
              </div>
            )}
            <footer>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  void exportAccount()
                    .then((data) =>
                      download(
                        "theloop-my-data.json",
                        JSON.stringify(data, null, 2),
                        "application/json",
                      ),
                    )
                    .catch(() => {})
                }
              >
                <Download size={14} />
                Export my data
              </button>
              <button className="button primary" disabled={pending > 0}>
                Save profile
                <Check size={16} />
              </button>
            </footer>
            {mode === "live" && (
              <button
                type="button"
                className="text-button"
                onClick={() => setModal("delete")}
              >
                Delete my account and data
              </button>
            )}
            {mode === "demo" ? (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  resetDemo();
                  welcomed.current = true;
                  navigate("home");
                  setModal("interests");
                  toast("A fresh sample is ready.");
                }}
              >
                Reset sample preview
              </button>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => void signOut().catch(() => {})}
              >
                <LogOut size={14} />
                Sign out
              </button>
            )}
          </form>
        </ModalShell>
      )}
      {modal === "delete" && (
        <ModalShell
          title="Leave the loop?"
          subtitle="This permanently deletes your account, messages and posts. Shared calendar entries are anonymized."
          close={() => setModal("settings")}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await deleteAccount(
                  String(new FormData(e.currentTarget).get("confirmation")),
                );
                setModal(null);
                toast("Your deletion request is being processed.");
              } catch {}
            }}
          >
            <div className="callout">
              <p>
                Export your data first if you want a copy. You may need to sign
                in again before deleting your account.
              </p>
            </div>
            <Field label="Type DELETE to confirm">
              <input
                name="confirmation"
                required
                pattern="DELETE"
                autoComplete="off"
              />
            </Field>
            <button className="button primary">
              Permanently delete account
            </button>
          </form>
        </ModalShell>
      )}
      {modal === "appeal" && (
        <ModalShell
          title="Ask for another look."
          subtitle="Community trust should be explainable. Share what we should review."
          close={() => setModal(null)}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await appealTrust(
                  String(new FormData(e.currentTarget).get("reason")),
                );
                setModal(null);
                toast("Your trust appeal is in the review queue.");
              } catch {}
            }}
          >
            <Field label="What should we know?">
              <textarea
                name="reason"
                required
                minLength={20}
                maxLength={2000}
                rows={5}
              />
            </Field>
            <button className="button primary">
              Submit appeal
              <ArrowUpRight size={14} />
            </button>
          </form>
        </ModalShell>
      )}
      {modal === "followers" && (
        <ModalShell
          title={
            followerMode === "followers"
              ? "Your community is growing."
              : "People worth keeping close."
          }
          subtitle={
            followerMode === "followers"
              ? "People following your contributions."
              : "The people you follow shape your Following feed."
          }
          close={() => setModal(null)}
        >
          <div className="modal-form">
            {s.follows
              .filter((f) =>
                followerMode === "followers"
                  ? f.followingId === s.currentUserId
                  : f.followerId === s.currentUserId,
              )
              .map((f) => {
                const id =
                  followerMode === "followers" ? f.followerId : f.followingId;
                const p = person(id);
                return (
                  <div className="person-mini" key={f.id}>
                    <Avatar
                      person={p}
                      onClick={
                        p
                          ? () => {
                              setModal(null);
                              openProfile(id);
                            }
                          : undefined
                      }
                    />
                    <div>
                      <button
                        className="name-button"
                        disabled={!p}
                        onClick={() => {
                          setModal(null);
                          openProfile(id);
                        }}
                      >
                        {p?.name ?? "Private community member"}
                      </button>
                      <p>
                        {p?.headline ??
                          "Profile visibility is controlled by this member."}
                      </p>
                    </div>
                    {p && (
                      <button
                        className="button subtle small-button"
                        onClick={() =>
                          void act({ type: "profile.follow", userId: id })
                        }
                      >
                        {s.preferences.followingIds.includes(id)
                          ? "Following"
                          : "Follow back"}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </ModalShell>
      )}
      {modal === "topic" && activeChannel && (
        <ModalShell
          title="Give the conversation a little space."
          subtitle={`Start a topic in #${activeChannel.name}.`}
          close={() => setModal(null)}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name"));
              if (
                await act(
                  { type: "topic.create", channelId: activeChannel.id, name },
                  "A new conversation is ready.",
                )
              ) {
                setTopic(name);
                setModal(null);
              }
            }}
          >
            <Field label="Topic name">
              <input
                name="name"
                maxLength={80}
                required
                placeholder="One specific conversation"
              />
            </Field>
            <button className="button primary" disabled={pending > 0}>
              Start the topic
              <Plus size={14} />
            </button>
          </form>
        </ModalShell>
      )}
      {modal === "moderate" && (role === "moderator" || role === "admin") && (
        <ModalShell
          title="A little care for the community."
          subtitle="Review concerns in context. Decisions are recorded in the audit trail."
          close={() => setModal(null)}
          wide
        >
          <div className="modal-form">
            {s.reports
              .filter((r) => r.status === "open")
              .map((r) => (
                <article className="moderation-card" key={r.id}>
                  <span className="eyebrow">
                    {r.targetType} · {displayDate(r.createdAt)}
                  </span>
                  <p>{r.reason}</p>
                  <blockquote>
                    {r.snapshot?.body ??
                      (r.targetType === "post"
                        ? s.posts.find((p) => p.id === r.targetId)?.body
                        : r.targetType === "message"
                          ? s.messages.find((m) => m.id === r.targetId)?.body
                          : r.targetType === "comment"
                            ? s.posts
                                .find((p) => p.id === r.postId)
                                ?.comments.find((c) => c.id === r.targetId)
                                ?.body
                            : r.targetType === "profile"
                              ? person(r.targetId)?.bio
                              : undefined) ??
                      "Content isn’t available. Review the report without removing unseen content."}
                  </blockquote>
                  {r.snapshot?.image && (
                    <ProtectedImage
                      image={r.snapshot.image}
                      reportId={r.id}
                      alt="Photo included in this reported message"
                    />
                  )}
                  {r.snapshot && (
                    <small className="muted">
                      Excerpt captured {displayDate(r.snapshot.capturedAt)}. A
                      private report shares only this excerpt with community
                      care.
                    </small>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await act(
                        {
                          type: "report.review",
                          reportId: r.id,
                          outcome: String(f.get("outcome")) as
                            | "dismiss"
                            | "remove",
                          note: String(f.get("note")),
                        },
                        "Your review has been recorded.",
                      );
                    }}
                  >
                    <Field label="Review note">
                      <input name="note" maxLength={1000} />
                    </Field>
                    <Field label="Decision">
                      <select name="outcome">
                        <option value="dismiss">Dismiss report</option>
                        {r.targetType !== "profile" &&
                          (r.snapshot ||
                            (r.targetType === "post" &&
                              s.posts.some((p) => p.id === r.targetId)) ||
                            (r.targetType === "message" &&
                              s.messages.some((m) => m.id === r.targetId)) ||
                            (r.targetType === "comment" &&
                              s.posts.some(
                                (p) =>
                                  p.id === r.postId &&
                                  p.comments.some((c) => c.id === r.targetId),
                              ))) && (
                            <option value="remove">
                              Remove reported content
                            </option>
                          )}
                      </select>
                    </Field>
                    <button
                      className="button primary small-button"
                      disabled={pending > 0}
                    >
                      Record decision
                      <Check size={14} />
                    </button>
                  </form>
                </article>
              ))}
            {!s.reports.some((r) => r.status === "open") && (
              <Empty
                title="A little peace and quiet."
                body="No open reports need your attention."
              />
            )}
          </div>
        </ModalShell>
      )}
      {modal === "organize" && (role === "admin" || role === "moderator") && (
        <OrganizerDialog
          role={role}
          conferences={s.conferences}
          communities={s.communities}
          close={() => setModal(null)}
          submit={act}
        />
      )}
      {modal === "report" && (
        <ModalShell
          title="A little care for the community."
          subtitle="Reports are private and reviewed by moderators."
          close={() => setModal(null)}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  {
                    type: "report.create",
                    targetId: reportTarget.id,
                    targetType: reportTarget.type,
                    ...(reportTarget.postId
                      ? { postId: reportTarget.postId }
                      : {}),
                    reason: String(new FormData(e.currentTarget).get("reason")),
                  },
                  "Your concern has been recorded for review.",
                )
              )
                setModal(null);
            }}
          >
            {(reportTarget.type === "directMessage" ||
              reportTarget.type === "squadMessage") && (
              <div className="callout">
                <strong>Share this message with community care?</strong>
                <p>
                  Sending this report shares an excerpt of the selected private
                  message{reportImage ? " and its photo" : ""} with moderators.
                  It does not open the rest of your conversation.
                </p>
                <blockquote>
                  {(reportTarget.type === "directMessage"
                    ? s.directMessages.find((d) => d.id === reportTarget.id)
                        ?.body
                    : s.squadMessages.find((m) => m.id === reportTarget.id)
                        ?.body) ?? "This message is no longer loaded."}
                </blockquote>
              </div>
            )}
            {reportImage && (
              <ProtectedImage
                image={reportImage}
                alt="Photo included in this report"
              />
            )}
            <Field label="What should we know?">
              <textarea
                name="reason"
                required
                maxLength={1500}
                rows={5}
                placeholder="Share enough context to help a moderator understand."
              />
            </Field>
            <button className="button primary" disabled={pending > 0}>
              Send for review
              <Flag size={15} />
            </button>
          </form>
        </ModalShell>
      )}
      {modal === "guide" && (
        <GuideDialog close={() => setModal(null)} notify={toast} />
      )}
      {modal === "import" && (
        <ImportDialog
          close={() => setModal(null)}
          conferences={s.conferences}
          existingEvents={s.events}
          submit={async (events) => {
            let count = 0;
            for (const event of events) {
              if (await act({ type: "event.create", event })) count++;
              else break;
            }
            toast(
              `${count} event${count === 1 ? "" : "s"} added to the calendar.`,
            );
            if (count === events.length) setModal(null);
          }}
        />
      )}
      {contentTarget && (
        <ContentDialog
          target={contentTarget}
          mode={contentMode}
          setMode={setContentMode}
          close={() => setContentTarget(null)}
          run={act}
          deleted={() => {
            if (
              contentTarget.kind === "post" &&
              postDetail === contentTarget.post.id
            )
              setPostDetail(null);
            if (
              contentTarget.kind === "message" &&
              replyTo === contentTarget.message.id
            )
              setReplyTo(null);
            setContentTarget(null);
          }}
          report={(target) => {
            setReportTarget(target);
            setContentTarget(null);
            setModal("report");
          }}
        />
      )}
      {postDetail && !tourOpen &&
        !modal &&
        !contentTarget &&
        !searchOpen &&
        (() => {
          const post = s.posts.find(
            (p) =>
              p.id === postDetail &&
              !s.preferences.blockedIds.includes(p.authorId),
          );
          if (!post)
            return (
              <ModalShell
                key={postDetail}
                title="The conversation continues."
                close={closeDetail}
              >
                <DetailState
                  label="post"
                  loading={postStatus.loading || postStatus.id !== postDetail}
                  error={postStatus.error}
                  missing={
                    postStatus.notFound ||
                    s.posts.some(
                      (p) =>
                        p.id === postDetail &&
                        s.preferences.blockedIds.includes(p.authorId),
                    )
                  }
                  retry={() => {
                    watchPost(null);
                    watchPost(postDetail);
                  }}
                />
              </ModalShell>
            );
          return (
            <ModalShell
              key={postDetail}
              title="The conversation continues."
              close={closeDetail}
              wide
            >
              <div className="post-detail">
                <DetailConnection
                  loading={postStatus.loading}
                  error={postStatus.error}
                  retry={() => {
                    watchPost(null);
                    watchPost(postDetail);
                  }}
                />
                {postCard(post)}
                <div className="comments">
                  <span className="eyebrow">
                    MAKE ROOM FOR ANOTHER PERSPECTIVE
                  </span>
                  {post.comments
                    .filter(
                      (c) => !s.preferences.blockedIds.includes(c.authorId),
                    )
                    .map((c) => (
                      <div className="comment" key={c.id}>
                        <Avatar
                          person={participant(
                            c.authorId,
                            c.authorName,
                            c.authorInitials,
                          )}
                          onClick={() => {
                            setPostDetail(null);
                            openProfile(c.authorId);
                          }}
                        />
                        <div>
                          <strong>
                            {
                              participant(
                                c.authorId,
                                c.authorName,
                                c.authorInitials,
                              ).name
                            }
                          </strong>
                          <p>{c.body}</p>
                          <small>{displayDate(c.createdAt)}</small>
                          <button
                            className="comment-options"
                            aria-label={`More options for ${participant(c.authorId, c.authorName, c.authorInitials).name}’s reply`}
                            onClick={() =>
                              showContent({
                                kind: "comment",
                                postId: post.id,
                                comment: c,
                              })
                            }
                          >
                            <MoreHorizontal size={15} />
                            {c.editedAt ? <span>edited</span> : null}
                          </button>
                        </div>
                      </div>
                    ))}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      if (
                        await act({
                          type: "post.comment",
                          postId: post.id,
                          body: String(new FormData(form).get("body")),
                        })
                      )
                        form.reset();
                    }}
                  >
                    <textarea
                      name="body"
                      required
                      maxLength={2000}
                      rows={3}
                      placeholder="Add something thoughtful…"
                      aria-label="Your reply"
                    />
                    <button className="button primary" disabled={pending > 0}>
                      Add to the conversation
                      <Send size={15} />
                    </button>
                  </form>
                </div>
              </div>
            </ModalShell>
          );
        })()}
      {eventDetail && !tourOpen &&
        !modal &&
        !eventAction &&
        !contentTarget &&
        !searchOpen &&
        (() => {
          const event = s.events.find((e) => e.id === eventDetail);
          return (
            <ModalShell
              key={eventDetail}
              title="Make a little room for this."
              subtitle="A good plan. Even better company."
              close={closeDetail}
              wide
            >
              {event ? (
                <div className="event-detail">
                  <DetailConnection
                    loading={eventStatus.loading}
                    error={eventStatus.error}
                    retry={() => {
                      watchEvent(null);
                      watchEvent(eventDetail);
                    }}
                  />
                  {eventCard(event)}
                  <div className="event-detail-time">
                    <Clock size={16} />
                    <p>
                      {displayDate(event.startAt, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        timeZone: event.timezone,
                      })}
                      <br />
                      {displayDate(event.startAt, {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: event.timezone,
                        timeZoneName: "short",
                      })}{" "}
                      –{" "}
                      {displayDate(event.endAt, {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: event.timezone,
                        timeZoneName: "short",
                      })}
                      <small>{event.timezone}</small>
                    </p>
                  </div>
                  {event.status === "cancelled" && (
                    <p className="event-cancel-explanation">
                      This plan was cancelled. Update any calendar entry you
                      saved on your device. The cancellation export keeps the
                      event’s original calendar identity.
                    </p>
                  )}
                  {(event.hostId === s.currentUserId || role === "admin") &&
                    event.status !== "cancelled" &&
                    Date.parse(event.endAt) > Date.now() && (
                      <div className="event-management">
                        <button
                          className="button subtle"
                          disabled={eventStatus.loading || !!eventStatus.error}
                          onClick={() =>
                            setEventAction({
                              kind: "edit",
                              event: JSON.parse(JSON.stringify(event)),
                            })
                          }
                        >
                          Edit plan
                        </button>
                        <button
                          className="text-button"
                          disabled={eventStatus.loading || !!eventStatus.error}
                          onClick={() =>
                            setEventAction({
                              kind: "cancel",
                              event: JSON.parse(JSON.stringify(event)),
                            })
                          }
                        >
                          Cancel this event
                        </button>
                      </div>
                    )}
                  {event.url && (
                    <a
                      className="button subtle"
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Organizer details
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              ) : (
                <DetailState
                  label="event"
                  loading={
                    eventStatus.loading || eventStatus.id !== eventDetail
                  }
                  error={eventStatus.error}
                  missing={eventStatus.notFound}
                  retry={() => {
                    watchEvent(null);
                    watchEvent(eventDetail);
                  }}
                />
              )}
            </ModalShell>
          );
        })()}
      {eventAction && !modal && !searchOpen && (
        <EventManager
          key={`${s.currentUserId}:${eventAction.kind}:${eventAction.event.id}`}
          action={eventAction}
          close={() => setEventAction(null)}
          run={act}
        />
      )}
    </div>
  );
}
function DetailState({
  label,
  loading,
  missing,
  error,
  retry,
}: {
  label: string;
  loading: boolean;
  missing: boolean;
  error?: string | null;
  retry: () => void;
}) {
  return (
    <div role={error ? "alert" : "status"}>
      <Empty
        title={
          missing
            ? `This ${label} isn’t available.`
            : error
              ? `We couldn’t load this ${label}.`
              : `Finding this ${label}…`
        }
        body={
          missing
            ? "It may have been removed, or you may not have access."
            : error
              ? error
              : loading
                ? "A little moment while we bring you into the loop."
                : "Try again to check for the latest details."
        }
        action={
          !missing && (!loading || error) ? (
            <button className="button subtle" onClick={retry}>
              Try again
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
function DetailConnection({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string | null;
  retry: () => void;
}) {
  if (!loading && !error) return null;
  return (
    <p className="detail-connection" role={error ? "alert" : "status"}>
      {error ? (
        <>
          The latest details couldn’t be confirmed.{" "}
          <button className="text-button" onClick={retry}>
            Try again
          </button>
        </>
      ) : (
        "Checking for the latest details…"
      )}
    </p>
  );
}
function OrganizerDialog({
  role,
  conferences,
  communities,
  close,
  submit,
}: {
  role: "admin" | "moderator";
  conferences: Conference[];
  communities: Community[];
  close: () => void;
  submit: (command: Command, success?: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<"channel" | "conference">("channel");
  return (
    <ModalShell
      title="Make room for the next chapter."
      subtitle="Organizer tools for the spaces that bring people together."
      close={close}
      wide
    >
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const command: Command =
            kind === "conference"
              ? {
                  type: "conference.create",
                  conference: {
                    name: String(f.get("name")),
                    shortName: String(f.get("shortName")),
                    city: String(f.get("city")),
                    startDate: String(f.get("startDate")),
                    endDate: String(f.get("endDate")),
                    description: String(f.get("description")),
                    tagline: String(f.get("tagline")),
                  },
                }
              : {
                  type: "channel.create",
                  channel: {
                    conferenceId: String(f.get("conferenceId")),
                    name: String(f.get("name")),
                    description: String(f.get("description")),
                    icon: String(f.get("icon") || "#"),
                    topics: String(f.get("topics"))
                      .split("\n")
                      .map((t) => t.trim())
                      .filter(Boolean),
                    visibility: String(f.get("visibility")) as
                      | "public"
                      | "private",
                    memberIds: String(f.get("memberIds") ?? "")
                      .split(/[,\n]/)
                      .map((t) => t.trim())
                      .filter(Boolean),
                    ...(f.get("communityId")
                      ? { communityId: String(f.get("communityId")) }
                      : {}),
                  },
                };
          if (
            await submit(
              command,
              kind === "conference"
                ? "Your new conference hub is ready."
                : "Your new channel is ready.",
            )
          )
            close();
        }}
      >
        <div className="community-tabs">
          <button
            type="button"
            className={kind === "channel" ? "active" : ""}
            onClick={() => setKind("channel")}
          >
            Create a channel
          </button>
          {role === "admin" && (
            <button
              type="button"
              className={kind === "conference" ? "active" : ""}
              onClick={() => setKind("conference")}
            >
              Create a conference hub
            </button>
          )}
        </div>
        <Field
          label={kind === "conference" ? "Conference name" : "Channel name"}
        >
          <input
            key={kind}
            name="name"
            required
            maxLength={kind === "conference" ? 100 : 60}
            placeholder={
              kind === "conference"
                ? "The next place we come together"
                : "the-next-conversation"
            }
            pattern={kind === "channel" ? "[a-z0-9][a-z0-9-]*" : undefined}
          />
        </Field>
        <Field label="A little context">
          <textarea name="description" required rows={3} maxLength={1000} />
        </Field>
        {kind === "conference" ? (
          <>
            <div className="form-row">
              <Field label="Short name">
                <input name="shortName" required maxLength={8} />
              </Field>
              <Field label="City">
                <input name="city" required maxLength={100} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Starts">
                <input type="date" name="startDate" required />
              </Field>
              <Field label="Ends">
                <input type="date" name="endDate" required />
              </Field>
            </div>
            <Field label="A line that captures the energy">
              <input name="tagline" maxLength={160} required />
            </Field>
          </>
        ) : (
          <>
            <div className="form-row">
              <Field label="Conference hub">
                <select name="conferenceId">
                  {conferences.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Associated community">
                <select name="communityId">
                  <option value="">No specific community</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-row">
              <Field label="Who can join?">
                <select name="visibility">
                  <option value="public">Public to the community</option>
                  <option value="private">Private, invited members</option>
                </select>
              </Field>
              <Field label="Icon">
                <input name="icon" defaultValue="◎" maxLength={8} />
              </Field>
            </div>
            <Field label="Starting topics, one per line">
              <textarea
                name="topics"
                defaultValue={"Introductions\nMaking plans"}
                required
                rows={3}
              />
            </Field>
            <Field label="Invited member IDs (private channels only)">
              <textarea
                name="memberIds"
                rows={2}
                placeholder="Paste member IDs, separated by commas. You will be added automatically."
              />
            </Field>
          </>
        )}
        <div className="callout">
          <ShieldCheck size={18} />
          <p>
            Access is checked on the server. Private channels are visible only
            to invited members. Creating a space does not send external
            invitations.
          </p>
        </div>
        <button className="button primary">
          Create this space
          <Plus size={15} />
        </button>
      </form>
    </ModalShell>
  );
}
function ImportDialog({
  close,
  conferences,
  existingEvents,
  submit,
}: {
  close: () => void;
  conferences: Parameters<typeof previewEventCSV>[1]["conferences"];
  existingEvents: LoopEvent[];
  submit: (events: EventDraft[]) => Promise<void>;
}) {
  const [csv, setCSV] = useState(""),
    [busy, setBusy] = useState(false),
    [fileError, setFileError] = useState("");
  const result = useMemo(
    () =>
      csv.trim()
        ? previewEventCSV(csv, {
            conferences,
            existingEvents,
            now: new Date().toISOString(),
          })
        : null,
    [csv, conferences, existingEvents],
  );
  return (
    <ModalShell
      title="Bring your plans into the loop."
      subtitle="Preview your spreadsheet before anything is added."
      close={close}
      wide
    >
      <div className="modal-form">
        <div className="callout">
          <CalendarDays size={22} />
          <p>
            CSV columns: title, description, startAt, endAt, timezone, location,
            conferenceId, kind, capacity. Use ISO dates and an IANA timezone.
            Existing events are detected and skipped.
          </p>
        </div>
        <input
          aria-label="Upload event CSV"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && f.size >= 1_000_000)
              setFileError(
                "Use a CSV smaller than 1 MB. Split a larger calendar into smaller files.",
              );
            else if (f) {
              setFileError("");
              void f
                .text()
                .then(setCSV)
                .catch(() => setFileError("This file could not be read."));
            }
          }}
        />
        {fileError && (
          <p className="form-error" role="alert">
            {fileError}
          </p>
        )}
        <textarea
          value={csv}
          onChange={(e) => setCSV(e.target.value)}
          rows={6}
          placeholder="Paste your CSV here…"
          aria-label="Event CSV content"
        />
        {result && (
          <>
            <span className="eyebrow">
              {result.events.length} EVENTS READY TO IMPORT
            </span>
            <div className="import-preview">
              {result.rows.map((r) => (
                <div key={r.row}>
                  <strong>
                    Row {r.row} {r.event?.title}
                  </strong>
                  <p>
                    {r.duplicate
                      ? "Already on the calendar — skipped."
                      : r.errors.length
                        ? r.errors.join(" ")
                        : "Ready to add."}
                  </p>
                </div>
              ))}
              {result.errors.map((e, i) => (
                <p className="form-error" key={i}>
                  {String(e)}
                </p>
              ))}
            </div>
          </>
        )}
        <button
          className="button primary"
          disabled={busy || !result?.events.length}
          onClick={async () => {
            if (!result) return;
            setBusy(true);
            try {
              await submit(result.events);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Adding your plans…"
            : `Import ${result?.events.length ?? 0} events`}
          <ArrowUpRight size={15} />
        </button>
      </div>
    </ModalShell>
  );
}
