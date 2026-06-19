function osColor(os) {
    const o = (os || '').toLowerCase();
    if (o.includes('linux')) return '#4caf50';
    if (o.includes('windows')) return '#42a5f5';
    if (o.includes('darwin') || o.includes('mac')) return '#ab47bc';
    if (o.includes('freebsd') || o.includes('bsd')) return '#ffa726';
    if (o.includes('cisco') || o.includes('ios')) return '#ef5350';
    if (o.includes('solaris') || o.includes('sun')) return '#ec407a';
    return '#78909c';
}
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
function topoNodeSize(ports) {
    return Math.max(14, Math.min(40, 12 + Math.round(Math.sqrt(ports || 1) * 4)));
}
function topoFontColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--topo-text-color').trim() || '#e0e0e0';
}
function topoStrokeColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--topo-stroke-color').trim() || '#0d0d14';
}
function osLabel(os) {
    const o = (os || '').toLowerCase();
    if (o.includes('linux')) return t('topology.os_linux');
    if (o.includes('windows')) return t('topology.os_windows');
    if (o.includes('darwin') || o.includes('mac')) return t('topology.os_macos');
    if (o.includes('freebsd') || o.includes('bsd')) return t('topology.os_bsd');
    if (o.includes('cisco') || o.includes('ios')) return t('topology.os_cisco');
    if (o.includes('solaris') || o.includes('sun')) return t('topology.os_solaris');
    return os || t('topology.os_unknown');
}

async function loadTopology() {
    const graphEl = document.getElementById('topology-graph');
    const empty = document.getElementById('topology-empty');
    const tooltip = document.getElementById('topology-tooltip');
    const legend = document.getElementById('topology-legend');
    const detail = document.getElementById('topology-detail');
    empty.style.display = '';
    tooltip.style.display = 'none';
    legend.style.display = 'none';
    detail.style.display = 'none';
    try {
        const res = await fetch('/api/projects/' + projectId + '/topology');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('topology.failed'));
        if ((!data.nodes || data.nodes.length === 0) && (!data.clusters || data.clusters.length === 0)) {
            empty.innerHTML = '<h3>' + t('topology.no_data') + '</h3><p>' + t('topology.confirm_scans') + '</p>';
            return;
        }
        empty.style.display = 'none';
        renderTopology(data, graphEl, tooltip, legend, detail);
    } catch (e) {
        empty.style.display = '';
        empty.innerHTML = '<h3>' + t('topology.error_loading') + '</h3><p>' + esc(e.message) + '</p>';
    }
}

var _topoPortSortField = 'port';
var _topoPortSortDir = 1;

function renderPortTable(ports, detailEl, d, osStr, hasHighRisk) {
    var sorted = ports.slice();
    sorted.sort(function(a, b) {
        var va, vb;
        if (_topoPortSortField === 'port') { va = a.port; vb = b.port; }
        else if (_topoPortSortField === 'protocol') { va = a.protocol || ''; vb = b.protocol || ''; }
        else if (_topoPortSortField === 'state') { va = a.state || ''; vb = b.state || ''; }
        else if (_topoPortSortField === 'service') { va = (a.service || '').toLowerCase(); vb = (b.service || '').toLowerCase(); }
        else if (_topoPortSortField === 'version') { va = (a.version || '').toLowerCase(); vb = (b.version || '').toLowerCase(); }
        else if (_topoPortSortField === 'product') { va = (a.product || '').toLowerCase(); vb = (b.product || '').toLowerCase(); }
        if (typeof va === 'number') return (va - vb) * _topoPortSortDir;
        return va < vb ? -1 * _topoPortSortDir : va > vb ? 1 * _topoPortSortDir : 0;
    });
    var rows = sorted.length > 0 ? sorted.map(function(p) { return '<tr>' +
        '<td class="tp-pnum">' + p.port + '</td>' +
        '<td>' + p.protocol + '</td>' +
        '<td><span class="badge badge-' + (p.state === 'open' ? 'open' : 'filtered') + '">' + p.state + '</span></td>' +
        '<td>' + esc(p.service || '\u2014') + '</td>' +
        '<td style="font-size:0.72rem;color:var(--text-muted);">' + esc(p.version || '\u2014') + '</td>' +
        '<td style="font-size:0.72rem;color:var(--text-muted);">' + esc(p.product || '\u2014') + '</td>' +
        '</tr>'; })        .join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:12px;">' + t('topology.no_open_ports') + '</td></tr>';
    var arrow = function(f) { return f === _topoPortSortField ? (_topoPortSortDir === 1 ? ' \u25B2' : ' \u25BC') : ''; };
    var body = detailEl.querySelector('.detail-body');
    if (body) {
        body.innerHTML = '<div class="info-line">' +
            '<span>' + d.ports + ' ' + t('topology.open') + '</span>' +
            '<span>' + d.subnet + '</span>' +
            (hasHighRisk ? '<span style="color:#f06262;">\u26a0 ' + t('topology.risk') + '</span>' : '') +
            (d.mac ? '<span>' + esc(d.mac) + '</span>' : '') +
            (d.os_inferred ? '<span style="font-style:italic;">* ' + t('topology.inferred') + '</span>' : '') +
            '</div>' +
            '<table class="tp-table"><thead><tr>' +
            '<th style="width:48px;cursor:pointer;" data-sort="port">' + t('topology.port') + arrow('port') + '</th>' +
            '<th style="width:38px;cursor:pointer;" data-sort="protocol">' + t('topology.proto') + arrow('protocol') + '</th>' +
            '<th style="width:50px;cursor:pointer;" data-sort="state">' + t('topology.state') + arrow('state') + '</th>' +
            '<th style="cursor:pointer;" data-sort="service">' + t('topology.service') + arrow('service') + '</th>' +
            '<th style="width:80px;cursor:pointer;" data-sort="version">' + t('topology.version') + arrow('version') + '</th>' +
            '<th style="width:80px;cursor:pointer;" data-sort="product">' + t('topology.product') + arrow('product') + '</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
        body.querySelectorAll('[data-sort]').forEach(function(th) {
            th.addEventListener('click', function() {
                var f = this.dataset.sort;
                if (f === _topoPortSortField) _topoPortSortDir *= -1;
                else { _topoPortSortField = f; _topoPortSortDir = 1; }
                renderPortTable(ports, detailEl, d, osStr, hasHighRisk);
            });
        });
    }
}

function showHostDetail(d, detailEl) {
    const osStr = osLabel(d.os);
    const ports = d.port_detail || [];
    const highRisk = [21, 23, 25, 53, 110, 135, 139, 143, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017];
    const hasHighRisk = ports.some(p => highRisk.includes(p.port));
    const portCounts = { open: 0, filtered: 0, closed: 0 };
    ports.forEach(p => { if (p.state === 'open') portCounts.open++; else if (p.state === 'filtered') portCounts.filtered++; });
    detailEl.innerHTML = `
        <div class="detail-header">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">
                <strong style="font-size:0.88rem;white-space:nowrap;">${esc(d.ip)}</strong>
                ${d.hostname ? '<span style="color:var(--text-muted);font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">' + esc(d.hostname) + '</span>' : ''}
                <span class="badge" style="background:${osColor(d.os)}22;color:${osColor(d.os)};border:1px solid ${osColor(d.os)}44;font-size:0.65rem;">${esc(osStr)}${d.os_inferred ? '*' : ''}</span>
                ${d.label ? '<span class="badge" style="background:var(--accent)22;color:var(--accent);border:1px solid var(--accent)44;font-size:0.65rem;">' + esc(d.label) + '</span>' : ''}
            </div>
            <button class="detail-close" onclick="this.closest('#topology-detail').style.display='none'">\u2715</button>
        </div>
        <div class="detail-body"></div>
    `;
    renderPortTable(ports, detailEl, d, osStr, hasHighRisk);
    detailEl.style.display = '';
}

function showClusterDetail(c, detailEl) {
    const hosts = c.hosts || [];
    const hostRows = hosts.map(h => {
        const osStr = osLabel(h.os);
        const portStr = h.port_detail && h.port_detail.length > 0
            ? h.port_detail.slice(0, 5).map(p => p.port + '/' + p.protocol).join(', ') + (h.port_detail.length > 5 ? '\u2026' : '')
            : 'none';
        return '<tr style="cursor:pointer;" data-ip="' + h.ip + '">' +
            '<td style="font-family:monospace;font-weight:600;color:var(--accent);">' + esc(h.ip) + '</td>' +
            '<td>' + esc(h.hostname || '\u2014') + '</td>' +
            '<td><span style="color:' + osColor(h.os) + ';">\u25cf</span> ' + esc(osStr) + (h.os_inferred ? '*' : '') + '</td>' +
            '<td>' + h.ports + '</td>' +
            '<td style="font-size:0.72rem;color:var(--text-muted);">' + esc(portStr) + '</td>' +
            '</tr>';
    }).join('');
    const svcs = c.services && c.services.length > 0 ? c.services.slice(0, 10).join(', ') : '';
    detailEl.innerHTML = `
        <div class="detail-header">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:0.88rem;color:var(--accent);font-family:monospace;">${esc(c.subnet)}</strong>
                <span class="badge badge-info" style="font-size:0.65rem;">${c.host_count} ${t('topology.hosts')}</span>
                <span class="badge badge-open" style="font-size:0.65rem;">${c.port_count} ${t('topology.ports')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
                <button class="detail-close" onclick="collapseTopoCluster('${esc(c.subnet)}');this.closest('#topology-detail').style.display='none'" title="${t('topology.collapse_and_close')}">\u2212</button>
                <button class="detail-close" onclick="this.closest('#topology-detail').style.display='none'">\u2715</button>
            </div>
        </div>
        <div class="detail-body">
            ${svcs ? '<div style="margin-bottom:6px;font-size:0.72rem;color:var(--text-muted);">' + t('topology.services_label') + ' ' + esc(svcs) + '</div>' : ''}
            <table class="tp-table">
                <thead><tr>
                    <th>${t('topology.ip')}</th>
                    <th>${t('topology.hostname')}</th>
                    <th>${t('topology.os')}</th>
                    <th style="width:40px;">${t('topology.ports')}</th>
                    <th>${t('topology.key_ports')}</th>
                </tr></thead>
                <tbody>${hostRows}</tbody>
            </table>
        </div>
    `;
    detailEl.style.display = '';
}

