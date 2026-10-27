import { Platform } from "react-native";

/** Call only for temporary images created by this app's image preparation. */
export async function removeCreatedImage(uri: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
      return;
    }
    const { File } = await import("expo-file-system");
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The OS can already have evicted this temporary cache file.
  }
}
