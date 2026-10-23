"""
AICTE Integrated Institution Complaint Monitoring Dashboard – FastAPI backend.
Run:  uvicorn main:app --reload
"""

import csv
from datetime import date, datetime, timedelta
import io
from typing import Optional

from fastapi import FastAPI, Depends, Query, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from database import get_db, SessionLocal
from models import Institution, Bureau, Officer, Complaint, ActionHistory, OverlapLink
from overlap import scan_overlaps

# ═══════════════════════════════════════════════════════════════════════════
# App setup
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="AICTE Complaint Monitoring Dashboard",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
def on_startup():
    """Auto-run overlap scan at startup to ensure all active cases are cross-referenced."""
    db = SessionLocal()
    try:
        scan_overlaps(db)
    except Exception as e:
        print(f"[STARTUP] Overlap scan error: {e}")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════
# Pydantic Request Models
# ═══════════════════════════════════════════════════════════════════════════

class ReviewOverlapRequest(BaseModel):
    coordination_remarks: str
    status: str = "Reviewed"


class ManualLinkRequest(BaseModel):
    complaint_a_id: int
    complaint_b_id: int
    remarks: Optional[str] = None


class ComplaintActionRequest(BaseModel):
    action_type: str  # Remark / Transferred / Escalated / Disposed / Assigned
    bureau_code: Optional[str] = None  # required for Transferred
    officer_id: Optional[int] = None
    remarks: Optional[str] = ""


# ═══════════════════════════════════════════════════════════════════════════
# Helper: Preload Overlaps Map
# ═══════════════════════════════════════════════════════════════════════════

def _get_overlap_case_map(db: Session, only_open: bool = False) -> dict[int, list[str]]:
    """Returns mapping: complaint_id -> list of linked complaint case_ids."""
    query = db.query(OverlapLink).options(
        joinedload(OverlapLink.complaint_a),
        joinedload(OverlapLink.complaint_b),
    )
    if only_open:
        query = query.filter(OverlapLink.status == "Open")
    links = query.all()

    overlap_map: dict[int, list[str]] = {}
    for l in links:
        if l.complaint_a and l.complaint_b:
            cid_a = l.complaint_a_id
            cid_b = l.complaint_b_id
            code_a = l.complaint_a.case_id
            code_b = l.complaint_b.case_id

            overlap_map.setdefault(cid_a, [])
            if code_b not in overlap_map[cid_a]:
                overlap_map[cid_a].append(code_b)

            overlap_map.setdefault(cid_b, [])
            if code_a not in overlap_map[cid_b]:
                overlap_map[cid_b].append(code_a)

    return overlap_map


# ═══════════════════════════════════════════════════════════════════════════
# Serialisation helpers
# ═══════════════════════════════════════════════════════════════════════════

def _serialize_complaint(c: Complaint, overlap_map: Optional[dict[int, list[str]]] = None) -> dict:
    today = date.today()
    linked_cases = (overlap_map.get(c.id, []) if overlap_map is not None else [])
    return {
        "id": c.id,
        "case_id": c.case_id,
        "institution_id": c.institution_id,
        "institution_name": c.institution.name if c.institution else None,
        "institution_permanent_id": c.institution.permanent_id if c.institution else None,
        "institute_category": c.institution.institute_category if c.institution else None,
        "region": c.institution.region if c.institution else None,
        "category": c.category,
        "description": c.description,
        "status": c.status,
        "priority": c.priority,
        "source_bureau": c.source_bureau.code if c.source_bureau else None,
        "current_bureau": c.current_bureau.code if c.current_bureau else None,
        "assigned_officer": c.assigned_officer.name if c.assigned_officer else None,
        "assigned_officer_id": c.assigned_officer_id,
        "received_date": c.received_date.isoformat() if c.received_date else None,
        "last_action_date": c.last_action_date.isoformat() if c.last_action_date else None,
        "last_action_taken": c.last_action_taken,
        "next_action_required": c.next_action_required,
        "expected_disposal_date": c.expected_disposal_date.isoformat() if c.expected_disposal_date else None,
        "age_in_days": (today - c.received_date).days if c.received_date else None,
        "has_overlap": len(linked_cases) > 0,
        "linked_case_ids": linked_cases,
    }


def _serialize_action(a: ActionHistory) -> dict:
    return {
        "id": a.id,
        "action_date": a.action_date.isoformat() if a.action_date else None,
        "bureau": a.bureau.code if a.bureau else None,
        "officer": a.officer.name if a.officer else None,
        "action_type": a.action_type,
        "remarks": a.remarks,
    }


def _serialize_institution(inst: Institution) -> dict:
    return {
        "id": inst.id,
        "permanent_id": inst.permanent_id,
        "name": inst.name,
        "address": inst.address,
        "city": inst.city,
        "state": inst.state,
        "region": inst.region,
        "institute_category": inst.institute_category,
    }


