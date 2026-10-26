import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import {
  Avatar,
  Button,
  Chip,
  Empty,
  Field,
  Horizontal,
  Label,
  s,
  Section,
} from "./ui";
import type { Nav } from "./navigation";

export function Spaces({ nav }: { nav: Nav }) {
  const { state, role } = useLoop();
  const [view, setView] = useState("rooms");
  const [selected, setSelected] = useState("");
  if (role === "member")
    return (
      <Empty
        title="Organizer access required"
        body="Only moderators and administrators can manage group chats. Administrators manage conferences."
      />
    );
  if (view === "new-room")
    return <NewRoom nav={nav} done={() => setView("rooms")} />;
  if (view === "new-conference")
    return <NewConference nav={nav} done={() => setView("rooms")} />;
  if (view === "members")
    return (
      <Members channelId={selected} nav={nav} back={() => setView("rooms")} />
    );
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Manage group chats</Text>
      <Text style={s.body}>
        Create conference group chats, add topics and manage access.
      </Text>
      <Button
        title="Create group chat ＋"
        onPress={() => setView("new-room")}
      />
      {role === "admin" && (
        <Button
          secondary
          title="Create conference ＋"
          onPress={() => setView("new-conference")}
        />
      )}
      <Section title="Group chats" />
      {state.channels.map((c) => (
        <View key={c.id} style={s.card}>
          <View style={s.between}>
            <Text style={s.h3}>
              {c.icon} {c.name}
            </Text>
            <Label>{c.visibility.toUpperCase()}</Label>
          </View>
          <Text style={s.small}>
            {state.conferences.find((f) => f.id === c.conferenceId)?.name} ·{" "}
            {c.topics.length} topics
          </Text>
          <Text style={s.body}>{c.description}</Text>
          <Button
            secondary
            small
            title={
              c.visibility === "private" ? "Manage members" : "Open group chat"
            }
            onPress={() => {
              if (c.visibility === "private") {
                setSelected(c.id);
                setView("members");
              } else nav.open({ kind: "channel", id: c.id });
            }}
          />
        </View>
      ))}
    </ScrollView>
  );
}
function NewConference({ nav, done }: { nav: Nav; done: () => void }) {
  const [name, setName] = useState("");
  const [shortName, setShort] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [tagline, setTagline] = useState("");
  const [busy, setBusy] = useState(false);
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>Create conference</Text>
      <Field
        label="Conference name"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <Field
        label="Short name · up to 4 characters"
        value={shortName}
        onChangeText={setShort}
        placeholder="AT26"
        maxLength={4}
      />
      <Field label="City" value={city} onChangeText={setCity} maxLength={120} />
      <Field
        label="Starts · YYYY-MM-DD"
        value={startDate}
        onChangeText={setStart}
        maxLength={10}
      />
      <Field
        label="Ends · YYYY-MM-DD"
        value={endDate}
        onChangeText={setEnd}
        maxLength={10}
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={3000}
      />
      <Field
        label="Short description"
        value={tagline}
        onChangeText={setTagline}
        maxLength={140}
      />
      <Button
        title={busy ? "Creating…" : "Create conference"}
        disabled={
          busy ||
          !name.trim() ||
          !shortName.trim() ||
          !city.trim() ||
          !description.trim()
        }
        onPress={() => {
          if (
            !validDate(startDate) ||
            !validDate(endDate) ||
            endDate < startDate
          ) {
            nav.toast("Choose a valid conference date range.");
            return;
          }
          setBusy(true);
          void nav
            .run(
              {
                type: "conference.create",
                conference: {
                  name,
                  shortName,
                  city,
                  startDate,
                  endDate,
                  description,
                  tagline,
                },
              },
              "Conference created",
            )
            .then((ok) => {
              if (ok) done();
            })
            .finally(() => setBusy(false));
        }}
      />
      <Button secondary title="Back to group chats" onPress={done} />
    </ScrollView>
  );
}
function NewRoom({ nav, done }: { nav: Nav; done: () => void }) {
  const { state } = useLoop();
  const [conferenceId, setConference] = useState(
    state.conferences[0]?.id || "",
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("#");
  const [topics, setTopics] = useState("General\nIntroductions");
  const [privateRoom, setPrivate] = useState(false);
  const [communityId, setCommunity] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>Create group chat</Text>
      <Text style={s.label}>Conference</Text>
      <Horizontal>
        {state.conferences.map((c) => (
          <Chip
            key={c.id}
            title={c.shortName}
            selected={conferenceId === c.id}
            onPress={() => setConference(c.id)}
          />
        ))}
      </Horizontal>
      {!conferenceId && (
        <Text style={s.small}>
          Create a conference before adding group chats.
        </Text>
      )}
      <Field
        autoCapitalize="none"
        autoCorrect={false}
        label="Group chat name · letters, numbers, dashes"
        value={name}
        onChangeText={setName}
        placeholder="founders-after-dark"
        maxLength={50}
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
      />
      <Text style={s.label}>Chat icon</Text>
      <Horizontal>
        {["#", "◎", "↗", "◇", "☾", "◈"].map((mark) => (
          <Chip
            key={mark}
            title={mark}
            selected={icon === mark}
            onPress={() => setIcon(mark)}
          />
        ))}
      </Horizontal>
      <Field
        label="Starting topics · one per line"
        value={topics}
        onChangeText={setTopics}
        multiline
      />
      <Text style={s.label}>Who can join?</Text>
      <View style={s.row}>
        <Chip
          title="Public"
          selected={!privateRoom}
          onPress={() => setPrivate(false)}
        />
        <Chip
          title="Private · added members only"
          selected={privateRoom}
          onPress={() => setPrivate(true)}
        />
      </View>
      <Text style={s.small}>
        {privateRoom
          ? "You will be the group chat moderator. Add members after creating it."
          : "Signed-in members can follow this group chat."}
      </Text>
      <Text style={s.label}>Link a community · optional</Text>
      <Horizontal>
        <Chip
          title="No linked community"
          selected={!communityId}
          onPress={() => setCommunity("")}
        />
        {state.communities.map((c) => (
          <Chip
            key={c.id}
            title={`l/${c.slug}`}
            selected={communityId === c.id}
            onPress={() => setCommunity(c.id)}
          />
        ))}
      </Horizontal>
      <Button
        title={busy ? "Creating…" : "Create group chat"}
        disabled={busy || !conferenceId || !name.trim() || !description.trim()}
        onPress={() => {
          const slug = name.trim().toLowerCase();
          if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(slug)) {
            nav.toast(
              "Use letters, numbers and dashes for the group chat name.",
            );
            return;
          }
          setBusy(true);
          void nav
            .run(
              {
                type: "channel.create",
                channel: {
                  conferenceId,
                  name: slug,
                  description,
                  icon,
                  topics: topics
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                  visibility: privateRoom ? "private" : "public",
                  ...(privateRoom ? { memberIds: [state.currentUserId] } : {}),
                  ...(communityId ? { communityId } : {}),
                },
              },
              "Group chat created",
            )
            .then((ok) => {
              if (ok) done();
            })
            .finally(() => setBusy(false));
        }}
      />
      <Button secondary title="Back to group chats" onPress={done} />
    </ScrollView>
  );
}
function Members({
  channelId,
  nav,
  back,
}: {
  channelId: string;
  nav: Nav;
  back: () => void;
}) {
  const { state } = useLoop();
  const [search, setSearch] = useState("");
  const [memberId, setMemberId] = useState("");
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel)
    return (
      <Empty
        title="Group chat unavailable"
        body="It may have been removed or you may no longer have access."
      />
    );
  const people = state.profiles.filter(
    (p) =>
      p.id !== state.currentUserId &&
      !state.preferences.blockedIds.includes(p.id) &&
      `${p.name} ${p.headline}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>{channel.name}</Text>
      <Text style={s.body}>
        Only added members can read this group chat. Moderator membership cannot
        be removed here.
      </Text>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search members to add…"
      />
      {people.map((p) => {
        const member = channel.memberIds?.includes(p.id);
        const moderator = channel.moderatorIds?.includes(p.id);
        return (
          <View key={p.id} style={[s.row, { paddingVertical: 8 }]}>
            <Avatar profile={p} size={35} />
            <View style={s.grow}>
              <Text style={s.h3}>{p.name}</Text>
              <Text style={s.small}>
                {moderator
                  ? "Group chat moderator"
                  : member
                    ? "In this group chat"
                    : p.headline}
              </Text>
            </View>
            <Button
              small
              secondary={member}
              title={
                moderator ? "Moderator" : member ? "Remove" : "Add member ＋"
              }
              disabled={moderator}
              onPress={() =>
                void nav.run(
                  {
                    type: "channel.member",
                    channelId,
                    userId: p.id,
                    add: !member,
                  },
                  member ? "Member removed" : "Member added",
                )
              }
            />
          </View>
        );
      })}
      <View style={s.card}>
        <Text style={s.h3}>Add by member ID</Text>
        <Text style={s.small}>
          If someone is outside your discovery list, use their exact TheLoop
          member ID.
        </Text>
        <Field
          autoCapitalize="none"
          autoCorrect={false}
          value={memberId}
          onChangeText={setMemberId}
          placeholder="Member ID"
          maxLength={128}
        />
        <Button
          secondary
          title="Add this member"
          disabled={!memberId.trim()}
          onPress={() =>
            void nav
              .run(
                {
                  type: "channel.member",
                  channelId,
                  userId: memberId.trim(),
                  add: true,
                },
                "Member added",
              )
              .then((ok) => {
                if (ok) setMemberId("");
              })
          }
        />
      </View>
      <Button secondary title="Back to group chats" onPress={back} />
    </ScrollView>
  );
}
