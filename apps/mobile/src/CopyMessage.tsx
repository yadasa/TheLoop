import React, { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Button } from "./ui";
import type { Nav } from "./navigation";
export function CopyMessage({
  text,
  nav,
  disabled = false,
}: {
  text: string;
  nav: Nav;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (!text.trim()) return null;
  return (
    <Button
      small
      secondary
      title={busy ? "Copying…" : "Copy text"}
      disabled={disabled || busy}
      onPress={async () => {
        setBusy(true);
        try {
          if (!(await Clipboard.setStringAsync(text)))
            throw new Error("Copy unavailable");
          nav.toast("Message text copied");
        } catch {
          nav.toast(
            "Couldn't copy. Press and hold the message text to select it.",
          );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
