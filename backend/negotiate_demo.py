from app.models import AgentProfile, Terms
from app.evaluation import evaluate_offer

MAX_ROUNDS = 12


def run(supplier_personality="aggressive", buyer_personality="collaborative"):
    supplier = AgentProfile(
        id="supplier", role="Supplier", personality=supplier_personality,
        wants_higher_price=True,
        target=Terms(price=12000, delivery_days=30, warranty_months=6),
        batna=Terms(price=9000, delivery_days=45, warranty_months=3),
    )
    buyer = AgentProfile(
        id="buyer", role="Buyer", personality=buyer_personality,
        wants_higher_price=False,
        target=Terms(price=9500, delivery_days=20, warranty_months=12),
        batna=Terms(price=11500, delivery_days=40, warranty_months=6),
        weights={"price": 0.4, "delivery": 0.4, "warranty": 0.2},
    )

    print(f"\n=== {supplier_personality.upper()} supplier vs {buyer_personality.upper()} buyer ===")

    on_table = supplier.target          # supplier opens with its ideal
    last = {"supplier": supplier.target, "buyer": None}
    print(f"R1  Supplier opens: {on_table.price} | {on_table.delivery_days}d | {on_table.warranty_months}m")

    speaker, other = buyer, supplier
    for rnd in range(1, MAX_ROUNDS + 1):
        d = evaluate_offer(speaker, on_table, last[speaker.id], rnd, MAX_ROUNDS)
        print(f"R{rnd}  {speaker.role}: {d.decision.upper()} (utility {d.utility}) - {d.reasoning}")

        if d.decision == "accept":
            print(f"\nDEAL REACHED in round {rnd}: {on_table}")
            return
        if d.decision == "reject":
            print("\nNO DEAL: talks broke down.")
            return

        on_table = d.counter_offer
        last[speaker.id] = on_table
        print(f"     counter -> {on_table.price} | {on_table.delivery_days}d | {on_table.warranty_months}m")
        speaker, other = other, speaker

    print("\nNO DEAL: max rounds reached (deadlock).")


if __name__ == "__main__":
    run("aggressive", "collaborative")
    run("collaborative", "collaborative")
    run("aggressive", "aggressive")