var pdCharts = {};

(function() {
    var css = document.createElement('style');
    css.textContent =
        '.pd-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}' +
        '.pd-header h2{font-size:1.3rem;font-weight:600;margin:0;}' +
        '.pd-section{margin-bottom:24px;}' +
        '.pd-section-title{font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;}' +
        '.pd-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}' +
        '.pd-card{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px 16px;transition:border-color 0.2s,transform 0.15s;}' +
        '.pd-card:hover{border-color:var(--accent);transform:translateY(-1px);}' +
        '.pd-card-label{font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;}' +
        '.pd-card-value{font-size:1.4rem;font-weight:700;line-height:1.2;}' +
        '.pd-charts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}' +
        '.pd-chart-card{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px;}' +
        '.pd-chart-title{font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;}' +
        '.pd-chart-body{position:relative;height:160px;}' +
        '.pd-table-wrap{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;overflow:hidden;}' +
        '.pd-scan-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-left:3px solid;cursor:pointer;transition:background 0.15s;border-bottom:1px solid var(--border);}' +
        '.pd-scan-item:last-child{border-bottom:none;}' +
        '.pd-scan-item:hover{background:rgba(255,255,255,0.03);}' +
        '.pd-scan-info{flex:1;min-width:0;}' +
        '.pd-scan-top{display:flex;align-items:center;gap:8px;margin-bottom:2px;}' +
        '.pd-scan-project{font-weight:600;font-size:0.85rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.pd-scan-target{font-size:0.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.pd-scan-bottom{display:flex;align-items:center;gap:12px;}' +
        '.pd-scan-meta{font-size:0.7rem;color:var(--text-muted);display:flex;align-items:center;gap:4px;}' +
        '.pd-scan-id{color:var(--accent);font-size:0.7rem;font-weight:600;}' +
        '.pd-empty{padding:60px 20px;text-align:center;color:var(--text-muted);}' +
        '@media(max-width:768px){.pd-charts{grid-template-columns:1fr;}.pd-cards{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));}}' +
        '@media(max-width:480px){.pd-cards{grid-template-columns:repeat(2,1fr);}}';
    document.head.appendChild(css);
})();

var pdProjectId = null;

function loadProjectDashboard() {
    pdProjectId = projectId;
    var container = document.getElementById('project-dashboard-content');
    if (!container) return;
    container.innerHTML = '<div class="pd-empty"><div class="spinner" style="margin:0 auto 12px;"></div><p>Loading dashboard...</p></div>';
    (async function() {
        try {
            var res = await fetch('/api/projects/' + projectId + '/stats');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var stats = await res.json();
            renderPD(container, stats);
        } catch (e) {
            container.innerHTML = '<div class="pd-empty"><p style="color:#ef4444;">Error: ' + esc(e.message) + '</p></div>';
        }
    })();
}

function pdCard(label, value, color) {
    return '<div class="pd-card"><div class="pd-card-label">' + label + '</div><div class="pd-card-value" style="color:' + color + ';">' + value + '</div></div>';
}

