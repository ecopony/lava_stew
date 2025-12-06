// ABOUTME: Events for chat BLoC.
// ABOUTME: User actions like sending messages.

export type ChatEvent =
  | { type: "setInputText"; text: string }
  | { type: "sendMessage" };
