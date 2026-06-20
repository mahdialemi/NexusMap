        async function createScan() {
            const target = document.getElementById('target').value.trim();
            if (!target) { showToast(t('scans.enter_target'), 'error'); return; }

            const schedEnabled = document.getElementById('sched-enabled').checked;
            if (schedEnabled) {
                await createScheduledScan(target);
                return;
            }

            const btn = document.getElementById('create-btn');
            btn.disabled = true;
            btn.textContent = t('scans.creating');

            try {
                const extraArgs = getQuickFlags();
                const note = document.getElementById('scan-notes').value.trim();
                await createScanAPI(projectId, selectedProfile, target, extraArgs, note);
                showToast(t('scans.created'));
                document.getElementById('target').value = '';
                document.getElementById('scan-notes').value = '';
                await loadScans();
            } catch (e) {
                showToast(t('app.error') + ': ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = t('scans.create');
            }
        }

        async function createScheduledScan(target) {
            const btn = document.getElementById('create-btn');
            btn.disabled = true;
            btn.textContent = t('scans.scheduling');

            try {
                const triggerType = document.querySelector('input[name="sched-type"]:checked').value;
                let scheduledAt = '';
                let dependsOnScanID = null;

                if (triggerType === 'time') {
                    scheduledAt = document.getElementById('sched-datetime').value;
                    if (!scheduledAt) {
                        showToast(t('scans.select_datetime'), 'error');
                        btn.disabled = false;
                        btn.textContent = t('scans.create');
                        return;
                    }
                    // Convert to ISO format (append seconds if not present)
                    if (scheduledAt.length === 16) scheduledAt += ':00';
                    scheduledAt = scheduledAt.replace('T', ' ') + ':00';
                } else {
                    const sel = document.getElementById('sched-dep-scan');
                    dependsOnScanID = parseInt(sel.value);
                    if (!dependsOnScanID) {
                        showToast(t('scans.select_dep_scan'), 'error');
                        btn.disabled = false;
                        btn.textContent = t('scans.create');
                        return;
                    }
                }

                const profile = selectedProfile;
                const res = await fetch(`/api/projects/${projectId}/schedules/create`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken},
                    body: JSON.stringify({
                        name: target,
                        profile: profile,
                        target: target,
                        trigger_type: triggerType,
                        scheduled_at: triggerType === 'time' ? scheduledAt : '',
                        depends_on_scan_id: triggerType === 'dependency' ? dependsOnScanID : null
                    })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || t('scans.schedule_failed'));
                }

                const msg = triggerType === 'time'
                    ? t('scans.scheduled_for').replace('{time}', scheduledAt)
                    : t('scans.scheduled_after').replace('{n}', dependsOnScanID);
                showToast(msg, 'success');
                document.getElementById('target').value = '';
                document.getElementById('scan-notes').value = '';
                document.getElementById('sched-enabled').checked = false;
                document.getElementById('sched-options').style.display = 'none';
            } catch (e) {
                showToast(t('app.error') + ': ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = t('scans.create');
            }
        }

        async function runScan(id) {
            try {
                await runScanAPI(id);
                showToast(t('scans.started'));
                await loadScans();
                startAutoRefresh();
            } catch (e) {
                showToast(t('app.error') + ': ' + e.message, 'error');
            }
        }

        async function stopScan(id) {
            try {
                await stopScanAPI(id);
                showToast(t('scans.stopped'));
                await loadScans();
                stopAutoRefresh();
            } catch (e) {
                showToast(t('app.error') + ': ' + e.message, 'error');
            }
        }

        async function viewLog(id) {
            var body = '<div id="log-tabs" class="log-tabs" style="margin-bottom:8px;"></div><pre id="log-content" class="log-viewer">' + t('app.loading') + '</pre>';
            showModal('log-modal', t('scans.log_title').replace('{n}', id), body, 'modal-large');
            var content = document.getElementById('log-content');
            var tabsEl = document.getElementById('log-tabs');

            tabsEl.innerHTML = '';
            const formats = [
                { key: 'log', label: t('scans.tab_log') },
                { key: 'xml', label: t('scans.tab_xml') },
                { key: 'nmap', label: t('scans.tab_nmap') },
                { key: 'gnmap', label: t('scans.tab_gnmap') }
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
            content.textContent = t('app.loading');
            try {
                const data = await getScanLogFormat(id, format);
                if (data.log) {
                    content.textContent = data.log;
                } else {
                    content.textContent = t('app.no_data');
                }
            } catch (e) {
                content.textContent = t('app.error') + ': ' + e.message;
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
            var body = '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:15px;">' + t('scans.select_export_format') + '</p>' +
                '<div style="display:flex;flex-direction:column;gap:8px;">' +
                    '<button class="btn btn-success btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'xlsx\')">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>' +
                        ' ' + t('scans.export_xlsx') +
                    '</button>' +
                    '<button class="btn btn-primary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'json\')">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>' +
                        ' ' + t('scans.export_json') +
                    '</button>' +
                    '<button class="btn btn-danger btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'pdf\')">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="10" y1="13" x2="8" y2="13"/><line x1="16" y1="13" x2="12" y2="13"/><line x1="8" y1="16" x2="16" y2="16"/></svg>' +
                        ' ' + t('scans.export_pdf') +
                    '</button>' +
                    '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'nmap\')" id="export-btn-nmap">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M4 10l2 2 2-2"/><path d="M6 12v4"/></svg>' +
                        ' <span>' + t('scans.export_nmap') + '</span>' +
                        ' <span id="export-badge-nmap" class="badge badge-muted" style="margin-left:auto;display:none;font-size:0.7rem;">' + t('scans.generated') + '</span>' +
                    '</button>' +
                    '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'xml\')" id="export-btn-xml">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><polyline points="4 10 6 12 4 14"/><polyline points="8 14 6 12 8 10"/></svg>' +
                        ' <span>' + t('scans.export_xml') + '</span>' +
                        ' <span id="export-badge-xml" class="badge badge-muted" style="margin-left:auto;display:none;font-size:0.7rem;">' + t('scans.generated') + '</span>' +
                    '</button>' +
                    '<button class="btn btn-secondary btn-sm" style="justify-content:flex-start;padding:10px 16px;" onclick="doExport(\'gnmap\')" id="export-btn-gnmap">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><line x1="4" y1="11" x2="8" y2="11"/></svg>' +
                        ' <span>' + t('scans.export_gnmap') + '</span>' +
                        ' <span id="export-badge-gnmap" class="badge badge-muted" style="margin-left:auto;display:none;font-size:0.7rem;">' + t('scans.generated') + '</span>' +
                    '</button>' +
                '</div>';
            showModal('export-modal', t('scans.export_title').replace('{n}', scanId), body, 'modal-small');
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
        let scanPollBackoff = 2000;

        function startScanPolling() {
            scanPollBackoff = 2000;
            const runningEls = document.querySelectorAll('.scan-state');
            if (runningEls.length === 0) {
                stopScanPolling();
                return;
            }
            if (scanPollInterval) return;
            scanPollInterval = setInterval(pollScanStatuses, 2000);
        }

        function stopScanPolling() {
            if (scanPollInterval) {
                clearInterval(scanPollInterval);
                scanPollInterval = null;
            }
            scanPollBackoff = 2000;
        }

        async function pollScanStatuses() {
            const states = document.querySelectorAll('.scan-state');
            if (states.length === 0) {
                stopScanPolling();
                return;
            }
            let anyRunning = false;
            for (const el of states) {
                const id = el.id.replace('sp-', '');
                try {
                    const resp = await fetch('/api/scans/' + id + '/status');
                    const data = await resp.json();
                    if (data.status === 'completed' || data.status === 'error' || data.status === 'stopped') {
                        stopScanPolling();
                        await loadScans();
                        return;
                    }
                    if (data.phase) el.innerHTML = getStateIcon(data.phase) + ' ' + esc(data.phase);
                    if (data.status === 'running') anyRunning = true;
                } catch (e) {
                    // ignore
                }
            }
            // Exponential backoff: slow polling when scans are idle
            if (!anyRunning && states.length > 0) {
                scanPollBackoff = Math.min(scanPollBackoff * 1.5, 30000);
                stopScanPolling();
                scanPollInterval = setInterval(pollScanStatuses, scanPollBackoff);
            }
        }

        function downloadCSV(id) {
            window.location.href = `/api/export/${id}/csv`;
        }

        function viewResults(id) {
            window.location.href = '/project/' + projectId + '/scan/' + id;
        }

        async function deleteScan(id) {
            if (!confirm(t('scans.delete_confirm'))) return;
            try {
                await deleteScanAPI(id);
                showToast(t('scans.deleted'));
                await loadScans();
            } catch (e) {
                showToast(t('app.error') + ': ' + e.message, 'error');
            }
        }

        async function loadScans() {
            const list = document.getElementById('scans-list');
            try {
                allScans = await getScans(projectId);
                populateProfileFilter(allScans);
                applyScanFilters();
                updateRecentTargets();

                // Build dependency map: scan ID → schedules that depend on it
                try {
                    const allScheds = await getSchedules(projectId);
                    window.scheduleDepMap = {};
                    for (const sc of allScheds) {
                        if (sc.trigger_type === 'dependency' && sc.depends_on_scan_id && sc.status === 'pending') {
                            if (!window.scheduleDepMap[sc.depends_on_scan_id]) {
                                window.scheduleDepMap[sc.depends_on_scan_id] = [];
                            }
                            window.scheduleDepMap[sc.depends_on_scan_id].push(sc);
                        }
                    }
                } catch (e) {
                    window.scheduleDepMap = {};
                }

                var hasRunning = allScans.some(function(s) { return s.status === 'running' || s.status === 'pending'; });
                manageRefresh(hasRunning);
                if (hasRunning) { startScanPolling(); } else { stopScanPolling(); }
            } catch (e) {
                console.error('loadScans error:', e);
                list.innerHTML = '<div class="empty-state"><p>' + t('scans.error_loading') + esc(e.message) + '</p></div>';
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

        function formatSchedDate(dt) {
            if (!dt) return '';
            const d = new Date(dt.replace(' ', 'T') + 'Z');
            if (isNaN(d.getTime())) return dt;
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hour = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return month + '/' + day + ' ' + hour + ':' + min;
        }

        function renderScans(scans) {
            const list = document.getElementById('scans-list');
            const countEl = document.getElementById('scan-count');
            if (!scans || scans.length === 0) {
                list.innerHTML = '<div class="empty-state"><h3>' + t('scans.no_filter_matches') + '</h3><p>' + t('scans.adjust_filters') + '</p></div>';
                if (countEl) countEl.textContent = '';
                return;
            }

            if (countEl) countEl.textContent = scans.length + ' ' + t('scans.of', 'of') + ' ' + allScans.length;

            const sort = document.getElementById('scan-sort').value;
            scans.sort((a, b) => {
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
                const stateLine = isRunning ? (s.phase || t('scans.starting')) : (s.phase || '');

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
                if (isPendingConfirm) html += '<span class="badge badge-pending">' + t('scans.pending_badge') + '</span>';
                if (isConfirmed) html += '<span class="badge badge-confirmed">&#10003;</span>';
                if (isRejected) html += '<span class="badge badge-rejected">&#10007;</span>';
                if (window.scheduleDepMap && window.scheduleDepMap[s.id]) {
                    html += '<span class="badge badge-dep" title="' + t('scans.schedules_waiting').replace('{target}', window.scheduleDepMap[s.id][0].target).replace('{n}', window.scheduleDepMap[s.id].length) + '">&#9203; dep: ' + window.scheduleDepMap[s.id].length + '</span>';
                }
                if (s.schedule_trigger_type === 'time' && s.schedule_scheduled_at) {
                    html += '<span class="badge badge-sched" title="' + esc(s.schedule_name || '') + '">&#128197; ' + formatSchedDate(s.schedule_scheduled_at) + '</span>';
                }
                if (s.schedule_trigger_type === 'dependency' && s.schedule_depends_on) {
                    html += '<span class="badge badge-sched" title="' + t('scans.waits_for_scan').replace('{n}', s.schedule_depends_on) + '">&#128279; after #' + s.schedule_depends_on + '</span>';
                }
                html += statusBadge(s.status);
                if (isPending) html += '<button class="btn btn-sm btn-run" onclick="event.stopPropagation();runScan(' + s.id + ')" title="' + t('scans.run') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>';
                if (isRunning) html += '<button class="btn btn-sm btn-stop" onclick="event.stopPropagation();stopScan(' + s.id + ')" title="' + t('scans.stop') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button>';
                html += '</div>';
                html += '</div>';

                html += '<div class="scan-card-target">' + esc(s.target) + '</div>';

                html += '<div class="scan-card-meta">';
                html += '<span>' + t('scans.hosts_label') + ': <strong>' + s.host_count + '</strong></span>';
                html += '<span class="meta-dot"></span>';
                html += '<span>' + t('scans.ports_label') + ': <strong>' + s.port_count + '</strong></span>';
                html += '<span class="meta-dot"></span>';
                html += '<span>' + t('scans.started_label') + ': ' + formatDate(s.started_at) + '</span>';
                if (dur) {
                    html += '<span class="meta-dot"></span>';
                    html += '<span>' + t('scans.duration_label') + ': ' + dur + '</span>';
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
                    html += '<button class="btn btn-sm btn-confirm" onclick="event.stopPropagation();confirmScan(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' + t('app.confirm') + '</button>';
                    html += '<button class="btn btn-sm btn-reject" onclick="event.stopPropagation();rejectScan(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' + t('scans.reject') + '</button>';
                }
                html += '<span class="footer-spacer"></span>';
                html += '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();viewLog(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + t('scans.logs') + '</button>';
                if (isCompleted) html += '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();showExportModal(' + s.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' + t('app.export') + '</button>';
                html += '<button class="btn btn-ghost btn-sm btn-delete" onclick="event.stopPropagation();deleteScan(' + s.id + ')" title="' + t('app.delete') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' + t('app.delete') + '</button>';
                html += '</div>';

                html += '</div>';
            }
            list.innerHTML = html;
            var pendingCount = scans.filter(function(s) { return s.status === 'completed' && s.confirmed !== 1 && s.confirmed !== -1; }).length;
            document.getElementById('confirm-all-btn').style.display = pendingCount ? '' : 'none';
            var badge = document.getElementById('scans-badge');
            if (pendingCount) { badge.textContent = pendingCount; badge.style.display = 'flex'; }
            else { badge.style.display = 'none'; }
            startScanPolling();
        }

        function populateProfileFilter(scans) {
            const sel = document.getElementById('scan-profile-filter');
            const profiles = [...new Set(scans.map(s => s.profile))].sort();
            const current = sel.value;
            sel.innerHTML = '<option value="">' + t('scans.all_profiles') + '</option>';
            profiles.forEach(p => {
                sel.innerHTML += '<option value="' + esc(p) + '">' + esc(p) + '</option>';
            });
            sel.value = current;
        }

        let selectedStatus = '';
        let selectedConfirm = '';

        function applyScanFilters() {
            const query = document.getElementById('scan-search').value.toLowerCase();
            const profileFilter = document.getElementById('scan-profile-filter').value;

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
            if (selectedConfirm === 'unconfirmed') {
                filtered = filtered.filter(s => s.status === 'completed' && s.confirmed != 1 && s.confirmed != -1);
            }
            if (selectedConfirm === 'confirmed') {
                filtered = filtered.filter(s => s.confirmed == 1);
            }
            if (selectedConfirm === 'rejected') {
                filtered = filtered.filter(s => s.confirmed == -1);
            }

            renderScans(filtered);
        }

        function setStatusFilter() {
            var status = this.getAttribute('data-status') || '';
            selectedStatus = status;
            document.querySelectorAll('#filter-chips .chip[data-action="setStatusFilter"]').forEach(function(c) { c.classList.remove('chip-active'); });
            this.classList.add('chip-active');
            selectedConfirm = '';
            document.querySelectorAll('#filter-chips .chip[data-action="setConfirmFilter"]').forEach(function(c) { c.classList.remove('chip-active'); });
            applyScanFilters();
        }

        function setConfirmFilter() {
            var confirm = this.getAttribute('data-confirm') || '';
            if (selectedConfirm === confirm) {
                selectedConfirm = '';
                this.classList.remove('chip-active');
            } else {
                selectedConfirm = confirm;
                document.querySelectorAll('#filter-chips .chip[data-action="setConfirmFilter"]').forEach(function(c) { c.classList.remove('chip-active'); });
                this.classList.add('chip-active');
            }
            applyScanFilters();
        }

        function onSearchInput() {
            applyScanFilters();
        }

        function clearScanSearch() {
            document.getElementById('scan-search').value = '';
            var wrap = document.getElementById('scan-search-wrap');
            var toggle = document.getElementById('scan-search-toggle');
            if (wrap) wrap.style.display = 'none';
            if (toggle) toggle.style.display = '';
            applyScanFilters();
        }

        function toggleScanSearch() {
            var wrap = document.getElementById('scan-search-wrap');
            var toggle = document.getElementById('scan-search-toggle');
            if (!wrap || !toggle) return;
            wrap.style.display = 'flex';
            toggle.style.display = 'none';
            var input = document.getElementById('scan-search');
            if (input) { input.focus(); input.select(); }
        }

        function compareScans() {
            compareScansAsync();
        }
        async function compareScansAsync() {
            var modal = document.getElementById('compare-modal');
            var selA = document.getElementById('compare-scan-a');
            var selB = document.getElementById('compare-scan-b');
            selA.innerHTML = '';
            selB.innerHTML = '';
            var completed = allScans.filter(function(s) { return s.status === 'completed' && s.host_count > 0; });
            completed.forEach(function(s) {
                var opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = '#' + s.id + ' ' + s.target + ' (' + s.profile + ')';
                selA.appendChild(opt.cloneNode(true));
                selB.appendChild(opt);
            });
            if (selB.options.length > 1) { selB.selectedIndex = 1; }
            document.getElementById('compare-results').style.display = 'none';
            modal.style.display = 'flex';
        }

        function hideCompareModal() {
            document.getElementById('compare-modal').style.display = 'none';
        }
        window.hideCompareModal = hideCompareModal;

        async         function runCompare() {
            runCompareAsync();
        }
        async function runCompareAsync() {
            var selA = document.getElementById('compare-scan-a');
            var selB = document.getElementById('compare-scan-b');
            var idA = selA.value;
            var idB = selB.value;
            if (!idA || !idB) { showToast(t('scans.select_both'), 'error'); return; }
            if (idA === idB) { showToast(t('scans.select_different'), 'error'); return; }
            var btn = document.querySelector('#compare-modal .btn-primary');
            if (!btn) return;
            btn.disabled = true;
            btn.textContent = t('scans.comparing');
            try {
                var res = await fetch('/api/scans/compare?scan1=' + idA + '&scan2=' + idB);
                var data = await res.json();
                renderCompare(data);
            } catch (e) {
                showToast(t('scans.compare_failed') + ': ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = t('scans.compare');
            }
        }

        function renderCompare(data) {
            var el = document.getElementById('compare-results');
            var s = data.summary;
            var html = '<div class="diff-summary">';
            html += '<div class="diff-summary-item"><div class="ds-val">' + s.hosts_in_scan1 + '</div><div class="ds-label">' + t('scans.hosts_a') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val">' + s.hosts_in_scan2 + '</div><div class="ds-label">' + t('scans.hosts_b') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val green">+' + s.hosts_added + '</div><div class="ds-label">' + t('scans.hosts_added') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val red">-' + s.hosts_removed + '</div><div class="ds-label">' + t('scans.hosts_removed') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val">' + s.ports_in_scan1 + '</div><div class="ds-label">' + t('scans.ports_a') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val">' + s.ports_in_scan2 + '</div><div class="ds-label">' + t('scans.ports_b') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val green">+' + s.ports_added + '</div><div class="ds-label">' + t('scans.ports_added') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val red">-' + s.ports_removed + '</div><div class="ds-label">' + t('scans.ports_removed') + '</div></div>';
            html += '<div class="diff-summary-item"><div class="ds-val yellow">~' + s.ports_changed + '</div><div class="ds-label">' + t('scans.changed') + '</div></div>';
            html += '</div>';

            if (data.hosts_added && data.hosts_added.length) {
                html += '<div class="diff-section"><h4>' + t('scans.hosts_added') + ' <span class="diff-count">(' + data.hosts_added.length + ')</span></h4>';
                data.hosts_added.forEach(function(h) {
                    html += '<div class="diff-host"><span class="diff-ip">' + esc(h.ip) + '</span><span class="diff-meta">' + esc(h.hostname) + ' ' + esc(h.os) + '</span></div>';
                });
                html += '</div>';
            }
            if (data.hosts_removed && data.hosts_removed.length) {
                html += '<div class="diff-section"><h4>' + t('scans.hosts_removed') + ' <span class="diff-count">(' + data.hosts_removed.length + ')</span></h4>';
                data.hosts_removed.forEach(function(h) {
                    html += '<div class="diff-host"><span class="diff-ip">' + esc(h.ip) + '</span><span class="diff-meta">' + esc(h.hostname) + ' ' + esc(h.os) + '</span></div>';
                });
                html += '</div>';
            }

            function portRows(ports, cls) {
                if (!ports || !ports.length) return '';
                var tbl = '<table class="diff-table"><tr><th>' + t('scans.ip') + '</th><th>' + t('scans.port') + '</th><th>' + t('scans.proto') + '</th><th>' + t('scans.state') + '</th><th>' + t('scans.service') + '</th><th>' + t('scans.product') + '</th><th>' + t('scans.version') + '</th></tr>';
                ports.forEach(function(p) {
                    tbl += '<tr class="' + cls + '"><td>' + esc(p.ip) + '</td><td>' + p.port + '/' + esc(p.protocol) + '</td><td>' + esc(p.protocol) + '</td>';
                    tbl += '<td>' + esc(p.state);
                    if (p.old_state) tbl += '<span class="diff-old">' + esc(p.old_state) + '</span>';
                    tbl += '</td><td>' + esc(p.service);
                    if (p.old_service) tbl += '<span class="diff-old">' + esc(p.old_service) + '</span>';
                    tbl += '</td><td>' + esc(p.product);
                    if (p.old_product) tbl += '<span class="diff-old">' + esc(p.old_product) + '</span>';
                    tbl += '</td><td>' + esc(p.version);
                    if (p.old_version) tbl += '<span class="diff-old">' + esc(p.old_version) + '</span>';
                    tbl += '</td></tr>';
                });
                tbl += '</table>';
                return tbl;
            }

            if (data.ports_added && data.ports_added.length) {
                html += '<div class="diff-section"><h4>' + t('scans.ports_added') + ' <span class="diff-count">(' + data.ports_added.length + ')</span></h4>' + portRows(data.ports_added, 'diff-added') + '</div>';
            }
            if (data.ports_removed && data.ports_removed.length) {
                html += '<div class="diff-section"><h4>' + t('scans.ports_removed') + ' <span class="diff-count">(' + data.ports_removed.length + ')</span></h4>' + portRows(data.ports_removed, 'diff-removed') + '</div>';
            }
            if (data.ports_changed && data.ports_changed.length) {
                html += '<div class="diff-section"><h4>' + t('scans.ports_changed') + ' <span class="diff-count">(' + data.ports_changed.length + ')</span></h4>' + portRows(data.ports_changed, 'diff-changed') + '</div>';
            }

            html += '<div style="text-align:center;margin-top:12px;font-size:0.78rem;color:var(--text-muted)">';
            html += t('scans.scan_a') + ' #' + data.scan1.id + ' ' + esc(data.scan1.target) + ' (' + esc(data.scan1.started_at) + ')';
            html += '<br>';
            html += t('scans.scan_b') + ' #' + data.scan2.id + ' ' + esc(data.scan2.target) + ' (' + esc(data.scan2.started_at) + ')';
            html += '</div>';

            el.innerHTML = html;
            el.style.display = 'block';
        }
        window.compareScans = compareScans;
        window.runCompare = runCompare;

        function resetScanFilters() {
            document.getElementById('scan-search').value = '';
            var wrap = document.getElementById('scan-search-wrap');
            var toggle = document.getElementById('scan-search-toggle');
            if (wrap) wrap.style.display = 'none';
            if (toggle) toggle.style.display = '';
            document.getElementById('scan-profile-filter').value = '';
            selectedStatus = '';
            document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('chip-active'));
            document.querySelector('#filter-chips .chip[data-action="setStatusFilter"][data-status=""]').classList.add('chip-active');
            selectedConfirm = '';
            document.querySelectorAll('#filter-chips .chip[data-action="setConfirmFilter"]').forEach(c => c.classList.remove('chip-active'));
            renderScans(allScans);
        }
