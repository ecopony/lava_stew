// ABOUTME: Events for chat BLoC.
// ABOUTME: User actions like sending messages.

abstract class ChatEvent {}

class SendMessage extends ChatEvent {
  final String message;
  SendMessage(this.message);
}
