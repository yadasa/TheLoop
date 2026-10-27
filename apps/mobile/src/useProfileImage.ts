import { useEffect, useState } from "react";
import { useLoop } from "@theloop/client";

/** Keep a stale image out of the render immediately when profile authority changes. */
export function useProfileImage(profileId?: string, imageId?: string) {
  const { state, getImage, mediaRevision } = useLoop();
  const profile = state.profiles.find((p) => p.id === profileId);
  const allowed =
    !!state.currentUserId &&
    !!profile &&
    profile.image?.id === imageId &&
    !state.preferences.blockedIds.includes(profile.id) &&
    (profile.id === state.currentUserId ||
      profile.visibility === "public" ||
      state.connections.some(
        (c) =>
          c.status === "accepted" &&
          [c.fromId, c.toId].includes(profile.id) &&
          [c.fromId, c.toId].includes(state.currentUserId),
      ));
  const key =
    allowed && imageId
      ? `${state.currentUserId}:${profileId}:${imageId}:${mediaRevision}`
      : "";
  const [loaded, setLoaded] = useState<{ key: string; uri: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    if (key && imageId)
      void getImage(imageId)
        .then((result) => {
          if (active) setLoaded({ key, uri: result.dataUrl });
        })
        .catch(() => {
          if (active) setLoaded(null);
        });
    return () => {
      active = false;
    };
  }, [key, imageId, getImage]);
  return key && loaded?.key === key ? loaded.uri : null;
}
