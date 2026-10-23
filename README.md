# AICTE Integrated Institution Complaint Monitoring & Status Dashboard

The **Integrated Institution Complaint Monitoring and Status Dashboard** is a unified single-window intelligence and tracking platform designed for the **All India Council for Technical Education (AICTE)**.

It eliminates administrative silos between key AICTE bureaus—primarily the **Regulation Bureau (RB)** and the **Public Grievance Redressal Cell (PGRC)**, along with Approval and Policy bureaus—by providing real-time transparency into complaints filed against technical institutions across India, preventing duplicate inquiries and uncoordinated inspections.

---

## How to Run

### Option 1: Automatic Launch (Windows)
Double-click `start.bat` or run:
```bat
start.bat
```
This batch script automatically:
1. Navigates to the project directory.
2. Installs dependencies quietly from `requirements.txt` if needed.
3. Seeds `aicte.db` if the database does not already exist.
4. Starts the FastAPI Uvicorn server on port 8000.
5. Opens `http://127.0.0.1:8000` in your default browser.

### Option 2: Manual Terminal Commands
```bash
# 1. Navigate to the project directory
cd aicte-dashboard

# 2. Install dependencies
py -m pip install -r requirements.txt

# 3. Seed initial database (if aicte.db does not exist or needs reset)
py seed.py

# 4. Start local Uvicorn development server
py -m uvicorn main:app --port 8000

# 5. Open browser at:
# http://127.0.0.1:8000
```

---

## 5-Step Demo Presentation Flow

1. **Step 1: Leadership Overview (`#dashboard`)**
   - Switch persona views between `Admin`, `RB`, and `PGRC` using the header switcher.
   - Review 8 KPI cards with real-time status sums and overdue SLA counters.
   - Observe the prominent cross-bureau overlap alert banner and explore the 6 Chart.js intelligence visualizations.

2. **Step 2: Cross-Bureau Overlap Detection & Review (`#overlaps`)**
   - Click "Review 5 Cases" on the dashboard banner or click **Overlaps** in the sidebar.
   - View side-by-side complaint dossiers across bureaus with match explanations and confidence score meters.
   - Submit coordination remarks and mark cases as reviewed.

3. **Step 3: Case Dossier Drawer & Live Transfer Demo (`#cases`)**
   - Click on any case row to open the 600px right-side slide-over dossier drawer.
   - Inspect the metadata grid, SLA warnings, and vertical chronological action history.
   - Perform a live transfer of a candidate case (see below) to witness the real-time Overlap Engine flag the case with an instant toast notification:
     `⚠️ New overlap detected with <case_id> – Coordination Required`

4. **Step 4: Institution 360° Profile (`#institution/<id>`)**
   - Click any institution name in a table or drawer, or click **Institutions** (`#institutions`) in the sidebar.
   - Review the Bureau Involvement strip: observe the red warning strip when concurrent bureaus are active.
   - Examine the institution's category breakdown chart and full consolidated complaint history.

5. **Step 5: Intelligence Exports & Printable Briefing (`#reports`)**
   - Click **Reports** in the sidebar to review preview cards and download standardized offline CSV files.
   - Use the mini-filter on the Complaints Register card to export targeted sub-registers.
   - Click **Print this page** to demonstrate clean, print-optimized reporting that hides navigation elements.

---

## Live Demo Transfer Candidates

The following institutions are seeded with 2 active cases in the same bureau (no initial overlap), designed specifically for live presentations to demonstrate real-time cross-bureau overlap detection upon transfer:

1. **Guru Nanak Engineering College** (Permanent ID: `1-90278402`):
   - **Active Cases in RB**: `AICTE-RB-2026-006` and `AICTE-RB-2026-010`.
   - **Demo Action**: Open drawer for `AICTE-RB-2026-010` $\rightarrow$ Action: "Transfer to another Bureau" $\rightarrow$ Receiving Bureau: "PGRC" $\rightarrow$ Submit.
   - **Result**: Instantly flags overlap with `AICTE-RB-2026-006`, shows alert banner and updates badges.

2. **Lucknow Institute of Pharmacy** (Permanent ID: `1-90278405`):
   - **Active Cases in RB**: `AICTE-RB-2026-009` and `AICTE-RB-2026-011`.
   - **Demo Action**: Transfer `AICTE-RB-2026-011` to `PGRC`.
   - **Result**: Instantly flags overlap with `AICTE-RB-2026-009`.

