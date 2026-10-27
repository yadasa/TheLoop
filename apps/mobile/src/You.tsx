import React, { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Switch, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import { interests, safeURL, subscriptionFor } from "@theloop/core";
import {
  Avatar,
  Button,
  Chip,
  color,
  Empty,
  Field,
  Horizontal,
  Label,
  Logo,
  s,
  Section,
  Touch,
  ThemeSwitcher,
} from "./ui";
import type { Nav } from "./navigation";
import {
  DevicePushSettings,
  unlinkDevicePush,
  routeNotification,
} from "./devicePush";
import { shareExport } from "./shareExport";

export function You({ nav }: { nav: Nav }) {
  const {
    state,
    mode,
    signOut,
    resetDemo,
    role,
    emailVerified,
    accountEmail,
    registerPushToken,
  } = useLoop();
  const [resetRequested, setResetRequested] = useState(false);
  const me = state.profiles.find((p) => p.id === state.currentUserId);
  if (!me)
    return (
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Your account</Text>
        <Text style={s.body}>
          Sign in to use group chats, communities and events.
        </Text>
        <Button
          title="Sign in or create an account"
          onPress={() => nav.open({ kind: "auth" })}
        />
      </ScrollView>
    );
  const count = state.connections.filter(
    (c) => c.status === "accepted" && [c.fromId, c.toId].includes(me.id),
  ).length;
  const upcoming = state.events.filter(
    (e) => e.attendeeIds.includes(me.id) && new Date(e.endAt) > new Date(),
  ).length;
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.overline}>YOUR ACCOUNT</Text>
      <View style={s.between}>
        <Text style={s.title}>Your profile</Text>
        <Touch
          label="Settings"
          onPress={() => nav.open({ kind: "settings" })}
          style={{ padding: 10 }}
        >
          <Text style={{ fontSize: 23, color: color.ink }}>⚙</Text>
        </Touch>
      </View>
      {mode === "live" && accountEmail && (
        <View style={s.card}>
          <Text style={s.label}>Signed in as</Text>
          <Text selectable style={s.body}>
            {accountEmail}
          </Text>
          <Text style={s.small}>Only you can see this account email.</Text>
        </View>
      )}
      {mode === "live" && !emailVerified && (
        <VerificationCard key={state.currentUserId} nav={nav} />
      )}
      <View style={[s.card, { alignItems: "center", padding: 28, gap: 12 }]}>
        <Avatar profile={me} size={85} />
        <Text style={s.h2}>{me.name}</Text>
        <Text style={[s.small, { textAlign: "center" }]}>{me.headline}</Text>
        <View style={s.row}>
          <Label>◎ {me.trust.score} TRUST</Label>
          {me.verified && <Label>EMAIL VERIFIED</Label>}
        </View>
        <Button
          secondary
          title="View your profile"
          onPress={() => nav.open({ kind: "profile", id: me.id })}
        />
      </View>
      <View style={[s.wrap, { gap: 10 }]}>
        {[
          [String(count), count === 1 ? "connection" : "connections"],
          [
            String(me.followerCount || 0),
            me.followerCount === 1 ? "follower" : "followers",
          ],
          [String(state.preferences.followingIds.length), "following"],
          [
            String(upcoming),
            upcoming === 1 ? "upcoming event" : "upcoming events",
          ],
        ].map(([value, label]) => (
          <View
            key={label}
            style={[
              s.card,
              {
                flexGrow: 1,
                minWidth: "45%",
                padding: 14,
                alignItems: "center",
                gap: 5,
              },
            ]}
          >
            <Text style={{ fontSize: 25, fontWeight: "600", color: color.ink }}>
              {value}
            </Text>
            <Text style={[s.small, { fontSize: 10, textAlign: "center" }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Section
        title="Your interests"
        action="Edit"
        onAction={() => nav.open({ kind: "onboarding" })}
      />
      <View style={s.wrap}>
        {state.preferences.interests.map((i) => (
          <Chip
            key={i}
            title={i}
            onPress={() => nav.open({ kind: "onboarding" })}
          />
        ))}
      </View>
      <View style={s.card}>
        {[
          {
            title: "Quick tour",
            subtitle: "Group chats, topics, events and privacy settings",
            route: "tutorial",
          },
          {
            title: "Edit profile",
            subtitle: "Update your work, skills and links",
            route: "edit-profile",
          },
          {
            title: "Communities",
            subtitle: `${state.preferences.joinedCommunityIds.length} joined ${state.preferences.joinedCommunityIds.length === 1 ? "community" : "communities"}`,
            route: "communities",
          },
          {
            title: "Privacy & notifications",
            subtitle: "Manage visibility and notifications",
            route: "settings",
          },
          {
            title: "Trust score",
            subtitle: "Review the signals behind your score",
            route: "trust",
          },
          {
            title: "Export your data",
            subtitle: "Download your account information",
            route: "export",
          },
        ].map((item, i) => (
          <View key={item.route}>
            {i > 0 && <View style={s.divider} />}
            <Touch
              label={item.title}
              onPress={() => nav.open({ kind: item.route as "settings" })}
              style={[s.between, { paddingVertical: 13 }]}
            >
              <View style={s.grow}>
                <Text style={[s.h3, { fontSize: 15 }]}>{item.title}</Text>
                <Text style={s.small}>{item.subtitle}</Text>
              </View>
              <Text style={s.small}>›</Text>
            </Touch>
          </View>
        ))}
      </View>
      <Button
        secondary
        title={
          role === "member" ? "Your report history" : "Review member reports"
        }
        onPress={() => nav.open({ kind: "safety" })}
      />
      {role !== "member" && (
        <Button
          secondary
          title="Manage conferences and group chats"
          onPress={() => nav.open({ kind: "spaces" })}
        />
      )}
      {mode === "demo" ? (
        <View style={[s.card, { backgroundColor: color.soft }]}>
          <Text style={s.h3}>Sample data</Text>
          <Text style={s.small}>
            People, messages, events, and reputation here are fictional. Your
            changes stay on this device.
          </Text>
          {resetRequested ? (
            <>
              <Text style={s.h3}>Reset sample data?</Text>
              <Text style={s.small}>
                Your local fictional preview changes will be cleared.
              </Text>
              <Button
                title="Reset preview"
                onPress={() => {
                  setResetRequested(false);
                  resetDemo();
                  nav.toast("Sample data reset");
                }}
              />
              <Button
                secondary
                title="Cancel"
                onPress={() => setResetRequested(false)}
              />
            </>
          ) : (
            <Button
              secondary
              title="Reset sample data"
              onPress={() => setResetRequested(true)}
            />
          )}
        </View>
      ) : (
        <Button
          secondary
          title="Sign out"
          onPress={() =>
            void unlinkDevicePush(state.currentUserId, registerPushToken)
              .then(() => signOut())
              .then(() => nav.toast("Signed out"))
              .catch((e) => nav.toast(e.message))
          }
        />
      )}
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 20 }}>
        <Logo size={25} />
        <Text style={[s.small, { fontSize: 10, letterSpacing: 2 }]}>
          THELOOP
        </Text>
        <Text style={s.small}>TheLoop · early community preview</Text>
      </View>
    </ScrollView>
  );
}

function VerificationCard({ nav }: { nav: Nav }) {
  const { sendVerificationEmail, refreshVerification, accountEmail } =
    useLoop();
  const [busy, setBusy] = useState<"sending" | "checking" | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = (action: "sending" | "checking") => {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    void (async () => {
      if (action === "sending") {
        await sendVerificationEmail();
        if (mounted.current)
          nav.toast("Verification email sent. Check your inbox.");
      } else {
        const verified = await refreshVerification();
        if (mounted.current)
          nav.toast(
            verified
              ? "Your email is verified."
              : "Not verified yet. Open the link in your email, then try again.",
          );
      }
    })()
      .catch((error) => {
        if (mounted.current)
          nav.toast(
            error instanceof Error
              ? error.message
              : "Could not check verification. Try again.",
          );
      })
      .finally(() => {
        pending.current = false;
        if (mounted.current) setBusy(null);
      });
  };
  return (
    <View style={s.card}>
      <Text style={s.h3}>Verify your email</Text>
      {accountEmail && (
        <Text selectable style={s.body}>
          {accountEmail}
        </Text>
      )}
      <Text style={s.small}>
        Confirm that you control your email address. Email verification appears
        on your profile.
      </Text>
      <Button
        secondary
        title={busy === "sending" ? "Sending…" : "Send verification email"}
        disabled={busy !== null}
        onPress={() => run("sending")}
      />
      <Button
        secondary
        title={busy === "checking" ? "Checking…" : "I've verified my email"}
        disabled={busy !== null}
        onPress={() => run("checking")}
      />
    </View>
  );
}

export function EditProfile({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const me = state.profiles.find((p) => p.id === state.currentUserId);
  const [name, setName] = useState(me?.name || "");
  const [headline, setHeadline] = useState(me?.headline || "");
  const [company, setCompany] = useState(me?.company || "");
  const [location, setLocation] = useState(me?.location || "");
  const [bio, setBio] = useState(me?.bio || "");
  const [skills, setSkills] = useState(me?.skills.join(", ") || "");
  const [openTo, setOpen] = useState(me?.openTo.join(", ") || "");
  const [links, setLinks] = useState(
    me?.links.map((l) => `${l.label} | ${l.url}`).join("\n") || "",
  );
  const [visibility, setVisibility] = useState(me?.visibility || "public");
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>Edit profile</Text>
      <Text style={s.body}>
        Add the work, skills and interests you want to share.
      </Text>
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <Field
        label="Your headline"
        value={headline}
        onChangeText={setHeadline}
        placeholder="Product designer at your company"
        maxLength={160}
      />
      <Field
        label="Company or project"
        value={company}
        onChangeText={setCompany}
        maxLength={160}
      />
      <Field
        label="Location"
        value={location}
        onChangeText={setLocation}
        placeholder="Houston, TX"
        maxLength={160}
      />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={1500}
      />
      <Field
        label="Skills · comma separated"
        value={skills}
        onChangeText={setSkills}
        placeholder="Product design, Engineering, Community"
      />
      <Field
        label="Open to · comma separated"
        value={openTo}
        onChangeText={setOpen}
        placeholder="Mentoring, New opportunities, Collaborating"
      />
      <Field
        label="Social links · one per line as Label | https://…"
        value={links}
        onChangeText={setLinks}
        multiline
        placeholder="LinkedIn | https://www.linkedin.com/in/yourname"
      />
      <Text style={s.label}>Who can see your full profile?</Text>
      <View style={s.row}>
        <Chip
          title="Everyone"
          selected={visibility === "public"}
          onPress={() => setVisibility("public")}
        />
        <Chip
          title="Connections"
          selected={visibility === "connections"}
          onPress={() => setVisibility("connections")}
        />
      </View>
      <Text style={s.small}>
        Your name and initials can appear with content you share. Professional
        details follow this visibility setting. Trust signals are managed by the
        platform.
      </Text>
      <Button
        title={busy ? "Saving…" : "Save profile"}
        disabled={busy || !name.trim()}
        onPress={() => {
          const parsed = links
            .split("\n")
            .filter((l) => l.trim())
            .map((line) => {
              const split = line.indexOf("|");
              return {
                label: split > -1 ? line.slice(0, split).trim() : "Website",
                url: (split > -1 ? line.slice(split + 1) : line).trim(),
              };
            });
          if (parsed.some((l) => !safeURL(l.url))) {
            nav.toast("Use a valid http or https address for every link.");
            return;
          }
          setBusy(true);
          void nav
            .run(
              {
                type: "profile.update",
                profile: {
                  name,
                  headline,
                  company,
                  location,
                  bio,
                  skills: skills
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                  openTo: openTo
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                  links: parsed,
                  visibility,
                },
              },
              "Profile updated",
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

function Toggle({
  title,
  body,
  value,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={[s.between, { paddingVertical: 9 }]}>
      <View style={s.grow}>
        <Text style={[s.h3, { fontSize: 15 }]}>{title}</Text>
        <Text style={s.small}>{body}</Text>
      </View>
      <Switch
        {...(Platform.OS === "web"
          ? { activeThumbColor: color.onInk, activeTrackColor: color.ink }
          : {})}
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: color.line, true: color.ink }}
        thumbColor={value ? color.onInk : color.ink}
        ios_backgroundColor={color.line}
      />
    </View>
  );
}
function QuietHours({
  nav,
  start,
  end,
}: {
  nav: Nav;
  start: string;
  end: string;
}) {
  const [from, setFrom] = useState(start);
  const [until, setUntil] = useState(end);
  return (
    <View style={{ gap: 10 }}>
      <View style={s.row}>
        <View style={s.grow}>
          <Field
            label="From · HH:MM"
            value={from}
            onChangeText={setFrom}
            maxLength={5}
          />
        </View>
        <View style={s.grow}>
          <Field
            label="Until · HH:MM"
            value={until}
            onChangeText={setUntil}
            maxLength={5}
          />
        </View>
      </View>
      <Button
        secondary
        small
        title="Save quiet hours"
        onPress={() => {
          if (
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(from) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(until)
          ) {
            nav.toast("Use a 24-hour time, such as 22:00 or 07:00.");
            return;
          }
          void nav.run(
            {
              type: "preferences.update",
              preferences: { quietStart: from, quietEnd: until },
            },
            "Quiet hours updated",
          );
        }}
      />
    </View>
  );
}
export function Settings({ nav }: { nav: Nav }) {
  const { state, mode } = useLoop();
  const p = state.preferences;
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Settings</Text>
      <Text style={s.body}>Manage appearance, notifications and privacy.</Text>
      <View style={s.card}>
        <Section
          title="Appearance"
          subtitle="Dark by default. Your choice stays on this device."
        />
        <ThemeSwitcher compact={false} />
      </View>
      <Section title="Notifications" />
      <DevicePushSettings nav={nav} />
      <View style={s.card}>
        <Toggle
          title="Hide group chats you do not follow"
          body="Show only the group chats you follow."
          value={p.hideUnsubscribed}
          onChange={(v) =>
            void nav.run({
              type: "preferences.update",
              preferences: { hideUnsubscribed: v },
            })
          }
        />
        <View style={s.divider} />
        <Toggle
          title="Quiet hours"
          body="Pause notifications during the hours you choose."
          value={p.quietHours}
          onChange={(v) =>
            void nav.run({
              type: "preferences.update",
              preferences: { quietHours: v },
            })
          }
        />
        {p.quietHours && (
          <QuietHours nav={nav} start={p.quietStart} end={p.quietEnd} />
        )}
        <View style={s.divider} />
        <Toggle
          title="Event reminders"
          body="Include a reminder when adding plans to your calendar."
          value={p.eventReminders}
          onChange={(v) =>
            void nav.run({
              type: "preferences.update",
              preferences: { eventReminders: v },
            })
          }
        />
      </View>
      <Text style={s.label}>Digest</Text>
      <Horizontal>
        {(["off", "daily", "weekly"] as const).map((value) => (
          <Chip
            key={value}
            title={value}
            selected={p.digest === value}
            onPress={() =>
              void nav.run({
                type: "preferences.update",
                preferences: { digest: value },
              })
            }
          />
        ))}
      </Horizontal>
      <Text style={s.small}>
        Get a digest of group chats you follow. Live digests arrive in the app
        around 9 a.m. in your saved timezone and respect quiet hours.
      </Text>
      <Section title="Direct messages" />
      <Text style={s.label}>Who can start a direct message with you?</Text>
      <Horizontal>
        {(["connections", "everyone", "nobody"] as const).map((value) => (
          <Chip
            key={value}
            title={
              value === "nobody"
                ? "No new conversations"
                : value === "connections"
                  ? "Connections"
                  : "Everyone"
            }
            selected={p.dmPolicy === value}
            onPress={() =>
              void nav.run({
                type: "preferences.update",
                preferences: { dmPolicy: value },
              })
            }
          />
        ))}
      </Horizontal>
      <Text style={s.small}>
        People you message can reply. Block someone to stop future messages, or
        mute their direct messages to turn off notifications.
      </Text>
      <Text style={s.small}>
        Blocking applies even if you are connected or follow each other. You can
        manage hidden chats and blocked members below.
      </Text>
      <Section
        title="Hidden group chats"
        subtitle="Restore a chat to your list"
      />
      {state.channels
        .filter((c) => p.subscriptions[c.id] === "hidden")
        .map((c) => (
          <View key={c.id} style={s.between}>
            <Text style={s.h3}># {c.name}</Text>
            <Button
              small
              secondary
              title="Restore muted"
              onPress={() =>
                void nav.run({
                  type: "subscription.set",
                  targetId: c.id,
                  value: "muted",
                })
              }
            />
          </View>
        ))}
      {!state.channels.some((c) => p.subscriptions[c.id] === "hidden") && (
        <Text style={s.small}>No hidden group chats.</Text>
      )}
      <Section title="Blocked members" />
      {p.blockedIds.map((id) => (
        <View key={id} style={s.between}>
          <Text style={s.h3}>
            {state.profiles.find((m) => m.id === id)?.name || "Member"}
          </Text>
          <Button
            small
            secondary
            title="Unblock"
            onPress={() => void nav.run({ type: "profile.block", userId: id })}
          />
        </View>
      ))}
      {p.blockedIds.length === 0 && (
        <Text style={s.small}>No blocked members.</Text>
      )}
      <Button
        secondary
        title="Export my information"
        onPress={() => nav.open({ kind: "export" })}
      />
      {mode === "live" && (
        <>
          <Button
            secondary
            title="Sign in again or switch account"
            onPress={() => nav.open({ kind: "auth" })}
          />
          <DeleteAccount nav={nav} />
        </>
      )}
    </ScrollView>
  );
}

function DeleteAccount({ nav }: { nav: Nav }) {
  const { deleteAccount } = useLoop();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.h3}>Delete account</Text>
      <Text style={s.small}>
        Delete your account and personal records. This cannot be undone. For
        your protection, sign in again first if your session is older than five
        minutes.
      </Text>
      <Field
        label="Type DELETE to confirm"
        value={confirmation}
        onChangeText={setConfirmation}
        maxLength={6}
      />
      <Button
        secondary
        title={busy ? "Deleting…" : "Delete my account"}
        disabled={busy || confirmation !== "DELETE"}
        onPress={() =>
          nav.alert(
            "Permanently delete your account?",
            "Your profile, preferences and personal content will be removed. This action cannot be undone.",
            [
              { text: "Keep my account", style: "cancel" },
              {
                text: "Delete account",
                style: "destructive",
                onPress: () => {
                  setBusy(true);
                  void deleteAccount(confirmation)
                    .then(() => {
                      nav.close();
                      nav.toast("Your account has been deleted.");
                    })
                    .catch((e) => nav.toast(e.message))
                    .finally(() => setBusy(false));
                },
              },
            ],
          )
        }
      />
    </View>
  );
}

export function Onboarding({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const eligibleChannels = state.channels.filter(
    (c) =>
      c.visibility === "public" || c.memberIds?.includes(state.currentUserId),
  );
  const [chosen, setChosen] = useState<string[]>(state.preferences.interests);
  const [channels, setChannels] = useState<string[]>(
    eligibleChannels
      .filter(
        (c) => subscriptionFor(state, c.id, c.conferenceId) === "following",
      )
      .map((c) => c.id),
  );
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Logo size={38} />
      <Text style={s.overline}>SET UP THELOOP · {step} / 2</Text>
      <Text style={s.title}>
        {step === 1 ? "Choose interests" : "Choose group chats"}
      </Text>
      <Text style={s.body}>
        {step === 1
          ? "Choose your interests to help suggest connections."
          : "Select the group chats you want updates from. Other chats stay muted until you follow them."}
      </Text>
      {step === 1 ? (
        <View style={[s.wrap, { gap: 10, marginTop: 6 }]}>
          {interests.map((i) => (
            <Chip
              key={i}
              title={i}
              selected={chosen.includes(i)}
              onPress={() =>
                setChosen(
                  chosen.includes(i)
                    ? chosen.filter((v) => v !== i)
                    : chosen.length < 12
                      ? [...chosen, i]
                      : chosen,
                )
              }
            />
          ))}
        </View>
      ) : (
        eligibleChannels.map((c) => (
          <Touch
            key={c.id}
            label={`Select ${c.name}`}
            onPress={() =>
              setChannels(
                channels.includes(c.id)
                  ? channels.filter((v) => v !== c.id)
                  : [...channels, c.id],
              )
            }
            style={[
              s.card,
              { borderColor: channels.includes(c.id) ? color.ink : color.line },
            ]}
          >
            <View style={s.between}>
              <Text style={s.h3}>
                {c.icon} {c.name}
              </Text>
              <Text style={{ color: color.ink }}>
                {channels.includes(c.id) ? "●" : "○"}
              </Text>
            </View>
            <Text style={s.small}>{c.description}</Text>
          </Touch>
        ))
      )}
      <Button
        title={
          busy ? "Saving…" : step === 1 ? "Choose group chats" : "Save choices"
        }
        disabled={busy || (step === 1 && chosen.length === 0)}
        onPress={() => {
          if (step === 1) {
            setStep(2);
            return;
          }
          setBusy(true);
          void nav
            .run(
              {
                type: "onboarding.complete",
                interests: chosen,
                channelIds: channels.filter((id) =>
                  eligibleChannels.some((c) => c.id === id),
                ),
                replaceChannels: true,
                channelScopeIds: eligibleChannels.map((c) => c.id),
              },
              "Choices saved",
            )
            .then((ok) => {
              if (ok)
                void nav
                  .run({
                    type: "preferences.update",
                    preferences: {
                      timezone:
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                    },
                  })
                  .then(() => nav.closeIfTop("onboarding"));
            })
            .finally(() => setBusy(false));
        }}
      />
      {step === 2 && (
        <Button
          secondary
          title="Back to interests"
          onPress={() => setStep(1)}
        />
      )}
      <Text style={s.small}>Change these choices later from You.</Text>
    </ScrollView>
  );
}

export function Notifications({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const items = state.notifications
    .filter((n) => n.userId === state.currentUserId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Section
        title="Notifications"
        action="Mark all read"
        onAction={() => void nav.run({ type: "notification.read" })}
      />
      {items.map((n) => (
        <Touch
          key={n.id}
          label={n.title}
          onPress={() => {
            void nav.run({ type: "notification.read", notificationId: n.id });
            routeNotification(state, n.kind, n.targetId, nav);
          }}
          style={[
            s.card,
            { backgroundColor: n.read ? color.card : color.soft },
          ]}
        >
          <View style={s.between}>
            <Label>{n.kind.toUpperCase()}</Label>
            {!n.read && (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 4,
                  backgroundColor: color.ink,
                }}
              />
            )}
          </View>
          <Text style={s.h3}>{n.title}</Text>
          <Text style={s.body}>{n.body}</Text>
          <Text style={s.small}>{new Date(n.createdAt).toLocaleString()}</Text>
        </Touch>
      ))}
      {items.length === 0 && (
        <Empty
          title="No notifications"
          body="Message, connection and event updates will appear here."
        />
      )}
    </ScrollView>
  );
}

export function Trust({ nav }: { nav: Nav }) {
  const { state, mode, appealTrust, getTrust } = useLoop();
  const me = state.profiles.find((p) => p.id === state.currentUserId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [latestTrust, setLatestTrust] = useState<{
    score: number;
    reasons: string[];
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (mode === "live")
      void getTrust(state.currentUserId)
        .then((value) => {
          const response = value as {
            trust?: { score: number; reasons: string[] };
          };
          if (active && response.trust) setLatestTrust(response.trust);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [mode, state.currentUserId]);
  const trust = latestTrust || me?.trust;
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Trust score</Text>
      <View
        style={[
          s.card,
          { backgroundColor: color.hero, borderColor: color.heroLine },
        ]}
      >
        <Text
          style={{
            fontSize: 70,
            fontWeight: "500",
            letterSpacing: -3,
            color: color.onHero,
          }}
        >
          {trust?.score || 0}
          <Text style={{ fontSize: 18, color: color.heroMuted }}>/100</Text>
        </Text>
        <Text style={[s.small, { color: color.heroMuted }]}>
          {mode === "demo"
            ? "Illustrative sample reputation. Live scores use verified activity."
            : "Your score is calculated by the server from verified community activity."}
        </Text>
      </View>
      <Section title="What goes into it" />
      {trust?.reasons.map((r) => (
        <View key={r} style={[s.row, { alignItems: "flex-start" }]}>
          <Text style={{ color: color.ink }}>✓</Text>
          <Text style={[s.body, { flex: 1 }]}>{r}</Text>
        </View>
      ))}
      <View style={s.card}>
        <Text style={s.h3}>What the score means</Text>
        <Text style={s.small}>
          Review the activity signals listed here. A trust score does not verify
          identity, professional credentials or personal safety. You can request
          a review below.
        </Text>
      </View>
      <Section title="Request a score review" />
      <Text style={s.body}>
        Describe the issue so moderators can review it.
      </Text>
      <Field
        label="Your review request"
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="Tell us what you'd like us to look at…"
      />
      <Button
        title={busy ? "Submitting…" : "Request a review"}
        disabled={busy || !reason.trim()}
        onPress={() => {
          setBusy(true);
          void appealTrust(reason)
            .then(() => {
              setReason("");
              nav.toast("Your trust review request was submitted.");
            })
            .catch((e) => nav.toast(e.message))
            .finally(() => setBusy(false));
        }}
      />
    </ScrollView>
  );
}

export function ExportData({ nav }: { nav: Nav }) {
  const { state, mode, exportAccount } = useLoop();
  const [busy, setBusy] = useState(false);
  const id = state.currentUserId;
  const data = {
    exportedAt: new Date().toISOString(),
    mode,
    profile: state.profiles.find((p) => p.id === id),
    preferences: state.preferences,
    posts: state.posts.filter((p) => p.authorId === id),
    messages: state.messages.filter((m) => m.authorId === id),
    directMessages: state.directMessages.filter(
      (m) => m.fromId === id || m.toId === id,
    ),
    connections: state.connections.filter(
      (c) => c.fromId === id || c.toId === id,
    ),
    eventIds: state.events
      .filter((e) => e.attendeeIds.includes(id) || e.waitlistIds.includes(id))
      .map((e) => e.id),
  };
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Export account data</Text>
      <Text style={s.body}>
        Export your profile, settings, authored posts and messages, direct
        messages, connections and event RSVPs.
      </Text>
      <View style={s.card}>
        <Text style={s.h3}>JSON file</Text>
        <Text style={s.small}>
          {data.posts.length} authored posts · {data.messages.length} group chat
          messages · {data.connections.length} connections
        </Text>
        <Text style={s.small}>
          {mode === "live"
            ? "The export retrieves your records from the server, including older history beyond this session."
            : "This preview export contains your fictional sample profile and local interactions."}
        </Text>
      </View>
      <Button
        title={busy ? "Preparing your export…" : "Export and share my data"}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void exportAccount()
            .then((exported) => shareExport(exported))
            .catch((e) =>
              nav.toast(e.message || "Sharing is unavailable on this device."),
            )
            .finally(() => setBusy(false));
        }}
      />
      <Text style={s.small}>
        This includes direct messages. Share only with a destination you trust.
      </Text>
    </ScrollView>
  );
}

