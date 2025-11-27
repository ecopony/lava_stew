// ABOUTME: Individual message bubble widget.
// ABOUTME: Renders different message types with appropriate styling.

import 'package:flutter/material.dart';
import '../../models/message.dart';

class MessageBubble extends StatelessWidget {
  final Message message;

  const MessageBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    // Don't display geoFeature messages in chat (they're for the map only)
    if (message.kind == MessageKind.geoFeature) {
      return const SizedBox.shrink();
    }

    final isUser = message.kind == MessageKind.user;
    final isError = message.kind == MessageKind.error;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 500),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: isError
                ? Theme.of(context).colorScheme.error.withOpacity(0.1)
                : isUser
                    ? Theme.of(context).colorScheme.primary.withOpacity(0.1)
                    : Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isError
                  ? Theme.of(context).colorScheme.error
                  : isUser
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withOpacity(0.2),
            ),
          ),
          child: _buildContent(context),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final content = message.content;

    if (content is TextContent) {
      return Text(
        content.text,
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurface,
        ),
      );
    } else if (content is ToolCallContent) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.build,
                size: 16,
                color: Theme.of(context).colorScheme.secondary,
              ),
              const SizedBox(width: 8),
              Text(
                'Using ${content.toolName}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.secondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            content.input.toString(),
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.onSurface.withOpacity(0.7),
            ),
          ),
        ],
      );
    } else if (content is ToolResultContent) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                content.error != null ? Icons.error : Icons.check_circle,
                size: 16,
                color: content.error != null
                    ? Theme.of(context).colorScheme.error
                    : Theme.of(context).colorScheme.secondary,
              ),
              const SizedBox(width: 8),
              Text(
                '${content.toolName} result',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: content.error != null
                      ? Theme.of(context).colorScheme.error
                      : Theme.of(context).colorScheme.secondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            content.error ?? content.result.toString(),
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.onSurface.withOpacity(0.7),
            ),
          ),
        ],
      );
    } else if (content is SubagentCallContent) {
      return Row(
        children: [
          Icon(
            Icons.psychology,
            size: 16,
            color: Theme.of(context).colorScheme.tertiary,
          ),
          const SizedBox(width: 8),
          Text(
            'Sub-agent: ${content.agentName}',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Theme.of(context).colorScheme.tertiary,
            ),
          ),
        ],
      );
    } else if (content is SubagentResultContent) {
      return Row(
        children: [
          Icon(
            content.error != null ? Icons.error : Icons.check_circle,
            size: 16,
            color: content.error != null
                ? Theme.of(context).colorScheme.error
                : Theme.of(context).colorScheme.tertiary,
          ),
          const SizedBox(width: 8),
          Text(
            '${content.agentName} ${content.error != null ? 'failed' : 'completed'}',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: content.error != null
                  ? Theme.of(context).colorScheme.error
                  : Theme.of(context).colorScheme.tertiary,
            ),
          ),
        ],
      );
    }

    return const Text('Unknown message type');
  }
}
