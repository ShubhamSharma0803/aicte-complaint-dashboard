"""
Seed script for the AICTE Complaint Monitoring Dashboard.
Run:  python seed.py
Safe to re-run – drops and recreates all tables each time.
All dates are computed relative to today so the demo data stays fresh.
"""

import random
from datetime import date, datetime, time, timedelta

from database import Base, engine, SessionLocal
from models import Institution, Bureau, Officer, Complaint, ActionHistory, OverlapLink
from overlap import scan_overlaps

random.seed(42)  # reproducible data

TODAY = date.today()


# ═══════════════════════════════════════════════════════════════════════════
# Reference data
# ═══════════════════════════════════════════════════════════════════════════

BUREAUS = [
    ("RB", "Regulation Bureau"),
    ("PGRC", "Public Grievance Redressal Cell"),
    ("APPROVAL", "Approval Bureau"),
]

OFFICERS = {
    # bureau_code: [officer names]
    "RB": ["Rajesh Kumar", "Priya Sharma", "Amit Verma", "Sunita Patel"],
    "PGRC": ["Vikram Singh", "Neha Gupta", "Suresh Reddy", "Anjali Nair"],
    "APPROVAL": ["Deepak Mishra", "Kavita Joshi", "Manish Tiwari", "Pooja Deshmukh"],
}

INSTITUTIONS_DATA = [
    # (permanent_id, name, address, city, state, region, category)
    # ── Northern ──
    ("1-90278401", "Delhi Institute of Technology", "Rohini Sector 14, Delhi", "New Delhi", "Delhi", "Northern", "Engineering"),
    ("1-90278402", "Guru Nanak Engineering College", "Sector 26, Chandigarh", "Chandigarh", "Chandigarh", "Northern", "Engineering"),
    ("1-90278403", "Shivalik College of Engineering", "Mussoorie Diversion Road", "Dehradun", "Uttarakhand", "Northern", "Engineering"),
    ("1-90278404", "Rajasthan School of Management", "Malviya Nagar, Jaipur", "Jaipur", "Rajasthan", "Northern", "Management"),
    ("1-90278405", "Lucknow Institute of Pharmacy", "Sitapur Road, Lucknow", "Lucknow", "Uttar Pradesh", "Northern", "Pharmacy"),
    # ── Southern ──
    ("2-90278406", "Chennai Institute of Technology", "Sarathy Nagar, Kundrathur", "Chennai", "Tamil Nadu", "Southern", "Engineering"),
    ("2-90278407", "Hyderabad College of Engineering", "Kukatpally, KPHB Colony", "Hyderabad", "Telangana", "Southern", "Engineering"),
    ("2-90278408", "Bangalore School of Architecture", "Kengeri Satellite Town", "Bengaluru", "Karnataka", "Southern", "Architecture"),
    ("2-90278409", "Kerala Institute of Management Studies", "Kalamassery, Kochi", "Kochi", "Kerala", "Southern", "Management"),
    ("2-90278410", "Sri Venkateswara College of Pharmacy", "Alipiri Road, Tirupati", "Tirupati", "Andhra Pradesh", "Southern", "Pharmacy"),
    # ── Eastern ──
    ("3-90278411", "Kolkata Institute of Technology", "Howrah Bridge Road", "Kolkata", "West Bengal", "Eastern", "Engineering"),
    ("3-90278412", "Bhubaneswar Engineering College", "Patia, Bhubaneswar", "Bhubaneswar", "Odisha", "Eastern", "Engineering"),
    ("3-90278413", "Patna College of Management", "Boring Road, Patna", "Patna", "Bihar", "Eastern", "Management"),
    ("3-90278414", "Guwahati Institute of Pharmacy", "Six Mile, Guwahati", "Guwahati", "Assam", "Eastern", "Pharmacy"),
    ("3-90278415", "Ranchi Institute of Technology", "Kanke Road, Ranchi", "Ranchi", "Jharkhand", "Eastern", "Engineering"),
    # ── Western ──
    ("4-90278416", "Mumbai College of Engineering", "Matunga, Mumbai", "Mumbai", "Maharashtra", "Western", "Engineering"),
    ("4-90278417", "Pune Institute of Technology", "Hinjewadi Phase 1, Pune", "Pune", "Maharashtra", "Western", "Engineering"),
    ("4-90278418", "Ahmedabad School of Management", "SG Highway, Ahmedabad", "Ahmedabad", "Gujarat", "Western", "Management"),
    ("4-90278419", "Goa College of Architecture", "Altinho, Panaji", "Panaji", "Goa", "Western", "Architecture"),
    ("4-90278420", "Nagpur Institute of Pharmacy", "Seminary Hills, Nagpur", "Nagpur", "Maharashtra", "Western", "Pharmacy"),
    # ── Central ──
    ("5-90278421", "Bhopal Engineering College", "Kolar Road, Bhopal", "Bhopal", "Madhya Pradesh", "Central", "Engineering"),
    ("5-90278422", "Indore Institute of Management", "Rau-Pithampur Road, Indore", "Indore", "Madhya Pradesh", "Central", "Management"),
    ("5-90278423", "Jabalpur College of Engineering", "Ranjhi, Jabalpur", "Jabalpur", "Madhya Pradesh", "Central", "Engineering"),
    ("5-90278424", "Raipur School of Pharmacy", "GE Road, Raipur", "Raipur", "Chhattisgarh", "Central", "Pharmacy"),
    ("5-90278425", "Gwalior Institute of Technology", "City Centre, Gwalior", "Gwalior", "Madhya Pradesh", "Central", "Engineering"),
]

