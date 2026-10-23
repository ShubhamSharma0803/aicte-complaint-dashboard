/**
 * AICTE Integrated Institution Complaint Monitoring Dashboard
 * Frontend Application Engine (Offline Vanilla JS)
 */

// ═══════════════════════════════════════════════════════════════════════════
// Global Application State
// ═══════════════════════════════════════════════════════════════════════════
const state = {
    persona: localStorage.getItem('aicte_persona') || 'ADMIN',
    currentRoute: window.location.hash || '#dashboard',
    meta: null,
    stats: null,
    alertsData: null,
    openOverlapCount: 0,
    totalAlertCount: 0,
    charts: {},
    cases: {
        page: 1,
        limit: 15,
        total: 0,
        filters: {
            q: '',
            bureau: '',
            region: '',
            category: '',
            status: '',
            priority: '',
            date_from: '',
            date_to: '',
            overdue: false,
            approaching_deadline: false,
            has_overlap: false,
            sort: 'received_desc',
        }
    },
    overlaps: {
        filterTab: 'Open',
        data: []
    },
    alerts: {
        activeFilter: 'ALL',
        data: []
    },
    activeCaseDetail: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    initPersonaSelector();
    await loadMetadata();
    setupRouting();
    await refreshGlobalCounters();
    renderRoute(state.currentRoute);
});

// ═══════════════════════════════════════════════════════════════════════════
// Persona Management
// ═══════════════════════════════════════════════════════════════════════════
function initPersonaSelector() {
    const select = document.getElementById('persona-select');
    if (select) {
        select.value = state.persona;
        select.addEventListener('change', (e) => {
            setPersona(e.target.value);
        });
    }
    updatePersonaBanner();
}

function setPersona(persona) {
    state.persona = persona;
    localStorage.setItem('aicte_persona', persona);
    updatePersonaBanner();
    showToast(`Switched persona to: ${getPersonaLabel(persona)}`, 'info');
    
    // Reset cases pagination and re-render current route
    state.cases.page = 1;
    refreshGlobalCounters().then(() => {
        renderRoute(state.currentRoute);
    });
}

function getPersonaLabel(p) {
    if (p === 'RB') return 'Regulation Bureau (RB)';
    if (p === 'PGRC') return 'Public Grievance Redressal Cell (PGRC)';
    return 'Admin / Council Leadership';
}

function updatePersonaBanner() {
    const label = document.getElementById('persona-label');
    const desc = document.getElementById('persona-desc');
    if (label) label.textContent = getPersonaLabel(state.persona);
    if (desc) {
        if (state.persona === 'RB') {
            desc.textContent = '(Filtered to active complaints handled by Regulation Bureau)';
        } else if (state.persona === 'PGRC') {
            desc.textContent = '(Filtered to active complaints handled by PGRC)';
        } else {
            desc.textContent = '(Viewing all council complaints across all bureaus)';
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Routing
// ═══════════════════════════════════════════════════════════════════════════
function setupRouting() {
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash || '#dashboard';
        state.currentRoute = hash;
        renderRoute(hash);
    });
}

function renderRoute(route) {
    // Update navigation active styles
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('bg-blue-700/80', 'text-white');
        link.classList.add('text-slate-300');
    });

    const hash = route || window.location.hash || '#dashboard';
    const container = document.getElementById('app-container');
    destroyCharts();

    if (hash.startsWith('#institution/')) {
        const instId = hash.replace('#institution/', '').trim();
        const activeLink = document.getElementById('nav-institutions');
        if (activeLink) {
            activeLink.classList.add('bg-blue-700/80', 'text-white');
            activeLink.classList.remove('text-slate-300');
        }
        renderInstitutionProfilePage(container, instId);
        return;
    }

    const routeKey = hash.replace('#', '') || 'dashboard';
    const activeLink = document.getElementById(`nav-${routeKey}`);
    if (activeLink) {
        activeLink.classList.add('bg-blue-700/80', 'text-white');
        activeLink.classList.remove('text-slate-300');
    }

    if (routeKey === 'cases') {
        renderCasesPage(container);
    } else if (routeKey === 'overlaps') {
        renderOverlapsPage(container);
    } else if (routeKey === 'institutions') {
        renderInstitutionsPage(container);
    } else if (routeKey === 'alerts') {
        renderAlertsPage(container);
    } else if (routeKey === 'reports') {
        renderReportsPage(container);
    } else {
        renderDashboardPage(container);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Global Data Fetching
// ═══════════════════════════════════════════════════════════════════════════
async function loadMetadata() {
    try {
        const res = await fetch('/api/meta');
        state.meta = await res.json();
    } catch (err) {
        console.error('Failed to load metadata:', err);
    }
}

async function refreshGlobalCounters() {
    try {
        const bureauParam = state.persona !== 'ADMIN' ? `?bureau=${state.persona}` : '';
        const statsRes = await fetch(`/api/stats${bureauParam}`);
        state.stats = await statsRes.json();

        // Update nav counters
        const openOverlaps = state.stats.totals.open_overlaps || 0;
        const totalCases = state.stats.totals.total || 0;
        state.openOverlapCount = openOverlaps;

        const navOverlaps = document.getElementById('nav-overlaps-count');
        if (navOverlaps) navOverlaps.textContent = openOverlaps;

        const navCases = document.getElementById('nav-cases-count');
        if (navCases) navCases.textContent = totalCases;

        const alertsRes = await fetch('/api/alerts');
        const alertsData = await alertsRes.json();
        state.alertsData = alertsData;
        const alertTotal = alertsData.summary?.total || 0;

        const topBadge = document.getElementById('top-alert-badge');
        if (topBadge) topBadge.textContent = alertTotal;

        const navAlerts = document.getElementById('nav-alerts-count');
        if (navAlerts) navAlerts.textContent = alertTotal;
    } catch (e) {
        console.error('Error refreshing global counters:', e);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 1: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
async function renderDashboardPage(container) {
    container.innerHTML = `
        <div class="space-y-6">
            <!-- KPI Cards Row -->
            <div id="kpi-grid" class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5">
                ${getSkeletonKPIs()}
            </div>

            <!-- Overlap Alert Banner (Conditional) -->
            <div id="overlap-banner-container"></div>

            <!-- Charts Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <!-- 1. Status Doughnut -->
                <div class="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col">
                    <div class="mb-3">
                        <h3 class="font-bold text-sm text-slate-800">Cases by Status</h3>
                        <p class="text-xs text-slate-500">Distribution across resolution lifecycle</p>
                    </div>
                    <div class="relative flex-1 min-h-[220px] flex items-center justify-center">
                        <canvas id="chart-status"></canvas>
                    </div>
                </div>

                <!-- 2. Bureau Workload Grouped Bar -->
                <div class="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col">
                    <div class="mb-3">
                        <h3 class="font-bold text-sm text-slate-800">Bureau Workload</h3>
                        <p class="text-xs text-slate-500">Active caseload vs disposed complaints</p>
                    </div>
                    <div class="relative flex-1 min-h-[220px]">
                        <canvas id="chart-bureau"></canvas>
                    </div>
                </div>

                <!-- 3. Region Distribution -->
                <div class="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col">
                    <div class="mb-3">
                        <h3 class="font-bold text-sm text-slate-800">Regional Distribution</h3>
                        <p class="text-xs text-slate-500">AICTE regional office jurisdiction</p>
                    </div>
                    <div class="relative flex-1 min-h-[220px]">
                        <canvas id="chart-region"></canvas>
                    </div>
                </div>

                <!-- 4. Category Breakdown Horizontal Bar -->
                <div class="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col">
                    <div class="mb-3">
                        <h3 class="font-bold text-sm text-slate-800">Category Breakdown</h3>
                        <p class="text-xs text-slate-500">Subject matter complaint classifications</p>
                    </div>
                    <div class="relative flex-1 min-h-[220px]">
                        <canvas id="chart-category"></canvas>
                    </div>
                </div>

                <!-- 5. Ageing Buckets -->
                <div class="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col">
                    <div class="mb-3">
                        <h3 class="font-bold text-sm text-slate-800">Ageing Analysis</h3>
                        <p class="text-xs text-slate-500">Days pending for active complaints</p>
                    </div>
                    <div class="relative flex-1 min-h-[220px]">
                        <canvas id="chart-ageing"></canvas>
                    </div>
                </div>

                <!-- 6. Monthly Trend -->
                <div class="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col">
                    <div class="mb-3">
                        <h3 class="font-bold text-sm text-slate-800">6-Month Intake Trend</h3>
                        <p class="text-xs text-slate-500">Monthly incoming complaint volume</p>
                    </div>
                    <div class="relative flex-1 min-h-[220px]">
                        <canvas id="chart-trend"></canvas>
                    </div>
                </div>
            </div>

            <!-- Lower Panels: Top Institutions & Recent Alerts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <!-- Top Institutions -->
                <div class="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5">
                    <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <div>
                            <h3 class="font-bold text-sm text-slate-800">Top Institutions by Complaints</h3>
                            <p class="text-xs text-slate-500">Institutions requiring elevated oversight</p>
                        </div>
                        <a href="#cases" class="text-xs text-blue-600 hover:text-blue-800 font-semibold">View All Cases →</a>
                    </div>
                    <div id="top-institutions-list" class="divide-y divide-slate-100">
                        <div class="py-4 text-center text-xs text-slate-400">Loading institutions...</div>
                    </div>
                </div>

                <!-- Recent Alerts -->
                <div class="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5">
                    <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <div>
                            <h3 class="font-bold text-sm text-slate-800">Critical Alerts & Movement</h3>
                            <p class="text-xs text-slate-500">Urgent SLA deadlines and escalations</p>
                        </div>
                        <a href="#alerts" class="text-xs text-rose-600 hover:text-rose-800 font-semibold">View All Alerts →</a>
                    </div>
                    <div id="recent-alerts-list" class="space-y-2.5">
                        <div class="py-4 text-center text-xs text-slate-400">Loading alerts...</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Fetch stats and render KPIs & Charts
    try {
        const bureauParam = state.persona !== 'ADMIN' ? `?bureau=${state.persona}` : '';
        const res = await fetch(`/api/stats${bureauParam}`);
        const data = await res.json();
        state.stats = data;

        renderKPICards(data.totals);
        renderOverlapBanner(data.totals.open_overlaps);
        initDashboardCharts(data);
        renderTopInstitutions(data.top_institutions);
        renderRecentAlerts();
    } catch (err) {
        console.error('Error rendering dashboard:', err);
    }
}

function getSkeletonKPIs() {
    let s = '';
    for (let i = 0; i < 8; i++) {
        s += `<div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm animate-pulse h-20"></div>`;
    }
    return s;
}

function renderKPICards(totals) {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;

    const cards = [
        { label: 'Total Cases', value: totals.total, color: 'text-slate-800', bg: 'bg-white', border: 'border-slate-200' },
        { label: 'Pending', value: totals.pending, color: 'text-amber-600', bg: 'bg-amber-50/40', border: 'border-amber-200/80' },
        { label: 'Under Process', value: totals.under_process, color: 'text-blue-600', bg: 'bg-blue-50/40', border: 'border-blue-200/80' },
        { label: 'Disposed', value: totals.disposed, color: 'text-emerald-600', bg: 'bg-emerald-50/40', border: 'border-emerald-200/80' },
        { label: 'Transferred', value: totals.transferred, color: 'text-purple-600', bg: 'bg-purple-50/40', border: 'border-purple-200/80' },
        { label: 'Escalated', value: totals.escalated, color: 'text-rose-600', bg: 'bg-rose-50/40', border: 'border-rose-200/80' },
        { label: 'Overdue SLA', value: totals.overdue, color: 'text-red-700 font-bold', bg: 'bg-red-50', border: 'border-red-300' },
        { label: 'Open Overlaps', value: totals.open_overlaps, color: 'text-red-800 font-bold', bg: 'bg-red-100/70', border: 'border-red-400', isOverlap: true },
    ];

    grid.innerHTML = cards.map(c => `
        <div class="${c.bg} ${c.border} p-3.5 rounded-xl border shadow-sm flex flex-col justify-between card-hover transition-smooth">
            <div class="flex items-center justify-between">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">${c.label}</span>
                ${c.isOverlap && c.value > 0 ? `
                    <span class="relative flex h-2.5 w-2.5">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                    </span>
                ` : ''}
            </div>
            <div class="text-2xl font-black ${c.color} mt-1 count-up" data-target="${c.value}">
                0
            </div>
        </div>
    `).join('');

    // Trigger number animations
    animateCounters();
}

function animateCounters() {
    document.querySelectorAll('.count-up').forEach(el => {
        const target = parseInt(el.getAttribute('data-target') || '0', 10);
        let current = 0;
        const duration = 600; // ms
        const stepTime = 20;
        const steps = duration / stepTime;
        const increment = Math.ceil(target / steps) || 1;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                el.textContent = target;
                clearInterval(timer);
            } else {
                el.textContent = current;
            }
        }, stepTime);
    });
}