function renderPD(container, s) {
    var html = '';
    var p = s.project || {};

    html += '<div class="pd-header"><h2>' + esc(p.name || 'Project') + ' Dashboard</h2></div>';

    html += '<div class="pd-section"><div class="pd-section-title">Overview</div><div class="pd-cards">' +
        pdCard('Total Scans', s.total_scans || 0, '#e6952e') +
        pdCard('Hosts', s.host_count || 0, '#45c486') +
        pdCard('Open Ports', s.open_port_count || 0, '#22c55e') +
        pdCard('High Risk', s.high_risk_port_count || 0, '#ef4444') +
    '</div></div>';

    html += '<div class="pd-section"><div class="pd-section-title">Charts</div><div class="pd-charts">' +
        '<div class="pd-chart-card"><div class="pd-chart-title">Scan Activity</div><div class="pd-chart-body"><canvas id="pdc-scans"></canvas></div></div>' +
        '<div class="pd-chart-card"><div class="pd-chart-title">Scan Status</div><div class="pd-chart-body"><canvas id="pdc-scan-status"></canvas></div></div>' +
        '<div class="pd-chart-card"><div class="pd-chart-title">Port State</div><div class="pd-chart-body"><canvas id="pdc-port-state"></canvas></div></div>' +
    '</div></div>';

    html += '<div class="pd-charts" style="margin-bottom:24px;">' +
        '<div class="pd-chart-card"><div class="pd-chart-title">Top Services</div><div class="pd-chart-body"><canvas id="pdc-services"></canvas></div></div>' +
        '<div class="pd-chart-card"><div class="pd-chart-title">Top Ports</div><div class="pd-chart-body"><canvas id="pdc-ports"></canvas></div></div>' +
        '<div class="pd-chart-card"><div class="pd-chart-title">Top OS</div><div class="pd-chart-body"><canvas id="pdc-os"></canvas></div></div>' +
    '</div>';

    // Recent scans
    if (s.recent_scans && s.recent_scans.length) {
        var rows = '';
        for (var i = 0; i < s.recent_scans.length; i++) {
            var sc = s.recent_scans[i];
            var statusColor = sc.status === 'completed' ? '#22c55e' : sc.status === 'running' ? '#3b82f6' : sc.status === 'error' ? '#ef4444' : '#eab308';
            var date = sc.started_at ? formatDate(sc.started_at) : '-';
            var duration = '';
            if (sc.started_at && sc.completed_at) {
                var diff = new Date(sc.completed_at) - new Date(sc.started_at);
                if (diff > 0) {
                    var mins = Math.floor(diff / 60000);
                    var secs = Math.floor((diff % 60000) / 1000);
                    duration = (mins > 0 ? mins + 'm ' : '') + secs + 's';
                }
            }
            rows += '<div class="pd-scan-item" style="border-left-color:' + statusColor + ';" onclick="window.location.href=\'/project/' + projectId + '/scan/' + sc.id + '\'">' +
                '<div class="pd-scan-info">' +
                    '<div class="pd-scan-top">' +
                        '<span class="pd-scan-project">' + esc(sc.profile) + '</span>' +
                        '<span class="pd-scan-target">' + esc(sc.target) + '</span>' +
                    '</div>' +
                    '<div class="pd-scan-bottom">' +
                        '<span class="pd-scan-meta"><span class="pd-scan-id">#' + sc.id + '</span></span>' +
                        '<span class="pd-scan-meta"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + date + '</span>' +
                        (duration ? '<span class="pd-scan-meta"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + duration + '</span>' : '') +
                        '<span style="margin-left:auto;display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;background:' + statusColor + '22;color:' + statusColor + ';flex-shrink:0;"><span style="width:6px;height:6px;border-radius:50%;background:' + statusColor + ';"></span>' + esc(sc.status) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
        html += '<div class="pd-section"><div class="pd-section-title">Recent Scans</div><div class="pd-table-wrap">' + rows + '</div></div>';
    }

    container.innerHTML = html;
    renderPDCharts(s);
}

function renderPDCharts(s) {
    for (var k in pdCharts) { if (pdCharts[k]) { pdCharts[k].destroy(); } }
    pdCharts = {};

    var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#16161f';
    var textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#8a88a0';
    var borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#2a2a3a';
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e6952e';
    var chartColors = ['#e6952e','#4fc4cf','#45c486','#e8b84b','#9b87f5','#e0696a','#3b82f6','#f97316','#22c55e','#a855f7'];
    var tooltipOpts = { backgroundColor: '#1e1e2c', titleColor: '#e8e6f0', bodyColor: '#8a88a0', borderColor: '#2a2a3a', borderWidth: 1, padding: 8, cornerRadius: 6 };

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
            data: { labels: labels, datasets: [{ label: label || 'Count', data: data, backgroundColor: accent + '66', borderColor: accent, borderWidth: 1, borderRadius: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: tooltipOpts }, scales: { x: { ticks: { color: textColor, font: { size: 9 }, precision: 0 }, grid: { color: borderColor, drawBorder: false } }, y: { ticks: { color: textColor, font: { size: 9 } }, grid: { color: borderColor, drawBorder: false } } } }
        });
    }

    // Scan activity
    if (s.scan_activity && s.scan_activity.length) {
        var el = document.getElementById('pdc-scans');
        if (el) {
            pdCharts.scans = new Chart(el, {
                type: 'line',
                data: { labels: s.scan_activity.map(function(d){var p=d.date.split('-');return p[1]+'/'+p[2];}), datasets: [{ label: 'Scans', data: s.scan_activity.map(function(d){return d.count;}), borderColor: accent, backgroundColor: accent + '22', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 4 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipOpts }, scales: { x: { ticks: { color: textColor, font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: borderColor, drawBorder: false } }, y: { ticks: { color: textColor, font: { size: 9 }, precision: 0 }, grid: { color: borderColor, drawBorder: false } } } }
            });
        }
    }

    // Scan status breakdown
    if (s.scan_status_breakdown) {
        var ssKeys = Object.keys(s.scan_status_breakdown).filter(function(k){return s.scan_status_breakdown[k]>0;});
        if (ssKeys.length) {
            var ssColors = {'running':'#3b82f6','completed':'#22c55e','error':'#ef4444','pending':'#eab308','cancelled':'#8a88a0','rejected':'#ef4444'};
            pdCharts.scanStatus = donut('pdc-scan-status', ssKeys, ssKeys.map(function(k){return s.scan_status_breakdown[k];}), ssKeys.map(function(k){return ssColors[k]||chartColors[0];}));
        }
    }

    // Port state breakdown
    if (s.port_state_breakdown) {
        var psKeys = Object.keys(s.port_state_breakdown).filter(function(k){return s.port_state_breakdown[k]>0;});
        if (psKeys.length) {
            var psColors = {'open':'#22c55e','closed':'#64748b','filtered':'#e6952e'};
            pdCharts.portState = donut('pdc-port-state', psKeys, psKeys.map(function(k){return s.port_state_breakdown[k];}), psKeys.map(function(k){return psColors[k]||chartColors[0];}));
        }
    }

    // Top services
    if (s.top_services && s.top_services.length) {
        pdCharts.services = donut('pdc-services', s.top_services.map(function(svc){return svc.service;}), s.top_services.map(function(svc){return svc.count;}));
    }

    // Top ports
    if (s.top_ports && s.top_ports.length) {
        pdCharts.ports = barH('pdc-ports', s.top_ports.map(function(p){return p.port+'/'+p.protocol;}), s.top_ports.map(function(p){return p.count;}), 'Hosts');
    }

    // Top OS
    if (s.top_os && s.top_os.length) {
        pdCharts.os = barH('pdc-os', s.top_os.map(function(o){return o.os;}), s.top_os.map(function(o){return o.count;}), 'Hosts');
    }
}
