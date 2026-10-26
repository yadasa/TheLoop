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
        title="This corner is for organizers"
        body="Conference hubs and rooms are managed by community organizers and moderators."
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
      <Text style={s.title}>Make a little{`\n`}more room.</Text>
      <Text style={s.body}>
        Create thoughtful spaces. Keep the conversations relevant and the
        boundaries clear.
      </Text>
      <Button title="Create a room ＋" onPress={() => setView("new-room")} />
      {role === "admin" && (
        <Button
          secondary
          title="Create a conference hub ＋"
          onPress={() => setView("new-conference")}
        />
      )}
      <Section title="Community spaces" />
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
              c.visibility === "private" ? "Manage membership ↗" : "Open room ↗"
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
      <Text style={s.title}>A new gathering.</Text>
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
        label="What brings people here?"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={3000}
      />
      <Field
        label="Tagline"
        value={tagline}
        onChangeText={setTagline}
        maxLength={140}
      />
      <Button
        title={busy ? "Creating…" : "Open the conference hub ↗"}
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
              "Your conference hub is ready",
            )
            .then((ok) => {
              if (ok) done();
            })
            .finally(() => setBusy(false));
        }}
      />
      <Button secondary title="Back to spaces" onPress={done} />
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
      <Text style={s.title}>A room with{`\n`}a purpose.</Text>
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
          Create a conference hub before opening its rooms.
        </Text>
      )}
      <Field
        autoCapitalize="none"
        autoCorrect={false}
        label="Room name · letters, numbers, dashes"
        value={name}
        onChangeText={setName}
        placeholder="founders-after-dark"
        maxLength={50}
      />
      <Field
        label="What belongs in this room?"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
      />
      <Text style={s.label}>Room mark</Text>
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
      <Text style={s.label}>Who can enter?</Text>
      <View style={s.row}>
        <Chip
          title="Public"
          selected={!privateRoom}
          onPress={() => setPrivate(false)}
        />
        <Chip
          title="Private · invite only"
          selected={privateRoom}
          onPress={() => setPrivate(true)}
        />
      </View>
      <Text style={s.small}>
        {privateRoom
          ? "You start as the room moderator. Add members after the room is created."
          : "Anyone in the community can choose to follow this room."}
      </Text>
      <Text style={s.label}>Link a community · optional</Text>
      <Horizontal>
        <Chip
          title="Standalone room"
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
        title={busy ? "Opening…" : "Create the room ↗"}
        disabled={busy || !conferenceId || !name.trim() || !description.trim()}
        onPress={() => {
          const slug = name.trim().toLowerCase();
          if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(slug)) {
            nav.toast("Use letters, numbers, and dashes for the room name.");
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
              "The room is open",
            )
            .then((ok) => {
              if (ok) done();
            })
            .finally(() => setBusy(false));
        }}
      />
      <Button secondary title="Back to spaces" onPress={done} />
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
        title="Room unavailable"
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
        Only invited members can read this room. Moderators keep their place
        until roles are transferred.
      </Text>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Find a member to invite…"
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
                  ? "Room moderator"
                  : member
                    ? "In this room"
                    : p.headline}
              </Text>
            </View>
            <Button
              small
              secondary={member}
              title={moderator ? "Moderator" : member ? "Remove" : "Invite ＋"}
              disabled={moderator}
              onPress={() =>
                void nav.run(
                  {
                    type: "channel.member",
                    channelId,
                    userId: p.id,
                    add: !member,
                  },
                  member ? "Member removed" : "Member invited",
                )
              }
            />
          </View>
        );
      })}
      <View style={s.card}>
        <Text style={s.h3}>Invite by member ID</Text>
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
                "Member invited",
              )
              .then((ok) => {
                if (ok) setMemberId("");
              })
          }
        />
      </View>
      <Button secondary title="Back to spaces" onPress={back} />
    </ScrollView>
  );
}