function renderOverlapBanner(openCount) {
    const container = document.getElementById('overlap-banner-container');
    if (!container) return;

    if (openCount > 0) {
        container.innerHTML = `
            <div class="bg-gradient-to-r from-red-600 to-amber-600 text-white rounded-xl p-4 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 border border-red-500">
                <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl flex-shrink-0 animate-bounce">
                        ⚠️
                    </div>
                    <div>
                        <h4 class="font-extrabold text-base tracking-tight">
                            ${openCount} Potential Overlapping Cases – Coordination Required
                        </h4>
                        <p class="text-xs text-amber-100 font-medium">
                            Multiple AICTE bureaus are actively handling concurrent complaints for the same institution. Immediate harmonization recommended.
                        </p>
                    </div>
                </div>
                <a href="#overlaps" class="px-4 py-2 bg-white text-red-700 hover:bg-amber-50 font-bold text-xs rounded-lg shadow transition whitespace-nowrap">
                    Review Overlaps Now →
                </a>
            </div>
        `;
    } else {
        container.innerHTML = '';
    }
}

function initDashboardCharts(data) {
    destroyCharts();

    // Chart Colors
    const statusColors = {
        'Pending': '#f59e0b',        // Amber
        'Under Process': '#2563eb',  // Blue
        'Disposed': '#10b981',       // Emerald Green
        'Transferred': '#9333ea',    // Purple
        'Escalated': '#e11d48',      // Rose Red
    };

    // 1. Status Doughnut
    const ctxStatus = document.getElementById('chart-status')?.getContext('2d');
    if (ctxStatus) {
        const statuses = Object.keys(data.by_status);
        const counts = Object.values(data.by_status);
        state.charts.status = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: statuses,
                datasets: [{
                    data: counts,
                    backgroundColor: statuses.map(s => statusColors[s] || '#64748b'),
                    borderWidth: 2,
                    borderColor: '#ffffff',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                },
                cutout: '65%',
            }
        });
    }

    // 2. Bureau Workload Grouped Bar
    const ctxBureau = document.getElementById('chart-bureau')?.getContext('2d');
    if (ctxBureau) {
        state.charts.bureau = new Chart(ctxBureau, {
            type: 'bar',
            data: {
                labels: data.by_bureau.map(b => b.code),
                datasets: [
                    {
                        label: 'Active',
                        data: data.by_bureau.map(b => b.active),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4,
                    },
                    {
                        label: 'Disposed',
                        data: data.by_bureau.map(b => b.disposed),
                        backgroundColor: '#10b981',
                        borderRadius: 4,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 2 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 3. Region Distribution
    const ctxRegion = document.getElementById('chart-region')?.getContext('2d');
    if (ctxRegion) {
        state.charts.region = new Chart(ctxRegion, {
            type: 'bar',
            data: {
                labels: Object.keys(data.by_region),
                datasets: [{
                    label: 'Complaints',
                    data: Object.values(data.by_region),
                    backgroundColor: '#1e3a8a',
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    // 4. Category Breakdown Horizontal Bar
    const ctxCat = document.getElementById('chart-category')?.getContext('2d');
    if (ctxCat) {
        const sortedCats = Object.entries(data.by_category).sort((a,b) => b[1] - a[1]);
        state.charts.category = new Chart(ctxCat, {
            type: 'bar',
            data: {
                labels: sortedCats.map(c => c[0]),
                datasets: [{
                    label: 'Cases',
                    data: sortedCats.map(c => c[1]),
                    backgroundColor: '#f59e0b',
                    borderRadius: 4,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    // 5. Ageing Buckets
    const ctxAge = document.getElementById('chart-ageing')?.getContext('2d');
    if (ctxAge) {
        state.charts.ageing = new Chart(ctxAge, {
            type: 'bar',
            data: {
                labels: Object.keys(data.ageing).map(k => `${k} days`),
                datasets: [{
                    label: 'Active Cases',
                    data: Object.values(data.ageing),
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 6. Monthly Trend
    const ctxTrend = document.getElementById('chart-trend')?.getContext('2d');
    if (ctxTrend) {
        state.charts.trend = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: data.monthly_trend.map(m => m.month),
                datasets: [{
                    label: 'Intake Volume',
                    data: data.monthly_trend.map(m => m.count),
                    borderColor: '#1e3a8a',
                    backgroundColor: 'rgba(30, 58, 138, 0.08)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5,
                    pointBackgroundColor: '#f59e0b',
                    pointRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 2 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function destroyCharts() {
    for (let key in state.charts) {
        if (state.charts[key]) {
            state.charts[key].destroy();
        }
    }
    state.charts = {};
}

function renderTopInstitutions(institutions) {
    const list = document.getElementById('top-institutions-list');
    if (!list) return;

    if (!institutions || institutions.length === 0) {
        list.innerHTML = `<div class="py-4 text-center text-xs text-slate-400">No institution data available</div>`;
        return;
    }

    list.innerHTML = institutions.map(inst => `
        <div class="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg transition cursor-pointer" onclick="window.location.hash = '#institutions'" title="Click to view institutions">
            <div class="min-w-0 pr-3">
                <div class="font-semibold text-xs text-slate-800 truncate">${inst.name}</div>
                <div class="text-[11px] text-slate-400 font-mono">PID: ${inst.permanent_id}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <div class="flex gap-1">
                    ${(inst.bureaus || []).map(b => getBureauBadge(b)).join('')}
                </div>
                <span class="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-full border border-blue-200">
                    ${inst.count} cases
                </span>
            </div>
        </div>
    `).join('');
}

function renderRecentAlerts() {
    const list = document.getElementById('recent-alerts-list');
    if (!list || !state.alertsData) return;

    let alerts = state.alertsData.alerts || [];
    alerts = alerts.slice(0, 6);

    if (alerts.length === 0) {
        list.innerHTML = `<div class="py-4 text-center text-xs text-slate-400">No active alerts at this time.</div>`;
        return;
    }

    list.innerHTML = alerts.map(a => {
        let dotColor = 'bg-rose-500';
        if (a.severity === 'Medium') dotColor = 'bg-amber-500';
        if (a.severity === 'Low') dotColor = 'bg-blue-500';

        return `
            <div class="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-100 transition flex items-start gap-3 cursor-pointer" onclick="handleAlertClick('${a.type}', '${a.case_id}')" title="Click to view alert details">
                <span class="w-2 h-2 rounded-full ${dotColor} mt-1.5 flex-shrink-0"></span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-bold text-[11px] text-slate-800">${a.type}: ${a.institution_name}</span>
                        <span class="text-[10px] text-slate-400">${a.date}</span>
                    </div>
                    <p class="text-xs text-slate-600 truncate mt-0.5">${a.message}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 2: ALL CASES
// ═══════════════════════════════════════════════════════════════════════════
function renderCasesPage(container) {
    const f = state.cases.filters;
    const isLockedBureau = state.persona !== 'ADMIN';

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Filter Bar Card -->
            <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div class="flex items-center gap-2">
                        <h2 class="font-bold text-base text-slate-800">Complaints Registry</h2>
                        <span class="text-xs text-slate-500">Real-time status tracking & SLA monitoring</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <a href="/api/reports/complaints.csv" target="_blank" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            Export CSV
                        </a>
                        <button onclick="resetCaseFilters()" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition">
                            Reset Filters
                        </button>
                    </div>
                </div>

                <!-- Primary Search & Dropdowns -->
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <!-- Search Input -->
                    <div class="lg:col-span-2">
                        <input type="text" id="filter-q" value="${f.q}" placeholder="Search Institution, PID, Case ID..." oninput="debounceFilterChange(this)" class="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>

                    <!-- Bureau Dropdown -->
                    <div>
                        <select id="filter-bureau" onchange="onFilterChange()" ${isLockedBureau ? 'disabled' : ''} class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none ${isLockedBureau ? 'bg-slate-100' : 'bg-white'}">
                            <option value="">All Bureaus</option>
                            <option value="RB" ${f.bureau === 'RB' ? 'selected' : ''}>Regulation Bureau (RB)</option>
                            <option value="PGRC" ${f.bureau === 'PGRC' ? 'selected' : ''}>PGRC</option>
                            <option value="APPROVAL" ${f.bureau === 'APPROVAL' ? 'selected' : ''}>Approval Bureau</option>
                        </select>
                    </div>

                    <!-- Region Dropdown -->
                    <div>
                        <select id="filter-region" onchange="onFilterChange()" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="">All Regions</option>
                            ${(state.meta?.regions || ['Northern', 'Southern', 'Eastern', 'Western', 'Central']).map(r => `
                                <option value="${r}" ${f.region === r ? 'selected' : ''}>${r}</option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Category Dropdown -->
                    <div>
                        <select id="filter-category" onchange="onFilterChange()" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="">All Categories</option>
                            ${(state.meta?.categories || []).map(c => `
                                <option value="${c}" ${f.category === c ? 'selected' : ''}>${c}</option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Status Dropdown -->
                    <div>
                        <select id="filter-status" onchange="onFilterChange()" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="">All Statuses</option>
                            ${(state.meta?.statuses || []).map(s => `
                                <option value="${s}" ${f.status === s ? 'selected' : ''}>${s}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- Secondary Row: Checkboxes & Sorting -->
                <div class="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-600">
                    <div class="flex flex-wrap items-center gap-4">
                        <label class="flex items-center gap-1.5 cursor-pointer font-medium hover:text-slate-900">
                            <input type="checkbox" id="filter-overdue" ${f.overdue ? 'checked' : ''} onchange="onFilterChange()" class="rounded text-red-600 focus:ring-red-500" />
                            <span class="text-red-700 font-bold">Overdue Only</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer font-medium hover:text-slate-900">
                            <input type="checkbox" id="filter-approaching" ${f.approaching_deadline ? 'checked' : ''} onchange="onFilterChange()" class="rounded text-amber-600 focus:ring-amber-500" />
                            <span class="text-amber-700 font-semibold">Approaching Deadline (7 days)</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer font-medium hover:text-slate-900">
                            <input type="checkbox" id="filter-overlap" ${f.has_overlap ? 'checked' : ''} onchange="onFilterChange()" class="rounded text-purple-600 focus:ring-purple-500" />
                            <span class="text-purple-700 font-bold">Has Overlap Only</span>
                        </label>
                    </div>

                    <!-- Sorting -->
                    <div class="flex items-center gap-2">
                        <span class="text-slate-500">Sort:</span>
                        <select id="filter-sort" onchange="onFilterChange()" class="border border-slate-300 rounded-lg px-2.5 py-1 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium">
                            <option value="received_desc" ${f.sort === 'received_desc' ? 'selected' : ''}>Newest Received</option>
                            <option value="age_desc" ${f.sort === 'age_desc' ? 'selected' : ''}>Oldest Age (Highest)</option>
                            <option value="deadline_asc" ${f.sort === 'deadline_asc' ? 'selected' : ''}>Earliest Deadline</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Complaints Table Card -->
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-100/90 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                                <th class="py-3 px-3.5">Case ID</th>
                                <th class="py-3 px-3.5">Institution & PID</th>
                                <th class="py-3 px-3.5">Category</th>
                                <th class="py-3 px-3.5">Bureau</th>
                                <th class="py-3 px-3.5">Officer</th>
                                <th class="py-3 px-3.5">Status</th>
                                <th class="py-3 px-3.5">Priority</th>
                                <th class="py-3 px-3.5">Age</th>
                                <th class="py-3 px-3.5">Expected Disposal</th>
                                <th class="py-3 px-3.5 text-center">Alerts</th>
                            </tr>
                        </thead>
                        <tbody id="cases-table-body" class="divide-y divide-slate-100">
                            <tr>
                                <td colspan="10" class="py-8 text-center text-slate-400">Loading cases...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Pagination Footer -->
                <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    <div id="cases-pagination-info">Showing 0 to 0 of 0 cases</div>
                    <div class="flex items-center gap-2">
                        <button id="btn-prev-page" onclick="changeCasePage(-1)" class="px-3 py-1 rounded bg-white border border-slate-300 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                            Previous
                        </button>
                        <span id="cases-page-number" class="font-bold px-2">Page 1</span>
                        <button id="btn-next-page" onclick="changeCasePage(1)" class="px-3 py-1 rounded bg-white border border-slate-300 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    fetchAndRenderCases();
}

let debounceTimer = null;
function debounceFilterChange(input) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        state.cases.filters.q = input.value.trim();
        state.cases.page = 1;
        fetchAndRenderCases();
    }, 300);
}

function onFilterChange() {
    const f = state.cases.filters;
    f.bureau = document.getElementById('filter-bureau')?.value || '';
    f.region = document.getElementById('filter-region')?.value || '';
    f.category = document.getElementById('filter-category')?.value || '';
    f.status = document.getElementById('filter-status')?.value || '';
    f.overdue = document.getElementById('filter-overdue')?.checked || false;
    f.approaching_deadline = document.getElementById('filter-approaching')?.checked || false;
    f.has_overlap = document.getElementById('filter-overlap')?.checked || false;
    f.sort = document.getElementById('filter-sort')?.value || 'received_desc';

    state.cases.page = 1;
    fetchAndRenderCases();
}

function resetCaseFilters() {
    state.cases.filters = {
        q: '',
        bureau: state.persona !== 'ADMIN' ? state.persona : '',
        region: '',
        category: '',
        status: '',
        priority: '',
        date_from: '',
        date_to: '',
        overdue: false,
        approaching_deadline: false,
        has_overlap: false,
        sort: 'received_desc',
    };
    state.cases.page = 1;
    renderCasesPage(document.getElementById('app-container'));
}

async function fetchAndRenderCases() {
    const tbody = document.getElementById('cases-table-body');
    if (!tbody) return;

    // Apply persona restriction
    let bureauQuery = state.cases.filters.bureau;
    if (state.persona !== 'ADMIN') {
        bureauQuery = state.persona;
    }

    const params = new URLSearchParams();
    if (state.cases.filters.q) params.set('q', state.cases.filters.q);
    if (bureauQuery) params.set('bureau', bureauQuery);
    if (state.cases.filters.region) params.set('region', state.cases.filters.region);
    if (state.cases.filters.category) params.set('category', state.cases.filters.category);
    if (state.cases.filters.status) params.set('status', state.cases.filters.status);
    if (state.cases.filters.overdue) params.set('overdue', 'true');
    if (state.cases.filters.approaching_deadline) params.set('approaching_deadline', 'true');
    if (state.cases.filters.has_overlap) params.set('has_overlap', 'true');
    if (state.cases.filters.sort) params.set('sort', state.cases.filters.sort);

    params.set('limit', state.cases.limit);
    params.set('offset', (state.cases.page - 1) * state.cases.limit);

    tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-400">Loading cases...</td></tr>`;

    try {
        const res = await fetch(`/api/complaints?${params.toString()}`);
        const totalHeader = res.headers.get('X-Total-Count');
        const data = await res.json();

        state.cases.total = totalHeader ? parseInt(totalHeader, 10) : data.length;
        renderCasesTable(data, tbody);
        updatePaginationControls();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-red-500 font-semibold">Failed to load complaints.</td></tr>`;
    }
}

function renderCasesTable(cases, tbody) {
    if (cases.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="py-12 text-center text-slate-400">
                    <div class="text-3xl mb-2">🔍</div>
                    <div class="font-semibold text-slate-700">No cases match the selected filters</div>
                    <div class="text-xs text-slate-500 mt-1">Try resetting filters or searching with another term.</div>
                </td>
            </tr>
        `;
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    tbody.innerHTML = cases.map(c => {
        const isOverdue = c.expected_disposal_date && c.expected_disposal_date < todayStr && c.status !== 'Disposed';
        const isApproaching = c.expected_disposal_date && c.expected_disposal_date >= todayStr && c.expected_disposal_date <= addDays(todayStr, 7) && c.status !== 'Disposed';

        let disposalBadge = c.expected_disposal_date || 'N/A';
        if (isOverdue) {
            disposalBadge = `<span class="px-2 py-0.5 rounded font-bold bg-red-100 text-red-700">${c.expected_disposal_date}</span>`;
        } else if (isApproaching) {
            disposalBadge = `<span class="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">${c.expected_disposal_date}</span>`;
        }

        return `
            <tr class="hover:bg-blue-50/40 transition cursor-pointer" onclick="openCaseDrawer(${c.id})">
                <td class="py-3 px-3.5 font-bold font-mono text-blue-900">${c.case_id}</td>
                <td class="py-3 px-3.5 max-w-[200px]">
                    <div class="font-semibold text-slate-800 truncate" title="${c.institution_name}">${c.institution_name}</div>
                    <div class="text-[11px] text-slate-400 font-mono">${c.institution_permanent_id}</div>
                </td>
                <td class="py-3 px-3.5 text-slate-700">${c.category}</td>
                <td class="py-3 px-3.5">${getBureauBadge(c.current_bureau)}</td>
                <td class="py-3 px-3.5 text-slate-600 truncate max-w-[120px]">${c.assigned_officer || 'Unassigned'}</td>
                <td class="py-3 px-3.5">${getStatusBadge(c.status)}</td>
                <td class="py-3 px-3.5">${getPriorityBadge(c.priority)}</td>
                <td class="py-3 px-3.5 font-mono text-slate-700">${c.age_in_days} d</td>
                <td class="py-3 px-3.5 whitespace-nowrap">${disposalBadge}</td>
                <td class="py-3 px-3.5 text-center">
                    ${c.has_overlap ? `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                            ⚠ Overlap
                        </span>
                    ` : '<span class="text-slate-300">—</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

function updatePaginationControls() {
    const total = state.cases.total;
    const page = state.cases.page;
    const limit = state.cases.limit;

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    const info = document.getElementById('cases-pagination-info');
    if (info) info.textContent = `Showing ${start} to ${end} of ${total} cases`;

    const pageNum = document.getElementById('cases-page-number');
    if (pageNum) pageNum.textContent = `Page ${page} of ${Math.ceil(total / limit) || 1}`;

    const prevBtn = document.getElementById('btn-prev-page');
    if (prevBtn) prevBtn.disabled = page <= 1;

    const nextBtn = document.getElementById('btn-next-page');
    if (nextBtn) nextBtn.disabled = end >= total;
}

function changeCasePage(delta) {
    state.cases.page += delta;
    fetchAndRenderCases();
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 3: OVERLAPS
// ═══════════════════════════════════════════════════════════════════════════
async function renderOverlapsPage(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <!-- Header & Control Strip -->
            <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 class="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <span>Cross-Bureau Overlap Engine</span>
                        <span class="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">Live AI Matching</span>
                    </h2>
                    <p class="text-xs text-slate-500 mt-0.5">
                        Dual-layer intelligence (Exact PID + RapidFuzz Token/Partial Match ≥ 88) detecting concurrent proceedings.
                    </p>
                </div>

                <div class="flex items-center gap-2.5">
                    <!-- Filter Tabs: Open / Reviewed / All -->
                    <div class="bg-slate-100 p-1 rounded-lg flex text-xs font-semibold">
                        <button onclick="setOverlapTab('Open')" id="tab-overlap-Open" class="px-3 py-1.5 rounded-md ${state.overlaps.filterTab === 'Open' ? 'bg-white shadow-sm text-blue-900 font-bold' : 'text-slate-600'}">
                            Open
                        </button>
                        <button onclick="setOverlapTab('Reviewed')" id="tab-overlap-Reviewed" class="px-3 py-1.5 rounded-md ${state.overlaps.filterTab === 'Reviewed' ? 'bg-white shadow-sm text-blue-900 font-bold' : 'text-slate-600'}">
                            Reviewed
                        </button>
                        <button onclick="setOverlapTab('ALL')" id="tab-overlap-ALL" class="px-3 py-1.5 rounded-md ${state.overlaps.filterTab === 'ALL' ? 'bg-white shadow-sm text-blue-900 font-bold' : 'text-slate-600'}">
                            All Links
                        </button>
                    </div>

                    <button onclick="triggerRescan()" id="btn-rescan" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        Re-scan Overlaps
                    </button>
                </div>
            </div>

            <!-- Overlaps Cards List -->
            <div id="overlaps-list" class="space-y-4">
                <div class="py-12 text-center text-slate-400">Loading overlap pairs...</div>
            </div>
        </div>
    `;

    fetchAndRenderOverlaps();
}

function setOverlapTab(tab) {
    state.overlaps.filterTab = tab;
    ['Open', 'Reviewed', 'ALL'].forEach(t => {
        const btn = document.getElementById(`tab-overlap-${t}`);
        if (btn) {
            if (t === tab) {
                btn.className = 'px-3 py-1.5 rounded-md bg-white shadow-sm text-blue-900 font-bold';
            } else {
                btn.className = 'px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900';
            }
        }
    });
    renderOverlapsCards();
}

async function fetchAndRenderOverlaps() {
    try {
        const res = await fetch('/api/overlaps');
        state.overlaps.data = await res.json();
        renderOverlapsCards();
    } catch (e) {
        document.getElementById('overlaps-list').innerHTML = `
            <div class="p-6 bg-red-50 text-red-700 rounded-xl text-center text-xs font-semibold">
                Failed to load cross-bureau overlap records.
            </div>
        `;
    }
}

function renderOverlapsCards() {
    const list = document.getElementById('overlaps-list');
    if (!list) return;

    let items = state.overlaps.data;

    // Filter by persona if RB or PGRC
    if (state.persona !== 'ADMIN') {
        items = items.filter(o => 
            o.complaint_a?.bureau === state.persona || o.complaint_b?.bureau === state.persona
        );
    }

    // Filter by tab
    if (state.overlaps.filterTab !== 'ALL') {
        items = items.filter(o => o.status === state.overlaps.filterTab);
    }

    if (items.length === 0) {
        list.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">
                <div class="text-4xl mb-2">🎉</div>
                <h4 class="font-bold text-slate-700 text-sm">No ${state.overlaps.filterTab} overlaps in this view</h4>
                <p class="text-xs text-slate-500 mt-1">All cross-bureau proceedings for this jurisdiction are synchronized.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = items.map(ol => {
        const ca = ol.complaint_a;
        const cb = ol.complaint_b;
        const isReviewed = ol.status === 'Reviewed';

        return `
            <div class="bg-white rounded-xl border border-slate-200/90 shadow-sm border-l-4 border-l-red-500 overflow-hidden card-hover transition-smooth">
                <!-- Header -->
                <div class="p-4 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="font-bold text-sm text-red-700 flex items-center gap-1.5">
                                <span>⚠</span> Potential Overlapping Cases – Coordination Required
                            </h3>
                            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${isReviewed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
                                ${ol.status}
                            </span>
                        </div>
                        <p class="font-semibold text-xs text-slate-800 mt-1 flex items-center gap-2">
                            <span>${ol.institution_name}</span>
                            <span class="text-slate-400 font-mono font-normal">(${ol.permanent_id})</span>
                        </p>
                    </div>

                    <!-- Confidence Bar -->
                    <div class="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-inner">
                        <span class="text-[11px] font-semibold text-slate-500">Confidence:</span>
                        <div class="w-24 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div class="bg-emerald-500 h-2 rounded-full" style="width: ${ol.confidence_score}%"></div>
                        </div>
                        <span class="text-xs font-bold text-slate-800 font-mono">${ol.confidence_score}%</span>
                    </div>
                </div>

                <!-- Info Strip (Match Reason) -->
                <div class="px-4 py-2 bg-amber-50/80 border-b border-amber-200/60 text-xs text-amber-900 font-medium flex items-center gap-2">
                    <span class="font-bold text-amber-700">Why flagged:</span>
                    <span>${ol.match_reason}</span>
                </div>

                <!-- Side-by-Side Comparison -->
                <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Case A -->
                    <div class="p-3.5 bg-slate-50/90 rounded-lg border border-slate-200 space-y-2">
                        <div class="flex items-center justify-between">
                            <button onclick="openCaseDrawer(${ca?.id})" class="font-bold font-mono text-xs text-blue-900 hover:underline flex items-center gap-1">
                                <span>📄 ${ca?.case_id}</span>
                            </button>
                            ${getBureauBadge(ca?.bureau)}
                        </div>
                        <div class="text-xs space-y-1">
                            <div class="text-slate-600"><span class="font-semibold text-slate-700">Officer:</span> ${ca?.officer || 'Unassigned'}</div>
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-slate-700">Status:</span>
                                ${getStatusBadge(ca?.status)}
                            </div>
                        </div>
                    </div>

                    <!-- Case B -->
                    <div class="p-3.5 bg-slate-50/90 rounded-lg border border-slate-200 space-y-2">
                        <div class="flex items-center justify-between">
                            <button onclick="openCaseDrawer(${cb?.id})" class="font-bold font-mono text-xs text-blue-900 hover:underline flex items-center gap-1">
                                <span>📄 ${cb?.case_id}</span>
                            </button>
                            ${getBureauBadge(cb?.bureau)}
                        </div>
                        <div class="text-xs space-y-1">
                            <div class="text-slate-600"><span class="font-semibold text-slate-700">Officer:</span> ${cb?.officer || 'Unassigned'}</div>
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-slate-700">Status:</span>
                                ${getStatusBadge(cb?.status)}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Coordination Actions Strip -->
                <div class="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div class="flex-1">
                        <textarea id="remarks-${ol.id}" rows="1" placeholder="Enter joint coordination notes / directives..." ${isReviewed ? 'disabled' : ''} class="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 ${isReviewed ? 'bg-slate-100 text-slate-600' : 'bg-white'}">${ol.coordination_remarks || ''}</textarea>
                    </div>
                    <div>
                        ${isReviewed ? `
                            <span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                                ✓ Reviewed & Synchronized
                            </span>
                        ` : `
                            <button onclick="submitOverlapReview(${ol.id})" class="w-full sm:w-auto px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition">
                                Mark as Reviewed
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function submitOverlapReview(overlapId) {
    const textarea = document.getElementById(`remarks-${overlapId}`);
    const remarks = textarea?.value?.trim() || 'Coordinated joint inquiry directive agreed.';

    try {
        const res = await fetch(`/api/overlaps/${overlapId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordination_remarks: remarks, status: 'Reviewed' })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Overlap marked as Reviewed and remarks logged to case history', 'success');
            await refreshGlobalCounters();
            await fetchAndRenderOverlaps();
        }
    } catch (e) {
        showToast('Failed to review overlap', 'error');
    }
}

async function triggerRescan() {
    const btn = document.getElementById('btn-rescan');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/overlaps/scan', { method: 'POST' });
        const data = await res.json();
        showToast(`Scan complete: ${data.new_overlaps} new overlaps identified (${data.total_overlaps} total)`, 'success');
        await refreshGlobalCounters();
        await fetchAndRenderOverlaps();
    } catch (e) {
        showToast('Rescan failed', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 4: ALERTS
// ═══════════════════════════════════════════════════════════════════════════
async function renderAlertsPage(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <!-- Header -->
            <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                    <h2 class="font-bold text-lg text-slate-800">Council Alerts & Critical Movement</h2>
                    <p class="text-xs text-slate-500">Automated SLA breaches, cross-bureau overlap notices, and leadership escalations</p>
                </div>
            </div>

            <!-- Summary Chips -->
            <div id="alert-summary-chips" class="flex flex-wrap gap-2 text-xs">
                <!-- Dynamically populated -->
            </div>

            <!-- Alert Items List -->
            <div id="alerts-list-container" class="space-y-3">
                <div class="py-12 text-center text-slate-400">Loading alerts...</div>
            </div>
        </div>
    `;

    fetchAndRenderAlerts();
}

async function fetchAndRenderAlerts() {
    try {
        const res = await fetch('/api/alerts');
        const data = await res.json();
        state.alerts.data = data.alerts || [];

        renderAlertSummaryChips(data.summary);
        renderAlertItems();
    } catch (e) {
        document.getElementById('alerts-list-container').innerHTML = `
            <div class="p-6 bg-red-50 text-red-700 rounded-xl text-center text-xs font-semibold">
                Failed to load alerts.
            </div>
        `;
    }
}

function renderAlertSummaryChips(summary) {
    const container = document.getElementById('alert-summary-chips');
    if (!container || !summary) return;

    const chips = [
        { key: 'ALL', label: 'All Alerts', count: summary.total, color: 'bg-slate-800 text-white' },
        { key: 'Overlap', label: 'Cross-Bureau Overlaps', count: summary.overlap, color: 'bg-red-100 text-red-800 border border-red-300' },
        { key: 'Overdue', label: 'Overdue SLA', count: summary.overdue, color: 'bg-red-50 text-red-700 border border-red-200' },
        { key: 'Deadline Approaching', label: 'Approaching Deadline', count: summary.deadline_approaching, color: 'bg-amber-100 text-amber-800 border border-amber-300' },
        { key: 'Escalation', label: 'Escalations', count: summary.escalation, color: 'bg-purple-100 text-purple-800 border border-purple-300' },
        { key: 'Long Pending', label: 'Long Pending (>30d)', count: summary.long_pending, color: 'bg-blue-100 text-blue-800 border border-blue-300' },
    ];

    container.innerHTML = chips.map(c => `
        <button onclick="setAlertFilter('${c.key}')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${state.alerts.activeFilter === c.key ? 'ring-2 ring-blue-600 ' + c.color : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}">
            <span>${c.label}</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">${c.count}</span>
        </button>
    `).join('');
}

function setAlertFilter(filterKey) {
    state.alerts.activeFilter = filterKey;
    if (state.alertsData) {
        renderAlertSummaryChips(state.alertsData.summary);
    }
    renderAlertItems();
}

function renderAlertItems() {
    const container = document.getElementById('alerts-list-container');
    if (!container) return;

    let items = state.alerts.data;
    if (state.alerts.activeFilter !== 'ALL') {
        items = items.filter(a => a.type === state.alerts.activeFilter);
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">
                <div class="text-4xl mb-2">✅</div>
                <h4 class="font-bold text-slate-700 text-sm">No alerts in this category</h4>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(a => {
        let stripeColor = 'border-l-rose-500';
        let badgeColor = 'bg-rose-100 text-rose-800';
        if (a.severity === 'Medium') {
            stripeColor = 'border-l-amber-500';
            badgeColor = 'bg-amber-100 text-amber-800';
        }

        let typeIcon = '📌';
        if (a.type === 'Overlap') typeIcon = '⚠️';
        if (a.type === 'Overdue') typeIcon = '⏰';
        if (a.type === 'Deadline Approaching') typeIcon = '⏳';
        if (a.type === 'Escalation') typeIcon = '⚡';
        if (a.type === 'Long Pending') typeIcon = '⌛';

        return `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm border-l-4 ${stripeColor} p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 card-hover transition-smooth cursor-pointer" onclick="handleAlertClick('${a.type}', '${a.case_id}')" title="Click to view details">
                <div class="flex items-start gap-3">
                    <span class="text-xl mt-0.5">${typeIcon}</span>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-xs text-slate-800">${a.type}</span>
                            <span class="px-2 py-0.2 rounded text-[10px] font-bold ${badgeColor}">${a.severity} Severity</span>
                            <span class="text-xs font-mono font-bold text-blue-900">${a.case_id}</span>
                        </div>
                        <div class="font-semibold text-xs text-slate-700 mt-1">${a.institution_name}</div>
                        <p class="text-xs text-slate-600 mt-0.5">${a.message}</p>
                    </div>
                </div>
                <div class="text-[11px] font-mono text-slate-400 whitespace-nowrap self-end sm:self-center">
                    ${a.date}
                </div>
            </div>
        `;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// CASE DETAIL DRAWER (600px Right Slide-over)
// ═══════════════════════════════════════════════════════════════════════════
let activeDrawerCaseId = null;

async function openCaseDrawer(complaintIdOrCaseId) {
    if (!complaintIdOrCaseId) return;
    const drawerContainer = document.getElementById('case-drawer-container');
    const drawerBackdrop = document.getElementById('case-drawer-backdrop');
    const drawerPanel = document.getElementById('case-drawer-panel');
    const bodyContent = document.getElementById('drawer-body-content');
    const actionPanel = document.getElementById('drawer-action-panel');
    if (!drawerContainer || !bodyContent) return;

    // Show drawer structure immediately with smooth slide-in
    drawerContainer.classList.remove('hidden');
    requestAnimationFrame(() => {
        drawerBackdrop.classList.remove('opacity-0');
        drawerBackdrop.classList.add('opacity-100');
        drawerPanel.classList.remove('translate-x-full');
        drawerPanel.classList.add('translate-x-0');
    });

    bodyContent.innerHTML = `
        <div class="py-16 text-center text-slate-400 space-y-3">
            <div class="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div class="text-xs font-medium">Loading comprehensive case dossier...</div>
        </div>
    `;
    actionPanel.innerHTML = '';

    try {
        let endpoint = `/api/complaints/${complaintIdOrCaseId}`;
        // If passed a case_id string like "AICTE-RB-2026-001"
        if (typeof complaintIdOrCaseId === 'string' && complaintIdOrCaseId.startsWith('AICTE-')) {
            const listRes = await fetch(`/api/complaints?q=${encodeURIComponent(complaintIdOrCaseId)}`);
            const items = await listRes.json();
            if (items && items.length > 0) {
                endpoint = `/api/complaints/${items[0].id}`;
            }
        }

        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('Complaint not found');
        const c = await res.json();
        activeDrawerCaseId = c.id;
        state.activeDrawerCase = c;

        // Header badges & identifiers
        document.getElementById('drawer-case-id').textContent = c.case_id;
        document.getElementById('drawer-status-badge').innerHTML = getStatusBadge(c.status);
        document.getElementById('drawer-priority-badge').innerHTML = getPriorityBadge(c.priority);
        document.getElementById('drawer-bureau-badge').innerHTML = getBureauBadge(c.current_bureau);

        // Red Overlap Banner Strip at top of drawer
        const overlapStrip = document.getElementById('drawer-overlap-strip');
        if (c.has_overlap) {
            overlapStrip.classList.remove('hidden');
        } else {
            overlapStrip.classList.add('hidden');
        }

        // Expected disposal SLA check
        const todayStr = new Date().toISOString().split('T')[0];
        const isDisposed = c.status === 'Disposed';
        let disposalBadgeHtml = `<span class="font-semibold text-slate-800">${c.expected_disposal_date || 'N/A'}</span>`;
        if (c.expected_disposal_date && !isDisposed) {
            if (c.expected_disposal_date < todayStr) {
                disposalBadgeHtml = `<span class="inline-flex items-center gap-1 text-rose-600 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-xs">⚠️ Overdue (${c.expected_disposal_date})</span>`;
            } else {
                const diffDays = Math.ceil((new Date(c.expected_disposal_date) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
                if (diffDays <= 7) {
                    disposalBadgeHtml = `<span class="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">⏳ ${diffDays}d remaining (${c.expected_disposal_date})</span>`;
                }
            }
        }

        // Render drawer body content
        bodyContent.innerHTML = `
            <!-- 1. Institution Dossier Block -->
            <div class="bg-gradient-to-r from-blue-50/80 to-slate-50 p-4 rounded-xl border border-blue-200/80 shadow-sm space-y-2">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <a href="#institution/${c.institution_id}" onclick="closeCaseDrawer()" class="font-extrabold text-sm text-blue-900 hover:text-blue-700 hover:underline flex items-center gap-1.5 leading-snug">
                            <span>🏛️ ${c.institution_name}</span>
                            <span class="text-blue-600 text-xs">→</span>
                        </a>
                        <div class="text-[11px] text-slate-500 mt-0.5 font-mono">
                            Permanent ID: <strong class="text-slate-800">${c.institution_permanent_id}</strong>
                        </div>
                    </div>
                    <span class="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex-shrink-0">
                        ${c.institute_category || 'General'}
                    </span>
                </div>
                <div class="text-xs text-slate-600 pt-1.5 border-t border-blue-200/50 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Region: <strong class="text-slate-800">${c.region || 'N/A'}</strong></span>
                </div>
            </div>

            <!-- 2. Case Info Grid -->
            <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Case Metadata & SLA Details</h4>
                <div class="grid grid-cols-2 gap-2.5 text-xs">
                    <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span class="text-[11px] text-slate-400 block font-medium">Category</span>
                        <span class="font-bold text-slate-800 text-xs mt-0.5 block">${c.category}</span>
                    </div>
                    <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span class="text-[11px] text-slate-400 block font-medium">Current Bureau</span>
                        <div class="mt-0.5">${getBureauBadge(c.current_bureau)}</div>
                    </div>
                    <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span class="text-[11px] text-slate-400 block font-medium">Source Bureau</span>
                        <div class="mt-0.5">${getBureauBadge(c.source_bureau)}</div>
                    </div>
                    <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span class="text-[11px] text-slate-400 block font-medium">Assigned Officer</span>
                        <span class="font-semibold text-slate-800 text-xs mt-0.5 block">${c.assigned_officer || 'Unassigned'}</span>
                    </div>
                    <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span class="text-[11px] text-slate-400 block font-medium">Date Received & Age</span>
                        <span class="font-semibold text-slate-800 text-xs mt-0.5 block">${c.received_date} (${c.age_in_days} days ago)</span>
                    </div>
                    <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span class="text-[11px] text-slate-400 block font-medium">Expected Disposal</span>
                        <div class="mt-0.5">${disposalBadgeHtml}</div>
                    </div>
                </div>
            </div>

            <!-- 3. Subject & Allegations Description -->
            <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Allegation & Case Summary</h4>
                <div class="p-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs leading-relaxed shadow-inner">
                    ${c.description}
                </div>
            </div>

            <!-- 4. Last Action & Next Directive -->
            <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5 text-xs">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-blue-950">Next Action Required:</span>
                    <span class="text-[11px] text-slate-500 font-mono">Last: ${c.last_action_date || 'N/A'}</span>
                </div>
                <div class="text-blue-900 font-medium">${c.next_action_required || 'No subsequent directive pending'}</div>
                <div class="text-[11px] text-slate-500 border-t border-blue-200/50 pt-1">
                    <strong>Last Action Taken:</strong> ${c.last_action_taken || 'Complaint registered'}
                </div>
            </div>

            <!-- 5. Linked / Overlapping Cases Panel -->
            <div>
                <div class="flex items-center justify-between mb-2">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <span>Linked / Overlapping Cases</span>
                        ${c.has_overlap ? `<span class="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>` : ''}
                    </h4>
                    <span class="text-[11px] font-semibold text-slate-400 font-mono">
                        ${c.overlap_links ? c.overlap_links.length : 0} match(es)
                    </span>
                </div>
                <div class="space-y-2">
                    ${c.overlap_links && c.overlap_links.length > 0 ? c.overlap_links.map(ol => `
                        <div class="p-3 bg-rose-50/50 border border-rose-200 rounded-xl space-y-2 text-xs">
                            <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="openCaseDrawer(${ol.linked_complaint_id})" class="font-mono font-bold text-blue-900 hover:text-blue-700 underline text-xs flex items-center gap-1">
                                        <span>${ol.case_id}</span>
                                        <span class="text-[10px]">↗</span>
                                    </button>
                                    ${getBureauBadge(ol.bureau)}
                                    <span class="text-[11px] text-slate-600 font-medium">Officer: ${ol.officer}</span>
                                </div>
                                ${getStatusBadge(ol.status)}
                            </div>
                            <div class="text-[11px] text-slate-700 bg-white/80 p-2 rounded border border-rose-100">
                                <span class="font-bold text-rose-900">Why Flagged:</span> ${ol.match_reason}
                                <span class="ml-2 font-mono text-slate-500">(Score: ${ol.confidence_score}%)</span>
                            </div>
                            ${ol.coordination_remarks ? `
                                <div class="text-[11px] text-purple-900 bg-purple-50 p-2 rounded border border-purple-200">
                                    <strong>Coordination Note:</strong> ${ol.coordination_remarks}
                                </div>
                            ` : ''}
                        </div>
                    `).join('') : `
                        <div class="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                            No cross-bureau overlaps or concurrent cases detected for this institution.
                        </div>
                    `}
                </div>
            </div>

            <!-- 6. Action Timeline (Vertical, Newest First) -->
            <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Action History Timeline (Newest First)</h4>
                <div class="space-y-3 relative before:absolute before:inset-0 before:left-[11px] before:w-0.5 before:bg-slate-200">
                    ${(c.action_history || []).slice().reverse().map(a => {
                        let dotColor = 'bg-blue-600';
                        let cardBg = 'bg-white border-slate-200';
                        const isTransfer = a.action_type === 'Transferred';
                        const isEscalate = a.action_type === 'Escalated';
                        const isDisposed = a.action_type === 'Disposed';

                        if (isTransfer) {
                            dotColor = 'bg-purple-600';
                            cardBg = 'bg-purple-50/60 border-purple-200';
                        } else if (isEscalate) {
                            dotColor = 'bg-rose-600';
                            cardBg = 'bg-rose-50/60 border-rose-200';
                        } else if (isDisposed) {
                            dotColor = 'bg-emerald-600';
                            cardBg = 'bg-emerald-50/60 border-emerald-200';
                        }

                        return `
                            <div class="relative pl-7 text-xs">
                                <div class="absolute left-1.5 top-2.5 w-3 h-3 rounded-full ${dotColor} border-2 border-white shadow-sm -translate-x-1/2"></div>
                                <div class="p-3 rounded-xl border ${cardBg} shadow-sm space-y-1">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="flex items-center gap-2">
                                            <span class="font-bold text-slate-800">${a.action_type}</span>
                                            ${getBureauBadge(a.bureau)}
                                        </div>
                                        <span class="text-[11px] text-slate-400 font-mono">${a.action_date ? a.action_date.replace('T', ' ').substring(0, 16) : ''}</span>
                                    </div>
                                    <p class="text-slate-700 leading-relaxed">${a.remarks || 'No remarks recorded'}</p>
                                    <div class="text-[10px] text-slate-400 font-medium">
                                        Handled by Officer: <strong>${a.officer || 'Unassigned'}</strong>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Render "Take Action" Panel at bottom
        renderDrawerActionPanel(c);

    } catch (err) {
        console.error('Drawer error:', err);
        bodyContent.innerHTML = `<div class="py-12 text-center text-rose-600 text-xs font-semibold">Failed to load case details.</div>`;
    }
}

function renderDrawerActionPanel(c) {
    const actionPanel = document.getElementById('drawer-action-panel');
    if (!actionPanel) return;

    // Bureaus excluding current bureau
    const allBureaus = ['RB', 'PGRC', 'APPROVAL'];
    const otherBureaus = allBureaus.filter(b => b !== c.current_bureau);

    actionPanel.innerHTML = `
        <form onsubmit="handleDrawerActionSubmit(event, ${c.id})" class="space-y-3">
            <div class="flex items-center justify-between">
                <span class="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <span>⚡ Take Action on Case</span>
                </span>
                <span class="text-[11px] text-slate-500 font-mono font-bold">${c.case_id}</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 mb-1">Action Type</label>
                    <select id="drawer-action-type" onchange="onDrawerActionTypeChange('${c.current_bureau}')" class="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="Remark">Add Remark</option>
                        <option value="Transferred">Transfer to another Bureau</option>
                        <option value="Escalated">Escalate</option>
                        <option value="Assigned">Assign Officer</option>
                        <option value="Disposed">Mark Disposed</option>
                    </select>
                </div>

                <!-- Target Bureau (shown only for Transfer, excluding current bureau) -->
                <div id="drawer-bureau-container" class="hidden">
                    <label class="block text-[11px] font-bold text-slate-700 mb-1">Receiving Bureau <span class="text-rose-500">*</span></label>
                    <select id="drawer-target-bureau" onchange="loadOfficersForDrawer()" class="w-full border border-purple-300 bg-purple-50 rounded-lg p-2 text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-500 outline-none">
                        ${otherBureaus.map(b => `<option value="${b}">${b}</option>`).join('')}
                    </select>
                </div>

                <!-- Officer Select (shown for Assign) -->
                <div id="drawer-officer-container" class="hidden">
                    <label class="block text-[11px] font-bold text-slate-700 mb-1">Select Officer</label>
                    <select id="drawer-target-officer" class="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="">Loading officers...</option>
                    </select>
                </div>
            </div>

            <div id="transfer-warning-banner" class="hidden p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                ⚠️ Transferring this case to another bureau automatically triggers the AICTE Cross-Bureau Overlap Engine!
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">Remarks & Directives <span class="text-rose-500">*</span></label>
                <textarea id="drawer-remarks" rows="2" required placeholder="Enter remarks, hearing notes, or compliance directives..." class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
            </div>

            <div class="flex items-center justify-end gap-2 pt-1">
                <button type="button" onclick="closeCaseDrawer()" class="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition">
                    Cancel
                </button>
                <button type="submit" id="btn-submit-drawer-action" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5">
                    Submit Action
                </button>
            </div>
        </form>
    `;

    // Preload officers for current bureau in background
    loadOfficersForDrawer(c.current_bureau);
}

function onDrawerActionTypeChange(currentBureau) {
    const type = document.getElementById('drawer-action-type').value;
    const bureauContainer = document.getElementById('drawer-bureau-container');
    const officerContainer = document.getElementById('drawer-officer-container');
    const warning = document.getElementById('transfer-warning-banner');

    if (type === 'Transferred') {
        bureauContainer.classList.remove('hidden');
        warning.classList.remove('hidden');
        officerContainer.classList.add('hidden');
    } else if (type === 'Assigned') {
        bureauContainer.classList.add('hidden');
        warning.classList.add('hidden');
        officerContainer.classList.remove('hidden');
        loadOfficersForDrawer(currentBureau);
    } else {
        bureauContainer.classList.add('hidden');
        warning.classList.add('hidden');
        officerContainer.classList.add('hidden');
    }
}

async function loadOfficersForDrawer(bureauCode) {
    const officerSelect = document.getElementById('drawer-target-officer');
    if (!officerSelect) return;

    const bureau = bureauCode || document.getElementById('drawer-target-bureau')?.value || 'RB';
    try {
        const res = await fetch(`/api/officers?bureau=${bureau}`);
        const officers = await res.json();
        officerSelect.innerHTML = officers.map(o => `<option value="${o.id}">${o.name} (${o.bureau_code})</option>`).join('');
    } catch (e) {
        officerSelect.innerHTML = `<option value="">Error loading officers</option>`;
    }
}

async function handleDrawerActionSubmit(e, complaintId) {
    e.preventDefault();
    const actionType = document.getElementById('drawer-action-type').value;
    const remarks = document.getElementById('drawer-remarks').value;
    const targetBureau = document.getElementById('drawer-target-bureau')?.value;
    const officerId = document.getElementById('drawer-target-officer')?.value;
    const submitBtn = document.getElementById('btn-submit-drawer-action');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    const payload = {
        action_type: actionType,
        remarks: remarks,
    };
    if (actionType === 'Transferred') {
        payload.bureau_code = targetBureau;
    }
    if (actionType === 'Assigned' && officerId) {
        payload.officer_id = parseInt(officerId, 10);
    }

    try {
        const res = await fetch(`/api/complaints/${complaintId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            // Check if a new overlap was triggered
            if (data.new_overlaps && data.new_overlaps.length > 0) {
                const ol = data.new_overlaps[0];
                showToast(`⚠️ New overlap detected with ${ol.case_id} – Coordination Required`, 'error');
            } else {
                showToast(`Action "${actionType}" submitted successfully!`, 'success');
            }

            // Refresh global counters and sidebar badges
            await refreshGlobalCounters();

            // Reload the drawer with the updated complaint state
            await openCaseDrawer(complaintId);

        } else {
            showToast('Failed to record action', 'error');
        }
    } catch (err) {
        showToast('Error communicating with server', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Action';
        }
    }
}

function closeCaseDrawer() {
    const drawerContainer = document.getElementById('case-drawer-container');
    const drawerBackdrop = document.getElementById('case-drawer-backdrop');
    const drawerPanel = document.getElementById('case-drawer-panel');
    if (!drawerContainer) return;

    if (drawerBackdrop) {
        drawerBackdrop.classList.remove('opacity-100');
        drawerBackdrop.classList.add('opacity-0');
    }
    if (drawerPanel) {
        drawerPanel.classList.remove('translate-x-0');
        drawerPanel.classList.add('translate-x-full');
    }

    setTimeout(() => {
        drawerContainer.classList.add('hidden');
        // Refresh visible page behind drawer
        refreshVisiblePage();
    }, 280);
}

function refreshVisiblePage() {
    const hash = window.location.hash || '#dashboard';
    const container = document.getElementById('app-container');
    if (hash === '#dashboard') {
        refreshGlobalCounters().then(() => renderDashboardPage(container));
    } else if (hash === '#cases') {
        fetchAndRenderCases();
    } else if (hash === '#overlaps') {
        loadOverlaps();
    } else if (hash === '#institutions') {
        renderInstitutionsPage(container);
    } else if (hash.startsWith('#institution/')) {
        const id = hash.replace('#institution/', '');
        renderInstitutionProfilePage(container, id);
    } else if (hash === '#alerts') {
        loadAlerts();
    }
}

function handleAlertClick(type, caseId) {
    if (type === 'Overlap') {
        window.location.hash = '#overlaps';
    } else if (caseId) {
        openCaseDrawer(caseId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO RESET & PRESENTATION SCRIPT HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function confirmResetDemo() {
    if (!confirm('This will restore the original demo data. Continue?')) {
        return;
    }
    try {
        const res = await fetch('/api/demo/reset', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'reset') {
            showToast('Demo data restored to original seeded state!', 'success');
            await refreshGlobalCounters();
            renderRoute(window.location.hash || '#dashboard');
        } else {
            showToast('Reset failed', 'error');
        }
    } catch (e) {
        showToast('Error resetting demo data', 'error');
    }
}

function toggleDemoGuide() {
    const modal = document.getElementById('demo-guide-modal');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

// Global keyboard listeners: Esc to close drawer/modals, '?' for demo guide
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCaseDrawer();
        const guideModal = document.getElementById('demo-guide-modal');
        if (guideModal && !guideModal.classList.contains('hidden')) {
            toggleDemoGuide();
        }
    } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        toggleDemoGuide();
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 4: INSTITUTIONS DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════
let institutionsCache = null;
let institutionsSearchTerm = '';

async function renderInstitutionsPage(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <!-- Header Card -->
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 class="font-extrabold text-lg text-slate-800 flex items-center gap-2">
                        <span>🏛️ Institutions Directory</span>
                        <span id="inst-total-badge" class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 font-mono">25</span>
                    </h2>
                    <p class="text-xs text-slate-500 mt-0.5">Comprehensive tracking of all AICTE-approved institutions and cross-bureau complaint activity</p>
                </div>
                <div class="flex items-center gap-2.5 w-full sm:w-auto">
                    <div class="relative flex-1 sm:w-80">
                        <svg class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <input type="text" id="inst-search-input" value="${institutionsSearchTerm}" oninput="handleInstitutionSearch(this.value)" placeholder="Search by name or permanent ID..." class="w-full pl-9 pr-3.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <a href="/api/reports/institution.csv" target="_blank" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition flex items-center gap-1 whitespace-nowrap shadow-sm">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        Export CSV
                    </a>
                </div>
            </div>

            <!-- List Container -->
            <div id="institutions-list-container">
                <div class="py-12 text-center text-slate-400 text-xs font-medium">Loading institutions...</div>
            </div>
        </div>
    `;

    try {
        const res = await fetch('/api/institutions');
        institutionsCache = await res.json();
        filterAndRenderInstitutionsList();
    } catch (e) {
        document.getElementById('institutions-list-container').innerHTML = `<div class="py-8 text-center text-rose-600 text-xs">Failed to load institutions.</div>`;
    }
}

function handleInstitutionSearch(term) {
    institutionsSearchTerm = term.toLowerCase().trim();
    filterAndRenderInstitutionsList();
}

function filterAndRenderInstitutionsList() {
    const container = document.getElementById('institutions-list-container');
    if (!container || !institutionsCache) return;

    let items = institutionsCache;
    if (institutionsSearchTerm) {
        items = items.filter(inst =>
            inst.name.toLowerCase().includes(institutionsSearchTerm) ||
            inst.permanent_id.toLowerCase().includes(institutionsSearchTerm) ||
            (inst.city && inst.city.toLowerCase().includes(institutionsSearchTerm)) ||
            (inst.region && inst.region.toLowerCase().includes(institutionsSearchTerm))
        );
    }

    const badge = document.getElementById('inst-total-badge');
    if (badge) badge.textContent = items.length;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
                No institutions matching "${institutionsSearchTerm}".
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr class="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                            <th class="py-3 px-4">Permanent ID</th>
                            <th class="py-3 px-4">Institution Name</th>
                            <th class="py-3 px-4">Category & Region</th>
                            <th class="py-3 px-4 text-center">Total Cases</th>
                            <th class="py-3 px-4 text-center">Active</th>
                            <th class="py-3 px-4">Active Bureaus</th>
                            <th class="py-3 px-4">Overlap Status</th>
                            <th class="py-3 px-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${items.map(inst => `
                            <tr class="hover:bg-blue-50/40 transition cursor-pointer" onclick="window.location.hash = '#institution/${inst.id}'">
                                <td class="py-3 px-4 font-mono font-bold text-blue-900">${inst.permanent_id}</td>
                                <td class="py-3 px-4">
                                    <div class="font-bold text-slate-800">${inst.name}</div>
                                    <div class="text-[11px] text-slate-400">${inst.city}, ${inst.state}</div>
                                </td>
                                <td class="py-3 px-4">
                                    <span class="font-medium text-slate-700">${inst.institute_category || 'Engineering'}</span>
                                    <span class="text-slate-400 text-[11px] block">${inst.region} Region</span>
                                </td>
                                <td class="py-3 px-4 text-center">
                                    <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 font-mono">
                                        ${inst.total_complaints}
                                    </span>
                                </td>
                                <td class="py-3 px-4 text-center">
                                    <span class="px-2 py-0.5 rounded-full text-xs font-bold ${inst.active_complaints > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'} font-mono">
                                        ${inst.active_complaints}
                                    </span>
                                </td>
                                <td class="py-3 px-4">
                                    <div class="flex items-center gap-1 flex-wrap">
                                        ${(inst.active_bureaus && inst.active_bureaus.length > 0) ? inst.active_bureaus.map(b => getBureauBadge(b)).join('') : '<span class="text-slate-400 text-[11px]">None active</span>'}
                                    </div>
                                </td>
                                <td class="py-3 px-4">
                                    ${inst.has_overlap ? `
                                        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-sm">
                                            <span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                                            Overlap Active
                                        </span>
                                    ` : `
                                        <span class="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Clear
                                        </span>
                                    `}
                                </td>
                                <td class="py-3 px-4 text-right">
                                    <span class="font-bold text-blue-600 hover:text-blue-800 text-xs">View Profile →</span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 5: INSTITUTION PROFILE (#institution/<id>)
// ═══════════════════════════════════════════════════════════════════════════
async function renderInstitutionProfilePage(container, id) {
    container.innerHTML = `
        <div class="py-12 text-center text-slate-400 text-xs font-medium">
            <div class="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <div>Loading institution profile and historical complaints...</div>
        </div>
    `;

    try {
        const res = await fetch(`/api/institutions/${id}`);
        if (!res.ok) throw new Error('Not found');
        const inst = await res.json();
        const s = inst.stats || {};

        container.innerHTML = `
            <div class="space-y-5">
                <!-- Navigation Breadcrumb -->
                <div class="flex items-center justify-between">
                    <a href="#institutions" class="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 hover:text-blue-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition">
                        <span>← Back to Institutions</span>
                    </a>
                    <a href="/api/reports/institution.csv" target="_blank" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition flex items-center gap-1 shadow-sm">
                        <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        Download Report
                    </a>
                </div>

                <!-- Header Card -->
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                            <div class="flex items-center gap-2.5 flex-wrap">
                                <h1 class="text-xl font-bold text-blue-950">${inst.name}</h1>
                                <span class="px-2.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 font-mono">
                                    PID: ${inst.permanent_id}
                                </span>
                                <span class="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    ${inst.institute_category || 'Engineering'}
                                </span>
                            </div>
                            <p class="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                <span>📍 ${inst.address}, ${inst.city}, ${inst.state}</span>
                                <span>•</span>
                                <span class="font-semibold text-slate-700">${inst.region} Region</span>
                            </p>
                        </div>
                    </div>

                    <!-- Bureau Involvement Strip -->
                    <div class="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="flex items-center gap-2 text-xs flex-wrap">
                            <span class="font-bold text-slate-700">Active Bureau Involvement:</span>
                            ${(s.active_bureaus && s.active_bureaus.length > 0) ? s.active_bureaus.map(b => `
                                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold border border-slate-200 text-xs">
                                    ${getBureauBadge(b.code)}
                                    <span class="font-mono font-bold text-blue-900">${b.count} active</span>
                                </span>
                            `).join('') : '<span class="text-slate-400 italic">No active cases across any bureau</span>'}
                        </div>
                    </div>

                    <!-- Red Overlap Banner if multiple bureaus active or open overlaps -->
                    ${(s.has_cross_bureau_overlap || (s.active_bureaus && s.active_bureaus.length > 1)) ? `
                        <div class="bg-gradient-to-r from-red-600 to-rose-600 text-white p-3.5 rounded-xl shadow flex items-center justify-between gap-3 animate-in fade-in duration-300">
                            <div class="flex items-center gap-3">
                                <span class="text-xl">⚠️</span>
                                <div>
                                    <h4 class="font-extrabold text-xs tracking-tight">Potential Overlapping Cases – Coordination Required</h4>
                                    <p class="text-[11px] text-rose-100">Multiple bureaus (${(s.active_bureaus || []).map(b => b.code).join(' & ')}) are actively handling concurrent complaints for this institution.</p>
                                </div>
                            </div>
                            <a href="#overlaps" class="px-3 py-1.5 bg-white text-rose-700 font-bold text-xs rounded-lg hover:bg-rose-50 transition shadow-sm whitespace-nowrap">
                                Review in Overlaps →
                            </a>
                        </div>
                    ` : ''}
                </div>

                <!-- 4 Stat Cards -->
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <span class="text-xs font-medium text-slate-500">Total Complaints</span>
                        <div class="text-2xl font-black text-slate-800 mt-1 font-mono">${s.total || 0}</div>
                        <span class="text-[11px] text-slate-400">All recorded filings</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <span class="text-xs font-medium text-blue-600">Active Cases</span>
                        <div class="text-2xl font-black text-blue-700 mt-1 font-mono">${s.active || 0}</div>
                        <span class="text-[11px] text-slate-400">Pending / Under Process</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <span class="text-xs font-medium text-emerald-600">Disposed Cases</span>
                        <div class="text-2xl font-black text-emerald-700 mt-1 font-mono">${s.disposed || 0}</div>
                        <span class="text-[11px] text-slate-400">Resolved & Closed</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <span class="text-xs font-medium text-rose-600">Open Overlaps</span>
                        <div class="text-2xl font-black text-rose-600 mt-1 font-mono">${s.open_overlaps || 0}</div>
                        <span class="text-[11px] text-slate-400">Cross-bureau flags</span>
                    </div>
                </div>

                <!-- Complaints by Category Mini Chart + Summary -->
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-bold text-sm text-slate-800">Complaints by Category for this Institution</h3>
                        <span class="text-xs text-slate-400">Intake breakdown</span>
                    </div>
                    <div class="h-48 w-full">
                        <canvas id="chart-institution-category"></canvas>
                    </div>
                </div>

                <!-- Consolidated Complaint History Table -->
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h3 class="font-bold text-sm text-slate-800">Consolidated Complaint History</h3>
                            <p class="text-[11px] text-slate-500">Sorted newest first • Click any complaint to open the dossier drawer</p>
                        </div>
                        <span class="text-xs font-mono font-bold text-slate-600">${inst.complaints?.length || 0} complaints</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr class="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                                    <th class="py-2.5 px-3.5">Case ID</th>
                                    <th class="py-2.5 px-3.5">Category</th>
                                    <th class="py-2.5 px-3.5">Bureau</th>
                                    <th class="py-2.5 px-3.5">Officer</th>
                                    <th class="py-2.5 px-3.5">Status</th>
                                    <th class="py-2.5 px-3.5">Priority</th>
                                    <th class="py-2.5 px-3.5">Received Date</th>
                                    <th class="py-2.5 px-3.5">Last Action Taken</th>
                                    <th class="py-2.5 px-3.5">Next Action</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${(inst.complaints || []).map(c => `
                                    <tr class="hover:bg-blue-50/50 transition cursor-pointer" onclick="openCaseDrawer(${c.id})">
                                        <td class="py-2.5 px-3.5 font-mono font-bold text-blue-900">${c.case_id}</td>
                                        <td class="py-2.5 px-3.5 font-semibold text-slate-700">${c.category}</td>
                                        <td class="py-2.5 px-3.5">${getBureauBadge(c.current_bureau)}</td>
                                        <td class="py-2.5 px-3.5 text-slate-600 truncate max-w-[120px]">${c.assigned_officer || 'Unassigned'}</td>
                                        <td class="py-2.5 px-3.5">${getStatusBadge(c.status)}</td>
                                        <td class="py-2.5 px-3.5">${getPriorityBadge(c.priority)}</td>
                                        <td class="py-2.5 px-3.5 font-mono text-slate-600">${c.received_date}</td>
                                        <td class="py-2.5 px-3.5 text-slate-600 truncate max-w-[180px]" title="${c.last_action_taken || ''}">${c.last_action_taken || 'N/A'}</td>
                                        <td class="py-2.5 px-3.5 text-blue-800 truncate max-w-[180px]" title="${c.next_action_required || ''}">${c.next_action_required || 'None'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Render category mini chart
        const ctxInst = document.getElementById('chart-institution-category')?.getContext('2d');
        if (ctxInst && s.by_category) {
            const labels = Object.keys(s.by_category);
            const data = Object.values(s.by_category);
            state.charts.instCategory = new Chart(ctxInst, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Complaints',
                        data: data,
                        backgroundColor: '#2563eb',
                        borderRadius: 4,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

    } catch (e) {
        container.innerHTML = `<div class="p-8 text-center text-rose-600 text-xs">Failed to load institution profile.</div>`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 6: REPORTS & EXPORTS (#reports)
// ═══════════════════════════════════════════════════════════════════════════
let reportsComplaintsFilter = { bureau: '', status: '' };

async function renderReportsPage(container) {
    container.innerHTML = `
        <div class="space-y-6">
            <!-- Header with Print Button -->
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 class="font-extrabold text-lg text-slate-800 flex items-center gap-2">
                        <span>📊 AICTE Reports & Intelligence Exports</span>
                    </h2>
                    <p class="text-xs text-slate-500 mt-0.5">Download standardized offline CSV registries or generate printable summaries.</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="window.print()" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-2">
                        <svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        <span>Print this page</span>
                    </button>
                </div>
            </div>

            <!-- Reports Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" id="reports-grid-cards">
                <div class="py-12 text-center text-slate-400 col-span-full">Loading report previews...</div>
            </div>

            <!-- Full-width: Complaints Register Card with mini filter -->
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="report-complaints-card">
                <!-- Dynamically populated -->
            </div>

            <!-- Full-width: Monthly Performance Card -->
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="report-monthly-card">
                <!-- Dynamically populated -->
            </div>
        </div>
    `;

    loadReportsContent();
}

async function loadReportsContent() {
    try {
        const [statsRes, instsRes, overlapsRes, compsRes] = await Promise.all([
            fetch('/api/stats'),
            fetch('/api/institutions'),
            fetch('/api/overlaps'),
            fetch('/api/complaints?limit=5')
        ]);
        const stats = await statsRes.json();
        const insts = await instsRes.json();
        const overlaps = await overlapsRes.json();
        const complaints = await compsRes.json();

        // 1. Bureau-wise Card
        const bureauHtml = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4.5 flex flex-col justify-between space-y-3">
                <div>
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-sm text-slate-800">Bureau-wise Performance</h3>
                        <span class="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">3 Bureaus</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">Complaints workload, active backlog, and disposal efficiency by bureau.</p>
                    <div class="mt-3 overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[10px] uppercase">
                                    <th class="py-1.5 px-2">Bureau</th>
                                    <th class="py-1.5 px-2 text-right">Total</th>
                                    <th class="py-1.5 px-2 text-right">Active</th>
                                    <th class="py-1.5 px-2 text-right">Disp. %</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${(stats.by_bureau || []).map(b => `
                                    <tr>
                                        <td class="py-1.5 px-2 font-bold">${b.code}</td>
                                        <td class="py-1.5 px-2 text-right font-mono">${b.total}</td>
                                        <td class="py-1.5 px-2 text-right font-mono text-blue-700">${b.active}</td>
                                        <td class="py-1.5 px-2 text-right font-mono font-bold text-emerald-600">${b.disposal_rate}%</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="pt-2 border-t border-slate-100 flex justify-end">
                    <a href="/api/reports/bureau.csv" target="_blank" class="w-full text-center py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded-lg border border-blue-200 transition">
                        Download CSV
                    </a>
                </div>
            </div>
        `;

        // 2. Region-wise Card
        const regionHtml = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4.5 flex flex-col justify-between space-y-3">
                <div>
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-sm text-slate-800">Region-wise Distribution</h3>
                        <span class="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">5 Regions</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">Geographic intake volumes across Northern, Southern, Eastern, Western, Central.</p>
                    <div class="mt-3 overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[10px] uppercase">
                                    <th class="py-1.5 px-2">Region</th>
                                    <th class="py-1.5 px-2 text-right">Complaints</th>
                                    <th class="py-1.5 px-2 text-right">Share (%)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${Object.entries(stats.by_region || {}).map(([r, count]) => {
                                    const share = stats.totals.total > 0 ? ((count / stats.totals.total) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td class="py-1.5 px-2 font-medium">${r}</td>
                                            <td class="py-1.5 px-2 text-right font-mono font-bold">${count}</td>
                                            <td class="py-1.5 px-2 text-right font-mono text-slate-500">${share}%</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="pt-2 border-t border-slate-100 flex justify-end">
                    <a href="/api/reports/region.csv" target="_blank" class="w-full text-center py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-lg border border-indigo-200 transition">
                        Download CSV
                    </a>
                </div>
            </div>
        `;

        // 3. Institution-wise Card
        const instHtml = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4.5 flex flex-col justify-between space-y-3">
                <div>
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-sm text-slate-800">Institution-wise Registry</h3>
                        <span class="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">25 Institutions</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">Total filings, active cases, and cross-bureau overlap flags per institution.</p>
                    <div class="mt-3 overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[10px] uppercase">
                                    <th class="py-1.5 px-2">Institution</th>
                                    <th class="py-1.5 px-2 text-right">Total</th>
                                    <th class="py-1.5 px-2 text-right">Active</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${(insts || []).slice(0, 5).map(i => `
                                    <tr>
                                        <td class="py-1.5 px-2 font-medium truncate max-w-[140px]" title="${i.name}">${i.name}</td>
                                        <td class="py-1.5 px-2 text-right font-mono font-bold">${i.total_complaints}</td>
                                        <td class="py-1.5 px-2 text-right font-mono text-blue-700">${i.active_complaints}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="pt-2 border-t border-slate-100 flex justify-end">
                    <a href="/api/reports/institution.csv" target="_blank" class="w-full text-center py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-lg border border-amber-200 transition">
                        Download CSV
                    </a>
                </div>
            </div>
        `;

        // 4. Pending Ageing Card
        const ageingHtml = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4.5 flex flex-col justify-between space-y-3">
                <div>
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-sm text-slate-800">Pending Ageing SLA</h3>
                        <span class="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded">SLA Analysis</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">Age distribution of non-disposed complaints across 15-day intervals.</p>
                    <div class="mt-3 overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[10px] uppercase">
                                    <th class="py-1.5 px-2">Bucket</th>
                                    <th class="py-1.5 px-2 text-right">Complaints</th>
                                    <th class="py-1.5 px-2 text-right">Risk Level</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${Object.entries(stats.ageing || {}).map(([b, count]) => {
                                    let risk = 'Normal';
                                    let color = 'text-slate-500';
                                    if (b === '31-60') { risk = 'Moderate'; color = 'text-amber-600 font-bold'; }
                                    if (b === '60+') { risk = 'Critical'; color = 'text-rose-600 font-bold'; }
                                    return `
                                        <tr>
                                            <td class="py-1.5 px-2 font-medium">${b} Days</td>
                                            <td class="py-1.5 px-2 text-right font-mono font-bold">${count}</td>
                                            <td class="py-1.5 px-2 text-right ${color} text-[11px]">${risk}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="pt-2 border-t border-slate-100 flex justify-end">
                    <a href="/api/reports/ageing.csv" target="_blank" class="w-full text-center py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold rounded-lg border border-rose-200 transition">
                        Download CSV
                    </a>
                </div>
            </div>
        `;

        // 5. Overlapping Cases Card
        const overlapsHtml = `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4.5 flex flex-col justify-between space-y-3">
                <div>
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-sm text-slate-800">Overlapping Cases Log</h3>
                        <span class="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Cross-Bureau</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">Matched concurrent complaints requiring harmonization and review.</p>
                    <div class="mt-3 overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[10px] uppercase">
                                    <th class="py-1.5 px-2">Cases</th>
                                    <th class="py-1.5 px-2">Match Reason</th>
                                    <th class="py-1.5 px-2 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${(overlaps || []).slice(0, 5).map(o => `
                                    <tr>
                                        <td class="py-1.5 px-2 font-mono font-bold text-[11px]">${o.complaint_a?.case_id} & ${o.complaint_b?.case_id}</td>
                                        <td class="py-1.5 px-2 truncate max-w-[130px] text-slate-600 text-[11px]" title="${o.match_reason}">${o.match_reason}</td>
                                        <td class="py-1.5 px-2 text-right">${getStatusBadge(o.status)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="pt-2 border-t border-slate-100 flex justify-end">
                    <a href="/api/reports/overlaps.csv" target="_blank" class="w-full text-center py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold rounded-lg border border-purple-200 transition">
                        Download CSV
                    </a>
                </div>
            </div>
        `;

        document.getElementById('reports-grid-cards').innerHTML = bureauHtml + regionHtml + instHtml + ageingHtml + overlapsHtml;

        // 6. Full Complaints Register with Mini Filter
        renderComplaintsRegisterReportCard(complaints);

        // 7. Monthly Performance Card
        renderMonthlyPerformanceCard(stats);

    } catch (e) {
        console.error('Reports load error:', e);
    }
}

async function renderComplaintsRegisterReportCard(previewComplaints) {
    const card = document.getElementById('report-complaints-card');
    if (!card) return;

    const b = reportsComplaintsFilter.bureau;
    const s = reportsComplaintsFilter.status;
    let csvUrl = `/api/reports/complaints.csv?`;
    if (b) csvUrl += `bureau=${b}&`;
    if (s) csvUrl += `status=${s}&`;

    card.innerHTML = `
        <div class="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70">
            <div>
                <h3 class="font-extrabold text-base text-slate-800">Full Complaints Register Export</h3>
                <p class="text-xs text-slate-500">Comprehensive ledger of all filed complaints with audit logs and bureau routing details.</p>
            </div>
            <!-- Mini Filter -->
            <div class="flex items-center gap-2.5 flex-wrap">
                <div>
                    <label class="text-[10px] font-bold text-slate-500 block mb-0.5">Filter Bureau:</label>
                    <select id="report-filter-bureau" onchange="onReportFilterChange()" class="border border-slate-300 rounded-lg p-1.5 text-xs bg-white font-medium outline-none">
                        <option value="">All Bureaus</option>
                        <option value="RB" ${b === 'RB' ? 'selected' : ''}>RB</option>
                        <option value="PGRC" ${b === 'PGRC' ? 'selected' : ''}>PGRC</option>
                        <option value="APPROVAL" ${b === 'APPROVAL' ? 'selected' : ''}>APPROVAL</option>
                    </select>
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 block mb-0.5">Filter Status:</label>
                    <select id="report-filter-status" onchange="onReportFilterChange()" class="border border-slate-300 rounded-lg p-1.5 text-xs bg-white font-medium outline-none">
                        <option value="">All Statuses</option>
                        <option value="Pending" ${s === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Under Process" ${s === 'Under Process' ? 'selected' : ''}>Under Process</option>
                        <option value="Disposed" ${s === 'Disposed' ? 'selected' : ''}>Disposed</option>
                        <option value="Transferred" ${s === 'Transferred' ? 'selected' : ''}>Transferred</option>
                        <option value="Escalated" ${s === 'Escalated' ? 'selected' : ''}>Escalated</option>
                    </select>
                </div>
                <div class="self-end">
                    <a id="btn-download-complaints-csv" href="${csvUrl}" target="_blank" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        <span>Download Filtered CSV</span>
                    </a>
                </div>
            </div>
        </div>
        <!-- Preview Table (Top 5) -->
        <div class="overflow-x-auto p-4">
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[11px]">
                        <th class="py-2 px-3">Case ID</th>
                        <th class="py-2 px-3">Institution</th>
                        <th class="py-2 px-3">Category</th>
                        <th class="py-2 px-3">Bureau</th>
                        <th class="py-2 px-3">Officer</th>
                        <th class="py-2 px-3">Status</th>
                        <th class="py-2 px-3">Expected Disposal</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100" id="report-complaints-tbody">
                    ${(previewComplaints || []).map(c => `
                        <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="openCaseDrawer(${c.id})">
                            <td class="py-2 px-3 font-mono font-bold text-blue-900">${c.case_id}</td>
                            <td class="py-2 px-3 font-medium text-slate-800">${c.institution_name}</td>
                            <td class="py-2 px-3 text-slate-600">${c.category}</td>
                            <td class="py-2 px-3">${getBureauBadge(c.current_bureau)}</td>
                            <td class="py-2 px-3 text-slate-600">${c.assigned_officer || 'Unassigned'}</td>
                            <td class="py-2 px-3">${getStatusBadge(c.status)}</td>
                            <td class="py-2 px-3 font-mono text-slate-600">${c.expected_disposal_date || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function onReportFilterChange() {
    const b = document.getElementById('report-filter-bureau')?.value || '';
    const s = document.getElementById('report-filter-status')?.value || '';
    reportsComplaintsFilter.bureau = b;
    reportsComplaintsFilter.status = s;

    let query = `/api/complaints?limit=5`;
    if (b) query += `&bureau=${b}`;
    if (s) query += `&status=${s}`;

    try {
        const res = await fetch(query);
        const complaints = await res.json();
        renderComplaintsRegisterReportCard(complaints);
    } catch (e) {
        console.error('Filter preview error:', e);
    }
}

function renderMonthlyPerformanceCard(stats) {
    const card = document.getElementById('report-monthly-card');
    if (!card) return;

    card.innerHTML = `
        <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div>
                <h3 class="font-extrabold text-base text-slate-800">Monthly Performance & Bureau Efficiency</h3>
                <p class="text-xs text-slate-500">Intake volume trend across the last 6 months combined with bureau resolution metrics.</p>
            </div>
            <span class="text-xs font-mono font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-full">
                Avg Disposal: ${stats.avg_disposal_days || 0} days
            </span>
        </div>
        <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Monthly Intake Table -->
            <div>
                <h4 class="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Monthly Intake Trend (Last 6 Months)</h4>
                <div class="overflow-x-auto border border-slate-200 rounded-xl">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[11px]">
                                <th class="py-2 px-3">Month</th>
                                <th class="py-2 px-3 text-right">Complaints Received</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${(stats.monthly_trend || []).map(m => `
                                <tr>
                                    <td class="py-2 px-3 font-semibold text-slate-800">${m.month}</td>
                                    <td class="py-2 px-3 text-right font-mono font-bold text-blue-900">${m.count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Bureau Resolution Efficiency Table -->
            <div>
                <h4 class="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Bureau Resolution Efficiency</h4>
                <div class="overflow-x-auto border border-slate-200 rounded-xl">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 font-semibold border-b text-[11px]">
                                <th class="py-2 px-3">Bureau</th>
                                <th class="py-2 px-3 text-right">Total Filings</th>
                                <th class="py-2 px-3 text-right">Disposed</th>
                                <th class="py-2 px-3 text-right">Disposal Rate</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${(stats.by_bureau || []).map(b => `
                                <tr>
                                    <td class="py-2 px-3 font-bold">${b.name} (${b.code})</td>
                                    <td class="py-2 px-3 text-right font-mono">${b.total}</td>
                                    <td class="py-2 px-3 text-right font-mono text-emerald-700 font-semibold">${b.disposed}</td>
                                    <td class="py-2 px-3 text-right font-mono font-bold text-emerald-600">${b.disposal_rate}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════════════════
// UI Badges & Formatting Helpers
// ═══════════════════════════════════════════════════════════════════════════
function getStatusBadge(status, idAttr = '') {
    const id = idAttr ? `id="${idAttr}"` : '';
    switch (status) {
        case 'Pending':
            return `<span ${id} class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Pending</span>`;
        case 'Under Process':
            return `<span ${id} class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">Under Process</span>`;
        case 'Disposed':
            return `<span ${id} class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Disposed</span>`;
        case 'Transferred':
            return `<span ${id} class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">Transferred</span>`;
        case 'Escalated':
            return `<span ${id} class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">Escalated</span>`;
        default:
            return `<span ${id} class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">${status}</span>`;
    }
}

function getBureauBadge(bureau) {
    switch (bureau) {
        case 'RB':
            return `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">RB</span>`;
        case 'PGRC':
            return `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">PGRC</span>`;
        case 'APPROVAL':
            return `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300">APPROVAL</span>`;
        default:
            return `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${bureau || 'N/A'}</span>`;
    }
}

function getPriorityBadge(priority, idAttr = '') {
    const id = idAttr ? `id="${idAttr}"` : '';
    switch (priority) {
        case 'High':
            return `<span ${id} class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">High</span>`;
        case 'Medium':
            return `<span ${id} class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Medium</span>`;
        case 'Low':
            return `<span ${id} class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Low</span>`;
        default:
            return `<span ${id} class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">${priority}</span>`;
    }
}

function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// Toast Notifications
// ═══════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let bg = 'bg-slate-900 text-white';
    if (type === 'success') bg = 'bg-emerald-600 text-white';
    if (type === 'error') bg = 'bg-rose-600 text-white';

    toast.className = `toast px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 ${bg}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
