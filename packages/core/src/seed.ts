import type { LoopState, Preferences, Profile } from "./types";
export const defaultPreferences = (): Preferences => ({
  subscriptions: {},
  joinedCommunityIds: [],
  followingIds: [],
  blockedIds: [],
  savedPostIds: [],
  readChannels: {},
  squadReadAt: {},
  squadMutedIds: [],
  dmMutedIds: [],
  interests: [],
  onboardingComplete: false,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  timezone: "UTC",
  digest: "daily",
  dmPolicy: "connections",
  hideUnsubscribed: false,
  eventReminders: true,
});
export const interests = [
  "Technology",
  "Founders",
  "Design",
  "Career growth",
  "Culture",
  "Wellness",
  "Investing",
  "Music",
  "Food",
  "Community",
];
const people = [
  [
    "me",
    "Alex Morgan",
    "AM",
    "Product designer & community builder",
    "Independent",
    "Houston, TX",
    ["Design", "Community", "Technology"],
  ],
  [
    "maya",
    "Maya Thompson",
    "MT",
    "Building products that bring us together",
    "Product at Forma",
    "Brooklyn, NY",
    ["Design", "Technology", "Community"],
  ],
  [
    "jordan",
    "Jordan Ellis",
    "JE",
    "Founder. Connecting ideas to opportunity.",
    "Founder, Common Ground",
    "Atlanta, GA",
    ["Founders", "Investing", "Technology"],
  ],
  [
    "imani",
    "Imani Brooks",
    "IB",
    "Software engineer · happy to review a résumé",
    "Engineering at Northstar",
    "Austin, TX",
    ["Technology", "Career growth", "Music"],
  ],
  [
    "devon",
    "Devon Carter",
    "DC",
    "Creative strategist & excellent playlist maker",
    "Brand at Studio Nine",
    "Chicago, IL",
    ["Culture", "Music", "Design"],
  ],
  [
    "nia",
    "Nia Williams",
    "NW",
    "Making room for the next generation",
    "Community at Launchpad",
    "Houston, TX",
    ["Community", "Career growth", "Wellness"],
  ],
  [
    "marcus",
    "Marcus Reed",
    "MR",
    "Investing in people before the pitch",
    "Partner, Future Fund",
    "Oakland, CA",
    ["Investing", "Founders", "Food"],
  ],
] as const;
const profile = (p: (typeof people)[number], i: number): Profile => ({
  id: p[0],
  name: p[1],
  initials: p[2],
  headline: p[3],
  company: p[4],
  location: p[5],
  handle: p[0] === "me" ? "alexmorgan" : p[0],
  skills: [...p[6]],
  interests: [...p[6]],
  bio: "Here for meaningful connections, big ideas, and the conversations that keep going after the conference. Say hello — there is always room at the table.",
  links: [],
  joinedAt: "2026-10-01T12:00:00Z",
  verified: i !== 0,
  trust: {
    score: 72 + i * 3,
    reasons: [
      "Sample account tenure",
      "Sample positive contributions",
      "Sample community participation",
    ],
  },
  visibility: "public",
  openTo: ["Coffee chats", "Collaboration", "Mentoring"],
});
export function emptyState(userId = ""): LoopState {
  return {
    version: 1,
    currentUserId: userId,
    profiles: [],
    conferences: [],
    channels: [],
    messages: [],
    communities: [],
    posts: [],
    events: [],
    connections: [],
    squads: [],
    squadInvites: [],
    squadMessages: [],
    notifications: [],
    directMessages: [],
    follows: [],
    reports: [],
    preferences: defaultPreferences(),
  };
}
export function initialState(): LoopState {
  const s = emptyState("me");
  s.profiles = people.map(profile);
  s.conferences = [
    {
      id: "afrotech",
      name: "AfroTech community",
      shortName: "AF",
      city: "Houston, TX",
      startDate: "2026-11-02",
      endDate: "2026-11-06",
      description:
        "The conversations before, during, and long after the conference. This is a sample community hub, not an official conference schedule.",
      members: 2486,
      tagline: "The AfroTech plans, people and conversations.",
    },
    {
      id: "everyday",
      name: "Beyond the conference",
      shortName: "∞",
      city: "Everywhere",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      description: "The connections continue all year.",
      members: 1842,
      tagline: "Keep the connection going.",
    },
  ];
  s.channels = [
    {
      id: "the-lobby",
      moderatorIds: ["me"],
      conferenceId: "afrotech",
      name: "the-lobby",
      description: "Your people. Your first hello. Pull up a chair.",
      icon: "◎",
      members: 2486,
      topics: ["Introductions", "First timers", "Making plans"],
      visibility: "public",
    },
    {
      id: "career-moves",
      conferenceId: "afrotech",
      name: "career-moves",
      description: "Job openings, referrals and career questions.",
      icon: "↗",
      members: 842,
      topics: ["Open roles", "Resume swaps", "Career pivots"],
      visibility: "public",
    },
    {
      id: "after-hours",
      conferenceId: "afrotech",
      name: "after-hours",
      description: "Good food, great music, and the plans after the plans.",
      icon: "☾",
      members: 1260,
      topics: ["Dinner plans", "The playlist", "Night owls"],
      visibility: "public",
    },
    {
      id: "founders-table",
      conferenceId: "afrotech",
      name: "founders-table",
      description: "Build in good company. From first idea to next round.",
      icon: "◇",
      members: 568,
      topics: ["Build in public", "Funding", "Co-founder intros"],
      visibility: "public",
    },
    {
      id: "design-circle",
      conferenceId: "everyday",
      name: "design-circle",
      description: "Thoughtful craft and honest feedback.",
      icon: "◈",
      members: 324,
      topics: ["Portfolio feedback", "Inspiration", "Design systems"],
      visibility: "public",
    },
    {
      id: "wellness",
      conferenceId: "everyday",
      name: "wellness",
      description: "A little room to breathe. Mind, body, and community.",
      icon: "○",
      members: 287,
      topics: ["Morning walks", "Check in", "Small wins"],
      visibility: "public",
    },
  ];
  s.communities = [
    {
      id: "builders",
      slug: "builders",
      name: "The Builders Circle",
      description:
        "For the ideas you cannot stop thinking about. Share the work. Find your people.",
      members: 842,
      icon: "◇",
      rules: [
        "Build with respect.",
        "Give more than you take.",
        "No unsolicited pitches or spam.",
      ],
      moderatorIds: ["nia"],
    },
    {
      id: "culture",
      slug: "culture",
      name: "Culture & Connection",
      description:
        "The music, moments, and conversations that make this feel like us.",
      members: 1260,
      icon: "◎",
      rules: ["Be kind and stay curious.", "Credit original creators."],
      moderatorIds: ["devon"],
    },
    {
      id: "career",
      slug: "career",
      name: "Next Chapter",
      description: "Career moves with community behind you.",
      members: 724,
      icon: "↗",
      rules: [
        "Share compensation when posting a role.",
        "No pay-to-apply opportunities.",
      ],
      moderatorIds: ["imani"],
    },
  ];
  const time = (h: number) => `2026-10-25T${String(h).padStart(2, "0")}:00:00Z`;
  s.messages = [
    {
      id: "m1",
      channelId: "the-lobby",
      topic: "Introductions",
      authorId: "nia",
      body: "Welcome! Introduce yourself: name, what you work on, and who you’d like to meet at AfroTech.",
      createdAt: time(12),
      reactions: { "🖤": ["maya", "imani", "devon"] },
    },
    {
      id: "m2",
      channelId: "the-lobby",
      topic: "Introductions",
      authorId: "maya",
      body: "Hey, I’m Maya, a product designer. I’d love to meet other designers this year. Also taking Houston coffee recommendations ☕",
      createdAt: time(13),
      reactions: { "☕": ["jordan", "me"] },
    },
    {
      id: "m3",
      channelId: "the-lobby",
      topic: "Introductions",
      authorId: "imani",
      body: "Engineer here! Bringing a first-timer friend this year. We are down for portfolio swaps and a founders breakfast.",
      createdAt: time(14),
      reactions: { "🙌": ["nia"] },
    },
    {
      id: "m4",
      channelId: "the-lobby",
      topic: "Making plans",
      authorId: "jordan",
      body: "Anyone up for coffee before the conference on Monday? Thinking around 8 near the convention center. Drop a spot if you know one.",
      createdAt: time(15),
      reactions: { "🖤": ["maya", "nia"] },
    },
    {
      id: "m5",
      channelId: "career-moves",
      topic: "Open roles",
      authorId: "imani",
      body: "Looking for a role? Post the kind of work you do, your experience level, and whether you’re open to relocating. If you’re hiring, add the job link.",
      createdAt: time(13),
      reactions: {},
    },
    {
      id: "m6",
      channelId: "after-hours",
      topic: "Dinner plans",
      authorId: "devon",
      body: "Who’s free for dinner Monday? Looking for a spot near the convention center with vegetarian options. Suggestions welcome.",
      createdAt: time(14),
      reactions: { "🍽️": ["nia", "maya"] },
    },
    {
      id: "m7",
      channelId: "founders-table",
      topic: "Build in public",
      authorId: "jordan",
      body: "We signed our first customer this week! The introduction came from someone in this group. Still processing it, honestly.",
      createdAt: time(15),
      reactions: { "🙌": ["marcus"] },
    },
    {
      id: "m8",
      channelId: "design-circle",
      topic: "Portfolio feedback",
      authorId: "maya",
      body: "Anyone want to trade portfolio feedback? I’m revising a case study and could use a second opinion. Happy to review yours too.",
      createdAt: time(13),
      reactions: {},
    },
  ];
  s.posts = [
    {
      id: "p1",
      communityId: "builders",
      authorId: "jordan",
      kind: "discussion",
      title: "What are you hoping to get out of AfroTech this year?",
      body: "I’m trying to meet other early-stage founders and catch a few product sessions. Last year I overbooked myself, so I’m keeping the schedule lighter this time.\n\nWhat’s on your list?",
      createdAt: time(13),
      votes: { maya: 1, imani: 1, nia: 1, marcus: 1, devon: 1 },
      comments: [
        {
          id: "c1",
          authorId: "maya",
          body: "Portfolio reviews and meeting designers outside my company. And at least one good dinner.",
          createdAt: time(14),
        },
      ],
      tags: ["Community", "AfroTech"],
    },
    {
      id: "p2",
      communityId: "career",
      authorId: "imani",
      kind: "opportunity",
      title: "Hiring or job hunting? Add your details here.",
      body: "If you’re looking: role, experience level, location and a portfolio or profile link. If your team is hiring: post the listing and say whether you can answer questions or offer a referral.",
      createdAt: time(12),
      votes: { maya: 1, nia: 1, marcus: 1 },
      comments: [],
      tags: ["Career growth", "Open doors"],
    },
    {
      id: "p3",
      communityId: "culture",
      authorId: "devon",
      kind: "poll",
      title: "First stop when we all get to Houston?",
      body: "The group chat cannot decide, so let the people speak.",
      createdAt: time(11),
      votes: { nia: 1, jordan: 1 },
      comments: [],
      tags: ["Houston", "After hours"],
      poll: {
        closesAt: "2026-11-02T18:00:00Z",
        options: [
          {
            id: "o1",
            label: "Coffee and a slow morning",
            voterIds: ["maya", "imani"],
          },
          {
            id: "o2",
            label: "Dinner with the whole crew",
            voterIds: ["nia", "jordan", "marcus"],
          },
          {
            id: "o3",
            label: "Wherever the playlist is good",
            voterIds: ["devon"],
          },
        ],
      },
    },
    {
      id: "p4",
      communityId: "builders",
      authorId: "nia",
      kind: "win",
      title:
        "Got an offer, shipped something, or finished a tough week?",
      body: "I finally shipped the project I’ve been working on all month. It took longer than I planned, but it’s out. What are you celebrating this week?",
      createdAt: time(10),
      votes: { maya: 1, imani: 1, devon: 1, jordan: 1 },
      comments: [],
      tags: ["Wins", "Lift as we climb"],
    },
  ];
  s.events = [
    {
      id: "e1",
      conferenceId: "afrotech",
      title: "The coffee before the conference",
      description:
        "A low-pressure hello with good coffee and people worth knowing. Sample event for testing.",
      startAt: "2026-11-02T14:00:00Z",
      endAt: "2026-11-02T15:30:00Z",
      timezone: "America/Chicago",
      location: "Downtown Houston · venue TBA",
      kind: "meetup",
      hostId: "nia",
      capacity: 30,
      attendeeIds: ["maya", "jordan", "imani", "devon"],
      waitlistIds: [],
      tags: ["Coffee", "Community"],
    },
    {
      id: "e2",
      conferenceId: "afrotech",
      title: "Builders, not just business cards",
      description:
        "Bring an idea, a question, or a project. Leave with a collaborator. Sample event for testing.",
      startAt: "2026-11-03T23:00:00Z",
      endAt: "2026-11-04T01:00:00Z",
      timezone: "America/Chicago",
      location: "Houston · community space TBA",
      kind: "workshop",
      hostId: "jordan",
      capacity: 40,
      attendeeIds: ["marcus", "imani", "me"],
      waitlistIds: [],
      tags: ["Founders", "Technology"],
    },
    {
      id: "e3",
      conferenceId: "afrotech",
      title: "Dinner with room for one more",
      description:
        "The table gets longer when the community gets together. Sample event for testing.",
      startAt: "2026-11-05T00:00:00Z",
      endAt: "2026-11-05T02:00:00Z",
      timezone: "America/Chicago",
      location: "Midtown Houston · venue TBA",
      kind: "social",
      hostId: "devon",
      capacity: 18,
      attendeeIds: ["nia", "maya", "jordan"],
      waitlistIds: [],
      tags: ["Food", "Culture"],
    },
    {
      id: "e4",
      conferenceId: "everyday",
      title: "Sunday reset: a community walk",
      description:
        "Fresh air, a little movement, and a check-in. Sample event for testing.",
      startAt: "2026-11-08T16:00:00Z",
      endAt: "2026-11-08T17:00:00Z",
      timezone: "America/Chicago",
      location: "Memorial Park, Houston",
      kind: "meetup",
      hostId: "nia",
      capacity: 25,
      attendeeIds: ["devon", "me"],
      waitlistIds: [],
      tags: ["Wellness", "Community"],
    },
  ];
  s.connections = [
    {
      id: "cx1",
      fromId: "me",
      toId: "maya",
      status: "accepted",
      createdAt: time(9),
    },
    {
      id: "cx2",
      fromId: "nia",
      toId: "me",
      status: "pending",
      createdAt: time(14),
    },
  ];
  s.notifications = [
    {
      id: "n1",
      userId: "me",
      title: "Nia wants to connect",
      body: "Good people find good people.",
      kind: "connection",
      targetId: "nia",
      createdAt: time(14),
      read: false,
    },
    {
      id: "n2",
      userId: "me",
      title: "Your next good conversation",
      body: "The coffee before the conference is coming up.",
      kind: "event",
      targetId: "e1",
      createdAt: time(13),
      read: false,
    },
  ];
  s.preferences = {
    ...defaultPreferences(),
    subscriptions: {
      "the-lobby": "following",
      "career-moves": "following",
      "after-hours": "muted",
      "founders-table": "following",
      "design-circle": "following",
      wellness: "hidden",
    },
    joinedCommunityIds: ["builders", "culture", "career"],
    followingIds: ["maya", "nia"],
    interests: ["Design", "Community", "Technology"],
    onboardingComplete: false,
  };
  s.follows = [
    ["me", "maya"],
    ["me", "nia"],
    ["jordan", "me"],
    ["devon", "me"],
    ["nia", "me"],
  ].map(([followerId, followingId], index) => ({
    id: `follow-${index}`,
    followerId,
    followingId,
    participantIds: [followerId, followingId],
    createdAt: "2026-10-26T09:00:00Z",
  }));
  s.profiles.forEach((p) => {
    p.followerCount = s.follows.filter((f) => f.followingId === p.id).length;
    p.followingCount = s.follows.filter((f) => f.followerId === p.id).length;
  });
  const participation = (id: string) => {
    const p = s.profiles.find((person) => person.id === id);
    return p ? { authorName: p.name, authorInitials: p.initials } : {};
  };
  s.messages = s.messages.map((message) => ({
    ...message,
    ...participation(message.authorId),
  }));
  s.posts = s.posts.map((post) => ({
    ...post,
    ...participation(post.authorId),
    comments: post.comments.map((comment) => ({
      ...comment,
      ...participation(comment.authorId),
    })),
  }));
  s.directMessages = [
    {
      id: "dm-hello",
      fromId: "maya",
      toId: "me",
      fromName: "Maya Thompson",
      fromInitials: "MT",
      toName: "Alex Morgan",
      toInitials: "AM",
      conversationId: "maya~me",
      participantIds: ["maya", "me"],
      body: "Hey! Are you going to the Monday coffee meetup? Would be good to catch up.",
      createdAt: time(14),
      read: false,
    },
  ];
  const squadTime = "2026-10-26T10:00:00.000Z";
  s.squads = [
    {
      id: "coffee-crew",
      name: "The coffee crew",
      description:
        "Monday coffee plans. Confirm the time and spot here.",
      ownerId: "me",
      memberIds: ["me", "maya"],
      memberProfiles: Object.fromEntries(
        s.profiles
          .filter((p) => ["me", "maya"].includes(p.id))
          .map((p) => [
            p.id,
            {
              userId: p.id,
              name: p.name,
              initials: p.initials,
              joinedAt: squadTime,
            },
          ]),
      ),
      pendingInviteeIds: [],
      createdAt: squadTime,
      updatedAt: squadTime,
      archived: false,
    },
  ];
  s.squadMessages = [
    {
      id: "squad-welcome",
      squadId: "coffee-crew",
      authorId: "maya",
      authorName: "Maya Thompson",
      authorInitials: "MT",
      body: "Is 8 a.m. still good for everyone? I’ll check which spots open early.",
      createdAt: squadTime,
      audienceIds: ["me", "maya"],
      reactions: { "☕": ["me"] },
    },
  ];
  s.squads.push({
    id: "first-hello",
    name: "The first hello",
    description:
      "A quieter spot for meeting a few people before the conference.",
    ownerId: "maya",
    memberIds: ["maya"],
    memberProfiles: {
      maya: {
        userId: "maya",
        name: "Maya Thompson",
        initials: "MT",
        joinedAt: squadTime,
      },
    },
    pendingInviteeIds: ["me"],
    createdAt: squadTime,
    updatedAt: squadTime,
    archived: false,
  });
  s.squadInvites = [
    {
      id: "first-hello-invite",
      squadId: "first-hello",
      squadName: "The first hello",
      description:
        "A quieter spot for meeting a few people before the conference.",
      fromId: "maya",
      toId: "me",
      participantIds: ["maya", "me"],
      status: "pending",
      createdAt: squadTime,
      expiresAt: "2026-11-02T10:00:00.000Z",
    },
  ];
  return s;
}
