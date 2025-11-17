// ABOUTME: Chat interface pane with message list and input field.
// ABOUTME: Displays user and assistant messages, tool calls, and errors.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../bloc/chat_bloc.dart';
import '../../bloc/chat_event.dart';
import '../../bloc/chat_state.dart';
import 'message_bubble.dart';

class ChatPane extends StatefulWidget {
  const ChatPane({super.key});

  @override
  State<ChatPane> createState() => _ChatPaneState();
}

class _ChatPaneState extends State<ChatPane> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    context.read<ChatBloc>().add(SendMessage(text));
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: BlocBuilder<ChatBloc, ChatState>(
            builder: (context, state) {
              // Auto-scroll to bottom when messages change
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (_scrollController.hasClients) {
                  _scrollController.animateTo(
                    _scrollController.position.maxScrollExtent,
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeOut,
                  );
                }
              });

              final statusText = state.status == ChatStatus.assistantThinking
                  ? 'Assistant is thinking...'
                  : state.status == ChatStatus.toolExecuting &&
                          state.currentToolCall != null
                      ? 'Using ${state.currentToolCall}...'
                      : null;

              return ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: state.messages.length + (statusText != null ? 1 : 0),
                itemBuilder: (context, index) {
                  // Show status indicator
                  if (index == state.messages.length && statusText != null) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            statusText,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return MessageBubble(message: state.messages[index]);
                },
              );
            },
          ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(
                    hintText: 'Ask about locations or distances...',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              const SizedBox(width: 8),
              BlocBuilder<ChatBloc, ChatState>(
                builder: (context, state) {
                  final isProcessing = state.status != ChatStatus.idle &&
                      state.status != ChatStatus.error;
                  return IconButton(
                    icon: const Icon(Icons.send),
                    onPressed: isProcessing ? null : _sendMessage,
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