def _serialize_overlap(link: OverlapLink) -> dict:
    ca = link.complaint_a
    cb = link.complaint_b
    return {
        "id": link.id,
        "complaint_a": {
            "id": ca.id,
            "case_id": ca.case_id,
            "bureau": ca.current_bureau.code if ca.current_bureau else None,
            "officer": ca.assigned_officer.name if ca.assigned_officer else None,
            "status": ca.status,
            "institution_name": ca.institution.name if ca.institution else None,
            "permanent_id": ca.institution.permanent_id if ca.institution else None,
        } if ca else None,
        "complaint_b": {
            "id": cb.id,
            "case_id": cb.case_id,
            "bureau": cb.current_bureau.code if cb.current_bureau else None,
            "officer": cb.assigned_officer.name if cb.assigned_officer else None,
            "status": cb.status,
            "institution_name": cb.institution.name if cb.institution else None,
            "permanent_id": cb.institution.permanent_id if cb.institution else None,
        } if cb else None,
        "institution_name": ca.institution.name if (ca and ca.institution) else (cb.institution.name if (cb and cb.institution) else None),
        "permanent_id": ca.institution.permanent_id if (ca and ca.institution) else (cb.institution.permanent_id if (cb and cb.institution) else None),
        "match_reason": link.match_reason,
        "confidence_score": link.confidence_score,
        "status": link.status,
        "coordination_remarks": link.coordination_remarks,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Root – SPA entry point
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/", response_class=FileResponse)
def root():
    return FileResponse("static/index.html")


# ═══════════════════════════════════════════════════════════════════════════
# GET /api/meta
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/meta")
def get_meta(db: Session = Depends(get_db)):
    bureaus = db.query(Bureau).order_by(Bureau.code).all()
    officers = db.query(Officer).order_by(Officer.name).all()
    return {
        "bureaus": [{"id": b.id, "code": b.code, "name": b.name} for b in bureaus],
        "officers": [{"id": o.id, "name": o.name, "bureau_id": o.bureau_id, "bureau_code": o.bureau.code} for o in officers],
        "regions": ["Northern", "Southern", "Eastern", "Western", "Central"],
        "categories": [
            "Fee Fraud", "Faculty Shortage", "Infrastructure",
            "Affiliation Violation", "Admission Irregularity", "Harassment",
        ],
        "statuses": ["Pending", "Under Process", "Disposed", "Transferred", "Escalated"],
        "priorities": ["High", "Medium", "Low"],
    }


# ═══════════════════════════════════════════════════════════════════════════
# GET /api/officers
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/officers")
def list_officers(
    bureau: Optional[str] = Query(None, description="Filter by bureau code (RB, PGRC, APPROVAL)"),
    db: Session = Depends(get_db),
):
    query = db.query(Officer).join(Bureau)
    if bureau:
        query = query.filter(Bureau.code == bureau)
    officers = query.order_by(Officer.name).all()
    return [
        {
            "id": o.id,
            "name": o.name,
            "bureau_id": o.bureau_id,
            "bureau_code": o.bureau.code if o.bureau else None,
        }
        for o in officers
    ]


# ═══════════════════════════════════════════════════════════════════════════
# Institutions
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/institutions")
def list_institutions(
    q: Optional[str] = Query(None, description="Search by name or permanent_id"),
    db: Session = Depends(get_db),
):
    query = db.query(Institution)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Institution.name.ilike(pattern),
                Institution.permanent_id.ilike(pattern),
            )
        )
    institutions = query.order_by(Institution.name).all()

    # Get open overlap links to calculate overlap flags
    open_overlaps = db.query(OverlapLink).filter(OverlapLink.status == "Open").all()
    open_overlap_cids = set()
    for ol in open_overlaps:
        open_overlap_cids.add(ol.complaint_a_id)
        open_overlap_cids.add(ol.complaint_b_id)

    # Pre-fetch complaints grouped by institution
    all_complaints = (
        db.query(Complaint)
        .options(joinedload(Complaint.current_bureau))
        .all()
    )
    comps_by_inst: dict[int, list[Complaint]] = {}
    for c in all_complaints:
        comps_by_inst.setdefault(c.institution_id, []).append(c)

    results = []
    for inst in institutions:
        data = _serialize_institution(inst)
        inst_comps = comps_by_inst.get(inst.id, [])
        data["total_complaints"] = len(inst_comps)
        data["active_complaints"] = sum(1 for c in inst_comps if c.status != "Disposed")
        data["disposed_complaints"] = sum(1 for c in inst_comps if c.status == "Disposed")
        data["has_overlap"] = any(c.id in open_overlap_cids for c in inst_comps)
        data["active_bureaus"] = sorted(list({
            c.current_bureau.code for c in inst_comps
            if c.status != "Disposed" and c.current_bureau
        }))
        results.append(data)

    return results


