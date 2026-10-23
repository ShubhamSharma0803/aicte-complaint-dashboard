# AICTE Integrated Institution Complaint Monitoring & Status Dashboard

## 1. Project Overview & Vision
The **Integrated Institution Complaint Monitoring and Status Dashboard** is a unified single-window intelligence and tracking platform designed for the **All India Council for Technical Education (AICTE)**. 

It eliminates administrative silos between key AICTE bureaus—primarily the **Regulation Bureau (RB)** and the **Public Grievance Redressal Cell (PGRC)**, along with Approval and Policy bureaus—by providing real-time transparency into complaints filed against technical institutions across India.

---

## 2. Problem Statement
Technical institutions across India frequently receive complaints from students, faculty, whistleblowers, and citizen groups. Under the existing decentralized structure:
- Complaints are routed into separate bureau silos (RB handles regulatory non-compliance, PGRC handles citizen/student grievances, Approvals handles affiliation/infrastructure issues).
- Neither bureau has automated real-time visibility into active proceedings in the other bureau.
- **Consequences:** Duplicate investigations, inconsistent/conflicting council directives, uncoordinated campus inspections, extended turnaround times, and lack of institutional accountability.

---

## 3. Core Objectives & Key Capabilities

1. **Unified Single-Window Dashboard**: Centralized repository of all institution-related complaints across all bureaus and cells.
2. **Bureau & Officer Accountability**: Immediate visibility into which Bureau/Cell and specific designated officer is handling each active case.
3. **End-to-End Status & Movement Tracking**: Chronological case journey tracking, including action logs, internal bureau transfers, and senior leadership escalations.
4. **Key Innovation: Cross-Bureau Overlap Detection**:
   - Automated detection when multiple bureaus (e.g., RB and PGRC) handle concurrent cases for the same institution.
   - Dual-layer matching algorithm:
     - Exact match on **AICTE Permanent Institute ID** (PID).
     - Normalized fuzzy string matching on **Institution Names** (handling variations, typos, acronyms).
   - High-priority banner/badge: `"Potential Overlapping Cases – Coordination Required"`.
   - Ability to link, cross-reference, and synchronize notes between related overlapping cases.
5. **Lifecycle & SLA Monitoring**:
   - Status classifications: `Pending`, `Under Process`, `Disposed`, `Transferred`, `Escalated`.
   - Automated SLA tracking: Overdue notices, cases approaching deadline (within 7 days), and ageing metrics.
6. **Multi-Dimensional Search & Filtering**:
   - Instant search across Institution Name, AICTE Permanent ID, Case ID, Bureau, Region (Northern, Western, Southern, etc.), Category, Status, and Date Range.
7. **Executive Analytics & Reporting**:
   - Visual charts (Chart.js): Bureau-wise volume, Region-wise heatmaps/distribution, Category breakdown, Ageing analysis, and Bureau Disposal Rates.
   - 1-click CSV export for offline analysis and board meetings.
8. **Role-Based Perspectives (Demo Persona Switcher)**:
   - Simplified persona selector: `View as: Regulation Bureau (RB)`, `Public Grievance Redressal Cell (PGRC)`, or `Admin / Council Leadership`.

---

## 4. Key Data Schema per Complaint
Each complaint record encapsulates:
- **Case Identification**: Case ID (e.g., `AICTE-RB-2026-001`, `AICTE-PGRC-2026-014`), AICTE Permanent Institute ID (PID).
- **Institution Profile**: Institute Name, State, Region, Institute Category (Engineering, Management, Pharmacy, etc.).
- **Complaint Attributes**: Date Received, Subject / Category (Fee Fraud, Faculty Harassment, Infrastructure Deficiencies, Ragging, Unapproved Courses, etc.), Priority.
- **Workflow & Ownership**: Current Bureau (RB / PGRC / Approval), Assigned Handling Officer, Status (`Pending`, `Under Process`, `Disposed`, `Transferred`, `Escalated`).
- **Timeline & SLA**: Last Action Taken, Last Action Date, Next Scheduled Action, Expected Disposal / SLA Deadline Date, Age in Days.
- **Chronological Action History**: Audit trail containing timestamped remarks, officer notes, document references, and inter-bureau transfer notes.
- **Overlap & Linkage**: Flagged Overlap Status, Linked Overlap Case IDs, Officer Coordination Remarks.

---

## 5. Technology Stack & Prototype Constraints
Designed for rapid local deployment, stability, and high demo impact:
- **Backend**: Python 3.10+ with **FastAPI** and **SQLite** (single-command run, zero external database setup).
- **Frontend**: Clean modern UI using semantic HTML5, **Tailwind CSS (CDN)**, and **Chart.js (CDN)**, served directly via FastAPI static/template routes.
- **Matching Engine**: Python-based exact PID lookup + rapid fuzzy string matching (e.g., Levenshtein / RapidFuzz / Difflib).
- **Data Seeding**: Pre-loaded realistic Indian technical institution data (featuring deliberate RB/PGRC overlapping cases to showcase the core innovation).
- **Zero Heavy Tooling**: No Node/npm, no Docker dependencies, no complex auth walls—streamlined for an effortless, fail-safe live presentation.
