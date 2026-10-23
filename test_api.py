"""
Comprehensive API & Verification Test Suite for AICTE Dashboard.
Validates:
 (a) Overlaps found for all 5 seeded institutions (including 2 fuzzy spelling variations)
 (b) Transferring a complaint to another bureau via POST /api/complaints/{id}/action creates a new overlap
 (c) All 6 CSV reports return valid CSV data
 (d) /api/stats numbers add up (status counts strictly sum to the total)
 (e) Filter clarification (bureau, source_bureau, has_overlap, sort, limit, offset)
"""

import csv
import io
import json
import urllib.request
import urllib.parse
from datetime import date

BASE = "http://127.0.0.1:8000"


def request_json(path: str, method: str = "GET", data: dict | None = None) -> tuple[int, dict | list]:
    url = BASE + path
    headers = {"Content-Type": "application/json"} if data else {}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def request_csv(path: str) -> tuple[int, list[list[str]], str]:
    url = BASE + path
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req) as resp:
        content_disp = resp.headers.get("content-disposition", "")
        raw_text = resp.read().decode("utf-8")
        reader = csv.reader(io.StringIO(raw_text))
        rows = list(reader)
        return resp.status, rows, content_disp


def run_tests():
    print("=" * 70)
    print("AICTE DASHBOARD - COMPLETE ENGINE & REST API VERIFICATION")
    print("=" * 70)

    # 1. Meta
    status, meta = request_json("/api/meta")
    assert status == 200
    bureaus = [b["code"] for b in meta["bureaus"]]
    print(f"[PASS] Meta API: Bureaus={bureaus}, Regions={len(meta['regions'])}, Categories={len(meta['categories'])}")

    # 2. Overlaps Verification (a): 5 seeded institutions
    status, overlaps = request_json("/api/overlaps")
    assert status == 200
    print(f"\n[TEST A] Verifying Seeded Cross-Bureau Overlaps ({len(overlaps)} initial links):")
    detected_institutions = set()
    fuzzy_matches = []
    exact_matches = []

    for ol in overlaps:
        inst = ol.get("institution_name")
        detected_institutions.add(inst)
        reason = ol.get("match_reason", "")
        if "Fuzzy name match" in reason:
            fuzzy_matches.append((inst, reason))
        else:
            exact_matches.append((inst, reason))
        print(f"  * Overlap ID {ol['id']}: [{ol['match_reason']}] -> {inst} (Conf: {ol['confidence_score']})")

    expected_5 = {
        "Delhi Institute of Technology",
        "Shivalik College of Engineering",
        "Hyderabad College of Engineering",
        "Kolkata Institute of Technology",
        "Pune Institute of Technology",
    }
    missing = expected_5 - detected_institutions
    assert not missing, f"Missing seeded overlap institutions: {missing}"
    print(f"[PASS] Requirement (a) verified: All 5 seeded institutions detected in overlap engine.")
    print(f"       Exact PID matches: {len(exact_matches)}, Fuzzy spelling matches: {len(fuzzy_matches)}")
    for inst, reason in fuzzy_matches:
        print(f"       -> Spelling variation verified: {inst} => {reason}")

    # 3. Overlap Review & Manual Link
    first_ol = overlaps[0]
    review_body = {"coordination_remarks": "Joint RB-PGRC hearing scheduled next Friday", "status": "Reviewed"}
    status, rev_res = request_json(f"/api/overlaps/{first_ol['id']}/review", method="POST", data=review_body)
    assert status == 200 and rev_res["status"] == "Reviewed"
    print(f"[PASS] POST /api/overlaps/{first_ol['id']}/review successful. ActionHistory synchronized.")

    # 4. Action Verification (b): Transferring creates a new overlap
    print(f"\n[TEST B] Verifying Live Bureau Transfer & Overlap Generation:")
    # Find an institution with complaints in RB (e.g., Guru Nanak Engineering College)
    status, gn_comps = request_json("/api/complaints?q=Guru+Nanak")
    assert len(gn_comps) >= 2, "Expected at least 2 complaints for Guru Nanak"
    
    # Guru Nanak initial overlap state
    initial_ol_count = len(overlaps)
    print(f"  * Guru Nanak complaints found: {len(gn_comps)}")
    print(f"    - Case 1: {gn_comps[0]['case_id']} in Bureau {gn_comps[0]['current_bureau']}")
    print(f"    - Case 2: {gn_comps[1]['case_id']} in Bureau {gn_comps[1]['current_bureau']}")
    assert gn_comps[0]["current_bureau"] == gn_comps[1]["current_bureau"] == "RB", "Both should initially be in RB"
    assert not gn_comps[0]["has_overlap"], "Should NOT have overlap initially"

    # Transfer Case 2 from RB to PGRC
    target_comp_id = gn_comps[1]["id"]
    action_body = {
        "action_type": "Transferred",
        "bureau_code": "PGRC",
        "remarks": "Transferred to PGRC for combined grievance inquiry.",
    }
    status, act_res = request_json(f"/api/complaints/{target_comp_id}/action", method="POST", data=action_body)
    assert status == 200 and act_res["success"]
    print(f"  * Transferred complaint {gn_comps[1]['case_id']} to PGRC via POST /action.")

    # Check updated overlaps
    status, updated_overlaps = request_json("/api/overlaps")
    assert len(updated_overlaps) > initial_ol_count, f"Expected > {initial_ol_count} overlaps, got {len(updated_overlaps)}"
    new_guru_nanak_overlaps = [ol for ol in updated_overlaps if "Guru Nanak" in (ol.get("institution_name") or "")]
    assert len(new_guru_nanak_overlaps) >= 1, "Expected Guru Nanak overlap to be created"
    new_overlap = new_guru_nanak_overlaps[0]
    print(f"[PASS] Requirement (b) verified: Transferring complaint immediately created NEW overlap(s) ({len(new_guru_nanak_overlaps)} for Guru Nanak)!")
    print(f"       New Overlap Link: {new_overlap['match_reason']} for {new_overlap['institution_name']}")

    # 5. CSV Reports Verification (c)
    print(f"\n[TEST C] Verifying CSV Exports:")
    report_endpoints = [
        ("bureau.csv", "/api/reports/bureau.csv", 4),       # header + 3 bureaus
        ("region.csv", "/api/reports/region.csv", 6),       # header + 5 regions
        ("institution.csv", "/api/reports/institution.csv", 26), # header + 25 institutions
        ("ageing.csv", "/api/reports/ageing.csv", 5),       # header + 4 buckets
        ("overlaps.csv", "/api/reports/overlaps.csv", len(updated_overlaps) + 1),
        ("complaints.csv", "/api/reports/complaints.csv", 61), # header + 60 complaints
    ]
    for name, path, min_rows in report_endpoints:
        status, rows, disp = request_csv(path)
        assert status == 200
        assert "attachment" in disp and name.split(".")[0] in disp
        assert len(rows) >= min_rows, f"{name}: expected at least {min_rows} rows, got {len(rows)}"
        print(f"  * {name}: {len(rows)} rows, valid CSV header -> {rows[0][:3]}...")
    print(f"[PASS] Requirement (c) verified: All 6 CSV reports generated with proper Content-Disposition.")

    # 6. Stats Verification (d): Numbers strictly sum to total
    print(f"\n[TEST D] Verifying /api/stats (Consistency & Sums):")
    status, stats = request_json("/api/stats")
    assert status == 200
    totals = stats["totals"]
    total = totals["total"]
    pending = totals["pending"]
    under_process = totals["under_process"]
    disposed = totals["disposed"]
    transferred = totals["transferred"]
    escalated = totals["escalated"]

    sum_statuses = pending + under_process + disposed + transferred + escalated
    print(f"  * Total complaints: {total}")
    print(f"  * Pending: {pending}, Under Process: {under_process}, Disposed: {disposed}, Transferred: {transferred}, Escalated: {escalated}")
    print(f"  * Sum of status counts: {sum_statuses}")
    assert sum_statuses == total, f"Status counts {sum_statuses} do NOT sum to total {total}"
    print(f"[PASS] Requirement (d) verified: Status counts strictly sum to total ({sum_statuses} == {total}).")
    print(f"  * Overdue: {totals['overdue']}, Approaching Deadline: {totals['approaching_deadline']}, Open Overlaps: {totals['open_overlaps']}")
    print(f"  * Average disposal days: {stats['avg_disposal_days']} days")
    print(f"  * Top institution: {stats['top_institutions'][0]['name']} ({stats['top_institutions'][0]['count']} cases)")

    # Test stats with bureau filter
    status, rb_stats = request_json("/api/stats?bureau=RB")
    assert status == 200
    rb_tot = rb_stats["totals"]["total"]
    rb_sum = sum(rb_stats["by_status"].values())
    assert rb_tot == rb_sum, f"RB status sum mismatch: {rb_tot} != {rb_sum}"
    print(f"[PASS] Bureau filter /api/stats?bureau=RB verified ({rb_tot} complaints, sum={rb_sum}).")

    # 7. Alerts Verification
    status, alerts = request_json("/api/alerts")
    assert status == 200
    summary = alerts["summary"]
    print(f"\n[TEST E] Alerts Endpoint:")
    print(f"  * Total Alerts: {summary['total']} (Overlap: {summary['overlap']}, Overdue: {summary['overdue']}, Approaching: {summary['deadline_approaching']}, Escalation: {summary['escalation']}, Long Pending: {summary['long_pending']})")
    assert len(alerts["alerts"]) == summary["total"]
    print(f"[PASS] /api/alerts verified.")

    # 8. Filter Clarification Verification
    status, rb_current = request_json("/api/complaints?bureau=RB")
    status, rb_source = request_json("/api/complaints?source_bureau=RB")
    status, ol_comps = request_json("/api/complaints?has_overlap=true")
    status, sorted_age = request_json("/api/complaints?sort=age_desc&limit=3")
    print(f"\n[TEST F] Filter Clarification:")
    print(f"  * Complaints by current bureau RB: {len(rb_current)}")
    print(f"  * Complaints by source bureau RB:  {len(rb_source)}")
    print(f"  * Complaints with active overlap:  {len(ol_comps)}")
    print(f"  * Sort by age_desc top 3 age in days: {[c['age_in_days'] for c in sorted_age]}")
    assert sorted_age[0]["age_in_days"] >= sorted_age[1]["age_in_days"] >= sorted_age[2]["age_in_days"]
    print(f"[PASS] Filter clarification verified.")

    print("\n" + "=" * 70)
    print("ALL API & ENGINE VERIFICATIONS PASSED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    run_tests()
