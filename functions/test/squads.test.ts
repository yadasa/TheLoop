import test from "node:test";
import assert from "node:assert/strict";
import { bootstrap, execute, TransactionStore } from "../src/service";
import { Doc, DomainError, pairId } from "../src/policy";
import {
  detachDeletedSquadMember,
  expireSquadInvitation,
  readableSquadMessage,
  revokeDeletedSquadInvitation,
  squadInviteId,
} from "../src/squads";

const initial = "2026-10-26T12:00:00.000Z";
class Database {
  docs = new Map<string, Doc>();
  sequence = 0;
  now = initial;
  async tx<T>(work: (store: TransactionStore) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.docs);
    const store: TransactionStore = {
      get: async (path) => snapshot.get(path),
      find: async (collection, field, value, limit) =>
        [...snapshot.entries()]
          .filter(
            ([path, row]) =>
              path.split("/").length === 2 &&
              path.startsWith(`${collection}/`) &&
              row[field] === value,
          )
          .slice(0, limit)
          .map(([, row]) => row),
      set: (path, row) => {
        snapshot.set(path, row);
      },
      remove: (path) => {
        snapshot.delete(path);
      },
    };
    const result = await work(store);
    this.docs = snapshot;
    return result;
  }
  actor(uid: string) {
    return { uid, name: uid, emailVerified: true };
  }
  async boot(uid: string) {
    await this.tx((store) => bootstrap(store, this.actor(uid), this.now));
  }
  command(
    uid: string,
    command: Doc,
    requestId = `squad-test-${++this.sequence}`,
  ) {
    return this.tx((store) =>
      execute(store, this.actor(uid), { command, requestId }, this.now),
    );
  }
  get(path: string) {
    return this.docs.get(path)!;
  }
  connect(a: string, b: string) {
    this.docs.set(`connections/${pairId(a, b)}`, {
      id: pairId(a, b),
      fromId: a,
      toId: b,
      participantIds: [a, b],
      status: "accepted",
    });
  }
  async canRead(uid: string, messageId: string) {
    return this.tx((store) =>
      readableSquadMessage(store, uid, this.get(`squadMessages/${messageId}`)),
    );
  }
}
async function fixture() {
  const db = new Database();
  for (const uid of ["alice", "bob", "carol", "eve"]) await db.boot(uid);
  db.connect("alice", "bob");
  db.connect("bob", "carol");
  return db;
}
const rejected = (work: Promise<unknown>, code = "permission-denied") =>
  assert.rejects(
    work,
    (error) => error instanceof DomainError && error.code === code,
  );
async function accepted(db: Database) {
  const squad = (
    await db.command("alice", {
      type: "squad.create",
      name: "The circle",
      description: "Our private plans",
      inviteeIds: ["bob"],
    })
  ).id;
  const invite = squadInviteId(squad, "bob");
  await db.command("bob", {
    type: "squad.respond",
    inviteId: invite,
    accept: true,
  });
  return squad;
}

test("Squad creation reserves accepted friends only, is idempotent, and never consents for recipients", async () => {
  const db = await fixture();
  await rejected(
    db.command("alice", {
      type: "squad.create",
      name: "Unconnected",
      inviteeIds: ["carol"],
    }),
  );
  assert.equal(
    [...db.docs.keys()].filter((path) => path.startsWith("squads/")).length,
    0,
  );
  const command = {
    type: "squad.create",
    name: "The circle",
    inviteeIds: ["bob"],
  };
  const squad = (await db.command("alice", command, "stable-squad-create")).id;
  assert.equal(
    (await db.command("alice", command, "stable-squad-create")).duplicate,
    true,
  );
  assert.deepEqual(db.get(`squads/${squad}`).memberIds, ["alice"]);
  assert.deepEqual(db.get(`squads/${squad}`).pendingInviteeIds, ["bob"]);
  assert.equal(db.get(`squads/${squad}`).memberProfiles.bob, undefined);
  assert.equal(db.get("users/bob").activeSquadIds, undefined);
  const inviteId = squadInviteId(squad, "bob");
  assert.ok(db.get(`users/bob`).pendingSquadInvites[inviteId]);
  assert.ok(
    [...db.docs.values()].some(
      (row) => row.kind === "squad" && row.userId === "bob",
    ),
  );
  await rejected(
    db.command("alice", { type: "squad.respond", inviteId, accept: true }),
  );
  await rejected(
    db.command("bob", {
      type: "squad.message.send",
      squadId: squad,
      body: "Not accepted yet.",
    }),
  );
  await rejected(
    db.command("bob", {
      type: "preferences.update",
      preferences: {
        activeSquadIds: [squad],
        squadReadAt: { [squad]: initial },
      },
    }),
    "invalid-argument",
  );
});

