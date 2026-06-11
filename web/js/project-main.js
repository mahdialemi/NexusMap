        const projectId = window.location.pathname.split('/').pop();
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
                var nameEl = document.getElementById('header-project-name');
                if (nameEl) nameEl.textContent = '\u2022 ' + currentProject.name;
                var nameNavEl = document.getElementById('header-project-name-nav');
                if (nameNavEl) nameNavEl.textContent = currentProject.name;
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

            // Restore last active tab
            var savedTab = sessionStorage.getItem('project-tab-' + projectId);
            if (savedTab && savedTab !== 'scans') {
                var btn = document.querySelector('.sidebar-btn[data-tab="' + savedTab + '"]');
                if (btn) showTab(savedTab, btn);
            }
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
            if (refreshInterval) return;
            refreshInterval = setInterval(() => loadScans(), 3000);
        }

        function stopAutoRefresh() {
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        }

        function manageRefresh(hasRunning) {
            if (hasRunning) { startAutoRefresh(); }
            else { stopAutoRefresh(); }
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

        async function confirmAllScans() {
            const pending = document.querySelectorAll('.scan-card-pending');
            if (!pending.length) { showToast('No pending scans to confirm', 'info'); return; }
            if (!confirm('Confirm all ' + pending.length + ' pending scans?')) return;
            try {
                const res = await fetch('/api/projects/' + projectId + '/scans/confirm-all', {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': csrfToken }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed');
                showToast('Confirmed ' + data.confirmed + ' scans', 'success');
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

        function showAboutModal() {
            document.getElementById('about-modal').style.display = 'flex';
        }
        function hideAboutModal() {
            document.getElementById('about-modal').style.display = 'none';
        }
        function goToAdmin() { window.location.href = '/admin'; }

        // Schedule helpers
        function toggleSchedOptions() {
            const enabled = document.getElementById('sched-enabled').checked;
            document.getElementById('sched-options').style.display = enabled ? '' : 'none';
            if (enabled) populateSchedDepScans();
        }

        function toggleSchedType() {
            const type = document.querySelector('input[name="sched-type"]:checked').value;
            document.getElementById('sched-time-options').style.display = type === 'time' ? '' : 'none';
            document.getElementById('sched-dep-options').style.display = type === 'dependency' ? '' : 'none';
        }

        function populateSchedDepScans() {
            const sel = document.getElementById('sched-dep-scan');
            if (!sel) return;
            sel.innerHTML = '<option value="">Select a scan...</option>';
            for (const s of allScans) {
                if (s.status !== 'pending' && s.status !== 'running') continue;
                const o = document.createElement('option');
                o.value = s.id;
                const label = '#' + s.id + ' ' + esc(s.target) + ' (' + s.status + ')';
                o.textContent = label;
                sel.appendChild(o);
            }
        }

        document.addEventListener('click', function(e) {
            if (e.target.closest('#about-modal.modal-overlay') && e.target === e.target.closest('#about-modal')) {
                hideAboutModal();
            }
        });

        init();
