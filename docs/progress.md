# Project Progress & Roadmap

## 1. Completed Steps
- [x] Initialized project documentation (`vision.md` aligned with AICTE complaint monitoring context and demo constraints).
- [x] Defined key data schemas, cross-bureau overlap detection logic, and prototype architecture.
- [x] Structured tracking system in `progress.md`.
- [x] **Backend Infrastructure & Schema**:
  - Implemented SQLAlchemy 2.0 SQLite database models (`Institution`, `Bureau`, `Officer`, `Complaint`, `ActionHistory`, `OverlapLink`).
  - Added `confidence_score` (Integer) to `OverlapLink`.
  - Added `institute_category`, complaint `priority`, and overlap `coordination_remarks`.
- [x] **Cross-Bureau Overlap Engine (`overlap.py`)**:
  - Dual-layer detection algorithm:
    - **Layer 1 (Exact)**: Matches active non-disposed complaints for the same institution (same AICTE Permanent ID) handled concurrently across different bureaus (`current_bureau` differs), confidence score 100.
    - **Layer 2 (Fuzzy)**: Employs `rapidfuzz` with custom abbreviation expansion (`engg` -> `engineering`, `inst` -> `institute`, `tech` -> `technology`, `coll` -> `college`, `univ` -> `university`, `mgmt` -> `management`) and filler word removal (`the`, `of`, `and`). Matches name variations in descriptions or differing institutions with similarity >= 88.
  - Idempotent execution (preserves existing links, leaves `Reviewed` links untouched).
  - Auto-runs at end of `seed.py`, app startup, and whenever any case action or transfer occurs.
  - Successfully detects all 5 seeded overlap institutions, including the 2 fuzzy spelling variations (`Kolkata Inst. of Tech.` and `Shivalik College of Engg.`).
- [x] **Case Actions Engine (`POST /api/complaints/{id}/action`)**:
  - Live demo action workflow supporting `Remark`, `Transferred`, `Escalated`, `Disposed`, and `Assigned`.
  - Automatically appends timestamped `ActionHistory` audit entries.
  - Automatically re-runs overlap detection so transferring a case to another bureau live instantly triggers a new overlap alert.
- [x] **Alerts System (`GET /api/alerts`)**:
  - Aggregates categorized alerts (`Overlap`, `Overdue`, `Deadline Approaching`, `Escalation`, `Long Pending`).
  - Prioritized by severity (`High` > `Medium` > `Low`) and date descending.
  - Provides count summary at the root of the response.
- [x] **Executive Analytics & Statistics (`GET /api/stats`)**:
  - Strict accounting: status counts (`Pending`, `Under Process`, `Disposed`, `Transferred`, `Escalated`) strictly sum to total.
  - Breakdown by bureau, region, category, ageing buckets (0-15, 16-30, 31-60, 60+ days), monthly trend (last 6 months), top 5 institutions, and average disposal turnaround time.
  - Supports optional `?bureau=` filtering.
- [x] **CSV Report Export Engine (`/api/reports/*.csv`)**:
  - Generates downloadable CSV files with `Content-Disposition` headers for:
    - `/api/reports/bureau.csv`
    - `/api/reports/region.csv`
    - `/api/reports/institution.csv`
    - `/api/reports/ageing.csv`
    - `/api/reports/overlaps.csv`
    - `/api/reports/complaints.csv` (supports all filtering/sorting options).
- [x] **Filter Clarifications (`GET /api/complaints`)**:
  - Added `?bureau=` (current bureau) vs `?source_bureau=` (originating bureau).
  - Added `?has_overlap=true` filter.
  - Added `?sort=` (`age_desc`, `deadline_asc`, `received_desc`), `?limit=`, and `?offset=`.
  - Enriched complaint serialization with `has_overlap` (bool) and `linked_case_ids` (list).
- [x] **Automated Verification**:
  - Comprehensive automated test suite `test_api.py` verified all requirements:
    - Seeded overlaps for all 5 institutions detected.
    - Live case transfer immediately triggers new overlap.
    - All 6 CSV reports validated.
    - Stats status sums verified against total.

## 2. Current State
- **Stage**: Backend & Intelligence Engine Complete and Verified.
- **Server Status**: FastAPI + Uvicorn server actively running on `http://127.0.0.1:8000`.
- **Database**: SQLite `aicte.db` populated with 60 complaints, 25 institutions, 3 bureaus, 12 officers, and live overlap links.

## 3. API Endpoints Reference

### Overlaps
- `GET /api/overlaps` (Optional `?status=Open` or `?status=Reviewed`)
- `POST /api/overlaps/scan` (Re-run overlap scan)
- `POST /api/overlaps/{id}/review` (Submit coordination remarks and update status)
- `POST /api/overlaps/link` (Manually link two complaints)