test("captured audiences prevent pre-consent history, gaps, and private reply leakage", async () => {
  const db = await fixture();
  const squad = (
    await db.command("alice", {
      type: "squad.create",
      name: "Consent",
      inviteeIds: ["bob"],
    })
  ).id;
  const old = (
    await db.command("alice", {
      type: "squad.message.send",
      squadId: squad,
      body: "Before Bob joined.",
    })
  ).id;
  await db.command("bob", {
    type: "squad.respond",
    inviteId: squadInviteId(squad, "bob"),
    accept: true,
  });
  await rejected(db.canRead("bob", old));
  const shared = (
    await db.command("alice", {
      type: "squad.message.send",
      squadId: squad,
      body: "Now shared with Bob.",
    })
  ).id;
  await db.canRead("bob", shared);
  const invite = (
    await db.command("bob", {
      type: "squad.invite",
      squadId: squad,
      userId: "carol",
    })
  ).inviteId;
  await db.command("carol", {
    type: "squad.respond",
    inviteId: invite,
    accept: true,
  });
  await rejected(db.canRead("carol", shared));
  const reply = (
    await db.command("bob", {
      type: "squad.message.send",
      squadId: squad,
      body: "A private reply to the prior audience.",
      replyTo: shared,
    })
  ).id;
  assert.deepEqual(db.get(`squadMessages/${reply}`).audienceIds, [
    "alice",
    "bob",
  ]);
  await rejected(db.canRead("carol", reply));
  await rejected(
    db.command("bob", {
      type: "squad.message.send",
      squadId: squad,
      body: "Forged",
      audienceIds: ["eve"],
    }),
    "invalid-argument",
  );
  await db.command("bob", { type: "squad.leave", squadId: squad });
  await rejected(db.canRead("bob", shared));
  await rejected(
    db.command("bob", {
      type: "squad.message.edit",
      messageId: reply,
      body: "After leaving",
    }),
  );
  await db.command("bob", { type: "squad.message.delete", messageId: reply });
  assert.equal(
    db.get(`squadMessages/${reply}`),
    undefined,
    "author can remove own text after departure without gaining history access",
  );
});

test("all members invite their own connections while owner controls transfer, removal and reservations", async () => {
  const db = await fixture(),
    squad = await accepted(db);
  const invite = (
    await db.command("bob", {
      type: "squad.invite",
      squadId: squad,
      userId: "carol",
    })
  ).inviteId;
  await rejected(
    db.command("bob", {
      type: "squad.update",
      squadId: squad,
      squad: { name: "Impersonate owner" },
    }),
  );
  await db.command("alice", { type: "squad.revoke", inviteId: invite });
  assert.equal(db.get(`squadInvites/${invite}`).status, "revoked");
  assert.deepEqual(db.get(`squads/${squad}`).pendingInviteeIds, []);
  assert.deepEqual(db.get("users/carol").pendingSquadInvites, {});
  await rejected(
    db.command("bob", {
      type: "squad.invite",
      squadId: squad,
      userId: "carol",
    }),
    "resource-exhausted",
  );
  await db.command("alice", {
    type: "squad.transfer",
    squadId: squad,
    userId: "bob",
  });
  assert.equal(db.get(`squads/${squad}`).ownerId, "bob");
  await rejected(
    db.command("alice", {
      type: "squad.remove",
      squadId: squad,
      userId: "bob",
    }),
  );
  await db.command("bob", { type: "squad.leave", squadId: squad });
  assert.equal(db.get(`squads/${squad}`).ownerId, "alice");
  await db.command("alice", { type: "squad.leave", squadId: squad });
  assert.equal(db.get(`squads/${squad}`).archived, true);
  assert.deepEqual(db.get(`squads/${squad}`).memberIds, []);
  assert.deepEqual(db.get("users/alice").activeSquadIds, []);
});