CATEGORIES = [
    "Fee Fraud",
    "Faculty Shortage",
    "Infrastructure",
    "Affiliation Violation",
    "Admission Irregularity",
    "Harassment",
]

STATUSES = ["Pending", "Under Process", "Disposed", "Transferred", "Escalated"]
PRIORITIES = ["High", "Medium", "Low"]

CATEGORY_DESCRIPTIONS = {
    "Fee Fraud": [
        "Students allege unauthorized fee collection beyond AICTE-approved fee structure. Receipts not issued for capitation charges.",
        "Parents report hidden charges and undisclosed fees during admission. Demand letters attached.",
        "Complaint regarding inflated hostel and transport fees not sanctioned by the Fee Regulatory Committee.",
    ],
    "Faculty Shortage": [
        "Institution reportedly running B.Tech programmes with less than 50% of required qualified faculty.",
        "Multiple departments lack HODs and senior faculty. Student learning outcomes severely affected.",
        "Complaint about visiting faculty being shown as permanent staff in AICTE submissions.",
    ],
    "Infrastructure": [
        "Laboratory facilities do not meet AICTE norms. Computer labs have outdated hardware and no licensed software.",
        "Library has fewer than 30% of prescribed titles. No digital journal subscriptions available to students.",
        "Classrooms lack basic amenities. Workshop and drawing halls non-functional for over a year.",
    ],
    "Affiliation Violation": [
        "Institution conducting unapproved MBA programme without AICTE recognition. Students at risk of invalid degrees.",
        "Seats increased beyond sanctioned intake without approval. Excess admissions reported in CSE branch.",
        "Off-campus centre operating without any affiliation or approval from AICTE or the university.",
    ],
    "Admission Irregularity": [
        "Deviation from centralized counseling norms. Management quota seats sold outside approved process.",
        "Complaint about forged merit list and preferential admission to unqualified candidates.",
        "Students allege admission through unauthorized agents. Demand refund of capitation fee.",
    ],
    "Harassment": [
        "Students report systematic harassment by institution management for raising complaints about fee irregularities.",
        "Faculty members facing retaliatory transfers and salary withholding after filing RTI queries.",
        "Anti-ragging committee non-functional. Students report intimidation and no grievance redressal mechanism.",
    ],
}

NEXT_ACTIONS = {
    "Pending": "Review complaint and assign to investigating officer",
    "Under Process": "Complete investigation and prepare status report",
    "Escalated": "Senior leadership review and directive required",
    "Transferred": "Receiving bureau to acknowledge and take over",
    "Disposed": None,
}