### Case Actions
- `POST /api/complaints/{id}/action` (Body: `action_type`, `bureau_code`, `officer_id`, `remarks`)

### Alerts & Analytics
- `GET /api/alerts` (Summary and prioritized alerts list)
- `GET /api/stats` (Optional `?bureau=RB`)

### CSV Exports
- `GET /api/reports/bureau.csv`
- `GET /api/reports/region.csv`
- `GET /api/reports/institution.csv`
- `GET /api/reports/ageing.csv`
- `GET /api/reports/overlaps.csv`
- `GET /api/reports/complaints.csv` (Supports all complaint query parameters)

### Core Data & Filters
- `GET /api/meta`
- `GET /api/institutions` (`?q=`)
- `GET /api/institutions/{id}`
- `GET /api/complaints` (`?q=`, `?bureau=`, `?source_bureau=`, `?region=`, `?category=`, `?status=`, `?priority=`, `?date_from=`, `?date_to=`, `?overdue=true`, `?approaching_deadline=true`, `?has_overlap=true`, `?sort=`, `?limit=`, `?offset=`)
- `GET /api/complaints/{id}`

## 4. How to Run
```bash
# 1. Navigate to dashboard folder
cd aicte-dashboard

# 2. Seed database
py seed.py

# 3. Start Uvicorn server (currently running on port 8000)
py -m uvicorn main:app --port 8000

# 4. Run automated test suite
py test_api.py
```

## 5. Files Created / Modified
- `aicte-dashboard/overlap.py`: Dual-layer cross-bureau overlap detection engine.
- `aicte-dashboard/models.py`: Added `confidence_score` column to `OverlapLink`.
- `aicte-dashboard/seed.py`: Configured designated bureaus for non-overlap institutions and auto-run scan.
- `aicte-dashboard/main.py`: Implemented action endpoint, alerts, stats, overlap endpoints, CSV exports, filter improvements.
- `aicte-dashboard/test_api.py`: Comprehensive automated test suite.
- `progress.md`: Updated roadmap and technical specifications.
- `vision.md`: Kept aligned with product specification.

- [x] **Frontend Single-Page Application (SPA) & Offline Delivery**:
  - Downloaded offline standalone vendor assets to `static/vendor/` (`tailwind.js` and `chart.js`).
  - Zero external dependencies: Uses local system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`), no external fonts or CDN requests.
  - Implemented single-page hash router (`#dashboard`, `#cases`, `#overlaps`, `#alerts`) in `static/app.js`.
  - Configured persona switcher (`Admin`, `RB`, `PGRC`) persisted in `localStorage` with reactive filtering across all statistics and complaint registries.
  - **Dashboard Page**:
    - 8 animated KPI summary cards (`Total`, `Pending`, `Under Process`, `Disposed`, `Transferred`, `Escalated`, `Overdue SLA`, `Open Overlaps`).
    - Prominent cross-bureau overlap alert banner with instant navigation to `#overlaps`.
    - 6 Chart.js responsive analytics charts (Status doughnut, Bureau workload grouped bar, Regional distribution bar, Category breakdown horizontal bar, Ageing analysis bar, 6-Month intake trend line).
    - "Top Institutions by Complaints" and "Recent Critical Alerts" feed.
  - **All Cases Page**:
    - Debounced search across institution name, permanent ID, and case ID.
    - Multi-criteria filters: Bureau, Region, Category, Status, Priority, Date range, Overdue, Approaching deadline, and Overlap checkboxes.
    - Server-side pagination with `X-Total-Count` response header support, limit 15, Prev/Next navigation, and dynamic sorting.
    - Clickable rows launching case detail modal with raw details and audit history.
  - **Overlaps Page**:
    - Side-by-side comparison cards for concurrent complaints across bureaus with confidence score meter.
    - "Why Flagged" match explanation strip.
    - Coordination remarks textarea with live "Mark as Reviewed" action (`POST /api/overlaps/{id}/review`).
    - Live "Re-scan for overlaps" button calling `POST /api/overlaps/scan` with toast feedback.
    - Status tabs (`Open`, `Reviewed`, `All Links`).
  - **Alerts Page**:
    - Alert type chips with count badges for quick filtering.
    - Severity-coded cards with links to case details.
  - Mounted `/static` directory in FastAPI and mapped root route `"/"` to serve `static/index.html`.

## 2. Current State
- **Stage**: Frontend Single-Page Application Complete, Offline-Capable, and Verified.
- **Server Status**: FastAPI + Uvicorn server actively running on `http://127.0.0.1:8000`.
- **Database**: SQLite `aicte.db` populated with 60 complaints, 25 institutions, 3 bureaus, 12 officers, and live overlap links.

