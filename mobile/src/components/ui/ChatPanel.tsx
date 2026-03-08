import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { mobileGameController } from '../../runtime/MobileGameController';
import { useMobileGameStore } from '../../store/gameStore';

export function ChatPanel() {
  const chatMessages = useMobileGameStore((state) => state.chatMessages);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  const visibleMessages = useMemo(() => chatMessages.slice(-8), [chatMessages]);

  const handleSend = () => {
    if (!draft.trim()) {
      return;
    }
    mobileGameController.sendChatMessage(draft);
    setDraft('');
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.toggle}>
        <Text style={styles.toggleText}>{open ? 'Close chat' : 'Open chat'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
            {visibleMessages.map((message) => (
              <View key={`${message.id}-${message.timestamp}`} style={styles.messageBubble}>
                <Text style={styles.messageName}>{message.nickname}</Text>
                <Text style={styles.messageText}>{message.text}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Say something"
              placeholderTextColor="#799183"
              maxLength={100}
              style={styles.input}
            />
            <Pressable onPress={handleSend} style={styles.sendButton}>
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#13241c',
    borderWidth: 1,
    borderColor: '#2b4637',
  },
  toggleText: {
    color: '#dbe7d7',
    fontSize: 12,
    fontWeight: '700',
  },
  panel: {
    borderRadius: 16,
    backgroundColor: '#10221a',
    borderWidth: 1,
    borderColor: '#294434',
    padding: 12,
    gap: 10,
  },
  messages: {
    maxHeight: 140,
  },
  messagesContent: {
    gap: 8,
  },
  messageBubble: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#0b1712',
  },
  messageName: {
    color: '#9fd0ff',
    fontSize: 11,
    fontWeight: '700',
  },
  messageText: {
    color: '#e6efea',
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#0b1712',
    borderWidth: 1,
    borderColor: '#2e4a38',
    color: '#f4f8f2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#d8b44d',
    paddingHorizontal: 14,
  },
  sendText: {
    color: '#2d2406',
    fontSize: 13,
    fontWeight: '800',
  },
});