@app.get("/api/institutions/{institution_id}")
def get_institution(institution_id: int, db: Session = Depends(get_db)):
    inst = db.query(Institution).filter(Institution.id == institution_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")

    overlap_map = _get_overlap_case_map(db)
    complaints = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.source_bureau),
            joinedload(Complaint.current_bureau),
            joinedload(Complaint.assigned_officer),
            joinedload(Complaint.institution),
        )
        .filter(Complaint.institution_id == institution_id)
        .order_by(Complaint.received_date.desc())
        .all()
    )

    open_overlaps = db.query(OverlapLink).filter(OverlapLink.status == "Open").all()
    open_overlap_cids = set()
    for ol in open_overlaps:
        open_overlap_cids.add(ol.complaint_a_id)
        open_overlap_cids.add(ol.complaint_b_id)

    total_c = len(complaints)
    active_c = sum(1 for c in complaints if c.status != "Disposed")
    disposed_c = total_c - active_c
    open_ol_count = sum(1 for c in complaints if c.id in open_overlap_cids)

    # Bureau involvement
    bureau_active_map: dict[str, int] = {}
    cat_counts: dict[str, int] = {}
    for c in complaints:
        cat_counts[c.category] = cat_counts.get(c.category, 0) + 1
        if c.status != "Disposed" and c.current_bureau:
            b_code = c.current_bureau.code
            bureau_active_map[b_code] = bureau_active_map.get(b_code, 0) + 1

    active_bureaus = [{"code": k, "count": v} for k, v in sorted(bureau_active_map.items())]

    result = _serialize_institution(inst)
    result["complaints"] = [_serialize_complaint(c, overlap_map) for c in complaints]
    result["stats"] = {
        "total": total_c,
        "active": active_c,
        "disposed": disposed_c,
        "open_overlaps": open_ol_count,
        "active_bureaus": active_bureaus,
        "has_cross_bureau_overlap": len(active_bureaus) > 1 or open_ol_count > 0,
        "by_category": cat_counts,
    }
    return result


# ═══════════════════════════════════════════════════════════════════════════
# Complaints
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/complaints")
def list_complaints(
    q: Optional[str] = Query(None, description="Search case_id, institution name, or permanent_id"),
    bureau: Optional[str] = Query(None, description="Filter by CURRENT handling bureau code"),
    source_bureau: Optional[str] = Query(None, description="Filter by ORIGINATING bureau code"),
    region: Optional[str] = Query(None, description="Filter by region"),
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[str] = Query(None, description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    date_from: Optional[str] = Query(None, description="Received date >= (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Received date <= (YYYY-MM-DD)"),
    overdue: Optional[bool] = Query(None, description="Only overdue cases"),
    approaching_deadline: Optional[bool] = Query(None, description="Disposal within 7 days"),
    has_overlap: Optional[bool] = Query(None, description="Only cases with active cross-bureau overlap"),
    sort: Optional[str] = Query("received_desc", description="Sort order: age_desc, deadline_asc, received_desc"),
    limit: Optional[int] = Query(None, ge=1, description="Pagination limit"),
    offset: Optional[int] = Query(None, ge=0, description="Pagination offset"),
    response: Response = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.institution),
            joinedload(Complaint.source_bureau),
            joinedload(Complaint.current_bureau),
            joinedload(Complaint.assigned_officer),
        )
    )

    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Complaint.case_id.ilike(pattern),
                Complaint.institution.has(Institution.name.ilike(pattern)),
                Complaint.institution.has(Institution.permanent_id.ilike(pattern)),
            )
        )

    if bureau:
        query = query.filter(Complaint.current_bureau.has(Bureau.code == bureau))
    if source_bureau:
        query = query.filter(Complaint.source_bureau.has(Bureau.code == source_bureau))
    if region:
        query = query.filter(Complaint.institution.has(Institution.region == region))
    if category:
        query = query.filter(Complaint.category == category)
    if status:
        query = query.filter(Complaint.status == status)
    if priority:
        query = query.filter(Complaint.priority == priority)

    if date_from:
        query = query.filter(Complaint.received_date >= date_from)
    if date_to:
        query = query.filter(Complaint.received_date <= date_to)

    today = date.today()
    if overdue:
        query = query.filter(
            Complaint.expected_disposal_date < today,
            Complaint.status != "Disposed",
        )

    if approaching_deadline:
        deadline = today + timedelta(days=7)
        query = query.filter(
            Complaint.expected_disposal_date >= today,
            Complaint.expected_disposal_date <= deadline,
            Complaint.status != "Disposed",
        )

    overlap_map = _get_overlap_case_map(db)

    if has_overlap:
        open_overlap_ids = list(overlap_map.keys())
        query = query.filter(Complaint.id.in_(open_overlap_ids))

    # Sorting
    if sort == "age_desc":
        query = query.order_by(Complaint.received_date.asc())  # oldest received date = highest age
    elif sort == "deadline_asc":
        query = query.order_by(Complaint.expected_disposal_date.asc())
    else:  # received_desc
        query = query.order_by(Complaint.received_date.desc())

    total_count = query.count()
    if response:
        response.headers["X-Total-Count"] = str(total_count)

    if offset is not None:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    complaints = query.all()
    return [_serialize_complaint(c, overlap_map) for c in complaints]


