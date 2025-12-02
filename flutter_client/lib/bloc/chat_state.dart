// ABOUTME: State model for chat BLoC.
// ABOUTME: Tracks messages, loading status, and current conversation.

import 'package:equatable/equatable.dart';
import '../models/message.dart';

enum ChatStatus {
  idle,
  loading,
  assistantThinking,
  assistantTyping,
  toolExecuting,
  subagentExecuting,
  error
}

class ChatState extends Equatable {
  final String conversationId;
  final List<Message> messages;
  final ChatStatus status;
  final String? errorMessage;
  final String? currentToolCall;
  final String? currentSubagent;

  ChatState({
    String? conversationId,
    List<Message>? messages,
    this.status = ChatStatus.idle,
    this.errorMessage,
    this.currentToolCall,
    this.currentSubagent,
  })  : conversationId = conversationId ?? _generateConversationId(),
        messages = messages ?? [];

  static String _generateConversationId() {
    return 'conv_${DateTime.now().millisecondsSinceEpoch}';
  }

  ChatState copyWith({
    String? conversationId,
    List<Message>? messages,
    ChatStatus? status,
    String? errorMessage,
    String? currentToolCall,
    String? currentSubagent,
  }) {
    return ChatState(
      conversationId: conversationId ?? this.conversationId,
      messages: messages ?? this.messages,
      status: status ?? this.status,
      errorMessage: errorMessage ?? this.errorMessage,
      currentToolCall: currentToolCall,
      currentSubagent: currentSubagent,
    );
  }

  @override
  List<Object?> get props => [conversationId, messages, status, errorMessage, currentToolCall, currentSubagent];
}
