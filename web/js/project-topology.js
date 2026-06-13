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
    if (o.includes('linux')) return 'Linux';
    if (o.includes('windows')) return 'Windows';
    if (o.includes('darwin') || o.includes('mac')) return 'macOS';
    if (o.includes('freebsd') || o.includes('bsd')) return 'BSD';
    if (o.includes('cisco') || o.includes('ios')) return 'Cisco';
    if (o.includes('solaris') || o.includes('sun')) return 'Solaris';
    return os || 'Unknown';
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
        if (!res.ok) throw new Error(data.error || 'Failed');
        if ((!data.nodes || data.nodes.length === 0) && (!data.clusters || data.clusters.length === 0)) {
            empty.innerHTML = '<h3>No topology data</h3><p>Confirm scans to populate topology</p>';
            return;
        }
        empty.style.display = 'none';
        renderTopology(data, graphEl, tooltip, legend, detail);
    } catch (e) {
        empty.style.display = '';
        empty.innerHTML = '<h3>Error loading topology</h3><p>' + esc(e.message) + '</p>';
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
        '</tr>'; }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:12px;">No open ports</td></tr>';
    var arrow = function(f) { return f === _topoPortSortField ? (_topoPortSortDir === 1 ? ' \u25B2' : ' \u25BC') : ''; };
    var body = detailEl.querySelector('.detail-body');
    if (body) {
        body.innerHTML = '<div class="info-line">' +
            '<span>' + d.ports + ' open</span>' +
            '<span>' + d.subnet + '</span>' +
            (hasHighRisk ? '<span style="color:#f06262;">\u26a0 Risk</span>' : '') +
            (d.mac ? '<span>' + esc(d.mac) + '</span>' : '') +
            (d.os_inferred ? '<span style="font-style:italic;">* inferred</span>' : '') +
            '</div>' +
            '<table class="tp-table"><thead><tr>' +
            '<th style="width:48px;cursor:pointer;" data-sort="port">Port' + arrow('port') + '</th>' +
            '<th style="width:38px;cursor:pointer;" data-sort="protocol">Proto' + arrow('protocol') + '</th>' +
            '<th style="width:50px;cursor:pointer;" data-sort="state">State' + arrow('state') + '</th>' +
            '<th style="cursor:pointer;" data-sort="service">Service' + arrow('service') + '</th>' +
            '<th style="width:80px;cursor:pointer;" data-sort="version">Version' + arrow('version') + '</th>' +
            '<th style="width:80px;cursor:pointer;" data-sort="product">Product' + arrow('product') + '</th>' +
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
                <span class="badge badge-info" style="font-size:0.65rem;">${c.host_count} hosts</span>
                <span class="badge badge-open" style="font-size:0.65rem;">${c.port_count} ports</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
                <button class="detail-close" onclick="collapseTopoCluster('${esc(c.subnet)}');this.closest('#topology-detail').style.display='none'" title="Collapse & close">\u2212</button>
                <button class="detail-close" onclick="this.closest('#topology-detail').style.display='none'">\u2715</button>
            </div>
        </div>
        <div class="detail-body">
            ${svcs ? '<div style="margin-bottom:6px;font-size:0.72rem;color:var(--text-muted);">Services: ' + esc(svcs) + '</div>' : ''}
            <table class="tp-table">
                <thead><tr>
                    <th>IP</th>
                    <th>Hostname</th>
                    <th>OS</th>
                    <th style="width:40px;">Ports</th>
                    <th>Key Ports</th>
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
                    gravitationalConstant: -2000, centralGravity: 0.25,
                    springLength: 150, springConstant: 0.04, damping: 0.18
                },
                stabilization: { iterations: 80, updateInterval: 25 }
            }
        });
    }
}

