const fallback = "We couldn’t complete that action. Try again.";
const signInFailure = "We couldn’t sign you in with those details. Check your email and password, or reset your password.";
const connectionFailure = "Couldn’t connect. Check your connection and try again.";

const authMessages: Record<string, string> = {
  "invalid-credential": signInFailure,
  "invalid-login-credentials": signInFailure,
  "wrong-password": signInFailure,
  "user-not-found": signInFailure,
  "user-disabled": signInFailure,
  "email-already-in-use": "We couldn’t create an account with those details. Try signing in or resetting your password.",
  "account-exists-with-different-credential": "We couldn’t complete sign-in. Try signing in again or resetting your password.",
  "invalid-email": "Enter a valid email address.",
  "missing-email": "Enter your email address.",
  "missing-password": "Enter your password.",
  "weak-password": "Choose a stronger password. Check the password requirements and try again.",
  "password-does-not-meet-requirements": "Choose a stronger password. Check the password requirements and try again.",
  "requires-recent-login": "Sign in again, then retry this action.",
  "user-token-expired": "Your session expired. Sign in again.",
  "invalid-user-token": "Your session expired. Sign in again.",
  "too-many-requests": "Too many attempts. Wait before trying again.",
  "network-request-failed": connectionFailure,
  "timeout": connectionFailure,
  "invalid-action-code": "This link is invalid or has expired. Request a new link and try again.",
  "expired-action-code": "This link is invalid or has expired. Request a new link and try again.",
  "popup-closed-by-user": "Sign-in was cancelled. Try again when you’re ready.",
  "cancelled-popup-request": "Sign-in was cancelled. Try again when you’re ready.",
  "popup-blocked": "Allow pop-ups to continue sign-in, then try again.",
};
const authConfiguration = new Set(["invalid-api-key", "app-not-authorized", "unauthorized-domain", "operation-not-allowed", "operation-not-supported-in-this-environment", "configuration-not-found", "invalid-app-credential"]);
const serviceMessages: Record<string, string> = {
  "unauthenticated": "Sign in again to continue.",
  "permission-denied": "You don’t have access to this item. Check that you’re signed in to the right account.",
  "not-found": "This item is unavailable. It may have been removed or your access may have changed.",
  "invalid-argument": "Check the information you entered and try again.",
  "failed-precondition": "This action isn’t available right now. Refresh the details and try again.",
  "resource-exhausted": "Too many requests. Wait before trying again.",
  "already-exists": "This item already exists. Refresh the details and try again.",
  "aborted": "This item changed. Refresh its details and try again.",
  "out-of-range": "Check the information you entered and try again.",
  "cancelled": "The request was cancelled. Try again.",
  "unavailable": "The service is temporarily unavailable. Try again in a moment.",
  "deadline-exceeded": "The request timed out. Check your connection and try again.",
  "unimplemented": "This action isn’t available. Update the app and try again.",
};
const callableDetails = new Set(["invalid-argument", "failed-precondition", "permission-denied", "resource-exhausted", "already-exists", "aborted", "out-of-range", "not-found"]);
const knownServices = new Set([...Object.keys(serviceMessages), "internal", "unknown", "data-loss"]);

/** Keep actionable validation text, but never turn transport/debug details into UI copy. */
function safeMessage(raw: string): string | undefined {
  if (raw.length > 4096) return undefined;
  const technical = /(?:\b(?:https?|wss?|gs|file):\/\/\S|\b[A-Za-z]:[\\/]|\bprojects\/|\bnode_modules\b|\/(?:home|Users|var|etc|tmp|srv)\/|\b(?:googleapis\.com|cloudfunctions\.net|run\.app|localhost)\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:api[_ -]?key|authorization|bearer|token|access[_ -]?token|refresh[_ -]?token|id[_ -]?token|password)\s*[:=]|\bbearer\s+[a-z0-9_-]+|\b(?:TypeError|ReferenceError|SyntaxError|RangeError|InternalError|ECONN\w*|ERR_[A-Z_]+|PERMISSION_DENIED|DEADLINE_EXCEEDED|INTERNAL_SERVER_ERROR|INVALID_ARGUMENT|FAILED_PRECONDITION|RESOURCE_EXHAUSTED|UNAUTHENTICATED|DATA_LOSS|INTERNAL_ERROR|UNKNOWN_ERROR)\b|\binternal (?:server )?error\b|\b(?:HTTP\s*|status(?: code)?\s*)[45]\d\d\b|\b[\w.-]+\.[cm]?[jt]sx?:\d+|(?:^|\n)\s*at\s+|<\/?[A-Za-z]|[{}])/i;
  if (technical.test(raw)) return undefined;
  let message = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim();
  for (let pass = 0; pass < 3; pass++) message = message.replace(/^(?:FirebaseError|Firebase|Error):\s*/i, "");
  message = message.replace(/\s*\((?:auth|functions|firestore|storage|app)\/[a-z0-9-]+\)\.?\s*$/i, "").replace(/\s+/g, " ").trim();
  if (!message || /^[\w./-]+$/.test(message) || /^(?:error|unknown|internal|undefined|null|unavailable|permission[-_]denied|request failed|something went wrong)[.!:\s]*$/i.test(message) || /\b(?:auth|functions|firestore|storage|app)\/[a-z0-9-]+\b/i.test(message)) return undefined;
  if (message.length > 240) {
    const prefix = message.slice(0, 239), boundary = prefix.lastIndexOf(" ");
    message = (boundary > 160 ? prefix.slice(0, boundary) : prefix).trimEnd() + "…";
  }
  return message;
}

export function readableError(error: unknown): string {
  let code = "", message = "", name = "", local = false;
  try {
    if (!error || typeof error !== "object") return fallback;
    const value = error as { code?: unknown; message?: unknown; name?: unknown };
    code = typeof value.code === "string" ? value.code.trim().toLowerCase() : "";
    message = typeof value.message === "string" ? value.message : "";
    name = typeof value.name === "string" ? value.name : "";
    local = error instanceof Error;
  } catch { return fallback; }
  if (!code) code = /\b((?:auth|functions|firestore|storage|app)\/[a-z0-9-]+)\b/i.exec(message)?.[1].toLowerCase() ?? "";
  if (code.startsWith("auth/")) {
    const reason = code.slice(5);
    return (Object.hasOwn(authMessages, reason) ? authMessages[reason] : undefined) ?? (authConfiguration.has(reason) ? "Sign-in is unavailable right now. Try again later." : fallback);
  }
  const service = code.replace(/^(?:functions|firestore)\//, "");
  if (knownServices.has(service)) {
    if (code.startsWith("functions/") && callableDetails.has(service)) return safeMessage(message) ?? serviceMessages[service] ?? fallback;
    return serviceMessages[service] ?? fallback;
  }
  if (/^(?:functions|firestore|storage|app)\//.test(code) || name === "FirebaseError") return fallback;
  if (/^(?:Failed to fetch|Network request failed|Load failed|NetworkError when attempting to fetch resource\.?)[.!]?$/i.test(message.trim())) return connectionFailure;
  if (name === "AbortError") return serviceMessages.cancelled;
  if (!local || ["TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError", "EvalError"].includes(name)) return fallback;
  return safeMessage(message) ?? fallback;
}
