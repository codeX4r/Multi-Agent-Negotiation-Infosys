export type NegotiationMode = "simulation" | "practice";
export type ScenarioId = "vendor_pricing" | "job_offer" | "project_budget";
export type SessionStatus = "draft" | "active" | "paused" | "completed";
export type Personality = "aggressive" | "collaborative" | "risk_averse";
export type SkillLevel = "novice" | "skilled" | "expert";

export interface ScenarioSummary {
  id: ScenarioId;
  name: string;
  description: string;
  issues: string[];
  stakeholderCount: number;
}

export interface AgentConfiguration {
  roleId: string;
  displayName: string;
  personality: Personality;
  skillLevel: SkillLevel;
}

export interface SessionConfiguration {
  scenarioId: ScenarioId;
  mode: NegotiationMode;
  climate: "stable" | "volatile" | "crisis";
  orchestratorRole: "timekeeper" | "mediator" | "rule_enforcer" | "auditor" | "event_injector";
  orchestratorAutonomy: 0 | 1 | 2 | 3;
  agents: AgentConfiguration[];
}

export interface PublicTranscriptMessage {
  id: string;
  speaker: string;
  content: string;
  createdAt: string;
  messageType: "message" | "offer" | "system";
}

export interface PublicSessionState {
  sessionId: string;
  status: SessionStatus;
  round: number;
  transcript: PublicTranscriptMessage[];
  activeSpeaker?: string;
  currentOffer?: Record<string, string | number>;
}
