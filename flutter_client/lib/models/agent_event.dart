// ABOUTME: Domain events emitted by the agent for client consumption.
// ABOUTME: Abstracts away Agent SDK implementation details.

import 'dart:convert';
import 'geo_feature.dart';

/// Base class for all client events from the worker
abstract class AgentEvent {
  const AgentEvent();

  /// Parse a client event from JSON
  factory AgentEvent.fromJson(Map<String, dynamic> json) {
    final type = json['type'] as String?;

    switch (type) {
      case 'assistant_thinking':
        return const AssistantThinkingEvent();
      case 'assistant_message_chunk':
        return AssistantMessageChunkEvent(
          chunk: json['chunk'] as String? ?? '',
        );
      case 'assistant_message_complete':
        return const AssistantMessageCompleteEvent();
      case 'tool_start':
        return ToolStartEvent(
          toolId: json['toolId'] as String,
          toolName: json['toolName'] as String,
          input: json['input'] as Map<String, dynamic>? ?? {},
        );
      case 'tool_result':
        return ToolResultEvent(
          toolId: json['toolId'] as String,
          toolName: json['toolName'] as String,
          result: json['result'] as Map<String, dynamic>?,
          error: json['error'] as String?,
        );
      case 'subagent_started':
        return SubagentStartedEvent(
          toolId: json['toolId'] as String,
          agentName: json['agentName'] as String,
        );
      case 'subagent_completed':
        return SubagentCompletedEvent(
          toolId: json['toolId'] as String,
          agentName: json['agentName'] as String,
          error: json['error'] as String?,
        );
      case 'geo_feature':
        return GeoFeatureEvent(
          feature: GeoFeature.fromJson(json),
        );
      case 'feature_removed':
        return FeatureRemovedEvent(
          featureId: json['featureId'] as String,
          label: json['label'] as String? ?? 'Unknown',
        );
      case 'error':
        return ErrorEvent(
          errorType: json['errorType'] as String? ?? 'unknown',
          message: json['message'] as String? ?? 'Unknown error',
        );
      case 'done':
        return const DoneEvent();
      default:
        return UnknownEvent(type: type ?? 'unknown', data: json);
    }
  }

  /// Parse from SSE data string
  factory AgentEvent.fromSSEData(String data) {
    final json = jsonDecode(data) as Map<String, dynamic>;
    return AgentEvent.fromJson(json);
  }
}

/// Assistant is thinking (before first content arrives)
class AssistantThinkingEvent extends AgentEvent {
  const AssistantThinkingEvent();
}

/// Assistant message chunk (incremental text)
class AssistantMessageChunkEvent extends AgentEvent {
  final String chunk;

  const AssistantMessageChunkEvent({required this.chunk});
}

/// Assistant message is complete
class AssistantMessageCompleteEvent extends AgentEvent {
  const AssistantMessageCompleteEvent();
}

/// Tool execution started
class ToolStartEvent extends AgentEvent {
  final String toolId;
  final String toolName;
  final Map<String, dynamic> input;

  const ToolStartEvent({
    required this.toolId,
    required this.toolName,
    required this.input,
  });
}

/// Tool execution completed with result or error
class ToolResultEvent extends AgentEvent {
  final String toolId;
  final String toolName;
  final Map<String, dynamic>? result;
  final String? error;

  const ToolResultEvent({
    required this.toolId,
    required this.toolName,
    this.result,
    this.error,
  });

  bool get isError => error != null;
}

/// Sub-agent started
class SubagentStartedEvent extends AgentEvent {
  final String toolId;
  final String agentName;

  const SubagentStartedEvent({
    required this.toolId,
    required this.agentName,
  });
}

/// Sub-agent completed
class SubagentCompletedEvent extends AgentEvent {
  final String toolId;
  final String agentName;
  final String? error;

  const SubagentCompletedEvent({
    required this.toolId,
    required this.agentName,
    this.error,
  });

  bool get isError => error != null;
}

/// Geographic feature extracted from tool result
class GeoFeatureEvent extends AgentEvent {
  final GeoFeature feature;

  const GeoFeatureEvent({required this.feature});
}

/// Geographic feature removed from map
class FeatureRemovedEvent extends AgentEvent {
  final String featureId;
  final String label;

  const FeatureRemovedEvent({
    required this.featureId,
    required this.label,
  });
}

/// Error occurred during processing
class ErrorEvent extends AgentEvent {
  final String errorType; // 'tool_error', 'api_error', 'stream_error'
  final String message;

  const ErrorEvent({
    required this.errorType,
    required this.message,
  });
}

/// Stream is complete
class DoneEvent extends AgentEvent {
  const DoneEvent();
}

/// Unknown event type (for forward compatibility)
class UnknownEvent extends AgentEvent {
  final String type;
  final Map<String, dynamic> data;

  const UnknownEvent({required this.type, required this.data});
}