let _topoHostsByIP = {};
let _topoNetwork = null;
let _topoNodes = null;
let _topoEdges = null;
let _topoClusters = [];
const _topoClusterSubnets = new Set();
const _topoOpenClusters = new Set();
let _topoClusterNodes = {};
let _topoRiskActive = false;
let _topoPathMode = false;
let _topoPathFirst = null;
let _topoOriginalColors = {};
let _topoStoredPositionsKey = 'nexusmap_topo_positions';
let _topoSvcFilterActive = null;

const _topoHighRiskPorts = [21, 23, 25, 53, 110, 135, 139, 143, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017];

var _topoPhysicsStable = false;

function _topoPausePhysics() {
    if (_topoNetwork) _topoNetwork.setOptions({ physics: { enabled: false } });
}
function _topoResumePhysics() {
    if (!_topoNetwork) return;
    const mode = document.getElementById('topo-layout-mode');
    if (!mode || mode.value === 'force') {
        _topoNetwork.setOptions({
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -500, centralGravity: 0.5,
                    springLength: 80, springConstant: 0.08, damping: 0.3
                },
                stabilization: { iterations: 80, updateInterval: 25 }
            }
        });
        if (_topoPhysicsStable) {
            _topoNetwork.once('stabilizationIterationsDone', function() {
                _topoNetwork.setOptions({ physics: { enabled: false } });
            });
        }
    }
}

function topoZoomIn() {
    if (!_topoNetwork) return;
    const scale = _topoNetwork.getScale();
    _topoNetwork.moveTo({ scale: scale * 1.4, animation: { duration: 200 } });
    var s = document.getElementById('topo-zoom-slider');
    if (s) s.value = '' + Math.round((scale * 1.4) * 100) / 100;
}
function topoZoomOut() {
    if (!_topoNetwork) return;
    const scale = _topoNetwork.getScale();
    _topoNetwork.moveTo({ scale: scale / 1.4, animation: { duration: 200 } });
    var s = document.getElementById('topo-zoom-slider');
    if (s) s.value = '' + Math.round((scale / 1.4) * 100) / 100;
}
function topoFitView() {
    if (!_topoNetwork) return;
    _topoNetwork.fit({ animation: { duration: 300 } });
}

function collapseTopoCluster(subnet) {
    if (!_topoNodes || !subnet) return;
    const updates = [];
    for (const c of _topoClusters) {
        if (c.subnet === subnet) {
            for (const h of (c.hosts || [])) updates.push({ id: h.ip, hidden: true });
            break;
        }
    }
    if (updates.length > 0) {
        _topoPausePhysics();
        _topoNodes.update(updates);
        _topoResumePhysics();
    }
    _topoOpenClusters.delete(subnet);
    const detailEl = document.getElementById('topology-detail');
    if (detailEl) detailEl.style.display = 'none';
}

function collapseAllClusters() {
    if (!_topoNodes) return;
    const updates = [];
    for (const subnet of _topoOpenClusters) {
        for (const c of _topoClusters) {
            if (c.subnet === subnet) {
                for (const h of (c.hosts || [])) updates.push({ id: h.ip, hidden: true });
                break;
            }
        }
    }
    if (updates.length > 0) {
        _topoPausePhysics();
        _topoNodes.update(updates);
        _topoResumePhysics();
    }
    _topoOpenClusters.clear();
}

function expandAllClusters() {
    if (!_topoNodes) return;
    const updates = [];
    for (const c of _topoClusters) {
        for (const h of (c.hosts || [])) updates.push({ id: h.ip, hidden: false });
        _topoOpenClusters.add(c.subnet);
    }
    if (updates.length > 0) {
        _topoPausePhysics();
        _topoNodes.update(updates);
        _topoResumePhysics();
    }
}

function toggleFilterTopo() {
    const q = document.getElementById('topology-filter');
    const countEl = document.getElementById('topology-filter-count');
    if (!q || !_topoNodes) return;
    const val = q.value.trim().toLowerCase();
    let total = 0, matched = 0;
    const updates = [];
    for (const ip in _topoHostsByIP) {
        const h = _topoHostsByIP[ip];
        if (!h) continue;
        total++;
        if (!val) {
            const inCluster = _topoClusterSubnets.has(h.subnet);
            updates.push({ id: h.ip, hidden: inCluster && !_topoOpenClusters.has(h.subnet) });
            matched++;
        } else {
            const searchStr = (h.ip + ' ' + (h.hostname || '') + ' ' + (h.os || '') + ' ' + (h.mac || '') + ' ' + (Array.isArray(h.services) ? h.services.join(' ') : (h.services || '')) + ' ' + (h.port_detail || []).map(function(p) { return p.port + '/' + p.protocol + ' ' + (p.service || ''); }).join(' ')).toLowerCase();
            const match = searchStr.indexOf(val) >= 0;
            updates.push({ id: h.ip, hidden: !match });
            if (match) matched++;
        }
    }
    if (updates.length > 0) { _topoPausePhysics(); _topoNodes.update(updates); }
    if (q.value.trim() && _topoPathMode) {
        clearTopoPathHighlight();
    }
    if (countEl) {
        if (val) { countEl.textContent = matched + ' / ' + total; countEl.style.display = ''; }
        else { countEl.style.display = 'none'; }
    }
    if (val && _topoNetwork) {
        _topoNetwork.fit({ animation: { duration: 400 } });
    }
}

function expandAllTopo() { expandAllClusters(); }
function collapseAllTopo() { collapseAllClusters(); }

function toggleTopoRiskFilter() {
    const btn = document.getElementById('topo-btn-risk');
    if (!btn) return;
    _topoRiskActive = btn.dataset.active === '1' ? 0 : 1;
    btn.dataset.active = _topoRiskActive.toString();
    btn.classList.toggle('active', _topoRiskActive === 1);
    if (!_topoNodes) return;
    const updates = [];
    for (const ip in _topoHostsByIP) {
        const h = _topoHostsByIP[ip];
        if (!h) continue;
        const node = _topoNodes.get(ip);
        if (!node) continue;
        if (_topoRiskActive) {
            const ports = h.port_detail || [];
            const hasRisk = ports.some(p => _topoHighRiskPorts.includes(p.port));
            const borderColor = hasRisk ? '#ff4444' : 'rgba(100,100,140,0.2)';
            const borderWidth = hasRisk ? 4 : 1;
            updates.push({ id: ip, borderWidth: borderWidth, color: { ...node.color, border: borderColor } });
        } else {
            const c = osColor(h.os);
            updates.push({ id: ip, borderWidth: 2, color: { ...node.color, border: hexToRgba(c, 0.8) } });
        }
    }
    if (updates.length > 0) _topoNodes.update(updates);
    if (_topoOpenClusters.size > 0) {
        clearTopoHighlight();
        updateTopoStats();
    }
}

function toggleTopoPathMode() {
    const btn = document.getElementById('topo-btn-path');
    if (!btn) return;
    _topoPathMode = btn.dataset.active === '1' ? 0 : 1;
    btn.dataset.active = _topoPathMode.toString();
    btn.classList.toggle('active', _topoPathMode === 1);
    if (!_topoPathMode) {
        clearTopoPathHighlight();
        _topoPathFirst = null;
        document.getElementById('topology-tooltip').style.display = 'none';
    } else {
        const tooltip = document.getElementById('topology-tooltip');
        tooltip.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;">' + t('topology.path_click_first') + '</div>';
        tooltip.style.display = '';
        const rect = document.getElementById('topology-graph').getBoundingClientRect();
        tooltip.style.left = '14px';
        tooltip.style.top = '54px';
        _topoPathFirst = null;
    }
}

function clearTopoPathHighlight() {
    if (!_topoNodes || !_topoEdges) return;
    if (_topoPathNodes) {
        const updates = [];
        for (const id of _topoPathNodes) {
            const node = _topoNodes.get(id);
            if (node && _topoOriginalColors[id]) {
                updates.push({ id: id, color: _topoOriginalColors[id], borderWidth: 2 });
            }
        }
        if (updates.length > 0) _topoNodes.update(updates);
        _topoPathNodes = null;
    }
    if (_topoPathEdges) {
        const edgeUpdates = [];
        for (const id of _topoPathEdges) {
            edgeUpdates.push({ id: id, color: { color: 'rgba(100,100,140,0.1)', highlight: 'rgba(230,149,46,0.3)' }, width: 1 });
        }
        if (edgeUpdates.length > 0) _topoEdges.update(edgeUpdates);
        _topoPathEdges = null;
    }
}

function highlightTopoPath(node1Id, node2Id) {
    clearTopoPathHighlight();
    if (!_topoEdges || !_topoNodes) return;
    const adj = {};
    const allEdges = _topoEdges.get();
    for (const e of allEdges) {
        if (!adj[e.from]) adj[e.from] = [];
        if (!adj[e.to]) adj[e.to] = [];
        adj[e.from].push({ id: e.id, to: e.to });
        adj[e.to].push({ id: e.id, to: e.from });
    }
    const parent = {};
    const edgeUsed = {};
    const visited = new Set([node1Id]);
    const queue = [node1Id];
    let found = false;
    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === node2Id) { found = true; break; }
        for (const nb of (adj[cur] || [])) {
            if (!visited.has(nb.to)) {
                visited.add(nb.to);
                parent[nb.to] = cur;
                edgeUsed[nb.to] = nb.id;
                queue.push(nb.to);
            }
        }
    }
    if (!found) {
        const tooltip = document.getElementById('topology-tooltip');
        tooltip.innerHTML = '<div style="color:#f06262;font-size:0.75rem;">' + t('topology.path_no_path') + '</div>';
        return;
    }
    const pathNodes = [];
    const pathEdges = [];
    let cur = node2Id;
    while (cur !== node1Id) {
        pathNodes.push(cur);
        pathEdges.push(edgeUsed[cur]);
        cur = parent[cur];
    }
    pathNodes.push(node1Id);
    _topoPathNodes = pathNodes;
    _topoPathEdges = pathEdges;
    const nodeUpdates = [];
    for (const id of pathNodes) {
        const node = _topoNodes.get(id);
        if (node) {
            if (!_topoOriginalColors[id]) _topoOriginalColors[id] = node.color;
            nodeUpdates.push({ id: id, color: { background: '#e6952e33', border: '#e6952e', highlight: { background: '#e6952e44', border: '#e6952e' } }, borderWidth: 3 });
        }
    }
    if (nodeUpdates.length > 0) _topoNodes.update(nodeUpdates);
    const edgeUpdates = pathEdges.map(function(id) {
        return { id: id, color: { color: '#e6952e', highlight: '#e6952e' }, width: 3 };
    });
    if (edgeUpdates.length > 0) _topoEdges.update(edgeUpdates);
    const tooltip = document.getElementById('topology-tooltip');
    tooltip.innerHTML = '<div style="color:#4caf50;font-size:0.75rem;">' + t('topology.path_found') + ' ' + pathNodes.length + ' ' + t('topology.hops') + '</div>';
}

