from app.pipeline.nodes.router import AUTO_RESOLVE_THRESHOLD, ESCALATE_THRESHOLD
from app.calibrator.model import predict
import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


CASES_PATH = os.path.join(os.path.dirname(
    __file__), "..", "..", "data", "synthetic", "cases_with_vlm.csv")

decisions = {"auto_resolve": 0, "escalate": 0, "request_evidence": 0}

with open(CASES_PATH, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        vlm_score = float(row["vlm_validity_score"])
        postcheck_passed = row["postcheck_passed"] in ("True", "1", "true")
        citations_count = int(row["citations_count"])
        reason_code = row["reason_code"]

        score = predict(vlm_score, postcheck_passed,
                        citations_count, reason_code)

        if not postcheck_passed:
            decision = "escalate"
        elif score >= AUTO_RESOLVE_THRESHOLD:
            decision = "auto_resolve"
        elif score >= ESCALATE_THRESHOLD:
            decision = "escalate"
        else:
            decision = "request_evidence"

        decisions[decision] += 1

print(decisions)
