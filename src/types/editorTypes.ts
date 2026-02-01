export type Gender = 'MALE' | 'FEMALE' | 'NEUTRAL';
export type AgeGroup = 'CHILD' | 'TEEN' | 'ADULT' | 'ELDER';

export interface VoiceProfile {
  // Strict parameters for future TTS Engine
  gender: Gender;
  age: AgeGroup;

  // Flexible parameters for AI Reasoning
  tone: string; // e.g., "Raspy", "Breathless", "Sarcastic"
  emotion: string; // e.g., "Anger", "Fear", "Joy"

  // Optional technical parameters
  suggestedPitch?: number; // 0.5 to 2.0
  suggestedSpeed?: number; // 0.5 to 2.0
}

export type SegmentType = 'NARRATION' | 'DIALOGUE' | 'INTERNAL_MONOLOGUE';

export interface AudioSegment {
  text: string; // The content to speak
  type: SegmentType;
  speakerId: string | null; // Link to Character Forge ID
  speakerName: string; // Fallback name
  voiceProfile: VoiceProfile;

  // 🟢 NEW: Location Metadata for highlighting
  from?: number;
  to?: number;
}

export interface NarratorControls {
  isPlaying: boolean;
  currentSegmentIndex: number; // To highlight the text being read
  play: () => void;
  pause: () => void;
  stop: () => void;
  skipForward: () => void;
  skipBackward: () => void;
}
