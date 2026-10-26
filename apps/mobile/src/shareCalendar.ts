import { Platform, Share } from "react-native";

export async function shareCalendarFile(
  ics: string,
  title = "Share event calendar",
): Promise<void> {
  if (Platform.OS === "web") {
    await Share.share({ title, message: ics });
    return;
  }
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw new Error("Calendar sharing is unavailable.");
  const uri = `${FileSystem.cacheDirectory}theloop-event.ics`;
  await FileSystem.writeAsStringAsync(uri, ics, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(uri, {
    mimeType: "text/calendar",
    dialogTitle: title,
  });
}