function topoZoomIn() {
    if (!_topoNetwork) return;
    const scale = _topoNetwork.getScale();
    _topoNetwork.moveTo({ scale: scale * 1.4, animation: { duration: 200 } });
}
function topoZoomOut() {
    if (!_topoNetwork) return;
    const scale = _topoNetwork.getScale();
    _topoNetwork.moveTo({ scale: scale / 1.4, animation: { duration: 200 } });
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
    if (updates.length > 0) { _topoPausePhysics(); _topoNodes.update(updates); _topoResumePhysics(); }
    if (q.value.trim() && _topoPathMode) {
        clearTopoPathHighlight();
    }
    if (countEl) {
        if (val) { countEl.textContent = matched + ' / ' + total; countEl.style.display = ''; }
        else { countEl.style.display = 'none'; }
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
        tooltip.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;">Click first host node to start path</div>';
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
        tooltip.innerHTML = '<div style="color:#f06262;font-size:0.75rem;">No path found between selected hosts</div>';
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
    tooltip.innerHTML = '<div style="color:#4caf50;font-size:0.75rem;">Path found: ' + pathNodes.length + ' hops</div>';
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

function toggleTopoSvcFilter() {
    var input = document.getElementById('topology-svc-filter');
    if (!input || !_topoNodes || !_topoHostsByIP) return;
    var val = input.value.trim().toLowerCase();
    if (!val) {
        clearTopoSvcFilter();
        return;
    }
    var updates = [];
    for (var ip in _topoHostsByIP) {
        var h = _topoHostsByIP[ip];
        if (!h) continue;
        var svcs = h.services || [];
        var ports = h.port_detail || [];
        var match = false;
        for (var si = 0; si < svcs.length; si++) {
            if (svcs[si].toLowerCase().indexOf(val) >= 0) { match = true; break; }
        }
        if (!match) {
            for (var pi = 0; pi < ports.length; pi++) {
                if ((ports[pi].service || '').toLowerCase().indexOf(val) >= 0) { match = true; break; }
            }
        }
        var node = _topoNodes.get(ip);
        if (!node) continue;
        if (match) {
            updates.push({ id: ip, borderWidth: 4, color: { ...node.color, border: '#e6952e' } });
        } else {
            updates.push({ id: ip, opacity: 0.2 });
        }
    }
    if (updates.length > 0) _topoNodes.update(updates);
    _topoSvcFilterActive = val;
}
function clearTopoSvcFilter() {
    if (!_topoSvcFilterActive || !_topoNodes) return;
    var allNodes = _topoNodes.get();
    var updates = [];
    for (var ni = 0; ni < allNodes.length; ni++) {
        var n = allNodes[ni];
        var h = _topoHostsByIP[n.id];
        if (!h) continue;
        var c = osColor(h.os);
        var orig = _topoOriginalColors[n.id] || { background: hexToRgba(c, 0.15), border: hexToRgba(c, 0.8) };
        updates.push({ id: n.id, opacity: 1.0, borderWidth: 2, color: orig });
    }
    if (updates.length > 0) _topoNodes.update(updates);
    _topoSvcFilterActive = null;
    _topoHighlighted = false;
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
                _topoNetwork.setOptions({ physics: false });
                _topoNetwork.moveNode(moves);
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
    const osCounts = {};
    for (const ip in _topoHostsByIP) {
        const h = _topoHostsByIP[ip];
        if (!h) continue;
        totalHosts++;
        totalPorts += (h.ports || 0);
        const osName = osLabel(h.os);
        osCounts[osName] = (osCounts[osName] || 0) + 1;
        const ports = h.port_detail || [];
        if (ports.some(p => _topoHighRiskPorts.includes(p.port))) totalRisk++;
    }
    const clusterCount = _topoClusters.length;
    const expandedCount = _topoOpenClusters.size;
    let osHtml = '';
    let count = 0;
    for (const osName in osCounts) {
        if (count >= 4) { osHtml += '<div class="stat-row"><span class="stat-label">...</span><span class="stat-value">+' + (Object.keys(osCounts).length - 4) + ' more</span></div>'; break; }
        osHtml += '<div class="stat-row"><span class="stat-label" style="color:' + osColor(osName) + ';">\u25cf ' + esc(osName) + '</span><span class="stat-value">' + osCounts[osName] + '</span></div>';
        count++;
    }
    statsEl.innerHTML = '<div style="font-weight:600;font-size:0.78rem;margin-bottom:6px;">Statistics</div>' +
        '<div class="stat-row"><span class="stat-label">Hosts</span><span class="stat-value">' + totalHosts + '</span></div>' +
        '<div class="stat-row"><span class="stat-label">Open Ports</span><span class="stat-value">' + totalPorts + '</span></div>' +
        '<div class="stat-row"><span class="stat-label">High Risk</span><span class="stat-value" style="color:' + (totalRisk > 0 ? '#f06262' : 'inherit') + ';">' + totalRisk + '</span></div>' +
        '<div class="stat-row"><span class="stat-label">Subnets</span><span class="stat-value">' + clusterCount + '</span></div>' +
        '<div class="stat-row"><span class="stat-label">Expanded</span><span class="stat-value">' + expandedCount + '/' + clusterCount + '</span></div>' +
        (osHtml ? '<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;">' + osHtml + '</div>' : '');
    statsEl.style.display = '';
}

function promptTopoLabel(nodeId) {
    const node = _topoNodes && _topoNodes.get(nodeId);
    if (!node) return;
    const overlay = document.createElement('div');
    overlay.className = 'topo-label-prompt-overlay';
    overlay.innerHTML = '<div class="topo-label-prompt-box">' +
        '<h3>Custom Label</h3>' +
        '<p style="font-size:0.75rem;color:var(--text-muted);margin:0 0 4px 0;">For ' + esc(nodeId) + '</p>' +
        '<input type="text" id="topo-label-input" value="' + esc(node.label || '') + '" placeholder="Enter custom label\u2026" autofocus>' +
        '<div class="prompt-actions">' +
        '<button onclick="this.closest(\'.topo-label-prompt-overlay\').remove()">Cancel</button>' +
        '<button class="btn-primary" id="topo-label-save">Save</button>' +
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
        menu.innerHTML = '<div class="ctx-item" data-action="copy" data-value="' + esc(subnet) + '">\u{1F4CB} Copy Subnet</div>' +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item close-menu">\u2715 Close</div>';
    } else if (node && node.ip) {
        menu.innerHTML = '<div class="ctx-item" data-action="copy" data-value="' + esc(node.ip) + '">\u{1F4CB} Copy IP</div>' +
            (node.hostname ? '<div class="ctx-item" data-action="copy" data-value="' + esc(node.hostname) + '">\u{1F4CB} Copy Hostname</div>' : '') +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item" data-action="label" data-node="' + esc(node.ip) + '">\u270F\u200B Set Label</div>' +
            '<div class="ctx-item" data-action="detail" data-node="' + esc(node.ip) + '">\u{1F50D} Show Details</div>' +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item close-menu">\u2715 Close</div>';
    } else {
        menu.innerHTML = '<div class="ctx-item close-menu">\u2715 Close</div>';
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
            title: h.ip + (h.hostname ? '\n' + h.hostname : '') + (h.os_inferred ? '\n(inferred OS)' : '')
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
                title: h.ip + (h.hostname ? '\n' + h.hostname : '') + (h.os_inferred ? '\n(inferred OS)' : ''),
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
            label: cluster.subnet + '\n' + cluster.host_count + ' hosts \u00B7 ' + cluster.port_count + ' ports',
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
            hover: true, tooltipDelay: 200,
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
    if (exportBtn) exportBtn.onclick = exportTopoPNG;
    var exportSvgBtn = document.getElementById('topo-btn-export-svg');
    if (exportSvgBtn) exportSvgBtn.onclick = exportTopoSVG;

    var svcFilterInput = document.getElementById('topology-svc-filter');
    var svcFilterBtn = document.getElementById('topo-btn-svc-filter');
    function doSvcFilter() {
        if (_topoPathMode) { clearTopoPathHighlight(); _topoPathFirst = null; }
        if (_topoRiskActive) { toggleTopoRiskFilter(); }
        clearTopoHighlight();
        toggleTopoSvcFilter();
    }
    if (svcFilterInput) svcFilterInput.onkeydown = function(e) { if (e.key === 'Enter') doSvcFilter(); };
    if (svcFilterBtn) svcFilterBtn.onclick = doSvcFilter;
    if (svcFilterInput) svcFilterInput.oninput = function() { if (!this.value.trim()) clearTopoSvcFilter(); };

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
                        '<strong style="font-size:0.88rem;color:var(--accent);">Connection</strong>' +
                        '<span class="badge badge-info" style="font-size:0.65rem;">' + esc(subnet) + '</span>' +
                        '</div>' +
                        '<button class="detail-close" onclick="this.closest(\'#topology-detail\').style.display=\'none\'">\u2715</button>' +
                        '</div><div class="detail-body">' +
                        '<div class="info-line"><span>' + esc(edge.from) + '</span> <span style="color:var(--text-muted);">\u2194</span> <span>' + esc(edge.to) + '</span></div>' +
                        '<table class="tp-table"><thead><tr><th>Property</th><th>' + esc(edge.from) + '</th><th>' + esc(edge.to) + '</th></tr></thead><tbody>' +
                        '<tr><td>OS</td><td>' + osLabel(fromNode.os) + '</td><td>' + osLabel(toNode.os) + '</td></tr>' +
                        '<tr><td>Hostname</td><td>' + esc(fromNode.hostname || '\u2014') + '</td><td>' + esc(toNode.hostname || '\u2014') + '</td></tr>' +
                        '<tr><td>Ports</td><td>' + fromNode.ports + '</td><td>' + toNode.ports + '</td></tr>' +
                        '<tr><td>Status</td><td>' + esc(fromNode.status || '\u2014') + '</td><td>' + esc(toNode.status || '\u2014') + '</td></tr>' +
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
                        tooltip.innerHTML = '<div style="color:var(--accent);font-size:0.75rem;">First host selected. Click a second host.</div>';
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
            if (_topoOpenClusters.size > 0) {
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
            const svcs = d.services && d.services.length > 0 ? (Array.isArray(d.services) ? d.services : d.services.split(',')).slice(0, 8).join(', ') : 'none';
            const ports = d.port_detail || [];
            const riskCount = ports.filter(p => _topoHighRiskPorts.includes(p.port)).length;
            tooltipEl.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">' + esc(d.ip) + (d.hostname ? ' (' + esc(d.hostname) + ')' : '') + '</div>' +
                '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">' +
                '<span style="color:' + osColor(d.os) + ';">\u25cf</span> ' + esc(osStr) + (d.os_inferred ? ' <span style="font-size:0.65rem;color:var(--text-muted);font-style:italic;">(inferred)</span>' : '') +
                ' <span>|</span> <span>' + d.ports + ' open ports</span>' +
                (riskCount > 0 ? ' <span style="color:#f06262;">\u26a0 ' + riskCount + ' risk</span>' : '') +
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
                tooltipEl.innerHTML = '<div style="color:var(--accent);font-size:0.75rem;">First host selected. Click a second host.</div>';
            } else {
                tooltipEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;">Click first host node to start path</div>';
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
                    empty.innerHTML = '<div class="spinner"></div><p>Laying out graph... ' + pct + '%</p>';
                }
            }
        }
    });

    network.on('stabilizationIterationsDone', function() {
        loadTopoLayout();
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
            '<span style="font-size:0.75rem;">Inferred</span></div>';
    }
    legendEl.innerHTML = html;
    legendEl.style.display = '';
}