@app.get("/api/complaints/{complaint_id}")
def get_complaint(complaint_id: int, db: Session = Depends(get_db)):
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.institution),
            joinedload(Complaint.source_bureau),
            joinedload(Complaint.current_bureau),
            joinedload(Complaint.assigned_officer),
            joinedload(Complaint.action_history).joinedload(ActionHistory.bureau),
            joinedload(Complaint.action_history).joinedload(ActionHistory.officer),
        )
        .filter(Complaint.id == complaint_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    overlap_map = _get_overlap_case_map(db)
    result = _serialize_complaint(c, overlap_map)
    result["action_history"] = [_serialize_action(a) for a in c.action_history]

    # Explicit overlap links with full linked case details
    links = (
        db.query(OverlapLink)
        .options(
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.current_bureau),
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.assigned_officer),
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.institution),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.current_bureau),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.assigned_officer),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.institution),
        )
        .filter(
            or_(
                OverlapLink.complaint_a_id == complaint_id,
                OverlapLink.complaint_b_id == complaint_id,
            )
        )
        .all()
    )
    result["overlap_links"] = []
    for ol in links:
        other_c = ol.complaint_b if ol.complaint_a_id == complaint_id else ol.complaint_a
        if other_c:
            result["overlap_links"].append({
                "id": ol.id,
                "linked_complaint_id": other_c.id,
                "case_id": other_c.case_id,
                "bureau": other_c.current_bureau.code if other_c.current_bureau else None,
                "officer": other_c.assigned_officer.name if other_c.assigned_officer else "Unassigned",
                "status": other_c.status,
                "match_reason": ol.match_reason,
                "confidence_score": ol.confidence_score,
                "status_link": ol.status,
                "coordination_remarks": ol.coordination_remarks,
                "created_at": ol.created_at.isoformat() if ol.created_at else None,
            })

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Complaints Action Endpoint (Live Demo Workflow)
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/api/complaints/{complaint_id}/action")
def take_action(complaint_id: int, req: ComplaintActionRequest, db: Session = Depends(get_db)):
    c = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    now = datetime.utcnow()
    # Normalize action_type
    raw_action = (req.action_type or "").strip()
    action_map = {
        "Add Remark": "Remark",
        "Remark": "Remark",
        "Transfer to another Bureau": "Transferred",
        "Transfer": "Transferred",
        "Transferred": "Transferred",
        "Escalate": "Escalated",
        "Escalated": "Escalated",
        "Assign Officer": "Assigned",
        "Assign": "Assigned",
        "Assigned": "Assigned",
        "Mark Disposed": "Disposed",
        "Disposed": "Disposed",
    }
    action_type = action_map.get(raw_action, raw_action)
    remarks = req.remarks or f"Action taken: {action_type}"

    # Get set of pre-existing overlap link IDs for this complaint
    pre_existing_link_ids = {
        ol.id for ol in db.query(OverlapLink).filter(
            or_(OverlapLink.complaint_a_id == complaint_id, OverlapLink.complaint_b_id == complaint_id)
        ).all()
    }

    # Bureau handling
    target_bureau_id = c.current_bureau_id
    if action_type == "Transferred":
        if not req.bureau_code:
            raise HTTPException(status_code=400, detail="bureau_code required for Transferred action")
        target_bureau = db.query(Bureau).filter(Bureau.code == req.bureau_code).first()
        if not target_bureau:
            raise HTTPException(status_code=400, detail=f"Bureau code '{req.bureau_code}' not found")
        target_bureau_id = target_bureau.id
        c.current_bureau_id = target_bureau_id
        c.status = "Transferred"
        c.next_action_required = f"Receiving bureau ({req.bureau_code}) to acknowledge and review"
        if req.officer_id:
            c.assigned_officer_id = req.officer_id
        else:
            # Assign first officer in receiving bureau if available
            officer = db.query(Officer).filter(Officer.bureau_id == target_bureau_id).first()
            c.assigned_officer_id = officer.id if officer else None

    elif action_type == "Escalated":
        c.status = "Escalated"
        c.next_action_required = "Senior leadership review and directive required"

    elif action_type == "Disposed":
        c.status = "Disposed"
        c.next_action_required = None

    elif action_type == "Assigned":
        if req.officer_id:
            c.assigned_officer_id = req.officer_id
        if c.status == "Pending":
            c.status = "Under Process"
        c.next_action_required = "Assigned officer to complete investigation"

    elif action_type == "Remark":
        if c.status == "Pending":
            c.status = "Under Process"
        c.next_action_required = "Awaiting compliance / follow-up action"

    c.last_action_taken = remarks
    c.last_action_date = date.today()

    # Append ActionHistory row
    action_entry = ActionHistory(
        complaint_id=c.id,
        action_date=now,
        bureau_id=c.current_bureau_id,
        officer_id=c.assigned_officer_id or req.officer_id,
        action_type=action_type,
        remarks=remarks,
    )
    db.add(action_entry)
    db.commit()

    # Automatically re-run overlap detection scan
    all_links = scan_overlaps(db)

    # Detect new overlaps involving this complaint
    new_overlaps_for_case = []
    for ol in all_links:
        if (ol.complaint_a_id == complaint_id or ol.complaint_b_id == complaint_id) and ol.id not in pre_existing_link_ids:
            other_c = ol.complaint_b if ol.complaint_a_id == complaint_id else ol.complaint_a
            new_overlaps_for_case.append({
                "link_id": ol.id,
                "case_id": other_c.case_id if other_c else "Unknown",
                "institution_name": other_c.institution.name if (other_c and other_c.institution) else "",
                "bureau": other_c.current_bureau.code if (other_c and other_c.current_bureau) else "",
                "match_reason": ol.match_reason,
                "confidence_score": ol.confidence_score,
            })

    return {
        "success": True,
        "complaint_id": c.id,
        "case_id": c.case_id,
        "status": c.status,
        "current_bureau": c.current_bureau.code,
        "last_action_taken": c.last_action_taken,
        "total_active_overlaps": len(all_links),
        "new_overlaps": new_overlaps_for_case,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Demo Reset Endpoint
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/api/demo/reset")
def reset_demo_endpoint():
    from seed import seed
    seed()
    return {"status": "reset"}


# ═══════════════════════════════════════════════════════════════════════════
# Overlap Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/overlaps")
def list_overlaps(status: Optional[str] = Query(None, description="Filter by status (Open/Reviewed)"), db: Session = Depends(get_db)):
    query = (
        db.query(OverlapLink)
        .options(
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.current_bureau),
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.assigned_officer),
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.institution),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.current_bureau),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.assigned_officer),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.institution),
        )
    )
    if status:
        query = query.filter(OverlapLink.status == status)

    links = query.order_by(OverlapLink.created_at.desc()).all()
    return [_serialize_overlap(l) for l in links]