function highlightTopoNeighbors(nodeId) {
    if (!_topoEdges || !_topoNodes || _topoPathMode) return;
    const allNodes = _topoNodes.get();
    const neighborIds = new Set([nodeId]);
    const edges = _topoEdges.get({ filter: function(e) { return e.from === nodeId || e.to === nodeId; } });
    for (const e of edges) {
        neighborIds.add(e.from);
        neighborIds.add(e.to);
    }
    const updates = [];
    for (const n of allNodes) {
        if (n.id === nodeId) continue;
        const targetOpacity = neighborIds.has(n.id) ? 1.0 : 0.2;
        if (n.opacity !== targetOpacity) updates.push({ id: n.id, opacity: targetOpacity });
    }
    if (updates.length > 0) _topoNodes.update(updates);
    _topoHighlighted = true;
}

function clearTopoHighlight() {
    if (!_topoHighlighted || !_topoNodes) return;
    const allNodes = _topoNodes.get();
    const updates = [];
    for (const n of allNodes) {
        if (n.opacity !== undefined && n.opacity !== 1.0) updates.push({ id: n.id, opacity: 1.0 });
    }
    if (updates.length > 0) _topoNodes.update(updates);
    _topoHighlighted = false;
}

function setTopoLayout(mode) {
    if (!_topoNetwork || !_topoNodes) return;
    const opts = {
        physics: { enabled: true },
        layout: { hierarchical: { enabled: false } }
    };
    if (mode === 'hierarchical') {
        opts.layout.hierarchical = {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            levelSeparation: 150,
            nodeSpacing: 140,
            treeSpacing: 200
        };
        opts.physics.enabled = false;
    } else if (mode === 'radial') {
        opts.physics.enabled = false;
        opts.layout.hierarchical.enabled = false;
    } else {
        opts.physics = {
            barnesHut: { gravitationalConstant: -2000, centralGravity: 0.25, springLength: 150, springConstant: 0.04, damping: 0.18 },
            stabilization: { iterations: 200, updateInterval: 25 }
        };
    }
    _topoNetwork.setOptions(opts);
    if (mode === 'radial') radialLayoutTopo();
    if (mode === 'force') {
        const saved = localStorage.getItem(_topoStoredPositionsKey);
        if (saved) {
            try { _topoNetwork.setOptions({ physics: false }); _topoNetwork.storePositions(); _topoNetwork.setOptions({ physics: true }); } catch(e) {}
        }
    }
    _topoNetwork.fit({ animation: true });
}

function radialLayoutTopo() {
    if (!_topoNetwork || !_topoNodes) return;
    const allNodes = _topoNodes.get();
    const center = { x: 0, y: 0 };
    const clusterNodes = [];
    const hostNodes = [];
    for (const n of allNodes) {
        if (n.id && n.id.startsWith && n.id.startsWith('cluster:')) clusterNodes.push(n);
        else if (n.ip) hostNodes.push(n);
    }
    const positions = {};
    const clusterRadius = 80;
    const hostRadius = 220;
    const clusterAngleStep = clusterNodes.length > 1 ? (2 * Math.PI) / clusterNodes.length : 0;
    clusterNodes.forEach(function(n, i) {
        const angle = i * clusterAngleStep;
        positions[n.id] = { x: center.x + clusterRadius * Math.cos(angle), y: center.y + clusterRadius * Math.sin(angle) };
    });
    hostNodes.forEach(function(n, i) {
        const angle = (i / hostNodes.length) * 2 * Math.PI;
        positions[n.id] = { x: center.x + hostRadius * Math.cos(angle), y: center.y + hostRadius * Math.sin(angle) };
    });
    _topoNetwork.setOptions({ physics: false });
    _topoNetwork.moveNode(Object.keys(positions).map(function(id) {
        return { id: id, x: positions[id].x, y: positions[id].y };
    }));
    _topoNetwork.fit({ animation: true });
}