REMARK_TEMPLATES = [
    "Show-cause notice issued to institution management.",
    "Document verification underway; awaiting response from institution.",
    "Telephonic follow-up conducted with complainant.",
    "Inspection report received from regional committee.",
    "Institution submitted compliance response – under review.",
    "Second reminder sent to institution for pending documents.",
    "Coordination meeting held with university affiliation office.",
    "Legal opinion sought on jurisdictional aspects.",
    "Site inspection scheduled for next week.",
    "Response from institution found unsatisfactory; further action recommended.",
]


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _dt(d: date, hour: int = 10, minute: int = 0) -> datetime:
    """Convert a date to a datetime at the given hour."""
    return datetime.combine(d, time(hour, minute))


def _random_date_between(start: date, end: date) -> date:
    """Return a random date in [start, end]."""
    delta = (end - start).days
    if delta <= 0:
        return start
    return start + timedelta(days=random.randint(0, delta))


def _generate_case_id(bureau_code: str, counters: dict) -> str:
    """AICTE-{BUREAU_CODE}-2026-{3-digit number}."""
    counters[bureau_code] = counters.get(bureau_code, 0) + 1
    return f"AICTE-{bureau_code}-2026-{counters[bureau_code]:03d}"


def _build_action_history(
    complaint_id: int,
    source_bureau_id: int,
    current_bureau_id: int,
    assigned_officer_id: int,
    received_date: date,
    status: str,
    officers_by_bureau: dict,
    bureau_id_to_code: dict,
) -> list[ActionHistory]:
    """Build 2-5 chronological ActionHistory rows for a complaint."""
    actions: list[ActionHistory] = []

    # 1) Received
    actions.append(ActionHistory(
        complaint_id=complaint_id,
        action_date=_dt(received_date, 9, 30),
        bureau_id=source_bureau_id,
        officer_id=random.choice(officers_by_bureau[source_bureau_id]),
        action_type="Received",
        remarks="Complaint received and logged in the system.",
    ))

    # 2) Assigned (1-3 days later)
    assign_date = received_date + timedelta(days=random.randint(1, 3))
    actions.append(ActionHistory(
        complaint_id=complaint_id,
        action_date=_dt(assign_date, 11, 0),
        bureau_id=current_bureau_id,
        officer_id=assigned_officer_id,
        action_type="Assigned",
        remarks=f"Case assigned for investigation.",
    ))

    cursor_date = assign_date

    # 3) Additional actions depending on status
    if status in ("Under Process", "Disposed", "Escalated", "Transferred"):
        remark_date = cursor_date + timedelta(days=random.randint(5, 20))
        if remark_date > TODAY:
            remark_date = cursor_date + timedelta(days=1)
        actions.append(ActionHistory(
            complaint_id=complaint_id,
            action_date=_dt(remark_date, 14, 30),
            bureau_id=current_bureau_id,
            officer_id=assigned_officer_id,
            action_type="Remark",
            remarks=random.choice(REMARK_TEMPLATES),
        ))
        cursor_date = remark_date

    if status in ("Disposed", "Escalated", "Transferred"):
        # Add a second remark
        remark2_date = cursor_date + timedelta(days=random.randint(3, 12))
        if remark2_date > TODAY:
            remark2_date = cursor_date + timedelta(days=1)
        actions.append(ActionHistory(
            complaint_id=complaint_id,
            action_date=_dt(remark2_date, 10, 15),
            bureau_id=current_bureau_id,
            officer_id=assigned_officer_id,
            action_type="Remark",
            remarks=random.choice(REMARK_TEMPLATES),
        ))
        cursor_date = remark2_date

    if status == "Transferred":
        transfer_date = cursor_date + timedelta(days=random.randint(2, 5))
        if transfer_date > TODAY:
            transfer_date = cursor_date + timedelta(days=1)
        # Pick a different bureau
        other_bureaus = [bid for bid in officers_by_bureau if bid != current_bureau_id]
        target_bureau = random.choice(other_bureaus) if other_bureaus else current_bureau_id
        actions.append(ActionHistory(
            complaint_id=complaint_id,
            action_date=_dt(transfer_date, 16, 0),
            bureau_id=target_bureau,
            officer_id=random.choice(officers_by_bureau[target_bureau]),
            action_type="Transferred",
            remarks=f"Case transferred to {bureau_id_to_code.get(target_bureau, 'other bureau')} for further action.",
        ))

    if status == "Escalated":
        esc_date = cursor_date + timedelta(days=random.randint(1, 4))
        if esc_date > TODAY:
            esc_date = cursor_date + timedelta(days=1)
        actions.append(ActionHistory(
            complaint_id=complaint_id,
            action_date=_dt(esc_date, 15, 45),
            bureau_id=current_bureau_id,
            officer_id=assigned_officer_id,
            action_type="Escalated",
            remarks="Escalated to senior leadership for urgent review and directive.",
        ))

    if status == "Disposed":
        disp_date = cursor_date + timedelta(days=random.randint(3, 10))
        if disp_date > TODAY:
            disp_date = cursor_date + timedelta(days=1)
        actions.append(ActionHistory(
            complaint_id=complaint_id,
            action_date=_dt(disp_date, 17, 0),
            bureau_id=current_bureau_id,
            officer_id=assigned_officer_id,
            action_type="Disposed",
            remarks="Case investigation completed. Final order issued and communicated to complainant.",
        ))

    return actions