@app.post("/api/overlaps/scan")
def trigger_overlap_scan(db: Session = Depends(get_db)):
    prev_count = db.query(OverlapLink).count()
    all_links = scan_overlaps(db)
    new_found = max(0, len(all_links) - prev_count)
    return {
        "new_overlaps": new_found,
        "total_overlaps": len(all_links),
        "open_overlaps": sum(1 for l in all_links if l.status == "Open"),
    }


@app.post("/api/overlaps/{overlap_id}/review")
def review_overlap(overlap_id: int, req: ReviewOverlapRequest, db: Session = Depends(get_db)):
    link = db.query(OverlapLink).filter(OverlapLink.id == overlap_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Overlap link not found")

    link.status = req.status
    link.coordination_remarks = req.coordination_remarks

    # Write Remark to ActionHistory of BOTH complaints
    now = datetime.utcnow()
    note_text = f"Cross-bureau coordination note added: {req.coordination_remarks}"

    for comp_id in [link.complaint_a_id, link.complaint_b_id]:
        c = db.query(Complaint).filter(Complaint.id == comp_id).first()
        if c:
            act = ActionHistory(
                complaint_id=c.id,
                action_date=now,
                bureau_id=c.current_bureau_id,
                officer_id=c.assigned_officer_id,
                action_type="Remark",
                remarks=note_text,
            )
            db.add(act)
            c.last_action_taken = note_text
            c.last_action_date = date.today()

    db.commit()
    return {"success": True, "overlap_id": link.id, "status": link.status}


@app.post("/api/overlaps/link")
def manual_link_overlap(req: ManualLinkRequest, db: Session = Depends(get_db)):
    ca = db.query(Complaint).filter(Complaint.id == req.complaint_a_id).first()
    cb = db.query(Complaint).filter(Complaint.id == req.complaint_b_id).first()
    if not ca or not cb:
        raise HTTPException(status_code=404, detail="One or both complaints not found")

    cid_a = min(ca.id, cb.id)
    cid_b = max(ca.id, cb.id)

    existing = (
        db.query(OverlapLink)
        .filter(OverlapLink.complaint_a_id == cid_a, OverlapLink.complaint_b_id == cid_b)
        .first()
    )
    if existing:
        return _serialize_overlap(existing)

    link = OverlapLink(
        complaint_a_id=cid_a,
        complaint_b_id=cid_b,
        match_reason="Manual coordination link established",
        confidence_score=100,
        status="Open",
        coordination_remarks=req.remarks,
        created_at=datetime.utcnow(),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _serialize_overlap(link)


# ═══════════════════════════════════════════════════════════════════════════
# Alerts Endpoint
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/alerts")
def get_alerts(db: Session = Depends(get_db)):
    today = date.today()
    alerts = []

    # 1. Overlaps
    open_overlaps = (
        db.query(OverlapLink)
        .options(
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.institution),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.institution),
        )
        .filter(OverlapLink.status == "Open")
        .all()
    )
    for ol in open_overlaps:
        case_pair = f"{ol.complaint_a.case_id} & {ol.complaint_b.case_id}" if ol.complaint_a and ol.complaint_b else "N/A"
        inst_name = ol.complaint_a.institution.name if (ol.complaint_a and ol.complaint_a.institution) else "Unknown"
        alerts.append({
            "type": "Overlap",
            "severity": "High",
            "case_id": case_pair,
            "institution_name": inst_name,
            "message": f"Cross-bureau overlap detected ({ol.match_reason})",
            "date": ol.created_at.strftime("%Y-%m-%d") if ol.created_at else today.isoformat(),
        })

    # Active complaints
    active_complaints = (
        db.query(Complaint)
        .options(joinedload(Complaint.institution))
        .filter(Complaint.status != "Disposed")
        .all()
    )

    for c in active_complaints:
        inst_name = c.institution.name if c.institution else "Unknown"

        # 2. Overdue
        if c.expected_disposal_date and c.expected_disposal_date < today:
            overdue_days = (today - c.expected_disposal_date).days
            alerts.append({
                "type": "Overdue",
                "severity": "High",
                "case_id": c.case_id,
                "institution_name": inst_name,
                "message": f"Case is {overdue_days} days overdue (Target was {c.expected_disposal_date})",
                "date": c.expected_disposal_date.strftime("%Y-%m-%d"),
            })

        # 3. Deadline Approaching
        elif c.expected_disposal_date and today <= c.expected_disposal_date <= (today + timedelta(days=7)):
            days_left = (c.expected_disposal_date - today).days
            alerts.append({
                "type": "Deadline Approaching",
                "severity": "Medium",
                "case_id": c.case_id,
                "institution_name": inst_name,
                "message": f"Disposal deadline in {days_left} days ({c.expected_disposal_date})",
                "date": c.expected_disposal_date.strftime("%Y-%m-%d"),
            })

        # 4. Escalation
        if c.status == "Escalated":
            alerts.append({
                "type": "Escalation",
                "severity": "High",
                "case_id": c.case_id,
                "institution_name": inst_name,
                "message": f"Escalated to council leadership: {c.last_action_taken or 'Urgent attention required'}",
                "date": (c.last_action_date or c.received_date).strftime("%Y-%m-%d"),
            })

        # 5. Long Pending
        if c.status == "Pending" and (today - c.received_date).days > 30:
            age = (today - c.received_date).days
            alerts.append({
                "type": "Long Pending",
                "severity": "Medium",
                "case_id": c.case_id,
                "institution_name": inst_name,
                "message": f"Pending officer assignment for {age} days",
                "date": c.received_date.strftime("%Y-%m-%d"),
            })

    # Sort: High severity first, then date descending
    severity_order = {"High": 1, "Medium": 2, "Low": 3}
    alerts.sort(key=lambda a: (severity_order.get(a["severity"], 99), a["date"]), reverse=False)

    summary = {
        "total": len(alerts),
        "overlap": sum(1 for a in alerts if a["type"] == "Overlap"),
        "overdue": sum(1 for a in alerts if a["type"] == "Overdue"),
        "deadline_approaching": sum(1 for a in alerts if a["type"] == "Deadline Approaching"),
        "escalation": sum(1 for a in alerts if a["type"] == "Escalation"),
        "long_pending": sum(1 for a in alerts if a["type"] == "Long Pending"),
    }

    return {"summary": summary, "alerts": alerts}


