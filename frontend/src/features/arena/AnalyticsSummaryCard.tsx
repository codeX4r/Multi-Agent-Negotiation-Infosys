"use client";

import { Card } from "@/components/ui/Card";
import type { BackendAnalytics } from "./backend-simulation-api";

interface AnalyticsSummaryCardProps {
  analytics?: BackendAnalytics | null;
}

export function AnalyticsSummaryCard({ analytics }: AnalyticsSummaryCardProps) {
  if (!analytics) return null;

  const { zopa, pareto } = analytics;
  const issueEntries = Object.values(zopa.issues);

  return (
    <Card className="backend-satisfaction-card">
      <div className="metricline">
        <h3>Deal analytics (ZOPA &amp; Pareto)</h3>
        <span className={`pill ${zopa.deal_possible ? "info" : "warn"}`}>
          {zopa.deal_possible ? "ZOPA FOUND" : "NO ZOPA"}
        </span>
      </div>

      <p className="mini">
        Average issue overlap: {(zopa.average_overlap_ratio * 100).toFixed(0)}%
      </p>

      <div className="backend-satisfaction-list">
        {issueEntries.map((item) => (
          <div className="metricline" key={item.issue_id}>
            <span>{item.issue_id}</span>
            <strong>
              {item.has_zopa
                ? `${item.low} – ${item.high} (${(item.overlap_ratio * 100).toFixed(0)}% overlap)`
                : "No overlap"}
            </strong>
          </div>
        ))}
      </div>

      {pareto && (
        <div className="backend-satisfaction-list" style={{ marginTop: "0.75rem" }}>
          <div className="metricline">
            <span>Pareto efficiency</span>
            <strong>
              {(pareto.efficiency_score * 100).toFixed(0)}%{" "}
              {pareto.is_pareto_optimal ? "(Optimal)" : "(Suboptimal)"}
            </strong>
          </div>
          <div className="metricline">
            <span>Joint utility</span>
            <strong>
              {pareto.agreement_joint_utility.toFixed(2)} /{" "}
              {pareto.best_feasible_joint_utility.toFixed(2)}
            </strong>
          </div>
          {pareto.value_left_on_table > 0 && (
            <div className="metricline">
              <span>Value left on table</span>
              <strong>{pareto.value_left_on_table.toFixed(2)}</strong>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}