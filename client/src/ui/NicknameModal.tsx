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
    <div className="pointer-events-auto absolute inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.85)]">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col items-center gap-4 rounded-xl border-2 border-[#4a4a6a] bg-[#1a1a2e] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      >
        <h2 className="m-0 font-mono text-2xl text-white">
          Legends of Gelehk
        </h2>
        <p className="m-0 font-mono text-sm text-[#aaa]">
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
          className="w-[200px] rounded-md border-2 border-[#4a4a6a] bg-[#0d0d1a] px-3.5 py-2.5 font-mono text-base text-white outline-none placeholder:text-[rgba(255,255,255,0.35)] focus:border-[#6a6a9a]"
        />
        {error && (
          <p className="m-0 font-mono text-xs text-[#ff6666]">{error}</p>
        )}
        <button
          type="submit"
          className="cursor-pointer rounded-md bg-[#44aa44] px-8 py-2.5 font-mono text-base font-bold text-white transition-colors hover:bg-[#55bb55]"
        >
          Play
        </button>
      </form>
    </div>
  );
}
