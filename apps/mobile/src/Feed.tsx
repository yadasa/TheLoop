import React, { useEffect, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, Share, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import { safeURL, type Post, type Comment } from "@theloop/core";
import {
  Avatar,
  Button,
  Chip,
  color,
  Empty,
  Field,
  Horizontal,
  Label,
  LinkifiedText,
  pickSubscription,
  RelativeTime,
  s,
  Section,
  Touch,
} from "./ui";
import type { Nav } from "./navigation";

export function Feed({ nav }: { nav: Nav }) {
  const { state, hasMore, loadMore, loadSavedPosts } = useLoop();
  const [filter, setFilter] = useState("for-you");
  const [sort, setSort] = useState("Hot");
  const [loadingSaved, setLoadingSaved] = useState(false);
  useEffect(() => {
    if (filter !== "saved") return;
    let mounted = true;
    setLoadingSaved(true);
    void loadSavedPosts()
      .catch(() =>
        nav.toast(
          "Could not refresh saved conversations. Try opening Saved again.",
        ),
      )
      .finally(() => {
        if (mounted) setLoadingSaved(false);
      });
    return () => {
      mounted = false;
    };
  }, [filter, loadSavedPosts]);
  const me = state.profiles.find((p) => p.id === state.currentUserId);
  const posts = useMemo(
    () =>
      state.posts
        .filter(
          (p) =>
            !state.preferences.blockedIds.includes(p.authorId) &&
            (filter === "saved"
              ? state.preferences.savedPostIds.includes(p.id)
              : filter === "joined"
                ? state.preferences.joinedCommunityIds.includes(p.communityId)
                : filter === "for-you"
                  ? state.preferences.joinedCommunityIds.includes(
                      p.communityId,
                    ) &&
                    state.preferences.subscriptions[p.communityId] !==
                      "hidden" &&
                    state.preferences.subscriptions[p.communityId] !== "muted"
                  : p.communityId === filter),
        )
        .sort((a, b) =>
          sort === "New"
            ? b.createdAt.localeCompare(a.createdAt)
            : Object.values(b.votes).reduce((x, y) => x + y, 0) -
              Object.values(a.votes).reduce((x, y) => x + y, 0),
        ),
    [state.posts, state.preferences, filter, sort],
  );
  const upcoming = state.events
    .filter((e) => new Date(e.endAt) > new Date())
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const unread = state.notifications.filter(
    (n) => n.userId === state.currentUserId && !n.read,
  ).length;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.content}
    >
      <View style={s.between}>
        <View>
          <Text style={s.overline}>THE PEOPLE MAKE THE LOOP</Text>
          <Text style={[s.title, { marginTop: 5 }]}>
            Hey, {me?.name.split(" ")[0] || "you"}
            <Text style={{ fontWeight: "300" }}> ↗</Text>
          </Text>
        </View>
        <Touch
          label={`Notifications, ${unread} unread`}
          onPress={() => nav.open({ kind: "notifications" })}
          style={{
            width: 47,
            height: 47,
            borderWidth: 1,
            borderColor: color.line,
            borderRadius: 24,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 23 }}>♧</Text>
          {unread > 0 && (
            <View
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                backgroundColor: color.ink,
                width: 17,
                height: 17,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 9 }}>{unread}</Text>
            </View>
          )}
        </Touch>
      </View>
      <Touch
        label="Search TheLoop"
        onPress={() => nav.open({ kind: "search" })}
        style={[
          s.row,
          {
            padding: 13,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: color.line,
          },
        ]}
      >
        <Text style={{ fontSize: 21 }}>⌕</Text>
        <Text style={s.small}>People, conversations, your next plan…</Text>
      </Touch>
      <View
        style={[
          s.card,
          {
            backgroundColor: color.ink,
            borderColor: color.ink,
            minHeight: 178,
            overflow: "hidden",
            padding: 23,
          },
        ]}
      >
        <View
          style={{
            position: "absolute",
            right: -32,
            top: 20,
            width: 155,
            height: 155,
            borderRadius: 90,
            borderWidth: 1,
            borderColor: "#45463F",
            transform: [{ scaleX: 0.8 }, { rotate: "-30deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            right: 8,
            top: 45,
            width: 155,
            height: 155,
            borderRadius: 90,
            borderWidth: 1,
            borderColor: "#5D5F55",
            transform: [{ scaleX: 0.8 }, { rotate: "-30deg" }],
          }}
        />
        <Text style={[s.overline, { color: "#ABAEA1" }]}>
          BUILT ON REAL CONNECTION
        </Text>
        <Text
          style={{
            fontSize: 27,
            lineHeight: 32,
            fontWeight: "500",
            letterSpacing: -0.8,
            color: "#fff",
            maxWidth: 235,
          }}
        >
          Less noise.{`\n`}More of your people.
        </Text>
        <Touch
          label="Find your communities"
          onPress={() => nav.open({ kind: "communities" })}
          style={{ paddingVertical: 7, alignSelf: "flex-start" }}
        >
          <Text style={{ color: "#D7D9CC", fontSize: 12 }}>
            Find your corner ↗
          </Text>
        </Touch>
      </View>
      <Horizontal>
        <Chip
          title="For you"
          selected={filter === "for-you"}
          onPress={() => setFilter("for-you")}
        />
        <Chip
          title="Joined"
          selected={filter === "joined"}
          onPress={() => setFilter("joined")}
        />
        <Chip
          title="Saved"
          selected={filter === "saved"}
          onPress={() => setFilter("saved")}
        />
        {state.communities
          .filter((c) => state.preferences.subscriptions[c.id] !== "hidden")
          .map((c) => (
            <Chip
              key={c.id}
              title={`l/${c.slug}`}
              selected={filter === c.id}
              onPress={() => setFilter(c.id)}
            />
          ))}
      </Horizontal>
      <View style={s.between}>
        <Text style={s.h2}>Around the loop</Text>
        <View style={s.row}>
          {["Hot", "New"].map((v) => (
            <Touch
              key={v}
              label={`Sort ${v}`}
              onPress={() => setSort(v)}
              style={{ padding: 7 }}
            >
              <Text
                style={[
                  s.small,
                  sort === v && { color: color.ink, fontWeight: "700" },
                ]}
              >
                {v}
              </Text>
            </Touch>
          ))}
        </View>
      </View>
      <Touch
        label="Share something with the community"
        onPress={() => nav.open({ kind: "compose" })}
        style={[
          s.row,
          {
            padding: 14,
            borderRadius: 18,
            backgroundColor: "#E9EAE3",
            gap: 12,
          },
        ]}
      >
        <Avatar profile={me} size={34} />
        <Text style={[s.small, { flex: 1 }]}>
          A thought, a win, an open door…
        </Text>
        <Text style={{ fontSize: 23, color: color.ink }}>＋</Text>
      </Touch>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} nav={nav} />
      ))}
      {loadingSaved && (
        <Text style={s.small}>Finding your saved conversations…</Text>
      )}
      {filter !== "saved" && hasMore.posts && (
        <Button
          secondary
          title="More from the community ↓"
          onPress={() => loadMore("posts")}
        />
      )}
      {posts.length === 0 && !loadingSaved && (
        <Empty
          title="A little quiet here"
          body={
            filter === "saved"
              ? "Save posts to come back to the good stuff."
              : "Join a community or start a conversation to make this space yours."
          }
          action="Explore communities"
          onPress={() => nav.open({ kind: "communities" })}
        />
      )}
      {upcoming && (
        <View style={[s.card, { backgroundColor: color.soft }]}>
          <Text style={s.overline}>TAKE IT OFFLINE</Text>
          <Text style={s.h2}>{upcoming.title}</Text>
          <Text style={s.small}>
            {new Date(upcoming.startAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · {upcoming.location}
          </Text>
          <Button
            title="See who's going ↗"
            onPress={() => nav.open({ kind: "event", id: upcoming.id })}
          />
        </View>
      )}
      <Text style={[s.small, { textAlign: "center" }]}>
        Four years of connection. A whole new chapter.
      </Text>
    </ScrollView>
  );
}