# ═══════════════════════════════════════════════════════════════════════════
# Stats Endpoint
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/stats")
def get_stats(bureau: Optional[str] = Query(None, description="Filter stats by handling bureau code"), db: Session = Depends(get_db)):
    today = date.today()

    query = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.institution),
            joinedload(Complaint.current_bureau),
        )
    )

    if bureau:
        query = query.filter(Complaint.current_bureau.has(Bureau.code == bureau))

    complaints = query.all()
    total = len(complaints)

    # Status counts - MUST strictly sum to total
    pending = sum(1 for c in complaints if c.status == "Pending")
    under_process = sum(1 for c in complaints if c.status == "Under Process")
    disposed = sum(1 for c in complaints if c.status == "Disposed")
    transferred = sum(1 for c in complaints if c.status == "Transferred")
    escalated = sum(1 for c in complaints if c.status == "Escalated")

    overdue = sum(1 for c in complaints if c.status != "Disposed" and c.expected_disposal_date and c.expected_disposal_date < today)
    approaching = sum(1 for c in complaints if c.status != "Disposed" and c.expected_disposal_date and today <= c.expected_disposal_date <= today + timedelta(days=7))

    # Overlaps in scope
    overlap_query = db.query(OverlapLink).filter(OverlapLink.status == "Open")
    if bureau:
        overlap_query = overlap_query.join(Complaint, or_(Complaint.id == OverlapLink.complaint_a_id, Complaint.id == OverlapLink.complaint_b_id)).join(Bureau, Bureau.id == Complaint.current_bureau_id).filter(Bureau.code == bureau)
    open_overlaps = overlap_query.distinct().count()

    # By Bureau
    all_bureaus = db.query(Bureau).order_by(Bureau.code).all()
    by_bureau = []
    for b in all_bureaus:
        b_comps = db.query(Complaint).filter(Complaint.current_bureau_id == b.id).all()
        b_total = len(b_comps)
        b_disp = sum(1 for c in b_comps if c.status == "Disposed")
        b_act = b_total - b_disp
        rate = round((b_disp / b_total) * 100, 1) if b_total > 0 else 0.0
        by_bureau.append({
            "code": b.code,
            "name": b.name,
            "total": b_total,
            "active": b_act,
            "disposed": b_disp,
            "disposal_rate": rate,
        })

    # By Region
    region_counts = {"Northern": 0, "Southern": 0, "Eastern": 0, "Western": 0, "Central": 0}
    for c in complaints:
        if c.institution and c.institution.region in region_counts:
            region_counts[c.institution.region] += 1

    # By Category
    category_counts: dict[str, int] = {}
    for c in complaints:
        category_counts[c.category] = category_counts.get(c.category, 0) + 1

    # Ageing (non-disposed only)
    active_in_scope = [c for c in complaints if c.status != "Disposed"]
    ageing = {"0-15": 0, "16-30": 0, "31-60": 0, "60+": 0}
    for c in active_in_scope:
        age = (today - c.received_date).days
        if age <= 15:
            ageing["0-15"] += 1
        elif age <= 30:
            ageing["16-30"] += 1
        elif age <= 60:
            ageing["31-60"] += 1
        else:
            ageing["60+"] += 1

    # Monthly Trend (last 6 months)
    monthly_trend_dict: dict[str, int] = {}
    for i in range(5, -1, -1):
        m_date = today - timedelta(days=i * 30)
        key = m_date.strftime("%Y-%m")
        monthly_trend_dict[key] = 0

    for c in complaints:
        m_key = c.received_date.strftime("%Y-%m")
        if m_key in monthly_trend_dict:
            monthly_trend_dict[m_key] += 1

    monthly_trend = [{"month": k, "count": v} for k, v in sorted(monthly_trend_dict.items())]

    # Top institutions
    inst_counts: dict[int, dict] = {}
    for c in complaints:
        if not c.institution:
            continue
        iid = c.institution.id
        if iid not in inst_counts:
            inst_counts[iid] = {
                "name": c.institution.name,
                "permanent_id": c.institution.permanent_id,
                "count": 0,
                "bureaus": set(),
            }
        inst_counts[iid]["count"] += 1
        if c.current_bureau:
            inst_counts[iid]["bureaus"].add(c.current_bureau.code)

    top_institutions = sorted(inst_counts.values(), key=lambda x: x["count"], reverse=True)[:5]
    for item in top_institutions:
        item["bureaus"] = sorted(list(item["bureaus"]))

    # Avg disposal days
    disposed_comps = [c for c in complaints if c.status == "Disposed" and c.last_action_date]
    if disposed_comps:
        total_disp_days = sum((c.last_action_date - c.received_date).days for c in disposed_comps)
        avg_disp_days = round(total_disp_days / len(disposed_comps), 1)
    else:
        avg_disp_days = 0.0

    return {
        "totals": {
            "total": total,
            "pending": pending,
            "under_process": under_process,
            "disposed": disposed,
            "transferred": transferred,
            "escalated": escalated,
            "overdue": overdue,
            "approaching_deadline": approaching,
            "open_overlaps": open_overlaps,
        },
        "by_bureau": by_bureau,
        "by_region": region_counts,
        "by_category": category_counts,
        "by_status": {
            "Pending": pending,
            "Under Process": under_process,
            "Disposed": disposed,
            "Transferred": transferred,
            "Escalated": escalated,
        },
        "ageing": ageing,
        "monthly_trend": monthly_trend,
        "top_institutions": top_institutions,
        "avg_disposal_days": avg_disp_days,
    }


