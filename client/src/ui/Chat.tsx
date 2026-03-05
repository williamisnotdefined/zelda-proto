import { useEffect, useRef, useState } from 'react';
import { useTouchInputStore } from '../game/input/touchInputStore';
import { sendChat } from '../network/socket';
import { useGameStore } from './store';

const MAX_VISIBLE = 8;
const FADE_TIMEOUT_MS = 8000;

export function Chat() {
  const chatMessages = useGameStore((s) => s.chatMessages);
  const showNicknameModal = useGameStore((s) => s.showNicknameModal);
  const touchEnabled = useTouchInputStore((s) => s.enabled);
  const [input, setInput] = useState('');
  const [faded, setFaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Press Enter anywhere (while not already focused) → focus the chat input
  // Only when the nickname modal is closed, to avoid conflicting with it.
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (showNicknameModal) return;
      if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onGlobalKeyDown, { capture: true });
  }, [showNicknameModal]);

  // Auto-scroll to newest message
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    // Reset fade timer on new message
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setFaded(false);
    fadeTimer.current = setTimeout(() => setFaded(true), FADE_TIMEOUT_MS);
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [chatMessages]);

  const disablePhaser = () => {
    // Stopping key event propagation in handleKeyDown already prevents
    // Phaser (which listens on window) from receiving keystrokes while
    // the chat input is focused. Nothing extra needed here.
  };

  const enablePhaser = () => {
    // No-op: Phaser automatically regains key events once focus leaves the input.
  };

  const handleSubmit = () => {
    const text = input.trim();
    if (text.length === 0 || text.length > 100) return;
    sendChat(text);
    setInput('');
    // Blur the input so Phaser regains movement/attack controls.
    // The player must press Enter again to re-activate the chat.
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setInput('');
      (e.target as HTMLInputElement).blur();
    }
  };

  const visible = chatMessages.slice(-MAX_VISIBLE);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: touchEnabled ? 170 : 52,
        left: 16,
        width: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: '11px',
      }}
    >
      {/* Message list */}
      <div
        ref={listRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          maxHeight: 160,
          overflowY: 'auto',
          opacity: faded ? 0.3 : 0.9,
          transition: 'opacity 0.8s ease',
          scrollbarWidth: 'none',
        }}
      >
        {visible.map((msg) => (
          <div
            key={`${msg.id}-${msg.timestamp}`}
            style={{
              background: 'rgba(0,0,0,0.55)',
              borderRadius: 3,
              padding: '2px 6px',
              wordBreak: 'break-word',
              color: '#fff',
            }}
          >
            <span style={{ color: '#aaddff', fontWeight: 'bold' }}>{msg.nickname}: </span>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        maxLength={100}
        placeholder="Press Enter to chat…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={disablePhaser}
        onBlur={enablePhaser}
        style={{
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 3,
          color: '#fff',
          fontSize: '11px',
          fontFamily: 'monospace',
          padding: '4px 8px',
          outline: 'none',
          pointerEvents: 'auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