export function PostCard({
  post,
  nav,
  detail = false,
}: {
  post: Post;
  nav: Nav;
  detail?: boolean;
}) {
  const { state } = useLoop();
  const author = state.profiles.find((p) => p.id === post.authorId);
  const community = state.communities.find((c) => c.id === post.communityId);
  const votes = Object.values(post.votes).reduce((a, b) => a + b, 0);
  const saved = state.preferences.savedPostIds.includes(post.id);
  const mine = post.authorId === state.currentUserId;
  return (
    <View style={s.card}>
      <View style={s.between}>
        <Touch
          label={`View ${author?.name || "member"} profile`}
          onPress={() => nav.open({ kind: "profile", id: post.authorId })}
          style={s.row}
        >
          <Avatar profile={author} size={34} />
          <View>
            <Text style={{ fontSize: 12, fontWeight: "600", color: color.ink }}>
              {author?.name || "Loop member"}
            </Text>
            <Text style={s.small}>l/{community?.slug || "community"}</Text>
          </View>
        </Touch>
        <View style={{ alignItems: "flex-end" }}>
          <RelativeTime date={post.editedAt || post.createdAt} />
          {post.editedAt && <Text style={s.small}>edited</Text>}
        </View>
      </View>
      <Touch
        label={post.title}
        onPress={() => !detail && nav.open({ kind: "post", id: post.id })}
        style={{ gap: 9 }}
      >
        <Text
          style={[
            s.h3,
            { fontSize: detail ? 24 : 19, lineHeight: detail ? 30 : 26 },
          ]}
        >
          {post.title}
        </Text>
        <Text style={s.body} numberOfLines={detail ? undefined : 3}>
          {post.body}
        </Text>
      </Touch>
      {post.poll && <PollBlock post={post} nav={nav} />}
      <View style={s.wrap}>
        <Label dark={post.kind === "win"}>
          {post.kind === "win"
            ? "✦ A LITTLE LOUDER FOR THE WINS"
            : post.kind.toUpperCase()}
        </Label>
        {post.tags.map((t) => (
          <Label key={t}>#{t}</Label>
        ))}
      </View>
      {detail && post.url && (
        <Button
          title="Open shared link ↗"
          secondary
          onPress={() => {
            if (/^https:\/\//i.test(post.url || ""))
              void Linking.openURL(post.url!).catch(() =>
                nav.toast("Could not open this link."),
              );
          }}
        />
      )}
      <View style={s.divider} />
      <View style={s.between}>
        <View style={s.row}>
          <Touch
            label="Upvote post"
            onPress={() =>
              void nav.run({ type: "post.vote", postId: post.id, value: 1 })
            }
            style={[
              s.row,
              {
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 20,
                backgroundColor:
                  post.votes[state.currentUserId] === 1
                    ? color.ink
                    : color.soft,
              },
            ]}
          >
            <Text
              style={{
                color:
                  post.votes[state.currentUserId] === 1 ? "#fff" : color.ink,
              }}
            >
              ↑ {votes}
            </Text>
          </Touch>
          <Touch
            label="Downvote post"
            onPress={() =>
              void nav.run({ type: "post.vote", postId: post.id, value: -1 })
            }
            style={{ padding: 7 }}
          >
            <Text
              style={{
                color:
                  post.votes[state.currentUserId] === -1
                    ? color.ink
                    : color.muted,
              }}
            >
              ↓
            </Text>
          </Touch>
          <Touch
            label={`${post.comments.length} comments`}
            onPress={() => !detail && nav.open({ kind: "post", id: post.id })}
            style={{ padding: 7 }}
          >
            <Text style={s.small}>◌ {post.comments.length}</Text>
          </Touch>
        </View>
        <View style={s.row}>
          <Touch
            label={saved ? "Unsave post" : "Save post"}
            onPress={() =>
              void nav.run(
                { type: "post.save", postId: post.id },
                saved ? "Removed from saved" : "Saved for later",
              )
            }
            style={{ padding: 8 }}
          >
            <Text style={{ color: color.ink, fontSize: 18 }}>
              {saved ? "◆" : "◇"}
            </Text>
          </Touch>
          <Touch
            label="More post actions"
            onPress={() =>
              mine
                ? Alert.alert(
                    "Your conversation",
                    post.title,
                    [
                      {
                        text: "Edit post",
                        onPress: () =>
                          nav.open({ kind: "edit-post", id: post.id }),
                      },
                      {
                        text: "Delete post",
                        style: "destructive",
                        onPress: () => confirmPostDelete(post, nav),
                      },
                      { text: "Cancel", style: "cancel" },
                    ],
                    { cancelable: true },
                  )
                : Alert.alert(
                    "This conversation",
                    post.title,
                    [
                      {
                        text: "Share",
                        onPress: () =>
                          void Share.share({
                            message: `${post.title}\n\nJoin the conversation on TheLoop: theloop://post/${post.id}`,
                          }),
                      },
                      {
                        text: "Report",
                        onPress: () =>
                          void nav.run(
                            {
                              type: "report.create",
                              targetId: post.id,
                              targetType: "post",
                              reason: "Community guideline concern",
                            },
                            "Report sent to the moderation queue",
                          ),
                      },
                      { text: "Cancel", style: "cancel" },
                    ],
                    { cancelable: true },
                  )
            }
            style={{ padding: 8 }}
          >
            <Text style={s.small}>•••</Text>
          </Touch>
        </View>
      </View>
    </View>
  );
}

function PollBlock({ post, nav }: { post: Post; nav: Nav }) {
  const { state } = useLoop();
  const total = post.poll!.options.reduce((n, o) => n + o.voterIds.length, 0);
  const voted = post.poll!.options.some((o) =>
    o.voterIds.includes(state.currentUserId),
  );
  const closed = new Date(post.poll!.closesAt) < new Date();
  return (
    <View style={{ gap: 7 }}>
      {post.poll!.options.map((o) => (
        <Touch
          key={o.id}
          label={`Vote ${o.label}`}
          disabled={closed}
          onPress={() =>
            void nav.run({ type: "poll.vote", postId: post.id, optionId: o.id })
          }
          style={{
            borderWidth: 1,
            borderColor: o.voterIds.includes(state.currentUserId)
              ? color.ink
              : color.line,
            borderRadius: 10,
            overflow: "hidden",
            padding: 12,
          }}
        >
          {(voted || closed) && (
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${total ? Math.round((o.voterIds.length / total) * 100) : 0}%`,
                backgroundColor: color.soft,
              }}
            />
          )}
          <View style={s.between}>
            <Text
              style={{
                fontSize: 13,
                lineHeight: 19,
                color: color.ink,
                flex: 1,
              }}
            >
              {o.label}
            </Text>
            {(voted || closed) && (
              <Text style={s.small}>
                {total ? Math.round((o.voterIds.length / total) * 100) : 0}%
              </Text>
            )}
          </View>
        </Touch>
      ))}
      <Text style={s.small}>
        {total} votes ·{" "}
        {closed ? "Poll closed" : "One choice, change it anytime"}
      </Text>
    </View>
  );
}

export function PostDetail({ id, nav }: { id: string; nav: Nav }) {
  const { state } = useLoop();
  const post = state.posts.find((p) => p.id === id);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!post)
    return (
      <Empty
        title="Conversation unavailable"
        body="It may have been removed or you may no longer have access."
      />
    );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <PostCard post={post} nav={nav} detail />
      {post.authorId === state.currentUserId && (
        <View style={s.row}>
          <View style={s.grow}>
            <Button
              secondary
              title="Edit post"
              onPress={() => nav.open({ kind: "edit-post", id: post.id })}
            />
          </View>
          <View style={s.grow}>
            <Button
              secondary
              title="Delete post"
              onPress={() => confirmPostDelete(post, nav)}
            />
          </View>
        </View>
      )}
      <Button
        secondary
        title="Share conversation ↗"
        onPress={() =>
          void Share.share({
            message: `${post.title}\n\ntheloop://post/${post.id}`,
          })
        }
      />
      <Section
        title="The conversation"
        subtitle={`${post.comments.length} ${post.comments.length === 1 ? "reply" : "replies"}`}
      />
      {post.comments
        .filter((c) => !state.preferences.blockedIds.includes(c.authorId))
        .map((c) => (
          <CommentItem key={c.id} comment={c} postId={post.id} nav={nav} />
        ))}
      {post.comments.length === 0 && (
        <Text style={s.small}>
          Bring a perspective. Ask a question. Open a door.
        </Text>
      )}
      <Field
        value={body}
        onChangeText={setBody}
        multiline
        placeholder="Add to the conversation…"
      />
      <Button
        title={busy ? "Posting…" : "Post reply ↗"}
        disabled={busy || !body.trim()}
        onPress={() => {
          setBusy(true);
          void nav
            .run({ type: "post.comment", postId: id, body })
            .then((ok) => {
              if (ok) setBody("");
            })
            .finally(() => setBusy(false));
        }}
      />
    </ScrollView>
  );
}

function confirmPostDelete(post: Post, nav: Nav) {
  Alert.alert(
    "Delete your conversation?",
    "Your post and its replies will be removed. This cannot be undone.",
    [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete post",
        style: "destructive",
        onPress: () =>
          void nav
            .run(
              { type: "post.delete", postId: post.id },
              "Your post was deleted",
            )
            .then((ok) => {
              if (ok) nav.close();
            }),
      },
    ],
    { cancelable: true },
  );
}

export function EditPost({ id, nav }: { id: string; nav: Nav }) {
  const { state } = useLoop();
  const post = state.posts.find((p) => p.id === id);
  const [title, setTitle] = useState(post?.title || "");
  const [body, setBody] = useState(post?.body || "");
  const [tags, setTags] = useState(post?.tags.join(", ") || "");
  const [url, setUrl] = useState(post?.url || "");
  const [busy, setBusy] = useState(false);
  if (!post || post.authorId !== state.currentUserId)
    return (
      <Empty
        title="This edit belongs to its author"
        body="You can edit your own posts. Report a concern on someone else's conversation."
      />
    );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>A little more{`\n`}of your perspective.</Text>
      <Text style={s.body}>
        Make it clearer, add context, or fix a detail. The conversation and its
        replies stay together.
      </Text>
      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        maxLength={160}
      />
      <Field label="Your post" value={body} onChangeText={setBody} multiline />
      <Field
        label="Tags · comma separated"
        value={tags}
        onChangeText={setTags}
      />
      <Field
        label={
          post.kind === "link"
            ? "Website · required for a link post"
            : "Website · optional"
        }
        value={url}
        onChangeText={setUrl}
        keyboardType="url"
        placeholder="https://…"
      />
      <Text style={s.small}>
        {post.poll
          ? "Poll choices stay the same so every existing vote keeps its meaning."
          : "Edits are marked on your post."}
      </Text>
      <Button
        title={busy ? "Saving…" : "Save changes ↗"}
        disabled={busy || !title.trim() || !body.trim()}
        onPress={() => {
          if (
            (post.kind === "link" && !url.trim()) ||
            (url.trim() && !safeURL(url.trim()))
          ) {
            nav.toast("Use a valid website address for this link.");
            return;
          }
          setBusy(true);
          void nav
            .run(
              {
                type: "post.edit",
                postId: id,
                post: {
                  title,
                  body,
                  tags: tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  url: url.trim(),
                },
              },
              "Your post was updated",
            )
            .then((ok) => {
              if (ok) nav.close();
            })
            .finally(() => setBusy(false));
        }}
      />
      <Button secondary title="Cancel" onPress={nav.close} />
    </ScrollView>
  );
}

function CommentItem({
  comment,
  postId,
  nav,
}: {
  comment: Comment;
  postId: string;
  nav: Nav;
}) {
  const { state } = useLoop();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const mine = comment.authorId === state.currentUserId;
  const author = state.profiles.find((p) => p.id === comment.authorId);
  return (
    <View style={[s.row, { alignItems: "flex-start" }]}>
      <Avatar profile={author} size={32} />
      <View style={[s.grow, { gap: 7 }]}>
        <View style={s.between}>
          <Text style={[s.h3, { flex: 1 }]}>
            {author?.name || "Loop member"}
          </Text>
          <View style={{ alignItems: "flex-end" }}>
            <RelativeTime date={comment.editedAt || comment.createdAt} />
            {comment.editedAt && <Text style={s.small}>edited</Text>}
          </View>
        </View>
        {editing ? (
          <>
            <Field
              label="Edit your reply"
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={3000}
            />
            <View style={s.row}>
              <Button
                small
                title={busy ? "Saving…" : "Save reply"}
                disabled={busy || !body.trim()}
                onPress={() => {
                  setBusy(true);
                  void nav
                    .run(
                      {
                        type: "comment.edit",
                        postId,
                        commentId: comment.id,
                        body,
                      },
                      "Reply updated",
                    )
                    .then((ok) => {
                      if (ok) setEditing(false);
                    })
                    .finally(() => setBusy(false));
                }}
              />
              <Button
                small
                secondary
                title="Cancel"
                onPress={() => {
                  setEditing(false);
                  setBody(comment.body);
                }}
              />
            </View>
          </>
        ) : (
          <>
            <LinkifiedText text={comment.body} />
            <View style={s.row}>
              {mine ? (
                <>
                  <Touch
                    label="Edit your reply"
                    onPress={() => {
                      setBody(comment.body);
                      setEditing(true);
                    }}
                    style={{ paddingVertical: 9, paddingRight: 14 }}
                  >
                    <Text style={s.small}>Edit</Text>
                  </Touch>
                  <Touch
                    label="Delete your reply"
                    disabled={busy}
                    onPress={() =>
                      Alert.alert(
                        "Delete your reply?",
                        "This reply will be removed from the conversation.",
                        [
                          { text: "Keep it", style: "cancel" },
                          {
                            text: "Delete reply",
                            style: "destructive",
                            onPress: () => {
                              setBusy(true);
                              void nav
                                .run(
                                  {
                                    type: "comment.delete",
                                    postId,
                                    commentId: comment.id,
                                  },
                                  "Your reply was deleted",
                                )
                                .finally(() => setBusy(false));
                            },
                          },
                        ],
                        { cancelable: true },
                      )
                    }
                    style={{ paddingVertical: 9, paddingRight: 14 }}
                  >
                    <Text style={s.small}>Delete</Text>
                  </Touch>
                </>
              ) : (
                <Touch
                  label="Report this reply"
                  onPress={() =>
                    void nav.run(
                      {
                        type: "report.create",
                        targetId: comment.id,
                        targetType: "comment",
                        postId,
                        reason: "Community guideline concern in this reply",
                      },
                      "Reply reported to moderators",
                    )
                  }
                  style={{ paddingVertical: 9, paddingRight: 14 }}
                >
                  <Text style={s.small}>Report</Text>
                </Touch>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export function Compose({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [communityId, setCommunity] = useState(
    state.preferences.joinedCommunityIds[0] || state.communities[0]?.id || "",
  );
  const [kind, setKind] = useState<Post["kind"]>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState(
    "Coffee & connection\nA rooftop link-up\nA good panel",
  );
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>Put it in{`\n`}the loop.</Text>
      <Text style={s.body}>Good things happen when we share what we know.</Text>
      <Horizontal>
        {state.communities.map((c) => (
          <Chip
            key={c.id}
            title={`l/${c.slug}`}
            selected={communityId === c.id}
            onPress={() => setCommunity(c.id)}
          />
        ))}
      </Horizontal>
      <Horizontal>
        {(["discussion", "win", "opportunity", "poll", "link"] as const).map(
          (k) => (
            <Chip
              key={k}
              title={k}
              selected={kind === k}
              onPress={() => setKind(k)}
            />
          ),
        )}
      </Horizontal>
      <Field
        label="Give it a title"
        value={title}
        onChangeText={setTitle}
        placeholder="What's on your mind?"
        maxLength={160}
      />
      <Field
        label="The story"
        value={body}
        onChangeText={setBody}
        multiline
        placeholder="The details, the context, the good stuff…"
      />
      {kind === "link" && (
        <Field
          label="Link"
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          placeholder="https://…"
        />
      )}
      {kind === "poll" && (
        <Field
          label="Poll choices · one per line"
          value={options}
          onChangeText={setOptions}
          multiline
        />
      )}
      <Text style={s.small}>
        Keep it thoughtful. Protect people's privacy. Make room for a different
        perspective.
      </Text>
      <Button
        title={busy ? "Sharing…" : "Share with the community ↗"}
        disabled={busy || !title.trim() || !body.trim() || !communityId}
        onPress={() => {
          setBusy(true);
          void nav
            .run(
              {
                type: "post.create",
                communityId,
                title,
                body,
                kind,
                ...(kind === "poll"
                  ? {
                      options: options
                        .split("\n")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    }
                  : {}),
                ...(kind === "link" ? { url } : {}),
              },
              "Your post is in the loop",
            )
            .then((ok) => {
              if (ok) nav.close();
            })
            .finally(() => setBusy(false));
        }}
      />
    </ScrollView>
  );
}

export function Communities({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [search, setSearch] = useState("");
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Find your{`\n`}kind of people.</Text>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search communities…"
      />
      <Button
        secondary
        title="Create a community ＋"
        onPress={() => nav.open({ kind: "create-community" })}
      />
      {state.communities
        .filter((c) =>
          `${c.name} ${c.description}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((c) => (
          <View key={c.id} style={s.card}>
            <View style={s.between}>
              <Text style={{ fontSize: 30 }}>{c.icon || "◎"}</Text>
              <Label>{c.members.toLocaleString()} MEMBERS</Label>
            </View>
            <Text style={s.h2}>l/{c.slug}</Text>
            <Text style={s.body}>{c.description}</Text>
            <Text style={s.small}>
              {c.rules[0] || "Be kind. Share generously. Respect the room."}
            </Text>
            <View style={s.between}>
              <Button
                title={
                  state.preferences.joinedCommunityIds.includes(c.id)
                    ? "Joined ✓"
                    : "Join community"
                }
                secondary={state.preferences.joinedCommunityIds.includes(c.id)}
                onPress={() =>
                  void nav.run({ type: "community.join", communityId: c.id })
                }
              />
              <Touch
                label={`Notification preferences for ${c.name}`}
                onPress={() =>
                  pickSubscription(
                    c.name,
                    state.preferences.subscriptions[c.id] || "following",
                    (value) =>
                      void nav.run({
                        type: "subscription.set",
                        targetId: c.id,
                        value,
                      }),
                  )
                }
                style={{ padding: 12 }}
              >
                <Text style={s.small}>
                  {state.preferences.subscriptions[c.id] || "following"} ▾
                </Text>
              </Touch>
            </View>
          </View>
        ))}
    </ScrollView>
  );
}
export function CreateCommunity({ nav }: { nav: Nav }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Make room.</Text>
      <Text style={s.body}>
        Create a thoughtful corner of the internet for a shared interest.
      </Text>
      <Field
        label="Community name"
        value={name}
        onChangeText={setName}
        placeholder="Builders after dark"
        maxLength={60}
      />
      <Field
        label="What brings your people together?"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <View style={s.card}>
        <Text style={s.h3}>You're setting the tone.</Text>
        <Text style={s.small}>
          As the founding moderator, you'll help keep this space welcoming,
          relevant, and safe. Community guidelines apply everywhere.
        </Text>
      </View>
      <Button
        title="Create community ↗"
        disabled={!name.trim() || !description.trim()}
        onPress={() =>
          void nav
            .run(
              { type: "community.create", name, description },
              "Your community is ready",
            )
            .then((ok) => {
              if (ok) nav.close();
            })
        }
      />
    </ScrollView>
  );
}
