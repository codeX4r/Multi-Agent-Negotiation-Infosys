"use client";
import { AnalyticsSummaryCard } from "./AnalyticsSummaryCard";
import { useEffect, useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfigStore } from "@/stores/config-store";
import { useUIStore } from "@/stores/ui-store";
import { SCENARIOS } from "@/engine/scenarios";
import type { PersonalityType } from "@/engine/types";
import { buildBackendScenarioConfig } from "@/lib/backendAdapter";
import {
  runBackendNegotiation,
  toBackendPersonality,
  type BackendNegotiationRequest,
  type BackendNegotiationResult,
  type BackendTerms,
} from "./backend-simulation-api";

const BACKEND_ROLES = {
  vendor: { opener: "vendor", responder: "buyer" },
  job: { opener: "recruiter", responder: "candidate" },
  budget: { opener: "eng", responder: "mkt" },
} as const;

const SCENARIO_DESCRIPTIONS: Record<string, string> = {
  vendor: "Negotiate price, delivery, warranty and payment terms between a supplier and a buyer.",
  job: "The candidate, recruiter, and hiring manager negotiate salary, bonus, start date, and remote days.",
  budget: "Engineering, Marketing, and Operations divide one shared ₹50 lakh budget and agree on a timeline.",
};

function buildRequest(
  draft: ReturnType<typeof useConfigStore.getState>["draft"],
): BackendNegotiationRequest {
  const { scenarioId, roleOverrides, rounds } = draft;
  if (scenarioId !== "vendor" && scenarioId !== "job" && scenarioId !== "budget") {
    throw new Error("The backend supports the vendor, job, and budget templates only. Select a built-in scenario to continue.");
  }
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error("The round limit must be a positive whole number.");
  }

  const scenario = SCENARIOS[scenarioId];
  const roleIds = BACKEND_ROLES[scenarioId];
  const getPersonality = (roleId: string) => {
    const role = scenario.roles.find((candidate) => candidate.id === roleId);
    const personality: PersonalityType =
      roleOverrides[roleId]?.personality ?? role?.personality ?? "collaborative";
    return toBackendPersonality(personality);
  };

  const request: BackendNegotiationRequest = {
    scenario: scenarioId,
    opener_personality: getPersonality(roleIds.opener),
    responder_personality: getPersonality(roleIds.responder),
    max_rounds: rounds,
  };

  {
    const engineConfig = useConfigStore.getState().buildEngineConfig(scenario);
    const backendConfig = buildBackendScenarioConfig(engineConfig);
    const openerIndex = engineConfig.agents.findIndex((agent) => agent.id === backendConfig.opener_id);
    const responder = engineConfig.agents[(openerIndex + 1) % engineConfig.agents.length];
    const opener = engineConfig.agents[openerIndex];
    if (!opener || !responder) {
      throw new Error("The Vendor setup needs an opener and a responding seat.");
    }
    request.opener_personality = toBackendPersonality(opener.personality);
    request.responder_personality = toBackendPersonality(responder.personality);
    request.config = backendConfig;
  }

  return request;
}

function formatTerms(scenario: BackendNegotiationResult["scenario"], terms: BackendTerms) {
  const number = (value: number) => value.toLocaleString("en-IN");
  const payment = terms.payment_days === undefined
    ? []
    : [[
      scenario === "job" ? "Payment days" : "Payment",
      scenario === "job"
        ? `${number(terms.payment_days)} days`
        : `${number(terms.payment_days)} days after delivery`,
    ]];

  if (scenario === "vendor") {
    return [
      ["Price", `₹${number(terms.price ?? 0)}`],
      ["Delivery", `${number(terms.delivery_days ?? 0)} days`],
      ["Warranty", `${number(terms.warranty_months ?? 0)} months`],
      ...payment,
    ];
  }
  if (scenario === "job") {
    return [
      ["Base salary", `₹${number((terms.salary ?? 0) * 100000)}`],
      ["Joining bonus", `₹${number((terms.bonus ?? 0) * 100000)} `],
      ["Joining date", `${number(terms.start ?? 0)} weeks`],
      ["Remote days", `${number(terms.remote ?? 0)} days/week`],
    ];
  }
  if (scenario === "budget") {
    return [
      ["Engineering", `₹${number(terms.eng ?? 0)}L`],
      ["Marketing", `₹${number(terms.mkt ?? 0)}L`],
      ["Operations", `₹${number(terms.ops ?? 0)}L`],
      ["Timeline", `${number(terms.timeline ?? 0)} months`],
    ];
  }
  return [];
}

