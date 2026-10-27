import type { Post } from "@theloop/core";
export const defaultPollChoices = "Coffee meetup\nDinner\nA panel discussion";
export const postDraftTarget = { kind: "post" as const, id: "new-post" };
export type PostDraft = {
  communityId: string;
  kind: Post["kind"];
  title: string;
  body: string;
  url: string;
  options: string;
  hasImage?: boolean;
};
/** One unfinished post per signed-in account, held only while the app is open. */
export class PostDrafts {
  private value?: PostDraft;
  constructor(private accountId: string) {}
  read(accountId: string) {
    if (accountId !== this.accountId) {
      this.clear();
      return;
    }
    return this.value ? { ...this.value } : undefined;
  }
  remember(accountId: string, value: PostDraft) {
    if (!accountId || accountId !== this.accountId) {
      this.clear();
      return;
    }
    if (
      !value.title &&
      !value.body &&
      !value.url &&
      !value.hasImage &&
      value.options === defaultPollChoices
    ) {
      this.clear();
      return;
    }
    this.value = {
      ...value,
      title: value.title.slice(0, 160),
      body: value.body.slice(0, 5000),
      url: value.url.slice(0, 5000),
      options: value.options.slice(0, 5000),
    };
  }
  clear() {
    this.value = undefined;
  }
}
