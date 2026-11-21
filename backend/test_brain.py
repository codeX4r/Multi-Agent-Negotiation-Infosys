from app.models import AgentProfile, Terms
from app.evaluation import evaluate_offer

supplier = AgentProfile(
    id="supplier", role="Supplier", personality="aggressive", wants_higher_price=True,
    target=Terms(price=12000, delivery_days=30, warranty_months=6),
    batna=Terms(price=9000, delivery_days=45, warranty_months=3),
)

offer = Terms(price=10000, delivery_days=35, warranty_months=6)
print(evaluate_offer(supplier, offer, None, round_no=1))