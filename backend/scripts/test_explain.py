from app.calibrator.explain import explain_case, FEATURE_NAMES, REASON_CODES
import numpy as np
import csv
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


CASES_PATH = os.path.join(os.path.dirname(
    __file__), "..", "..", "data", "synthetic", "cases_with_vlm.csv")


def featurize(row):
    vlm_score = float(row["vlm_validity_score"])
    postcheck_passed = 1 if row["postcheck_passed"] in (
        "True", "1", "true") else 0
    citations_count = int(row["citations_count"])
    reason_onehot = [1 if row["reason_code"]
                     == rc else 0 for rc in REASON_CODES]
    return [vlm_score, postcheck_passed, citations_count] + reason_onehot


rows = []
with open(CASES_PATH, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

X = np.array([featurize(r) for r in rows])
background = X[np.random.choice(len(X), 30, replace=False)]

test_row = rows[0]
result = explain_case(
    float(test_row["vlm_validity_score"]),
    test_row["postcheck_passed"] in ("True", "1", "true"),
    int(test_row["citations_count"]),
    test_row["reason_code"],
    background,
)

print("predicted_score:", result["predicted_score"])
print("base_value:", result["base_value"])
print("contributions:")
for k, v in result["contributions"].items():
    print(f"  {k}: {v:.4f}")
