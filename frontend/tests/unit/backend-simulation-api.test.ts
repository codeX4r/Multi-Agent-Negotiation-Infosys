import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runBackendNegotiation,
  toBackendPersonality,
} from "@/features/arena/backend-simulation-api";

describe("backend simulation API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the negotiation request to the implemented FastAPI route", async () => {
    const result = {
      scenario: "vendor",
      outcome: "deal",
      outcome_reason: "Buyer accepted the offer at round 1.",
      rounds: 2,
      personalities: { Supplier: "aggressive", Buyer: "collaborative" },
      final_terms: { price: 1000000, delivery_days: 30, warranty_months: 24, payment_days: 45 },
      satisfaction: { Supplier: 0.8, Buyer: 0.7 },
      transcript: [
        {
          round: 0,
          speaker: "Supplier",
          decision: "open",
          utility: 1,
          message: "Opening offer.",
          offer: { price: 1000000, delivery_days: 30, warranty_months: 24, payment_days: 45 },
          reasoning: "Opening with target terms.",
        },
        {
          round: 1,
          speaker: "Buyer",
          decision: "accept",
          utility: 0.7,
          message: "Accepted.",
          offer: null,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await runBackendNegotiation({
      scenario: "vendor",
      opener_personality: "risk_averse",
      responder_personality: "collaborative",
      max_rounds: 8,
    });

    expect(response.transcript.map(({ speaker, reasoning }) => ({ speaker, reasoning }))).toEqual([
      { speaker: "Vendor", reasoning: "Opening with target terms." },
      { speaker: "Buyer", reasoning: "" },
    ]);
    expect(response.satisfaction).toEqual({ Vendor: 0.8, Buyer: 0.7 });
    expect(response.outcome_reason).toBe("Buyer accepted the offer at round 1.");
    expect(response.personalities).toEqual({
      Vendor: "aggressive",
      Buyer: "collaborative",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/negotiate/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          scenario: "vendor",
          opener_personality: "risk_averse",
          responder_personality: "collaborative",
          max_rounds: 8,
        }),
      }),
    );
  });

  it("defaults omitted personalities and reasoning", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        scenario: "vendor",
        outcome: "breakdown",
        outcome_reason: "Supplier rejected at round 1: payment timing exceeded its limit.",
        rounds: 1,
        final_terms: null,
        satisfaction: {},
        transcript: [{
          round: 0,
          speaker: "Supplier",
          decision: "reject",
          utility: 0.1,
          message: "Rejected.",
          offer: null,
        }],
      }), { status: 200 }),
    ));

    const response = await runBackendNegotiation({
      scenario: "vendor",
      opener_personality: "aggressive",
      responder_personality: "collaborative",
      max_rounds: 8,
    });

    expect(response.personalities).toEqual({});
    expect(response.transcript[0]).toMatchObject({
      speaker: "Vendor",
      reasoning: "",
    });
  });

  it("accepts older Vendor responses without payment_days", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        scenario: "vendor",
        outcome: "deal",
        outcome_reason: "Supplier accepted.",
        rounds: 1,
        final_terms: { price: 100, delivery_days: 10, warranty_months: 12 },
        satisfaction: {},
        transcript: [{
          round: 0,
          speaker: "Supplier",
          decision: "open",
          utility: 0.8,
          message: "Offer.",
          offer: { price: 100, delivery_days: 10, warranty_months: 12 },
        }],
      }), { status: 200 }),
    ));

    const response = await runBackendNegotiation({
      scenario: "vendor",
      opener_personality: "aggressive",
      responder_personality: "collaborative",
      max_rounds: 8,
    });

    expect(response.final_terms).not.toHaveProperty("payment_days");
    expect(response.transcript[0].offer).not.toHaveProperty("payment_days");
  });

  it("rejects non-integer payment_days when present", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        scenario: "vendor",
        outcome: "deal",
        outcome_reason: "Buyer accepted.",
        rounds: 1,
        final_terms: {
          price: 100,
          delivery_days: 10,
          warranty_months: 12,
          payment_days: 4.5,
        },
        satisfaction: {},
        transcript: [],
      }), { status: 200 }),
    ));

    await expect(runBackendNegotiation({
      scenario: "vendor",
      opener_personality: "aggressive",
      responder_personality: "collaborative",
      max_rounds: 8,
    })).rejects.toThrow("FastAPI returned an outdated or invalid vendor response");
  });

  it("converts the UI risk-averse value to the backend enum", () => {
    expect(toBackendPersonality("risk-averse")).toBe("risk_averse");
  });

  it.each(["job", "budget"] as const)("accepts the current FastAPI term shape for %s", async (scenario) => {
    const terms = scenario === "job"
      ? { salary: 22, bonus: 3, start: 8, remote: 4 }
      : { eng: 28, mkt: 14, ops: 8, timeline: 9 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        scenario,
        outcome: "deal",
        outcome_reason: "Candidate accepted.",
        rounds: 2,
        final_terms: terms,
        satisfaction: { "Project Lead": 0.8, Finance: 0.7 },
        transcript: [{
          round: 0,
          speaker: scenario === "budget" ? "Project Lead" : "Candidate",
          decision: "open",
          utility: 1,
          message: "Opening offer.",
          offer: terms,
        }],
      }), { status: 200 }),
    ));

    const response = await runBackendNegotiation({
      scenario,
      opener_personality: "collaborative",
      responder_personality: "collaborative",
      max_rounds: 8,
    });

    expect(response.final_terms).toEqual(terms);
    expect(response.transcript[0].offer).toEqual(terms);
  });
});
