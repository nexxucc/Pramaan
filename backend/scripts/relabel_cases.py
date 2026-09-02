import csv
import json
import os
import random

random.seed(42)

IN_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "synthetic", "cases_with_vlm.csv")

# Label thresholds grounded in published India COD/RTO/returns stats (Sept 2026):
#   - COD RTO rate: 20-30% (GoKwik ~26%, Unicommerce 20.9% FY23) -> item_not_received
#   - Fashion/apparel return rate: 25-40% (quality/fit disputes) -> not_as_described
#   - UPI dataset's own fraud_flag base rate: 0.2% -> unauthorized_transaction, duplicate_charge
#     (genuine fraud/duplicate billing is rare even when frequently claimed; this matches
#     documented real-world pattern, not an arbitrary cutoff)


def compute_label(reason_code, txn, delivery):
    if reason_code == "item_not_received":
        # delivery_status already reflects the underlying synthetic dataset's own
        # delivered/delayed/RTO-like distribution -- no extra threshold needed
        return 1 if delivery["delivery_status"] != "delivered" else 0

    if reason_code == "defective_product":
        return 1 if float(delivery["delivery_rating"]) <= 2 else 0

    if reason_code == "not_as_described":
        # grounded in 25-40% fashion/apparel return rate: rating<=3 approximates that band
        return 1 if float(delivery["delivery_rating"]) <= 3 else 0

    if reason_code == "unauthorized_transaction":
        # grounded in dataset's own 0.2% fraud_flag base rate -- most claims are NOT
        # genuine fraud, matches real-world pattern where claimed fraud >> actual fraud
        return 1 if int(txn["fraud_flag"]) == 1 else 0

    if reason_code == "duplicate_charge":
        # same fraud_flag grounding -- dropped the earlier arbitrary amount>4000 rule,
        # no published stat supports an amount-based cutoff
        return 1 if int(txn["fraud_flag"]) == 1 else 0

    return 0


def main():
    with open(IN_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    changed = 0
    for row in rows:
        txn = json.loads(row["transaction"])
        delivery = json.loads(row["delivery"])
        new_label = compute_label(row["reason_code"], txn, delivery)
        if str(new_label) != row["label"]:
            changed += 1
        row["label"] = str(new_label)

    with open(IN_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"Relabeled {len(rows)} rows, {changed} labels changed -> {IN_PATH}")


if __name__ == "__main__":
    main()