# ═══════════════════════════════════════════════════════════════════════════
# Main seeding function
# ═══════════════════════════════════════════════════════════════════════════

def seed():
    print("[*] Dropping and recreating all tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        # ── Bureaus ──────────────────────────────────────────────────────
        bureau_objs: dict[str, Bureau] = {}
        for code, name in BUREAUS:
            b = Bureau(code=code, name=name)
            db.add(b)
            bureau_objs[code] = b
        db.flush()
        bureau_id_map = {b.code: b.id for b in bureau_objs.values()}         # code → id
        bureau_id_to_code = {b.id: b.code for b in bureau_objs.values()}     # id → code
        print(f"   [OK] {len(BUREAUS)} bureaus created")

        # ── Officers ─────────────────────────────────────────────────────
        officer_objs: list[Officer] = []
        officers_by_bureau: dict[int, list[int]] = {}   # bureau_id → [officer_ids]
        for code, names in OFFICERS.items():
            bureau_id = bureau_id_map[code]
            officers_by_bureau[bureau_id] = []
            for oname in names:
                o = Officer(name=oname, bureau_id=bureau_id)
                db.add(o)
                officer_objs.append(o)
        db.flush()
        for o in officer_objs:
            officers_by_bureau[o.bureau_id].append(o.id)
        print(f"   [OK] {len(officer_objs)} officers created")

        # ── Institutions ─────────────────────────────────────────────────
        inst_objs: list[Institution] = []
        for pid, name, addr, city, state, region, cat in INSTITUTIONS_DATA:
            inst = Institution(
                permanent_id=pid, name=name, address=addr,
                city=city, state=state, region=region, institute_category=cat,
            )
            db.add(inst)
            inst_objs.append(inst)
        db.flush()
        print(f"   [OK] {len(inst_objs)} institutions created")

        # ── Complaint generation ─────────────────────────────────────────

        case_counters: dict[str, int] = {}   # per-bureau running number
        all_complaints: list[Complaint] = []
        all_actions: list[ActionHistory] = []

        def _add_complaint(
            inst_idx: int,
            source_bureau_code: str,
            current_bureau_code: str | None,
            category: str,
            status: str,
            priority: str,
            received_days_ago: int,
            disposal_offset_from_today: int | None,
            description_override: str | None = None,
        ) -> Complaint:
            """Create a Complaint + its ActionHistory rows."""
            nonlocal all_complaints, all_actions

            if current_bureau_code is None:
                current_bureau_code = source_bureau_code

            inst = inst_objs[inst_idx]
            src_bureau_id = bureau_id_map[source_bureau_code]
            cur_bureau_id = bureau_id_map[current_bureau_code]
            officer_id = random.choice(officers_by_bureau[cur_bureau_id])

            received = TODAY - timedelta(days=received_days_ago)
            expected_disposal = (
                TODAY + timedelta(days=disposal_offset_from_today)
                if disposal_offset_from_today is not None
                else received + timedelta(days=random.randint(45, 90))
            )

            desc = description_override or random.choice(CATEGORY_DESCRIPTIONS[category])

            case_id = _generate_case_id(source_bureau_code, case_counters)

            c = Complaint(
                case_id=case_id,
                institution_id=inst.id,
                source_bureau_id=src_bureau_id,
                current_bureau_id=cur_bureau_id,
                assigned_officer_id=officer_id,
                category=category,
                description=desc,
                status=status,
                priority=priority,
                received_date=received,
                expected_disposal_date=expected_disposal,
                next_action_required=NEXT_ACTIONS.get(status),
            )
            db.add(c)
            db.flush()  # get c.id

            # Action history
            actions = _build_action_history(
                complaint_id=c.id,
                source_bureau_id=src_bureau_id,
                current_bureau_id=cur_bureau_id,
                assigned_officer_id=officer_id,
                received_date=received,
                status=status,
                officers_by_bureau=officers_by_bureau,
                bureau_id_to_code=bureau_id_to_code,
            )
            for a in actions:
                db.add(a)
            db.flush()

            # Update last_action fields from the generated history
            last_act = actions[-1]
            c.last_action_date = last_act.action_date.date() if isinstance(last_act.action_date, datetime) else last_act.action_date
            c.last_action_taken = last_act.remarks

            all_complaints.append(c)
            all_actions.extend(actions)
            return c

        # ──────────────────────────────────────────────────────────────────
        # OVERLAP CASES  (5 institutions × 2 complaints = 10)
        # Institutions: 0 (Delhi IT), 2 (Shivalik CoE), 6 (Hyderabad CoE),
        #               10 (Kolkata IT), 16 (Pune IT)
        # ──────────────────────────────────────────────────────────────────
        overlap_pairs: list[tuple[Complaint, Complaint, str]] = []

        # Pair 1: Delhi Institute of Technology
        ca = _add_complaint(0, "RB", "RB", "Fee Fraud", "Under Process", "High", 85, 15)
        cb = _add_complaint(0, "PGRC", "PGRC", "Admission Irregularity", "Under Process", "Medium", 60, 25)
        overlap_pairs.append((ca, cb, f"Exact match on AICTE Permanent ID: {inst_objs[0].permanent_id}"))

        # Pair 2: Shivalik College of Engineering  (fuzzy name in description)
        ca = _add_complaint(2, "RB", "RB", "Infrastructure", "Under Process", "High", 70, 20,
                            description_override="Shivalik College of Engineering, Dehradun: laboratories not meeting AICTE infrastructure norms. Outdated equipment and no licensed CAD software in mechanical workshop.")
        cb = _add_complaint(2, "PGRC", "PGRC", "Faculty Shortage", "Pending", "Medium", 30, 40,
                            description_override="Shivalik College of Engg., Dehradun: students report severe faculty shortage in Computer Science department. Only 2 permanent faculty handling 6 sections.")
        overlap_pairs.append((ca, cb, f"Exact PID match ({inst_objs[2].permanent_id}) + Fuzzy name match: 'Shivalik College of Engg.' ≈ 'Shivalik College of Engineering' (similarity 87%)"))

        # Pair 3: Hyderabad College of Engineering
        ca = _add_complaint(6, "RB", "RB", "Affiliation Violation", "Under Process", "High", 100, 10)
        cb = _add_complaint(6, "PGRC", "PGRC", "Harassment", "Under Process", "High", 55, 30)
        overlap_pairs.append((ca, cb, f"Exact match on AICTE Permanent ID: {inst_objs[6].permanent_id}"))

        # Pair 4: Kolkata Institute of Technology (fuzzy name in description)
        ca = _add_complaint(10, "RB", "RB", "Infrastructure", "Under Process", "Medium", 90, -5,
                            description_override="Kolkata Institute of Technology, Howrah: computer labs running on 8-year-old hardware. Library digital subscriptions lapsed.")
        cb = _add_complaint(10, "PGRC", "PGRC", "Fee Fraud", "Pending", "High", 25, 35,
                            description_override="Kolkata Inst. of Tech.: parents allege hidden hostel charges and non-issuance of fee receipts for last two semesters.")
        overlap_pairs.append((ca, cb, f"Exact PID match ({inst_objs[10].permanent_id}) + Fuzzy name match: 'Kolkata Inst. of Tech.' ≈ 'Kolkata Institute of Technology' (similarity 78%)"))

        # Pair 5: Pune Institute of Technology
        ca = _add_complaint(16, "RB", "RB", "Admission Irregularity", "Under Process", "Medium", 65, 20)
        cb = _add_complaint(16, "PGRC", "PGRC", "Faculty Shortage", "Under Process", "High", 40, 30)
        overlap_pairs.append((ca, cb, f"Exact match on AICTE Permanent ID: {inst_objs[16].permanent_id}"))

        print(f"   [OK] {len(overlap_pairs)} overlap pairs ({len(overlap_pairs) * 2} complaints)")

        # ──────────────────────────────────────────────────────────────────
        # OVERDUE CASES  (8 complaints – expected_disposal in the past)
        # ──────────────────────────────────────────────────────────────────
        overdue_specs = [
            #  inst_idx, src_bureau, category,               status,          priority, recv_days_ago, disposal_offset
            (1,  "RB",       "Faculty Shortage",      "Under Process", "High",   150, -20),
            (3,  "PGRC",     "Fee Fraud",             "Pending",       "High",   120, -15),
            (5,  "RB",       "Affiliation Violation", "Under Process", "Medium", 140, -30),
            (8,  "PGRC",     "Admission Irregularity","Under Process", "High",   130, -10),
            (11, "RB",       "Infrastructure",        "Escalated",     "High",   160, -45),
            (14, "APPROVAL", "Affiliation Violation", "Under Process", "Medium", 110, -8),
            (18, "PGRC",     "Harassment",            "Escalated",     "High",   170, -35),
            (21, "APPROVAL", "Infrastructure",        "Pending",       "Medium", 100, -5),
        ]
        for inst_idx, src, cat, st, pri, recv, disp in overdue_specs:
            _add_complaint(inst_idx, src, None, cat, st, pri, recv, disp)
        print(f"   [OK] {len(overdue_specs)} overdue complaints created")

        # ──────────────────────────────────────────────────────────────────
        # APPROACHING DEADLINE  (3 complaints – disposal within 7 days)
        # ──────────────────────────────────────────────────────────────────
        approaching_specs = [
            (4,  "RB",       "Fee Fraud",        "Under Process", "Medium", 50, 3),
            (9,  "PGRC",     "Faculty Shortage",  "Under Process", "High",   45, 5),
            (19, "APPROVAL", "Infrastructure",    "Pending",       "Medium", 55, 2),
        ]
        for inst_idx, src, cat, st, pri, recv, disp in approaching_specs:
            _add_complaint(inst_idx, src, None, cat, st, pri, recv, disp)
        print(f"   [OK] {len(approaching_specs)} approaching-deadline complaints created")

        # ──────────────────────────────────────────────────────────────────
        # REGULAR CASES  (fill to ~60 total)
        # ──────────────────────────────────────────────────────────────────
        # We already have 10 (overlap) + 8 (overdue) + 3 (approaching) = 21 complaints.
        # We need 39 more to reach exactly 60 complaints.
        
        # Consistent single-bureau assignments for the 20 non-overlap institutions:
        INST_BUREAU = {
            1: "RB",        # Guru Nanak Engineering College (has overdue in RB)
            3: "PGRC",      # Rajasthan School of Management (has overdue in PGRC)
            4: "RB",        # Lucknow Institute of Pharmacy (has approaching in RB)
            5: "RB",        # Chennai Institute of Technology (has overdue in RB)
            7: "APPROVAL",  # Bangalore School of Architecture
            8: "PGRC",      # Kerala Institute of Management Studies (has overdue in PGRC)
            9: "PGRC",      # Sri Venkateswara College of Pharmacy (has approaching in PGRC)
            11: "RB",       # Bhubaneswar Engineering College (has overdue in RB)
            12: "APPROVAL", # Patna College of Management
            13: "RB",       # Guwahati Institute of Pharmacy
            14: "APPROVAL", # Ranchi Institute of Technology (has overdue in APPROVAL)
            15: "PGRC",     # Mumbai College of Engineering
            17: "APPROVAL", # Ahmedabad School of Management
            18: "PGRC",     # Goa College of Architecture (has overdue in PGRC)
            19: "APPROVAL", # Nagpur Institute of Pharmacy (has approaching in APPROVAL)
            20: "RB",       # Bhopal Engineering College
            21: "APPROVAL", # Indore Institute of Management (has overdue in APPROVAL)
            22: "RB",       # Jabalpur College of Engineering
            23: "PGRC",     # Raipur School of Pharmacy
            24: "APPROVAL", # Gwalior Institute of Technology
        }
        overlap_inst_indices = {0, 2, 6, 10, 16}

        status_weights = ["Pending"] * 6 + ["Under Process"] * 10 + ["Disposed"] * 8 + ["Transferred"] * 2 + ["Escalated"] * 2
        priority_weights = ["High"] * 3 + ["Medium"] * 5 + ["Low"] * 2

        regular_specs = []
        
        # Live demo transfer candidates: non-overlapping institutions with 2 active cases in the same bureau
        # 1. Guru Nanak Engineering College (inst 1) - 2 active in RB (transfer to PGRC creates overlap)
        regular_specs.append((1, "RB", "Admission Irregularity", "Under Process", "Medium", 40))
        # 2. Lucknow Institute of Pharmacy (inst 4) - 2 active in RB (transfer to PGRC creates overlap)
        regular_specs.append((4, "RB", "Faculty Shortage", "Under Process", "High", 65))
        # 3. Chennai Institute of Technology (inst 5) - 2 active in RB (transfer to PGRC creates overlap)
        regular_specs.append((5, "RB", "Infrastructure", "Under Process", "Medium", 55))
        # 4. Rajasthan School of Management (inst 3) - 2 active in PGRC (transfer to RB creates overlap)
        regular_specs.append((3, "PGRC", "Harassment", "Under Process", "High", 45))

        # 2. Add at least one complaint for institutions 7, 12, 13, 15, 17, 20, 22, 23, 24
        unrepresented_non_overlap = [7, 12, 13, 15, 17, 20, 22, 23, 24]
        for idx in unrepresented_non_overlap:
            regular_specs.append((
                idx,
                INST_BUREAU[idx],
                random.choice(CATEGORIES),
                random.choice(status_weights),
                random.choice(priority_weights),
                random.randint(20, 150),
            ))

        # 3. Fill the remaining needed complaints (39 - len(regular_specs))
        non_overlap_indices = list(INST_BUREAU.keys())
        while len(regular_specs) < 39:
            idx = random.choice(non_overlap_indices)
            regular_specs.append((
                idx,
                INST_BUREAU[idx],
                random.choice(CATEGORIES),
                random.choice(status_weights),
                random.choice(priority_weights),
                random.randint(15, 160),
            ))

        for inst_idx, src, cat, st, pri, recv in regular_specs:
            if st == "Disposed":
                disp_offset = -random.randint(5, 30)
            else:
                disp_offset = random.randint(10, 60)
            _add_complaint(inst_idx, src, None, cat, st, pri, recv, disp_offset)

        print(f"   [OK] {len(regular_specs)} regular complaints created (Total complaints: {len(all_complaints)})")

        db.commit()

        # ──────────────────────────────────────────────────────────────────
        # OVERLAP DETECTION SCAN (Auto-run)
        # ──────────────────────────────────────────────────────────────────
        scan_overlaps(db)

        # ── Summary ──────────────────────────────────────────────────────
        total_complaints = len(all_complaints)
        total_actions = sum(
            1 for _ in db.query(ActionHistory).all()
        )
        print(f"\n[DONE] Seeding complete!")
        print(f"   Bureaus:       {len(BUREAUS)}")
        print(f"   Officers:      {len(officer_objs)}")
        print(f"   Institutions:  {len(inst_objs)}")
        print(f"   Complaints:    {total_complaints}")
        print(f"   Action logs:   {total_actions}")
        print(f"   Overlap links: {len(overlap_pairs)}")

    except Exception as exc:
        db.rollback()
        print(f"\n[ERROR] Seeding failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