function exportTopoPNG() {
    if (!_topoNetwork) return;
    const canvas = document.querySelector('#topology-graph canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'topology-export.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function exportTopoSVG() {
    if (!_topoNetwork) return;
    var canvas = document.querySelector('#topology-graph canvas');
    if (!canvas) return;
    var imgData = canvas.toDataURL('image/png');
    var w = canvas.width, h = canvas.height;
    var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
        '<image href="' + imgData + '" width="' + w + '" height="' + h + '"/></svg>';
    var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    var link = document.createElement('a');
    link.download = 'topology-export.svg';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
}

function clearTopoSvcFilter() {}

function getTopoPins() {
    try { return JSON.parse(localStorage.getItem('topo_pins_' + projectId) || '[]'); } catch(e) { return []; }
}
function setTopoPins(pins) {
    localStorage.setItem('topo_pins_' + projectId, JSON.stringify(pins));
}
function isTopoPinned(ip) { return getTopoPins().indexOf(ip) >= 0; }
function toggleTopoPin(ip) {
    var pins = getTopoPins();
    var idx = pins.indexOf(ip);
    if (idx >= 0) { pins.splice(idx, 1); } else { pins.push(ip); }
    setTopoPins(pins);
    applyTopoPinStyles();
}
function applyTopoPinStyles() {
    if (!_topoNodes) return;
    var pins = getTopoPins();
    var updates = [];
    var all = _topoNodes.get();
    for (var i = 0; i < all.length; i++) {
        var n = all[i];
        if (pins.indexOf(n.id) >= 0) {
            var needsPin = !n._topoPinned;
            if (needsPin) {
                var ocolor = _topoOriginalColors[n.id] || n.color || {};
                updates.push({ id: n.id, borderWidth: 3, borderWidthSelected: 3, _topoPinned: true,
                    color: { background: ocolor.background || 'rgba(255,215,0,0.15)', border: '#ffd700',
                        highlight: { background: 'rgba(255,215,0,0.25)', border: '#ffd700' },
                        hover: { background: 'rgba(255,215,0,0.2)', border: '#ffd700' } } });
            }
        } else {
            if (n._topoPinned) {
                var ocolor = _topoOriginalColors[n.id] || n.color;
                updates.push({ id: n.id, borderWidth: 2, borderWidthSelected: 2, _topoPinned: false,
                    color: ocolor });
            }
        }
    }
    if (updates.length > 0) { _topoPausePhysics(); _topoNodes.update(updates); }
}
function getTopoNotes() {
    try { return JSON.parse(localStorage.getItem('topo_notes_' + projectId) || '{}'); } catch(e) { return {}; }
}
function setTopoNotes(notes) {
    localStorage.setItem('topo_notes_' + projectId, JSON.stringify(notes));
}
function promptTopoNote(ip) {
    var notes = getTopoNotes();
    var existing = notes[ip] || '';
    var val = prompt(t('topology.note_for') + ' ' + ip + ':', existing);
    if (val === null) return;
    if (val.trim()) { notes[ip] = val.trim(); } else { delete notes[ip]; }
    setTopoNotes(notes);
}
function exportTopoJSON() {
    if (!_topoHostsByIP) return;
    var json = JSON.stringify({ nodes: _topoHostsByIP }, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'topology_' + (projectId || 'export') + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
}

function populateTopoAdvancedFilters() {
    if (!_topoHostsByIP) return;
    var subnets = new Set(), oses = new Set(), svcs = new Set();
    for (var ip in _topoHostsByIP) {
        var h = _topoHostsByIP[ip];
        if (!h) continue;
        if (h.subnet) subnets.add(h.subnet);
        var osName = osLabel(h.os);
        if (osName) oses.add(osName);
        if (h.services) { for (var si = 0; si < h.services.length; si++) { var s = h.services[si]; if (s && s.trim()) svcs.add(s.trim()); } }
        if (h.port_detail) { for (var pi = 0; pi < h.port_detail.length; pi++) { var s = h.port_detail[pi].service; if (s && s.trim()) svcs.add(s.trim()); } }
    }
    var subnetSel = document.getElementById('topo-filter-subnet');
    if (subnetSel) {
        var cur = subnetSel.value;
        subnetSel.innerHTML = '<option value="">' + t('topology.all_subnets') + '</option>';
        Array.from(subnets).sort().forEach(function(s) {
            subnetSel.innerHTML += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
        });
        if (cur) subnetSel.value = cur;
    }
    var osSel = document.getElementById('topo-filter-os');
    if (osSel) {
        var curOs = osSel.value;
        osSel.innerHTML = '<option value="">' + t('topology.all_os') + '</option>';
        Array.from(oses).sort().forEach(function(o) {
            osSel.innerHTML += '<option value="' + esc(o) + '">' + esc(o) + '</option>';
        });
        if (curOs) osSel.value = curOs;
    }
    var svcSel = document.getElementById('topo-filter-service');
    if (svcSel) {
        var curSvc = svcSel.value;
        svcSel.innerHTML = '<option value="">' + t('topology.all_services') + '</option>';
        Array.from(svcs).sort().forEach(function(s) {
            svcSel.innerHTML += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
        });
        if (curSvc) svcSel.value = curSvc;
    }
}

function applyTopoAdvancedFilters() {
    if (!_topoNodes) return;
    var subnetSel = document.getElementById('topo-filter-subnet');
    var osSel = document.getElementById('topo-filter-os');
    var minInput = document.getElementById('topo-filter-min-ports');
    var svcSel = document.getElementById('topo-filter-service');
    if (!subnetSel) return;
    var subnetVal = subnetSel.value || '';
    var osVal = osSel ? (osSel.value || '') : '';
    var minPorts = minInput ? (parseInt(minInput.value) || 0) : 0;
    var svcVal = svcSel ? (svcSel.value || '') : '';
    var fc = document.getElementById('topology-filter-count');
    if (!subnetVal && !osVal && minPorts < 1 && !svcVal) {
        clearTopoAdvancedFilters(); return;
    }
    var ids = _topoNodes.getIds();
    var updates = [], matched = 0;
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (typeof id === 'string' && id.indexOf('cluster:') >= 0) continue;
        var n = _topoNodes.get(id);
        if (!n) continue;
        var ok = true;
        if (subnetVal && n.subnet !== subnetVal) ok = false;
        if (ok && osVal && osLabel(n.os || '') !== osVal) ok = false;
        if (ok && minPorts > 0 && (n.ports || 0) < minPorts) ok = false;
        if (ok && svcVal) {
            var h = _topoHostsByIP ? _topoHostsByIP[id] : null;
            if (h) {
                var svcOk = false;
                if (h.services) { for (var si = 0; si < h.services.length; si++) { if (h.services[si].toLowerCase() === svcVal.toLowerCase()) { svcOk = true; break; } } }
                if (!svcOk && h.port_detail) { for (var pi = 0; pi < h.port_detail.length; pi++) { if ((h.port_detail[pi].service || '').toLowerCase() === svcVal.toLowerCase()) { svcOk = true; break; } } }
                if (!svcOk) ok = false;
            } else { ok = false; }
        }
        updates.push({ id: id, hidden: !ok });
        if (ok) matched++;
    }
    _topoPausePhysics();
    _topoNodes.update(updates);
    _topoResumePhysics();
    if (fc) { fc.textContent = matched + '/' + ids.length; fc.style.display = ''; }
}

function clearTopoAdvancedFilters() {
    console.log('clear filters');
    if (!_topoNodes) return;
    var subnetSel = document.getElementById('topo-filter-subnet');
    var osSel = document.getElementById('topo-filter-os');
    var minInput = document.getElementById('topo-filter-min-ports');
    if (subnetSel) subnetSel.value = '';
    if (osSel) osSel.value = '';
    if (minInput) minInput.value = '';
    var allNodes = _topoNodes.get();
    var updates = [];
    for (var i = 0; i < allNodes.length; i++) {
        if (allNodes[i].hidden) updates.push({ id: allNodes[i].id, hidden: false });
    }
    console.log('restoring', updates.length, 'nodes');
    if (updates.length > 0) { _topoPausePhysics(); _topoNodes.update(updates); _topoResumePhysics(); }
    var fc = document.getElementById('topology-filter-count');
    if (fc) { fc.textContent = ''; fc.style.display = 'none'; }
}

var _topoShowPinnedOnly = false;
var _topoAnalysisPanel = null;

function toggleTopoAnalysisPanel(name) {
    var panels = document.getElementById('topology-analysis-panels');
    var body = document.getElementById('topo-analysis-body');
    if (!panels || !body) return;
    if (_topoAnalysisPanel === name) {
        panels.style.display = 'none';
        _topoAnalysisPanel = null;
        return;
    }
    _topoAnalysisPanel = name;
    panels.style.display = '';
    if (name === 'risk-rank') renderTopoRiskRanking(body);
    else if (name === 'port-heat') renderTopoPortHeatMap(body);
    else if (name === 'subnet-ana') renderTopoSubnetAnalysis(body);
}

function renderTopoRiskRanking(body) {
    if (!_topoHostsByIP) { body.innerHTML = '<p style="color:var(--text-muted);">' + t('topology.no_data') + '</p>'; return; }
    var highRiskPorts = [21, 23, 25, 53, 110, 135, 139, 143, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017];
    var scores = [];
    var totalPorts = 0;
    for (var ip in _topoHostsByIP) {
        var h = _topoHostsByIP[ip];
        if (!h) continue;
        var ports = h.port_detail || [];
        var highRisk = ports.filter(function(p) { return highRiskPorts.indexOf(p.port) >= 0; }).length;
        var openPorts = ports.filter(function(p) { return p.state === 'open'; }).length;
        var score = highRisk * 10 + openPorts * 2 + (h.os && h.os_inferred ? 3 : 0);
        totalPorts += openPorts;
        scores.push({ ip: ip, hostname: h.hostname || '', os: h.os, ports: openPorts, highRisk: highRisk, score: score });
    }
    scores.sort(function(a, b) { return b.score - a.score; });
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><strong>' + t('topology.host_risk_ranking') + '</strong><button class="btn btn-sm btn-secondary" onclick="document.getElementById(\'topology-analysis-panels\').style.display=\'none\';_topoAnalysisPanel=null;">\u2715</button></div>';
    html += '<div style="margin-bottom:8px;font-size:0.72rem;color:var(--text-muted);">' + Object.keys(_topoHostsByIP).length + ' ' + t('topology.hosts') + ', ' + totalPorts + ' ' + t('topology.open_ports') + '</div>';
    var maxScore = scores.length > 0 ? scores[0].score : 1;
    scores.forEach(function(s) {
        var pct = Math.round(s.score / maxScore * 100);
        var barColor = pct >= 60 ? '#f06262' : pct >= 30 ? '#ffa726' : '#66bb6a';
        html += '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1;">' +
            '<span style="color:' + osColor(s.os) + ';font-size:0.7rem;">\u25cf</span>' +
            '<span style="font-weight:600;font-size:0.78rem;">' + esc(s.ip) + '</span>' +
            (s.hostname ? '<span style="font-size:0.65rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">' + esc(s.hostname) + '</span>' : '') +
            '</div>' +
            '<span style="font-weight:700;font-size:0.78rem;color:' + barColor + ';">' + s.score + '</span>' +
            '</div>' +
            '<div style="margin-top:3px;height:4px;background:var(--bg-card);border-radius:2px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;"></div></div>' +
            '<div style="display:flex;gap:8px;margin-top:2px;font-size:0.65rem;color:var(--text-muted);">' +
            '<span>' + s.ports + ' ' + t('topology.ports') + '</span>' +
            (s.highRisk > 0 ? '<span style="color:#f06262;">\u26a0 ' + s.highRisk + ' ' + t('topology.high_risk') + '</span>' : '') +
            '<span>' + osLabel(s.os) + '</span>' +
            '</div></div>';
    });
    body.innerHTML = html;
}

function renderTopoPortHeatMap(body) {
    if (!_topoHostsByIP) {     body.innerHTML = '<p style="color:var(--text-muted);">' + t('topology.no_data') + '</p>'; return; }
    var portCounts = {}, portServices = {};
    for (var ip in _topoHostsByIP) {
        var h = _topoHostsByIP[ip];
        if (!h) continue;
        (h.port_detail || []).forEach(function(p) {
            if (!portCounts[p.port]) { portCounts[p.port] = 0; portServices[p.port] = {}; }
            portCounts[p.port]++;
            if (p.service) portServices[p.port][p.service] = (portServices[p.port][p.service] || 0) + 1;
        });
    }
    var sorted = Object.keys(portCounts).map(Number).sort(function(a, b) { return portCounts[b] - portCounts[a]; });
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><strong>' + t('topology.port_heat_map') + '</strong><button class="btn btn-sm btn-secondary" onclick="document.getElementById(\'topology-analysis-panels\').style.display=\'none\';_topoAnalysisPanel=null;">\u2715</button></div>';
    html += '<div style="margin-bottom:8px;font-size:0.72rem;color:var(--text-muted);">' + sorted.length + ' ' + t('topology.unique_ports_across') + ' ' + Object.keys(_topoHostsByIP).length + ' ' + t('topology.hosts') + '</div>';
    var maxCount = sorted.length > 0 ? portCounts[sorted[0]] : 1;
    sorted.forEach(function(port) {
        var count = portCounts[port];
        var pct = Math.round(count / maxCount * 100);
        var highRisk = [21, 23, 25, 53, 110, 135, 139, 143, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017].indexOf(port) >= 0;
        var topServices = Object.entries(portServices[port]).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);
        html += '<div style="padding:5px 0;border-bottom:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-weight:600;font-size:0.8rem;' + (highRisk ? 'color:#f06262;' : '') + '">' + port + '</span>' +
            (highRisk ? '<span style="font-size:0.6rem;background:#f0626222;color:#f06262;padding:1px 5px;border-radius:3px;">' + t('topology.high') + '</span>' : '') +
            '</div>' +
            '<span style="font-size:0.75rem;color:var(--text-muted);">' + count + ' ' + (count > 1 ? t('topology.hosts') : t('topology.host')) + '</span>' +
            '</div>' +
            '<div style="margin-top:2px;height:3px;background:var(--bg-card);border-radius:2px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + (highRisk ? '#f06262' : '#4caf50') + ';border-radius:2px;"></div></div>' +
            (topServices.length > 0 ? '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">' + topServices.map(function(s) { return esc(s[0]) + ' (' + s[1] + ')'; }).join(', ') + '</div>' : '') +
            '</div>';
    });
    body.innerHTML = html;
}

function renderTopoSubnetAnalysis(body) {
    if (!_topoHostsByIP) {     body.innerHTML = '<p style="color:var(--text-muted);">' + t('topology.no_data') + '</p>'; return; }
    var subnets = {};
    for (var ip in _topoHostsByIP) {
        var h = _topoHostsByIP[ip];
        if (!h) continue;
        var sn = h.subnet || 'unknown';
        if (!subnets[sn]) subnets[sn] = { hosts: [], totalPorts: 0, highRisk: 0, osTypes: {} };
        subnets[sn].hosts.push(ip);
        subnets[sn].totalPorts += (h.port_detail || []).filter(function(p) { return p.state === 'open'; }).length;
        var hrCount = (h.port_detail || []).filter(function(p) { return [21, 23, 25, 53, 110, 135, 139, 143, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017].indexOf(p.port) >= 0; }).length;
        subnets[sn].highRisk += hrCount;
        var ol = osLabel(h.os);
        subnets[sn].osTypes[ol] = (subnets[sn].osTypes[ol] || 0) + 1;
    }
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><strong>' + t('topology.subnet_analysis') + '</strong><button class="btn btn-sm btn-secondary" onclick="document.getElementById(\'topology-analysis-panels\').style.display=\'none\';_topoAnalysisPanel=null;">\u2715</button></div>';
    var sorted = Object.keys(subnets).sort();
    sorted.forEach(function(sn) {
        var s = subnets[sn];
        var osHtml = Object.entries(s.osTypes).sort(function(a, b) { return b[1] - a[1]; }).map(function(e) {
            return '<span style="color:' + osColor(e[0]) + ';font-size:0.65rem;">\u25cf ' + e[1] + ' ' + e[0] + '</span>';
        }).join(' ');
        var riskLevel = s.highRisk > 5 ? '#f06262' : s.highRisk > 0 ? '#ffa726' : '#66bb6a';
        html += '<div style="padding:7px 0;border-bottom:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<strong style="font-size:0.8rem;">' + esc(sn) + '</strong>' +
            '<span style="font-size:0.7rem;padding:1px 6px;border-radius:3px;background:' + riskLevel + '22;color:' + riskLevel + ';">' + (s.highRisk > 0 ? '\u26a0 ' + s.highRisk : '\u2713') + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:3px;font-size:0.7rem;color:var(--text-muted);">' +
            '<span>' + s.hosts.length + ' ' + t('topology.hosts') + '</span>' +
            '<span>' + s.totalPorts + ' ' + t('topology.ports') + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px;">' + osHtml + '</div>' +
            '</div>';
    });
    body.innerHTML = html;
}

function showTopoExportModal() {
    var body = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">' + t('topology.generating_export') + '</p>';
    var m = showModal('topo-export-modal', t('topology.export_title'), body, 'modal-small');
    var fmt = function(size) {
        if (size < 1024) return size + ' B';
        if (size < 1024*1024) return (size/1024).toFixed(1) + ' KB';
        return (size/1024/1024).toFixed(1) + ' MB';
    };
    setTimeout(function() {
        try {
            var canvas = document.querySelector('#topology-graph canvas');
            var pngSize = 0, svgSize = 0;
            if (canvas) {
                var pngData = canvas.toDataURL('image/png');
                pngSize = Math.round(pngData.length * 0.75);
                var svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="' + canvas.width + '" height="' + canvas.height + '"><foreignObject width="100%" height="100%"><img src="' + pngData + '" width="' + canvas.width + '" height="' + canvas.height + '"/></foreignObject></svg>';
                svgSize = new Blob([svgContent]).size;
            }
            var jsonSize = 0;
            if (_topoHostsByIP) {
                jsonSize = new Blob([JSON.stringify({ nodes: _topoHostsByIP }, null, 2)]).size;
            }
            body = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">' + t('topology.select_export_format') + '</p>' +
                '<div style="display:flex;flex-direction:column;gap:8px;">' +
                (canvas ? '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoPNG();">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>' +
                ' ' + t('topology.export_png') +
                ' <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">' + fmt(pngSize) + '</span>' +
                '</button>' : '') +
                (canvas ? '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoSVG();">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>' +
                ' ' + t('topology.export_svg') +
                ' <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">' + fmt(svgSize) + '</span>' +
                '</button>' : '') +
                '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoJSON();">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                ' ' + t('topology.export_json') +
                ' <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">' + fmt(jsonSize) + '</span>' +
                '</button>' +
                '<button class="btn btn-success btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoReport();">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
                ' ' + t('topology.export_html') +
                ' <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">~' + fmt(jsonSize * 3) + '</span>' +
                '</button>' +
                '</div>';
        } catch(e) {
            body = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">' + t('topology.select_export_format') + '</p>' +
                '<div style="display:flex;flex-direction:column;gap:8px;">' +
                '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoPNG();">' + t('topology.export_png') + '</button>' +
                '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoSVG();">' + t('topology.export_svg') + '</button>' +
                '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoJSON();">' + t('topology.export_json') + '</button>' +
                '<button class="btn btn-success btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="closeModal(\'topo-export-modal\');exportTopoReport();">' + t('topology.export_html') + '</button>' +
                '</div>';
        }
        m.querySelector('.modal-body').innerHTML = body;
    }, 50);
}

function exportTopoReport() {
    if (!_topoHostsByIP) return;
    var hosts = _topoHostsByIP;
    var highRiskPortsList = [21, 23, 25, 53, 110, 135, 139, 143, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017];
    var now = new Date().toISOString().split('T')[0];
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + t('topology.report_title') + ' - ' + now + '</title>' +
        '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:900px;margin:0 auto;padding:20px;color:#222;background:#fff;}h1{font-size:1.5rem;}h2{font-size:1.2rem;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px;}table{width:100%;border-collapse:collapse;margin:8px 0;}th,td{text-align:left;padding:6px 8px;border:1px solid #ddd;font-size:0.85rem;}th{background:#f5f5f5;}.risk-h{background:#fff0f0;}.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.75rem;}</style></head><body>' +
        '<h1>' + t('topology.report_title') + '</h1>' +
        '<p>' + t('topology.report_generated') + ' ' + now + ' | ' + t('topology.report_hosts') + ' ' + Object.keys(hosts).length + '</p>';

    html += '<h2>' + t('topology.host_list') + '</h2><table><thead><tr><th>' + t('topology.ip') + '</th><th>' + t('topology.hostname') + '</th><th>' + t('topology.os') + '</th><th>' + t('topology.ports_heading') + '</th><th>' + t('topology.subnet') + '</th><th>' + t('topology.status') + '</th><th>' + t('topology.risk') + '</th></tr></thead><tbody>';
    Object.keys(hosts).sort().forEach(function(ip) {
        var h = hosts[ip];
        if (!h) return;
        var ports = h.port_detail || [];
        var hr = ports.filter(function(p) { return highRiskPortsList.indexOf(p.port) >= 0; }).length;
        html += '<tr' + (hr > 0 ? ' class="risk-h"' : '') + '>' +
            '<td>' + esc(ip) + '</td>' +
            '<td>' + esc(h.hostname || '\u2014') + '</td>' +
            '<td>' + esc(osLabel(h.os)) + (h.os_inferred ? '*' : '') + '</td>' +
            '<td>' + ports.filter(function(p) { return p.state === 'open'; }).length + '</td>' +
            '<td>' + esc(h.subnet || '\u2014') + '</td>' +
            '<td>' + esc(h.status || '\u2014') + '</td>' +
            '<td>' + (hr > 0 ? '\u26a0 ' + hr : '\u2713') + '</td>' +
            '</tr>';
    });
    html += '</tbody></table>';

    html += '<h2>' + t('topology.open_ports') + '</h2><table><thead><tr><th>' + t('topology.port') + '</th><th>' + t('topology.proto') + '</th><th>' + t('topology.service') + '</th><th>' + t('topology.version') + '</th><th>' + t('topology.hosts') + '</th></tr></thead><tbody>';
    var portHosts = {};
    Object.keys(hosts).forEach(function(ip) {
        var h = hosts[ip];
        if (!h) return;
        (h.port_detail || []).forEach(function(p) {
            if (p.state !== 'open') return;
            var key = p.port + '/' + (p.protocol || 'tcp');
            if (!portHosts[key]) portHosts[key] = { port: p.port, protocol: p.protocol, service: p.service, version: p.version, hosts: [] };
            portHosts[key].hosts.push(ip);
        });
    });
    Object.keys(portHosts).sort().forEach(function(key) {
        var p = portHosts[key];
        html += '<tr><td>' + p.port + '</td><td>' + esc(p.protocol || 'tcp') + '</td><td>' + esc(p.service || '\u2014') + '</td><td>' + esc(p.version || '\u2014') + '</td><td>' + p.hosts.length + '</td></tr>';
    });
    html += '</tbody></table>';

    html += '<h2>' + t('topology.risk_summary') + '</h2><table><thead><tr><th>' + t('topology.high_risk_port') + '</th><th>' + t('topology.service') + '</th><th>' + t('topology.hosts') + '</th></tr></thead><tbody>';
    var riskPortHosts = {};
    Object.keys(hosts).forEach(function(ip) {
        var h = hosts[ip];
        if (!h) return;
        (h.port_detail || []).forEach(function(p) {
            if (highRiskPortsList.indexOf(p.port) < 0) return;
            var key = p.port + '/' + (p.protocol || 'tcp');
            if (!riskPortHosts[key]) riskPortHosts[key] = { port: p.port, service: p.service, hosts: [] };
            riskPortHosts[key].hosts.push(ip);
        });
    });
    Object.keys(riskPortHosts).sort().forEach(function(key) {
        var p = riskPortHosts[key];
        html += '<tr><td>' + p.port + '</td><td>' + esc(p.service || '\u2014') + '</td><td>' + p.hosts.join(', ') + '</td></tr>';
    });
    html += '</tbody></table></body></html>';

    var blob = new Blob([html], { type: 'text/html' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'topology_report_' + now + '.html';
    document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
}

function toggleTopoFullscreen() {
    const tab = document.getElementById('tab-topology');
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (tab.requestFullscreen) tab.requestFullscreen();
        else if (tab.webkitRequestFullscreen) tab.webkitRequestFullscreen();
        else if (tab.msRequestFullscreen) tab.msRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }
}

function saveTopoLayout() {
    if (!_topoNetwork) return;
    const positions = _topoNetwork.getPositions();
    const labels = {};
    for (const ip in _topoHostsByIP) {
        const node = _topoNodes && _topoNodes.get(ip);
        if (node && node._customLabel) labels[ip] = node._customLabel;
    }
    localStorage.setItem(_topoStoredPositionsKey, JSON.stringify({ positions: positions, labels: labels }));
}

function loadTopoLayout() {
    if (!_topoNetwork || !_topoNodes) return;
    const saved = localStorage.getItem(_topoStoredPositionsKey);
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        if (data.positions) {
            const moves = [];
            for (const id in data.positions) {
                const node = _topoNodes.get(id);
                if (node) moves.push({ id: id, x: data.positions[id].x, y: data.positions[id].y });
            }
            if (moves.length > 0) {
                _topoPausePhysics();
                _topoNodes.update(moves);
            }
        }
        if (data.labels) {
            for (const ip in data.labels) {
                const node = _topoNodes.get(ip);
                if (node) {
                    _topoNodes.update({ id: ip, label: data.labels[ip], _customLabel: true });
                }
            }
        }
    } catch(e) {
    }
}

function updateTopoStats() {
    const statsEl = document.getElementById('topology-stats');
    if (!statsEl || !_topoHostsByIP) return;
    let totalHosts = 0, totalPorts = 0, totalRisk = 0;
    const osCounts = {}, statusCounts = {}, servicesSet = {}, portsSet = {};
    for (const ip in _topoHostsByIP) {
        const h = _topoHostsByIP[ip];
        if (!h) continue;
        totalHosts++;
        totalPorts += (h.ports || 0);
        const osName = osLabel(h.os);
        osCounts[osName] = (osCounts[osName] || 0) + 1;
        const st = (h.status || 'unknown').toLowerCase();
        statusCounts[st] = (statusCounts[st] || 0) + 1;
        const ports = h.port_detail || [];
        if (ports.some(p => _topoHighRiskPorts.includes(p.port))) totalRisk++;
        for (const p of ports) {
            portsSet[p.port] = true;
            if (p.service) servicesSet[p.service] = true;
        }
    }
    const clusterCount = _topoClusters.length;
    const expandedCount = _topoOpenClusters.size;
    const uniquePorts = Object.keys(portsSet).length;
    const uniqueServices = Object.keys(servicesSet).length;
    const avgPorts = totalHosts > 0 ? (totalPorts / totalHosts).toFixed(1) : '0';

    let osHtmlSorted = Object.entries(osCounts).sort((a, b) => b[1] - a[1]);
    let osHtml = '';
    for (let i = 0; i < Math.min(osHtmlSorted.length, 5); i++) {
        const [name, count] = osHtmlSorted[i];
        const pct = Math.round((count / totalHosts) * 100);
        osHtml += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><span style="width:8px;height:8px;border-radius:50%;background:' + osColor(name) + ';flex-shrink:0;"></span><span style="flex:1;font-size:0.7rem;color:var(--text-muted);">' + esc(name) + '</span><span style="font-size:0.72rem;font-weight:600;">' + count + '</span><span style="font-size:0.65rem;color:var(--text-muted);width:28px;text-align:right;">' + pct + '%</span></div>';
    }

    let statusHtml = '';
    for (const st in statusCounts) {
        const color = st === 'up' ? '#4ade80' : st === 'down' ? '#f06262' : '#999';
        statusHtml += '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.7rem;margin-right:8px;"><span style="width:6px;height:6px;border-radius:50%;background:' + color + ';"></span>' + st + ':' + statusCounts[st] + '</span>';
    }

    statsEl.innerHTML = '<div style="font-weight:600;font-size:0.78rem;margin-bottom:6px;display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#icon-bar-chart"/></svg>' + t('topology.statistics') + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin-bottom:6px;">' +
        '<div><span class="stat-label">' + t('topology.hosts') + '</span><div class="stat-value">' + totalHosts + '</div></div>' +
        '<div><span class="stat-label">' + t('topology.open_ports_stat') + '</span><div class="stat-value">' + totalPorts + '</div></div>' +
        '<div><span class="stat-label">' + t('topology.high_risk') + '</span><div class="stat-value" style="color:' + (totalRisk > 0 ? '#f06262' : 'inherit') + ';">' + totalRisk + '</div></div>' +
        '<div><span class="stat-label">' + t('topology.avg_ports') + '</span><div class="stat-value">' + avgPorts + '</div></div>' +
        '<div><span class="stat-label">' + t('topology.services') + '</span><div class="stat-value">' + uniqueServices + '</div></div>' +
        '<div><span class="stat-label">' + t('topology.unique_ports') + '</span><div class="stat-value">' + uniquePorts + '</div></div>' +
        '<div><span class="stat-label">' + t('topology.subnets') + '</span><div class="stat-value">' + clusterCount + '</div></div>' +
        '<div><span class="stat-label">' + t('topology.expanded') + '</span><div class="stat-value">' + expandedCount + '/' + clusterCount + '</div></div>' +
        '</div>' +
        (statusHtml ? '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;margin-bottom:4px;">' + statusHtml + '</div>' : '') +
        (osHtml ? '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;"><div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">' + t('topology.os_distribution') + '</div>' + osHtml + '</div>' : '');
    statsEl.style.display = '';
}

function promptTopoLabel(nodeId) {
    const node = _topoNodes && _topoNodes.get(nodeId);
    if (!node) return;
    const overlay = document.createElement('div');
    overlay.className = 'topo-label-prompt-overlay';
    overlay.innerHTML = '<div class="topo-label-prompt-box">' +
        '<h3>' + t('topology.custom_label') + '</h3>' +
        '<p style="font-size:0.75rem;color:var(--text-muted);margin:0 0 4px 0;">' + t('topology.for_label') + ' ' + esc(nodeId) + '</p>' +
        '<input type="text" id="topo-label-input" value="' + esc(node.label || '') + '" placeholder="' + t('topology.custom_label_placeholder') + '" autofocus>' +
        '<div class="prompt-actions">' +
        '<button onclick="this.closest(\'.topo-label-prompt-overlay\').remove()">' + t('common.cancel') + '</button>' +
        '<button class="btn-primary" id="topo-label-save">' + t('topology.save') + '</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#topo-label-input');
    const saveBtn = overlay.querySelector('#topo-label-save');
    function saveLabel() {
        const val = input.value.trim();
        if (val) {
            _topoNodes.update({ id: nodeId, label: val, _customLabel: true });
        } else if (node._customLabel) {
            const h = _topoHostsByIP[nodeId];
            const defaultLabel = h ? nodeId : node.label;
            _topoNodes.update({ id: nodeId, label: defaultLabel, _customLabel: false });
        }
        overlay.remove();
        saveTopoLayout();
    }
    saveBtn.addEventListener('click', saveLabel);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveLabel(); });
    setTimeout(function() { input.focus(); input.select(); }, 50);
}

