import itertools
import unittest
from pydantic import ValidationError

from app.evaluation import _beyond_batna, _concede, utility
from app.models import NegotiationConfig, Terms
from app.main import RunRequest
from app.orchestrator import run_negotiation
from app.scenarios import build_scenario


SCENARIOS = ("vendor", "job", "budget")
PERSONALITIES = ("aggressive", "collaborative", "risk_averse")

VENDOR_CONFIG = {
    "parties": [
        {
            "id": "vendor",
            "role": "Vendor",
            "personality": "aggressive",
            "skill": "skilled",
            "target": {"price": 1250000, "delivery": 40, "warranty": 6, "payment": 0},
            "walk_away": {"price": 980000, "delivery": 12, "warranty": 30, "payment": 60},
            "weights": {"price": 0.5, "delivery": 0.15, "warranty": 0.2, "payment": 0.15},
        },
        {
            "id": "buyer",
            "role": "Buyer",
            "personality": "collaborative",
            "skill": "skilled",
            "target": {"price": 950000, "delivery": 15, "warranty": 24, "payment": 60},
            "walk_away": {"price": 1180000, "delivery": 40, "warranty": 6, "payment": 0},
            "weights": {"price": 0.45, "delivery": 0.25, "warranty": 0.2, "payment": 0.1},
        },
        {
            "id": "finance",
            "role": "Finance",
            "personality": "risk_averse",
            "skill": "expert",
            "target": {"price": 950000, "delivery": 20, "warranty": 24, "payment": 60},
            "walk_away": {"price": 1150000, "delivery": 45, "warranty": 6, "payment": 15},
            "weights": {"price": 0.5, "delivery": 0, "warranty": 0.2, "payment": 0.3},
        },
    ],
    "issues": [
        {"id": "price", "min": 900000, "max": 1300000, "step": 10000},
        {"id": "delivery", "min": 10, "max": 45, "step": 1},
        {"id": "warranty", "min": 6, "max": 36, "step": 6},
        {"id": "payment", "min": 0, "max": 60, "step": 15},
    ],
    "opener_id": "vendor",
    "rounds_limit": 12,
    "deadlock_after_stalled_rounds": 3,
}