export function Auth({ nav }: { nav: Nav }) {
  const { state, mode, signIn, signUp, resetPassword, registerPushToken } =
    useLoop();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Logo size={42} />
      <Text style={s.title}>{creating ? "Create account" : "Sign in"}</Text>
      <Text style={s.body}>
        {creating
          ? "Join group chats and communities, find events and connect with members."
          : "Sign in to your account."}
      </Text>
      <Button
        secondary
        title="Explore public AfroTech events"
        onPress={() => nav.open({ kind: "guide" })}
      />
      {mode === "demo" && (
        <View style={s.card}>
          <Text style={s.small}>
            This build is in sample mode. A live Firebase configuration is
            needed for real accounts. You can explore every sample interaction
            without signing in.
          </Text>
        </View>
      )}
      {creating && (
        <Field label="Your name" value={name} onChangeText={setName} />
      )}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <Field
        label={creating ? "Password · at least 8 characters" : "Password"}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        title={
          busy
            ? creating
              ? "Creating account…"
              : "Signing in…"
            : creating
              ? "Create your account"
              : "Sign in"
        }
        disabled={
          busy ||
          !email.trim() ||
          password.length < (creating ? 8 : 6) ||
          (creating && !name.trim())
        }
        onPress={() => {
          setBusy(true);
          void (async () => {
            if (mode === "live" && state.currentUserId)
              await unlinkDevicePush(state.currentUserId, registerPushToken);
            return creating
              ? signUp(email.trim(), password, name)
              : signIn(email.trim(), password);
          })()
            .then(() => nav.closeIfTop("auth"))
            .catch((e) => nav.toast(e.message))
            .finally(() => setBusy(false));
        }}
      />
      <Button
        secondary
        title={
          creating ? "Already have an account? Sign in" : "Create an account"
        }
        onPress={() => setCreating(!creating)}
      />
      {!creating && (
        <Touch
          label="Reset password"
          onPress={() => {
            if (!email.trim()) {
              nav.toast("Enter your email first.");
              return;
            }
            void resetPassword(email.trim())
              .then(() =>
                nav.toast("Password reset email requested. Check your inbox."),
              )
              .catch((e) => nav.toast(e.message));
          }}
          style={{ padding: 10, alignItems: "center" }}
        >
          <Text style={s.small}>Forgot your password?</Text>
        </Touch>
      )}
      <Text style={s.small}>
        Follow the community guidelines. Do not post someone else’s private
        information without permission.
      </Text>
    </ScrollView>
  );
}