function showTopoContextMenu(e, nodeId) {
    const menu = document.getElementById('topology-contextmenu');
    if (!menu) return;
    e.preventDefault();
    e.stopPropagation();
    const node = _topoNodes && _topoNodes.get(nodeId);
    const isCluster = nodeId && nodeId.startsWith && nodeId.startsWith('cluster:');
    if (isCluster) {
        const subnet = node ? node.label.split('\n')[0] : nodeId;
        menu.innerHTML = '<div class="ctx-item" data-action="copy" data-value="' + esc(subnet) + '">\u{1F4CB} ' + t('topology.ctx_copy_subnet') + '</div>' +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item close-menu">\u2715 ' + t('common.close') + '</div>';
    } else if (node && node.ip) {
        menu.innerHTML = '<div class="ctx-item" data-action="copy" data-value="' + esc(node.ip) + '">\u{1F4CB} ' + t('topology.ctx_copy_ip') + '</div>' +
            (node.hostname ? '<div class="ctx-item" data-action="copy" data-value="' + esc(node.hostname) + '">\u{1F4CB} ' + t('topology.ctx_copy_hostname') + '</div>' : '') +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item" data-action="label" data-node="' + esc(node.ip) + '">\u270F\u200B ' + t('topology.ctx_set_label') + '</div>' +
            '<div class="ctx-item" data-action="pin" data-node="' + esc(node.ip) + '">' + (isTopoPinned(node.ip) ? '\u2B50 ' + t('topology.ctx_unpin') : '\u{1F4CC} ' + t('topology.ctx_pin')) + '</div>' +
            '<div class="ctx-item" data-action="note" data-node="' + esc(node.ip) + '">\u{1F4DD} ' + t('topology.ctx_set_note') + '</div>' +
            '<div class="ctx-item" data-action="detail" data-node="' + esc(node.ip) + '">\u{1F50D} ' + t('topology.ctx_show_details') + '</div>' +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item close-menu">\u2715 ' + t('common.close') + '</div>';
    } else {
        menu.innerHTML = '<div class="ctx-item close-menu">\u2715 ' + t('common.close') + '</div>';
    }
    const rect = document.getElementById('topology-graph').getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 200;
    if (x + mw > rect.width - 10) x = rect.width - mw - 10;
    if (y + mh > rect.height - 10) y = rect.height - mh - 10;
    if (x < 10) x = 10;
    if (y < 10) y = 10;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = '';
    menu._targetNodeId = nodeId;

    const graphEl = document.getElementById('topology-graph');
    const closeHandler = function(ev) {
        if (!menu.contains(ev.target)) { menu.style.display = 'none'; graphEl.removeEventListener('click', closeHandler); }
    };
    menu.querySelectorAll('.close-menu').forEach(function(el) { el.onclick = function() { menu.style.display = 'none'; }; });
    menu.querySelectorAll('.ctx-item[data-action="copy"]').forEach(function(el) {
        el.onclick = function() {
            navigator.clipboard.writeText(el.dataset.value).catch(function() {});
            menu.style.display = 'none';
        };
    });
    menu.querySelectorAll('.ctx-item[data-action="label"]').forEach(function(el) {
        el.onclick = function() { menu.style.display = 'none'; promptTopoLabel(el.dataset.node); };
    });
    menu.querySelectorAll('.ctx-item[data-action="detail"]').forEach(function(el) {
        el.onclick = function() {
            menu.style.display = 'none';
            const h = _topoHostsByIP[el.dataset.node];
            if (h) showHostDetail(h, document.getElementById('topology-detail'));
        };
    });
    menu.querySelectorAll('.ctx-item[data-action="pin"]').forEach(function(el) {
        el.onclick = function() {
            menu.style.display = 'none';
            toggleTopoPin(el.dataset.node);
        };
    });
    menu.querySelectorAll('.ctx-item[data-action="note"]').forEach(function(el) {
        el.onclick = function() {
            menu.style.display = 'none';
            promptTopoNote(el.dataset.node);
        };
    });
    graphEl.addEventListener('click', closeHandler, { once: true });
}