## 3. API Endpoints Reference

### Overlaps
- `GET /api/overlaps` (Optional `?status=Open` or `?status=Reviewed`)
- `POST /api/overlaps/scan` (Re-run overlap scan)
- `POST /api/overlaps/{id}/review` (Submit coordination remarks and update status)
- `POST /api/overlaps/link` (Manually link two complaints)

### Case Actions
- `POST /api/complaints/{id}/action` (Body: `action_type`, `bureau_code`, `officer_id`, `remarks`)

### Alerts & Analytics
- `GET /api/alerts` (Summary and prioritized alerts list)
- `GET /api/stats` (Optional `?bureau=RB`)

### CSV Exports
- `GET /api/reports/bureau.csv`
- `GET /api/reports/region.csv`
- `GET /api/reports/institution.csv`
- `GET /api/reports/ageing.csv`
- `GET /api/reports/overlaps.csv`
- `GET /api/reports/complaints.csv` (Supports all complaint query parameters)

### Core Data & Filters
- `GET /api/meta`
- `GET /api/institutions` (`?q=`)
- `GET /api/institutions/{id}`
- `GET /api/complaints` (`?q=`, `?bureau=`, `?source_bureau=`, `?region=`, `?category=`, `?status=`, `?priority=`, `?date_from=`, `?date_to=`, `?overdue=true`, `?approaching_deadline=true`, `?has_overlap=true`, `?sort=`, `?limit=`, `?offset=`)
- `GET /api/complaints/{id}`

## 4. How to Run
```bash
# 1. Navigate to dashboard folder
cd aicte-dashboard

# 2. Seed database (if starting fresh)
py seed.py

# 3. Start Uvicorn server
py -m uvicorn main:app --port 8000 --reload

# 4. Access the offline frontend in browser:
# http://127.0.0.1:8000
```

## 5. Files Created / Modified
- `aicte-dashboard/static/vendor/tailwind.js`: Self-hosted Tailwind Play CDN runtime for 100% offline styling.
- `aicte-dashboard/static/vendor/chart.js`: Self-hosted Chart.js 4.4.1 UMD runtime.
- `aicte-dashboard/static/index.html`: Government portal shell, navigation, modals, and templates.
- `aicte-dashboard/static/style.css`: Government theme styling, badge styles, animation utilities, and custom scrollbars.
- `aicte-dashboard/static/app.js`: SPA engine, hash router, KPI counters, Chart.js instances, paginated table, overlap side-by-side review, and persona switcher.
- `aicte-dashboard/main.py`: Mounted `/static`, served `static/index.html` at `"/"`, exposed `X-Total-Count` in CORS and complaint response headers.
- `aicte-dashboard/overlap.py`: Dual-layer cross-bureau overlap detection engine.
- `aicte-dashboard/models.py`: Database models including `confidence_score` and `coordination_remarks`.
- `aicte-dashboard/seed.py`: Seed data generator.
- `aicte-dashboard/test_api.py`: Automated test suite for backend routes.
- `progress.md`: Updated with frontend status and verification logs.

## 6. Case Detail Drawer, Institution Profile, & Intelligence Reports (Completed)
- [x] **Case Detail Drawer (600px Slide-over)**:
  - Replaced temporary modals across the entire application (cases table rows, overlap cards, alert links, dashboard feeds).
  - Header: Case ID, status badge, priority badge, bureau badge, and red top banner strip (`Potential Overlapping Cases – Coordination Required`) when open overlaps exist.
  - Institution block: Clickable title leading to `#institution/<id>`, Permanent ID, city, state, region, and category badge.
  - Case metadata grid: Category, current bureau, source bureau, assigned officer, received date & age in days, expected disposal date with SLA warning indicators (red badge if overdue, amber badge if within 7 days).
  - Allegations & description block with clean scrollable view.
  - Linked / Overlapping cases panel: Clickable case IDs to instantly switch drawer dossier, bureau badge, officer, "Why Flagged" explanation, confidence score meter, and coordination notes.
  - Vertical action history timeline (newest first, color-coded for transfers [purple], escalations [rose], and disposals [green]).
  - Interactive "Take Action" form at the bottom:
    - Supports `Remark`, `Transferred`, `Escalated`, `Assigned`, `Disposed`.
    - Dynamic receiving bureau select excluding the current bureau.
    - Dynamic officer select via `GET /api/officers?bureau=`.
    - Form submission via `POST /api/complaints/{id}/action`.
    - Live toast notifications: On cross-bureau transfer creating a new overlap, displays:
      `⚠️ New overlap detected with <case_id> – Coordination Required`
    - Seamlessly refreshes drawer timeline and the underlying page.
    - Smooth slide-in/slide-out animations, closed via Escape key or backdrop click.

