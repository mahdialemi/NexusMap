var dCharts = {};

(function() {
    var css = document.createElement('style');
    css.textContent =
        '.db-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}' +
        '.db-header h2{font-size:1.3rem;font-weight:600;margin:0;}' +
        '.db-header-actions{display:flex;gap:8px;}' +
        '.db-section{margin-bottom:24px;}' +
        '.db-section-title{font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;}' +
        '.db-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}' +
        '.db-card{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px 16px;transition:border-color 0.2s,transform 0.15s;}' +
        '.db-card:hover{border-color:var(--accent);transform:translateY(-1px);}' +
        '.db-card-label{font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;}' +
        '.db-card-value{font-size:1.4rem;font-weight:700;line-height:1.2;}' +
        '.db-card-sub{font-size:0.72rem;color:var(--text-muted);margin-top:2px;}' +
        '.db-charts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}' +
        '.db-charts-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}' +
        '.db-chart-card{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px;}' +
        '.db-chart-title{font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;}' +
        '.db-chart-body{position:relative;height:160px;}' +
        '.db-table-wrap{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;overflow:hidden;}' +
        '.db-scan-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-left:3px solid;cursor:pointer;transition:background 0.15s;border-bottom:1px solid var(--border);}' +
        '.db-scan-item:last-child{border-bottom:none;}' +
        '.db-scan-item:hover{background:rgba(255,255,255,0.03);}' +
        '.db-scan-info{flex:1;min-width:0;}' +
        '.db-scan-top{display:flex;align-items:center;gap:8px;margin-bottom:2px;}' +
        '.db-scan-project{font-weight:600;font-size:0.85rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.db-scan-target{font-size:0.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.db-scan-bottom{display:flex;align-items:center;gap:12px;}' +
        '.db-scan-meta{font-size:0.7rem;color:var(--text-muted);display:flex;align-items:center;gap:4px;}' +
        '.db-scan-id{color:var(--accent);font-size:0.7rem;font-weight:600;}' +
        '.db-act-item{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);}' +
        '.db-act-item:last-child{border-bottom:none;}' +
        '.db-act-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
        '.db-act-body{flex:1;min-width:0;}' +
        '.db-act-action{font-size:0.82rem;font-weight:500;}' +
        '.db-act-details{font-size:0.75rem;color:var(--text-muted);margin-top:1px;word-break:break-word;}' +
        '.db-act-meta{font-size:0.68rem;color:var(--text-muted);margin-top:3px;display:flex;gap:8px;}' +
        '.db-empty{padding:40px;text-align:center;color:var(--text-muted);}' +
        '.db-empty-icon{margin-bottom:8px;opacity:0.3;}' +
        '@media(max-width:768px){.db-charts,.db-charts-2{grid-template-columns:1fr;}' +
        '.db-cards{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));}}' +
        '@media(max-width:480px){.db-cards{grid-template-columns:repeat(2,1fr);}}' +
        '#dashboard-content{flex:1;overflow-y:auto;min-height:0;}';
    document.head.appendChild(css);
})();

async function initDashboard() {
    initCSRF();
    currentUser = await me();
    if (!currentUser) { window.location.href = '/login'; return; }
    document.getElementById('user-info').textContent = currentUser.username;
    if (currentUser.role === 'admin') {
        var al = document.getElementById('admin-link');
        if (al) al.style.display = '';
    }
    await loadDashboard();
}

async function loadDashboard() {
    var container = document.getElementById('dashboard-content');
    try {
        var res = await fetch('/api/stats/global');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var stats = await res.json();
        renderDashboard(container, stats);
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p style="color:#ef4444;">' + t('dashboard.load_error') + esc(e.message) + '</p></div>';
    }
}

function refreshDashboard() { loadDashboard(); }

function card(label, value, color, sub) {
    return '<div class="db-card"><div class="db-card-label">' + label + '</div><div class="db-card-value" style="color:' + color + ';">' + value + '</div>' + (sub ? '<div class="db-card-sub">' + sub + '</div>' : '') + '</div>';
}