export function BackendSimulationScreen() {
  const draft = useConfigStore((state) => state.draft);
  const setScreen = useUIStore((state) => state.setScreen);
  const [result, setResult] = useState<BackendNegotiationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const request = buildRequest(draft);
        const response = await runBackendNegotiation(request, controller.signal);
        if (!controller.signal.aborted) setResult(response);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The backend negotiation failed.");
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [attempt, draft.deadlockN, draft.roleOverrides, draft.rounds, draft.scenarioId, draft.seats]);

  const scenarioName = draft.scenarioId && draft.scenarioId in SCENARIOS
    ? SCENARIOS[draft.scenarioId].name
    : "Negotiation";
  const scenarioDescription = draft.scenarioId
    ? SCENARIO_DESCRIPTIONS[draft.scenarioId] ?? "Negotiate the terms of the selected scenario."
    : "Negotiate the terms of the selected scenario.";

  return (
    <section className="screen active">
      <h1 className="heading">{scenarioName}</h1>
      <p className="sub">{scenarioDescription}</p>

      {busy && (
        <Card>
          <p role="status">Running negotiation on the backend…</p>
        </Card>
      )}

      {error && (
        <Card>
          <p role="alert" style={{ color: "var(--color-red)" }}>{error}</p>
          <p className="mini">Check that FastAPI is running and that the configured API URL is correct.</p>
        </Card>
      )}

      {result && (
        <>
          <div className="grid g3 backend-summary-grid">
            <Card className="backend-summary-card">
              <span className="pill info">OUTCOME</span>
              <h3>{result.outcome === "deal" ? "Deal reached" : result.outcome === "breakdown" ? "Negotiation ended" : "Deadlock"}</h3>
              <p className="mini">{result.outcome_reason}</p>
            </Card>
            <Card className="backend-summary-card">
              <span className="pill info">ROUNDS</span>
              <h3>{result.rounds}</h3>
            </Card>
            <Card className="backend-summary-card">
              <span className="pill info">FINAL TERMS</span>
              {result.final_terms ? (
                <div className="backend-term-list">
                  {formatTerms(result.scenario, result.final_terms).map(([label, value]) => (
                    <div className="metricline" key={label}>
                      <span>{label}</span><strong>{value}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="mini">No agreement was reached.</p>}
            </Card>
          </div>

          <Card className="backend-satisfaction-card">
            <h3>Party satisfaction</h3>
            {result.parties && (
              <p className="mini" aria-label="Configured party personalities">
                {result.parties.map((party) =>
                  `${party.role} · ${party.personality.replace("_", "-")} · ${party.skill}`,
                ).join("  |  ")}
              </p>
            )}
            <div className="backend-satisfaction-list">
              {Object.entries(result.satisfaction).map(([party, satisfaction]) => (
                <div className="metricline" key={party}>
                  <span>{party}</span><strong>{(satisfaction * 100).toFixed(0)}%</strong>
                </div>
              ))}
            </div>
          </Card>
          <AnalyticsSummaryCard analytics={result.analytics} />

          <Card className="backend-run">
            <h3>Negotiation transcript</h3>
            <div className="backend-transcript">
              {result.transcript.map((entry, index) => (
                <article
                  className={`backend-turn ${index === 0 || entry.speaker === result.transcript[0]?.speaker ? "opener" : "responder"}`}
                  key={`${entry.round}-${index}`}
                >
                  <div className="metricline">
                    <strong>{entry.speaker}</strong>
                    <span>Round {entry.round} · {entry.decision} · utility {entry.utility.toFixed(2)}</span>
                  </div>
                  <p>{entry.message}</p>
                  {entry.offer && (
                    <p className="mini">
                      Offer: {formatTerms(result.scenario, entry.offer).map(([label, value]) => `${label}: ${value}`).join(" · ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </Card>
        </>
      )}

      <div className="actions">
        <Button variant="ghost" onClick={() => setScreen("briefing")}>
          <ArrowLeft size={15} /> Back to setup
        </Button>
        <Button variant="primary" loading={busy} onClick={() => setAttempt((value) => value + 1)}>
          <Play size={15} /> Run again
        </Button>
      </div>
    </section>
  );
}
