import unittest
from unittest.mock import patch

from app.messages import write_message
from app.models import Decision
from app.orchestrator import run_negotiation
from app.scenarios import build_frontend_config, build_scenario


class MessageTests(unittest.TestCase):
    def test_counter_lines_vary_and_name_the_issue(self):
        for personality in ("aggressive", "collaborative", "risk_averse"):
            with self.subTest(personality=personality):
                supplier, _ = build_scenario("vendor", personality, "collaborative")
                messages = [
                    write_message(supplier, "counter", supplier.target, index)
                    for index in range(4)
                ]

                self.assertEqual(len(set(messages)), 4)
                self.assertIn("price", messages[0])
                self.assertIn("delivery timing", messages[1])
                self.assertIn("warranty", messages[2])
                self.assertIn("payment timing", messages[3])

    def test_reject_lines_are_personality_specific_and_issue_aware(self):
        expected = {
            "aggressive": "walking away",
            "collaborative": "workable agreement",
            "risk_averse": "level of risk",
        }
        for personality, phrase in expected.items():
            with self.subTest(personality=personality):
                supplier, _ = build_scenario("vendor", personality, "collaborative")
                message = write_message(supplier, "reject", supplier.target)
                self.assertIn(phrase, message)
                self.assertIn("price", message)

    def test_rejection_can_name_the_actual_walkaway_issue(self):
        supplier, _ = build_scenario("vendor", "risk_averse", "collaborative")

        message = write_message(
            supplier,
            "reject",
            supplier.target,
            counter_index=0,
            issue_index=3,
        )

        self.assertIn("payment timing", message)

    def test_accept_message_waits_until_the_whole_negotiation_is_agreed(self):
        for personality in ("aggressive", "collaborative", "risk_averse"):
            with self.subTest(personality=personality):
                agent, _ = build_scenario("vendor", personality, "collaborative")

                message = write_message(agent, "accept", agent.target)

                self.assertEqual(message, "I can accept this, if the others agree.")
                self.assertNotIn("Deal", message)

    def test_only_the_final_acceptance_uses_the_agreement_message(self):
        config = build_frontend_config(
            "job",
            "collaborative",
            "collaborative",
            3,
            party_personalities={
                "candidate": "collaborative",
                "recruiter": "collaborative",
                "manager": "collaborative",
            },
        )
        accepted = Decision(decision="accept", utility=1, reasoning="The offer works.")

        with patch("app.orchestrator.evaluate_offer", return_value=accepted):
            result = run_negotiation("job", "collaborative", "collaborative", 3, config)

        acceptance_messages = [
            entry["message"] for entry in result["transcript"]
            if entry["decision"] == "accept"
        ]
        self.assertEqual(len(acceptance_messages), 2)
        self.assertEqual(acceptance_messages[0], "I can accept this, if the others agree.")
        self.assertIn("Deal", acceptance_messages[-1])

    def test_api_result_includes_reason_and_consecutive_counters_vary(self):
        result = run_negotiation("vendor", "collaborative", "collaborative", 12)
        self.assertIn(result["outcome"], ("deal", "breakdown", "deadlock"))
        self.assertTrue(result["outcome_reason"])

        counter_messages = [
            entry["message"] for entry in result["transcript"]
            if entry["decision"] == "counter"
        ]
        for previous, current in zip(counter_messages, counter_messages[1:]):
            self.assertNotEqual(previous, current)


if __name__ == "__main__":
    unittest.main()
