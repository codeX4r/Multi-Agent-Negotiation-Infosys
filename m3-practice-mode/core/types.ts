import type { PersonalityType, ToneLabel } from './engine';

/** What the human just did, as seen by one AI agent. */
export type MoveType =
  | 'opening' | 'concession' | 'big_concession' | 'hardline' | 'retreat' | 'lowball'
  | 'accept' | 'walk' | 'threat' | 'question' | 'message';

export interface HumanMove {
  type: MoveType;
  /** change in the AI's value of the human's offer (positive = the human conceded) */
  size: number;
  /** term the human moved most on, if any */
  issueId?: string;
  text: string;
  tone: ToneLabel;
  toneConfidence: number;
}

export interface Check {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  /** hard rules must hold every time; soft rules are judged by pass rate */
  hard: boolean;
}

export interface TurnReport {
  turn: number;
  round: number;
  actorId: string;
  actorName: string;
  human: boolean;
  checks: Check[];
  notes: string[];
}

export type Reactions = Partial<Record<MoveType, Partial<Record<PersonalityType, string[]>>>>;

/** Everything that is specific to one scenario. */
export interface ScenarioPack {
  id: 'vendor' | 'job' | 'budget';
  title: string;
  /** seats a person can take in practice mode (used by the validator) */
  seats: string[];
  /** extra words people use for each term, on top of the engine's aliases */
  aliases: Record<string, string[]>;
  /** how a person would type a value for this term, e.g. "10.5 lakh" */
  textFor(issueId: string, value: number): string;
  /** how the AI acknowledges the human's move, by personality */
  reactions: Reactions;
  /** how strongly each personality returns concessions (1 = matches the human) */
  reciprocity: Record<PersonalityType, number>;
}