test("departures revoke the departing inviter's reservations and deletion transfers ownership idempotently", async () => {
  const db = await fixture(),
    squad = await accepted(db);
  const invite = (
    await db.command("bob", {
      type: "squad.invite",
      squadId: squad,
      userId: "carol",
    })
  ).inviteId;
  await db.command("alice", {
    type: "squad.remove",
    squadId: squad,
    userId: "bob",
  });
  assert.equal(db.get(`squadInvites/${invite}`).status, "revoked");
  await rejected(
    db.command("carol", {
      type: "squad.respond",
      inviteId: invite,
      accept: true,
    }),
    "failed-precondition",
  );
  const another = await accepted(db);
  for (let pass = 0; pass < 2; pass++)
    await db.tx((store) =>
      detachDeletedSquadMember(store, another, "alice", db.now),
    );
  assert.equal(db.get(`squads/${another}`).ownerId, "bob");
  assert.deepEqual(db.get(`squads/${another}`).memberIds, ["bob"]);
  assert.equal(db.get(`squads/${another}`).memberProfiles.alice, undefined);
  const third = (
    await db.command("bob", {
      type: "squad.create",
      name: "Pending deletion",
      inviteeIds: ["carol"],
    })
  ).id;
  await db.tx((store) =>
    revokeDeletedSquadInvitation(store, squadInviteId(third, "carol"), db.now),
  );
  assert.deepEqual(db.get(`squads/${third}`).pendingInviteeIds, []);
  assert.equal(
    db.get(`squadInvites/${squadInviteId(third, "carol")}`),
    undefined,
  );
});

test("blocking revokes pending pair invites and excludes both directions from future message audiences", async () => {
  const db = await fixture(),
    squad = await accepted(db);
  const pendingSquad = (
    await db.command("alice", {
      type: "squad.create",
      name: "Another invite",
      inviteeIds: ["bob"],
    })
  ).id;
  await db.command("alice", { type: "profile.block", userId: "bob" });
  assert.equal(
    db.get(`squadInvites/${squadInviteId(pendingSquad, "bob")}`).status,
    "revoked",
  );
  assert.deepEqual(db.get(`squads/${pendingSquad}`).pendingInviteeIds, []);
  for (const sender of ["alice", "bob"]) {
    const message = (
      await db.command(sender, {
        type: "squad.message.send",
        squadId: squad,
        body: "Block-respecting delivery",
      })
    ).id;
    assert.deepEqual(db.get(`squadMessages/${message}`).audienceIds, [sender]);
  }
  assert.deepEqual(
    db.get(`squads/${squad}`).memberIds,
    ["alice", "bob"],
    "blocking does not silently alter shared group consent",
  );
});

