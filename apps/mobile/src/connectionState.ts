export type ConnectionState = {
  isConnected?: boolean;
  isInternetReachable?: boolean;
};

// Unknown signals (including a browser's UNKNOWN connection type) aren't offline.
export function isOffline(state: ConnectionState): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}
