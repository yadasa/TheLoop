import React, { useState } from "react";
import { useLoop } from "@theloop/client";
import type { Command, LoopEvent } from "@theloop/core";
import EventEditor from "./EventEditor";
import { Empty, Field, ModalShell } from "./ui";

export type EventManagementAction = {
  kind: "edit" | "cancel";
  event: LoopEvent;
};
export default function EventManager({
  action,
  close,
  run,
}: {
  action: EventManagementAction;
  close: () => void;
  run: (command: Command, success?: string) => Promise<boolean>;
}) {
  const { state, pending, error, eventStatus, watchEvent, role } = useLoop();
  const [snapshot, setSnapshot] = useState(action.event),
    [failed, setFailed] = useState(false),
    [reason, setReason] = useState("");
  const latest = state.events.find((event) => event.id === snapshot.id);
  const changed =
    !!latest && (latest.sequence ?? 0) !== (snapshot.sequence ?? 0);
  const inactive =
    !!latest &&
    (latest.status === "cancelled" || Date.parse(latest.endAt) <= Date.now());
  const confirmed =
    eventStatus.id === snapshot.id &&
    !eventStatus.loading &&
    !eventStatus.error &&
    !eventStatus.notFound;
  const authorized =
    !!latest && (latest.hostId === state.currentUserId || role === "admin");
  const blocked = !confirmed || !authorized || changed || inactive;
  const retry = () => {
    watchEvent(null);
    watchEvent(snapshot.id);
  };
  const warning = !confirmed
    ? eventStatus.error
      ? "The latest event details couldn’t be confirmed. Your draft is still here."
      : "Checking the latest event details before making changes…"
    : !authorized
      ? "The host or a community administrator can make changes to this plan."
      : latest?.status === "cancelled"
        ? "This plan was cancelled. You can still view its final details."
        : inactive
          ? "This event has finished and no longer accepts changes."
          : undefined;
  if (eventStatus.id === snapshot.id && eventStatus.notFound)
    return (
      <ModalShell title="This plan is no longer available." close={close}>
        <Empty
          title="The details have changed."
          body="This event may have been removed or your access may have changed."
        />
      </ModalShell>
    );
  if (action.kind === "edit")
    return (
      <EventEditor
        key={`${state.currentUserId}:${snapshot.id}:${snapshot.sequence ?? 0}`}
        initial={snapshot}
        close={close}
        stale={blocked}
        warning={warning}
        reload={
          !confirmed && eventStatus.error
            ? retry
            : confirmed && authorized && latest && !inactive
              ? () => setSnapshot(latest)
              : undefined
        }
        reloadLabel={!confirmed ? "Retry loading latest details" : undefined}
        submit={(draft) => {
          if (blocked) return Promise.resolve(false);
          const { conferenceId, ...fields } = draft;
          return run(
            {
              type: "event.edit",
              eventId: snapshot.id,
              expectedSequence: snapshot.sequence ?? 0,
              event: fields,
            },
            "The plan is updated. Your people will be notified.",
          );
        }}
      />
    );
  return (
    <ModalShell
      title="Cancel this plan?"
      subtitle="Keep your people informed, even when plans change."
      close={close}
    >
      <form
        className="modal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          if (pending || blocked) return;
          const ok = await run(
            {
              type: "event.cancel",
              eventId: snapshot.id,
              expectedSequence: snapshot.sequence ?? 0,
              reason,
            },
            "The plan is cancelled. Your people will be notified.",
          );
          if (ok && form.isConnected) close();
          else if (!ok && form.isConnected) setFailed(true);
        }}
      >
        <h3>{snapshot.title}</h3>
        <p className="event-cancel-explanation">
          The event stays in the calendar with a cancelled status. Current
          attendees and waitlisted members receive a notice. Saved device
          calendars may need a manual update.
        </p>
        {blocked && (
          <div className="event-form-errors" role="status">
            <p>
              {warning ||
                "This plan changed. Review the latest details before cancelling."}
            </p>
            {!confirmed && eventStatus.error && (
              <button className="text-button" type="button" onClick={retry}>
                Retry loading latest details
              </button>
            )}
            {confirmed && authorized && latest && !inactive && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSnapshot(latest);
                  setFailed(false);
                }}
              >
                Review latest version
              </button>
            )}
          </div>
        )}
        {failed && (
          <p className="form-error" role="alert">
            {error || "The event could not be cancelled. Please try again."}
          </p>
        )}
        <Field label="A note for your people · optional">
          <textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setFailed(false);
            }}
            disabled={pending > 0}
          />
        </Field>
        <footer>
          <button className="button subtle" type="button" onClick={close}>
            Keep the plan
          </button>
          <button className="button primary" disabled={pending > 0 || blocked}>
            Cancel event
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