test("expired reservations release capacity in the scheduled helper and on the next group mutation", async () => {
  const db = await fixture();
  db.connect("alice", "carol");
  const squad = (
    await db.command("alice", {
      type: "squad.create",
      name: "Expiry",
      inviteeIds: ["bob", "carol"],
    })
  ).id;
  db.now = "2026-11-03T12:00:00.000Z";
  const bobInvite = squadInviteId(squad, "bob");
  await db.tx((store) => expireSquadInvitation(store, bobInvite, db.now));
  await db.tx((store) => expireSquadInvitation(store, bobInvite, db.now));
  assert.equal(db.get(`squadInvites/${bobInvite}`).status, "expired");
  assert.equal(db.get("users/bob").pendingSquadInvites[bobInvite], undefined);
  const carolInvite = squadInviteId(squad, "carol");
  await db.command("alice", { type: "squad.read", squadId: squad });
  assert.equal(db.get(`squadInvites/${carolInvite}`).status, "expired");
  assert.deepEqual(db.get(`squads/${squad}`).pendingInviteeIds, []);
});

test("Squad reservations, active memberships, and incoming invite counts remain bounded and atomic", async () => {
  const db = await fixture();
  const friends = Array.from({ length: 12 }, (_, n) => `friend-${n}`);
  for (const uid of friends) {
    await db.boot(uid);
    db.connect("alice", uid);
  }
  const squad = (
    await db.command("alice", {
      type: "squad.create",
      name: "Twelve seats",
      inviteeIds: friends.slice(0, 11),
    })
  ).id;
  assert.equal(db.get(`squads/${squad}`).pendingInviteeIds.length, 11);
  await rejected(
    db.command("alice", {
      type: "squad.invite",
      squadId: squad,
      userId: friends[11],
    }),
    "resource-exhausted",
  );
  const user = db.get("users/bob");
  db.docs.set("users/bob", {
    ...user,
    pendingSquadInvites: Object.fromEntries(
      Array.from({ length: 50 }, (_, n) => [
        `pending-${n}`,
        "2026-12-01T12:00:00.000Z",
      ]),
    ),
  });
  await rejected(
    db.command("alice", {
      type: "squad.create",
      name: "Inbox full",
      inviteeIds: ["bob"],
    }),
    "resource-exhausted",
  );
  assert.equal(
    [...db.docs.keys()].filter((path) => path.startsWith("squads/")).length,
    1,
  );
  db.docs.set("users/alice", {
    ...db.get("users/alice"),
    activeSquadIds: Array.from({ length: 50 }, (_, n) => `active-${n}`),
  });
  await rejected(
    db.command("alice", { type: "squad.create", name: "Too many" }),
    "resource-exhausted",
  );
});

test("Squad mute suppresses notices while read, reactions and author controls stay member-specific", async () => {
  const db = await fixture(),
    squad = await accepted(db);
  await db.command("bob", { type: "squad.mute", squadId: squad, muted: true });
  const noticeCount = [...db.docs.values()].filter(
    (row) => row.kind === "squad" && row.userId === "bob",
  ).length;
  const message = (
    await db.command("alice", {
      type: "squad.message.send",
      squadId: squad,
      body: "Quiet delivery",
    })
  ).id;
  assert.equal(
    [...db.docs.values()].filter(
      (row) => row.kind === "squad" && row.userId === "bob",
    ).length,
    noticeCount,
  );
  await db.canRead("bob", message);
  await db.command("bob", { type: "squad.read", squadId: squad });
  assert.equal(db.get("users/bob").preferences.squadReadAt[squad], initial);
  await db.command("bob", {
    type: "squad.message.react",
    messageId: message,
    emoji: "🖤",
  });
  assert.deepEqual(db.get(`squadMessages/${message}`).reactions["🖤"], ["bob"]);
  await rejected(
    db.command("bob", {
      type: "squad.message.edit",
      messageId: message,
      body: "Rewrite",
    }),
  );
  await rejected(
    db.command("eve", { type: "squad.mute", squadId: squad, muted: true }),
  );
  await db.command("alice", {
    type: "squad.message.edit",
    messageId: message,
    body: "Author corrected",
  });
  assert.equal(db.get(`squadMessages/${message}`).body, "Author corrected");
});

