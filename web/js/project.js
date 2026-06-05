        const projectId = window.location.pathname.split('/').pop();
        let selectedProfile = 'default';
        let selectedProfileId = null;
        let refreshInterval = null;
        let currentProject = null;
        let allScans = [];

        async function init() {
            currentUser = await me();
            if (!currentUser) { window.location.href = '/login'; return; }
            document.getElementById('user-info').textContent = currentUser.username;

            if (currentUser.role === 'admin') {
                const al = document.getElementById('admin-link');
                if (al) al.style.display = '';
                const ui = document.getElementById('user-info');
                if (ui) ui.classList.add('user-admin');
            }

            try {
                const projects = await getProjects();
                currentProject = projects.find(p => p.id == projectId);
                if (!currentProject) { alert('Project not found'); window.location.href = '/'; return; }
            } catch (e) {
                console.error(e);
            }

            loadImportProfiles();

            const defaultCard = document.querySelector('.profile-card.selected');
            if (defaultCard) {
                document.getElementById('cmd-text').textContent = defaultCard.dataset.cmd || '';
            }

            document.querySelectorAll('#profile-form-panel input.pf-input, #profile-form-panel textarea.pf-input').forEach(el => {
                el.addEventListener('input', onPfChange);
            });

            await loadScans();
            loadConsolidatedScripts();
            setupAutoConfirmToggle();
        }

        function setupAutoConfirmToggle() {
            const label = document.getElementById('import-auto-confirm-label');
            const hidden = document.getElementById('import-auto-confirm');
            const text = document.getElementById('import-auto-confirm-text');
            if (!label || !hidden || !text) return;
            let on = false;
            function update() {
                on = !on;
                hidden.value = on ? 'true' : 'false';
                if (on) {
                    label.style.background = 'rgba(34,197,94,0.12)';
                    label.style.borderColor = '#22c55e';
                    label.style.color = '#22c55e';
                    text.textContent = 'Auto-confirm';
                } else {
                    label.style.background = 'rgba(100,100,100,0.08)';
                    label.style.borderColor = 'var(--border)';
                    label.style.color = 'var(--text-muted)';
                    text.textContent = 'Manual';
                }
            }
            label.addEventListener('click', update);
        }

        function selectProfile(el) {
            document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            selectedProfile = el.dataset.profile;
            selectedProfileId = parseInt(el.dataset.id);
            updateCmdPreview(el.dataset.cmd || '');
            document.getElementById('cmd-source').textContent = 'profile';
            showProfileInfo(el.dataset.profile, el.dataset.desc, parseInt(el.dataset.id));
        }

        function showProfileInfo(name, desc, id) {
            const info = document.getElementById('profile-info');
            if (!name) { info.style.display = 'none'; return; }
            document.getElementById('profile-info-name').textContent = name;
            document.getElementById('profile-info-desc').textContent = desc || 'nmap command profile';
            document.getElementById('profile-info-edit-btn').onclick = function() {
                showProfileManager(id);
            };
            info.style.display = '';
        }

        function getQuickFlags() {
            const flags = [];
            document.querySelectorAll('.qf-checkbox:checked').forEach(el => {
                flags.push(el.dataset.flag);
            });
            return flags.join(' ');
        }

        function updateQuickFlags() {
            document.querySelectorAll('.qf-checkbox').forEach(el => {
                el.closest('.qf-checkbox-label').classList.toggle('active', el.checked);
            });
            const cmdText = document.getElementById('cmd-text');
            let base = cmdText.dataset.baseCmd || cmdText.textContent;
            const qf = getQuickFlags();
            if (qf) {
                // Remove any existing quick flags from base (they may have been appended previously)
                // Simple approach: store the clean base separately
                cmdText.textContent = base;
                cmdText.textContent = base + ' ' + qf;
            } else {
                cmdText.textContent = base;
            }
        }

        function updateCmdPreview(profileCmd) {
            const cmdText = document.getElementById('cmd-text');
            if (profileCmd) {
                cmdText.textContent = profileCmd;
            } else {
                cmdText.textContent = 'nmap -sS -sV -T4 --top-ports 1000 <TARGET>';
            }
            cmdText.dataset.baseCmd = cmdText.textContent;
            updateQuickFlags();
        }

        function filterProfiles() {
            const query = document.getElementById('profile-search').value.toLowerCase();
            document.querySelectorAll('.profile-card').forEach(card => {
                const name = card.querySelector('h4').textContent.toLowerCase();
                const desc = card.querySelector('p').textContent.toLowerCase();
                const match = name.includes(query) || desc.includes(query);
                card.style.display = match ? '' : 'none';
            });
            document.querySelectorAll('.profile-section').forEach(section => {
                const visibleCards = section.querySelectorAll('.profile-card[style=""], .profile-card:not([style])');
                const hasVisible = Array.from(visibleCards).some(c => c.style.display !== 'none');
                section.style.display = hasVisible ? '' : 'none';
            });
        }

        function toggleProfileSection(header) {
            const content = header.nextElementSibling;
            const arrow = header.querySelector('.profile-section-arrow');
            if (content.classList.contains('collapsed')) {
                document.querySelectorAll('.profile-section-content').forEach(c => c.classList.add('collapsed'));
                document.querySelectorAll('.profile-section-arrow').forEach(a => a.classList.remove('rotated'));
                content.classList.remove('collapsed');
                arrow.classList.add('rotated');
            } else {
                content.classList.add('collapsed');
                arrow.classList.remove('rotated');
            }
        }

        async function loadScanProfiles() {
            try {
                const res = await fetch('/api/scan/profiles');
                if (!res.ok) throw new Error('Failed to load');
                const data = await res.json();
                const container = document.getElementById('profiles-container');
                const profiles = data.profiles || [];
                const categories = {};
                profiles.forEach(p => {
                    if (!categories[p.category]) categories[p.category] = [];
                    categories[p.category].push(p);
                });
                let html = '';
                const catOrder = ['Network Discovery', 'Port Scanning', 'UDP Scanning', 'IDS/IPS Evasion', 'Common'];
                const sortedCats = Object.keys(categories).sort((a, b) => {
                    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
                    if (ai === -1 && bi === -1) return a.localeCompare(b);
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                });
                let firstCard = null;
                sortedCats.forEach((cat, catIdx) => {
                    const profs = categories[cat];
                    html += '<div class="profile-section">';
                    html += '<div class="profile-section-header" onclick="toggleProfileSection(this)">';
                    html += '<span class="profile-section-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>';
                    html += '<span>' + esc(cat) + '</span>';
                    html += '<span class="profile-section-count">' + profs.length + '</span>';
                    html += '</div>';
                    html += '<div class="profile-section-content collapsed">';
                    profs.forEach(p => {
                        html += '<div class="profile-card" data-id="' + p.id + '" data-profile="' + esc(p.name) + '" data-desc="' + esc(p.description) + '" data-cmd="' + esc(p.command) + '" onclick="selectProfile(this)">';
                        html += '<h4>' + esc(p.name) + '</h4>';
                        html += '<p>' + esc(p.description) + '</p>';
                        html += '</div>';
                        if (!firstCard) firstCard = p;
                    });
                    html += '</div></div>';
                });
                container.innerHTML = html;

                if (firstCard) {
                    selectedProfile = firstCard.name;
                    selectedProfileId = firstCard.id;
                    updateCmdPreview(firstCard.command);
                    document.getElementById('cmd-source').textContent = 'profile';
                    showProfileInfo(firstCard.name, firstCard.description, firstCard.id);
                    const firstEl = container.querySelector('.profile-card');
                    if (firstEl) firstEl.classList.add('selected');
                }
            } catch (e) {
                document.getElementById('profiles-container').innerHTML = '<div class="empty-state"><p style="color:var(--red);">Failed to load profiles</p></div>';
            }
        }

        async function loadImportProfiles() {
            try {
                const res = await fetch('/api/scan/profiles');
                if (!res.ok) return;
                const data = await res.json();
                const sel = document.getElementById('import-profile');
                sel.innerHTML = '';
                const def = document.createElement('option');
                def.value = 'imported';
                def.textContent = 'Imported';
                def.selected = true;
                sel.appendChild(def);
                (data.profiles || []).forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    sel.appendChild(opt);
                });
            } catch (e) {
                console.error('Failed to load profiles:', e);
            }
        }

        async function createScan() {
            const target = document.getElementById('target').value.trim();
            if (!target) { showToast('Please enter a target', 'error'); return; }

            const btn = document.getElementById('create-btn');
            btn.disabled = true;
            btn.textContent = 'Creating...';

            try {
                const extraArgs = getQuickFlags();
                const note = document.getElementById('scan-notes').value.trim();
                await createScanAPI(projectId, selectedProfile, target, extraArgs, note);
                showToast('Scan created');
                document.getElementById('target').value = '';
                document.getElementById('scan-notes').value = '';
                await loadScans();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Create Scan';
            }
        }

        async function runScan(id) {
            try {
                await runScanAPI(id);
                showToast('Scan started');
                await loadScans();
                startAutoRefresh();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        async function stopScan(id) {
            try {
                await stopScanAPI(id);
                showToast('Scan stopped');
                await loadScans();
                stopAutoRefresh();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        async function viewLog(id) {
            var body = '<div id="log-tabs" class="log-tabs" style="margin-bottom:8px;"></div><pre id="log-content" class="log-viewer">Loading...</pre>';
            showModal('log-modal', 'Scan #' + id + ' Log', body, 'modal-large');
            var content = document.getElementById('log-content');
            var tabsEl = document.getElementById('log-tabs');

            tabsEl.innerHTML = '';
            const formats = [
                { key: 'log', label: 'Log' },
                { key: 'xml', label: 'XML' },
                { key: 'nmap', label: 'Nmap' },
                { key: 'gnmap', label: 'Gnmap' }
            ];
            let activeFormat = 'log';

            formats.forEach(f => {
                const btn = document.createElement('button');
                btn.className = 'log-tab' + (f.key === activeFormat ? ' active' : '');
                btn.textContent = f.label;
                btn.onclick = () => {
                    activeFormat = f.key;
                    tabsEl.querySelectorAll('.log-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    loadLogFormat(id, f.key);
                };
                tabsEl.appendChild(btn);
            });

            loadLogFormat(id, 'log');
        }

        async function loadLogFormat(id, format) {
            const content = document.getElementById('log-content');
            content.textContent = 'Loading...';
            try {
                const data = await getScanLogFormat(id, format);
                if (data.log) {
                    content.textContent = data.log;
                } else {
                    content.textContent = 'No data available.';
                }
            } catch (e) {
                content.textContent = 'Error loading: ' + e.message;
            }
        }

        async function getScanLogFormat(scanId, format) {
            const res = await fetch(`${API}/api/scans/${scanId}/log?format=${format}`);
            return res.json();
        }

        function closeLogModal() { closeModal('log-modal'); }

        function downloadXML(id) {
            window.location.href = `/api/scans/${id}/download/nmap`;
        }

        function downloadGnmap(id) {
            window.location.href = `/api/scans/${id}/download/gnmap`;
        }

        function downloadJSON(id) {
            window.location.href = `/api/export/${id}/json`;
        }

        let exportScanId = null;

        function showExportModal(scanId) {
            exportScanId = Number(scanId);
            var body = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">Select export format:</p>' +
                '<div style="display:flex;flex-direction:column;gap:8px;">' +
                    '<button class="btn btn-success btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'xlsx\')">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>' +
                        ' Excel (.xlsx)' +
                    '</button>' +
                    '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'json\')">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>' +
                        ' JSON' +
                    '</button>' +
                    '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'nmap\')" id="export-btn-nmap">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M4 10l2 2 2-2"/><path d="M6 12v4"/></svg>' +
                        ' <span>Nmap (.nmap)</span>' +
                        ' <span id="export-badge-nmap" class="badge badge-muted" style="margin-left:auto;display:none;font-size:0.7rem;">generated</span>' +
                    '</button>' +
                    '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'xml\')" id="export-btn-xml">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><polyline points="4 10 6 12 4 14"/><polyline points="8 14 6 12 8 10"/></svg>' +
                        ' <span>XML</span>' +
                        ' <span id="export-badge-xml" class="badge badge-muted" style="margin-left:auto;display:none;font-size:0.7rem;">generated</span>' +
                    '</button>' +
                    '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'gnmap\')" id="export-btn-gnmap">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><line x1="4" y1="11" x2="8" y2="11"/></svg>' +
                        ' <span>Grepable (.gnmap)</span>' +
                        ' <span id="export-badge-gnmap" class="badge badge-muted" style="margin-left:auto;display:none;font-size:0.7rem;">generated</span>' +
                    '</button>' +
                '</div>';
            showModal('export-modal', 'Export Scan #' + scanId, body, 'modal-small');
            fetch(`/api/export/${scanId}/availability`)
                .then(r => r.json())
                .then(function(data) {
                    var nmap = document.getElementById('export-badge-nmap');
                    var xml = document.getElementById('export-badge-xml');
                    var gnmap = document.getElementById('export-badge-gnmap');
                    if (nmap) nmap.style.display = data.nmap ? 'none' : 'inline';
                    if (xml) xml.style.display = data.xml ? 'none' : 'inline';
                    if (gnmap) gnmap.style.display = data.gnmap ? 'none' : 'inline';
                })
                .catch(function() {
                    var nmap = document.getElementById('export-badge-nmap');
                    var xml = document.getElementById('export-badge-xml');
                    var gnmap = document.getElementById('export-badge-gnmap');
                    if (nmap) nmap.style.display = 'inline';
                    if (xml) xml.style.display = 'inline';
                    if (gnmap) gnmap.style.display = 'inline';
                });
        }

        function closeExportModal() { closeModal('export-modal'); }

        function doExport(format) {
            const sid = exportScanId;
            if (!sid) return;
            closeExportModal();
            window.location.href = '/api/export/' + sid + '/' + format;
        }

        // Scan progress polling
        let scanPollInterval = null;

        function startScanPolling() {
            const running = document.querySelectorAll('.scan-state');
            if (running.length === 0) {
                if (scanPollInterval) {
                    clearInterval(scanPollInterval);
                    scanPollInterval = null;
                }
                return;
            }
            if (scanPollInterval) return;
            scanPollInterval = setInterval(pollScanStatuses, 2000);
        }

        async function pollScanStatuses() {
            const states = document.querySelectorAll('.scan-state');
            if (states.length === 0) {
                clearInterval(scanPollInterval);
                scanPollInterval = null;
                return;
            }
            for (const el of states) {
                const id = el.id.replace('sp-', '');
                try {
                    const resp = await fetch('/api/scans/' + id + '/status');
                    const data = await resp.json();
                    if (data.status === 'completed' || data.status === 'error' || data.status === 'stopped') {
                        clearInterval(scanPollInterval);
                        scanPollInterval = null;
                        await loadScans();
                        return;
                    }
                    if (data.phase) el.innerHTML = getStateIcon(data.phase) + ' ' + esc(data.phase);
                } catch (e) {
                    // ignore
                }
            }
        }

        function downloadCSV(id) {
            window.location.href = `/api/export/${id}/csv`;
        }

        function viewResults(id) {
            window.location.href = '/project/' + projectId + '/scan/' + id;
        }

        async function deleteScan(id) {
            if (!confirm('Delete this scan?')) return;
            try {
                await deleteScanAPI(id);
                showToast('Scan deleted');
                await loadScans();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        async function loadScans() {
            const list = document.getElementById('scans-list');
            try {
                allScans = await getScans(projectId);
                populateProfileFilter(allScans);
                applyScanFilters();
                updateRecentTargets();

                stopAutoRefresh();
            } catch (e) {
                console.error('loadScans error:', e);
                list.innerHTML = '<div class="empty-state"><p>Error loading scans: ' + esc(e.message) + '</p></div>';
            }
        }

        function updateRecentTargets() {
            const container = document.getElementById('recent-targets-container');
            const list = document.getElementById('recent-targets-list');
            if (!container || !list) return;
            const seen = new Set();
            const targets = [];
            for (const s of allScans) {
                if (s.target && !seen.has(s.target)) {
                    seen.add(s.target);
                    targets.push(s.target);
                }
            }
            if (targets.length === 0) { container.style.display = 'none'; return; }
            container.style.display = '';
            list.innerHTML = targets.slice(-5).reverse().map(t =>
                '<span onclick="document.getElementById(\'target\').value=this.textContent" style="font-size:0.72rem;padding:2px 8px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;cursor:pointer;white-space:nowrap;font-family:var(--font-mono);">' + esc(t) + '</span>'
            ).join('');
        }

        function getStateIcon(phase) {
            if (!phase) return '';
            const p = phase.toLowerCase();
            var svg = '';
            if (p.startsWith('starting nmap')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
            } else if (p.includes('nse:')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
            } else if (p.startsWith('initiating') && p.includes('scan')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
            } else if (p.includes('scanning') && p.includes('hosts')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
            } else if (p.includes('scanning') && p.includes('services')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>';
            } else if (p.includes('discovered open port')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';
            } else if (p.startsWith('completed')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            } else if (p.includes('host is up')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14"/><rect x="7" y="3" width="10" height="14" rx="2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>';
            } else if (p.includes('host down') || p.includes('host is down')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            } else if (p.includes('nmap scan report for')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>';
            } else if (p.includes('nmap done')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
            } else if (p.includes('retrying') || p.includes('try #')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
            } else if (p.includes('os detection') && (p.includes('initiating') || p.includes('performed'))) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
            } else if (p.includes('dns resolution')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
            } else if (p.includes('read data files')) {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
            } else {
                svg = '<svg class="state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/></svg>';
            }
            return svg;
        }

        function formatDuration(started, completed) {
            if (!started) return '';
            const start = new Date(started);
            const end = completed ? new Date(completed) : new Date();
            const secs = Math.floor((end - start) / 1000);
            if (secs < 60) return secs + 's';
            const mins = Math.floor(secs / 60);
            const rem = secs % 60;
            return mins + 'm ' + rem + 's';
        }

        function renderScans(scans) {
            const list = document.getElementById('scans-list');
            const countEl = document.getElementById('scan-count');
            if (!scans || scans.length === 0) {
                list.innerHTML = '<div class="empty-state"><h3>No scans match your filters</h3><p>Try adjusting the search or filters</p></div>';
                if (countEl) countEl.textContent = '';
                return;
            }

            if (countEl) countEl.textContent = scans.length + ' of ' + allScans.length;

            const sort = document.getElementById('scan-sort').value;
            scans.sort((a, b) => {
                const aPending = a.status === 'completed' && a.confirmed !== 1 && a.confirmed !== -1;
                const bPending = b.status === 'completed' && b.confirmed !== 1 && b.confirmed !== -1;
                if (aPending && !bPending) return -1;
                if (!aPending && bPending) return 1;
                if (sort === 'oldest') return new Date(a.started_at) - new Date(b.started_at);
                if (sort === 'target') return a.target.localeCompare(b.target);
                if (sort === 'profile') return a.profile.localeCompare(b.profile);
                return new Date(b.started_at) - new Date(a.started_at);
            });

            let html = '';
            for (const s of scans) {
                const isRunning = s.status === 'running';
                const isPending = s.status === 'pending' || s.status === 'stopped';
                const isCompleted = s.status === 'completed';
                const isConfirmed = s.confirmed === 1;
                const isRejected = s.confirmed === -1;
                const isPendingConfirm = isCompleted && !isConfirmed && !isRejected;
                const clickable = isCompleted;
                const dur = formatDuration(s.started_at, s.completed_at);
                const stateLine = isRunning ? (s.phase || 'Starting...') : (s.phase || '');

                var cardClass = 'scan-card';
                if (isPendingConfirm) cardClass += ' scan-card-pending';

                html += '<div class="' + cardClass + ' scan-card-clickable" id="scan-' + s.id + '"' + (clickable ? ' onclick="viewResults(' + s.id + ')"' : '') + '>';

                html += '<div class="scan-card-header">';
                html += '<div class="scan-card-title">';
                html += '<span class="scan-id">#' + s.id + '</span>';
                html += '<span class="scan-profile">' + esc(s.profile) + '</span>';
                html += '</div>';
                html += '<div class="scan-card-header-actions">';
                html += '<span class="scan-duration">' + dur + '</span>';
                if (isPendingConfirm) html += '<span class="badge badge-pending">Pending</span>';
                if (isConfirmed) html += '<span class="badge badge-confirmed">&#10003;</span>';
                if (isRejected) html += '<span class="badge badge-rejected">&#10007;</span>';
                html += statusBadge(s.status);
                if (isPending) html += '<button class="btn btn-sm btn-run" onclick="event.stopPropagation();runScan(' + s.id + ')" title="Run"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>';
                if (isRunning) html += '<button class="btn btn-sm btn-stop" onclick="event.stopPropagation();stopScan(' + s.id + ')" title="Stop"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button>';
                html += '</div>';
                html += '</div>';

                html += '<div class="scan-card-target">' + esc(s.target) + '</div>';

                html += '<div class="scan-card-meta">';
                html += '<span>Hosts: <strong>' + s.host_count + '</strong></span>';
                html += '<span class="meta-dot"></span>';
                html += '<span>Ports: <strong>' + s.port_count + '</strong></span>';
                html += '<span class="meta-dot"></span>';
                html += '<span>Started: ' + formatDate(s.started_at) + '</span>';
                if (dur) {
                    html += '<span class="meta-dot"></span>';
                    html += '<span>Duration: ' + dur + '</span>';
                }
                html += '</div>';

                if (s.nmap_command) {
                    html += '<div class="scan-card-command" title="' + esc(s.nmap_command) + '">' + esc(s.nmap_command) + '</div>';
                }

                if (stateLine) {
                    const pollId = isRunning ? 'sp-' + s.id : '';
                    html += '<div class="scan-state"' + (pollId ? ' id="' + pollId + '"' : '') + '>' + getStateIcon(stateLine) + ' ' + esc(stateLine) + '</div>';
                }

                html += '<div class="scan-card-footer">';
                if (isPendingConfirm) {
                    html += '<button class="btn btn-sm btn-confirm" onclick="event.stopPropagation();confirmScan(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>Confirm</button>';
                    html += '<button class="btn btn-sm btn-reject" onclick="event.stopPropagation();rejectScan(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Reject</button>';
                }
                html += '<span class="footer-spacer"></span>';
                html += '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();viewLog(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Logs</button>';
                if (isCompleted) html += '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();showExportModal(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>';
                html += '<button class="btn btn-ghost btn-sm btn-delete" onclick="event.stopPropagation();deleteScan(' + s.id + ')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>';
                html += '</div>';

                html += '</div>';
            }
            list.innerHTML = html;
            startScanPolling();
        }

        function populateProfileFilter(scans) {
            const sel = document.getElementById('scan-profile-filter');
            const profiles = [...new Set(scans.map(s => s.profile))].sort();
            const current = sel.value;
            sel.innerHTML = '<option value="">All Profiles</option>';
            profiles.forEach(p => {
                sel.innerHTML += '<option value="' + esc(p) + '">' + esc(p) + '</option>';
            });
            sel.value = current;
        }

        let selectedStatus = '';

        function applyScanFilters() {
            const query = document.getElementById('scan-search').value.toLowerCase();
            const profileFilter = document.getElementById('scan-profile-filter').value;
            const unconfirmedOnly = document.getElementById('filter-unconfirmed').checked;
            const confirmedOnly = document.getElementById('filter-confirmed').checked;
            const rejectedOnly = document.getElementById('filter-rejected').checked;

            let filtered = allScans;
            if (query) {
                filtered = filtered.filter(s =>
                    safeLower(s.target).includes(query) ||
                    safeLower(s.profile).includes(query)
                );
            }
            if (selectedStatus) {
                filtered = filtered.filter(s => s.status === selectedStatus);
            }
            if (profileFilter) {
                filtered = filtered.filter(s => s.profile === profileFilter);
            }
            if (unconfirmedOnly) {
                filtered = filtered.filter(s => s.status === 'completed' && s.confirmed != 1 && s.confirmed != -1);
            }
            if (confirmedOnly) {
                filtered = filtered.filter(s => s.confirmed == 1);
            }
            if (rejectedOnly) {
                filtered = filtered.filter(s => s.confirmed == -1);
            }

            renderScans(filtered);
        }

        function setStatusFilter(el, status) {
            selectedStatus = status;
            document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('chip-active'));
            el.classList.add('chip-active');
            applyScanFilters();
        }

        function onSearchInput() {
            const val = document.getElementById('scan-search').value;
            document.getElementById('search-clear').style.display = val ? 'block' : 'none';
            applyScanFilters();
        }

        function clearSearch() {
            document.getElementById('scan-search').value = '';
            document.getElementById('search-clear').style.display = 'none';
            applyScanFilters();
        }

        function toggleAdvancedFilters() {
            const panel = document.getElementById('advanced-filters');
            const btn = document.getElementById('adv-filter-btn');
            if (panel.style.display === 'none' || !panel.style.display) {
                panel.style.display = 'flex';
                btn.textContent = '- Filters';
            } else {
                panel.style.display = 'none';
                btn.textContent = '+ Filters';
            }
        }

        function resetScanFilters() {
            document.getElementById('scan-search').value = '';
            document.getElementById('search-clear').style.display = 'none';
            document.getElementById('scan-profile-filter').value = '';
            selectedStatus = '';
            document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('chip-active'));
            document.querySelector('#filter-chips .chip[data-status=""]').classList.add('chip-active');
            document.getElementById('advanced-filters').style.display = 'none';
            document.getElementById('adv-filter-btn').textContent = '+ Filters';
            document.getElementById('filter-unconfirmed').checked = false;
            document.getElementById('filter-confirmed').checked = false;
            document.getElementById('filter-rejected').checked = false;
            renderScans(allScans);
        }

        function backToProjects(e) {
            window.location.href = '/';
        }

        function statusBadge(status) {
            const colors = {
                pending: 'badge-filtered',
                running: 'badge-running',
                completed: 'badge-open',
                stopped: 'badge-closed',
                error: 'badge-closed'
            };
            const cls = colors[status] || 'badge-filtered';
            return `<span class="badge ${cls}">${status}</span>`;
        }

        function startAutoRefresh() {
            stopAutoRefresh();
            refreshInterval = setInterval(() => loadScans(), 2000);
        }

        function stopAutoRefresh() {
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        }

        function showTab(tab, el) {
            if (!el) { tab = this.getAttribute('data-tab'); el = this; }
            sessionStorage.setItem('project-tab-' + projectId, tab);
            document.querySelectorAll('.sidebar-btn').forEach(t => t.classList.remove('active'));
            if (el) el.classList.add('active');
            document.getElementById('tab-scans').style.display = tab === 'scans' ? '' : 'none';
            document.getElementById('tab-new-scan').style.display = tab === 'new-scan' ? '' : 'none';
            document.getElementById('tab-consolidated').style.display = tab === 'consolidated' ? '' : 'none';
            document.getElementById('tab-live').style.display = tab === 'live' ? '' : 'none';
            document.getElementById('tab-import').style.display = tab === 'import' ? '' : 'none';
            document.getElementById('tab-scripts').style.display = tab === 'scripts' ? '' : 'none';
            if (tab === 'scans') loadScans();
            if (tab === 'consolidated') loadConsolidated(1);
            if (tab === 'live') loadLiveHosts();
            if (tab === 'scripts') loadScriptsTab();
            if (tab === 'new-scan') loadScanProfiles();
            if (tab === 'import') { loadImportProfiles(); loadImportMergeScans(); loadImportHistory(); }
        }

        async function confirmScan(id) {
            if (!confirm('Confirm this scan? Its data will be merged into consolidated results.')) return;
            try {
                await confirmScanAPI(id);
                showToast('Scan confirmed');
                await loadScans();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        async function rejectScan(id) {
            if (!confirm('Reject this scan? Its data will NOT be merged.')) return;
            try {
                await rejectScanAPI(id);
                showToast('Scan rejected');
                await loadScans();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        let consolidatedPortsData = [];
        let consolidatedScriptsData = [];
        let hostEditsData = {};

        async function loadHostEdits(ip) {
            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/hosts/edits?ip=${encodeURIComponent(ip)}`);
                const edits = await res.json();
                const unapplied = edits.filter(e => e.applied !== 0);
                hostEditsData[ip] = unapplied.length > 0 ? unapplied : null;
            } catch (e) {
                hostEditsData[ip] = null;
            }
        }

        function getHostEditRevertHtml(ip) {
            const edits = hostEditsData[ip];
            if (!edits || edits.length === 0) return '';
            let html = '';
            for (const e of edits) {
                html += '<span class="host-edit-revert" onclick="revertHostEdit(' + e.edit_id + ',\'' + esc(ip) + '\')" title="Revert ' + esc(e.field) + ': ' + esc(e.old_value) + ' â†’ ' + esc(e.new_value) + '"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></span>';
            }
            return html;
        }

        let consolidatedSearchTimeout = null;
        function debounceSearchConsolidated() {
            if (consolidatedSearchTimeout) clearTimeout(consolidatedSearchTimeout);
            const el = document.getElementById('consolidated-search');
            const clearBtn = document.getElementById('consolidated-search-clear');
            if (clearBtn) clearBtn.style.display = el.value ? '' : 'none';
            consolidatedSearchTimeout = setTimeout(() => loadConsolidated(1), 400);
        }

        function changeConsolidatedLimit() {
            loadConsolidated(1);
        }

        async function loadConsolidated(page) {
            if (typeof page !== 'number') page = parseInt(this && this.getAttribute('data-page')) || 1;
            try {
                page = page || 1;
                const q = document.getElementById('consolidated-search')?.value || '';
                const state = document.getElementById('consolidated-filter-state')?.value || '';
                const service = document.getElementById('consolidated-filter-service')?.value || '';
                const limit = parseInt(document.getElementById('consolidated-limit')?.value || '50');
                // Fetch filter options once
                await fetchConsolidatedFilterOptions();

                let portsRes;
                const activeGroups = consolidatedFilterGroups.map(g => ({
                    group_mode: g.group_mode || 'and',
                    filters: (g.filters || []).filter(f => f.field)
                })).filter(g => g.filters.length > 0);
                const hasFilters = activeGroups.length > 0;
                if (hasFilters) {
                    const body = {
                        page, limit,
                        search: q || undefined,
                        filter_mode: consolidatedFilterMode || 'and',
                        groups: activeGroups
                    };
                    portsRes = await fetch(`/api/projects/${projectId}/consolidated/ports/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                } else {
                    let url = `/api/projects/${projectId}/consolidated/ports?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`;
                    if (state) url += `&state=${encodeURIComponent(state)}`;
                    if (service) url += `&service=${encodeURIComponent(service)}`;
                    portsRes = await fetch(url);
                }
                const [raw] = await Promise.all([
                    portsRes.json(),
                    loadConsolidatedScripts(1, 100000)
                ]);
                if (!portsRes.ok) throw new Error(`HTTP ${portsRes.status}: ${raw.error || JSON.stringify(raw)}`);
                consolidatedPortsData = Array.isArray(raw) ? { ports: raw, total: raw.length, page: 1, limit: raw.length } : raw;
                if (consolidatedPortsData.error) throw new Error(consolidatedPortsData.error);
                if (!consolidatedPortsData.ports) consolidatedPortsData = { ports: [], total: 0, page: 1, limit: 50 };
                hostEditsData = {};
                const ips = [...new Set(consolidatedPortsData.ports.map(p => p.ip))];
                await Promise.all(ips.map(ip => loadHostEdits(ip)));

                // Populate service filter dropdown on first load
                const svcSelect = document.getElementById('consolidated-filter-service');
                if (svcSelect && svcSelect.options.length <= 1) {
                    const services = [...new Set(consolidatedPortsData.ports.map(p => p.service).filter(Boolean))];
                    services.sort();
                    for (const s of services) {
                        const opt = document.createElement('option');
                        opt.value = s;
                        opt.textContent = s;
                        svcSelect.appendChild(opt);
                    }
                }

                // Update stats
                const stat = document.getElementById('asset-stat');
                if (stat) {
                    const totalPorts = consolidatedPortsData.total || consolidatedPortsData.ports.length;
                    const hosts = [...new Set(consolidatedPortsData.ports.map(p => p.ip))].length;
                    stat.textContent = `${totalPorts} ports on ${hosts} hosts`;
                }

                renderConsolidatedPorts();
                renderPaginationControls();
            } catch (e) {
                console.error('loadConsolidated error:', e);
                document.getElementById('cports-table').innerHTML = '<div class="empty-state"><p>Error loading: ' + esc(e.message) + '</p></div>';
            }
        }

        let scriptsSearchTimeout = null;
        function debounceSearchScripts() {
            if (scriptsSearchTimeout) clearTimeout(scriptsSearchTimeout);
            scriptsSearchTimeout = setTimeout(() => loadConsolidatedScripts(1), 400);
        }

        async function loadConsolidatedScripts(page, limit) {
            try {
                page = page || 1;
                limit = limit || 50;
                const q = document.getElementById('script-search-tab')?.value || '';
                const res = await fetch(`/api/projects/${projectId}/consolidated/scripts?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`);
                const raw = await res.json();
                consolidatedScriptsData = Array.isArray(raw) ? { scripts: raw, total: raw.length, page: 1, limit: raw.length } : raw;
            } catch (e) {
                consolidatedScriptsData = { scripts: [], total: 0, page: 1, limit: 50 };
            }
        }

        function getPortNSEScripts(ip, port, protocol) {
            return (consolidatedScriptsData.scripts || []).filter(s => s.ip === ip && s.port === port && s.protocol === protocol);
        }

        function toggleNSERow(btn, ip, port, protocol) {
            const tr = btn.closest('tr');
            const nseRow = tr.nextElementSibling;
            if (nseRow && nseRow.classList.contains('nse-row') && nseRow.dataset.parentIp === ip) {
                const isHidden = nseRow.style.display === 'none';
                nseRow.style.display = isHidden ? '' : 'none';
                btn.classList.toggle('active', isHidden);
            }
        }

        let consolidatedSelected = new Set();
        let consolidatedGroupMode = false;
        let consolidatedFilterGroups = [{ group_mode: 'and', filters: [] }];
        let consolidatedFilterMode = 'and';
        let consolidatedFilterOptions = null;
        let consolidatedFilterGroupsBackup = [];

        const FILTER_FIELD_LABELS = {
            ip:'IP',mac:'MAC',hostname:'Hostname',os:'OS',
            host_status:'Status',port:'Port',protocol:'Proto',
            state:'State',service:'Service',version:'Version',
            product:'Product',extra_info:'Extra',change_count:'Changes',
            last_seen:'Last Seen',note:'Note'
        };
        const FILTER_OP_LABELS = {
            eq:'=',neq:'\u2260',contains:'Contains',begins_with:'Starts With',
            ends_with:'Ends With',gt:'>',gte:'\u2265',lt:'<',lte:'\u2264',
            in:'In',not_in:'Not In',between:'Between',
            is_empty:'Is Empty',is_not_empty:'Is Not Empty'
        };

        async function fetchConsolidatedFilterOptions() {
            if (consolidatedFilterOptions) return consolidatedFilterOptions;
            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/filter-options`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                consolidatedFilterOptions = data.fields || {};
                return consolidatedFilterOptions;
            } catch (e) {
                console.error('fetch filter options error:', e);
                consolidatedFilterOptions = {};
                return {};
            }
        }

        function getDefaultOps(fieldType) {
            if (fieldType === 'string') return ['contains','eq','neq','begins_with','ends_with','is_empty','is_not_empty'];
            if (fieldType === 'number') return ['eq','neq','gt','gte','lt','lte','between'];
            if (fieldType === 'date') return ['eq','neq','gt','gte','lt','lte','between'];
            if (fieldType === 'enum') return ['eq','neq','in','not_in','is_empty','is_not_empty'];
            return ['eq','neq','contains'];
        }

        // --- Advanced filter groups ---
        function toggleAdvancedFilterModal() {
            const modal = document.getElementById('advanced-filter-modal');
            if (modal.style.display === 'flex') { closeModal('advanced-filter-modal'); return; }
            consolidatedFilterGroupsBackup = JSON.parse(JSON.stringify(consolidatedFilterGroups));
            document.getElementById('adv-filter-mode').value = consolidatedFilterMode;
            renderAllFilterGroups();
            modal.style.display = 'flex';
        }

        function addFilterGroup() {
            consolidatedFilterGroups.push({ group_mode: 'and', filters: [] });
            renderAllFilterGroups();
        }

        function removeFilterGroup(gi) {
            consolidatedFilterGroups.splice(gi, 1);
            if (consolidatedFilterGroups.length === 0) consolidatedFilterGroups.push({ group_mode: 'and', filters: [] });
            renderAllFilterGroups();
        }

        function addFilterRow(groupIdx) {
            if (!consolidatedFilterGroups[groupIdx]) {
                consolidatedFilterGroups.push({ group_mode: 'and', filters: [] });
                groupIdx = consolidatedFilterGroups.length - 1;
            }
            consolidatedFilterGroups[groupIdx].filters.push({ field: '', op: 'contains', value: '' });
            renderAllFilterGroups();
        }

        function removeFilterRow(gi, fi) {
            if (!consolidatedFilterGroups[gi]) return;
            consolidatedFilterGroups[gi].filters.splice(fi, 1);
            renderAllFilterGroups();
        }

        function setGroupMode(gi, mode) {
            if (consolidatedFilterGroups[gi]) consolidatedFilterGroups[gi].group_mode = mode;
        }

        function renderAllFilterGroups() {
            const container = document.getElementById('adv-filter-rows');
            if (!container) return;
            let hasAny = consolidatedFilterGroups.some(g => g.filters.length > 0);
            if (!hasAny) {
                container.innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:0.85rem;">No filters added. Click "+ Add Group" or "+ Add Filter" to get started.</div>';
                return;
            }
            let html = '';
            for (let gi = 0; gi < consolidatedFilterGroups.length; gi++) {
                const g = consolidatedFilterGroups[gi];
                html += `<div class="filter-group" style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">Group ${gi+1}</span>
                        <select class="form-control" style="width:auto;font-size:0.75rem;padding:2px 8px;" onchange="setGroupMode(${gi},this.value);renderAllFilterGroups();">
                            <option value="and" ${g.group_mode==='and'?'selected':''}>AND</option>
                            <option value="or" ${g.group_mode==='or'?'selected':''}>OR</option>
                        </select>
                        <span style="flex:1;"></span>
                        ${consolidatedFilterGroups.length > 1 ? `<button class="btn btn-danger btn-sm" onclick="removeFilterGroup(${gi})" title="Remove group" style="padding:2px 6px;font-size:0.7rem;">&times;</button>` : ''}
                    </div>`;
                for (let fi = 0; fi < g.filters.length; fi++) {
                    html += renderFilterRow(gi, fi);
                }
                html += `<button class="btn btn-secondary btn-sm" onclick="addFilterRow(${gi})" style="font-size:0.75rem;padding:2px 10px;margin-top:4px;">+ Add Filter</button>`;
                html += `</div>`;
            }
            html += `<button class="btn btn-secondary btn-sm" onclick="addFilterGroup()" style="margin-top:4px;">+ Add Group</button>`;
            container.innerHTML = html;
        }

        function renderFilterRow(gi, fi) {
            const g = consolidatedFilterGroups[gi];
            if (!g || !g.filters[fi]) return '';
            const f = g.filters[fi];
            const field = f.field || '';
            const op = f.op || 'contains';
            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';
            const ops = getDefaultOps(fieldType);

            let fieldOptions = '';
            for (const [key, label] of Object.entries(FILTER_FIELD_LABELS)) {
                const sel = key === field ? 'selected' : '';
                fieldOptions += `<option value="${key}" ${sel}>${label}</option>`;
            }
            let opOptions = '';
            for (const o of ops) {
                const sel = o === op ? 'selected' : '';
                opOptions += `<option value="${o}" ${sel}>${FILTER_OP_LABELS[o]||o}</option>`;
            }
            let valueHtml = buildFilterValueInput(gi, fi);

            return `<div class="filter-row" style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">
                <select class="form-control" style="width:130px;font-size:0.8rem;padding:4px 8px;" onchange="onFilterFieldChange(${gi},${fi})">
                    ${fieldOptions}
                </select>
                <select class="form-control" style="width:110px;font-size:0.8rem;padding:4px 8px;" onchange="onFilterOpChange(${gi},${fi})">
                    ${opOptions}
                </select>
                ${valueHtml}
                <button class="btn btn-danger btn-sm" onclick="removeFilterRow(${gi},${fi})" title="Remove" style="padding:4px 8px;font-size:0.8rem;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;
        }

        function onFilterFieldChange(gi, fi) {
            const groupEl = document.querySelectorAll('#adv-filter-rows .filter-group')[gi];
            if (!groupEl) return;
            const rows = groupEl.querySelectorAll('.filter-row');
            const row = rows[fi];
            if (!row) return;
            const selects = row.querySelectorAll('select');
            const field = selects[0].value;
            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';
            const ops = getDefaultOps(fieldType);
            const opSelect = selects[1];
            const defaultOp = ops[0];
            opSelect.innerHTML = ops.map(o => `<option value="${o}" ${o === defaultOp ? 'selected' : ''}>${FILTER_OP_LABELS[o]||o}</option>`).join('');
            opSelect.value = defaultOp;
            // Update stored filter
            const f = consolidatedFilterGroups[gi].filters[fi];
            if (f) { f.field = field; f.op = defaultOp; f.value = ''; delete f.values; delete f.min; delete f.max; }
            // Update value input
            updateFilterValueInput(gi, fi);
        }

        function onFilterOpChange(gi, fi) {
            const groupEl = document.querySelectorAll('#adv-filter-rows .filter-group')[gi];
            if (!groupEl) return;
            const rows = groupEl.querySelectorAll('.filter-row');
            const row = rows[fi];
            if (!row) return;
            const selects = row.querySelectorAll('select');
            const op = selects[1].value;
            const f = consolidatedFilterGroups[gi].filters[fi];
            if (f) f.op = op;
            updateFilterValueInput(gi, fi);
        }

        function updateFilterValueInput(gi, fi) {
            const groupEl = document.querySelectorAll('#adv-filter-rows .filter-group')[gi];
            if (!groupEl) return;
            const rows = groupEl.querySelectorAll('.filter-row');
            const row = rows[fi];
            if (!row) return;
            const container = row.querySelector('.filter-value-container');
            if (!container) return;
            const g = consolidatedFilterGroups[gi];
            if (!g || !g.filters[fi]) return;
            const f = g.filters[fi];
            const field = f.field || '';
            const op = f.op || 'contains';
            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';

            const needsFullReplace = op === 'is_empty' || op === 'is_not_empty' ||
                (fieldType === 'enum' && (op === 'in' || op === 'not_in')) ||
                op === 'between' || fieldType === 'date';

            if (needsFullReplace) { container.outerHTML = buildFilterValueInput(gi, fi); return; }

            let acInput = container.querySelector('.filter-ac-input');
            if (!acInput) { container.outerHTML = buildFilterValueInput(gi, fi); return; }
            acInput.dataset.field = field;
            acInput.value = '';
            acInput.dataset.gi = gi;
            acInput.dataset.fi = fi;
            const oldDd = document.getElementById('ac-dd-' + gi + '-' + fi);
            if (oldDd) oldDd.style.display = 'none';
        }

        function buildFilterValueInput(gi, fi) {
            const g = consolidatedFilterGroups[gi];
            if (!g || !g.filters[fi]) return '<span class="filter-value-container"></span>';
            const f = g.filters[fi];
            const field = f.field || '';
            const op = f.op || 'contains';
            if (op === 'is_empty' || op === 'is_not_empty') return '<span class="filter-value-container" style="font-size:0.8rem;color:var(--text-muted);">(no value needed)</span>';

            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';
            const acId = gi + '-' + fi;

            if (fieldType === 'enum' && (op === 'in' || op === 'not_in')) {
                const values = fieldMeta.values || [];
                const selected = f.values || [];
                let html = '<span class="filter-value-container" style="display:flex;flex-direction:column;gap:2px;max-height:100px;overflow-y:auto;border:1px solid var(--border);padding:4px 8px;border-radius:4px;width:150px;font-size:0.8rem;">';
                for (const v of values) {
                    const checked = selected.includes(v) ? 'checked' : '';
                    html += `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" ${checked} onchange="updateFilterValues(${gi},${fi},'${v}',this.checked)">${v}</label>`;
                }
                html += '</span>'; return html;
            }
            if (op === 'between') {
                if (fieldType === 'date') {
                    return `<span class="filter-value-container" style="display:flex;gap:4px;align-items:center;">
                        <input type="date" class="form-control" style="width:120px;font-size:0.8rem;padding:4px 8px;" value="${f.min||''}" onchange="updateFilterMin(${gi},${fi},this.value)">
                        <span style="color:var(--text-muted);font-size:0.8rem;">-</span>
                        <input type="date" class="form-control" style="width:120px;font-size:0.8rem;padding:4px 8px;" value="${f.max||''}" onchange="updateFilterMax(${gi},${fi},this.value)">
                    </span>`;
                }
                return `<span class="filter-value-container" style="display:flex;gap:4px;align-items:center;">
                    <input type="number" class="form-control" style="width:70px;font-size:0.8rem;padding:4px 8px;" placeholder="Min" value="${f.min||''}" onchange="updateFilterMin(${gi},${fi},this.value)">
                    <span style="color:var(--text-muted);font-size:0.8rem;">-</span>
                    <input type="number" class="form-control" style="width:70px;font-size:0.8rem;padding:4px 8px;" placeholder="Max" value="${f.max||''}" onchange="updateFilterMax(${gi},${fi},this.value)">
                </span>`;
            }
            if (fieldType === 'date') {
                return `<span class="filter-value-container"><input type="date" class="form-control" style="width:150px;font-size:0.8rem;padding:4px 8px;" value="${f.value||''}" onchange="updateFilterValue(${gi},${fi},this.value)"></span>`;
            }
            const val = acEscapeHtml(f.value||'');
            return `<span class="filter-value-container">
                <div class="filter-ac-wrap">
                    <input type="text" class="form-control filter-ac-input" style="width:150px;font-size:0.8rem;padding:4px 8px;" value="${val}" placeholder="Type..." autocomplete="off" data-idx="${acId}" data-field="${field}" data-gi="${gi}" data-fi="${fi}" onfocus="acShow(this)" oninput="acInput(this)" onchange="updateFilterValue(${gi},${fi},this.value)">
                </div>
            </span>`;
        }

        function updateFilterValue(gi, fi, val) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.value = val;
        }
        function updateFilterMin(gi, fi, val) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.min = val;
        }
        function updateFilterMax(gi, fi, val) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.max = val;
        }
        function updateFilterValues(gi, fi, val, checked) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (!f) return;
            if (!f.values) f.values = [];
            if (checked) f.values.push(val); else f.values = f.values.filter(v => v !== val);
        }

        // --- Autocomplete (uses acId = "gi-fi") ---
        let acTimers = {};
        function acFetch(field, query, callback) {
            const meta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            if (meta && meta.type === 'enum' && meta.values) {
                let vals = meta.values;
                if (query) { const q = query.toLowerCase(); vals = vals.filter(v => v.toLowerCase().includes(q)); }
                callback(vals); return;
            }
            fetch(`/api/projects/${projectId}/consolidated/field-values?field=${encodeURIComponent(field)}&q=${encodeURIComponent(query)}`)
                .then(r => r.json()).then(d => callback(d.values || [])).catch(() => callback([]));
        }
        function acShow(input) {
            const field = input.dataset.field;
            if (!field) return;
            const acId = input.dataset.idx;
            const dd = acGetDropdown(acId);
            const query = input.value;
            const rect = input.getBoundingClientRect();
            dd.style.left = rect.left + 'px';
            dd.style.top = (rect.bottom + 2) + 'px';
            dd.style.width = Math.max(rect.width, 150) + 'px';
            acFetch(field, query, (values) => acRender(dd, values, query));
            dd.style.display = 'block';
        }

        function acInput(input) {
            const acId = input.dataset.idx;
            // Save to state immediately
            const gi = parseInt(input.dataset.gi);
            const fi = parseInt(input.dataset.fi);
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.value = input.value;
            clearTimeout(acTimers[acId]);
            acTimers[acId] = setTimeout(() => {
                const field = input.dataset.field;
                const query = input.value;
                if (!field) return;
                const dd = acGetDropdown(acId);
                const rect = input.getBoundingClientRect();
                dd.style.left = rect.left + 'px';
                dd.style.top = (rect.bottom + 2) + 'px';
                dd.style.width = Math.max(rect.width, 150) + 'px';
                acFetch(field, query, (values) => acRender(dd, values, query));
            }, 150);
        }

        function acGetDropdown(acId) {
            let dd = document.getElementById('ac-dd-' + acId);
            if (!dd) {
                dd = document.createElement('div');
                dd.id = 'ac-dd-' + acId;
                dd.className = 'filter-ac-dd';
                dd.style.position = 'fixed';
                dd.style.zIndex = '10000';
                document.body.appendChild(dd);
            }
            return dd;
        }

        function acRender(dd, values, query) {
            const acId = dd.id.replace('ac-dd-', '');
            if (!values || values.length === 0) {
                dd.innerHTML = '<div class="filter-ac-item ac-disabled">No matches</div>'; return;
            }
            dd.innerHTML = values.map(v =>
                `<div class="filter-ac-item" onmousedown="event.preventDefault(); acSelect('${acId}','${v.replace(/'/g,"\\'")}')">${acHighlight(v, query)}</div>`
            ).join('');
        }

        function acSelect(acId, val) {
            const input = document.querySelector(`.filter-ac-input[data-idx="${acId}"]`);
            if (input) { input.value = val; input.dispatchEvent(new Event('change', { bubbles: true })); }
            document.querySelectorAll('[id^="ac-dd-"]').forEach(d => d.style.display = 'none');
        }

        function acHighlight(text, query) {
            if (!query) return acEscapeHtml(text);
            const idx = text.toLowerCase().indexOf(query.toLowerCase());
            if (idx === -1) return acEscapeHtml(text);
            return acEscapeHtml(text.slice(0,idx)) + '<strong>' + acEscapeHtml(text.slice(idx, idx+query.length)) + '</strong>' + acEscapeHtml(text.slice(idx+query.length));
        }

        function acEscapeHtml(str) {
            if (typeof str !== 'string') return str;
            return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.filter-ac-wrap') && !e.target.closest('.filter-ac-dd')) {
                document.querySelectorAll('[id^="ac-dd-"]').forEach(d => d.style.display = 'none');
            }
        });

        function applyAdvancedFilters() {
            const groups = document.querySelectorAll('#adv-filter-rows .filter-group');
            const newGroups = [];
            for (let gi = 0; gi < groups.length; gi++) {
                const modeSelect = groups[gi].querySelector('select[onchange*="setGroupMode"]');
                const groupMode = modeSelect ? modeSelect.value : 'and';
                const filters = [];
                const rows = groups[gi].querySelectorAll('.filter-row');
                for (let fi = 0; fi < rows.length; fi++) {
                    const selects = rows[fi].querySelectorAll('select');
                    if (!selects || selects.length < 2) continue;
                    const field = selects[0].value;
                    const op = selects[1].value;
                    if (!field) continue;
                    const f = { field, op, value: '' };
                    const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
                    const fieldType = fieldMeta ? fieldMeta.type : 'string';
                    const valContainer = rows[fi].querySelector('.filter-value-container');
                    if (valContainer) {
                        if (op === 'is_empty' || op === 'is_not_empty') {}
                        else if (fieldType === 'enum' && (op === 'in' || op === 'not_in')) {
                            const cbs = valContainer.querySelectorAll('input[type="checkbox"]:checked');
                            f.values = Array.from(cbs).map(cb => cb.value);
                        } else if (op === 'between') {
                            const inputs = valContainer.querySelectorAll('input');
                            const minVal = parseInt(inputs[0]?.value);
                            const maxVal = parseInt(inputs[1]?.value);
                            if (!isNaN(minVal)) f.min = minVal;
                            if (!isNaN(maxVal)) f.max = maxVal;
                        } else {
                            const input = valContainer.querySelector('input, select');
                            if (input) f.value = input.value;
                        }
                    }
                    filters.push(f);
                }
                if (filters.length > 0) newGroups.push({ group_mode: groupMode, filters });
            }
            consolidatedFilterGroups = newGroups.length > 0 ? newGroups : [{ group_mode: 'and', filters: [] }];
            consolidatedFilterMode = document.getElementById('adv-filter-mode').value;
            closeModal('advanced-filter-modal');
            updateFilterBadges();
            loadConsolidated(1);
        }

        function cancelAdvancedFilters() {
            consolidatedFilterGroups = consolidatedFilterGroupsBackup.length > 0 ? consolidatedFilterGroupsBackup : [{ group_mode: 'and', filters: [] }];
            closeModal('advanced-filter-modal');
        }

        function clearAdvancedFilters() {
            consolidatedFilterGroups = [{ group_mode: 'and', filters: [] }];
            consolidatedFilterMode = 'and';
            document.getElementById('adv-filter-mode').value = 'and';
            renderAllFilterGroups();
            updateFilterBadges();
            closeModal('advanced-filter-modal');
            loadConsolidated(1);
        }

        function updateFilterBadges() {
            const container = document.getElementById('consolidated-filter-badges');
            if (!container) return;
            const flatCount = consolidatedFilterGroups.reduce((sum,g) => sum + g.filters.filter(f => f.field).length, 0);
            if (flatCount === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }
            container.style.display = 'flex';
            let html = '';
            for (let gi = 0; gi < consolidatedFilterGroups.length; gi++) {
                const g = consolidatedFilterGroups[gi];
                const hasFilters = g.filters.some(f => f.field);
                if (!hasFilters) continue;
                let groupHtml = '';
                let badgeIdx = 0;
                for (let fi = 0; fi < g.filters.length; fi++) {
                    const f = g.filters[fi];
                    if (!f.field) continue;
                    const fieldLabel = FILTER_FIELD_LABELS[f.field] || f.field;
                    const opLabel = FILTER_OP_LABELS[f.op] || f.op;
                    let valLabel = '';
                    if (f.op === 'is_empty') valLabel = '(empty)';
                    else if (f.op === 'is_not_empty') valLabel = '(not empty)';
                    else if (f.op === 'between') valLabel = `${f.min||''} - ${f.max||''}`;
                    else if (f.op === 'in' || f.op === 'not_in') valLabel = (f.values||[]).join(', ');
                    else valLabel = f.value;
                    groupHtml += `<span class="filter-badge" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;font-size:0.75rem;margin:2px;">
                        <strong>${fieldLabel}</strong> ${opLabel} <span style="color:var(--accent);">${valLabel}</span>
                        <span class="filter-badge-remove" onclick="removeFilterBadge(${gi},${fi})" style="cursor:pointer;color:var(--text-muted);font-size:0.8rem;line-height:1;margin-left:2px;">&times;</span>
                    </span>`;
                    badgeIdx++;
                }
                if (groupHtml) {
                    if (html) html += `<span style="font-size:0.75rem;color:var(--accent);margin:0 4px;font-weight:600;">${consolidatedFilterMode.toUpperCase()}</span>`;
                    html += `<span style="display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border:1px dashed var(--border);border-radius:4px;margin:2px;">
                        <span style="font-size:0.65rem;color:var(--text-muted);margin-right:4px;">G${gi+1} ${g.group_mode.toUpperCase()}</span>${groupHtml}</span>`;
                }
            }
            html += `<span class="filter-badge-clear" onclick="clearAdvancedFilters()" style="cursor:pointer;color:var(--danger);font-size:0.75rem;margin-left:6px;">Clear all</span>`;
            container.innerHTML = html;
        }

        function removeFilterBadge(gi, fi) {
            if (consolidatedFilterGroups[gi]) {
                consolidatedFilterGroups[gi].filters.splice(fi, 1);
            }
            updateFilterBadges();
            loadConsolidated(1);
        }


        function toggleConsolidatedSelect(key, checked) {
            if (checked) consolidatedSelected.add(key); else consolidatedSelected.delete(key);
            updateConsolidatedBulkBtn();
        }

        function toggleConsolidatedSelectAll(checked) {
            const ports = (consolidatedPortsData.ports || []);
            if (checked) ports.forEach(p => consolidatedSelected.add(p.ip + '|' + p.port + '|' + p.protocol));
            else consolidatedSelected.clear();
            updateConsolidatedBulkBtn();
            // Update individual checkboxes
            document.querySelectorAll('#cports-table .cons-cb').forEach(cb => cb.checked = checked);
        }

        function updateConsolidatedBulkBtn() {
            const btn = document.getElementById('consolidated-bulk-delete-btn');
            const count = document.getElementById('consolidated-bulk-count');
            if (!btn) return;
            if (consolidatedSelected.size > 0) {
                btn.style.display = '';
                count.textContent = '(' + consolidatedSelected.size + ')';
            } else {
                btn.style.display = 'none';
            }
        }

        function renderConsolidatedPorts() {
            const d = consolidatedPortsData;
            const container = document.getElementById('cports-table');
            const ports = consolidatedGroupMode && consolidatedAllPorts ? consolidatedAllPorts : (d.ports || []);
            if (!d || d.ports.length === 0) {
                consolidatedSelected.clear();
                updateConsolidatedBulkBtn();
            }
            if (consolidatedGroupMode) {
                if (!consolidatedAllPorts) {
                    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>Loading all data for group view...</p></div>';
                    return;
                }
                renderConsolidatedPortsGrouped(container, ports);
                return;
            }
            let html = '<table><thead><tr>';
            html += '<th style="width:36px"><input type="checkbox" onchange="toggleConsolidatedSelectAll(this.checked)" title="Select all"></th>';
            html += '<th>IP</th><th>MAC</th><th>Hostname</th><th>OS</th><th>Status</th><th>Port</th><th>Proto</th><th>State</th><th>Service</th><th>Version</th><th>Product</th><th>Extra</th><th>Changes</th><th>Last Seen</th><th>Note</th><th class="sticky-right-2">NSE</th><th class="sticky-right"></th>';
            html += '</tr></thead><tbody>';
            for (const p of ports) {
                const key = p.ip + '|' + p.port + '|' + p.protocol;
                const histBtn = '<button class="btn btn-secondary btn-sm btn-history" onclick="event.stopPropagation();openPortHistory(\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View scan history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>';
                const nseScripts = getPortNSEScripts(p.ip, p.port, p.protocol);
                const nseBtn = nseScripts.length > 0 ? '<button class="btn btn-secondary btn-sm btn-nse" onclick="event.stopPropagation();toggleNSERow(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View NSE scripts"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><span class="nse-count">' + nseScripts.length + '</span></button>' : '<span style="color:var(--text-muted);font-size:0.7rem;">-</span>';
                const checked = consolidatedSelected.has(key) ? 'checked' : '';
                html += '<tr data-ip="' + esc(p.ip) + '" data-port="' + p.port + '" data-proto="' + esc(p.protocol) + '">';
                html += '<td><input type="checkbox" class="cons-cb" data-key="' + esc(key) + '" ' + checked + ' onchange="toggleConsolidatedSelect(\'' + esc(key) + '\', this.checked)"></td>';
                html += '<td class="mono">' + esc(p.ip) + '</td>';
                html += '<td class="mono editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'mac\',\'' + esc(p.mac || '') + '\')">' + (esc(p.mac) || '-') + getHostEditRevertHtml(p.ip) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'hostname\',\'' + esc(p.hostname || '') + '\')">' + (esc(p.hostname) || '-') + getHostEditRevertHtml(p.ip) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'os\',\'' + esc(p.os || '') + '\')">' + (esc(p.os) || '-') + getHostEditRevertHtml(p.ip) + '</td>';
                html += '<td>' + stateBadge(p.host_status) + '</td>';
                html += '<td>' + p.port + '</td>';
                html += '<td>' + esc(p.protocol) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'state\',\'' + esc(p.state) + '\')">' + stateBadge(p.state) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'service\',\'' + esc(p.service || '') + '\')">' + (esc(p.service) || '-') + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'version\',\'' + esc(p.version || '') + '\')">' + (esc(p.version) || '-') + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'product\',\'' + esc(p.product || '') + '\')">' + (esc(p.product) || '-') + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'extra_info\',\'' + esc(p.extra_info || '') + '\')" title="' + esc(p.extra_info || '') + '">' + (esc(p.extra_info) || '-') + '</td>';
                html += '<td style="text-align:center;">' + p.change_count + '</td>';
                html += '<td>' + formatDate(p.last_seen) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'note\',\'' + esc(p.note_preview || '') + '\')" title="' + esc(p.note_preview || '') + '">' + (esc(p.note_preview) || '-') + '</td>';
                html += '<td class="sticky-right-2">' + nseBtn + '</td>';
                html += '<td class="sticky-right">' + histBtn + '</td>';
                html += '</tr>';
                if (nseScripts.length > 0) {
                    html += '<tr class="nse-row" style="display:none;" data-parent-ip="' + esc(p.ip) + '" data-parent-port="' + p.port + '" data-parent-proto="' + esc(p.protocol) + '">';
                    html += '<td colspan="18"><div class="nse-content">';
                    for (const s of nseScripts) {
                        html += '<div class="nse-item"><div class="nse-left"><span class="nse-id">' + esc(s.script_id) + '</span><pre class="nse-output">' + esc(s.output) + '</pre></div><span class="nse-eye" onclick="showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View full output"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span></div>';
                    }
                    html += '</div></td></tr>';
                }
            }
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        function renderPaginationControls() {
            const d = consolidatedPortsData;
            const container = document.getElementById('cports-pagination');
            if (!container) return;
            if (!d || !d.ports || d.total === 0) {
                container.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(d.total / d.limit);
            const currentPage = d.page;
            const limitSelect = document.getElementById('consolidated-limit');
            if (limitSelect && limitSelect.value !== String(d.limit)) {
                const opts = ['10','25','50','100','200','500','100000'];
                const closest = opts.reduce((a, b) => Math.abs(b - d.limit) < Math.abs(a - d.limit) ? b : a);
                limitSelect.value = String(d.limit);
            }
            let html = '<div class="pagination">';
            html += '<span class="pagination-info">Showing ' + ((currentPage - 1) * d.limit + 1) + '-' + Math.min(currentPage * d.limit, d.total) + ' of ' + d.total + '</span>';
            if (currentPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(' + (currentPage - 1) + ')">&laquo; Prev</button>';
            }
            const maxButtons = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            if (endPage - startPage + 1 < maxButtons) {
                startPage = Math.max(1, endPage - maxButtons + 1);
            }
            if (startPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(1)">1</button>';
                if (startPage > 2) html += '<span class="pagination-dots">...</span>';
            }
            for (let i = startPage; i <= endPage; i++) {
                html += '<button class="btn btn-sm ' + (i === currentPage ? 'btn-primary' : 'btn-secondary') + '" onclick="loadConsolidated(' + i + ')">' + i + '</button>';
            }
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += '<span class="pagination-dots">...</span>';
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(' + totalPages + ')">' + totalPages + '</button>';
            }
            if (currentPage < totalPages) {
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(' + (currentPage + 1) + ')">Next &raquo;</button>';
            }
            html += '</div>';
            container.innerHTML = html;
        }

        let consolidatedAllPorts = null;

        function toggleConsolidatedGroup() {
            consolidatedGroupMode = !consolidatedGroupMode;
            const btn = document.getElementById('consolidated-group-btn');
            if (btn) { btn.classList.toggle('btn-primary', consolidatedGroupMode); btn.classList.toggle('btn-secondary', !consolidatedGroupMode); }
            if (consolidatedGroupMode) {
                fetchAllConsolidated().then(() => renderConsolidatedPorts());
            } else {
                consolidatedAllPorts = null;
                renderConsolidatedPorts();
            }
        }

        async function fetchAllConsolidated() {
            try {
                const q = document.getElementById('consolidated-search')?.value || '';
                const state = document.getElementById('consolidated-filter-state')?.value || '';
                const service = document.getElementById('consolidated-filter-service')?.value || '';
                const activeGroups = consolidatedFilterGroups.map(g => ({
                    group_mode: g.group_mode || 'and',
                    filters: (g.filters || []).filter(f => f.field)
                })).filter(g => g.filters.length > 0);
                const hasFilters = activeGroups.length > 0;
                let res;
                if (hasFilters) {
                    const body = { page: 1, limit: 100000, search: q || undefined, filter_mode: consolidatedFilterMode || 'and', groups: activeGroups };
                    res = await fetch(`/api/projects/${projectId}/consolidated/ports/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                } else {
                    let url = `/api/projects/${projectId}/consolidated/ports?page=1&limit=100000&q=${encodeURIComponent(q)}`;
                    if (state) url += `&state=${encodeURIComponent(state)}`;
                    if (service) url += `&service=${encodeURIComponent(service)}`;
                    res = await fetch(url);
                }
                const raw = await res.json();
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.error || JSON.stringify(raw)}`);
                consolidatedAllPorts = Array.isArray(raw) ? raw : (raw.ports || []);
            } catch (e) {
                showToast('Error loading all data: ' + e.message, 'error');
                consolidatedAllPorts = null;
            }
        }

        function toggleConsolidatedHostGroup(header) {
            const key = header.getAttribute('data-key');
            const rows = document.querySelectorAll('#cports-table tr[data-group-key="' + key + '"]:not(.nse-row)');
            const nseRows = document.querySelectorAll('#cports-table tr.nse-row[data-group-key="' + key + '"]');
            const arrow = header.querySelector('.group-arrow');
            const isOpen = arrow && arrow.classList.contains('open');
            rows.forEach(r => r.style.display = isOpen ? 'none' : '');
            if (!isOpen) nseRows.forEach(r => r.style.display = 'none');
            if (arrow) arrow.classList.toggle('open', !isOpen);
        }

        function selectConsolidatedHostGroup(header, checked) {
            const ip = header.getAttribute('data-key');
            const src = consolidatedGroupMode && consolidatedAllPorts ? consolidatedAllPorts : (consolidatedPortsData.ports || []);
            const hostPorts = src.filter(p => p.ip === ip);
            for (const p of hostPorts) {
                const key = p.ip + '|' + p.port + '|' + p.protocol;
                if (checked) consolidatedSelected.add(key); else consolidatedSelected.delete(key);
            }
            const rows = document.querySelectorAll('#cports-table tr[data-group-key="' + esc(ip) + '"]');
            rows.forEach(r => {
                const cb = r.querySelector('.cons-cb');
                if (cb) cb.checked = checked;
            });
            updateConsolidatedBulkBtn();
        }

        function renderConsolidatedPortsGrouped(container, ports) {
            // Group ports by IP
            const groups = {};
            for (const p of ports) {
                if (!groups[p.ip]) groups[p.ip] = [];
                groups[p.ip].push(p);
            }
            const sortedIPs = Object.keys(groups).sort((a, b) => {
                const pa = a.split('.').map(Number);
                const pb = b.split('.').map(Number);
                for (let i = 0; i < 4; i++) {
                    if (pa[i] !== pb[i]) return pa[i] - pb[i];
                }
                return 0;
            });

            const nCols = 18; // checkbox + 17 data columns
            let html = '<table><thead><tr>';
            html += '<th style="width:36px"><input type="checkbox" onchange="toggleConsolidatedSelectAll(this.checked)" title="Select all"></th>';
            html += '<th>IP</th><th>MAC</th><th>Hostname</th><th>OS</th><th>Status</th><th>Port</th><th>Proto</th><th>State</th><th>Service</th><th>Version</th><th>Product</th><th>Extra</th><th>Changes</th><th>Last Seen</th><th>Note</th><th class="sticky-right-2">NSE</th><th class="sticky-right"></th>';
            html += '</tr></thead><tbody>';

            for (const ip of sortedIPs) {
                const hostPorts = groups[ip];
                const first = hostPorts[0];
                const key = ip;
                const hostChecked = hostPorts.every(p => consolidatedSelected.has(p.ip + '|' + p.port + '|' + p.protocol));

                // Group header row
                html += '<tr class="group-header" data-key="' + esc(key) + '" onclick="toggleConsolidatedHostGroup(this)">';
                html += '<td onclick="event.stopPropagation();"><input type="checkbox" class="cons-cb" ' + (hostChecked ? 'checked' : '') + ' onchange="selectConsolidatedHostGroup(this.closest(\'tr\'), this.checked)"></td>';
                html += '<td class="mono"><span class="group-arrow">&#9654;</span>' + esc(ip) + '</td>';
                html += '<td class="mono">' + (esc(first.mac) || '-') + '</td>';
                html += '<td>' + (esc(first.hostname) || '-') + '</td>';
                html += '<td>' + (esc(first.os) || '-') + '</td>';
                html += '<td>' + stateBadge(first.host_status) + '</td>';
                html += '<td colspan="12"><span class="badge badge-hosts">' + hostPorts.length + ' port' + (hostPorts.length > 1 ? 's' : '') + '</span></td>';
                html += '</tr>';

                // Sub-rows (hidden by default)
                for (const p of hostPorts) {
                    const pkey = p.ip + '|' + p.port + '|' + p.protocol;
                    const histBtn = '<button class="btn btn-secondary btn-sm btn-history" onclick="event.stopPropagation();openPortHistory(\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View scan history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>';
                    const nseScripts = getPortNSEScripts(p.ip, p.port, p.protocol);
const nseBtn = nseScripts.length > 0 ? '<button class="btn btn-secondary btn-sm btn-nse" onclick="event.stopPropagation();toggleNSERow(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View NSE scripts" style="display:inline-flex;align-items:center;gap:2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg><span class="nse-count">' + nseScripts.length + '</span></button>' : '<span style="color:var(--text-muted);font-size:0.7rem;">-</span>';
                    const checked = consolidatedSelected.has(pkey) ? 'checked' : '';
                    html += '<tr data-group-key="' + esc(key) + '" style="display:none;" data-ip="' + esc(p.ip) + '" data-port="' + p.port + '" data-proto="' + esc(p.protocol) + '">';
                    html += '<td><input type="checkbox" class="cons-cb" data-key="' + esc(pkey) + '" ' + checked + ' onchange="toggleConsolidatedSelect(\'' + esc(pkey) + '\', this.checked)"></td>';
                    html += '<td class="mono" style="opacity:0.4;">' + esc(p.ip) + '</td>';
                    html += '<td class="mono" style="opacity:0.4;">-</td>';
                    html += '<td style="opacity:0.4;">-</td>';
                    html += '<td style="opacity:0.4;">-</td>';
                    html += '<td style="opacity:0.4;">-</td>';
                    html += '<td>' + p.port + '</td>';
                    html += '<td>' + esc(p.protocol) + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'state\',\'' + esc(p.state) + '\')">' + stateBadge(p.state) + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'service\',\'' + esc(p.service || '') + '\')">' + (esc(p.service) || '-') + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'version\',\'' + esc(p.version || '') + '\')">' + (esc(p.version) || '-') + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'product\',\'' + esc(p.product || '') + '\')">' + (esc(p.product) || '-') + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'extra_info\',\'' + esc(p.extra_info || '') + '\')" title="' + esc(p.extra_info || '') + '">' + (esc(p.extra_info) || '-') + '</td>';
                    html += '<td style="text-align:center;">' + p.change_count + '</td>';
                    html += '<td>' + formatDate(p.last_seen) + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'note\',\'' + esc(p.note_preview || '') + '\')" title="' + esc(p.note_preview || '') + '">' + (esc(p.note_preview) || '-') + '</td>';
                    html += '<td class="sticky-right-2">' + nseBtn + '</td>';
                    html += '<td class="sticky-right">' + histBtn + '</td>';
                    html += '</tr>';
                    if (nseScripts.length > 0) {
                        html += '<tr class="nse-row" style="display:none;" data-group-key="' + esc(key) + '" data-parent-ip="' + esc(p.ip) + '" data-parent-port="' + p.port + '" data-parent-proto="' + esc(p.protocol) + '">';
                        html += '<td colspan="' + nCols + '"><div class="nse-content">';
                        for (const s of nseScripts) {
                            html += '<div class="nse-item"><div class="nse-left"><span class="nse-id">' + esc(s.script_id) + '</span><pre class="nse-output">' + esc(s.output) + '</pre></div><span class="nse-eye" onclick="showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View full output"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span></div>';
                        }
                        html += '</div></td></tr>';
                    }
                }
            }
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        async function openPortNote(ip, port, protocol) {
            const mid = 'port-note-modal';
            const old = document.getElementById(mid);
            if (old) old.remove();
            const label = esc(ip) + ':' + port + '/' + esc(protocol || 'tcp');
            let noteText = '';
            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/notes?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`);
                const data = await res.json();
                noteText = data.note || '';
            } catch (e) {}
            const body = '<div style="margin-bottom:15px;">' +
                '<label style="display:block;margin-bottom:6px;color:var(--text-muted);font-size:0.85rem;">Port: <strong>' + label + '</strong></label>' +
                '<textarea id="port-note-textarea" class="form-control" style="min-height:100px;resize:vertical;" placeholder="Enter note for this port...">' + esc(noteText) + '</textarea></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button class="btn btn-secondary" id="port-note-delete" style="margin-right:auto;">Delete</button> ' +
                '<button class="btn btn-secondary" id="port-note-cancel">Cancel</button> ' +
                '<button class="btn btn-primary" id="port-note-save">Save</button></div>';
            const modal = showModal(mid, 'Port Note', body, 'modal-small');
            const ta = modal.querySelector('#port-note-textarea');
            modal.querySelector('#port-note-save').addEventListener('click', async function() {
                const note = ta.value.trim();
                try {
                    await fetch(`/api/projects/${projectId}/consolidated/notes/set`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ip, port, protocol, note })
                    });
                    showToast(note ? 'Note saved' : 'Note cleared');
                    closeModal(mid);
                } catch (e) {
                    showToast('Error saving note: ' + e.message, 'error');
                }
            });
            modal.querySelector('#port-note-delete').addEventListener('click', async function() {
                try {
                    await fetch(`/api/projects/${projectId}/consolidated/notes/delete?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`, { method: 'DELETE' });
                    showToast('Note deleted');
                    closeModal(mid);
                } catch (e) {
                    showToast('Error: ' + e.message, 'error');
                }
            });
            modal.querySelector('#port-note-cancel').addEventListener('click', function() { closeModal(mid); });
        }

        async function editConsolidatedCell(cell, ip, port, protocol, field, original) {
            if (cell.querySelector('input')) return;
            const current = cell.textContent.trim() === '-' ? '' : cell.textContent.trim();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = current;
            input.className = 'form-control';
            input.style.fontSize = '0.85rem';
            input.style.padding = '4px 6px';
            cell.textContent = '';
            cell.appendChild(input);
            input.focus();
            input.select();

            const save = async () => {
                const newVal = input.value.trim();
                if (newVal !== current) {
                    try {
                        await fetch(`/api/projects/${projectId}/consolidated/ports/update`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ip, port, protocol, field, value: newVal })
                        });
                        if (field === 'mac' || field === 'hostname' || field === 'os') {
                            await loadConsolidated(1);
                            await loadHostEdits(ip);
                            renderConsolidatedPorts();
                        } else {
                            cell.textContent = newVal || '-';
                        }
                        showToast('Updated');
                    } catch (e) {
                        cell.textContent = current || '-';
                        showToast('Update failed: ' + e.message, 'error');
                    }
                } else {
                    cell.textContent = current || '-';
                }
            };

            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') { cell.textContent = current || '-'; }
            });
        }

        async function revertEdit(editId, ip, port, protocol) {
            if (!confirm('Revert this manual edit?')) return;
            try {
                await fetch(`/api/projects/${projectId}/consolidated/ports/edits/${editId}/revert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, port, protocol })
                });
                showToast('Edit reverted');
                await loadHostEdits(ip);
                renderConsolidatedPorts();
            } catch (e) {
                showToast('Revert failed: ' + e.message, 'error');
            }
        }

        async function applyEdit(editId, ip, port, protocol) {
            if (!confirm('Re-apply this manual edit?')) return;
            try {
                await fetch(`/api/projects/${projectId}/consolidated/ports/edits/${editId}/apply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, port, protocol })
                });
                showToast('Edit re-applied');
                await loadConsolidated(1);
                openPortHistory(ip, port, protocol);
            } catch (e) {
                showToast('Re-apply failed: ' + e.message, 'error');
            }
        }

        async function revertHostEdit(editId, ip) {
            try {
                await fetch(`/api/projects/${projectId}/consolidated/hosts/edits/${editId}/revert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip })
                });
                showToast('Reverted');
                await loadConsolidated(1);
                await loadHostEdits(ip);
                renderConsolidatedPorts();
            } catch (e) {
                showToast('Revert failed: ' + e.message, 'error');
            }
        }

        function safeLower(s) { return (s || '').toString().toLowerCase(); }

        async function bulkDeleteConsolidatedPorts() {
            const items = [...consolidatedSelected];
            if (items.length === 0) return;
            const mid = 'confirm-bulk-del-consolidated';
            const old = document.getElementById(mid);
            if (old) old.remove();
            const label = items.length + ' port' + (items.length > 1 ? 's' : '');
            const body = '<p style="margin-bottom:15px;color:var(--text-muted);">Delete ' + label + ' from consolidated assets?</p>' +
                '<div style="max-height:200px;overflow-y:auto;margin-bottom:15px;font-size:0.8rem;color:var(--text-muted);">' +
                items.map(k => '<div>' + esc(k.replace(/\|/g, ':')) + '</div>').join('') + '</div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button class="btn btn-secondary" id="bulk-del-cons-cancel">Cancel</button> ' +
                '<button class="btn btn-danger" id="bulk-del-cons-ok">Delete ' + label + '</button></div>';
            const modal = showModal(mid, 'Bulk Delete', body, 'modal-small');
            modal.querySelector('#bulk-del-cons-ok').addEventListener('click', async function() {
                closeModal(mid);
                try {
                    const payload = items.map(k => {
                        const parts = k.split('|');
                        return { ip: parts[0], port: parseInt(parts[1]), protocol: parts[2] };
                    });
                    await fetch(`/api/projects/${projectId}/consolidated/ports/bulk-delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ports: payload })
                    });
                    showToast(label + ' deleted');
                    consolidatedSelected.clear();
                    await loadConsolidated(1);
                } catch (e) {
                    showToast('Error: ' + e.message, 'error');
                }
            });
            modal.querySelector('#bulk-del-cons-cancel').addEventListener('click', function() { closeModal(mid); });
        }

        function filterAssets() {
            loadConsolidated(1);
        }

        function clearConsolidatedSearch() {
            document.getElementById('consolidated-search').value = '';
            document.getElementById('consolidated-search-clear').style.display = 'none';
            loadConsolidated(1);
        }

        function toggleAssetExportDropdown(e) {
            e.stopPropagation();
            const dd = document.getElementById('asset-export-dropdown');
            const isOpen = dd.style.display !== 'none';
            dd.style.display = isOpen ? 'none' : '';
            if (!isOpen) {
                setTimeout(() => document.addEventListener('click', closeAssetExportDropdown, { once: true }), 0);
            }
        }
        function closeAssetExportDropdown() { document.getElementById('asset-export-dropdown').style.display = 'none'; }
        function exportAsset(fmt) {
            closeAssetExportDropdown();
            window.location.href = `/api/projects/${projectId}/consolidated/export/${fmt}`;
        }

        function copyConsolidatedIPs() {
            const ports = consolidatedPortsData.ports || [];
            const ips = [...new Set(ports.map(p => p.ip))];
            if (ips.length === 0) { showToast('No IPs to copy', 'error'); return; }
            const text = ips.join(',');
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            });
        }

        // Scripts Tab

        let scriptsFiltered = [];
        let scriptsCurrentPage = 1;
        let scriptsPerPage = 50;
        let scriptGroupMode = 'flat';
        let scriptSortField = '';
        let scriptSortDir = 'asc';

        function loadScriptsTab() {
            scriptsCurrentPage = 1;
            loadConsolidatedScripts(1, 100000).then(() => {
                populateScriptFilter();
                populateScriptServiceFilter();
                applyScriptFilters();
            }).catch(() => {
                document.getElementById('scripts-table').innerHTML = '<div class="empty-state"><h3>No scripts</h3><p>No NSE scripts found</p></div>';
            });
        }

        function sortScriptsData() {
            if (!scriptSortField) return;
            scriptsFiltered.sort((a, b) => {
                let va = a[scriptSortField], vb = b[scriptSortField];
                if (typeof va === 'string') va = va.toLowerCase();
                if (typeof vb === 'string') vb = vb.toLowerCase();
                if (scriptSortField === 'port') { va = Number(va); vb = Number(vb); }
                if (va < vb) return scriptSortDir === 'asc' ? -1 : 1;
                if (va > vb) return scriptSortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        function applyScriptFilters() {
            const sid = document.getElementById('script-filter').value;
            const stateVal = document.getElementById('script-filter-state').value;
            const protoVal = document.getElementById('script-filter-proto').value;
            const svcVal = document.getElementById('script-filter-service').value;
            const q = document.getElementById('script-search-tab')?.value?.toLowerCase() || '';
            scriptsFiltered = (consolidatedScriptsData.scripts || []).filter(s => {
                if (sid && s.script_id !== sid) return false;
                if (stateVal && s.state !== stateVal) return false;
                if (protoVal && s.protocol !== protoVal) return false;
                if (svcVal && (s.service || '') !== svcVal) return false;
                if (q) {
                    return safeLower(s.ip).includes(q) ||
                           safeLower(s.script_id).includes(q) ||
                           safeLower(s.output).includes(q) ||
                           safeLower(s.service).includes(q) ||
                           String(s.port).includes(q);
                }
                return true;
            });
            sortScriptsData();
            scriptsCurrentPage = 1;
            renderScriptsPage();
            renderScriptPagination();
        }

        function sortScripts(field) {
            if (scriptSortField === field) {
                scriptSortDir = scriptSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                scriptSortField = field;
                scriptSortDir = 'asc';
            }
            sortScriptsData();
            renderScriptsPage();
            renderScriptPagination();
        }

        function scriptSortArrow(field) {
            if (scriptSortField !== field) return '';
            return scriptSortDir === 'asc' ? ' \u25B2' : ' \u25BC';
        }

        function renderScriptsPage() {
            if (scriptGroupMode !== 'flat') {
                renderScriptsGrouped();
                return;
            }
            const start = (scriptsCurrentPage - 1) * scriptsPerPage;
            const end = Math.min(start + scriptsPerPage, scriptsFiltered.length);
            const pageData = scriptsFiltered.slice(start, end);
            const container = document.getElementById('scripts-table');
            if (pageData.length === 0) {
                container.innerHTML = '<div class="empty-state"><h3>No results</h3><p>No scripts match the current filter</p></div>';
                return;
            }
            let html = '<table><thead><tr>';
            html += '<th onclick="sortScripts(\'ip\')" style="cursor:pointer;">IP' + scriptSortArrow('ip') + '</th>';
            html += '<th onclick="sortScripts(\'port\')" style="cursor:pointer;">Port' + scriptSortArrow('port') + '</th>';
            html += '<th onclick="sortScripts(\'protocol\')" style="cursor:pointer;">Proto' + scriptSortArrow('protocol') + '</th>';
            html += '<th onclick="sortScripts(\'service\')" style="cursor:pointer;">Service' + scriptSortArrow('service') + '</th>';
            html += '<th onclick="sortScripts(\'state\')" style="cursor:pointer;">State' + scriptSortArrow('state') + '</th>';
            html += '<th>Extra</th>';
            html += '<th onclick="sortScripts(\'script_id\')" style="cursor:pointer;">Script ID' + scriptSortArrow('script_id') + '</th>';
            html += '<th>Output</th><th></th>';
            html += '</tr></thead><tbody>';
            for (const s of pageData) {
                const key = esc(s.script_id) + '-' + esc(s.ip) + '-' + s.port;
                html += '<tr style="cursor:pointer;" onclick="toggleScriptExpand(this)" data-key="' + key + '">';
                html += '<td class="mono">' + esc(s.ip) + '</td>';
                html += '<td>' + s.port + '</td>';
                html += '<td>' + esc(s.protocol) + '</td>';
                html += '<td>' + (esc(s.service) || '-') + '</td>';
                html += '<td>' + stateBadge(s.state) + '</td>';
                html += '<td title="' + esc(s.extra_info || '') + '">' + (esc(s.extra_info) || '-') + '</td>';
                html += '<td><span class="nse-id" style="font-family:var(--font-mono);color:var(--cyan);font-size:0.85rem;">' + esc(s.script_id) + '</span></td>';
                html += '<td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><pre style="margin:0;font-size:0.75rem;color:var(--text-muted);">' + esc(s.output).substring(0, 120) + (s.output.length > 120 ? '...' : '') + '</pre></td>';
                html += '<td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View output"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
                html += ' <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();goToConsolidatedPort(\'' + esc(s.ip) + '\',' + s.port + ')" title="View in Assets"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></td>';
                html += '</tr>';
                html += '<tr class="script-expand-row" style="display:none;" data-key="' + key + '"><td colspan="9"><div style="padding:8px;"><pre style="white-space:pre-wrap;font-size:0.75rem;background:var(--bg-input);padding:8px;border-radius:4px;margin:0;max-height:300px;overflow-y:auto;">' + esc(s.output) + '</pre></div></td></tr>';
            }
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        function goToConsolidatedPort(ip, port) {
            showTab('consolidated', document.querySelector('.sidebar-btn[data-tab="consolidated"]'));
            const search = document.getElementById('consolidated-search');
            if (search) { search.value = ''; document.getElementById('consolidated-search-clear').style.display = 'none'; }
            document.getElementById('consolidated-filter-state').value = '';
            document.getElementById('consolidated-filter-service').value = '';
            consolidatedFilterGroups = [{ group_mode: 'and', filters: [
                { field: 'ip', op: 'eq', value: ip },
                { field: 'port', op: 'eq', value: String(port) }
            ]}];
            updateFilterBadges();
            loadConsolidated(1);
        }

        function toggleScriptGroup(mode) {
            scriptGroupMode = mode;
            const groupBtns = document.querySelectorAll('#tab-scripts .btn-group [data-mode]');
            groupBtns.forEach(b => {
                b.classList.toggle('btn-primary', b.dataset.mode === mode);
                b.classList.toggle('btn-secondary', b.dataset.mode !== mode);
            });
            renderScriptsPage();
            renderScriptPagination();
        }

        function renderScriptsGrouped() {
            const container = document.getElementById('scripts-table');
            if (scriptsFiltered.length === 0) {
                container.innerHTML = '<div class="empty-state"><h3>No results</h3><p>No scripts match the current filter</p></div>';
                return;
            }
            const groupField = scriptGroupMode === 'script' ? 'script_id' : 'ip';
            const groups = {};
            for (const s of scriptsFiltered) {
                const key = s[groupField] || '(unknown)';
                if (!groups[key]) groups[key] = [];
                groups[key].push(s);
            }
            const sortedKeys = Object.keys(groups).sort();
            let html = '<table><thead><tr>';
            html += '<th>' + (groupField === 'script_id' ? 'Script ID' : 'Host') + '</th>';
            html += '<th onclick="sortScripts(\'ip\')" style="cursor:pointer;">IP' + scriptSortArrow('ip') + '</th>';
            html += '<th onclick="sortScripts(\'port\')" style="cursor:pointer;">Port' + scriptSortArrow('port') + '</th>';
            html += '<th onclick="sortScripts(\'protocol\')" style="cursor:pointer;">Proto' + scriptSortArrow('protocol') + '</th>';
            html += '<th onclick="sortScripts(\'service\')" style="cursor:pointer;">Service' + scriptSortArrow('service') + '</th>';
            html += '<th onclick="sortScripts(\'state\')" style="cursor:pointer;">State' + scriptSortArrow('state') + '</th>';
            html += '<th>Extra</th>';
            html += '<th onclick="sortScripts(\'script_id\')" style="cursor:pointer;">Script ID' + scriptSortArrow('script_id') + '</th>';
            html += '<th>Output</th><th></th>';
            html += '</tr></thead>';
            for (const gkey of sortedKeys) {
                const entries = groups[gkey].sort((a, b) => a.ip.localeCompare(b.ip) || a.port - b.port);
                const safeGkey = esc(gkey);
                html += '<tbody class="script-group" data-group="' + safeGkey + '">';
                html += '<tr class="script-group-header" onclick="toggleScriptGroupBody(this)">';
                html += '<td colspan="10"><span class="group-toggle-icon">&#9654;</span> <strong>' + safeGkey + '</strong> <span class="group-count">' + entries.length + ' ' + (entries.length === 1 ? 'entry' : 'entries') + '</span></td>';
                html += '</tr>';
                for (const s of entries) {
                    const key = esc(s.script_id) + '-' + esc(s.ip) + '-' + s.port;
                    html += '<tr class="script-group-row" style="display:none;" onclick="toggleScriptExpand(this)" data-key="' + key + '">';
                    html += '<td></td>';
                    html += '<td class="mono">' + esc(s.ip) + '</td>';
                    html += '<td>' + s.port + '</td>';
                    html += '<td>' + esc(s.protocol) + '</td>';
                    html += '<td>' + (esc(s.service) || '-') + '</td>';
                    html += '<td>' + stateBadge(s.state) + '</td>';
                    html += '<td title="' + esc(s.extra_info || '') + '">' + (esc(s.extra_info) || '-') + '</td>';
                    html += '<td><span class="nse-id" style="font-family:var(--font-mono);color:var(--cyan);font-size:0.85rem;">' + esc(s.script_id) + '</span></td>';
                    html += '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><pre style="margin:0;font-size:0.75rem;color:var(--text-muted);">' + esc(s.output).substring(0, 80) + (s.output.length > 80 ? '...' : '') + '</pre></td>';
                    html += '<td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View output"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
                    html += ' <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();goToConsolidatedPort(\'' + esc(s.ip) + '\',' + s.port + ')" title="View in Assets"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></td>';
                    html += '</tr>';
                    html += '<tr class="script-expand-row" style="display:none;" data-key="' + key + '"><td colspan="10"><div style="padding:8px;"><pre style="white-space:pre-wrap;font-size:0.75rem;background:var(--bg-input);padding:8px;border-radius:4px;margin:0;max-height:300px;overflow-y:auto;">' + esc(s.output) + '</pre></div></td></tr>';
                }
                html += '</tbody>';
            }
            html += '</table>';
            container.innerHTML = html;
        }

        function toggleScriptGroupBody(header) {
            const tbody = header.closest('tbody');
            if (!tbody) return;
            const dataRows = tbody.querySelectorAll('.script-group-row');
            if (dataRows.length === 0) return;
            const isHidden = dataRows[0].style.display === 'none';
            dataRows.forEach(r => r.style.display = isHidden ? '' : 'none');
            if (!isHidden) {
                tbody.querySelectorAll('.script-expand-row').forEach(r => r.style.display = 'none');
            }
            header.querySelector('.group-toggle-icon').innerHTML = isHidden ? '&#9660;' : '&#9654;';
        }

        function renderScriptPagination() {
            const container = document.getElementById('scripts-pagination');
            if (!container) return;
            if (scriptGroupMode !== 'flat') { container.innerHTML = ''; return; }
            if (scriptsFiltered.length === 0) {
                container.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(scriptsFiltered.length / scriptsPerPage);
            const currentPage = scriptsCurrentPage;
            let html = '<div class="pagination">';
            html += '<span class="pagination-info">Showing ' + ((currentPage - 1) * scriptsPerPage + 1) + '-' + Math.min(currentPage * scriptsPerPage, scriptsFiltered.length) + ' of ' + scriptsFiltered.length + '</span>';
            if (currentPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(' + (currentPage - 1) + ')">&laquo; Prev</button>';
            }
            const maxButtons = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);
            if (startPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(1)">1</button>';
                if (startPage > 2) html += '<span class="pagination-dots">...</span>';
            }
            for (let i = startPage; i <= endPage; i++) {
                html += '<button class="btn btn-sm ' + (i === currentPage ? 'btn-primary' : 'btn-secondary') + '" onclick="scriptsGoTo(' + i + ')">' + i + '</button>';
            }
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += '<span class="pagination-dots">...</span>';
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(' + totalPages + ')">' + totalPages + '</button>';
            }
            if (currentPage < totalPages) {
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(' + (currentPage + 1) + ')">Next &raquo;</button>';
            }
            html += '</div>';
            container.innerHTML = html;
        }

        function scriptsGoTo(page) {
            scriptsCurrentPage = page;
            renderScriptsPage();
            renderScriptPagination();
        }

        function changeScriptsLimit() {
            const sel = document.getElementById('scripts-limit');
            scriptsPerPage = parseInt(sel?.value || '50');
            scriptsCurrentPage = 1;
            renderScriptsPage();
            renderScriptPagination();
        }

        function getUniqueScriptIDs() {
            const ids = new Set();
            (consolidatedScriptsData.scripts || []).forEach(s => {
                if (s.script_id) ids.add(s.script_id);
            });
            return Array.from(ids).sort();
        }

        function populateScriptFilter() {
            const sel = document.getElementById('script-filter');
            const current = sel.value;
            sel.innerHTML = '<option value="">All Scripts</option>';
            getUniqueScriptIDs().forEach(s => {
                sel.innerHTML += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
            });
            if (current) sel.value = current;
        }

        function populateScriptServiceFilter() {
            const sel = document.getElementById('script-filter-service');
            const current = sel.value;
            const svcs = new Set();
            (consolidatedScriptsData.scripts || []).forEach(s => {
                if (s.service) svcs.add(s.service);
            });
            sel.innerHTML = '<option value="">Service</option>';
            Array.from(svcs).sort().forEach(s => {
                sel.innerHTML += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
            });
            if (current) sel.value = current;
        }

        function showScriptModal(scriptId, ip, port, output) {
            if (!output) {
                const scripts = getPortNSEScripts(ip, port, 'tcp');
                const found = scripts.find(s => s.script_id === scriptId);
                output = found ? found.output : 'No output available';
            }
            var title = scriptId + ' - ' + ip + (port ? ':' + port : '');
            var body = '<div class="script-modal-output"><pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:0.8rem;background:var(--bg-input);padding:16px;border-radius:var(--radius-card);max-height:60vh;overflow-y:auto;margin:0;">' + esc(output) + '</pre></div>';
            showModal('script-modal', title, body, 'modal-large');
        }

        function showScriptModalFromData(scriptId, ip, port) {
            const found = (consolidatedScriptsData.scripts || []).find(s => s.script_id === scriptId && s.ip === ip && s.port === port);
            const output = found ? found.output : 'No output available';
            showScriptModal(scriptId, ip, port, output);
        }

        function closeScriptModal() { closeModal('script-modal'); }

        function toggleScriptExportDropdown(e) {
            e.stopPropagation();
            const dd = document.getElementById('script-export-dropdown');
            if (!dd) return;
            const isOpen = dd.style.display !== 'none';
            dd.style.display = isOpen ? 'none' : '';
            if (!isOpen) {
                setTimeout(() => document.addEventListener('click', closeScriptExportDropdown, { once: true }), 0);
            }
        }
        function closeScriptExportDropdown() {
            const dd = document.getElementById('script-export-dropdown');
            if (dd) dd.style.display = 'none';
        }
        function exportScript(fmt) {
            closeScriptExportDropdown();
            if (fmt === 'json') {
                const data = scriptsFiltered.map(s => ({
                    ip: s.ip, port: s.port, protocol: s.protocol,
                    service: s.service, state: s.state,
                    script_id: s.script_id, output: s.output
                }));
                downloadJSON(data, 'scripts-export.json');
            } else {
                const url = `/api/projects/${projectId}/consolidated/export/scripts/${fmt}`;
                window.location.href = url;
            }
            showToast('Exporting scripts (' + fmt + ')');
        }

        function copyScriptIPs() {
            const scripts = consolidatedScriptsData.scripts || [];
            const ips = [...new Set(scripts.map(s => s.ip))];
            if (ips.length === 0) { showToast('No IPs to copy', 'error'); return; }
            const text = ips.join(',');
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            });
        }

        function toggleScriptExpand(btn) {
            const tr = btn.tagName === 'TR' ? btn : btn.closest('tr');
            const expandRow = tr.nextElementSibling;
            if (expandRow && expandRow.classList.contains('script-expand-row')) {
                expandRow.style.display = expandRow.style.display === 'none' ? '' : 'none';
            }
        }

        function downloadJSON(data, filename) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }

        async function openPortHistory(ip, port, protocol) {
            var body = '<div id="port-history-content"><div class="empty-state"><div class="spinner"></div><p>Loading history...</p></div></div>';
            showModal('port-history-modal', ip + ':' + port + '/' + protocol + ' - History', body, 'modal-large');
            var content = document.getElementById('port-history-content');

            let currentPort = (consolidatedPortsData.ports || []).find(p => p.ip === ip && p.port === port && p.protocol === protocol);
            if (!currentPort) {
                currentPort = { state: 'unknown', service: '', version: '', product: '', extra_info: '', os: '', hostname: '', mac: '' };
            }

            try {
                const [scanRes, editRes] = await Promise.all([
                    fetch(`/api/projects/${projectId}/consolidated/ports/history?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`),
                    fetch(`/api/projects/${projectId}/consolidated/ports/edits?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`)
                ]);
                const scanHistory = await scanRes.json();
                let edits = [];
                try { edits = await editRes.json(); } catch (e2) {}

                function fmt(d) { return new Date(d).toLocaleString(); }

                let html = '<div class="ph">';

                // current state
                html += '<div class="ph-current">';
                html += '<div class="ph-current-body">';
                html += stateBadge(esc(currentPort.state));
                if (currentPort.service) html += '<span class="ph-tag">' + esc(currentPort.service) + '</span>';
                if (currentPort.version) html += '<span class="ph-tag">' + esc(currentPort.version) + '</span>';
                if (currentPort.product) html += '<span class="ph-tag">' + esc(currentPort.product) + '</span>';
                if (currentPort.extra_info) html += '<span class="ph-tag">' + esc(currentPort.extra_info) + '</span>';
                html += '</div></div>';

                let hasAny = false;

                // scans
                if (scanHistory && scanHistory.length > 0) {
                    hasAny = true;
                    html += '<div class="ph-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Scan History</div>';
                    for (let i = 0; i < scanHistory.length; i++) {
                        const h = scanHistory[i];
                        const isCurrent = i === 0;
                        html += '<div class="ph-row' + (isCurrent ? ' ph-row-current' : '') + '">';
                        html += '<div class="ph-row-main">';
                        html += '<div class="ph-row-top">';
                        html += '<a href="/project/' + projectId + '/scan/' + h.scan_id + '" class="ph-link">#' + h.scan_id + '</a>';
                        html += '<span class="ph-profile">' + esc(h.profile) + '</span>';
                        if (isCurrent) html += '<span class="ph-cur-tag">Current</span>';
                        html += '<span class="ph-date">' + fmt(h.started_at) + '</span>';
                        html += '</div>';
                        html += '<div class="ph-row-mid">';
                        html += stateBadge(esc(h.state));
                        if (h.service) html += '<span class="ph-val">' + esc(h.service) + '</span>';
                        if (h.version) html += '<span class="ph-val ph-val-muted">' + esc(h.version) + '</span>';
                        if (h.product) html += '<span class="ph-val ph-val-muted">' + esc(h.product) + '</span>';
                        html += '</div></div>';
                        if (!isCurrent) {
                            html += '<button class="btn btn-secondary btn-sm" onclick="revertPort(\'' + esc(ip) + '\',' + port + ',\'' + esc(protocol) + '\',\'' + esc(h.state) + '\',\'' + esc(h.service || '') + '\',\'' + esc(h.version || '') + '\',\'' + esc(h.product || '') + '\',\'' + esc(h.extra_info || '') + '\', ' + h.scan_id + ')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Restore</button>';
                        }
                        html += '</div>';
                    }
                }

                // edits
                if (edits && edits.length > 0) {
                    hasAny = true;
                    html += '<div class="ph-title" style="margin-top:24px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Manual Edits</div>';
                    for (const e of edits) {
                        const isApplied = e.applied !== 0;
                        html += '<div class="ph-row' + (isApplied ? '' : ' ph-row-reverted') + '">';
                        html += '<div class="ph-row-main">';
                        html += '<div class="ph-row-top">';
                        html += '<span class="ph-edit-tag' + (isApplied ? '' : ' ph-edit-tag-reverted') + '">' + (isApplied ? 'Edit' : 'Reverted') + '</span>';
                        html += '<span class="ph-field">' + esc(e.field) + '</span>';
                        html += '<span class="ph-date">' + fmt(e.edited_at) + '</span>';
                        html += '</div>';
                        const oldV = esc(e.old_value) || '<span class="ph-empty">empty</span>';
                        const newV = esc(e.new_value) || '<span class="ph-empty">empty</span>';
                        html += '<div class="ph-row-mid" style="gap:0;font-size:0.85rem;color:var(--text);">';
                        html += '<span style="color:var(--text-muted);">' + oldV + '</span>';
                        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 6px;flex-shrink:0;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
                        html += '<span style="color:var(--text);font-weight:500;">' + newV + '</span>';
                        html += '</div></div>';
                        if (isApplied) {
                            html += '<button class="btn btn-secondary btn-sm" onclick="revertEdit(' + e.edit_id + ',\'' + esc(ip) + '\',' + port + ',\'' + esc(protocol) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Revert</button>';
                        } else {
                            html += '<button class="btn btn-secondary btn-sm" onclick="applyEdit(' + e.edit_id + ',\'' + esc(ip) + '\',' + port + ',\'' + esc(protocol) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Re-apply</button>';
                        }
                        html += '</div>';
                    }
                }

                if (!hasAny) html += '<div class="empty-state" style="margin-top:20px;"><p>No history found for this port</p></div>';
                html += '</div>';
                content.innerHTML = html;
            } catch (e) {
                content.innerHTML = '<div class="empty-state"><p>Error loading history: ' + esc(e.message) + '</p></div>';
            }
        }

        async function revertPort(ip, port, protocol, state, service, version, product, extraInfo, scanId) {
            if (!confirm('Use state from scan #' + scanId + ' for ' + ip + ':' + port + '?\n\nOnly this port in the consolidated table will change. Original scan data is not modified.\n\nNew state: ' + state + (service ? ', service: ' + service : ''))) return;
            try {
                await fetch(`/api/projects/${projectId}/consolidated/ports/revert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, port, protocol, state, service, version, product, extra_info: extraInfo })
                });
                showToast('Port reverted to scan #' + scanId + ' state');
                await loadConsolidated(1);
                openPortHistory(ip, port, protocol);
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        let currentConsolidatedPort = null;

        function closePortHistoryModal() { closeModal('port-history-modal'); }

        async function openHostPorts(ip) {
            var body = '<div id="host-ports-content" class="table-container"><div class="empty-state"><div class="spinner"></div><p>Loading ports...</p></div></div>';
            showModal('host-ports-modal', ip + ' - Open Ports', body, 'modal-large');
            var content = document.getElementById('host-ports-content');

            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/ports`);
                const data = await res.json();
                const ports = Array.isArray(data) ? data : (data.ports || []);
                const hostPorts = ports.filter(p => p.ip === ip);

                if (!hostPorts || hostPorts.length === 0) {
                    content.innerHTML = '<div class="empty-state"><h3>No ports found</h3><p>No consolidated port data for this host</p></div>';
                    return;
                }

                let html = '<table><thead><tr>';
                html += '<th>Port</th><th>Protocol</th><th>State</th><th>Service</th><th>Version</th><th>Product</th><th>Changes</th><th>Last Seen</th><th></th>';
                html += '</tr></thead><tbody>';
                for (const p of hostPorts) {
                    const histBtn = '<button class="btn btn-secondary btn-sm btn-history" onclick="event.stopPropagation();closeHostPortsModal();openPortHistory(\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View scan history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>';
                    html += '<tr>';
                    html += '<td class="mono">' + p.port + '</td>';
                    html += '<td>' + esc(p.protocol) + '</td>';
                    html += '<td>' + stateBadge(p.state) + '</td>';
                    html += '<td>' + (esc(p.service) || '-') + '</td>';
                    html += '<td>' + (esc(p.version) || '-') + '</td>';
                    html += '<td>' + (esc(p.product) || '-') + '</td>';
                    html += '<td>' + p.change_count + '</td>';
                    html += '<td>' + formatDate(p.last_seen) + '</td>';
                    html += '<td>' + histBtn + '</td>';
                    html += '</tr>';
                }
                html += '</tbody></table>';
                content.innerHTML = html;
            } catch (e) {
                content.innerHTML = '<div class="empty-state"><p>Error loading ports: ' + esc(e.message) + '</p></div>';
            }
        }

        function closeHostPortsModal() { closeModal('host-ports-modal'); }

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
            document.getElementById('live-filter-status').value = '';
            document.getElementById('live-filter-os').value = '';
            document.getElementById('live-filter-method').value = '';
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
            navigator.clipboard.writeText(text).then(() => showToast(msg || 'Copied')).catch(() => showToast('Copy failed', 'error'));
        }

        async function pingLiveHost(ip) {
            showToast('Pinging ' + ip + '...', 'info');
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
                    showToast(ip + ' is reachable (' + data.time_ms + 'ms)', 'success');
                } else {
                    badge.textContent = '✗';
                    badge.style.color = '#ef4444';
                    badge.style.borderColor = '#ef4444';
                    showToast(ip + ' is unreachable', 'error');
                }
                ipCell.style.position = 'relative';
                ipCell.appendChild(badge);
                setTimeout(() => { if (badge.parentNode) badge.remove(); }, 5000);
            } catch (e) {
                showToast('Ping failed: ' + e.message, 'error');
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
                    showToast('Host removed');
                    await loadLiveHosts();
                } catch (e) {
                    showToast('Error: ' + e.message, 'error');
                }
            });
            modal.querySelector('#del-cancel').addEventListener('click', function() { closeModal(mid); });
        }

        function toggleExportDropdown(e) {
            e.stopPropagation();
            const dd = document.getElementById('export-dropdown');
            const isOpen = dd.style.display !== 'none';
            dd.style.display = isOpen ? 'none' : '';
            if (!isOpen) {
                setTimeout(() => document.addEventListener('click', closeExportDropdown, { once: true }), 0);
            }
        }
        function closeExportDropdown() { document.getElementById('export-dropdown').style.display = 'none'; }
        function exportLive(fmt) {
            closeExportDropdown();
            window.location.href = `/api/live/export/${projectId}?format=${fmt}`;
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
                    showToast(label + ' deleted');
                    liveSelectedHosts.clear();
                    await loadLiveHosts();
                } catch (e) {
                    showToast('Error: ' + e.message, 'error');
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
                showToast('Status updated for ' + ips.length + ' hosts');
                liveSelectedHosts.clear();
                await loadLiveHosts();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        function compareSelectedHosts() {
            const ips = [...liveSelectedHosts];
            if (ips.length < 2) { showToast('Select at least 2 hosts', 'error'); return; }
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
            if (field === 'status') {
                el.innerHTML = '<select class="inline-edit-select" onblur="saveLiveInlineEdit(this,\'' + esc(ip) + '\',\'' + field + '\')" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\'){this.value=\'' + esc(currentValue) + '\';this.blur();}">' +
                    ['up','down','unknown'].map(s => '<option value="'+s+'"'+(s===currentValue?' selected':'')+'>'+s+'</option>').join('') +
                    '</select>';
                el.querySelector('select').focus();
            } else {
                el.innerHTML = '<input type="text" class="inline-edit-input" value="' + esc(currentValue) + '" onblur="saveLiveInlineEdit(this,\'' + esc(ip) + '\',\'' + field + '\')" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\'){this.value=\'' + esc(currentValue) + '\';this.blur();}">';
                const inp = el.querySelector('input');
                inp.focus();
                inp.select();
            }
        }

        async function saveLiveInlineEdit(inputEl, ip, field) {
            const newValue = inputEl.value;
            const td = inputEl.closest('td');
            try {
                await fetch(`/api/projects/${projectId}/live/update-field`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip: ip, field: field, value: newValue })
                });
                const host = liveHostsData.find(h => h.ip === ip);
                if (host) {
                    if (field === 'hostname') host.hostname = newValue;
                    else if (field === 'mac') host.mac = newValue;
                    else if (field === 'os') host.os = newValue;
                    else if (field === 'note') host.note = newValue;
                    else if (field === 'status') host.status = newValue;
                }
                showToast('Updated');
                applyLiveFiltersAndSort();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
                td.textContent = newValue || '-';
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

        let importedFiles = [];

        function detectFileType(name) {
            const ext = name.split('.').pop().toLowerCase();
            if (ext === 'xml') return 'xml';
            if (ext === 'nmap') return 'nmap';
            if (ext === 'gnmap') return 'gnmap';
            if (ext === 'csv') return 'csv';
            if (ext === 'json') return 'json';
            if (ext === 'zip') return 'zip';
            return 'nmap';
        }

        function detectRawFormat(text) {
            const t = text.trim();
            if (!t) return null;
            if (t.startsWith('<?xml') || t.startsWith('<nmaprun')) return 'XML';
            if (t.startsWith('Host:') && t.includes('Ports:')) return 'Gnmap';
            if (t.startsWith('# Nmap') || /^Nmap scan report for/i.test(t)) return 'Nmap';
            return 'Nmap';
        }

        function onImportFilesSelected(input) {
            const files = input.files;
            if (!files.length) return;
            const maxFiles = 5;
            for (let i = 0; i < files.length; i++) {
                if (importedFiles.length >= maxFiles) break;
                importedFiles.push(files[i]);
            }
            input.value = '';
            renderImportFileList();
            updateImportButtons();
            if (!document.getElementById('import-name').value && importedFiles.length) {
                document.getElementById('import-name').value = importedFiles[0].name.replace(/\.[^.]+$/, '');
            }
        }

        function removeImportFile(index) {
            importedFiles.splice(index, 1);
            renderImportFileList();
            updateImportButtons();
            if (!importedFiles.length) {
                document.getElementById('import-preview').style.display = 'none';
                document.getElementById('import-error').style.display = 'none';
            }
        }

        function renderImportFileList() {
            const container = document.getElementById('import-file-list');
            if (!importedFiles.length) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            let html = '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
            importedFiles.forEach((f, i) => {
                const type = detectFileType(f.name);
                const color = type === 'xml' ? '#3b82f6' : type === 'csv' ? '#22c55e' : type === 'json' ? '#eab308' : type === 'gnmap' ? '#a855f7' : type === 'zip' ? '#f97316' : '#94a3b8';
                html += `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(59,130,246,0.06);border-radius:6px;font-size:0.8rem;">
                    <span style="color:${color};font-weight:600;font-size:0.65rem;text-transform:uppercase;">${type}</span>
                    <span>${esc(f.name)}</span>
                    <span style="color:var(--text-muted);font-size:0.75rem;">(${formatFileSize(f.size)})</span>
                    <span onclick="removeImportFile(${i})" style="cursor:pointer;color:var(--text-muted);font-size:1rem;line-height:1;margin-left:2px;">&times;</span>
                </div>`;
            });
            if (importedFiles.length < 5) {
                html += `<div onclick="document.getElementById('import-file-input').click()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;border:1px dashed var(--border);border-radius:6px;font-size:0.8rem;color:var(--accent);cursor:pointer;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add file
                </div>`;
            }
            html += '</div>';
            container.innerHTML = html;
        }

        function onImportRawInput() {
            const text = document.getElementById('import-raw-text').value.trim();
            const detect = document.getElementById('import-raw-detect');
            if (!text) {
                detect.style.display = 'none';
                updateImportButtons();
                return;
            }
            const fmt = detectRawFormat(text);
            detect.style.display = 'inline';
            if (fmt) {
                detect.textContent = fmt + ' detected';
                detect.style.color = 'var(--accent)';
            } else {
                detect.textContent = 'Unknown format';
                detect.style.color = '#ef4444';
            }
            updateImportButtons();
        }

        function getImportData() {
            const rawText = document.getElementById('import-raw-text').value.trim();
            const formData = new FormData();
            let fileCount = 0;

            importedFiles.forEach(f => {
                const type = detectFileType(f.name);
                if (['xml', 'nmap', 'gnmap', 'csv', 'json', 'zip'].includes(type) && fileCount < 5) {
                    formData.append('file_' + type, f);
                    formData.append('filename_' + type, f.name);
                    fileCount++;
                }
            });

            if (rawText) {
                formData.append('raw_text', rawText);
            }

            const name = document.getElementById('import-name').value.trim();
            const profile = document.getElementById('import-profile').value;
            const autoConfirm = document.getElementById('import-auto-confirm').value === 'true';
            const mergeScan = document.getElementById('import-merge-scan').value;

            if (name) formData.append('name', name);
            formData.append('profile', profile || 'imported');
            if (autoConfirm) formData.append('auto_confirm', 'true');
            if (mergeScan) formData.append('merge_scan', mergeScan);

            return formData;
        }

        function hasImportContent() {
            return importedFiles.length > 0 || document.getElementById('import-raw-text').value.trim().length > 0;
        }

        async function doImport() {
            if (!hasImportContent()) { showToast('Select at least one file or paste raw output', 'error'); return; }

            const btn = document.getElementById('btn-do-import');
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.textContent = 'Importing...';

            const progressDiv = document.getElementById('import-progress');
            const progressFill = document.getElementById('import-progress-fill');
            const progressText = document.getElementById('import-progress-text');
            progressDiv.style.display = 'block';
            progressFill.style.width = '0%';
            progressFill.classList.remove('complete');
            progressText.textContent = 'Preparing...';

            try {
                const formData = getImportData();
                progressFill.style.width = '10%';
                progressText.textContent = 'Uploading...';

                const res = await fetch(`/api/import/${projectId}`, { method: 'POST', body: formData });
                progressFill.style.width = '80%';
                progressText.textContent = 'Processing...';

                const data = await res.json();

                if (data.error) {
                    showToast('Import failed: ' + data.error, 'error');
                    progressText.textContent = 'Failed: ' + data.error;
                    progressDiv.style.display = 'none';
                } else {
                    progressFill.style.width = '100%';
                    progressFill.classList.add('complete');
                    progressText.textContent = 'Complete!';
                    showToast('Import successful' + (data.auto_confirmed ? ' (auto-confirmed)' : ''));
                    setTimeout(() => { progressDiv.style.display = 'none'; }, 1500);
                    resetImportUI();
                    await loadScans();
                }
            } catch (e) {
                showToast('Import failed: ' + e.message, 'error');
                document.getElementById('import-progress').style.display = 'none';
            } finally {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.textContent = 'Import';
            }
        }

        async function previewImport() {
            if (!hasImportContent()) { showToast('Select at least one file or paste raw output', 'error'); return; }

            const btn = document.getElementById('btn-preview-import');
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.textContent = 'Parsing...';

            const errDiv = document.getElementById('import-error');
            errDiv.style.display = 'none';
            const previewDiv = document.getElementById('import-preview');
            const previewBody = document.getElementById('import-preview-body');

            try {
                const formData = getImportData();
                const res = await fetch(`/api/import/${projectId}/preview`, { method: 'POST', body: formData });
                const data = await res.json();

                if (data.error) {
                    errDiv.textContent = data.error;
                    errDiv.style.display = 'block';
                    previewDiv.style.display = 'none';
                    document.getElementById('btn-do-import').disabled = true;
                } else {
                    document.getElementById('import-host-count').textContent = data.hosts;
                    document.getElementById('import-port-count').textContent = data.ports;
                    document.getElementById('import-format').textContent = data.format;

                    if (data.items && data.items.length) {
                        let tableHtml = '<table class="data-table" style="margin-top:10px;font-size:0.8rem;"><thead><tr><th style="width:28px;"><input type="checkbox" id="preview-select-all" checked onchange="togglePreviewAll()"></th><th>IP</th><th>Port</th><th>Proto</th><th>State</th><th>Service</th></tr></thead><tbody>';
                        data.items.forEach((item, idx) => {
                            const stateBadge = item.state === 'open' ? 'badge-open' : item.state === 'filtered' ? 'badge-filtered' : 'badge-closed';
                            tableHtml += `<tr>
                                <td><input type="checkbox" class="preview-item-cb" data-index="${idx}" checked></td>
                                <td>${esc(item.ip)}</td>
                                <td>${item.port}</td>
                                <td>${esc(item.protocol)}</td>
                                <td><span class="${stateBadge}">${esc(item.state)}</span></td>
                                <td>${esc(item.service)}</td>
                            </tr>`;
                        });
                        tableHtml += '</tbody></table>';
                        previewBody.innerHTML = tableHtml;
                        previewBody.style.display = 'block';
                    } else {
                        previewBody.style.display = 'none';
                    }

                    previewDiv.style.display = 'block';
                    document.getElementById('btn-do-import').disabled = false;
                    if (data.hosts === 0 && data.ports === 0) {
                        errDiv.textContent = 'Warning: No hosts or ports found in file';
                        errDiv.style.display = 'block';
                    }
                }
            } catch (e) {
                errDiv.textContent = 'Preview failed: ' + e.message;
                errDiv.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.textContent = 'Preview';
            }
        }

        function togglePreviewAll() {
            const checked = document.getElementById('preview-select-all').checked;
            document.querySelectorAll('.preview-item-cb').forEach(cb => cb.checked = checked);
        }

        function updateImportButtons() {
            const hasContent = hasImportContent();
            document.getElementById('btn-preview-import').disabled = !hasContent;
            document.getElementById('btn-do-import').disabled = true;
            if (!hasContent) {
                document.getElementById('import-preview').style.display = 'none';
                document.getElementById('import-error').style.display = 'none';
            }
        }

        function resetImportUI() {
            importedFiles = [];
            renderImportFileList();
            document.getElementById('import-file-input').value = '';
            document.getElementById('import-name').value = '';
            document.getElementById('import-raw-text').value = '';
            document.getElementById('import-raw-detect').style.display = 'none';
            document.getElementById('import-preview').style.display = 'none';
            document.getElementById('import-error').style.display = 'none';
            document.getElementById('import-progress').style.display = 'none';
            document.getElementById('btn-preview-import').disabled = true;
            document.getElementById('btn-do-import').disabled = true;
            document.getElementById('import-merge-scan').value = '';
        }

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        async function loadImportHistory() {
            const card = document.getElementById('import-history-card');
            const tbody = document.getElementById('import-history-body');
            const countSpan = document.getElementById('import-history-count');
            try {
                const res = await fetch(`/api/import/${projectId}/history`);
                if (!res.ok) { card.style.display = 'none'; return; }
                const data = await res.json();
                const list = data.imports || [];
                if (!list.length) { card.style.display = 'none'; return; }
                card.style.display = 'block';
                countSpan.textContent = '(' + list.length + ')';
                let html = '';
                list.forEach(item => {
                    const d = new Date(item.created_at);
                    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const statusIcon = item.status === 'completed'
                        ? '<span style="color:#22c55e;" title="Completed">&#10003;</span>'
                        : '<span style="color:#eab308;" title="' + esc(item.status) + '">&#9679;</span>';
                    html += `<tr>
                        <td style="white-space:nowrap;font-size:0.8rem;">${dateStr}</td>
                        <td><span title="${esc(item.name || '')}">${esc(item.name || '-')}</span></td>
                        <td style="font-size:0.8rem;">${esc(item.format || '-')}</td>
                        <td style="text-align:center;">${item.host_count || 0}</td>
                        <td style="text-align:center;">${item.port_count || 0}</td>
                        <td style="text-align:center;">
                            <a href="#" onclick="event.preventDefault(); goToScan(${item.scan_id}); return false;" style="color:var(--accent);text-decoration:none;font-size:0.85rem;" title="View scan #${item.scan_id}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                ${item.scan_id}
                            </a>
                        </td>
                        <td style="text-align:center;">${statusIcon}</td>
                    </tr>`;
                });
                tbody.innerHTML = html;
            } catch (e) {
                card.style.display = 'none';
            }
        }

        function goToScan(id) {
            const btn = document.querySelector(`.sidebar-btn[data-tab="scans"]`);
            if (btn) btn.click();
            setTimeout(() => {
                const row = document.querySelector(`#scans-list tr[data-scan-id="${id}"]`);
                if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }

        // Unified drag and drop
        (function() {
            const dropZone = document.getElementById('import-drop-zone');
            if (!dropZone) return;
            ['dragenter', 'dragover'].forEach(evt => {
                dropZone.addEventListener(evt, e => {
                    e.preventDefault();
                    dropZone.style.borderColor = 'var(--accent)';
                    dropZone.style.background = 'rgba(59,130,246,0.1)';
                });
            });
            ['dragleave', 'drop'].forEach(evt => {
                dropZone.addEventListener(evt, e => {
                    e.preventDefault();
                    dropZone.style.borderColor = '';
                    dropZone.style.background = '';
                });
            });
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                const files = e.dataTransfer.files;
                if (files.length) {
                    const input = document.getElementById('import-file-input');
                    const dt = new DataTransfer();
                    for (let i = 0; i < Math.min(files.length, 5); i++) {
                        dt.items.add(files[i]);
                    }
                    input.files = dt.files;
                    onImportFilesSelected(input);
                }
            });
            dropZone.addEventListener('click', e => {
                if (e.target.tagName !== 'INPUT') {
                    document.getElementById('import-file-input').click();
                }
            });
        })();

        document.addEventListener('click', (e) => {
            var el = document.getElementById('profile-manager-modal');
            if (el && e.target === el) el.style.display = 'none';
        });

        let profileManagerData = [];

        async function showProfileManager(editId) {
            document.getElementById('profile-manager-modal').style.display = 'flex';
            resetProfileForm();
            await loadProfileManagerList();
            if (editId && typeof editId === 'number') selectProfileToEdit(editId);
        }

        function closeProfileManager() {
            document.getElementById('profile-manager-modal').style.display = 'none';
            loadScanProfiles();
        }

        async function loadProfileManagerList() {
            try {
                const res = await fetch('/api/scan/profiles');
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                profileManagerData = data.profiles || [];
                const list = document.getElementById('profile-manager-list');
                const categories = {};
                profileManagerData.forEach(p => {
                    if (!categories[p.category]) categories[p.category] = [];
                    categories[p.category].push(p);
                });
                const cats = Object.keys(categories).sort((a, b) => {
                    const order = ['Network Discovery', 'Port Scanning', 'UDP Scanning', 'IDS/IPS Evasion', 'Common'];
                    const ai = order.indexOf(a), bi = order.indexOf(b);
                    if (ai === -1 && bi === -1) return a.localeCompare(b);
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                });
                let html = '<div style="padding:12px;border-bottom:1px solid var(--border);">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
                html += '<span style="font-size:0.85rem;color:var(--text-muted);">' + profileManagerData.length + ' profiles</span>';
                html += '<button class="btn btn-primary btn-sm" onclick="newProfile()">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
                html += ' New</button></div></div>';
                html += '<div style="overflow-y:auto;flex:1;min-height:0;padding:8px;">';
                cats.forEach(cat => {
                    html += '<div style="margin-bottom:12px;">';
                    html += '<div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;padding:6px 8px 4px;">' + esc(cat) + ' (' + categories[cat].length + ')</div>';
                    categories[cat].forEach(p => {
                        html += '<div class="profile-list-item" onclick="selectProfileToEdit(' + p.id + ')" data-id="' + p.id + '" style="display:block;padding:8px 10px;border-radius:var(--radius-input);cursor:pointer;transition:background 0.15s;margin-bottom:2px;">';
                        html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
                        html += '<div style="font-size:0.85rem;font-weight:500;display:flex;align-items:center;gap:6px;">' + esc(p.name);
                        if (p.is_builtin) html += '<span class="badge badge-filtered" style="font-size:0.6rem;padding:1px 5px;">built-in</span>';
                        html += '</div>';
                        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><polyline points="9 18 15 12 9 6"/></svg>';
                        html += '</div>';
                        html += '<div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(p.command) + '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                });
                html += '</div>';
                list.innerHTML = html;
            } catch (e) {
                document.getElementById('profile-manager-list').innerHTML = '<p style="color:var(--red);padding:20px;">Failed to load</p>';
            }
        }

        let pfNseScripts = [];

        function togglePfSection(header) {
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.pf-arrow');
            const opening = body.classList.contains('collapsed');
            if (opening) {
                document.querySelectorAll('#profile-form-panel .pf-section-body').forEach(b => {
                    b.classList.add('collapsed');
                    const h = b.previousElementSibling;
                    if (h && h.classList.contains('pf-section-header')) {
                        const a = h.querySelector('.pf-arrow');
                        if (a) a.classList.remove('open');
                    }
                });
            }
            body.classList.toggle('collapsed');
            arrow.classList.toggle('open');
        }

        function onPfChange() {
            const cmd = buildProfileCommand();
            document.getElementById('pf-cmd-preview').textContent = cmd;
            document.getElementById('profile-form-cmd-hidden').value = cmd;
        }

        function buildProfileCommand() {
            const parts = [];

            const extra = document.getElementById('pf-extra').value.trim();

            if (extra.startsWith('sudo ')) {
                parts.push('sudo');
                parts.push('nmap');
                const rest = extra.substring(5).trim();
                if (rest) parts.push(rest);
            } else {
                parts.push('nmap');
                if (extra) parts.push(extra);
            }

            const tcp = document.getElementById('pf-tcp-scan').value;
            if (tcp) parts.push(tcp);

            const nonTcp = document.getElementById('pf-non-tcp').value;
            if (nonTcp) parts.push(nonTcp);

            const timing = document.getElementById('pf-timing').value;
            if (timing) parts.push(timing);

            if (document.getElementById('pf-A').checked) parts.push('-A');
            if (document.getElementById('pf-O').checked) parts.push('-O');
            if (document.getElementById('pf-sV').checked) parts.push('-sV');
            if (document.getElementById('pf-n').checked) parts.push('-n');
            if (document.getElementById('pf-6').checked) parts.push('-6');

            if (document.getElementById('pf-enable-sl').checked) {
                const ip = document.getElementById('pf-sl-ip').value.trim();
                if (ip) parts.push('-sI ' + ip);
                else parts.push('-sI');
            }

            if (document.getElementById('pf-enable-b').checked) {
                const ip = document.getElementById('pf-b-ip').value.trim();
                if (ip) parts.push('-b ' + ip);
                else parts.push('-b');
            }

            if (document.getElementById('pf-Pn').checked) parts.push('-Pn');
            if (document.getElementById('pf-PE').checked) parts.push('-PE');
            if (document.getElementById('pf-PP').checked) parts.push('-PP');
            if (document.getElementById('pf-PM').checked) parts.push('-PM');

            ['PA', 'PS', 'PU', 'PO', 'PY'].forEach(p => {
                if (document.getElementById('pf-enable-' + p).checked) {
                    const ports = document.getElementById('pf-' + p + '-ports').value.trim();
                    if (ports) parts.push('-P' + p + ' ' + ports);
                    else parts.push('-P' + p);
                }
            });

            const exclude = document.getElementById('pf-exclude').value.trim();
            if (exclude) parts.push('--exclude ' + exclude);

            const excludefile = document.getElementById('pf-excludefile').value.trim();
            if (excludefile) parts.push('--excludefile ' + excludefile);

            const iL = document.getElementById('pf-iL').value.trim();
            if (iL) parts.push('-iL ' + iL);

            const iR = document.getElementById('pf-iR').value.trim();
            if (iR) parts.push('-iR ' + iR);

            const p = document.getElementById('pf-p').value.trim();
            if (p) parts.push('-p ' + p);

            if (document.getElementById('pf-F').checked) parts.push('-F');

            const D = document.getElementById('pf-D').value.trim();
            if (D) parts.push('-D ' + D);

            const S = document.getElementById('pf-S').value.trim();
            if (S) parts.push('-S ' + S);

            const srcPort = document.getElementById('pf-source-port').value.trim();
            if (srcPort) parts.push('--source-port ' + srcPort);

            const e = document.getElementById('pf-e').value.trim();
            if (e) parts.push('-e ' + e);

            const ttl = document.getElementById('pf-ttl').value.trim();
            if (ttl) parts.push('--ttl ' + ttl);

            if (document.getElementById('pf-f').checked) parts.push('-f');
            if (document.getElementById('pf-packet-trace').checked) parts.push('--packet-trace');
            if (document.getElementById('pf-r').checked) parts.push('-r');
            if (document.getElementById('pf-traceroute').checked) parts.push('--traceroute');

            const maxRetries = document.getElementById('pf-max-retries').value.trim();
            if (maxRetries) parts.push('--max-retries ' + maxRetries);

            const hostTimeout = document.getElementById('pf-host-timeout').value.trim();
            if (hostTimeout) parts.push('--host-timeout ' + hostTimeout);

            const maxRtt = document.getElementById('pf-max-rtt-timeout').value.trim();
            if (maxRtt) parts.push('--max-rtt-timeout ' + maxRtt);

            const minRtt = document.getElementById('pf-min-rtt-timeout').value.trim();
            if (minRtt) parts.push('--min-rtt-timeout ' + minRtt);

            const initRtt = document.getElementById('pf-initial-rtt-timeout').value.trim();
            if (initRtt) parts.push('--initial-rtt-timeout ' + initRtt);

            const maxHostgroup = document.getElementById('pf-max-hostgroup').value.trim();
            if (maxHostgroup) parts.push('--max-hostgroup ' + maxHostgroup);

            const minHostgroup = document.getElementById('pf-min-hostgroup').value.trim();
            if (minHostgroup) parts.push('--min-hostgroup ' + minHostgroup);

            const maxPar = document.getElementById('pf-max-parallelism').value.trim();
            if (maxPar) parts.push('--max-parallelism ' + maxPar);

            const minPar = document.getElementById('pf-min-parallelism').value.trim();
            if (minPar) parts.push('--min-parallelism ' + minPar);

            const maxScanDelay = document.getElementById('pf-max-scan-delay').value.trim();
            if (maxScanDelay) parts.push('--max-scan-delay ' + maxScanDelay);

            const scanDelay = document.getElementById('pf-scan-delay').value.trim();
            if (scanDelay) parts.push('--scan-delay ' + scanDelay);

            if (pfNseScripts.length > 0) {
                parts.push('--script ' + pfNseScripts.join(','));
            }

            const nseArgs = document.getElementById('pf-nse-args').value.trim();
            if (nseArgs) {
                const lines = nseArgs.split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length > 0) parts.push('--script-args \'' + lines.join(',') + '\'');
            }

            parts.push('<TARGET>');
            return parts.join(' ');
        }

        function parseProfileCommand(cmd) {
            // Reset all fields first
            pfNseScripts = [];

            // Normalize: collapse multiple spaces, trim
            const s = cmd.replace(/\s+/g, ' ').trim();

            // Check for common flags using indexOf to handle any position
            const has = (flag) => s.indexOf(' ' + flag) >= 0 || s.startsWith(flag + ' ') || s === flag;

            // Set checkbox or select based on flag presence
            const setCheck = (id, flag) => {
                const el = document.getElementById(id);
                if (el) el.checked = has(flag);
            };

            const setSelect = (id, flag) => {
                const el = document.getElementById(id);
                if (el && flag) el.value = flag;
                else if (el) el.value = '';
            };

            // TCP scan type
            const tcpFlags = ['-sA', '-sF', '-sM', '-sN', '-sS', '-sT', '-sW', '-sX'];
            let foundTcp = '';
            tcpFlags.forEach(f => { if (s.indexOf(f) >= 0) foundTcp = f; });
            setSelect('pf-tcp-scan', foundTcp);

            const nonTcpFlags = ['-sU', '-sO', '-sL', '-sn', '-sY', '-sZ'];
            let foundNon = '';
            nonTcpFlags.forEach(f => { if (s.indexOf(f) >= 0) foundNon = f; });
            setSelect('pf-non-tcp', foundNon);

            const timingFlags = ['-T0', '-T1', '-T2', '-T3', '-T4', '-T5'];
            let foundT = '';
            timingFlags.forEach(f => { if (s.indexOf(f) >= 0) foundT = f; });
            setSelect('pf-timing', foundT);

            setCheck('pf-A', '-A');
            setCheck('pf-O', '-O');
            setCheck('pf-sV', '-sV');
            setCheck('pf-n', '-n');
            setCheck('pf-6', '-6');

            // Extract value after a flag
            const valAfter = (flag) => {
                const idx = s.indexOf(flag);
                if (idx < 0) return '';
                const after = s.substring(idx + flag.length).trim();
                const parts = after.split(' ');
                return parts[0] || '';
            };

            // -sI
            const slIdx = s.indexOf('-sI');
            if (slIdx >= 0) {
                document.getElementById('pf-enable-sl').checked = true;
                const rest = s.substring(slIdx + 3).trim();
                const ip = rest.split(' ')[0];
                if (ip && ip !== '-A' && ip !== '-O' && ip !== '-sV' && !ip.startsWith('-')) {
                    document.getElementById('pf-sl-ip').value = ip;
                }
            }

            // -b
            const bIdx = s.indexOf('-b ');
            if (bIdx >= 0) {
                document.getElementById('pf-enable-b').checked = true;
                const rest = s.substring(bIdx + 3).trim();
                const ip = rest.split(' ')[0];
                if (ip && !ip.startsWith('-')) {
                    document.getElementById('pf-b-ip').value = ip;
                }
            }

            setCheck('pf-Pn', '-Pn');
            setCheck('pf-PE', '-PE');
            setCheck('pf-PP', '-PP');
            setCheck('pf-PM', '-PM');

            // Ping probes with port args
            ['PA', 'PS', 'PU', 'PO', 'PY'].forEach(p => {
                const flag = '-P' + p;
                const idx = s.indexOf(flag);
                if (idx >= 0) {
                    document.getElementById('pf-enable-' + p).checked = true;
                    const rest = s.substring(idx + flag.length).trim();
                    const val = rest.split(' ')[0];
                    if (val && !val.startsWith('-')) {
                        document.getElementById('pf-' + p + '-ports').value = val;
                    }
                }
            });

            // Target section
            const extractVal = (flag) => {
                const idx = s.indexOf(flag);
                if (idx < 0) return '';
                const rest = s.substring(idx + flag.length).trim();
                const parts = rest.split(' ');
                const v = [];
                for (const p of parts) {
                    if (p.startsWith('-') || p === '<TARGET>') break;
                    if (p) v.push(p);
                }
                return v.join(' ');
            };

            const setVal = (id, flag) => {
                const el = document.getElementById(id);
                if (el) el.value = extractVal(flag);
            };

            setVal('pf-exclude', '--exclude');
            setVal('pf-excludefile', '--excludefile');
            setVal('pf-iL', '-iL');
            setVal('pf-iR', '-iR');
            setVal('pf-p', '-p');
            setCheck('pf-F', '-F');

            setVal('pf-D', '-D');
            setVal('pf-S', '-S');
            setVal('pf-source-port', '--source-port');
            setVal('pf-e', '-e');

            setVal('pf-ttl', '--ttl');
            setVal('pf-max-retries', '--max-retries');
            setCheck('pf-f', '-f');
            setCheck('pf-packet-trace', '--packet-trace');
            setCheck('pf-r', '-r');
            setCheck('pf-traceroute', '--traceroute');

            setVal('pf-host-timeout', '--host-timeout');
            setVal('pf-max-rtt-timeout', '--max-rtt-timeout');
            setVal('pf-min-rtt-timeout', '--min-rtt-timeout');
            setVal('pf-initial-rtt-timeout', '--initial-rtt-timeout');
            setVal('pf-max-hostgroup', '--max-hostgroup');
            setVal('pf-min-hostgroup', '--min-hostgroup');
            setVal('pf-max-parallelism', '--max-parallelism');
            setVal('pf-min-parallelism', '--min-parallelism');
            setVal('pf-max-scan-delay', '--max-scan-delay');
            setVal('pf-scan-delay', '--scan-delay');

            // Extract --script
            const scriptIdx = s.indexOf('--script ');
            if (scriptIdx >= 0) {
                const rest = s.substring(scriptIdx + 9).trim();
                const scEnd = rest.indexOf(' ');
                const scStr = scEnd >= 0 ? rest.substring(0, scEnd) : rest;
                pfNseScripts = scStr.split(',').filter(Boolean);
                renderPfNseChips();
            }

            // Extract --script-args
            const argsIdx = s.indexOf('--script-args ');
            if (argsIdx >= 0) {
                let rest = s.substring(argsIdx + 13).trim();
                // Remove surrounding quotes
                if (rest.startsWith("'") || rest.startsWith('"')) {
                    const quote = rest[0];
                    rest = rest.substring(1);
                    const end = rest.indexOf(quote);
                    if (end >= 0) rest = rest.substring(0, end);
                }
                const argsEl = document.getElementById('pf-nse-args');
                if (argsEl) argsEl.value = rest.replace(/,/g, '\n');
            }

            // Collect unknown flags into extra
            const known = new Set([
                '-A','-O','-sV','-n','-6','-f','--packet-trace','-r','--traceroute',
                '-Pn','-PE','-PP','-PM','-F',
                '-sA','-sF','-sM','-sN','-sS','-sT','-sW','-sX',
                '-sU','-sO','-sL','-sn','-sY','-sZ',
                '-T0','-T1','-T2','-T3','-T4','-T5',
                '-sI','-b',
                '-PA','-PS','-PU','-PO','-PY',
                '--exclude','--excludefile','-iL','-iR','-p',
                '-D','-S','--source-port','-e',
                '--ttl','--max-retries',
                '--host-timeout','--max-rtt-timeout','--min-rtt-timeout','--initial-rtt-timeout',
                '--max-hostgroup','--min-hostgroup','--max-parallelism','--min-parallelism',
                '--max-scan-delay','--scan-delay',
                '--script','--script-args'
            ]);
            const withArg = new Set([
                '-sI','-b',
                '-PA','-PS','-PU','-PO','-PY',
                '--exclude','--excludefile','-iL','-iR','-p',
                '-D','-S','--source-port','-e',
                '--ttl','--max-retries',
                '--host-timeout','--max-rtt-timeout','--min-rtt-timeout','--initial-rtt-timeout',
                '--max-hostgroup','--min-hostgroup','--max-parallelism','--min-parallelism',
                '--max-scan-delay','--scan-delay',
                '--script','--script-args'
            ]);
            const tokens = s.split(/\s+/);
            const extraParts = [];
            let i = 0;
            while (i < tokens.length) {
                const t = tokens[i];
                if (t === 'nmap' || t === '<TARGET>' || t === 'sudo') { i++; continue; }
                if (known.has(t)) { i++; if (withArg.has(t)) i++; continue; }
                extraParts.push(t);
                i++;
            }
            const sudoPrefix = tokens[0] === 'sudo' ? 'sudo ' : '';
            document.getElementById('pf-extra').value = sudoPrefix + extraParts.join(' ');
        }

        function newProfile() {
            document.getElementById('profile-form-title').textContent = 'New Profile';
            document.getElementById('profile-edit-id').value = '';
            document.getElementById('profile-form-name').value = '';
            document.getElementById('profile-form-desc').value = '';
            document.getElementById('profile-form-cat').value = 'Custom';
            document.getElementById('profile-save-btn').textContent = 'Create';
            document.getElementById('profile-delete-area').style.display = 'none';
            document.querySelectorAll('.profile-list-item').forEach(el => el.style.background = '');

            // Reset all form fields
            document.getElementById('pf-cmd-preview').textContent = 'nmap <TARGET>';
            document.getElementById('profile-form-cmd-hidden').value = '';
            pfNseScripts = [];
            renderPfNseChips();

            ['pf-tcp-scan', 'pf-non-tcp', 'pf-timing'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

            document.querySelectorAll('#profile-form-panel .pf-checkbox').forEach(el => el.checked = false);
            document.querySelectorAll('#profile-form-panel .pf-input').forEach(el => {
                if (el.type !== 'hidden') el.value = '';
            });
            document.getElementById('pf-nse-args').value = '';
            document.getElementById('pf-nse-results').innerHTML = '';
            document.getElementById('pf-nse-search').value = '';

            document.getElementById('profile-form-name').focus();
        }

        function resetProfileForm() {
            newProfile();
        }

        function selectProfileToEdit(id) {
            const p = profileManagerData.find(x => x.id === id);
            if (!p) return;
            document.querySelectorAll('.profile-list-item').forEach(el => el.style.background = '');
            const el = document.querySelector('.profile-list-item[data-id="' + p.id + '"]');
            if (el) el.style.background = 'var(--bg-input)';
            document.getElementById('profile-form-title').textContent = p.name;
            document.getElementById('profile-edit-id').value = p.id;
            document.getElementById('profile-form-name').value = p.name;
            document.getElementById('profile-form-desc').value = p.description || '';
            const catSelect = document.getElementById('profile-form-cat');
            let found = false;
            for (let i = 0; i < catSelect.options.length; i++) {
                if (catSelect.options[i].value === p.category) { catSelect.selectedIndex = i; found = true; break; }
            }
            if (!found) {
                catSelect.options[catSelect.options.length] = new Option(p.category, p.category);
                catSelect.value = p.category;
            }
            document.getElementById('profile-save-btn').textContent = 'Update';
            document.getElementById('profile-delete-area').style.display = '';

            parseProfileCommand(p.command);
            onPfChange();
        }

        function searchProfileNse() {
            clearTimeout(window.pfNseTimeout);
            const q = document.getElementById('pf-nse-search').value.trim();
            if (!q) { document.getElementById('pf-nse-results').innerHTML = ''; return; }
            window.pfNseTimeout = setTimeout(async () => {
                try {
                    const res = await fetch('/api/scan/nse?q=' + encodeURIComponent(q));
                    if (!res.ok) return;
                    const data = await res.json();
                    const container = document.getElementById('pf-nse-results');
                    if (!data.scripts || data.scripts.length === 0) {
                        container.innerHTML = '<div style="padding:6px;color:var(--text-muted);font-size:0.75rem;">No scripts</div>';
                        return;
                    }
                    container.innerHTML = data.scripts.map(s =>
                        '<div style="display:flex;justify-content:space-between;padding:4px 8px;cursor:pointer;border-radius:4px;font-size:0.78rem;" ' +
                        'onmouseover="this.style.background=\'var(--bg-input)\'" onmouseout="this.style.background=\'\'" ' +
                        'onclick="insertProfileNse(\'' + esc(s.name) + '\')">' +
                        '<span style="font-family:var(--font-mono);">' + esc(s.name) + '</span>' +
                        '<span style="color:var(--text-muted);font-size:0.7rem;">' + esc(s.size||'') + '</span></div>'
                    ).join('');
                } catch (e) {}
            }, 300);
        }

        function insertProfileNse(name) {
            if (pfNseScripts.includes(name)) return;
            pfNseScripts.push(name);
            renderPfNseChips();
            document.getElementById('pf-nse-search').value = '';
            document.getElementById('pf-nse-results').innerHTML = '';
            onPfChange();
        }

        function removeProfileNse(name) {
            pfNseScripts = pfNseScripts.filter(s => s !== name);
            renderPfNseChips();
            onPfChange();
        }

        function renderPfNseChips() {
            const container = document.getElementById('pf-nse-chips');
            if (!container) return;
            if (pfNseScripts.length === 0) {
                container.innerHTML = '';
                return;
            }
            container.innerHTML = pfNseScripts.map(s =>
                '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;font-size:0.72rem;background:rgba(59,130,246,0.15);color:var(--accent);border-radius:10px;border:1px solid rgba(59,130,246,0.3);">' +
                esc(s) +
                '<span onclick="removeProfileNse(\'' + esc(s) + '\')" style="cursor:pointer;opacity:0.6;font-size:0.85rem;line-height:1;">&times;</span></span>'
            ).join('');
        }

        async function saveProfile() {
            onPfChange();
            const id = document.getElementById('profile-edit-id').value;
            const name = document.getElementById('profile-form-name').value.trim();
            const desc = document.getElementById('profile-form-desc').value.trim();
            const cmd = document.getElementById('profile-form-cmd-hidden').value.trim();
            const cat = document.getElementById('profile-form-cat').value.trim();
            if (!name || !cmd || !cat) { showToast('Name, command, and category are required', 'error'); return; }
            try {
                const method = id ? 'PUT' : 'POST';
                const body = JSON.stringify({ id: id ? parseInt(id) : 0, name, description: desc, command: cmd, category: cat });
                const res = await fetch('/api/scan/profiles', { method, headers: { 'Content-Type': 'application/json' }, body });
                if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
                showToast(id ? 'Profile updated' : 'Profile created');
                resetProfileForm();
                await loadProfileManagerList();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function deleteProfileFromForm() {
            const id = parseInt(document.getElementById('profile-edit-id').value);
            if (!id) return;
            const p = profileManagerData.find(x => x.id === id);
            if (!p) return;
            if (!confirm('Delete profile "' + p.name + '"?')) return;
            try {
                const res = await fetch('/api/scan/profiles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
                showToast('Profile deleted');
                resetProfileForm();
                await loadProfileManagerList();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function loadImportMergeScans() {
            const sel = document.getElementById('import-merge-scan');
            if (!sel) return;
            try {
                const res = await fetch(`/api/projects/${projectId}/scans`);
                const scans = await res.json();
                sel.innerHTML = '<option value="">Create new scan</option>';
                (scans || []).forEach(s => {
                    if (s.status === 'completed') {
                        const label = esc(s.target || '#') + ' (' + esc(s.profile) + ' - ' + new Date(s.created_at).toLocaleDateString() + ')';
                        sel.innerHTML += `<option value="${s.id}">${label}</option>`;
                    }
                });
            } catch (e) {}
        }

        function showAboutModal() {
            document.getElementById('about-modal').style.display = 'flex';
        }
        function hideAboutModal() {
            document.getElementById('about-modal').style.display = 'none';
        }
        function goToAdmin() { window.location.href = '/admin'; }

        init();
