import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
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
    registerPushToken,
  } = useLoop();
  const [resetRequested, setResetRequested] = useState(false);
  const me = state.profiles.find((p) => p.id === state.currentUserId);
  if (!me)
    return (
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>A place for you.</Text>
        <Text style={s.body}>
          Your people, your conversations, your next opportunity.
        </Text>
        <Button
          title="Sign in or create an account ↗"
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
      <Text style={s.overline}>MAKE YOURSELF AT HOME</Text>
      <View style={s.between}>
        <Text style={s.title}>Your corner.</Text>
        <Touch
          label="Settings"
          onPress={() => nav.open({ kind: "settings" })}
          style={{ padding: 10 }}
        >
          <Text style={{ fontSize: 23, color: color.ink }}>⚙</Text>
        </Touch>
      </View>
      {mode === "live" && !emailVerified && <VerificationCard nav={nav} />}
      <View style={[s.card, { alignItems: "center", padding: 28, gap: 12 }]}>
        <Avatar profile={me} size={85} />
        <Text style={s.h2}>{me.name}</Text>
        <Text style={[s.small, { textAlign: "center" }]}>{me.headline}</Text>
        <View style={s.row}>
          <Label>◎ {me.trust.score} TRUST</Label>
          {me.verified && <Label>VERIFIED</Label>}
        </View>
        <Button
          secondary
          title="View your profile ↗"
          onPress={() => nav.open({ kind: "profile", id: me.id })}
        />
      </View>
      <View style={[s.wrap, { gap: 10 }]}>
        {[
          [String(count), "connections"],
          [String(me.followerCount || 0), "followers"],
          [String(state.preferences.followingIds.length), "following"],
          [String(upcoming), "upcoming plans"],
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
        action="Refine"
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
            title: "Your professional profile",
            subtitle: "Your story, skills, and open doors",
            route: "edit-profile",
          },
          {
            title: "Your communities",
            subtitle: `${state.preferences.joinedCommunityIds.length} corners of the loop`,
            route: "communities",
          },
          {
            title: "Privacy & notifications",
            subtitle: "Make the loop work for you",
            route: "settings",
          },
          {
            title: "Your trust score",
            subtitle: "Clear signals. No mystery metrics.",
            route: "trust",
          },
          {
            title: "Export your data",
            subtitle: "Your information stays yours",
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
              <Text style={s.small}>↗</Text>
            </Touch>
          </View>
        ))}
      </View>
      <Button
        secondary
        title={
          role === "member"
            ? "Your report history ↗"
            : "Community care · Moderator queue ↗"
        }
        onPress={() => nav.open({ kind: "safety" })}
      />
      {role !== "member" && (
        <Button
          secondary
          title="Manage conferences and rooms ↗"
          onPress={() => nav.open({ kind: "spaces" })}
        />
      )}
      {mode === "demo" ? (
        <View style={[s.card, { backgroundColor: color.soft }]}>
          <Text style={s.h3}>You're exploring the sample loop.</Text>
          <Text style={s.small}>
            People, messages, events, and reputation here are fictional. Your
            changes stay on this device.
          </Text>
          {resetRequested ? (
            <>
              <Text style={s.h3}>Start the sample loop over?</Text>
              <Text style={s.small}>
                Your local fictional preview changes will be cleared.
              </Text>
              <Button
                title="Reset preview"
                onPress={() => {
                  setResetRequested(false);
                  resetDemo();
                  nav.toast("A fresh loop is ready");
                }}
              />
              <Button
                secondary
                title="Keep exploring"
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
          BY US. FOR US. WITH US.
        </Text>
        <Text style={s.small}>TheLoop · early community preview</Text>
      </View>
    </ScrollView>
  );
}

function VerificationCard({ nav }: { nav: Nav }) {
  const { sendVerificationEmail, refreshVerification } = useLoop();
  const [busy, setBusy] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.h3}>One more thing: verify your email.</Text>
      <Text style={s.small}>
        It helps protect your account and adds a clear identity signal to your
        community trust.
      </Text>
      <Button
        secondary
        title={busy ? "Sending…" : "Send verification email"}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void sendVerificationEmail()
            .then(() => nav.toast("Verification email sent. Check your inbox."))
            .catch((e) => nav.toast(e.message))
            .finally(() => setBusy(false));
        }}
      />
      <Button
        secondary
        title="I've verified my email ↗"
        onPress={() =>
          void refreshVerification()
            .then((verified) =>
              nav.toast(
                verified
                  ? "Your email is verified."
                  : "Not verified yet. Open the link in your email, then try again.",
              ),
            )
            .catch((e) => nav.toast(e.message))
        }
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
      <Text style={s.title}>Tell your story.</Text>
      <Text style={s.body}>
        A little about what you do. A lot about who you are.
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
        placeholder="Building things that bring people together"
        maxLength={160}
      />
      <Field
        label="Company / what you're building"
        value={company}
        onChangeText={setCompany}
        maxLength={160}
      />
      <Field
        label="Home base"
        value={location}
        onChangeText={setLocation}
        placeholder="Houston, TX"
        maxLength={160}
      />
      <Field
        label="A bit about you"
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
        title={busy ? "Saving…" : "Save your story ↗"}
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
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#C7CAC0", true: color.ink }}
        thumbColor="#fff"
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
      <Text style={s.title}>A quieter kind{`\n`}of connected.</Text>
      <Text style={s.body}>
        Your boundaries make this a better place to be.
      </Text>
      <Section title="Your attention" />
      <DevicePushSettings nav={nav} />
      <View style={s.card}>
        <Toggle
          title="Hide unfollowed rooms"
          body="Keep only the rooms you've chosen in view."
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
          body="Let the loop wait while you recharge."
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
      <Text style={s.label}>Your catch-up digest</Text>
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
        Catch up on the rooms you follow. Live digests arrive in app around 9
        a.m. in your saved timezone. Quiet hours keep your evenings yours.
      </Text>
      <Section title="Who gets in" />
      <Text style={s.label}>Who can start private conversations with you?</Text>
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
        People you message can reply. Block a member to stop future messages, or
        mute a conversation to keep it quiet.
      </Text>
      <Text style={s.small}>
        Blocking overrides connections and follows. Hidden content stays hidden
        until you choose to bring it back.
      </Text>
      <Section
        title="Hidden rooms"
        subtitle="You can always change your mind"
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
        <Text style={s.small}>No rooms are hidden.</Text>
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
        title="Export my information ↗"
        onPress={() => nav.open({ kind: "export" })}
      />
      {mode === "live" && (
        <>
          <Button
            secondary
            title="Account sign-in"
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
      <Text style={s.h3}>Leave the loop</Text>
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
          Alert.alert(
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
      <Text style={s.overline}>MAKE THIS YOUR LOOP · {step} / 2</Text>
      <Text style={s.title}>
        {step === 1 ? "What are you\ninto?" : "Find your\nconversation."}
      </Text>
      <Text style={s.body}>
        {step === 1
          ? "Pick what feels like you. We will help you find your people."
          : "Follow a few rooms to get started. Everything else stays muted until you choose it."}
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
              <Text>{channels.includes(c.id) ? "●" : "○"}</Text>
            </View>
            <Text style={s.small}>{c.description}</Text>
          </Touch>
        ))
      )}
      <Button
        title={
          busy
            ? "Finding your people…"
            : step === 1
              ? "Find my rooms ↗"
              : "Welcome to your loop ↗"
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
              "Your loop is ready",
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
                  .then(() => nav.close());
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
      <Text style={s.small}>
        You can change all of this anytime. This is your space.
      </Text>
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
        title="In your loop"
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
          title="All caught up"
          body="A little quiet is a good thing. We will keep the important things here."
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
      <Text style={s.title}>Trust is earned.{`\n`}And explained.</Text>
      <View
        style={[s.card, { backgroundColor: color.ink, borderColor: color.ink }]}
      >
        <Text
          style={{
            fontSize: 70,
            fontWeight: "500",
            letterSpacing: -3,
            color: "#fff",
          }}
        >
          {trust?.score || 0}
          <Text style={{ fontSize: 18, color: "#B4B8AB" }}>/100</Text>
        </Text>
        <Text style={[s.small, { color: "#C5C9BC" }]}>
          {mode === "demo"
            ? "Illustrative sample reputation. Live scores use verified activity."
            : "Your score is calculated by the server from verified community activity."}
        </Text>
      </View>
      <Section title="What goes into it" />
      {trust?.reasons.map((r) => (
        <View key={r} style={[s.row, { alignItems: "flex-start" }]}>
          <Text>✓</Text>
          <Text style={[s.body, { flex: 1 }]}>{r}</Text>
        </View>
      ))}
      <View style={s.card}>
        <Text style={s.h3}>Your worth is never a number.</Text>
        <Text style={s.small}>
          Trust supports safer community decisions. It is separate from identity
          verification, professional status, popularity, and follower counts.
          Scores should have clear evidence and a path to review.
        </Text>
      </View>
      <Section title="Something look wrong?" />
      <Text style={s.body}>
        Ask for a review. Give moderators the context they need.
      </Text>
      <Field
        label="Your review request"
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="Tell us what you'd like us to look at…"
      />
      <Button
        title={busy ? "Submitting…" : "Request a review ↗"}
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
      <Text style={s.title}>Your data.{`\n`}Your hands.</Text>
      <Text style={s.body}>
        Export your profile, settings, authored posts and messages, direct
        conversations, connections, and event RSVPs.
      </Text>
      <View style={s.card}>
        <Text style={s.h3}>A portable JSON export</Text>
        <Text style={s.small}>
          {data.posts.length} authored posts · {data.messages.length} room
          messages · {data.connections.length} connections
        </Text>
        <Text style={s.small}>
          {mode === "live"
            ? "The export retrieves your records from the server, including older history beyond this session."
            : "This preview export contains your fictional sample profile and local interactions."}
        </Text>
      </View>
      <Button
        title={busy ? "Preparing your export…" : "Export and share my data ↗"}
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
        This includes private conversations. Share only with a destination you
        trust.
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
      <Text style={s.title}>
        {creating ? "Find your people." : "Welcome\nback to the loop."}
      </Text>
      <Text style={s.body}>
        {creating
          ? "One account. Your communities, conversations, and next connections."
          : "Good conversations are waiting for you."}
      </Text>
      <Button
        secondary
        title="Explore public AfroTech events ↗"
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
            ? "One moment…"
            : creating
              ? "Create your account ↗"
              : "Sign in ↗"
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
          creating
            ? "Already in the loop? Sign in"
            : "New here? Create an account"
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
        By joining, you agree to keep the community thoughtful, safe, and
        respectful. Protect private information. Make room for each other.
      </Text>
    </ScrollView>
  );
}
