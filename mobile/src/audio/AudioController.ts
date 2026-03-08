import { Audio, type AVPlaybackStatus } from 'expo-av';
import bgMusicAsset from '../../../client/public/assets/sounds/bg_music.mp3';
import toastyAsset from '../../../client/public/assets/sounds/toasty.mp3';

class AudioController {
  private backgroundMusic: Audio.Sound | null = null;
  private muted = false;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }

  async startBackgroundMusic(): Promise<void> {
    await this.initialize();

    if (!this.backgroundMusic) {
      const { sound } = await Audio.Sound.createAsync(bgMusicAsset, {
        isLooping: true,
        volume: this.muted ? 0 : 0.02,
        shouldPlay: true,
      });
      this.backgroundMusic = sound;
      return;
    }

    await this.backgroundMusic.setVolumeAsync(this.muted ? 0 : 0.02);
    await this.backgroundMusic.playAsync();
  }

  async stopBackgroundMusic(): Promise<void> {
    if (!this.backgroundMusic) {
      return;
    }
    await this.backgroundMusic.stopAsync();
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
    if (this.backgroundMusic) {
      await this.backgroundMusic.setVolumeAsync(muted ? 0 : 0.02);
    }
  }

  getMuted(): boolean {
    return this.muted;
  }

  async playToasty(): Promise<void> {
    await this.initialize();
    if (this.muted) {
      return;
    }
    const { sound } = await Audio.Sound.createAsync(toastyAsset, { shouldPlay: true, volume: 0.6 });
    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => undefined);
      }
    });
  }
}

export const audioController = new AudioController();