function renderTopology(data, container, tooltipEl, legendEl, detailEl) {
    function hasOpenPort(h) { return h.ports > 0 || (h.port_detail && h.port_detail.length > 0); }
    _topoHostsByIP = {};
    for (const n of (data.nodes || [])) { if (hasOpenPort(n)) _topoHostsByIP[n.ip] = n; }
    for (const c of (data.clusters || [])) { for (const h of (c.hosts || [])) { if (hasOpenPort(h)) _topoHostsByIP[h.ip] = h; } }
    if (!detailEl._topoClickSetup) {
        detailEl._topoClickSetup = true;
        detailEl.addEventListener('click', function(e) {
            const row = e.target.closest('tr');
            if (row && row.dataset.ip) {
                const h = _topoHostsByIP[row.dataset.ip];
                if (h) showHostDetail(h, detailEl);
            }
        });
    }

    const individualNodes = (data.nodes || []).filter(n => hasOpenPort(n));
    const clusters = [];
    for (const c of (data.clusters || [])) {
        const filteredHosts = (c.hosts || []).filter(h => hasOpenPort(h));
        if (filteredHosts.length > 0) {
            clusters.push({ subnet: c.subnet, host_count: filteredHosts.length, port_count: c.port_count, hosts: filteredHosts, services: c.services });
        }
    }
    const clusterSubnets = new Set(clusters.map(c => c.subnet));
    _topoClusterSubnets.clear();
    for (const s of clusterSubnets) { _topoClusterSubnets.add(s); }
    _topoClusters = clusters;
    _topoClusterNodes = {};
    _topoOriginalColors = {};
    _topoHighlighted = false;
    _topoPathFirst = null;
    _topoPathNodes = null;
    _topoPathEdges = null;
    if (_topoRiskActive) {
        const btn = document.getElementById('topo-btn-risk');
        if (btn) btn.dataset.active = '0';
        _topoRiskActive = false;
    }
    const riskBtn = document.getElementById('topo-btn-risk');
    if (riskBtn) riskBtn.classList.remove('active');
    const pathBtn = document.getElementById('topo-btn-path');
    if (pathBtn) { pathBtn.dataset.active = '0'; pathBtn.classList.remove('active'); _topoPathMode = false; }

    const nodes = new vis.DataSet();
    const edges = new vis.DataSet();
    var fCol = topoFontColor(), sCol = topoStrokeColor();

    for (const h of individualNodes) {
        const c = osColor(h.os);
        const color = {
            background: hexToRgba(c, 0.15), border: hexToRgba(c, 0.8),
            highlight: { background: hexToRgba(c, 0.25), border: hexToRgba(c, 1) },
            hover: { background: hexToRgba(c, 0.2), border: hexToRgba(c, 0.9) }
        };
        _topoOriginalColors[h.ip] = color;
        nodes.add({
            id: h.ip,
            ip: h.ip, subnet: h.subnet, ports: h.ports, hostname: h.hostname,
            services: h.services, port_detail: h.port_detail, os_inferred: h.os_inferred,
            mac: h.mac, status: h.status, os: h.os,
            label: h.ip,
            shape: 'dot', size: topoNodeSize(h.ports), opacity: 1.0,
            color: color,
            borderWidth: 2, borderWidthSelected: 3,
            font: { size: 9, face: 'Inter, system-ui, -apple-system, sans-serif', color: fCol, strokeWidth: 3, strokeColor: sCol },
            title: h.ip + (h.hostname ? '\n' + h.hostname : '') + (h.os_inferred ? '\n' + t('topology.inferred_os') : '')
        });
    }

    for (const cluster of clusters) {
        const cid = 'cluster:' + cluster.subnet.replace(/[^a-zA-Z0-9.]/g, '_');
        _topoClusterNodes[cluster.subnet] = cid;
        for (const h of cluster.hosts) {
            const c = osColor(h.os);
            const color = {
                background: hexToRgba(c, 0.15), border: hexToRgba(c, 0.8),
                highlight: { background: hexToRgba(c, 0.25), border: hexToRgba(c, 1) },
                hover: { background: hexToRgba(c, 0.2), border: hexToRgba(c, 0.9) }
            };
            _topoOriginalColors[h.ip] = color;
            nodes.add({
                id: h.ip,
                ip: h.ip, subnet: h.subnet, ports: h.ports, hostname: h.hostname,
                services: h.services, port_detail: h.port_detail, os_inferred: h.os_inferred,
                mac: h.mac, status: h.status, os: h.os,
                label: h.ip,
                shape: 'dot', size: topoNodeSize(h.ports), opacity: 1.0,
                color: color,
                borderWidth: 2, borderWidthSelected: 3,
                font: { size: 9, face: 'Inter, system-ui, -apple-system, sans-serif', color: fCol, strokeWidth: 3, strokeColor: sCol },
                title: h.ip + (h.hostname ? '\n' + h.hostname : '') + (h.os_inferred ? '\n' + t('topology.inferred_os') : ''),
                hidden: true
            });
            edges.add({
                from: cid, to: h.ip,
                color: { color: 'rgba(230,149,46,0.15)', highlight: 'rgba(230,149,46,0.4)' },
                width: 1, dashes: [4, 3]
            });
        }
        const cc = '#e6952e';
        nodes.add({
            id: cid,
            label: cluster.subnet + '\n' + cluster.host_count + ' ' + t('topology.hosts') + ' \u00B7 ' + cluster.port_count + ' ' + t('topology.ports'),
            shape: 'hexagon', size: 40, opacity: 1.0,
            color: {
                background: 'rgba(230,149,46,0.1)', border: 'rgba(230,149,46,0.6)',
                highlight: { background: 'rgba(230,149,46,0.2)', border: 'rgba(230,149,46,0.9)' }
            },
            font: { size: 10, face: 'Inter, system-ui, -apple-system, sans-serif', color: cc, align: 'center', bold: true },
            borderWidth: 2, borderDashes: [6, 4]
        });
    }

    const edgeSet = new Set();
    for (const n of individualNodes) {
        for (const other of individualNodes) {
            if (n.ip !== other.ip && n.subnet === other.subnet) {
                const key = [n.ip, other.ip].sort().join('|');
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    edges.add({ from: n.ip, to: other.ip, color: { color: 'rgba(100,100,140,0.1)', highlight: 'rgba(230,149,46,0.3)' }, width: 1 });
                }
            }
        }
    }

    if (_topoNetwork) { _topoNetwork.destroy(); _topoNetwork = null; }
    _topoOpenClusters.clear();

    const options = {
        nodes: {
            shape: 'dot',
            font: { face: 'Inter, system-ui, -apple-system, sans-serif', size: 9, color: fCol, strokeWidth: 3, strokeColor: sCol },
            borderWidth: 2, borderWidthSelected: 3,
            color: { highlight: { border: '#e6952e' } }
        },
        edges: {
            smooth: { type: 'continuous' },
            color: { color: 'rgba(100,100,140,0.1)', highlight: 'rgba(230,149,46,0.3)' },
            width: 1
        },
        physics: {
            barnesHut: {
                gravitationalConstant: -2000, centralGravity: 0.25,
                springLength: 150, springConstant: 0.04, damping: 0.18
            },
            stabilization: { iterations: 200, updateInterval: 25 }
        },
        interaction: {
            hover: true, tooltipDelay: 200, zoomSpeed: 2.0,
            navigationButtons: false, keyboard: false
        },
        configure: { enabled: false }
    };

    const network = new vis.Network(container, { nodes: nodes, edges: edges }, options);
    _topoNetwork = network;
    _topoNodes = nodes;
    _topoEdges = edges;

    buildLegend({ nodes: individualNodes, clusters: clusters }, legendEl);

    var tb = document.getElementById('topology-toolbar');
    if (tb) tb.style.display = '';
    var sb = document.getElementById('topo-actions');
    if (sb) sb.style.display = '';
    var statsEl = document.getElementById('topology-stats');
    if (statsEl) updateTopoStats();
    var filterEl = document.getElementById('topology-filter');
    var filterBtn = document.getElementById('topology-filter-btn');
    var countEl = document.getElementById('topology-filter-count');
    if (filterEl) {
        filterEl.value = '';
        filterEl.onkeydown = function(e) { if (e.key === 'Enter') { toggleFilterTopo(); if (_topoNetwork) _topoNetwork.fit({ animation: true }); } };
    }
    if (filterBtn) filterBtn.onclick = function() { toggleFilterTopo(); if (_topoNetwork) _topoNetwork.fit({ animation: true }); };
    if (countEl) countEl.style.display = 'none';

    var riskBtn2 = document.getElementById('topo-btn-risk');
    if (riskBtn2) riskBtn2.onclick = toggleTopoRiskFilter;
    var pathBtn2 = document.getElementById('topo-btn-path');
    if (pathBtn2) pathBtn2.onclick = toggleTopoPathMode;
    var layoutSel = document.getElementById('topo-layout-mode');
    if (layoutSel) {
        layoutSel.onchange = function() { setTopoLayout(this.value); };
    }
    var fsBtn = document.getElementById('topo-btn-fullscreen');
    if (fsBtn) fsBtn.onclick = toggleTopoFullscreen;
    var exportBtn = document.getElementById('topo-btn-export');
    if (exportBtn) exportBtn.onclick = showTopoExportModal;

    var zoomSlider = document.getElementById('topo-zoom-slider');
    if (zoomSlider) {
        zoomSlider.oninput = function() {
            if (_topoNetwork) _topoNetwork.moveTo({ scale: parseFloat(this.value), animation: { duration: 100 } });
        };
    }

    populateTopoAdvancedFilters();
    var subnetSel = document.getElementById('topo-filter-subnet');
    var osSel = document.getElementById('topo-filter-os');
    var minInput = document.getElementById('topo-filter-min-ports');
    var svcSel = document.getElementById('topo-filter-service');
    if (subnetSel) subnetSel.onchange = applyTopoAdvancedFilters;
    if (osSel) osSel.onchange = applyTopoAdvancedFilters;
    if (minInput) minInput.oninput = applyTopoAdvancedFilters;
    if (svcSel) svcSel.onchange = applyTopoAdvancedFilters;

    var riskRankBtn = document.getElementById('topo-btn-analysis');
    if (riskRankBtn) riskRankBtn.onclick = function() {
        var menu = document.getElementById('topo-analysis-menu');
        if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
    };
    document.querySelectorAll('#topo-analysis-menu .act-item').forEach(function(el) {
        el.onclick = function() {
            document.getElementById('topo-analysis-menu').style.display = 'none';
            toggleTopoAnalysisPanel(this.dataset.panel);
        };
    });
    document.addEventListener('click', function(e) {
        var dd = document.getElementById('topo-analysis-dropdown');
        if (dd && !dd.contains(e.target)) {
            var menu = document.getElementById('topo-analysis-menu');
            if (menu) menu.style.display = 'none';
        }
    });

    network.on('zoom', function() {
        var s = document.getElementById('topo-zoom-slider');
        if (s && _topoNetwork) s.value = '' + Math.round(_topoNetwork.getScale() * 100) / 100;
    });

    network.on('click', function(params) {
        const edgeIds = params.edges;
        if (edgeIds && edgeIds.length > 0 && params.nodes.length === 0) {
            var edge = _topoEdges.get(edgeIds[0]);
            if (edge && edge.from && edge.to) {
                var fromNode = _topoHostsByIP[edge.from];
                var toNode = _topoHostsByIP[edge.to];
                if (fromNode && toNode) {
                    var subnet = fromNode.subnet || 'unknown';
                    detailEl.innerHTML = '<div class="detail-header">' +
                        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                        '<strong style="font-size:0.88rem;color:var(--accent);">' + t('topology.connection') + '</strong>' +
                        '<span class="badge badge-info" style="font-size:0.65rem;">' + esc(subnet) + '</span>' +
                        '</div>' +
                        '<button class="detail-close" onclick="this.closest(\'#topology-detail\').style.display=\'none\'">\u2715</button>' +
                        '</div><div class="detail-body">' +
                        '<div class="info-line"><span>' + esc(edge.from) + '</span> <span style="color:var(--text-muted);">\u2194</span> <span>' + esc(edge.to) + '</span></div>' +
                        '<table class="tp-table"><thead><tr><th>' + t('topology.property') + '</th><th>' + esc(edge.from) + '</th><th>' + esc(edge.to) + '</th></tr></thead><tbody>' +
                        '<tr><td>' + t('topology.os') + '</td><td>' + osLabel(fromNode.os) + '</td><td>' + osLabel(toNode.os) + '</td></tr>' +
                        '<tr><td>' + t('topology.hostname') + '</td><td>' + esc(fromNode.hostname || '\u2014') + '</td><td>' + esc(toNode.hostname || '\u2014') + '</td></tr>' +
                        '<tr><td>' + t('topology.ports') + '</td><td>' + fromNode.ports + '</td><td>' + toNode.ports + '</td></tr>' +
                        '<tr><td>' + t('topology.status') + '</td><td>' + esc(fromNode.status || '\u2014') + '</td><td>' + esc(toNode.status || '\u2014') + '</td></tr>' +
                        '</tbody></table></div>';
                    detailEl.style.display = '';
                }
            }
            return;
        }
        const nodeIds = params.nodes;
        if (nodeIds.length > 0) {
            const nodeId = nodeIds[0];
            const visNode = nodes.get(nodeId);
            if (visNode && visNode.ip) {
                if (_topoPathMode) {
                    if (!_topoPathFirst) {
                        _topoPathFirst = nodeId;
                        const tooltip = document.getElementById('topology-tooltip');
                        tooltip.innerHTML = '<div style="color:var(--accent);font-size:0.75rem;">' + t('topology.path_click_second') + '</div>';
                        if (visNode.color) {
                            nodes.update({ id: nodeId, color: { background: '#e6952e44', border: '#e6952e', highlight: { background: '#e6952e66', border: '#e6952e' } }, borderWidth: 3 });
                        }
                    } else if (_topoPathFirst !== nodeId) {
                        highlightTopoPath(_topoPathFirst, nodeId);
                        _topoPathFirst = null;
                    }
                } else {
                    const hostData = _topoHostsByIP[visNode.ip];
                    if (hostData) showHostDetail(hostData, detailEl);
                }
                return;
            }
            if (nodeId && nodeId.startsWith('cluster:')) {
                for (const cluster of clusters) {
                    const expectedId = 'cluster:' + cluster.subnet.replace(/[^a-zA-Z0-9.]/g, '_');
                    if (expectedId === nodeId || nodeId.indexOf(cluster.subnet) >= 0) {
                        const isExpanded = _topoOpenClusters.has(cluster.subnet);
                        if (isExpanded) {
                            const hideUpdates = cluster.hosts.map(function(h) { return { id: h.ip, hidden: true }; });
                            _topoPausePhysics();
                            nodes.update(hideUpdates);
                            _topoOpenClusters.delete(cluster.subnet);
                            detailEl.style.display = 'none';
                            _topoResumePhysics();
                        } else {
                            const showUpdates = cluster.hosts.map(function(h) { return { id: h.ip, hidden: false }; });
                            _topoPausePhysics();
                            nodes.update(showUpdates);
                            _topoOpenClusters.add(cluster.subnet);
                            showClusterDetail(cluster, detailEl);
                            _topoResumePhysics();
                        }
                        updateTopoStats();
                        break;
                    }
                }
                return;
            }
        } else {
            var pins = getTopoPins();
            if (pins.length > 0) {
                var pUpdates = [];
                var pAll = nodes.get();
                var pMatched = 0;
                if (_topoShowPinnedOnly) {
                    for (var pi = 0; pi < pAll.length; pi++) {
                        var pn = pAll[pi];
                        if (pn.hidden) pUpdates.push({ id: pn.id, hidden: false });
                    }
                    _topoShowPinnedOnly = false;
                    var fc = document.getElementById('topology-filter-count');
                    if (fc) { fc.textContent = ''; fc.style.display = 'none'; }
                } else {
                    for (var pi = 0; pi < pAll.length; pi++) {
                        var pn = pAll[pi];
                        if (typeof pn.id === 'string' && pn.id.indexOf('cluster:') >= 0) continue;
                        var isP = pins.indexOf(pn.id) >= 0;
                        if (pn.hidden !== !isP) pUpdates.push({ id: pn.id, hidden: !isP });
                        if (isP) pMatched++;
                    }
                    _topoShowPinnedOnly = true;
                    var fc = document.getElementById('topology-filter-count');
                    if (fc) { fc.textContent = pMatched + '/' + pAll.length; fc.style.display = ''; }
                }
                if (pUpdates.length > 0) { _topoPausePhysics(); nodes.update(pUpdates); _topoResumePhysics(); }
            } else if (_topoOpenClusters.size > 0) {
                collapseAllClusters();
                detailEl.style.display = 'none';
                updateTopoStats();
            }
        }
    });

    network.on('hoverNode', function(params) {
        const node = nodes.get(params.node);
        if (node && node.ip) {
            if (!_topoPathMode) highlightTopoNeighbors(node.ip);
            const d = _topoHostsByIP[node.ip] || node;
            const osStr = osLabel(d.os);
            const svcs = d.services && d.services.length > 0 ? (Array.isArray(d.services) ? d.services : d.services.split(',')).slice(0, 8).join(', ') : t('topology.none');
            const ports = d.port_detail || [];
            const riskCount = ports.filter(p => _topoHighRiskPorts.includes(p.port)).length;
            tooltipEl.innerHTML = '<div style="font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px;">' + esc(d.ip) + (d.hostname ? ' (' + esc(d.hostname) + ')' : '') +
                (d.status ? '<span class="badge badge-' + d.status + '">' + d.status + '</span>' : '') + '</div>' +
                (d.mac ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">' + esc(d.mac) + '</div>' : '') +
                '<div style="display:flex;gap:8px;margin-top:2px;flex-wrap:wrap;">' +
                '<span style="color:' + osColor(d.os) + ';">\u25cf</span> ' + esc(osStr)                 + (d.os_inferred ? ' <span style="font-size:0.65rem;color:var(--text-muted);font-style:italic;">' + t('topology.inferred') + '</span>' : '') +
                ' <span>|</span> <span>' + d.ports + ' ' + t('topology.open_ports') + '</span>' +
                (riskCount > 0 ? ' <span style="color:#f06262;">\u26a0 ' + riskCount + ' ' + t('topology.risk') + '</span>' : '') +
                '</div>' +
                (svcs !== 'none' ? '<div style="margin-top:4px;font-size:0.75rem;color:var(--text-muted);">' + esc(svcs) + '</div>' : '');
            tooltipEl.style.display = '';
            const canvasPos = network.canvasToDOM({ x: params.pointer.canvas.x, y: params.pointer.canvas.y });
            const rect = container.getBoundingClientRect();
            var tLeft = canvasPos.x - rect.left + 14, tTop = canvasPos.y - rect.top - 10;
            var tw = tooltipEl.offsetWidth || 280, th = tooltipEl.offsetHeight || 80;
            if (tLeft + tw > rect.width - 10) tLeft = rect.width - tw - 10;
            if (tLeft < 10) tLeft = 10;
            if (tTop + th > rect.height - 10) tTop = rect.height - th - 10;
            if (tTop < 10) tTop = 10;
            tooltipEl.style.left = tLeft + 'px';
            tooltipEl.style.top = tTop + 'px';
        } else if (!_topoPathMode) {
            highlightTopoNeighbors(params.node);
        }
    });

    network.on('blurNode', function() {
        if (!_topoPathMode) {
            clearTopoHighlight();
            tooltipEl.style.display = 'none';
        } else {
            if (_topoPathFirst) {
                tooltipEl.innerHTML = '<div style="color:var(--accent);font-size:0.75rem;">' + t('topology.path_click_second') + '</div>';
            } else {
                tooltipEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;">' + t('topology.path_click_first') + '</div>';
            }
            tooltipEl.style.display = '';
        }
    });

    network.on('oncontext', function(params) {
        const nodeIds = params.nodes;
        if (nodeIds.length > 0) {
            showTopoContextMenu(params.event, nodeIds[0]);
        }
    });

    network.on('stabilizationProgress', function(params) {
        if (params.iterations % 50 === 0) {
            const pct = Math.round(params.iterations / params.total * 100);
            if (pct < 100) {
                const empty = document.getElementById('topology-empty');
                if (empty && empty.style.display !== 'none') {
                    empty.innerHTML = '<div class="spinner"></div><p>' + t('topology.laying_out_graph') + ' ' + pct + '%</p>';
                }
            }
        }
    });

    network.on('stabilizationIterationsDone', function() {
        loadTopoLayout();
        applyTopoPinStyles();
        network.setOptions({ physics: false });
        _topoPhysicsStable = true;
    });

    // Keyboard shortcuts
    var topoContainer = document.getElementById('tab-topology');
    if (topoContainer) {
        topoContainer.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                var fl = document.getElementById('topology-filter');
                if (fl) { fl.focus(); fl.select(); }
                return;
            }
            if (e.key === '+' || e.key === '=') { e.preventDefault(); topoZoomIn(); return; }
            if (e.key === '-') { e.preventDefault(); topoZoomOut(); return; }
            if (e.key === '0') { e.preventDefault(); topoFitView(); return; }
        });
    }
}