test("editing narrows delivery to current unblocked original recipients and reactions respect that boundary", async () => {
  const db = await fixture(),
    squad = await accepted(db);
  const message = (
    await db.command("alice", {
      type: "squad.message.send",
      squadId: squad,
      body: "Originally shared.",
    })
  ).id;
  await db.command("bob", {
    type: "squad.message.react",
    messageId: message,
    emoji: "🖤",
  });
  await db.command("alice", { type: "profile.block", userId: "bob" });
  await rejected(
    db.command("alice", {
      type: "squad.message.react",
      messageId: message,
      emoji: "👏",
    }),
  );
  await db.command("bob", {
    type: "squad.message.react",
    messageId: message,
    emoji: "🖤",
  });
  assert.deepEqual(
    db.get(`squadMessages/${message}`).reactions["🖤"],
    [],
    "an existing reaction can still be withdrawn",
  );
  await db.command("alice", {
    type: "squad.message.edit",
    messageId: message,
    body: "Edited after blocking.",
  });
  assert.deepEqual(db.get(`squadMessages/${message}`).audienceIds, ["alice"]);
  await rejected(db.canRead("bob", message));
});

test("new owners and global moderators gain no automatic private history or report-snapshot access", async () => {
  const db = await fixture(),
    squad = await accepted(db);
  const message = (
    await db.command("alice", {
      type: "squad.message.send",
      squadId: squad,
      body: "Original private message.",
    })
  ).id;
  const invite = (
    await db.command("bob", {
      type: "squad.invite",
      squadId: squad,
      userId: "carol",
    })
  ).inviteId;
  await db.command("carol", {
    type: "squad.respond",
    inviteId: invite,
    accept: true,
  });
  await db.command("alice", {
    type: "squad.transfer",
    squadId: squad,
    userId: "carol",
  });
  await rejected(
    db.command("carol", { type: "squad.message.delete", messageId: message }),
  );
  await rejected(
    db.command("carol", {
      type: "report.create",
      targetType: "squadMessage",
      targetId: message,
      reason: "Cannot snapshot pre-consent text.",
    }),
  );
  db.docs.set("users/eve", { ...db.get("users/eve"), role: "moderator" });
  await rejected(
    db.command("eve", {
      type: "report.create",
      targetType: "squadMessage",
      targetId: message,
      reason: "Role alone cannot snapshot text.",
    }),
  );
  const report = (
    await db.command("bob", {
      type: "report.create",
      targetType: "squadMessage",
      targetId: message,
      reason: "Review the exact shared item.",
    })
  ).id;
  assert.equal(
    db.get(`reports/${report}`).snapshot.body,
    "Original private message.",
  );
  await db.command("bob", { type: "squad.leave", squadId: squad });
  await rejected(
    db.command("bob", {
      type: "report.create",
      targetType: "squadMessage",
      targetId: message,
      reason: "Departure revokes snapshot capture access.",
    }),
  );
  await db.command("eve", {
    type: "report.review",
    reportId: report,
    outcome: "remove",
    note: "Exact reported item removed.",
  });
  assert.equal(db.get(`squadMessages/${message}`), undefined);
});

test("orphan invitation expiry and deletion still release the recipient's private inbox reservation", async () => {
  for (const cleanup of ["expire", "delete"]) {
    const db = await fixture();
    const squad = (
      await db.command("alice", {
        type: "squad.create",
        name: "Orphan fixture",
        inviteeIds: ["bob"],
      })
    ).id;
    const inviteId = squadInviteId(squad, "bob");
    db.docs.delete(`squads/${squad}`);
    db.now = "2026-11-03T12:00:00.000Z";
    await db.tx((store) =>
      cleanup === "expire"
        ? expireSquadInvitation(store, inviteId, db.now)
        : revokeDeletedSquadInvitation(store, inviteId, db.now),
    );
    assert.equal(db.get("users/bob").pendingSquadInvites[inviteId], undefined);
    assert.equal(db.get(`squads/${squad}`), undefined);
  }
});
