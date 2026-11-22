import { describe, expect, it } from "vitest";
import { useConfigStore } from "@/stores/config-store";

describe("scenario configuration", () => {
  it("replaces seats when switching to a scenario with different roles", () => {
    const config = useConfigStore.getState();
    config.setMode("simulation");
    config.setScenario("vendor");
    expect(useConfigStore.getState().draft.seats).toContain("buyer");

    useConfigStore.getState().setScenario("budget");
    const draft = useConfigStore.getState().draft;
    expect(draft.scenarioId).toBe("budget");
    expect(draft.seats).toEqual(["eng", "mkt", "ops"]);
  });
});
