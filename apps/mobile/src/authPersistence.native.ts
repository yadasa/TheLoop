import * as auth from "firebase/auth";
import type { Persistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase exposes this function in its react-native package condition; the
// browser declaration selected by TypeScript does not include that export.
const nativeAuth = auth as typeof auth & {
  getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
};
export const authPersistence =
  nativeAuth.getReactNativePersistence(AsyncStorage);
