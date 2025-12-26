export enum CardType {
  WORD = 'WORD',
  PHRASE = 'PHRASE'
}

export interface FlashcardData {
  id: string;
  front: string; // The English word or phrase
  back: string;  // The Chinese meaning
  pos?: string;  // Part of speech (optional, mostly for words)
  type: CardType;
  
  // Ebbinghaus / Spaced Repetition State
  level: number;       // Current bucket (0-5)
  nextReview: number;  // Timestamp (ms)
  lastReviewed?: number; // Timestamp (ms)
}

export interface LearningStats {
  total: number;
  due: number;
  mastered: number; // Level > 3
  learning: number; // Level <= 3
}

export interface Unit {
  id: string;
  name: string;
  count: number;
  createdAt: number;
}