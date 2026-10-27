import { useImageDrafts } from "./DraftProvider";
import type { DraftTarget } from "./conversationDrafts";
import type { ImageChoice } from "./imageDrafts";
import { removeCreatedImage } from "./mediaFiles";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image, Modal, Platform, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { stripWebPMetadata, useLoop } from "@theloop/client";
import type { Command, ImageAttachment, MediaTarget } from "@theloop/core";
import { Button, color, MotionScene, s, Touch, useReducedMotion } from "./ui";
import type { Nav } from "./navigation";

const sourceLimit = 5 * 1024 * 1024;
const imageLimit = 1024 * 1024;
type Choice = ImageChoice;

async function bytesAt(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "web")
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  const { File } = await import("expo-file-system");
  return new File(uri).bytes();
}

function imageFormat(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "jpeg";
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

export function confirmContentReport(
  nav: Nav,
  command: Extract<Command, { type: "report.create" }>,
  hasImage: boolean,
) {
  nav.alert(
    "Report this content?",
    `Moderators will receive this selected content${hasImage ? " and its attached image" : ""} for review.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send report",
        onPress: () => void nav.run(command, "Report sent to moderators"),
      },
    ],
    { cancelable: true },
  );
}

async function normalizeImage(
  asset: ImagePicker.ImagePickerAsset,
): Promise<Choice> {
  if (asset.fileSize && asset.fileSize > sourceLimit)
    throw new Error("Choose an image smaller than 5 MB.");
  const source = await bytesAt(asset.uri);
  if (!source.length || source.length > sourceLimit)
    throw new Error("Choose an image smaller than 5 MB.");
  if (!imageFormat(source))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  const context = ImageManipulator.manipulate(asset.uri, {
    maxWidth: 2048,
    maxHeight: 2048,
  });
  let rendered = await context.renderAsync();
  try {
    for (let pass = 0; pass < 4; pass++) {
      if (
        !Number.isFinite(rendered.width) ||
        !Number.isFinite(rendered.height) ||
        rendered.width < 1 ||
        rendered.height < 1 ||
        rendered.width * rendered.height > 12_000_000 ||
        Math.max(rendered.width, rendered.height) > 2048
      )
        throw new Error(
          "This image could not be prepared safely. Choose another photo.",
        );
      for (const quality of [0.82, 0.66, 0.48, 0.3, 0.18]) {
        const saved = await rendered.saveAsync({
          format: SaveFormat.WEBP,
          compress: quality,
        });
        const bytes = stripWebPMetadata(await bytesAt(saved.uri));
        if (
          bytes.length > 0 &&
          bytes.length <= imageLimit &&
          imageFormat(bytes) === "webp"
        )
          return {
            uri: saved.uri,
            width: saved.width,
            height: saved.height,
            bytes,
          };
        await removeCreatedImage(saved.uri);
      }
      const width = Math.max(1, Math.floor(rendered.width * 0.75));
      const height = Math.max(1, Math.floor(rendered.height * 0.75));
      context.resize({ width, height });
      const previous = rendered;
      rendered = await context.renderAsync();
      previous.release();
    }
    throw new Error("This image is still too large. Choose a smaller photo.");
  } finally {
    rendered.release();
    context.release();
  }
}

export function useImageAttachment(nav: Nav, target?: DraftTarget | null) {
  const { state, uploadImage, discardImage } = useLoop();
  const drafts = useImageDrafts();
  const scope = JSON.stringify([
    state.currentUserId,
    target?.kind,
    target?.id,
    target?.topic,
  ]);
  const [localChoice, setChoice] = useState<Choice | null>(() =>
    target ? drafts.book.read(target, state) : null,
  );
  const choice = target
    ? drafts.book.read(target, state)
    : target === null
      ? null
      : localChoice;
  const [busy, setBusy] = useState(false);
  const chosen = useRef<Choice | null>(choice);
  const generation = useRef(0);
  const uploaded = useRef<{ key: string; image: ImageAttachment } | null>(null);
  const clear = () => {
    generation.current++;
    if (target) drafts.book.remove(target);
    else if (chosen.current) void removeCreatedImage(chosen.current.uri);
    if (uploaded.current) discardImage(uploaded.current.image.id);
    chosen.current = null;
    uploaded.current = null;
    setChoice(null);
    setBusy(false);
  };
  useLayoutEffect(() => {
    generation.current++;
    chosen.current = target ? drafts.book.read(target, drafts.state()) : null;
    setChoice(chosen.current);
    setBusy(false);
    return () => {
      generation.current++;
      // Conversation photos belong to the account-scoped draft book, not this screen.
      if (!target && chosen.current)
        void removeCreatedImage(chosen.current.uri);
      if (uploaded.current) discardImage(uploaded.current.image.id);
      chosen.current = null;
      uploaded.current = null;
    };
  }, [scope, drafts.book, discardImage]);
  const pick = async () => {
    if (target === null) return;
    const request = ++generation.current;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        allowsEditing: false,
        quality: 1,
        exif: false,
        base64: false,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (
        result.canceled ||
        request !== generation.current ||
        !result.assets[0]
      )
        return;
      const next = await normalizeImage(result.assets[0]);
      if (request !== generation.current) {
        await removeCreatedImage(next.uri);
        return;
      }
      if (target) {
        try {
          drafts.book.remember(target, next, drafts.state());
        } catch (error) {
          await removeCreatedImage(next.uri);
          throw error;
        }
      } else if (chosen.current) await removeCreatedImage(chosen.current.uri);
      // Removing the previous cache file may yield while this screen/account closes.
      if (request !== generation.current) {
        if (!target) await removeCreatedImage(next.uri);
        return;
      }
      if (uploaded.current) discardImage(uploaded.current.image.id);
      chosen.current = next;
      uploaded.current = null;
      setChoice(next);
    } catch (error) {
      if (request === generation.current)
        nav.toast(
          error instanceof Error
            ? error.message
            : "Could not prepare this image.",
        );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const resolve = async (
    uploadTarget: MediaTarget,
  ): Promise<ImageAttachment | null> => {
    const current = target
      ? drafts.book.read(target, drafts.state())
      : chosen.current;
    if (!current) return null;
    const request = generation.current,
      key = `${uploadTarget.kind}:${uploadTarget.id}`;
    if (uploaded.current?.key === key) return uploaded.current.image;
    if (uploaded.current) {
      discardImage(uploaded.current.image.id);
      uploaded.current = null;
    }
    setBusy(true);
    try {
      const image = await uploadImage(uploadTarget, {
        data: current.bytes,
        contentType: "image/webp",
        width: current.width,
        height: current.height,
      });
      if (request !== generation.current) {
        discardImage(image.id);
        throw new Error("Your image selection changed. Please send again.");
      }
      uploaded.current = { key, image };
      return image;
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  return { choice, busy, pick, clear, resolve, retained: !!target };
}

export function ImageAttachmentPicker({
  attachment,
  disabled = false,
}: {
  attachment: ReturnType<typeof useImageAttachment>;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [attachment.choice?.uri]);
  return (
    <View style={{ gap: 9 }}>
      {attachment.choice && (
        <MotionScene
          identity={attachment.choice.uri}
          style={[s.card, s.row, { padding: 10, gap: 12 }]}
        >
          <Touch
            label="Preview selected image"
            onPress={() => setExpanded(true)}
          >
            <Image
              source={{ uri: attachment.choice.uri }}
              accessibilityLabel="Image selected for your next message"
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                backgroundColor: color.soft,
              }}
              resizeMode="cover"
            />
          </Touch>
          <View style={[s.grow, { gap: 4 }]}>
            <Text style={s.h3}>Photo ready</Text>
            <Text style={s.small}>
              {Math.max(
                1,
                Math.ceil(attachment.choice.bytes.byteLength / 1024),
              )}{" "}
              KB · Not sent
            </Text>
            <Text style={[s.small, { fontSize: 11 }]}>
              {attachment.retained
                ? "Saved in this chat for this session"
                : "Stays on this device until sent"}
            </Text>
          </View>
          <Touch
            label="Remove selected image"
            disabled={disabled || attachment.busy}
            onPress={attachment.clear}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[s.body, { fontSize: 24 }]}>×</Text>
          </Touch>
        </MotionScene>
      )}
      <View style={{ alignSelf: "flex-start" }}>
        <Button
          small
          secondary
          title={
            attachment.busy
              ? "Preparing image…"
              : attachment.choice
                ? "Replace image"
                : "＋ Image"
          }
          disabled={disabled || attachment.busy}
          onPress={() => void attachment.pick()}
        />
      </View>
      <ImageViewer
        uri={expanded ? attachment.choice?.uri : undefined}
        caption="Selected photo · not sent"
        onClose={() => setExpanded(false)}
      />
    </View>
  );
}

function ImageViewer({
  uri,
  caption,
  onClose,
}: {
  uri?: string;
  caption: string;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <Modal
      visible={!!uri}
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: color.viewer }}>
        <StatusBar style="light" />
        <Touch
          label="Close image"
          onPress={onClose}
          style={{ padding: 22, alignSelf: "flex-end", minHeight: 44 }}
        >
          <Text style={{ color: color.viewerText, fontSize: 17 }}>Close ×</Text>
        </Touch>
        {uri && (
          <Image
            source={{ uri }}
            accessibilityLabel={caption || "Shared image"}
            style={{ flex: 1, width: "100%" }}
            resizeMode="contain"
            resizeMethod="resize"
          />
        )}
        <Text
          style={{ color: color.viewerText, padding: 22, lineHeight: 22 }}
          numberOfLines={4}
        >
          {caption}
        </Text>
      </SafeAreaView>
    </Modal>
  );
}

export function MediaImage({
  image,
  caption,
  reportId,
  nav,
}: {
  image?: ImageAttachment;
  caption: string;
  reportId?: string;
  nav: Nav;
}) {
  const { state } = useLoop();
  if (!image) return null;
  return (
    <PrivateImage
      key={`${state.currentUserId}:${image.id}:${reportId || ""}`}
      image={image}
      caption={caption}
      reportId={reportId}
      nav={nav}
    />
  );
}

function PrivateImage({
  image,
  caption,
  reportId,
  nav,
}: {
  image: ImageAttachment;
  caption: string;
  reportId?: string;
  nav: Nav;
}) {
  const { state, getImage, mediaRevision } = useLoop();
  const [uri, setUri] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setUri(null);
    setBusy(false);
    setExpanded(false);
    return () => {
      generation.current++;
    };
  }, [image.id, reportId, state.currentUserId, mediaRevision]);
  const load = async () => {
    const request = ++generation.current;
    setBusy(true);
    try {
      const result = await getImage(image.id, reportId);
      if (request === generation.current) setUri(result.dataUrl);
    } catch (error) {
      if (request === generation.current)
        nav.toast(
          error instanceof Error
            ? error.message
            : "This image is no longer available.",
        );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  return (
    <View style={{ gap: 7 }}>
      {uri ? (
        <>
          <Touch label="Open shared image" onPress={() => setExpanded(true)}>
            <Image
              source={{ uri }}
              accessibilityLabel={caption || "Shared image"}
              style={{
                width: "100%",
                height: Math.max(
                  140,
                  Math.min(300, (300 * image.height) / image.width),
                ),
                borderRadius: 13,
                backgroundColor: color.soft,
              }}
              resizeMode="contain"
              resizeMethod="resize"
            />
          </Touch>
          <Touch
            label="Hide shared image"
            onPress={() => {
              generation.current++;
              setUri(null);
              setExpanded(false);
            }}
            style={{ paddingVertical: 5 }}
          >
            <Text style={s.small}>Hide image</Text>
          </Touch>
        </>
      ) : (
        <Button
          small
          secondary
          title={busy ? "Loading image…" : "View image ↗"}
          disabled={busy}
          onPress={() => void load()}
        />
      )}
      <ImageViewer
        uri={expanded ? uri || undefined : undefined}
        caption={caption}
        onClose={() => setExpanded(false)}
      />
    </View>
  );
}