# ═══════════════════════════════════════════════════════════════════════════
# CSV Reports Endpoints
# ═══════════════════════════════════════════════════════════════════════════

def _csv_response(filename: str, rows: list[list[str]]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/reports/bureau.csv")
def report_bureau_csv(db: Session = Depends(get_db)):
    bureaus = db.query(Bureau).order_by(Bureau.code).all()
    rows = [["Bureau Code", "Bureau Name", "Total Complaints", "Active Complaints", "Disposed Complaints", "Disposal Rate (%)"]]
    for b in bureaus:
        comps = db.query(Complaint).filter(Complaint.current_bureau_id == b.id).all()
        tot = len(comps)
        disp = sum(1 for c in comps if c.status == "Disposed")
        act = tot - disp
        rate = round((disp / tot) * 100, 1) if tot > 0 else 0.0
        rows.append([b.code, b.name, str(tot), str(act), str(disp), f"{rate}%"])
    return _csv_response("aicte_bureau_report.csv", rows)


@app.get("/api/reports/region.csv")
def report_region_csv(db: Session = Depends(get_db)):
    regions = ["Northern", "Southern", "Eastern", "Western", "Central"]
    today = date.today()
    rows = [["Region", "Total Complaints", "Pending", "Under Process", "Disposed", "Transferred", "Escalated", "Overdue"]]
    for r in regions:
        comps = db.query(Complaint).filter(Complaint.institution.has(Institution.region == r)).all()
        tot = len(comps)
        p = sum(1 for c in comps if c.status == "Pending")
        up = sum(1 for c in comps if c.status == "Under Process")
        d = sum(1 for c in comps if c.status == "Disposed")
        t = sum(1 for c in comps if c.status == "Transferred")
        e = sum(1 for c in comps if c.status == "Escalated")
        od = sum(1 for c in comps if c.status != "Disposed" and c.expected_disposal_date and c.expected_disposal_date < today)
        rows.append([r, str(tot), str(p), str(up), str(d), str(t), str(e), str(od)])
    return _csv_response("aicte_region_report.csv", rows)


@app.get("/api/reports/institution.csv")
def report_institution_csv(db: Session = Depends(get_db)):
    insts = db.query(Institution).order_by(Institution.name).all()
    overlap_map = _get_overlap_case_map(db)
    rows = [["AICTE Permanent ID", "Institution Name", "Category", "City", "State", "Region", "Total Complaints", "Active Complaints", "Disposed Complaints", "Has Overlap"]]
    for i in insts:
        comps = db.query(Complaint).filter(Complaint.institution_id == i.id).all()
        tot = len(comps)
        disp = sum(1 for c in comps if c.status == "Disposed")
        act = tot - disp
        has_ol = any(c.id in overlap_map for c in comps)
        rows.append([
            i.permanent_id, i.name, i.institute_category, i.city, i.state, i.region,
            str(tot), str(act), str(disp), "YES" if has_ol else "NO",
        ])
    return _csv_response("aicte_institution_report.csv", rows)


@app.get("/api/reports/ageing.csv")
def report_ageing_csv(db: Session = Depends(get_db)):
    today = date.today()
    active_comps = db.query(Complaint).filter(Complaint.status != "Disposed").all()
    tot_active = len(active_comps)
    buckets = {"0-15 Days": 0, "16-30 Days": 0, "31-60 Days": 0, "60+ Days": 0}
    for c in active_comps:
        age = (today - c.received_date).days
        if age <= 15:
            buckets["0-15 Days"] += 1
        elif age <= 30:
            buckets["16-30 Days"] += 1
        elif age <= 60:
            buckets["31-60 Days"] += 1
        else:
            buckets["60+ Days"] += 1

    rows = [["Ageing Bucket", "Active Complaints", "Percentage (%)"]]
    for k, v in buckets.items():
        pct = round((v / tot_active) * 100, 1) if tot_active > 0 else 0.0
        rows.append([k, str(v), f"{pct}%"])
    return _csv_response("aicte_ageing_report.csv", rows)


@app.get("/api/reports/overlaps.csv")
def report_overlaps_csv(db: Session = Depends(get_db)):
    links = (
        db.query(OverlapLink)
        .options(
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.current_bureau),
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.assigned_officer),
            joinedload(OverlapLink.complaint_a).joinedload(Complaint.institution),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.current_bureau),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.assigned_officer),
            joinedload(OverlapLink.complaint_b).joinedload(Complaint.institution),
        )
        .order_by(OverlapLink.created_at.desc())
        .all()
    )
    rows = [[
        "Overlap ID", "Case ID A", "Bureau A", "Officer A",
        "Case ID B", "Bureau B", "Officer B",
        "Institution Name", "AICTE Permanent ID",
        "Match Reason", "Confidence Score", "Status", "Created At", "Coordination Remarks",
    ]]
    for l in links:
        ca = l.complaint_a
        cb = l.complaint_b
        rows.append([
            str(l.id),
            ca.case_id if ca else "",
            ca.current_bureau.code if (ca and ca.current_bureau) else "",
            ca.assigned_officer.name if (ca and ca.assigned_officer) else "",
            cb.case_id if cb else "",
            cb.current_bureau.code if (cb and cb.current_bureau) else "",
            cb.assigned_officer.name if (cb and cb.assigned_officer) else "",
            ca.institution.name if (ca and ca.institution) else "",
            ca.institution.permanent_id if (ca and ca.institution) else "",
            l.match_reason,
            str(l.confidence_score),
            l.status,
            l.created_at.strftime("%Y-%m-%d %H:%M:%S") if l.created_at else "",
            l.coordination_remarks or "",
        ])
    return _csv_response("aicte_overlaps_report.csv", rows)