function actIcon(action) {
    var a = (action || '').toLowerCase();
    if (a.indexOf('create') >= 0 || a.indexOf('add') >= 0) return {color:'#22c55e',bg:'rgba(34,197,94,0.15)',icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'};
    if (a.indexOf('delete') >= 0 || a.indexOf('remove') >= 0) return {color:'#ef4444',bg:'rgba(239,68,68,0.15)',icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'};
    if (a.indexOf('login') >= 0) return {color:'#3b82f6',bg:'rgba(59,130,246,0.15)',icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>'};
    if (a.indexOf('scan') >= 0 || a.indexOf('run') >= 0) return {color:'#e6952e',bg:'rgba(230,149,46,0.15)',icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'};
    if (a.indexOf('update') >= 0 || a.indexOf('edit') >= 0 || a.indexOf('change') >= 0) return {color:'#4fc4cf',bg:'rgba(79,196,207,0.15)',icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'};
    return {color:'#8a88a0',bg:'rgba(138,136,160,0.15)',icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'};
}

function chartRow(id1, id2, id3) {
    return '<div class="db-chart-card"><div class="db-chart-title">' + id1 + '</div><div class="db-chart-body"><canvas id="c-' + id2 + '"></canvas></div></div>';
}

function renderDashboard(container, s) {
    var html = '';

    html += '<div class="db-header"><h2>' + t('dashboard.title') + '</h2><div class="db-header-actions"><button class="btn btn-secondary btn-sm" data-action="refreshDashboard"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' + t('dashboard.refresh') + '</button></div></div>';

    html += '<div class="db-section"><div class="db-section-title">' + t('dashboard.projects_scans') + '</div><div class="db-cards">' +
        card(t('dashboard.total_projects'), s.total_projects, '#4fc4cf') +
        card(t('dashboard.active_projects'), s.active_projects, '#22c55e') +
        card(t('dashboard.total_scans'), s.total_scans, '#e6952e') +
        card(t('dashboard.running'), s.running_scans, '#3b82f6', s.running_scans ? t('dashboard.in_progress') : '') +
        card(t('dashboard.completed'), s.completed_scans, '#22c55e') +
        card(t('dashboard.failed'), s.failed_scans, '#ef4444') +
    '</div></div>';

    html += '<div class="db-section"><div class="db-section-title">' + t('dashboard.assets') + '</div><div class="db-cards">' +
        card(t('dashboard.total_hosts'), s.total_hosts, '#45c486') +
        card(t('dashboard.total_ports'), s.total_ports, '#9b87f5') +
        card(t('dashboard.open_ports'), s.open_port_count, '#22c55e') +
        card(t('dashboard.high_risk'), s.high_risk_port_count, '#ef4444', t('dashboard.ports_in_top_25')) +
        card(t('dashboard.services'), s.unique_services, '#e8b84b') +
        card(t('dashboard.live_hosts'), s.total_live_hosts, '#4fc4cf') +
    '</div></div>';

    // Charts row 1
    html += '<div class="db-section"><div class="db-section-title">' + t('dashboard.charts') + '</div><div class="db-charts">' +
        chartRow(t('dashboard.scans_last_30_days'), 'scans', 'scans') +
        chartRow(t('dashboard.top_services'), 'services', 'services') +
        chartRow(t('dashboard.top_ports'), 'ports', 'ports') +
    '</div></div>';

    // Charts row 2
    html += '<div class="db-charts" style="margin-bottom:24px;">' +
        chartRow(t('dashboard.scan_status'), 'scan-status', 'scan-status') +
        chartRow(t('dashboard.port_state'), 'port-state', 'port-state') +
        chartRow(t('dashboard.projects_by_priority'), 'priority', 'priority') +
    '</div>';

    // Charts row 3 (2 columns)
    html += '<div class="db-charts-2" style="margin-bottom:24px;">' +
        chartRow(t('dashboard.top_os'), 'os', 'os') +
        chartRow(t('dashboard.scans_per_project'), 'scans-per-project', 'scans-per-project') +
    '</div>';

    // Recent scans
    if (s.recent_scans && s.recent_scans.length) {
        var rows = '';
        var projColors = ['#4fc4cf','#e6952e','#45c486','#9b87f5','#e8b84b','#e0696a','#3b82f6','#f97316','#a855f7','#22c55e'];
        for (var i = 0; i < s.recent_scans.length; i++) {
            var sc = s.recent_scans[i];
            var statusColor = sc.status === 'completed' ? '#22c55e' : sc.status === 'running' ? '#3b82f6' : sc.status === 'error' ? '#ef4444' : '#eab308';
            var date = sc.started_at ? formatDate(sc.started_at) : '-';
            var projectAndTarget = sc.target || '-';
            var slashIdx = projectAndTarget.indexOf(' / ');
            var projName = slashIdx !== -1 ? projectAndTarget.substring(0, slashIdx) : '-';
            var targetName = slashIdx !== -1 ? projectAndTarget.substring(slashIdx + 3) : projectAndTarget;
            var duration = '';
            if (sc.started_at && sc.completed_at) {
                var diff = new Date(sc.completed_at) - new Date(sc.started_at);
                if (diff > 0) {
                    var mins = Math.floor(diff / 60000);
                    var secs = Math.floor((diff % 60000) / 1000);
                    duration = (mins > 0 ? mins + t('dashboard.min_short') + ' ' : '') + secs + t('dashboard.sec_short');
                }
            }
            var pColor = projColors[sc.project_id % projColors.length];
            rows += '<div class="db-scan-item" style="border-left-color:' + pColor + ';" onclick="window.location.href=\'/project/' + sc.project_id + '/scan/' + sc.id + '\'">' +
                '<div class="db-scan-info">' +
                    '<div class="db-scan-top">' +
                        '<span class="db-scan-project">' + esc(projName) + '</span>' +
                        '<span class="db-scan-target">' + esc(targetName) + '</span>' +
                        '<span style="margin-left:auto;display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;background:' + statusColor + '22;color:' + statusColor + ';flex-shrink:0;"><span style="width:6px;height:6px;border-radius:50%;background:' + statusColor + ';"></span>' + esc(sc.status) + '</span>' +
                    '</div>' +
                    '<div class="db-scan-bottom">' +
                        '<span class="db-scan-meta"><span class="db-scan-id">#' + sc.id + '</span></span>' +
                        '<span class="db-scan-meta"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + esc(sc.profile) + '</span>' +
                        '<span class="db-scan-meta"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + date + '</span>' +
                        (duration ? '<span class="db-scan-meta"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + duration + '</span>' : '') +
                    '</div>' +
                '</div>' +
            '</div>';
        }
        html += '<div class="db-section"><div class="db-section-title">' + t('dashboard.recent_scans') + '</div><div class="db-table-wrap">' + rows + '</div></div>';
    }

    // Recent Activity
    if (s.recent_activity && s.recent_activity.length) {
        var actRows = '';
        for (var i = 0; i < s.recent_activity.length; i++) {
            var a = s.recent_activity[i];
            var icon = actIcon(a.action);
            actRows += '<div class="db-act-item">' +
                '<div class="db-act-icon" style="background:' + icon.bg + ';color:' + icon.color + ';">' + icon.icon + '</div>' +
                '<div class="db-act-body">' +
                    '<div class="db-act-action">' + esc(a.action) + '</div>' +
                    (a.details ? '<div class="db-act-details">' + esc(a.details) + '</div>' : '') +
                    '<div class="db-act-meta"><span>' + esc(a.username || '-') + '</span><span>' + (a.created_at || '') + '</span></div>' +
                '</div>' +
            '</div>';
        }
        html += '<div class="db-section"><div class="db-section-title">' + t('dashboard.recent_activity') + '</div><div class="db-table-wrap">' + actRows + '</div></div>';
    }

    var hasAny = (s.total_projects > 0 || s.total_scans > 0 || s.total_hosts > 0 ||
        (s.recent_scans && s.recent_scans.length) || (s.recent_activity && s.recent_activity.length) ||
        (s.top_services && s.top_services.length) || (s.top_os && s.top_os.length));
    if (!hasAny) {
        html += '<div class="db-empty"><div class="db-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></div><p>' + t('dashboard.no_data') + ' ' + t('dashboard.try_creating') + '</p></div>';
    }

    container.innerHTML = html;
    renderCharts(s);
}

function renderCharts(s) {
    for (var k in dCharts) { if (dCharts[k]) { dCharts[k].destroy(); } }
    dCharts = {};

    var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#16161f';
    var textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#8a88a0';
    var borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#2a2a3a';
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e6952e';
    var tooltipOpts = { backgroundColor: '#1e1e2c', titleColor: '#e8e6f0', bodyColor: '#8a88a0', borderColor: '#2a2a3a', borderWidth: 1, padding: 8, cornerRadius: 6 };
    var axisOpts = function(prec) { return { x: { ticks: { color: textColor, font: { size: 9 } }, grid: { color: borderColor, drawBorder: false } }, y: { ticks: { color: textColor, font: { size: 9 }, precision: prec || 0 }, grid: { color: borderColor, drawBorder: false } } }; };

    // Scan activity line
    if (s.scan_activity && s.scan_activity.length) {
        var el = document.getElementById('c-scans');
        if (el) {
            dCharts.scans = new Chart(el, {
                type: 'line',
                data: { labels: s.scan_activity.map(function(d){var p=d.date.split('-');return p[1]+'/'+p[2];}),                 datasets: [{ label: t('dashboard.scans'), data: s.scan_activity.map(function(d){return d.count;}), borderColor: accent, backgroundColor: accent + '22', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 4 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipOpts }, scales: { x: { ticks: { color: textColor, font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: borderColor, drawBorder: false } }, y: { ticks: { color: textColor, font: { size: 9 }, precision: 0 }, grid: { color: borderColor, drawBorder: false } } } }
            });
        }
    }

    var chartColors = ['#e6952e','#4fc4cf','#45c486','#e8b84b','#9b87f5','#e0696a','#3b82f6','#f97316','#22c55e','#a855f7'];

    function donut(canvasId, labels, data, colors) {
        var el = document.getElementById(canvasId);
        if (!el) return null;
        return new Chart(el, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: data, backgroundColor: colors || chartColors.slice(0, labels.length), borderWidth: 2, borderColor: bg }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 9 }, boxWidth: 10, padding: 4 } }, tooltip: tooltipOpts } }
        });
    }

    function barH(canvasId, labels, data, label) {
        var el = document.getElementById(canvasId);
        if (!el) return null;
        return new Chart(el, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: label || t('dashboard.count'), data: data, backgroundColor: accent + '66', borderColor: accent, borderWidth: 1, borderRadius: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: tooltipOpts }, scales: axisOpts(0) }
        });
    }

    // Top services
    if (s.top_services && s.top_services.length) {
        dCharts.services = donut('c-services', s.top_services.map(function(svc){return svc.service;}), s.top_services.map(function(svc){return svc.count;}));
    }

    // Top ports
    if (s.top_ports && s.top_ports.length) {
        dCharts.ports = barH('c-ports', s.top_ports.map(function(p){return p.port+'/'+p.protocol;}), s.top_ports.map(function(p){return p.count;}), t('dashboard.hosts'));
    }

    // Scan status breakdown
    if (s.scan_status_breakdown) {
        var ssKeys = Object.keys(s.scan_status_breakdown).filter(function(k){return s.scan_status_breakdown[k]>0;});
        if (ssKeys.length) {
            var ssColors = {'running':'#3b82f6','completed':'#22c55e','error':'#ef4444','pending':'#eab308','cancelled':'#8a88a0'};
            dCharts.scanStatus = donut('c-scan-status', ssKeys, ssKeys.map(function(k){return s.scan_status_breakdown[k];}), ssKeys.map(function(k){return ssColors[k]||chartColors[0];}));
        }
    }

    // Port state breakdown
    if (s.port_state_breakdown) {
        var psKeys = Object.keys(s.port_state_breakdown).filter(function(k){return s.port_state_breakdown[k]>0;});
        if (psKeys.length) {
            var psColors = {'open':'#22c55e','closed':'#64748b','filtered':'#e6952e'};
            dCharts.portState = donut('c-port-state', psKeys, psKeys.map(function(k){return s.port_state_breakdown[k];}), psKeys.map(function(k){return psColors[k]||chartColors[0];}));
        }
    }

    // Projects by priority
    if (s.projects_by_priority) {
        var ppKeys = Object.keys(s.projects_by_priority).filter(function(k){return s.projects_by_priority[k]>0;});
        if (ppKeys.length) {
            var ppColors = {'critical':'#ef4444','high':'#f97316','medium':'#eab308','low':'#64748b'};
            dCharts.priority = donut('c-priority', ppKeys, ppKeys.map(function(k){return s.projects_by_priority[k];}), ppKeys.map(function(k){return ppColors[k]||chartColors[0];}));
        }
    }

    function trunc(s, n) { return s && s.length > n ? s.substring(0, n-1) + '\u2026' : s; }

    // Top OS
    if (s.top_os && s.top_os.length) {
        dCharts.os = barH('c-os', s.top_os.map(function(o){return trunc(o.os, 20);}), s.top_os.map(function(o){return o.count;}), t('dashboard.hosts'));
    }

    // Scans per project
    if (s.scans_per_project && s.scans_per_project.length) {
        dCharts.scansPerProject = barH('c-scans-per-project', s.scans_per_project.map(function(p){return trunc(p.project_name || '#'+p.project_id, 20);}), s.scans_per_project.map(function(p){return p.count;}), t('dashboard.scans'));
    }
}

function goToProjects() { window.location.href = '/'; }
function goToAdmin() { window.location.href = '/admin'; }
function goToSettings() { window.location.href = '/settings'; }
function showAboutModal() { document.getElementById('about-modal').style.display = 'flex'; }
function hideAboutModal() { document.getElementById('about-modal').style.display = 'none'; }

document.addEventListener('DOMContentLoaded', initDashboard);
document.addEventListener('click', function(e) {
    if (e.target.closest('#about-modal.modal-overlay') && e.target === e.target.closest('#about-modal')) {
        hideAboutModal();
    }
});
