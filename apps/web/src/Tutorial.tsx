import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Compass, Hash, SlidersHorizontal, Users, X } from "lucide-react";
import type { Page } from "./routes";
import { Logo } from "./ui";
import "./tutorial.css";

export const TOUR_KEY = "theloop-tour-v1";
export function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === "done"; } catch { return false; }
}
const steps = [
  { page: "chat", label: "Group chats", icon: Hash, title: "Here’s the group chat.", body: "Group chats is your home for live conversation. Open a room such as #the-lobby, then choose a topic to find your people. Reply, react, or share a photo without losing the thread.", action: "Open group chats", hint: "Group chats → conference → room → topic" },
  { page: "chat", label: "Your interests", icon: SlidersHorizontal, title: "Keep the good noise.", body: "Use Tune your loop to follow rooms and topics. Mute keeps a room available without the noise; Hide removes it from your view. You can always bring it back.", action: "Tune my loop", hint: "Tune your loop → Follow · Mute · Hide" },
  { page: "communities", label: "Communities", icon: Compass, title: "A home for every side of you.", body: "Communities hold discussions, questions, polls, and wins. Join a circle, vote on a perspective, or save something useful. This is the social feed alongside your group chats.", action: "Explore communities", hint: "Communities → join a circle → start a discussion" },
  { page: "calendar", label: "Calendar", icon: CalendarDays, title: "Turn a hello into a plan.", body: "The calendar brings plans together across conferences. Filter to a conference or My plans, RSVP, and export an event. Guide discovery links to public organizer listings with source attribution.", action: "See the calendar", hint: "Calendar → Global · Conference · My plans" },
  { page: "people", label: "People & inbox", icon: Users, title: "The connection continues.", body: "People is where profiles, trust explanations, follows, and connection requests live. Inbox holds private conversations. Squads are small private circles for making plans together.", action: "Find my people", hint: "People → connect · Inbox → message · Squads → plan" },
] as const;

export default function Tutorial({ navigate, tune, close }: {
  navigate: (page: Page) => void;
  tune: () => void;
  close: () => void;
}) {
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const go = useRef(navigate); go.current = navigate;
  const current = steps[step], Icon = current.icon;
  const finish = () => {
    try { localStorage.setItem(TOUR_KEY, "done"); } catch { /* Device storage can be unavailable. */ }
    close();
  };
  useEffect(() => { go.current(current.page); }, [step]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      if (before?.isConnected) before.focus();
      else document.getElementById("main")?.focus();
    };
  }, []);
  useEffect(() => { ref.current?.focus(); }, [step]);
  return <div className="tour-backdrop">
    <div className="tour-card" role="dialog" aria-modal="true" aria-label="Find your way around TheLoop" tabIndex={-1} ref={ref}
      onKeyDown={event => {
        if (event.key === "Escape") finish();
        if (event.key === "Tab") {
          const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
          if (!buttons?.length) return;
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <div className="tour-top"><span><Logo small /> AROUND THE LOOP</span><button className="icon-button" aria-label="Skip tutorial" onClick={finish}><X size={18}/></button></div>
      <div className="tour-map" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((item, index) => <button key={item.label} aria-label={`Show ${item.label}`} aria-current={index === step ? "step" : undefined} className={index === step ? "current" : index < step ? "visited" : ""} onClick={() => setStep(index)}><item.icon size={18}/><span>{item.label}</span></button>)}
      </div>
      <div className="tour-copy" key={step}><span className="eyebrow">{String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")} · {current.label}</span><h2>{current.title}</h2><p>{current.body}</p><div className="tour-trail"><Icon size={16}/>{current.hint}</div></div>
      <div className="tour-actions"><button className="button primary" onClick={() => { finish(); if (step === 1) tune(); else navigate(current.page); }}>{current.action}<ArrowRight size={16}/></button><div><button className="text-button" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button><button className="text-button" onClick={() => step === steps.length - 1 ? finish() : setStep(step + 1)}>{step === steps.length - 1 ? "I’m in the loop" : "Next stop"}<ArrowRight size={15}/></button></div></div>
      <p className="tour-reopen">Find this tour again with the ? button at the top.</p>
    </div>
  </div>;
}
