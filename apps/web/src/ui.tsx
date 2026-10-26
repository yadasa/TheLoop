import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Profile } from "@theloop/core";
let openModals = 0,
  originalOverflow = "";
export const Logo = ({ small = false }: { small?: boolean }) => (
  <span className={`logo ${small ? "small" : ""}`} aria-hidden="true">
    <i />
    <i />
  </span>
);
export function Avatar({
  person,
  size = "normal",
  onClick,
}: {
  person?: Profile;
  size?: "tiny" | "normal" | "large";
  onClick?: () => void;
}) {
  const className = `avatar ${size} tone-${(person?.name.charCodeAt(0) ?? 0) % 4}`;
  return onClick ? (
    <button
      className={className}
      title={person?.name ?? "Member"}
      onClick={onClick}
      type="button"
    >
      {person?.initials ?? "?"}
    </button>
  ) : (
    <span className={className} aria-hidden="true">
      {person?.initials ?? "?"}
    </span>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Logo />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ModalShell({
  title,
  subtitle,
  close,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    if (openModals === 0) originalOverflow = document.body.style.overflow;
    openModals++;
    document.body.style.overflow = "hidden";
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,button,select,textarea")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (
        Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== el
      )
        return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const items = el?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input,select,textarea,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.body.style.overflow = originalOverflow;
      if (before?.isConnected) before.focus();
      else document.getElementById("main")?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
