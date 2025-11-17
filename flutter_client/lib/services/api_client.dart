// ABOUTME: Client for communicating with the API server.
// ABOUTME: Handles SSE streaming for real-time agent responses.

import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:logger/logger.dart';
import '../models/agent_event.dart';

class ApiClient {
  final String baseUrl;
  final http.Client _httpClient;
  final Logger _logger;

  ApiClient({
    required this.baseUrl,
    http.Client? httpClient,
    Logger? logger,
  })  : _httpClient = httpClient ?? http.Client(),
        _logger = logger ?? Logger();

  /// Sends a message and streams agent events.
  Stream<AgentEvent> sendMessage({
    required String conversationId,
    required String message,
  }) async* {
    final request = http.Request(
      'POST',
      Uri.parse('$baseUrl/chat'),
    );

    request.headers['Content-Type'] = 'application/json';
    request.body = jsonEncode({
      'conversationId': conversationId,
      'message': message,
    });

    final streamedResponse = await _httpClient.send(request);

    if (streamedResponse.statusCode != 200) {
      final body = await streamedResponse.stream.bytesToString();
      throw ApiException('Failed to send message: $body');
    }

    // Parse SSE stream
    String buffer = '';
    String? data;

    await for (final chunk in streamedResponse.stream.transform(utf8.decoder)) {
      buffer += chunk;
      final lines = buffer.split('\n');
      buffer = lines.last;

      for (int i = 0; i < lines.length - 1; i++) {
        final line = lines[i];

        if (line.startsWith('data: ')) {
          data = line.substring(6).trim();
          _logger.d('SSE data: $data');
        } else if (line.isEmpty && data != null) {
          try {
            final event = AgentEvent.fromSSEData(data);
            _logger.d('Parsed agent event: ${event.runtimeType}');
            yield event;
          } catch (e) {
            _logger.e('Error parsing agent event: $e');
          }
          data = null;
        }
      }
    }

    // Handle any remaining data
    if (data != null) {
      try {
        yield AgentEvent.fromSSEData(data);
      } catch (e) {
        _logger.e('Error parsing final agent event: $e');
      }
    }
  }

  void dispose() {
    _httpClient.close();
  }
}

class ApiException implements Exception {
  final String message;
  ApiException(this.message);

  @override
  String toString() => 'ApiException: $message';
}
