import type { Command } from "@theloop/core";
export type Tab = "Home" | "Chat" | "Events" | "People" | "You";
export type Route =
  | {
      kind:
        | "post"
        | "edit-post"
        | "channel"
        | "event"
        | "profile"
        | "dm"
        | "squad"
        | "squad-members";
      id: string;
    }
  | {
      kind:
        | "compose"
        | "communities"
        | "create-community"
        | "create-event"
        | "notifications"
        | "edit-profile"
        | "settings"
        | "auth"
        | "onboarding"
        | "trust"
        | "export"
        | "search"
        | "safety"
        | "spaces"
        | "import-events"
        | "squads"
        | "create-squad";
    };
export type Nav = {
  open: (route: Route) => void;
  close: () => void;
  closeIfTop: (kind: Route["kind"]) => void;
  navigate: (tab: Tab) => void;
  run: (command: Command, success?: string) => Promise<boolean>;
  toast: (text: string) => void;
};
