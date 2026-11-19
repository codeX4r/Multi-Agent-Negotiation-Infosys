import { apiRequest } from "@/lib/api-client";
import type { PublicSessionState, SessionConfiguration } from "@/types/negotiation";

export function createSession(configuration: SessionConfiguration) {
  return apiRequest<PublicSessionState>("/sessions", { method: "POST", body: configuration });
}

export function getSession(sessionId: string) {
  return apiRequest<PublicSessionState>(`/sessions/${encodeURIComponent(sessionId)}`);
}

export function submitParticipantMessage(sessionId: string, content: string) {
  return apiRequest<PublicSessionState>(`/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST",
    body: { content }
  });
}

export function requestNextAgentTurn(sessionId: string) {
  return apiRequest<PublicSessionState>(`/sessions/${encodeURIComponent(sessionId)}/turns/next`, {
    method: "POST",
    body: {}
  });
}

export function getSessionReport(sessionId: string) {
  return apiRequest<Record<string, unknown>>(`/sessions/${encodeURIComponent(sessionId)}/report`);
}
