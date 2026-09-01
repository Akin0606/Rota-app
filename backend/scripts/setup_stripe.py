"""One-time script: create the Rotally Pro product + £49/mo price in Stripe.

Run from the backend directory:
    .venv/Scripts/python -m scripts.setup_stripe

Prints the price ID to set as STRIPE_PRICE_ID in your env.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import get_settings

settings = get_settings()

if not settings.stripe_secret_key:
    print("STRIPE_SECRET_KEY not set — add it to .env first")
    sys.exit(1)

import stripe

stripe.api_key = settings.stripe_secret_key

# Check if product already exists
products = stripe.Product.list(limit=10)
existing = [p for p in products.data if p.name == "Rotally Pro"]

if existing:
    product = existing[0]
    print(f"Product already exists: {product.id}")
else:
    product = stripe.Product.create(
        name="Rotally Pro",
        description="Rota scheduling for your venue — staff availability, auto-solver, published rotas.",
    )
    print(f"Created product: {product.id}")

# Check if price already exists
prices = stripe.Price.list(product=product.id, limit=10)
existing_price = [
    p for p in prices.data
    if p.unit_amount == 4900
    and p.currency == "gbp"
    and p.recurring
    and p.recurring.interval == "month"
    and p.active
]

if existing_price:
    price = existing_price[0]
    print(f"Price already exists: {price.id}")
else:
    price = stripe.Price.create(
        product=product.id,
        unit_amount=4900,
        currency="gbp",
        recurring={"interval": "month"},
        tax_behavior="inclusive",
    )
    print(f"Created price: {price.id}")

print(f"\nSet this in your environment:")
print(f"  STRIPE_PRICE_ID={price.id}")
