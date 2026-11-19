import type { ScenarioSummary } from "@/types/negotiation";

export const SCENARIOS: ScenarioSummary[] = [
  {
    id: "vendor_pricing",
    name: "Vendor Pricing Negotiation",
    description: "Negotiate commercial terms between a buyer, vendor and finance stakeholder.",
    issues: ["Unit price", "Delivery timeline", "Warranty", "Payment terms"],
    stakeholderCount: 3
  },
  {
    id: "job_offer",
    name: "Job Offer Negotiation",
    description: "Balance compensation, joining date and work flexibility across hiring stakeholders.",
    issues: ["Base salary", "Joining bonus", "Joining date", "Remote days"],
    stakeholderCount: 3
  },
  {
    id: "project_budget",
    name: "Project Budget Allocation",
    description: "Allocate a constrained budget across engineering, marketing and operations.",
    issues: ["Engineering allocation", "Marketing allocation", "Operations allocation", "Delivery timeline"],
    stakeholderCount: 3
  }
];
