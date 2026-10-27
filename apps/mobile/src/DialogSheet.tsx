import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Text } from "react-native";
import { readableError } from "@theloop/client";
import { Button, s } from "./ui";
import { Sheet } from "./Sheet";
import {
  DialogQueue,
  type DialogRequest,
  type ShowDialog,
} from "./dialogQueue";

export function useDialogSheet(
  scope: string,
  onError: (message: string) => void,
) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const report = useRef(onError);
  report.current = onError;
  const [queue] = useState(
    () =>
      new DialogQueue(setRequest, (error) =>
        report.current(readableError(error)),
      ),
  );
  useLayoutEffect(() => queue.setScope(scope), [scope, queue]);
  useEffect(() => () => queue.clear(), [queue]);
  const alert: ShowDialog = useCallback(
    (title, message, buttons, options) => {
      if (scope === currentScope.current)
        queue.show(scope, title, message, buttons, options);
    },
    [scope, queue],
  );
  const active = request?.scope === scope ? request : null;
  const dialogSheet = active ? (
    <Sheet
      key={active.id}
      visible
      title={active.title}
      dismissible={active.options.cancelable !== false}
      onClose={() => queue.dismiss(active.id, currentScope.current)}
    >
      {active.message && (
        <Text style={[s.body, { marginBottom: 10 }]}>{active.message}</Text>
      )}
      {active.buttons.map((button, index) => (
        <Button
          key={`${index}:${button.text}`}
          title={button.text}
          secondary={
            button.style === "cancel" ||
            (active.buttons.length > 2 && button.style !== "destructive")
          }
          onPress={() => queue.choose(active.id, index, currentScope.current)}
        />
      ))}
    </Sheet>
  ) : null;
  return { alert, dialogSheet, dialogOpen: Boolean(active) };
}
