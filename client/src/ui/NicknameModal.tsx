import { useState } from 'react';
import { connect, sendJoin } from '../network/socket';
import { useGameStore } from './store';

export function NicknameModal() {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const showModal = useGameStore((s) => s.showNicknameModal);
  const setNickname = useGameStore((s) => s.setNickname);
  const hideNicknameModal = useGameStore((s) => s.hideNicknameModal);

  if (!showModal) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setError('Nickname must be at least 2 characters');
      return;
    }
    if (trimmed.length > 16) {
      setError('Nickname must be 16 characters or less');
      return;
    }
    if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) {
      setError('Only letters, numbers, and spaces allowed');
      return;
    }

    setNickname(trimmed);
    hideNicknameModal();
    connect();
    // Small delay to ensure connection is established
    setTimeout(() => {
      sendJoin(trimmed);
    }, 100);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 100,
        pointerEvents: 'auto',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#1a1a2e',
          borderRadius: 12,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          border: '2px solid #4a4a6a',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h2
          style={{
            margin: 0,
            color: '#fff',
            fontSize: 24,
            fontFamily: 'monospace',
          }}
        >
          Legends of Gelehk
        </h2>
        <p
          style={{
            margin: 0,
            color: '#aaa',
            fontSize: 14,
            fontFamily: 'monospace',
          }}
        >
          Enter your nickname to begin
        </p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError('');
          }}
          placeholder="Nickname"
          maxLength={16}
          autoFocus
          style={{
            width: 200,
            padding: '10px 14px',
            fontSize: 16,
            fontFamily: 'monospace',
            border: '2px solid #4a4a6a',
            borderRadius: 6,
            background: '#0d0d1a',
            color: '#fff',
            outline: 'none',
          }}
        />
        {error && (
          <p
            style={{
              margin: 0,
              color: '#ff6666',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          style={{
            padding: '10px 32px',
            fontSize: 16,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: 6,
            background: '#44aa44',
            color: '#fff',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#55bb55')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#44aa44')}
        >
          Play
        </button>
      </form>
    </div>
  );
}
