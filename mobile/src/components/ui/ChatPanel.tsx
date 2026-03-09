import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { mobileGameController } from '../../runtime/MobileGameController';
import { useMobileGameStore } from '../../store/gameStore';

interface Props {
  compact?: boolean;
  open?: boolean;
  onToggle?: () => void;
}

export function ChatPanel({ compact = false, open: controlledOpen, onToggle }: Props) {
  const chatMessages = useMobileGameStore((state) => state.chatMessages);
  const [draft, setDraft] = useState('');
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const boxNoneProps = Platform.OS === 'web' ? undefined : { pointerEvents: 'box-none' as const };

  const visibleMessages = useMemo(() => chatMessages.slice(-8), [chatMessages]);

  const handleSend = () => {
    if (!draft.trim()) {
      return;
    }
    mobileGameController.sendChatMessage(draft);
    setDraft('');
  };

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
      return;
    }
    setInternalOpen((value) => !value);
  };

  return (
    <View style={styles.container} {...boxNoneProps}>
      <Pressable
        onPress={handleToggle}
        style={[styles.toggle, compact ? styles.toggleCompact : null]}
      >
        <Text style={styles.toggleText}>{open ? 'Close chat' : 'Open chat'}</Text>
      </Pressable>

      {open ? (
        <View style={[styles.panel, compact ? styles.panelCompact : null]}>
          <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
            {visibleMessages.map((message) => (
              <View key={`${message.id}-${message.timestamp}`} style={styles.messageBubble}>
                <Text style={styles.messageName}>{message.nickname}: </Text>
                <Text style={styles.messageText}>{message.text}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Press Enter to chat..."
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
    gap: 6,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  toggleCompact: {
    minWidth: 74,
  },
  toggleText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  panel: {
    width: 300,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: 8,
    gap: 8,
  },
  panelCompact: {
    maxHeight: 220,
  },
  messages: {
    maxHeight: 160,
  },
  messagesContent: {
    gap: 4,
  },
  messageBubble: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  messageName: {
    color: '#aaddff',
    fontSize: 11,
    fontWeight: '700',
  },
  messageText: {
    color: '#fff',
    fontSize: 11,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 11,
  },
  sendButton: {
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: '#444',
    borderWidth: 1,
    borderColor: '#666',
    paddingHorizontal: 12,
  },
  sendText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