- [x] **Institution Profile Page (`#institution/<id>`)**:
  - Global navigation item "Institutions" (`#institutions`) with searchable directory of 25 AICTE institutions, complaint counts, active bureaus, and overlap indicators.
  - Profile header card: Full address, permanent ID, category, region.
  - Active Bureau Involvement strip: Lists all bureaus concurrently handling complaints for this institution. Displays a prominent red warning banner (`Potential Overlapping Cases – Coordination Required`) whenever more than one bureau is active or an open overlap exists, with a direct link to `#overlaps`.
  - 4 Key metric cards: Total complaints, Active cases, Disposed cases, Open overlaps.
  - Interactive Chart.js bar chart displaying complaints broken down by category for the institution.
  - Consolidated Complaint History table: All complaints for the institution sorted newest first, clicking any row opens the Case Detail Drawer.

- [x] **Reports & Intelligence Exports Page (`#reports`)**:
  - Top header with instant `window.print()` button.
  - Dedicated print styling via `@media print` in `static/style.css` (clean white page, hides sidebar, buttons, and navigation).
  - 5 Grid report preview cards showing the top rows and direct offline CSV download buttons:
    1. *Bureau-wise Performance* (`/api/reports/bureau.csv`)
    2. *Region-wise Distribution* (`/api/reports/region.csv`)
    3. *Institution-wise Registry* (`/api/reports/institution.csv`)
    4. *Pending Ageing SLA* (`/api/reports/ageing.csv`)
    5. *Overlapping Cases Log* (`/api/reports/overlaps.csv`)
  - Full-width *Complaints Register Export Card*: Top 5 preview table with dynamic interactive filters for Bureau and Status, and a "Download Filtered CSV" button (`/api/reports/complaints.csv?bureau=...&status=...`).
  - Full-width *Monthly Performance Card*: 6-month intake volume trend table, average disposal turnaround time, and bureau resolution efficiency breakdown.

- [x] **Demo Reset & Presentation Script Helpers**:
  - Dedicated `POST /api/demo/reset` backend endpoint reusing `seed.seed()`.
  - Subtle top bar button: "Reset Demo Data" with user confirmation prompt and success toast.
  - Top bar "?" button and global `?` keyboard shortcut launching a 5-step Presentation Walkthrough modal.

## 7. Live Demo Transfer Candidates
The following pre-seeded institutions have 2 active cases in the same bureau (no initial overlap), designed specifically for live presentations to demonstrate real-time cross-bureau overlap detection:

1. **Guru Nanak Engineering College** (Permanent ID: `1-90278402`):
   - **Active Cases in RB**: `AICTE-RB-2026-006` and `AICTE-RB-2026-010`.
   - **Demo Action**: Open drawer for `AICTE-RB-2026-010` -> Action Type: "Transfer to another Bureau" -> Receiving Bureau: "PGRC" -> Submit.
   - **Live Result**: Overlap Engine instantly matches with `AICTE-RB-2026-006`, triggers the red toast notification `⚠️ New overlap detected with AICTE-RB-2026-006 – Coordination Required`, adds a red open overlap strip to the drawer, increments the sidebar badge, and flags the institution profile.

2. **Lucknow Institute of Pharmacy** (Permanent ID: `1-90278405`):
   - **Active Cases in RB**: `AICTE-RB-2026-009` and `AICTE-RB-2026-011`.
   - **Demo Action**: Transfer `AICTE-RB-2026-011` to PGRC.
   - **Live Result**: Triggers overlap with `AICTE-RB-2026-009`.

3. **Chennai Institute of Technology** (Permanent ID: `2-90278406`):
   - **Active Cases in RB**: `AICTE-RB-2026-007` and `AICTE-RB-2026-012`.
   - **Demo Action**: Transfer `AICTE-RB-2026-012` to PGRC.
   - **Live Result**: Triggers overlap with `AICTE-RB-2026-007`.

4. **Rajasthan School of Management** (Permanent ID: `1-90278404`):
   - **Active Cases in PGRC**: `AICTE-PGRC-2026-006` and `AICTE-PGRC-2026-010`.
   - **Demo Action**: Transfer `AICTE-PGRC-2026-010` to RB.
   - **Live Result**: Triggers overlap with `AICTE-PGRC-2026-006`.

## 8. Verification & Offline Readiness
- **Zero External Network Calls**: Verified via ripgrep across `static/` (zero `http://` or `https://` references outside local vendors).
- **Backend Test Suite**: All tests in `test_api.py` passing with exit code 0.
- **Server**: Running locally on `http://127.0.0.1:8000`.
- **Database Reset**: Database restored to clean seeded baseline (60 complaints, 5 active overlap pairs).

