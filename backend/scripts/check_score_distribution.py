import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.calibrator.model import predict

CASES_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "synthetic", "cases_with_vlm.csv")

scores = []
with open(CASES_PATH, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        s = predict(
            float(row["vlm_validity_score"]),
            row["postcheck_passed"] in ("True", "1", "true"),
            int(row["citations_count"]),
            row["reason_code"],
        )
        scores.append(s)

scores.sort()
n = len(scores)
print(f"min={scores[0]:.3f} max={scores[-1]:.3f}")
print(f"p50={scores[n//2]:.3f} p75={scores[int(n*0.75)]:.3f} p90={scores[int(n*0.9)]:.3f} p95={scores[int(n*0.95)]:.3f}")