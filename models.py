"""
SQLAlchemy ORM models for the AICTE Complaint Monitoring Dashboard.
"""

from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, ForeignKey,
)
from sqlalchemy.orm import relationship

from database import Base


# ---------------------------------------------------------------------------
# Institution
# ---------------------------------------------------------------------------
class Institution(Base):
    __tablename__ = "institutions"

    id = Column(Integer, primary_key=True, index=True)
    permanent_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    city = Column(String, nullable=False)
    state = Column(String, nullable=False)
    region = Column(String, nullable=False)            # Northern / Southern / Eastern / Western / Central
    institute_category = Column(String, nullable=False) # Engineering / Management / Pharmacy / Architecture

    complaints = relationship("Complaint", back_populates="institution")


# ---------------------------------------------------------------------------
# Bureau
# ---------------------------------------------------------------------------
class Bureau(Base):
    __tablename__ = "bureaus"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)

    officers = relationship("Officer", back_populates="bureau")


# ---------------------------------------------------------------------------
# Officer
# ---------------------------------------------------------------------------
class Officer(Base):
    __tablename__ = "officers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    bureau_id = Column(Integer, ForeignKey("bureaus.id"), nullable=False)

    bureau = relationship("Bureau", back_populates="officers")


# ---------------------------------------------------------------------------
# Complaint
# ---------------------------------------------------------------------------
class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String, unique=True, nullable=False, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id"), nullable=False)
    source_bureau_id = Column(Integer, ForeignKey("bureaus.id"), nullable=False)
    current_bureau_id = Column(Integer, ForeignKey("bureaus.id"), nullable=False)
    assigned_officer_id = Column(Integer, ForeignKey("officers.id"), nullable=True)
    category = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="Pending")
    priority = Column(String, nullable=False, default="Medium")
    received_date = Column(Date, nullable=False)
    last_action_date = Column(Date, nullable=True)
    last_action_taken = Column(String, nullable=True)
    next_action_required = Column(String, nullable=True)
    expected_disposal_date = Column(Date, nullable=True)

    institution = relationship("Institution", back_populates="complaints")
    source_bureau = relationship("Bureau", foreign_keys=[source_bureau_id])
    current_bureau = relationship("Bureau", foreign_keys=[current_bureau_id])
    assigned_officer = relationship("Officer", foreign_keys=[assigned_officer_id])
    action_history = relationship(
        "ActionHistory",
        back_populates="complaint",
        order_by="ActionHistory.action_date",
    )


# ---------------------------------------------------------------------------
# ActionHistory
# ---------------------------------------------------------------------------
class ActionHistory(Base):
    __tablename__ = "action_history"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    action_date = Column(DateTime, nullable=False)
    bureau_id = Column(Integer, ForeignKey("bureaus.id"), nullable=False)
    officer_id = Column(Integer, ForeignKey("officers.id"), nullable=True)
    action_type = Column(String, nullable=False)  # Received / Assigned / Remark / Transferred / Escalated / Disposed
    remarks = Column(Text, nullable=True)

    complaint = relationship("Complaint", back_populates="action_history")
    bureau = relationship("Bureau")
    officer = relationship("Officer")


# ---------------------------------------------------------------------------
# OverlapLink
# ---------------------------------------------------------------------------
class OverlapLink(Base):
    __tablename__ = "overlap_links"

    id = Column(Integer, primary_key=True, index=True)
    complaint_a_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    complaint_b_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    match_reason = Column(String, nullable=False)
    confidence_score = Column(Integer, nullable=False, default=100)
    status = Column(String, nullable=False, default="Open")  # Open / Reviewed
    coordination_remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)

    complaint_a = relationship("Complaint", foreign_keys=[complaint_a_id])
    complaint_b = relationship("Complaint", foreign_keys=[complaint_b_id])