function buildLegend(data, legendEl) {
    const individualNodes = data.nodes || [];
    const clusters = data.clusters || [];
    const legendColors = {};
    for (const n of individualNodes) { legendColors[osLabel(n.os)] = osColor(n.os); }
    for (const c of clusters) { for (const h of (c.hosts || [])) { legendColors[osLabel(h.os)] = osColor(h.os); } }
    let hasInferred = false;
    for (const n of individualNodes) { if (n.os_inferred) hasInferred = true; }
    if (!hasInferred) { for (const c of clusters) { for (const h of (c.hosts || [])) { if (h.os_inferred) hasInferred = true; } } }
    let html = Object.entries(legendColors).map(([label, color]) =>
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">' +
        '<span style="width:12px;height:12px;border-radius:3px;background:' + hexToRgba(color, 0.15) + ';border:1.5px solid ' + hexToRgba(color, 0.7) + ';display:inline-block;"></span>' +
        '<span style="font-size:0.75rem;">' + esc(label) + '</span></div>'
    ).join('');
    if (hasInferred) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;padding-top:4px;border-top:1px solid var(--border);">' +
            '<span style="width:12px;height:12px;border-radius:3px;background:rgba(230,149,46,0.08);border:1.5px dashed rgba(230,149,46,0.4);display:inline-block;"></span>' +
            '<span style="font-size:0.75rem;">' + t('topology.inferred') + '</span></div>';
    }
    legendEl.innerHTML = html;
    legendEl.style.display = '';
}
