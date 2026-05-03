import { useState } from 'react';
import { MAX_NICKNAME_LENGTH } from '@/shared/constants';
import { parseNickname, type NicknameValidationReason } from '@/shared/protocol';
import { gameConnection } from '../network/gameConnection';
import { useGameStore } from './store';

export function NicknameModal() {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const showModal = useGameStore((s) => s.showNicknameModal);
  const setNickname = useGameStore((s) => s.setNickname);
  const hideNicknameModal = useGameStore((s) => s.hideNicknameModal);

  const getErrorMessage = (reason: NicknameValidationReason): string => {
    switch (reason) {
      case 'too_short':
        return 'Nickname must be at least 2 characters';
      case 'too_long':
        return 'Nickname must be 16 characters or less';
      case 'invalid_characters':
        return 'Only letters, numbers, and spaces allowed';
    }
  };

  if (!showModal) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = parseNickname(inputValue);
    if (!parsed.ok) {
      setError(getErrorMessage(parsed.reason));
      return;
    }

    setNickname(parsed.value);
    hideNicknameModal();
    gameConnection.sendJoin(parsed.value);
    gameConnection.connect();
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
          maxLength={MAX_NICKNAME_LENGTH}
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
