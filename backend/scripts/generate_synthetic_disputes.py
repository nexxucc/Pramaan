import csv
import json
import random
import os

random.seed(42)

UPI_PATH = "data/raw/UPI_Transactions_2024.csv"
DELIVERY_PATH = "data/raw/Delivery_Logistics.csv"
OUT_PATH = os.path.join(os.path.dirname(__file__), "..",
                        "..", "data", "synthetic", "cases.csv")

REASON_CODES = [
    "item_not_received",
    "not_as_described",
    "duplicate_charge",
    "unauthorized_transaction",
    "defective_product",
]


def load_upi_rows():
    rows = []
    with open(UPI_PATH, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["transaction type"] == "P2M" and r["transaction_status"] == "SUCCESS":
                rows.append(r)
    return rows


def load_delivery_rows():
    rows = []
    with open(DELIVERY_PATH, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


def build_bundle(txn: dict, delivery: dict, reason_code: str):
    transaction = {
        "transaction_id": txn["transaction id"],
        "amount": float(txn["amount (INR)"]),
        "merchant_category": txn["merchant_category"],
        "sender_bank": txn["sender_bank"],
        "receiver_bank": txn["receiver_bank"],
        "fraud_flag": int(txn["fraud_flag"]),
        "timestamp": txn["timestamp"],
    }
    delivery_bundle = {
        "delivery_partner": delivery["delivery_partner"],
        "delivery_status": delivery["delivery_status"],
        "delayed": delivery["delayed"],
        "delivery_rating": float(delivery["delivery_rating"]),
        "region": delivery["region"],
    }

    # label: 1 = valid dispute (merchant likely at fault), 0 = invalid
    label = 0
    if reason_code == "item_not_received" and delivery["delivery_status"] != "delivered":
        label = 1
    elif reason_code == "defective_product" and float(delivery["delivery_rating"]) <= 2:
        label = 1
    elif reason_code == "unauthorized_transaction" and int(txn["fraud_flag"]) == 1:
        label = 1
    elif reason_code in ("not_as_described", "duplicate_charge"):
        label = random.choice([0, 1])
    else:
        label = 0 if random.random() > 0.25 else 1  # small noise floor

    return {
        "reason_code": reason_code,
        "transaction": json.dumps(transaction),
        "delivery": json.dumps(delivery_bundle),
        "label": label,
    }


def main():
    upi_rows = load_upi_rows()
    delivery_rows = load_delivery_rows()
    print(
        f"P2M/SUCCESS upi rows: {len(upi_rows)}, delivery rows: {len(delivery_rows)}")

    out_rows = []
    for reason_code in REASON_CODES:
        n = random.randint(30, 50)
        for _ in range(n):
            txn = random.choice(upi_rows)
            delivery = random.choice(delivery_rows)
            out_rows.append(build_bundle(txn, delivery, reason_code))

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["reason_code", "transaction", "delivery", "label"])
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"Generated {len(out_rows)} cases -> {OUT_PATH}")


if __name__ == "__main__":
    main()
