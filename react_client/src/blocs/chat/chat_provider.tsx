// ABOUTME: React provider and hooks for ChatBloc.
// ABOUTME: Enables components to access chat state and dispatch events.

import { createBlocProvider } from "@granite-crisp/react-bloc";
import type { ChatBloc } from "./chat_bloc";

export const {
  Provider: ChatBlocProvider,
  useBloc: useChatBloc,
  useBlocState: useChatBlocState,
  useBlocSelector: useChatBlocSelector,
} = createBlocProvider<ChatBloc>("ChatBloc");
