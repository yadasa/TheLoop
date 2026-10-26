import { Platform, Share } from "react-native";

export async function shareExport(
  data: Record<string, unknown>,
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  if (Platform.OS === "web") {
    await Share.share({
      title: "TheLoop personal data export",
      message: content,
    });
    return;
  }
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  if (!FileSystem.cacheDirectory)
    throw new Error("A private export folder is unavailable on this device.");
  const uri = `${FileSystem.cacheDirectory}theloop-personal-export.json`;
  await FileSystem.writeAsStringAsync(uri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("The device share sheet is unavailable.");
  await Sharing.shareAsync(uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Your TheLoop data",
  });
}
