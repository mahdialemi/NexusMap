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
                    text.textContent = t('import.auto_confirm');
                } else {
                    label.style.background = 'rgba(100,100,100,0.08)';
                    label.style.borderColor = 'var(--border)';
                    label.style.color = 'var(--text-muted)';
                    text.textContent = t('import.manual');
                }
            }
            label.addEventListener('click', update);
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
            var el = input;
            if (!el || !el.files) el = this;
            var files = el.files;
            if (!files || !files.length) return;
            const maxFiles = 5;
            for (let i = 0; i < files.length; i++) {
                if (importedFiles.length >= maxFiles) break;
                importedFiles.push(files[i]);
            }
            el.value = '';
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ${t('import.add_file', 'Add file')}
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
                detect.textContent = fmt + ' ' + t('import.detected');
                detect.style.color = 'var(--accent)';
            } else {
                detect.textContent = t('import.unknown_format');
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
            if (!hasImportContent()) { showToast(t('import.select_file_or_paste'), 'error'); return; }

            const btn = document.getElementById('btn-do-import');
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.textContent = t('import.importing');

            const progressDiv = document.getElementById('import-progress');
            const progressFill = document.getElementById('import-progress-fill');
            const progressText = document.getElementById('import-progress-text');
            progressDiv.style.display = 'block';
            progressFill.style.width = '0%';
            progressFill.classList.remove('complete');
            progressText.textContent = t('import.preparing');

            try {
                const formData = getImportData();
                progressFill.style.width = '10%';
                progressText.textContent = t('import.uploading');

                const res = await fetch(`/api/import/${projectId}`, { method: 'POST', body: formData });
                progressFill.style.width = '80%';
                progressText.textContent = t('import.processing');

                const data = await res.json();

                if (data.error) {
                    showToast(t('import.import_failed') + data.error, 'error');
                    progressText.textContent = t('import.failed') + data.error;
                    progressDiv.style.display = 'none';
                } else {
                    progressFill.style.width = '100%';
                    progressFill.classList.add('complete');
                    progressText.textContent = t('import.complete');
                    showToast(t('import.successful') + (data.auto_confirmed ? t('import.auto_confirmed_suffix') : ''));
                    setTimeout(() => { progressDiv.style.display = 'none'; }, 1500);
                    resetImportUI();
                    await loadScans();
                }
            } catch (e) {
                showToast(t('import.import_failed') + e.message, 'error');
                document.getElementById('import-progress').style.display = 'none';
            } finally {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.textContent = t('import.import_btn');
            }
        }

        async function previewImport() {
            if (!hasImportContent()) { showToast(t('import.select_file_or_paste'), 'error'); return; }

            const btn = document.getElementById('btn-preview-import');
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.textContent = t('import.parsing');

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
                        let tableHtml = '<table class="data-table" style="margin-top:10px;font-size:0.8rem;"><thead><tr><th style="width:28px;"><input type="checkbox" id="preview-select-all" checked onchange="togglePreviewAll()"></th><th>' + t('common.ip', 'IP') + '</th><th>' + t('common.port', 'Port') + '</th><th>' + t('common.proto', 'Proto') + '</th><th>' + t('common.state', 'State') + '</th><th>' + t('common.service', 'Service') + '</th></tr></thead><tbody>';
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
                        errDiv.textContent = t('import.no_hosts_or_ports');
                        errDiv.style.display = 'block';
                    }
                }
            } catch (e) {
                errDiv.textContent = t('import.preview_failed') + e.message;
                errDiv.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.textContent = t('import.preview');
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
                        ? '<span style="color:#22c55e;" title="' + t('import.completed_status', 'Completed') + '">&#10003;</span>'
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
