import unittest
from pydantic import ValidationError

from app.orchestrator import run_negotiation
from app.messages import format_terms
from app.models import Terms
from app.scenarios import build_frontend_config, build_scenario


SCENARIO_RANGES = {
    "vendor": {
        "price": (900_000, 1_300_000, 10_000),
        "delivery": (10, 45, 1),
        "warranty": (6, 36, 6),
        "payment": (0, 60, 15),
    },
    "job": {
        "salary": (12, 24, 0.5),
        "bonus": (0, 3, 0.25),
        "start": (2, 12, 1),
        "remote": (0, 5, 1),
    },
    "budget": {
        "eng": (8, 34, 1),
        "mkt": (6, 30, 1),
        "ops": (5, 28, 1),
        "timeline": (3, 9, 1),
    },
}


class FrontendScenarioContractTests(unittest.TestCase):
    def assert_valid_terms(self, scenario, values):
        if scenario == "vendor":
            ranges = {
                "price": (900_000, 1_300_000, 10_000),
                "delivery_days": (10, 45, 1),
                "warranty_months": (6, 36, 6),
                "payment_days": (0, 60, 15),
            }
        elif scenario == "job":
            ranges = {
                "salary": (12, 24, 0.5),
                "bonus": (0, 3, 0.25),
                "start": (2, 12, 1),
                "remote": (0, 5, 1),
            }
        else:
            ranges = {
                "eng": (8, 34, 1),
                "mkt": (6, 30, 1),
                "ops": (5, 28, 1),
                "timeline": (3, 9, 1),
            }
        self.assertEqual(set(values), set(ranges))
        for field, (minimum, maximum, step) in ranges.items():
            self.assertGreaterEqual(values[field], minimum, field)
            self.assertLessEqual(values[field], maximum, field)
            step_count = (values[field] - minimum) / step
            self.assertAlmostEqual(step_count, round(step_count), msg=field)
        if scenario == "budget":
            self.assertEqual(values["eng"] + values["mkt"] + values["ops"], 50)

    def test_role_targets_and_batnas_use_frontend_fields_and_ranges(self):
        for scenario, ranges in SCENARIO_RANGES.items():
            with self.subTest(scenario=scenario):
                opener, responder = build_scenario(scenario, "collaborative", "collaborative")
                for agent in (opener, responder):
                    self.assert_valid_terms(scenario, agent.target.model_dump(exclude_none=True))
                    self.assert_valid_terms(scenario, agent.batna.model_dump(exclude_none=True))
                    self.assertAlmostEqual(
                        sum(agent.weights.values()),
                        1,
                    )

    def test_vendor_message_formats_inr_using_frontend_grouping(self):
        vendor, _ = build_scenario("vendor", "collaborative", "collaborative")
        self.assertIn("₹12,00,000", format_terms(vendor.target))

    def test_transcript_offers_use_frontend_fields_and_ranges(self):
        for scenario in SCENARIO_RANGES:
            with self.subTest(scenario=scenario):
                result = run_negotiation(scenario, "collaborative", "collaborative", 8)
                for entry in result["transcript"]:
                    if entry["offer"] is not None:
                        self.assert_valid_terms(scenario, entry["offer"])
                if result["final_terms"] is not None:
                    self.assert_valid_terms(scenario, result["final_terms"])

    def test_job_template_has_all_frontend_parties_and_issue_bounds(self):
        config = build_frontend_config("job", "collaborative", "aggressive", 12)

        self.assertEqual(config.opener_id, "recruiter")
        self.assertEqual(
            [(party.id, party.role) for party in config.parties],
            [
                ("candidate", "Candidate"),
                ("recruiter", "Recruiter"),
                ("manager", "Hiring Mgr"),
            ],
        )
        self.assertEqual(
            [(issue.id, issue.min, issue.max, issue.step) for issue in config.issues],
            [
                ("salary", 12, 24, 0.5),
                ("bonus", 0, 3, 0.25),
                ("start", 2, 12, 1),
                ("remote", 0, 5, 1),
            ],
        )
        result = run_negotiation("job", "collaborative", "aggressive", 12)
        self.assertEqual({party["id"] for party in result["parties"]},
                         {"candidate", "recruiter", "manager"})

    def test_budget_template_derives_operations_and_rejects_invalid_totals(self):
        config = build_frontend_config("budget", "aggressive", "collaborative", 12)
        self.assertEqual(config.opener_id, "eng")
        self.assertEqual(config.constraint.model_dump(), {
            "type": "sum", "total": 50, "derived": "ops", "of": ["eng", "mkt"],
        })
        self.assertEqual(
            [(party.id, party.role) for party in config.parties],
            [("eng", "Eng Head"), ("mkt", "Mkt Head"), ("ops", "Ops Head")],
        )

        with self.assertRaises(ValidationError):
            Terms(eng=20, mkt=15, ops=14, timeline=6)

        result = run_negotiation("budget", "aggressive", "collaborative", 12)
        self.assertEqual({party["id"] for party in result["parties"]}, {"eng", "mkt", "ops"})
        for entry in result["transcript"]:
            if entry["offer"] is not None:
                self.assertEqual(
                    entry["offer"]["eng"] + entry["offer"]["mkt"] + entry["offer"]["ops"],
                    50,
                )


if __name__ == "__main__":
    unittest.main()