3. **Chennai Institute of Technology** (Permanent ID: `2-90278406`):
   - **Active Cases in RB**: `AICTE-RB-2026-007` and `AICTE-RB-2026-012`.
   - **Demo Action**: Transfer `AICTE-RB-2026-012` to `PGRC`.
   - **Result**: Instantly flags overlap with `AICTE-RB-2026-007`.

4. **Rajasthan School of Management** (Permanent ID: `1-90278404`):
   - **Active Cases in PGRC**: `AICTE-PGRC-2026-006` and `AICTE-PGRC-2026-010`.
   - **Demo Action**: Transfer `AICTE-PGRC-2026-010` to `RB`.
   - **Result**: Instantly flags overlap with `AICTE-PGRC-2026-006`.

---

## List of API Endpoints

### Overlaps Engine
- `GET /api/overlaps` - Fetch detected cross-bureau overlap pairs (`?status=Open` or `Reviewed`).
- `POST /api/overlaps/scan` - Trigger an immediate manual scan across all active complaints.
- `POST /api/overlaps/{id}/review` - Update coordination remarks and set review status.
- `POST /api/overlaps/link` - Manually link two complaints.

### Complaints & Actions
- `GET /api/complaints` - Query complaints with multi-criteria filters (`q`, `bureau`, `source_bureau`, `region`, `category`, `status`, `priority`, `date_from`, `date_to`, `overdue`, `approaching_deadline`, `has_overlap`, `sort`, `limit`, `offset`).
- `GET /api/complaints/{id}` - Comprehensive case dossier with full action logs and linked overlap details.
- `POST /api/complaints/{id}/action` - Record case action (`Remark`, `Transferred`, `Escalated`, `Assigned`, `Disposed`) and trigger automatic overlap re-scan.
- `GET /api/officers` - List council officers filtered by bureau (`?bureau=`).

### Institutions
- `GET /api/institutions` - Directory of all approved technical institutions with complaint metrics (`?q=`).
- `GET /api/institutions/{id}` - Comprehensive institution profile with active bureau involvement, category breakdown, and historical complaints.

### Analytics & Alerts
- `GET /api/stats` - Executive dashboard statistics, ageing analysis, monthly trend, and disposal turnaround (`?bureau=`).
- `GET /api/alerts` - Categorized critical alert feed (`Overlap`, `Overdue`, `Deadline Approaching`, `Escalation`, `Long Pending`).
- `GET /api/meta` - Static application metadata (bureaus, regions, categories, statuses, priorities).

### CSV Report Exports
- `GET /api/reports/bureau.csv` - Bureau workload and disposal rates.
- `GET /api/reports/region.csv` - Regional complaint distribution.
- `GET /api/reports/institution.csv` - Institution-wise registry with overlap flags.
- `GET /api/reports/ageing.csv` - Pending complaints ageing analysis by 15-day intervals.
- `GET /api/reports/overlaps.csv` - Log of all cross-bureau overlapping case pairs.
- `GET /api/reports/complaints.csv` - Filtered master complaints register.

### Presentation & Demo Helpers
- `POST /api/demo/reset` - Restores database to the original seeded baseline.

---

## Project Structure

```text
aicte-dashboard/
├── aicte.db                  # Local SQLite database
├── database.py               # SQLAlchemy database session & engine configuration
├── main.py                   # FastAPI REST API, routing, actions, and CSV export engine
├── models.py                 # SQLAlchemy 2.0 ORM schemas
├── overlap.py                # Dual-layer Cross-Bureau Overlap Detection Engine
├── requirements.txt          # Python project dependencies with pinned versions
├── seed.py                   # Realistic seed data generator (60 complaints, 25 institutions)
├── start.bat                 # One-click Windows starter script
├── test_api.py               # Comprehensive automated REST API test suite
├── README.md                 # Project documentation and presentation guide
├── dev_tools/                # Internal developer scratch tools and verification media
├── static/                   # 100% offline frontend web assets
│   ├── index.html            # Single-page shell, header, drawer, and modal containers
│   ├── style.css             # Government portal theme, drawer animations, and print media rules
│   ├── app.js                # Frontend SPA controller, Chart.js instances, and slide-over drawer
│   └── vendor/               # Self-hosted offline libraries
│       ├── chart.js          # Chart.js 4.4.1 runtime
│       └── tailwind.js       # Tailwind CSS runtime
└── templates/
    └── .gitkeep
```
