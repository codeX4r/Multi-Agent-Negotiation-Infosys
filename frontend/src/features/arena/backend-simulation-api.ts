import { apiRequest } from "@/lib/api-client";
import type { BackendScenarioConfig } from "@/lib/backendAdapter";
import type { PersonalityType } from "@/engine/types";

export type BackendScenario = "vendor" | "job" | "budget";
export type BackendPersonality = "aggressive" | "collaborative" | "risk_averse";

export interface BackendNegotiationRequest {
  scenario: BackendScenario;
  opener_personality: BackendPersonality;
  responder_personality: BackendPersonality;
  max_rounds: number;
  config?: BackendScenarioConfig;
}

export interface BackendTerms {
  price?: number;
  delivery_days?: number;
  warranty_months?: number;
  payment_days?: number;
  eng?: number;
  mkt?: number;
  ops?: number;
  timeline?: number;
  salary?: number;
  bonus?: number;
  start?: number;
  remote?: number;
}

export type VendorTerms = BackendTerms;
export type JobTerms = BackendTerms;
export type BudgetTerms = BackendTerms;

export interface BackendTranscriptEntry<Terms = BackendTerms> {
  round: number;
  speaker: string;
  speaker_id?: string;
  decision: string;
  utility: number;
  message: string;
  offer: Terms | null;
  reasoning?: string;
}

interface BackendResultBase<Scenario extends BackendScenario, Terms> {
  scenario: Scenario;
  outcome: "deal" | "breakdown" | "deadlock";
  outcome_reason: string;
  rounds: number;
  final_terms: Terms | null;
  satisfaction: Record<string, number>;
  personalities?: Record<string, string>;
  parties?: Array<{
    id: string;
    role: string;
    personality: BackendPersonality;
    skill: "novice" | "skilled" | "expert";
  }>;
  transcript: BackendTranscriptEntry<Terms>[];
}

export type BackendNegotiationResult =
  | BackendResultBase<"vendor", VendorTerms>
  | BackendResultBase<"job", JobTerms>
  | BackendResultBase<"budget", BudgetTerms>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasBackendTerms(value: unknown, scenario: BackendScenario): value is BackendTerms {
  if (!isRecord(value)) return false;

  if (scenario === "budget") {
    const fieldsValid = ["eng", "mkt", "ops", "timeline"].every((field) =>
      typeof value[field] === "number" && Number.isFinite(value[field]),
    );
    const eng = value.eng;
    const mkt = value.mkt;
    const ops = value.ops;
    return fieldsValid &&
      typeof eng === "number" &&
      typeof mkt === "number" &&
      typeof ops === "number" &&
      eng + mkt + ops === 50;
  }

  if (scenario === "job") {
    return ["salary", "bonus", "start", "remote"].every((field) =>
      typeof value[field] === "number" && Number.isFinite(value[field]),
    );
  }

  return ["price", "delivery_days", "warranty_months"].every((field) =>
    typeof value[field] === "number" && Number.isFinite(value[field]),
  ) && (
    value.payment_days === undefined ||
    (typeof value.payment_days === "number" &&
      Number.isInteger(value.payment_days) &&
      value.payment_days >= 0)
  );
}

function isBackendNegotiationResult(
  value: unknown,
  expectedScenario: BackendScenario,
): value is BackendNegotiationResult {
  if (
    !isRecord(value) ||
    value.scenario !== expectedScenario ||
    !["deal", "breakdown", "deadlock"].includes(String(value.outcome)) ||
    typeof value.outcome_reason !== "string" ||
    typeof value.rounds !== "number" ||
    !isRecord(value.satisfaction) ||
    (value.personalities !== undefined &&
      (!isRecord(value.personalities) ||
        Object.values(value.personalities).some((personality) => typeof personality !== "string"))) ||
    (value.parties !== undefined &&
      (!Array.isArray(value.parties) || value.parties.some((party) =>
        !isRecord(party) ||
        typeof party.id !== "string" ||
        typeof party.role !== "string" ||
        !["aggressive", "collaborative", "risk_averse"].includes(String(party.personality)) ||
        !["novice", "skilled", "expert"].includes(String(party.skill)),
      ))) ||
    !Array.isArray(value.transcript)
  ) {
    return false;
  }

  if (
    Object.values(value.satisfaction).some((score) => typeof score !== "number") ||
    (value.final_terms !== null && !hasBackendTerms(value.final_terms, expectedScenario))
  ) {
    return false;
  }

  return value.transcript.every((entry) =>
    isRecord(entry) &&
    typeof entry.round === "number" &&
    typeof entry.speaker === "string" &&
    (entry.speaker_id === undefined || typeof entry.speaker_id === "string") &&
    typeof entry.decision === "string" &&
    typeof entry.utility === "number" &&
    typeof entry.message === "string" &&
    (entry.reasoning === undefined || typeof entry.reasoning === "string") &&
    (entry.offer === null || hasBackendTerms(entry.offer, expectedScenario)),
  );
}

function mapPartyName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized === "supplier" || normalized === "vendor") return "Vendor";
  if (normalized === "buyer") return "Buyer";
  return name;
}

function mapPartyRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).map(([party, value]) => [mapPartyName(party), value]),
  );
}

function normalizeBackendResult<Scenario extends BackendScenario, Terms>(
  result: BackendResultBase<Scenario, Terms>,
): BackendResultBase<Scenario, Terms> {
  return {
    ...result,
    satisfaction: mapPartyRecord(result.satisfaction),
    personalities: mapPartyRecord(result.personalities ?? {}),
    parties: result.parties?.map((party) => ({
      ...party,
      role: mapPartyName(party.role),
    })),
    transcript: result.transcript.map((entry) => ({
      ...entry,
      speaker: mapPartyName(entry.speaker),
      reasoning: entry.reasoning ?? "",
    })),
  };
}

export function toBackendPersonality(personality: PersonalityType): BackendPersonality {
  return personality === "risk-averse" ? "risk_averse" : personality;
}

export function runBackendNegotiation(
  request: BackendNegotiationRequest,
  signal?: AbortSignal,
) : Promise<BackendNegotiationResult> {
  return apiRequest<unknown>("/negotiate/run", {
    method: "POST",
    body: request,
    signal,
  }).then((result) => {
    if (!isBackendNegotiationResult(result, request.scenario)) {
      throw new Error(
        `FastAPI returned an outdated or invalid ${request.scenario} response. Stop and restart the backend so it loads the latest code, then click “Run again.”`,
      );
    }
    switch (result.scenario) {
      case "vendor":
        return normalizeBackendResult(result);
      case "job":
        return normalizeBackendResult(result);
      case "budget":
        return normalizeBackendResult(result);
    }
  });
}