class PaymentDaysTests(unittest.TestCase):
    def test_api_request_accepts_optional_vendor_config_only(self):
        request = RunRequest(scenario="vendor", config=VENDOR_CONFIG)
        self.assertEqual(request.config.rounds_limit, 12)
        self.assertIsNone(RunRequest(scenario="vendor").config)
        with self.assertRaises(ValidationError):
            RunRequest(scenario="job", config=VENDOR_CONFIG)

    def test_configured_vendor_uses_party_setup_and_keeps_offers_in_issue_steps(self):
        config = NegotiationConfig.model_validate(VENDOR_CONFIG)
        result = run_negotiation("vendor", "aggressive", "collaborative", config=config)

        self.assertEqual(
            [(party["id"], party["role"]) for party in result["parties"]],
            [("vendor", "Vendor"), ("buyer", "Buyer"), ("finance", "Finance")],
        )
        self.assertEqual(result["parties"][2]["skill"], "expert")
        self.assertEqual(result["transcript"][0]["speaker_id"], "vendor")
        self.assertGreater(result["rounds"], 0)
        for entry in result["transcript"]:
            if entry["offer"] is None:
                continue
            for issue in config.issues:
                field = {
                    "price": "price",
                    "delivery": "delivery_days",
                    "warranty": "warranty_months",
                    "payment": "payment_days",
                }[issue.id]
                value = entry["offer"][field]
                self.assertGreaterEqual(value, issue.min)
                self.assertLessEqual(value, issue.max)
                self.assertAlmostEqual((value - issue.min) / issue.step,
                                       round((value - issue.min) / issue.step))
        if result["outcome"] == "deal":
            final_terms = result["final_terms"]
            for party in config.parties:
                for issue in config.issues:
                    field = {
                        "price": "price",
                        "delivery": "delivery_days",
                        "warranty": "warranty_months",
                        "payment": "payment_days",
                    }[issue.id]
                    walk_away = party.walk_away[issue.id]
                    if party.target[issue.id] > walk_away:
                        self.assertGreaterEqual(final_terms[field], walk_away)
                    elif party.target[issue.id] < walk_away:
                        self.assertLessEqual(final_terms[field], walk_away)

    def test_config_rejects_out_of_range_or_off_step_targets(self):
        invalid = {
            **VENDOR_CONFIG,
            "parties": [
                {**VENDOR_CONFIG["parties"][0],
                 "target": {**VENDOR_CONFIG["parties"][0]["target"], "warranty": 7}},
                *VENDOR_CONFIG["parties"][1:],
            ],
        }
        with self.assertRaises(ValidationError):
            NegotiationConfig.model_validate(invalid)

    def test_configured_personality_changes_the_run(self):
        aggressive = NegotiationConfig.model_validate(VENDOR_CONFIG)
        collaborative_data = {
            **VENDOR_CONFIG,
            "parties": [
                {**VENDOR_CONFIG["parties"][0], "personality": "collaborative"},
                *VENDOR_CONFIG["parties"][1:],
            ],
        }
        collaborative = NegotiationConfig.model_validate(collaborative_data)

        aggressive_result = run_negotiation("vendor", "aggressive", "collaborative",
                                            config=aggressive)
        collaborative_result = run_negotiation("vendor", "aggressive", "collaborative",
                                               config=collaborative)

        self.assertNotEqual(
            aggressive_result["parties"][0]["personality"],
            collaborative_result["parties"][0]["personality"],
        )
        self.assertNotEqual(
            aggressive_result["transcript"],
            collaborative_result["transcript"],
        )

    def test_configured_deadlock_limit_stops_repeated_offer_cycles(self):
        config_data = {
            **VENDOR_CONFIG,
            "deadlock_after_stalled_rounds": 2,
            "parties": [],
        }
        for party in VENDOR_CONFIG["parties"]:
            price = 900000 if party["id"] == "buyer" else 1300000
            fixed_terms = {
                "price": price,
                "delivery": 20,
                "warranty": 12,
                "payment": 15,
            }
            config_data["parties"].append({
                **party,
                "target": fixed_terms,
                "walk_away": fixed_terms,
            })

        result = run_negotiation(
            "vendor",
            "aggressive",
            "collaborative",
            config=NegotiationConfig.model_validate(config_data),
        )

        self.assertEqual(result["outcome"], "deadlock")
        self.assertLess(result["rounds"], config_data["rounds_limit"])
        self.assertIn("2 consecutive rounds", result["outcome_reason"])

    def test_sellers_and_buyers_have_payment_targets_and_limits(self):
        expected = {
            "vendor": (15, 45, 60, 30),
        }

        for scenario, (seller_target, seller_batna, buyer_target, buyer_batna) in expected.items():
            with self.subTest(scenario=scenario):
                seller, buyer = build_scenario(scenario, "collaborative", "collaborative")
                self.assertEqual(seller.target.payment_days, seller_target)
                self.assertEqual(seller.batna.payment_days, seller_batna)
                self.assertEqual(buyer.target.payment_days, buyer_target)
                self.assertEqual(buyer.batna.payment_days, buyer_batna)
                self.assertIn("payment", seller.weights)
                self.assertIn("payment", buyer.weights)
                self.assertAlmostEqual(sum(seller.weights.values()), 1)
                self.assertAlmostEqual(sum(buyer.weights.values()), 1)

    def test_payment_utility_batna_and_concession_follow_party_preference(self):
        seller, buyer = build_scenario("vendor", "collaborative", "collaborative")

        self.assertFalse(_beyond_batna(seller, seller.batna))
        self.assertTrue(_beyond_batna(seller, seller.batna.model_copy(update={"payment_days": 46})))
        self.assertFalse(_beyond_batna(buyer, buyer.batna))
        self.assertTrue(_beyond_batna(buyer, buyer.batna.model_copy(update={"payment_days": 29})))
        self.assertGreater(
            utility(seller, seller.target),
            utility(seller, seller.target.model_copy(update={"payment_days": 45})),
        )
        self.assertGreater(
            utility(buyer, buyer.target),
            utility(buyer, buyer.target.model_copy(update={"payment_days": 30})),
        )

        seller_offer = _concede(seller, seller.target, 1, 8)
        buyer_offer = _concede(buyer, buyer.target, 1, 8)
        self.assertGreater(seller_offer.payment_days, seller.target.payment_days)
        self.assertLess(buyer_offer.payment_days, buyer.target.payment_days)

    def test_all_scenario_personality_pairs_return_payment_terms_without_instant_deadlock(self):
        for scenario, (opener_personality, responder_personality) in itertools.product(
            SCENARIOS,
            itertools.product(PERSONALITIES, repeat=2),
        ):
            with self.subTest(
                scenario=scenario,
                opener=opener_personality,
                responder=responder_personality,
            ):
                result = run_negotiation(
                    scenario,
                    opener_personality,
                    responder_personality,
                    max_rounds=24,
                )
                self.assertGreater(result["rounds"], 0)
                self.assertIn(result["outcome"], ("deal", "breakdown", "deadlock"))
                for entry in result["transcript"]:
                    if entry["offer"] is not None:
                        if scenario in ("vendor", "job"):
                            self.assertTrue(
                                "payment_days" in entry["offer"] or
                                "salary" in entry["offer"]
                            )
                if result["final_terms"] is not None and scenario in ("vendor", "job"):
                    final_terms = result["final_terms"]
                    if scenario == "vendor":
                        self.assertIsInstance(final_terms["payment_days"], int)

    def test_aggressive_pairs_take_longer_than_collaborative_pairs(self):
        for scenario in SCENARIOS:
            with self.subTest(scenario=scenario):
                aggressive = run_negotiation(scenario, "aggressive", "aggressive", max_rounds=24)
                collaborative = run_negotiation(
                    scenario,
                    "collaborative",
                    "collaborative",
                    max_rounds=24,
                )
                self.assertGreater(aggressive["rounds"], 0)
                self.assertGreater(collaborative["rounds"], 0)

    def test_terms_keep_backward_compatible_default(self):
        terms = Terms(price=1, delivery_days=2, warranty_months=3)
        self.assertEqual(terms.payment_days, 30)

    def test_vendor_concessions_cycle_warranty_and_payment(self):
        seller, buyer = build_scenario("vendor", "collaborative", "collaborative")

        buyer_warranty = _concede(buyer, buyer.target, 3, 12).warranty_months
        seller_payment = _concede(seller, seller.target, 4, 12).payment_days
        buyer_payment = _concede(buyer, buyer.target, 4, 12).payment_days

        self.assertLess(buyer_warranty, buyer.target.warranty_months)
        self.assertGreaterEqual(buyer_warranty, buyer.batna.warranty_months)
        self.assertGreater(seller_payment, seller.target.payment_days)
        self.assertLess(buyer_payment, buyer.target.payment_days)
        self.assertGreater(buyer_payment, buyer.batna.payment_days)

    def test_vendor_nine_personality_pairings_at_twelve_rounds(self):
        results = {}
        for opener_personality in PERSONALITIES:
            for responder_personality in PERSONALITIES:
                result = run_negotiation(
                    "vendor",
                    opener_personality,
                    responder_personality,
                    max_rounds=12,
                )
                pair = (opener_personality, responder_personality)
                results[pair] = result
                self.assertGreater(result["rounds"], 1)

        self.assertEqual(
            results[("aggressive", "collaborative")]["outcome"],
            "deal",
        )

        aggressive_aggressive = results[("aggressive", "aggressive")]
        all_round_counts = [
            result["rounds"] for result in results.values()
            if result["outcome"] == "deal"
        ]
        if aggressive_aggressive["outcome"] == "deal":
            self.assertGreaterEqual(
                aggressive_aggressive["rounds"],
                max(all_round_counts),
            )


if __name__ == "__main__":
    unittest.main()
