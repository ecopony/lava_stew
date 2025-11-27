// ABOUTME: Chat message model for displaying conversation history.
// ABOUTME: Supports user messages, assistant messages, tool calls, and errors.

import 'geo_feature.dart';

enum MessageKind {
  user,
  assistant,
  toolCall,
  toolResult,
  subagentCall,
  subagentResult,
  geoFeature,
  error,
}

abstract class MessageContent {
  const MessageContent();
}

class TextContent extends MessageContent {
  final String text;
  const TextContent(this.text);
}

class ToolCallContent extends MessageContent {
  final String toolName;
  final Map<String, dynamic> input;
  const ToolCallContent({
    required this.toolName,
    required this.input,
  });
}

class ToolResultContent extends MessageContent {
  final String toolName;
  final Map<String, dynamic>? result;
  final String? error;
  const ToolResultContent({
    required this.toolName,
    this.result,
    this.error,
  });
}

class SubagentCallContent extends MessageContent {
  final String agentName;
  const SubagentCallContent({
    required this.agentName,
  });
}

class SubagentResultContent extends MessageContent {
  final String agentName;
  final String? error;
  const SubagentResultContent({
    required this.agentName,
    this.error,
  });
}

class GeoFeatureContent extends MessageContent {
  final GeoFeature feature;
  const GeoFeatureContent(this.feature);
}

class Message {
  final String id;
  final MessageKind kind;
  final MessageContent content;
  final DateTime timestamp;

  Message({
    required this.id,
    required this.kind,
    required this.content,
    required this.timestamp,
  });
}
