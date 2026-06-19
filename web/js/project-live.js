        let liveHostsData = [];
        let liveFiltered = [];
        let liveCurrentPage = 1;
        let livePerPage = 50;
        let liveSortField = 'ip';
        let liveSortDir = 'asc';
        let liveSubnetGrouped = false;
        let liveFilterStatus = '';
        let liveFilterOS = '';
        let liveFilterMethod = '';
        let liveCompareMode = false;
        let liveSelectedHosts = new Set();

        async function loadLiveHosts() {
            try {
                const res = await fetch(`/api/projects/${projectId}/live`);
                liveHostsData = await res.json();
                applyLiveFiltersAndSort();
                renderLivePagination();
                populateLiveFilters();
            } catch (e) {
                document.getElementById('live-table').innerHTML = '<div class="empty-state"><p>Error loading</p></div>';
            }
        }

        function applyLiveFiltersAndSort() {
            const q = document.getElementById('live-search')?.value.toLowerCase() || '';
            liveFiltered = liveHostsData.filter(h => {
                if (q && !(safeLower(h.ip).includes(q) || safeLower(h.hostname).includes(q) || safeLower(h.mac).includes(q) || safeLower(h.os).includes(q))) return false;
                if (liveFilterStatus && h.status !== liveFilterStatus) return false;
                if (liveFilterOS && h.os !== liveFilterOS) return false;
                if (liveFilterMethod) {
                    const methods = h.discovery_methods ? h.discovery_methods.split(',') : [];
                    if (!methods.includes(liveFilterMethod)) return false;
                }
                return true;
            });
            const dir = liveSortDir === 'asc' ? 1 : -1;
            liveFiltered.sort((a, b) => {
                let va, vb;
                if (liveSortField === 'ip') { va = ipToNum(a.ip); vb = ipToNum(b.ip); }
                else if (liveSortField === 'mac') { va = a.mac.toLowerCase(); vb = b.mac.toLowerCase(); }
                else if (liveSortField === 'hostname') { va = a.hostname.toLowerCase(); vb = b.hostname.toLowerCase(); }
                else if (liveSortField === 'os') { va = a.os.toLowerCase(); vb = b.os.toLowerCase(); }
                else if (liveSortField === 'last_seen') { va = a.last_seen; vb = b.last_seen; }
                else if (liveSortField === 'status') { va = a.status; vb = b.status; }
                else { return 0; }
                if (va < vb) return -1 * dir;
                if (va > vb) return 1 * dir;
                return 0;
            });
            liveCurrentPage = 1;
            renderLiveHosts();
        }

        function ipToNum(ip) {
            return (ip.split('.').map(Number).reduce((acc, oct) => (acc << 8) + oct, 0)) >>> 0;
        }

        function sortLiveHosts(field) {
            if (liveSortField === field) {
                liveSortDir = liveSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                liveSortField = field;
                liveSortDir = 'asc';
            }
            applyLiveFiltersAndSort();
        }

        function sortArrow(field) {
            if (liveSortField !== field) return '<span class="sort-arrow-muted">\u2195</span>';
            return liveSortDir === 'asc' ? '<span class="sort-arrow">\u25B2</span>' : '<span class="sort-arrow">\u25BC</span>';
        }

        function populateLiveFilters() {
            const statuses = [...new Set(liveHostsData.map(h => h.status))].filter(Boolean).sort();
            const oses = [...new Set(liveHostsData.map(h => h.os))].filter(Boolean).sort();
            const methods = new Set();
            liveHostsData.forEach(h => {
                if (h.discovery_methods) h.discovery_methods.split(',').forEach(m => { if (m) methods.add(m); });
            });
            const methodList = [...methods].sort();

            const selStatus = document.getElementById('live-filter-status');
            const selOS = document.getElementById('live-filter-os');
            const selMethod = document.getElementById('live-filter-method');
            if (selStatus) {
                selStatus.innerHTML = '<option value="">All Status</option>' + statuses.map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
                selStatus.value = liveFilterStatus;
            }
            if (selOS) {
                selOS.innerHTML = '<option value="">All OS</option>' + oses.map(o => '<option value="' + esc(o) + '">' + esc(o) + '</option>').join('');
                selOS.value = liveFilterOS;
            }
            if (selMethod) {
                selMethod.innerHTML = '<option value="">All Methods</option>' + methodList.map(m => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('');
                selMethod.value = liveFilterMethod;
            }
        }

        function clearLiveFilters() {
            liveFilterStatus = '';
            liveFilterOS = '';
            liveFilterMethod = '';
            document.getElementById('live-search').value = '';
            var selStatus = document.getElementById('live-filter-status');
            if (selStatus) { selStatus.value = ''; }
            var selOS = document.getElementById('live-filter-os');
            if (selOS) { selOS.value = ''; }
            var selMethod = document.getElementById('live-filter-method');
            if (selMethod) { selMethod.value = ''; }
            applyLiveFiltersAndSort();
        }

        function getSubnet(ip) {
            const parts = ip.split('.');
            if (parts.length === 4) return parts.slice(0, 3).join('.') + '.0/24';
            return ip;
        }

        function renderLiveHosts() {
            const container = document.getElementById('live-table');
            if (liveFiltered.length === 0) {
                container.innerHTML = '<div class="empty-state"><h3>No live hosts</h3><p>Confirm scans to populate live hosts</p></div>';
                return;
            }

            if (liveSubnetGrouped) {
                renderLiveHostsGrouped(container);
                return;
            }

            const start = (liveCurrentPage - 1) * livePerPage;
            const end = Math.min(start + livePerPage, liveFiltered.length);
            const pageData = liveFiltered.slice(start, end);

            let html = '<table><thead><tr>';
            if (liveCompareMode) html += '<th style="width:40px"><input type="checkbox" onchange="toggleLiveSelectAll(this.checked)" title="Select all"></th>';
            html += '<th class="sortable" onclick="sortLiveHosts(\'ip\')">IP ' + sortArrow('ip') + '</th>';
            html += '<th class="sortable" onclick="sortLiveHosts(\'mac\')">MAC ' + sortArrow('mac') + '</th>';
            html += '<th class="sortable" onclick="sortLiveHosts(\'hostname\')">Hostname ' + sortArrow('hostname') + '</th>';
            html += '<th class="sortable" onclick="sortLiveHosts(\'os\')">OS ' + sortArrow('os') + '</th>';
            html += '<th class="sortable" onclick="sortLiveHosts(\'status\')">Status ' + sortArrow('status') + '</th>';
            html += '<th>Discovery Methods</th>';
            html += '<th class="sortable" onclick="sortLiveHosts(\'last_seen\')">Last Seen ' + sortArrow('last_seen') + '</th>';
            html += '<th class="sticky-right">Actions</th>';
            html += '</tr></thead><tbody>';
            for (const h of pageData) {
                const sel = liveCompareMode ? '<td><input type="checkbox" class="live-cb" data-ip="' + esc(h.ip) + '" ' + (liveSelectedHosts.has(h.ip) ? 'checked' : '') + ' onchange="toggleLiveSelect(\'' + esc(h.ip) + '\', this.checked)"></td>' : '';
                html += '<tr>' + sel;
                html += '<td class="mono live-ip-cell" onclick="openHostDetail(\'' + esc(h.ip) + '\')" style="cursor:pointer;color:var(--cyan);">' + esc(h.ip) + '</td>';
                html += '<td class="mono live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'mac\',\'' + esc(h.mac) + '\')">' + esc(h.mac) + '</td>';
                html += '<td class="live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'hostname\',\'' + esc(h.hostname) + '\')">' + (esc(h.hostname) || '-') + '</td>';
                html += '<td class="live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'os\',\'' + esc(h.os) + '\')">' + (esc(h.os) || '-') + '</td>';
                html += '<td class="live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'status\',\'' + esc(h.status) + '\')">' + stateBadge(h.status) + '</td>';
                const methods = h.discovery_methods ? h.discovery_methods.split(',').filter(m => m) : [];
                html += '<td><div style="display:flex;gap:3px;flex-wrap:wrap;">';
                const maxBadges = 2;
                for (let i = 0; i < Math.min(methods.length, maxBadges); i++) {
                    html += '<span class="badge badge-method">' + esc(methods[i]) + '</span>';
                }
                if (methods.length > maxBadges) {
                    html += '<span class="badge badge-method-overflow" title="' + esc(methods.slice(maxBadges).join(', ')) + '">+' + (methods.length - maxBadges) + '</span>';
                }
                if (methods.length === 0) html += '-';
                html += '</div></td>';
                html += '<td>' + formatDate(h.last_seen) + '</td>';
                html += '<td class="sticky-right" style="white-space:nowrap;">';
                html += '<button class="btn btn-secondary btn-sm" onclick="copyToClipboard(\'' + esc(h.ip) + '\', \'IP copied\')" title="Copy IP"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button> ';
                html += '<button class="btn btn-secondary btn-sm" onclick="pingLiveHost(\'' + esc(h.ip) + '\')" title="Ping check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></button> ';
                html += '<button class="btn btn-danger btn-sm" onclick="removeLiveHost(\'' + esc(h.ip) + '\')" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
                html += '</td></tr>';
            }
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        function renderLiveHostsGrouped(container) {
            const groups = {};
            liveFiltered.forEach(h => {
                const sub = getSubnet(h.ip);
                if (!groups[sub]) groups[sub] = [];
                groups[sub].push(h);
            });
            const sortedSubnets = Object.keys(groups).sort((a, b) => ipToNum(a) - ipToNum(b));

            let html = '';
            for (const subnet of sortedSubnets) {
                const hosts = groups[subnet];
                html += '<div class="live-subnet-group"><div class="live-subnet-header" onclick="toggleSubnetGroup(this)">';
                html += '<span class="live-subnet-arrow">\u25B6</span>';
                html += '<span class="live-subnet-name">' + esc(subnet) + '</span>';
                html += '<span class="live-subnet-count">' + hosts.length + ' host' + (hosts.length > 1 ? 's' : '') + '</span>';
                html += '</div>';
                html += '<div class="live-subnet-body" style="display:none;">';
                html += '<table><thead><tr>';
                if (liveCompareMode) html += '<th style="width:40px"><input type="checkbox" onchange="toggleLiveSelectAll(this.checked)" title="Select all"></th>';
                html += '<th class="sortable" onclick="sortLiveHosts(\'ip\')">IP ' + sortArrow('ip') + '</th>';
                html += '<th class="sortable" onclick="sortLiveHosts(\'mac\')">MAC ' + sortArrow('mac') + '</th>';
                html += '<th>Hostname</th><th>OS</th>';
                html += '<th class="sortable" onclick="sortLiveHosts(\'status\')">Status ' + sortArrow('status') + '</th>';
                html += '<th>Discovery Methods</th>';
                html += '<th class="sortable" onclick="sortLiveHosts(\'last_seen\')">Last Seen ' + sortArrow('last_seen') + '</th>';
                html += '<th class="sticky-right">Actions</th>';
                html += '</tr></thead><tbody>';
                for (const h of hosts) {
                    const sel = liveCompareMode ? '<td><input type="checkbox" class="live-cb" data-ip="' + esc(h.ip) + '" ' + (liveSelectedHosts.has(h.ip) ? 'checked' : '') + ' onchange="toggleLiveSelect(\'' + esc(h.ip) + '\', this.checked)"></td>' : '';
                    html += '<tr>' + sel;
                    html += '<td class="mono live-ip-cell" onclick="openHostDetail(\'' + esc(h.ip) + '\')" style="cursor:pointer;color:var(--cyan);">' + esc(h.ip) + '</td>';
                    html += '<td class="mono live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'mac\',\'' + esc(h.mac) + '\')">' + esc(h.mac) + '</td>';
                    html += '<td class="live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'hostname\',\'' + esc(h.hostname) + '\')">' + (esc(h.hostname) || '-') + '</td>';
                    html += '<td class="live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'os\',\'' + esc(h.os) + '\')">' + (esc(h.os) || '-') + '</td>';
                    html += '<td class="live-edit-cell" ondblclick="inlineEditLiveField(this,\'' + esc(h.ip) + '\',\'status\',\'' + esc(h.status) + '\')">' + stateBadge(h.status) + '</td>';
                    const methods = h.discovery_methods ? h.discovery_methods.split(',').filter(m => m) : [];
                    html += '<td><div style="display:flex;gap:3px;flex-wrap:wrap;">';
                    const maxBadges = 2;
                    for (let i = 0; i < Math.min(methods.length, maxBadges); i++) {
                        html += '<span class="badge badge-method">' + esc(methods[i]) + '</span>';
                    }
                    if (methods.length > maxBadges) {
                        html += '<span class="badge badge-method-overflow" title="' + esc(methods.slice(maxBadges).join(', ')) + '">+' + (methods.length - maxBadges) + '</span>';
                    }
                    if (methods.length === 0) html += '-';
                    html += '</div></td>';
                    html += '<td>' + formatDate(h.last_seen) + '</td>';
                    html += '<td class="sticky-right" style="white-space:nowrap;">';
                    html += '<button class="btn btn-secondary btn-sm" onclick="copyToClipboard(\'' + esc(h.ip) + '\', \'IP copied\')" title="Copy IP"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button> ';
                    html += '<button class="btn btn-secondary btn-sm" onclick="pingLiveHost(\'' + esc(h.ip) + '\')" title="Ping check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></button> ';
                    html += '<button class="btn btn-danger btn-sm" onclick="removeLiveHost(\'' + esc(h.ip) + '\')" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
                    html += '</td></tr>';
                }
                html += '</tbody></table></div></div>';
            }
            container.innerHTML = html;
        }

        function toggleSubnetGroup(header) {
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.live-subnet-arrow');
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : '';
            arrow.textContent = isOpen ? '\u25B6' : '\u25BC';
        }

        function toggleLiveSelect(ip, checked) {
            if (checked) liveSelectedHosts.add(ip); else liveSelectedHosts.delete(ip);
            updateLiveBulkBar();
        }

        function toggleLiveSelectAll(checked) {
            if (checked) liveFiltered.forEach(h => liveSelectedHosts.add(h.ip));
            else liveSelectedHosts.clear();
            document.querySelectorAll('.live-cb').forEach(cb => cb.checked = checked);
            updateLiveBulkBar();
        }

        function updateLiveBulkBar() {
            const bar = document.getElementById('live-bulk-bar');
            if (!bar) return;
            if (liveSelectedHosts.size > 0) {
                bar.style.display = 'flex';
                bar.querySelector('.bulk-count').textContent = liveSelectedHosts.size + ' selected';
                const cmpBtn = document.getElementById('live-compare-action-btn');
                if (cmpBtn) cmpBtn.style.display = liveSelectedHosts.size >= 2 ? '' : 'none';
            } else {
                bar.style.display = 'none';
            }
        }

        function renderLivePagination() {
            const container = document.getElementById('live-pagination');
            if (!container) return;
            if (liveFiltered.length === 0) {
                container.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(liveFiltered.length / livePerPage);
            const currentPage = liveCurrentPage;
            let html = '<div class="pagination">';
            html += '<span class="pagination-info">Showing ' + ((currentPage - 1) * livePerPage + 1) + '-' + Math.min(currentPage * livePerPage, liveFiltered.length) + ' of ' + liveFiltered.length + '</span>';
            if (currentPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="liveGoTo(' + (currentPage - 1) + ')">&laquo; Prev</button>';
            }
            const maxButtons = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);
            if (startPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="liveGoTo(1)">1</button>';
                if (startPage > 2) html += '<span class="pagination-dots">...</span>';
            }
            for (let i = startPage; i <= endPage; i++) {
                html += '<button class="btn btn-sm ' + (i === currentPage ? 'btn-primary' : 'btn-secondary') + '" onclick="liveGoTo(' + i + ')">' + i + '</button>';
            }
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += '<span class="pagination-dots">...</span>';
                html += '<button class="btn btn-secondary btn-sm" onclick="liveGoTo(' + totalPages + ')">' + totalPages + '</button>';
            }
            if (currentPage < totalPages) {
                html += '<button class="btn btn-secondary btn-sm" onclick="liveGoTo(' + (currentPage + 1) + ')">Next &raquo;</button>';
            }
            html += '</div>';
            container.innerHTML = html;
        }

        function liveGoTo(page) {
            liveCurrentPage = page;
            renderLiveHosts();
            renderLivePagination();
        }

        function changeLiveLimit() {
            const sel = document.getElementById('live-limit');
            livePerPage = parseInt(sel?.value || '50');
            liveCurrentPage = 1;
            renderLiveHosts();
            renderLivePagination();
        }

        function filterLiveHosts() {
            applyLiveFiltersAndSort();
            renderLivePagination();
        }

        function applyLiveFilterStatus() {
            liveFilterStatus = document.getElementById('live-filter-status')?.value || '';
            applyLiveFiltersAndSort();
            renderLivePagination();
        }

        function applyLiveFilterOS() {
            liveFilterOS = document.getElementById('live-filter-os')?.value || '';
            applyLiveFiltersAndSort();
            renderLivePagination();
        }

        function applyLiveFilterMethod() {
            liveFilterMethod = document.getElementById('live-filter-method')?.value || '';
            applyLiveFiltersAndSort();
            renderLivePagination();
        }

        function toggleLiveSubnetGroup() {
            liveSubnetGrouped = !liveSubnetGrouped;
            const btn = document.getElementById('live-subnet-btn');
            if (btn) { btn.classList.toggle('btn-primary', liveSubnetGrouped); btn.classList.toggle('btn-secondary', !liveSubnetGrouped); }
            renderLiveHosts();
        }

        function toggleLiveCompareMode() {
            liveCompareMode = !liveCompareMode;
            liveSelectedHosts.clear();
            const btn = document.getElementById('live-compare-btn');
            if (btn) { btn.classList.toggle('btn-primary', liveCompareMode); btn.classList.toggle('btn-secondary', !liveCompareMode); }
            const bar = document.getElementById('live-bulk-bar');
            if (bar) bar.style.display = 'none';
            renderLiveHosts();
        }

        function copyToClipboard(text, msg) {
            navigator.clipboard.writeText(text).then(() => showToast(msg || t('live.copied', 'Copied'))).catch(() => showToast(t('live.copy_failed', 'Copy failed'), 'error'));
        }

        async function pingLiveHost(ip) {
            showToast(t('live.pinging', 'Pinging ') + ip + '...', 'info');
            const ipCells = document.querySelectorAll('#live-table .live-ip-cell');
            let ipCell = null;
            for (const cell of ipCells) {
                if (cell.textContent.trim() === ip) { ipCell = cell; break; }
            }
            if (!ipCell) return;
            const row = ipCell.closest('tr');
            try {
                const res = await fetch(`/api/projects/${projectId}/live/ping?ip=${encodeURIComponent(ip)}`);
                const data = await res.json();
                const old = row.querySelector('.ping-result');
                if (old) old.remove();
                const badge = document.createElement('span');
                badge.className = 'ping-result';
                badge.style.position = 'absolute';
                badge.style.right = '2px';
                badge.style.top = '50%';
                badge.style.transform = 'translateY(-50%)';
                badge.style.zIndex = '3';
                if (data.reachable) {
                    badge.textContent = data.time_ms + 'ms';
                    badge.style.color = '#22c55e';
                    badge.style.borderColor = '#22c55e';
                    showToast(ip + ' ' + t('live.is_reachable', 'is reachable') + ' (' + data.time_ms + 'ms)', 'success');
                } else {
                    badge.textContent = '\u2717';
                    badge.style.color = '#ef4444';
                    badge.style.borderColor = '#ef4444';
                    showToast(ip + ' ' + t('live.is_unreachable', 'is unreachable'), 'error');
                }
                ipCell.style.position = 'relative';
                ipCell.appendChild(badge);
                setTimeout(() => { if (badge.parentNode) badge.remove(); }, 5000);
            } catch (e) {
                showToast(t('live.ping_failed', 'Ping failed: ') + e.message, 'error');
            }
        }

        async function removeLiveHost(ip) {
            const mid = 'confirm-delete-modal';
            const old = document.getElementById(mid);
            if (old) old.remove();
            const body = '<p style="margin-bottom:15px;color:var(--text-muted);">Remove <strong>' + esc(ip) + '</strong> from live hosts?</p>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button class="btn btn-secondary" id="del-cancel">Cancel</button> ' +
                '<button class="btn btn-danger" id="del-ok">Remove</button></div>';
            const modal = showModal(mid, 'Remove Host', body, 'modal-small');
            modal.querySelector('#del-ok').addEventListener('click', async function() {
                closeModal(mid);
                try {
                    await deleteLiveHost(projectId, ip);
                    showToast(t('live.host_removed', 'Host removed'));
                    await loadLiveHosts();
                } catch (e) {
                    showToast(t('live.error', 'Error: ') + e.message, 'error');
                }
            });
            modal.querySelector('#del-cancel').addEventListener('click', function() { closeModal(mid); });
        }

        function showLiveExportModal() {
            var body = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">Loading sizes...</p>';
            var m = showModal('live-export-modal', 'Export Live Hosts', body, 'modal-small');
            fetch('/api/live/export/' + projectId + '/sizes')
                .then(function(r) { return r.json(); })
                .then(function(sizes) {
                    var fmt = function(size) {
                        if (size < 1024) return size + ' B';
                        if (size < 1024*1024) return (size/1024).toFixed(1) + ' KB';
                        return (size/1024/1024).toFixed(1) + ' MB';
                    };
                    body = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">Select export format:</p>' +
                        '<div style="display:flex;flex-direction:column;gap:8px;">' +
                            '<button class="btn btn-success btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doLiveExport(\'xlsx\')">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>' +
                                ' Excel (.xlsx)' +
                                ' <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">' + fmt(sizes.xlsx || 0) + '</span>' +
                            '</button>' +
                            '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doLiveExport(\'json\')">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>' +
                                ' JSON' +
                                ' <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">' + fmt(sizes.json || 0) + '</span>' +
                            '</button>' +
                            '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doLiveExport(\'txt\')">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
                                ' TXT (.txt)' +
                                ' <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">' + fmt(sizes.txt || 0) + '</span>' +
                            '</button>' +
                        '</div>';
                    m.querySelector('.modal-body').innerHTML = body;
                })
                .catch(function() {
                    m.querySelector('.modal-body').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">Select export format:</p>' +
                        '<div style="display:flex;flex-direction:column;gap:8px;">' +
                            '<button class="btn btn-success btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doLiveExport(\'xlsx\')">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>' +
                                ' Excel (.xlsx)' +
                            '</button>' +
                            '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doLiveExport(\'json\')">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>' +
                                ' JSON' +
                            '</button>' +
                            '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doLiveExport(\'txt\')">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
                                ' TXT (.txt)' +
                            '</button>' +
                        '</div>';
                });
        }
        function doLiveExport(format) {
            closeModal('live-export-modal');
            window.location.href = `/api/live/export/${projectId}?format=${format}`;
        }

        async function bulkDeleteLiveHosts() {
            const ips = [...liveSelectedHosts];
            if (ips.length === 0) return;
            const mid = 'confirm-bulk-delete-modal';
            const old = document.getElementById(mid);
            if (old) old.remove();
            const label = ips.length + ' host' + (ips.length > 1 ? 's' : '');
            const body = '<p style="margin-bottom:15px;color:var(--text-muted);">Delete ' + label + ' from live hosts?</p>' +
                '<div style="max-height:200px;overflow-y:auto;margin-bottom:15px;font-size:0.8rem;color:var(--text-muted);">' +
                ips.map(ip => '<div>' + esc(ip) + '</div>').join('') + '</div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button class="btn btn-secondary" id="bulk-del-cancel">Cancel</button> ' +
                '<button class="btn btn-danger" id="bulk-del-ok">Delete ' + label + '</button></div>';
            const modal = showModal(mid, 'Bulk Delete', body, 'modal-small');
            modal.querySelector('#bulk-del-ok').addEventListener('click', async function() {
                closeModal(mid);
                try {
                    await fetch(`/api/projects/${projectId}/live/bulk-delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ips: ips })
                    });
                    showToast(label + ' ' + t('live.deleted', 'deleted'));
                    liveSelectedHosts.clear();
                    await loadLiveHosts();
                } catch (e) {
                    showToast(t('live.error', 'Error: ') + e.message, 'error');
                }
            });
            modal.querySelector('#bulk-del-cancel').addEventListener('click', function() { closeModal(mid); });
        }

        async function bulkChangeLiveStatus() {
            const ips = [...liveSelectedHosts];
            if (ips.length === 0) return;
            const status = prompt('Enter new status (up/down/unknown):');
            if (!status) return;
            try {
                await fetch(`/api/projects/${projectId}/live/bulk-status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ips: ips, status: status })
                });
                showToast(t('live.status_updated', 'Status updated for ') + ips.length + t('live.hosts', ' hosts'));
                liveSelectedHosts.clear();
                await loadLiveHosts();
            } catch (e) {
                showToast(t('live.error', 'Error: ') + e.message, 'error');
            }
        }

        function compareSelectedHosts() {
            const ips = [...liveSelectedHosts];
            if (ips.length < 2) { showToast(t('live.select_two_hosts', 'Select at least 2 hosts'), 'error'); return; }
            openHostCompare(ips);
        }

        async function openHostDetail(ip) {
            const host = liveHostsData.find(h => h.ip === ip);
            if (!host) return;

            let body = '<div style="padding:16px;">';
            body += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border);">';
            body += '<div style="font-size:1.2rem;font-weight:700;font-family:var(--font-mono);color:var(--cyan);">' + esc(ip) + '</div>';
            body += stateBadge(host.status);
            body += '<button class="btn btn-secondary btn-sm" onclick="copyToClipboard(\'' + esc(ip) + '\', \'IP copied\')" title="Copy IP"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
            body += '</div>';

            body += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:16px;">';
            body += '<div><span style="color:var(--text-muted);font-size:0.75rem;">MAC</span><div class="mono">' + esc(host.mac || '-') + '</div></div>';
            body += '<div><span style="color:var(--text-muted);font-size:0.75rem;">Hostname</span><div>' + esc(host.hostname || '-') + '</div></div>';
            body += '<div><span style="color:var(--text-muted);font-size:0.75rem;">OS</span><div>' + esc(host.os || '-') + '</div></div>';
            body += '<div><span style="color:var(--text-muted);font-size:0.75rem;">Last Seen</span><div>' + formatDate(host.last_seen) + '</div></div>';
            body += '<div><span style="color:var(--text-muted);font-size:0.75rem;">Note</span><div>' + esc(host.note || '-') + '</div></div>';
            const methods = host.discovery_methods ? host.discovery_methods.split(',').filter(m => m) : [];
            body += '<div><span style="color:var(--text-muted);font-size:0.75rem;">Discovery</span><div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;">';
            methods.forEach(m => { body += '<span class="badge badge-method">' + esc(m) + '</span>'; });
            if (methods.length === 0) body += '-';
            body += '</div></div>';
            body += '</div>';

            body += '<div id="host-detail-tabs" style="margin-bottom:12px;display:flex;gap:4px;border-bottom:1px solid var(--border);padding-bottom:8px;">';
            ['ports', 'scripts', 'scans'].forEach((tab, i) => {
                body += '<button class="btn btn-sm ' + (i === 0 ? 'btn-primary' : 'btn-secondary') + '" id="hdt-btn-' + tab + '" onclick="switchHostDetailTab(\'' + esc(ip) + '\',\'' + tab + '\')">' + tab.charAt(0).toUpperCase() + tab.slice(1) + '</button>';
            });
            body += '</div>';
            body += '<div id="host-detail-content" class="table-container"><div class="empty-state"><div class="spinner"></div><p>Loading...</p></div></div>';
            body += '</div>';

            showModal('host-detail-modal', 'Host Details: ' + ip, body, 'modal-large');
            switchHostDetailTab(ip, 'ports');
        }

        async function switchHostDetailTab(ip, tab) {
            ['ports', 'scripts', 'scans'].forEach(t => {
                const btn = document.getElementById('hdt-btn-' + t);
                if (btn) { btn.className = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-secondary'); }
            });
            const content = document.getElementById('host-detail-content');
            if (!content) return;
            content.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>Loading...</p></div>';

            try {
                const res = await fetch(`/api/projects/${projectId}/live/detail?ip=${encodeURIComponent(ip)}`);
                const data = await res.json();

                if (tab === 'ports') {
                    const ports = data.ports || [];
                    if (ports.length === 0) {
                        content.innerHTML = '<div class="empty-state"><h3>No open ports</h3></div>';
                        return;
                    }
                    let html = '<table><thead><tr><th>Port</th><th>Protocol</th><th>State</th><th>Service</th><th>Version</th><th>Product</th><th>Extra</th></tr></thead><tbody>';
                    ports.forEach(p => {
                        html += '<tr><td class="mono">' + p.port + '</td><td>' + esc(p.protocol) + '</td><td>' + stateBadge(p.state) + '</td>';
                        html += '<td>' + (esc(p.service) || '-') + '</td><td>' + (esc(p.version) || '-') + '</td>';
                        html += '<td>' + (esc(p.product) || '-') + '</td><td>' + (esc(p.extra_info) || '-') + '</td></tr>';
                    });
                    html += '</tbody></table>';
                    content.innerHTML = html;
                } else if (tab === 'scripts') {
                    const scripts = data.scripts || [];
                    if (scripts.length === 0) {
                        content.innerHTML = '<div class="empty-state"><h3>No scripts</h3></div>';
                        return;
                    }
                    let html = '<table><thead><tr><th>Script ID</th><th>Port</th><th>Type</th><th>Output</th></tr></thead><tbody>';
                    scripts.forEach(s => {
                        const output = s.output || '';
                        const displayOutput = esc(output).substring(0, 500) + (output.length > 500 ? '...' : '');
                        const portDisplay = s.port && s.port !== '0' ? s.port + '/' + esc(s.protocol || '') : '-';
                        html += '<tr><td class="mono" style="color:var(--cyan);">' + esc(s.script_id) + '</td>';
                        html += '<td class="mono">' + portDisplay + '</td><td>' + esc(s.type) + '</td>';
                        html += '<td style="max-width:400px;white-space:pre-wrap;font-size:0.8rem;font-family:var(--font-mono);color:var(--text-muted);">' + displayOutput + '</td></tr>';
                    });
                    html += '</tbody></table>';
                    content.innerHTML = html;
                } else if (tab === 'scans') {
                    const scans = data.scans || [];
                    if (scans.length === 0) {
                        content.innerHTML = '<div class="empty-state"><h3>No scan history</h3></div>';
                        return;
                    }
                    let html = '<table><thead><tr><th>Scan ID</th><th>Profile</th><th>Status</th><th>Started</th><th>Completed</th></tr></thead><tbody>';
                    scans.forEach(s => {
                        html += '<tr><td class="mono">#' + s.id + '</td><td>' + esc(s.profile) + '</td><td>' + statusBadge(s.status) + '</td>';
                        html += '<td>' + formatDate(s.started_at) + '</td><td>' + (s.completed_at ? formatDate(s.completed_at) : '-') + '</td></tr>';
                    });
                    html += '</tbody></table>';
                    content.innerHTML = html;
                }
            } catch (e) {
                content.innerHTML = '<div class="empty-state"><p>Error loading: ' + esc(e.message) + '</p></div>';
            }
        }

        function openHostCompare(ips) {
            const hosts = ips.map(ip => liveHostsData.find(h => h.ip === ip)).filter(Boolean);
            if (hosts.length < 2) return;

            let body = '<div style="padding:16px;">';
            body += '<div class="table-container"><table><thead><tr><th>Attribute</th>';
            hosts.forEach(h => {
                body += '<th class="mono" style="color:var(--cyan);">' + esc(h.ip) + '</th>';
            });
            body += '</tr></thead><tbody>';

            const attrs = [
                { key: 'mac', label: 'MAC' },
                { key: 'hostname', label: 'Hostname' },
                { key: 'os', label: 'OS' },
                { key: 'status', label: 'Status' },
                { key: 'discovery_methods', label: 'Discovery' },
                { key: 'last_seen', label: 'Last Seen' }
            ];
            attrs.forEach(a => {
                const vals = hosts.map(h => h[a.key] || '-');
                const allSame = vals.every(v => v === vals[0]);
                body += '<tr><td style="color:var(--text-muted);">' + a.label + '</td>';
                vals.forEach((v, i) => {
                    const style = allSame ? '' : 'color:var(--yellow);font-weight:600;';
                    const display = a.key === 'status' ? stateBadge(v) : (a.key === 'discovery_methods' ? (v ? v.split(',').map(m => '<span class="badge badge-method">' + esc(m) + '</span>').join(' ') : '-') : esc(v));
                    body += '<td style="' + style + '">' + display + '</td>';
                });
                body += '</tr>';
            });

            body += '</tbody></table></div>';

            body += '<h3 style="margin:16px 0 8px;font-size:0.95rem;">Open Ports Comparison</h3>';
            body += '<div id="compare-ports-content" class="table-container"><div class="empty-state"><div class="spinner"></div><p>Loading...</p></div></div>';
            body += '</div>';

            showModal('host-compare-modal', 'Compare ' + hosts.length + ' Hosts', body, 'modal-large');
            loadComparePorts(hosts);
        }

        function inlineEditLiveField(el, ip, field, currentValue) {
            if (el.querySelector('input, select')) return;
            const original = el.textContent.trim();
            const commit = (newValue) => saveLiveInlineEditField(ip, field, newValue, el);
            const cancel = () => { el.textContent = original; };
            if (field === 'status') {
                const sel = document.createElement('select');
                sel.className = 'inline-edit-select';
                ['up','down','unknown'].forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    if (s === currentValue) opt.selected = true;
                    sel.appendChild(opt);
                });
                sel.addEventListener('blur', () => commit(sel.value));
                sel.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { sel.blur(); }
                    if (e.key === 'Escape') { cancel(); }
                });
                el.textContent = '';
                el.appendChild(sel);
                sel.focus();
            } else {
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.className = 'inline-edit-input';
                inp.value = currentValue;
                inp.addEventListener('blur', () => commit(inp.value));
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { inp.blur(); }
                    if (e.key === 'Escape') { inp.value = currentValue; inp.blur(); }
                });
                el.textContent = '';
                el.appendChild(inp);
                inp.focus();
                inp.select();
            }
        }

        async function saveLiveInlineEditField(ip, field, newValue, td) {
            try {
                const res = await fetch(`/api/projects/${projectId}/live/update-field`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify({ ip, field, value: newValue })
                });
                if (!res.ok) throw new Error('save failed');
                const host = liveHostsData.find(h => h.ip === ip);
                if (host) {
                    if (field === 'hostname') host.hostname = newValue;
                    else if (field === 'mac') host.mac = newValue;
                    else if (field === 'os') host.os = newValue;
                    else if (field === 'note') host.note = newValue;
                    else if (field === 'status') host.status = newValue;
                }
                showToast(t('live.updated', 'Updated'));
                applyLiveFiltersAndSort();
            } catch (e) {
                td.textContent = td.getAttribute('data-original') || '-';
                showToast(t('live.error_saving', 'Error saving: ') + e.message, 'error');
            }
        }

        async function loadComparePorts(hosts) {
            const content = document.getElementById('compare-ports-content');
            if (!content) return;

            try {
                const portMap = {};
                await Promise.all(hosts.map(async h => {
                    const res = await fetch(`/api/projects/${projectId}/live/detail?ip=${encodeURIComponent(h.ip)}`);
                    const data = await res.json();
                    (data.ports || []).forEach(p => {
                        const key = p.port + '/' + p.protocol;
                        if (!portMap[key]) portMap[key] = {};
                        portMap[key][h.ip] = p;
                    });
                }));

                const allPorts = Object.keys(portMap).sort((a, b) => {
                    const pa = parseInt(a), pb = parseInt(b);
                    if (!isNaN(pa) && !isNaN(pb)) return pa - pb;
                    return a.localeCompare(b);
                });

                if (allPorts.length === 0) {
                    content.innerHTML = '<div class="empty-state"><h3>No open ports</h3></div>';
                    return;
                }

                let html = '<table><thead><tr><th>Port</th>';
                hosts.forEach(h => { html += '<th class="mono" style="color:var(--cyan);">' + esc(h.ip) + '</th>'; });
                html += '</tr></thead><tbody>';
                allPorts.forEach(port => {
                    html += '<tr><td class="mono">' + esc(port) + '</td>';
                    hosts.forEach(h => {
                        const p = portMap[port][h.ip];
                        if (p) {
                            html += '<td>' + stateBadge(p.state) + ' ' + (esc(p.service) || '-') + '</td>';
                        } else {
                            html += '<td style="color:var(--text-muted);">-</td>';
                        }
                    });
                    html += '</tr>';
                });
                html += '</tbody></table>';
                content.innerHTML = html;
            } catch (e) {
                content.innerHTML = '<div class="empty-state"><p>Error: ' + esc(e.message) + '</p></div>';
            }
        }

        function toggleLiveSearch() {
            var wrap = document.getElementById('live-search-wrap');
            var toggle = document.getElementById('live-search-toggle');
            if (!wrap || !toggle) return;
            wrap.style.display = 'flex';
            toggle.style.display = 'none';
            var input = document.getElementById('live-search');
            if (input) { input.focus(); input.select(); }
        }

        function closeLiveSearch() {
            var wrap = document.getElementById('live-search-wrap');
            var toggle = document.getElementById('live-search-toggle');
            if (!wrap || !toggle) return;
            wrap.style.display = 'none';
            toggle.style.display = '';
            var input = document.getElementById('live-search');
            if (input) input.value = '';
            filterLiveHosts();
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var wrap = document.getElementById('live-search-wrap');
                if (wrap && wrap.style.display !== 'none') closeLiveSearch();
            }
        });
