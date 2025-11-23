// ABOUTME: BLoC managing chat state and API server communication.
// ABOUTME: Consumes client event streams from API server for real-time updates.

import 'package:bloc/bloc.dart';
import 'package:logger/logger.dart';
import '../models/message.dart';
import '../models/agent_event.dart';
import '../services/api_client.dart';
import 'chat_event.dart';
import 'chat_state.dart';
import 'map_bloc.dart';
import 'map_event.dart';

class ChatBloc extends Bloc<ChatEvent, ChatState> {
  final ApiClient _apiClient;
  final MapBloc _mapBloc;
  final Logger _logger;

  ChatBloc({
    required ApiClient apiClient,
    required MapBloc mapBloc,
    Logger? logger,
  })  : _apiClient = apiClient,
        _mapBloc = mapBloc,
        _logger = logger ?? Logger(),
        super(ChatState()) {
    on<SendMessage>(_onSendMessage);
  }

  Future<void> _onSendMessage(
    SendMessage event,
    Emitter<ChatState> emit,
  ) async {
    // Add user message
    final userMessage = Message(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      kind: MessageKind.user,
      content: TextContent(event.message),
      timestamp: DateTime.now(),
    );

    final currentMessages = List<Message>.from(state.messages);
    currentMessages.add(userMessage);

    emit(state.copyWith(
      messages: currentMessages,
      status: ChatStatus.loading,
    ));

    try {
      final eventStream = _apiClient.sendMessage(
        conversationId: state.conversationId,
        message: event.message,
      );

      // Buffer for building up assistant message text
      String? currentAssistantMessageId;
      String assistantTextBuffer = '';
      int messageCounter = 0;

      await for (final clientEvent in eventStream) {
        _logger.d('Received client event: ${clientEvent.runtimeType}');

        switch (clientEvent) {
          case AssistantThinkingEvent():
            emit(state.copyWith(status: ChatStatus.assistantThinking));

          case AssistantMessageChunkEvent():
            // Build up assistant message incrementally
            assistantTextBuffer += clientEvent.chunk;

            // Create new message ID if we don't have one
            if (currentAssistantMessageId == null) {
              messageCounter++;
              currentAssistantMessageId =
                  'assistant_${DateTime.now().millisecondsSinceEpoch}_$messageCounter';

              // Create new message and append to list
              currentMessages.add(Message(
                id: currentAssistantMessageId,
                kind: MessageKind.assistant,
                content: TextContent(assistantTextBuffer),
                timestamp: DateTime.now(),
              ));
            } else {
              // Update the last message (which should be our current assistant message)
              final lastIndex = currentMessages.length - 1;
              if (lastIndex >= 0 &&
                  currentMessages[lastIndex].id == currentAssistantMessageId) {
                currentMessages[lastIndex] = Message(
                  id: currentAssistantMessageId,
                  kind: MessageKind.assistant,
                  content: TextContent(assistantTextBuffer),
                  timestamp: currentMessages[lastIndex].timestamp,
                );
              }
            }

            emit(state.copyWith(
              messages: List.from(currentMessages),
              status: ChatStatus.assistantTyping,
            ));

          case AssistantMessageCompleteEvent():
            // Clear buffer for next message
            currentAssistantMessageId = null;
            assistantTextBuffer = '';

            emit(state.copyWith(
              status: ChatStatus.idle,
            ));

          case ToolStartEvent():
            // Add tool call message
            final toolCallMessage = Message(
              id: clientEvent.toolId,
              kind: MessageKind.toolCall,
              content: ToolCallContent(
                toolName: clientEvent.toolName,
                input: clientEvent.input,
              ),
              timestamp: DateTime.now(),
            );
            currentMessages.add(toolCallMessage);

            emit(state.copyWith(
              messages: List.from(currentMessages),
              currentToolCall: clientEvent.toolName,
              status: ChatStatus.toolExecuting,
            ));

          case ToolResultEvent():
            // Add tool result message
            final toolResultMessage = Message(
              id: '${clientEvent.toolId}_result',
              kind: MessageKind.toolResult,
              content: ToolResultContent(
                toolName: clientEvent.toolName,
                result: clientEvent.result,
                error: clientEvent.error,
              ),
              timestamp: DateTime.now(),
            );
            currentMessages.add(toolResultMessage);

            emit(state.copyWith(
              messages: List.from(currentMessages),
              currentToolCall: null,
              status: ChatStatus.assistantThinking,
            ));

          case GeoFeatureEvent():
            // Add geo feature to map
            _mapBloc.add(AddGeoFeature(clientEvent.feature));

            // Optionally add as message too for chat history
            final geoMessage = Message(
              id: clientEvent.feature.id,
              kind: MessageKind.geoFeature,
              content: GeoFeatureContent(clientEvent.feature),
              timestamp: DateTime.now(),
            );
            currentMessages.add(geoMessage);

            emit(state.copyWith(messages: List.from(currentMessages)));

          case FeatureRemovedEvent():
            // Remove geo feature from map
            _mapBloc.add(RemoveGeoFeature(clientEvent.featureId));

          case ErrorEvent():
            throw Exception('${clientEvent.errorType}: ${clientEvent.message}');

          case DoneEvent():
            // Stream complete
            _logger.d('Stream complete');

          case UnknownEvent():
            _logger.w('Unknown event type: ${clientEvent.type}');
        }
      }

      emit(state.copyWith(
        messages: currentMessages,
        status: ChatStatus.idle,
        currentToolCall: null,
      ));
    } catch (e) {
      _logger.e('Error during message send: $e');

      final errorMessage = Message(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        kind: MessageKind.error,
        content: TextContent('Error: ${e.toString()}'),
        timestamp: DateTime.now(),
      );

      emit(state.copyWith(
        messages: [...currentMessages, errorMessage],
        status: ChatStatus.error,
        errorMessage: e.toString(),
        currentToolCall: null,
      ));
    }
  }

  @override
  Future<void> close() {
    // Don't dispose apiClient - it's shared and owned by the app
    return super.close();
  }
}
