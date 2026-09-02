import csv
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline.graph import build_graph  # noqa: E402

IN_PATH = os.path.join(os.path.dirname(__file__), "..",
                       "..", "data", "synthetic", "cases.csv")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..",
                        "..", "data", "synthetic", "cases_with_vlm.csv")
DELAY_SECONDS = 1.0  # throttle to avoid free-tier rate limits, raise if you hit 429s

graph = build_graph()


def already_done_ids():
    if not os.path.exists(OUT_PATH):
        return set()
    with open(OUT_PATH, newline="", encoding="utf-8") as f:
        return {row["dispute_id"] for row in csv.DictReader(f)}


def main():
    with open(IN_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    done = already_done_ids()
    out_exists = os.path.exists(OUT_PATH)
    fieldnames = ["dispute_id", "reason_code", "transaction", "delivery", "label",
                  "vlm_validity_score", "postcheck_passed", "citations_count"]

    with open(OUT_PATH, "a", newline="", encoding="utf-8") as out_f:
        writer = csv.DictWriter(out_f, fieldnames=fieldnames)
        if not out_exists:
            writer.writeheader()

        for i, row in enumerate(rows):
            dispute_id = f"synth-{i}"
            if dispute_id in done:
                continue

            payload = {
                "dispute_id": dispute_id,
                "reason_code": row["reason_code"],
                "transaction": json.loads(row["transaction"]),
                "delivery": json.loads(row["delivery"]),
                "communication": [],
            }

            config = {"configurable": {"thread_id": dispute_id}}
            try:
                result = graph.invoke(
                    {"case_id": dispute_id, "raw_payload": payload}, config=config)
            except Exception as e:
                print(f"[{i}] FAILED {dispute_id}: {e}")
                continue

            writer.writerow({
                "dispute_id": dispute_id,
                "reason_code": row["reason_code"],
                "transaction": row["transaction"],
                "delivery": row["delivery"],
                "label": row["label"],
                "vlm_validity_score": result.get("vlm_validity_score", ""),
                "postcheck_passed": result.get("postcheck_passed", ""),
                "citations_count": len(result.get("vlm_citations", [])),
            })
            out_f.flush()
            print(
                f"[{i}/{len(rows)}] {dispute_id} done, decision={result.get('decision')}")

            time.sleep(DELAY_SECONDS)

    print(f"Done -> {OUT_PATH}")


if __name__ == "__main__":
    main()
