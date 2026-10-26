import type { Persistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function loadAuthPersistence(): Promise<Persistence> {
  const auth = await import("firebase/auth");
  // Metro selects Firebase's react-native condition. Its browser declaration
  // does not include this native-only export.
  const nativeAuth = auth as unknown as {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
  };
  if (typeof nativeAuth.getReactNativePersistence !== "function")
    throw new Error(
      "Native authentication persistence is unavailable in this build.",
    );
  return nativeAuth.getReactNativePersistence(AsyncStorage);
}