@app.get("/api/reports/complaints.csv")
def report_complaints_csv(
    q: Optional[str] = Query(None),
    bureau: Optional[str] = Query(None),
    source_bureau: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    overdue: Optional[bool] = Query(None),
    approaching_deadline: Optional[bool] = Query(None),
    has_overlap: Optional[bool] = Query(None),
    sort: Optional[str] = Query("received_desc"),
    db: Session = Depends(get_db),
):
    comps = list_complaints(
        q=q, bureau=bureau, source_bureau=source_bureau, region=region,
        category=category, status=status, priority=priority,
        date_from=date_from, date_to=date_to, overdue=overdue,
        approaching_deadline=approaching_deadline, has_overlap=has_overlap,
        sort=sort, limit=None, offset=None, db=db,
    )
    today = date.today()
    rows = [[
        "Case ID", "Institution Name", "Permanent ID", "Category", "Priority", "Status",
        "Source Bureau", "Current Bureau", "Assigned Officer",
        "Received Date", "Last Action Date", "Last Action Taken",
        "Next Action Required", "Expected Disposal Date", "Age In Days", "Overdue", "Has Overlap",
    ]]
    for c in comps:
        disp_date = c.get("expected_disposal_date")
        is_overdue = (disp_date and disp_date < today.isoformat() and c.get("status") != "Disposed")
        rows.append([
            c.get("case_id", ""),
            c.get("institution_name", ""),
            c.get("institution_permanent_id", ""),
            c.get("category", ""),
            c.get("priority", ""),
            c.get("status", ""),
            c.get("source_bureau", ""),
            c.get("current_bureau", ""),
            c.get("assigned_officer", ""),
            c.get("received_date", ""),
            c.get("last_action_date", ""),
            c.get("last_action_taken", "") or "",
            c.get("next_action_required", "") or "",
            disp_date or "",
            str(c.get("age_in_days", "")),
            "YES" if is_overdue else "NO",
            "YES" if c.get("has_overlap") else "NO",
        ])
    return _csv_response("aicte_complaints_export.csv", rows)
