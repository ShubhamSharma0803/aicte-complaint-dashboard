"""
overlap.py - Cross-Bureau Overlap Detection Engine for AICTE Dashboard.

Detects "Potential Overlapping Cases – Coordination Required" across two layers:
- Layer 1 (Exact): Multiple complaints for the same institution (same AICTE Permanent ID)
  handled concurrently across different bureaus (status not Disposed).
- Layer 2 (Fuzzy): Multiple complaints across different bureaus where institutions differ
  or where description text mentions an institution name spelled differently (rapidfuzz >= 88).
"""

from datetime import datetime
import re
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from models import Complaint, OverlapLink, ActionHistory, Institution, Bureau

GENERIC_WORDS = {
    "college", "institute", "technology", "engineering", "management",
    "pharmacy", "architecture", "school", "academy", "studies", "university",
}

ABBREVIATIONS = {
    "engg": "engineering",
    "inst": "institute",
    "tech": "technology",
    "coll": "college",
    "univ": "university",
    "mgmt": "management",
}

FILLER_WORDS = {"the", "of", "and"}


def normalize_name(text: str) -> str:
    """Normalize institution name by expanding abbreviations, removing filler words and punctuation."""
    if not text:
        return ""
    s = text.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    tokens = [ABBREVIATIONS.get(t, t) for t in s.split() if t not in FILLER_WORDS]
    return " ".join(tokens)


def extract_institution_alias(description: str) -> str | None:
    """Extract potential institution alias prefix from description if present."""
    if not description:
        return None
    if ":" in description:
        prefix = description.split(":", 1)[0].strip()
        candidate = prefix.split(",", 1)[0].strip() if "," in prefix else prefix
        lowered = candidate.lower()
        if any(kw in lowered for kw in [
            "college", "engg", "engineering", "inst", "institute", "tech",
            "technology", "mgmt", "management", "pharmacy", "architecture",
            "school", "univ", "university"
        ]):
            return candidate
    return None


def scan_overlaps(db: Session) -> list[OverlapLink]:
    """
    Scans for cross-bureau overlap pairs among active complaints.
    Idempotent: preserves existing links and never overwrites Reviewed links.
    Returns list of OverlapLink instances.
    """
    active_complaints = (
        db.query(Complaint)
        .filter(Complaint.status != "Disposed")
        .all()
    )

    new_links_count = 0
    all_matched_links = []

    for i in range(len(active_complaints)):
        for j in range(i + 1, len(active_complaints)):
            ca = active_complaints[i]
            cb = active_complaints[j]
            if ca.id > cb.id:
                ca, cb = cb, ca

            # Only consider complaints currently handled by different bureaus
            if ca.current_bureau_id == cb.current_bureau_id:
                continue

            bureau_a = ca.current_bureau.code
            bureau_b = cb.current_bureau.code

            alias_a = extract_institution_alias(ca.description)
            alias_b = extract_institution_alias(cb.description)

            # Check if description mentions a differently spelled institution name
            has_spelling_variation = False
            var_X, var_Y = None, None

            if alias_a and normalize_name(alias_a) == normalize_name(ca.institution.name) and alias_a.lower() != ca.institution.name.lower():
                has_spelling_variation = True
                var_X, var_Y = alias_a, cb.institution.name
            elif alias_b and normalize_name(alias_b) == normalize_name(cb.institution.name) and alias_b.lower() != cb.institution.name.lower():
                has_spelling_variation = True
                var_X, var_Y = alias_b, ca.institution.name

            match_reason = None
            confidence = 100

            if has_spelling_variation and ca.institution_id == cb.institution_id:
                # Layer 2: Spelling variation in description
                norm_X = normalize_name(var_X)
                norm_Y = normalize_name(var_Y)
                sim = max(fuzz.token_set_ratio(norm_X, norm_Y), fuzz.partial_ratio(norm_X, norm_Y))
                score = int(round(sim))
                boost = 5 if ca.category == cb.category else 0
                confidence = min(100, score + boost)
                match_reason = f"Fuzzy name match: '{var_X}' ~ '{var_Y}' (score {score})"
            elif ca.institution_id == cb.institution_id:
                # Layer 1: Exact PID match
                confidence = 100
                match_reason = f"Same AICTE Permanent ID handled by {bureau_a} and {bureau_b}"
            else:
                # Layer 2: Differing institutions with fuzzy similarity >= 88
                na = normalize_name(ca.institution.name)
                nb = normalize_name(cb.institution.name)
                sim = max(fuzz.token_set_ratio(na, nb), fuzz.partial_ratio(na, nb))
                distinctive_a = set(na.split()) - GENERIC_WORDS
                distinctive_b = set(nb.split()) - GENERIC_WORDS
                if sim >= 88 and (distinctive_a & distinctive_b or ca.institution.city == cb.institution.city):
                    score = int(round(sim))
                    boost = 5 if ca.category == cb.category else 0
                    confidence = min(100, score + boost)
                    match_reason = f"Fuzzy name match: '{ca.institution.name}' ~ '{cb.institution.name}' (score {score})"

            if match_reason:
                # Idempotency check: see if link already exists
                existing = (
                    db.query(OverlapLink)
                    .filter(
                        OverlapLink.complaint_a_id == ca.id,
                        OverlapLink.complaint_b_id == cb.id,
                    )
                    .first()
                )
                if not existing:
                    link = OverlapLink(
                        complaint_a_id=ca.id,
                        complaint_b_id=cb.id,
                        match_reason=match_reason,
                        confidence_score=confidence,
                        status="Open",
                        coordination_remarks=None,
                        created_at=datetime.utcnow(),
                    )
                    db.add(link)
                    new_links_count += 1
                    all_matched_links.append(link)
                else:
                    all_matched_links.append(existing)

    if new_links_count > 0:
        db.commit()

    total_links = db.query(OverlapLink).all()

    # Collect distinct institutions detected
    institutions_summary = set()
    for l in total_links:
        if l.complaint_a and l.complaint_a.institution:
            institutions_summary.add(l.complaint_a.institution.name)
        if l.complaint_b and l.complaint_b.institution:
            institutions_summary.add(l.complaint_b.institution.name)

    print("\n[OVERLAP ENGINE] Cross-Bureau Overlap Scan Complete:")
    print(f"   Total active overlap links: {len(total_links)} (New: {new_links_count})")
    print(f"   Institutions detected ({len(institutions_summary)}):")
    for inst_name in sorted(institutions_summary):
        print(f"     * {inst_name}")

    return total_links
