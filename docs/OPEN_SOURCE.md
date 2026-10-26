# Open source decisions

Reviewed on October 26, 2026. TheLoop is an original React, TypeScript, Firebase, and Expo application. It does not contain copied source from the complete chat platforms below.

| Alternative | License checked at source | What speeds up TheLoop | Integration decision |
| --- | --- | --- | --- |
| [Zulip](https://github.com/zulip/zulip) | [Apache-2.0](https://github.com/zulip/zulip/blob/main/LICENSE) | A mature channel/topic model with explicit follows, mutes, hidden conversations, and separate unread behavior. | Use the documented interaction model with Firebase. A wholesale fork would introduce a separate server stack and would not supply the requested social graph. |
| [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat) | [MIT outside separately licensed enterprise directories](https://github.com/RocketChat/Rocket.Chat/blob/develop/LICENSE) | Rooms, threads, reactions, and messaging integrations are useful behavior references. | Keep Firebase and Expo instead of introducing a Meteor-oriented platform. No enterprise code is copied. |
| [Discourse](https://github.com/discourse/discourse) | [GPL-2.0](https://github.com/discourse/discourse/blob/main/LICENSE.txt) | Long-lived communities, discussions, progressive permissions, and moderation workflows. | Product reference for the communities and trust experience; no Discourse code is bundled. |

Zulip documents how [muting affects notifications and unread counts](https://zulip.com/help/mute-a-topic) and how [followed topics work inside muted channels](https://zulip.com/help/topic-notifications). Those distinctions inform TheLoop's following, muted, and hidden states. Explicit member preferences should remain stable after posting.

Discourse's [trust-level explanation](https://meta.discourse.org/t/understanding-discourse-trust-levels/90752) informs progressive participation privileges. TheLoop's trust fields belong to the server; an editable professional profile cannot change verification or score. Sample profiles are clearly fictional, and their example scores are not real member judgments.

## Reusable dependencies

React, Firebase, Expo, React Native, Vite, and Lucide supply maintained runtime, authentication, data, native tooling, bundling, and icon primitives. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for the dependency inventory. TheLoop's reducer, subscription logic, CSV parser, calendar serialization, and matching rules are original implementation.

[Gifted Chat](https://github.com/FaridSafi/react-native-gifted-chat) was evaluated as a mobile chat accelerator. Its README directs new work to the maintained [@kesha-antonov/react-native-chat](https://github.com/kesha-antonov/react-native-chat), which is [MIT licensed](https://github.com/kesha-antonov/react-native-chat/blob/master/LICENSE), TypeScript-first, and Expo-ready. It remains an evaluated option rather than a bundled dependency: the current app shares its Firebase command model and uses native UI components directly.

## Event spreadsheet import

`previewEventCSV` in `@theloop/core` previews a CSV before creating events. It returns physical source row numbers, row-level errors, duplicate markers, and only valid creation drafts. It performs no network requests or formula evaluation.

Supported headers are case-insensitive: `title`, `description`, `startAt`, `endAt`, `timezone`, `location`, `conferenceId`, `kind`, `capacity`, `tags`, `url`. Unknown columns are ignored. `title`, `startAt`, `endAt`, and `location` columns are required. Provide `conferenceId` or a default conference in the import options. Capacity defaults to unlimited (`0`); kind defaults to `meetup`; timezone defaults to the supplied default or UTC; tags use `|` separators.

```csv
title,description,startAt,endAt,timezone,location,conferenceId,kind,capacity,tags,url
"Coffee, code & community","Bring a friend. Sample event, not an official conference listing.",2026-11-03T09:00,2026-11-03T10:00,America/Chicago,Downtown Houston,afrotech,meetup,30,Coffee|Community,https://example.org/coffee
Builders table,Share what you are working on.,2026-11-04T17:00-06:00,2026-11-04T18:30-06:00,America/Chicago,Houston venue TBA,afrotech,workshop,40,Founders|Technology,
```

Local dates use the specified IANA timezone. UTC and explicit offsets are accepted and normalized to UTC. Invalid dates, missing times, nonexistent or ambiguous daylight-saving times, backwards durations, unknown conferences, invalid capacities, unsafe links, malformed quoting, and duplicates are rejected with row errors. Duplicate keys use normalized title plus start instant, both against existing events and earlier valid rows in the file. There is a 1,000-event / 2 MB input limit.

```ts
const preview = previewEventCSV(csv, {
  conferences: state.conferences,
  existingEvents: state.events,
  defaultConferenceId: 'afrotech',
  defaultTimezone: 'America/Chicago',
  now: new Date().toISOString(),
});
// Present preview.rows before submitting preview.events through event.create.
```

Previewing does not claim that an event is official or verified. Only authorized imports should be submitted, and creating events remains subject to server validation and permissions. This utility does not import GroupMe member identities or private chat history.
