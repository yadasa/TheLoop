export type DialogButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
};
export type DialogOptions = { cancelable?: boolean; onDismiss?: () => void };
export type ShowDialog = (
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: DialogOptions,
) => void;
export type DialogRequest = {
  id: number;
  scope: string;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options: DialogOptions;
};

/** Consume before invoking: repeated taps cannot repeat a mutation, and nested choices queue safely. */
export class DialogQueue {
  private scope = "";
  private nextId = 0;
  private generation = 0;
  private queue: DialogRequest[] = [];
  constructor(
    private publish: (request: DialogRequest | null) => void,
    private onError: (error: unknown) => void,
  ) {}
  setScope(scope: string) {
    if (this.scope === scope) return;
    this.scope = scope;
    this.generation++;
    this.queue = [];
    this.publish(null);
  }
  show(
    scope: string,
    title: string,
    message?: string,
    buttons?: DialogButton[],
    options: DialogOptions = {},
  ) {
    if (scope !== this.scope) return;
    this.queue.push({
      id: ++this.nextId,
      scope,
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: "OK" }],
      options,
    });
    this.publish(this.queue[0]);
  }
  choose(id: number, index: number, scope: string) {
    const current = this.queue[0];
    if (
      !current ||
      current.id !== id ||
      current.scope !== scope ||
      !current.buttons[index]
    )
      return;
    const button = current.buttons[index];
    this.queue.shift();
    this.publish(this.queue[0] || null);
    this.invoke(button.onPress);
  }
  dismiss(id: number, scope: string) {
    const current = this.queue[0];
    if (
      !current ||
      current.id !== id ||
      current.scope !== scope ||
      current.options.cancelable === false
    )
      return;
    this.queue.shift();
    this.publish(this.queue[0] || null);
    this.invoke(
      current.buttons.find((button) => button.style === "cancel")?.onPress,
    );
    this.invoke(current.options.onDismiss);
  }
  clear() {
    this.generation++;
    this.queue = [];
    this.publish(null);
  }
  private invoke(callback?: () => void | Promise<void>) {
    if (!callback) return;
    const generation = this.generation;
    const report = (error: unknown) => {
      if (generation === this.generation) this.onError(error);
    };
    try {
      Promise.resolve(callback()).catch(report);
    } catch (error) {
      report(error);
    }
  }
}
