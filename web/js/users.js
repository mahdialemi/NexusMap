var allUsers = [];
var dbImportFile = null;
var dbImportPreviewData = {};

document.addEventListener('click', function(e) {
    var el = e.target.closest('#about-modal.modal-overlay');
    if (el && el === e.target) { hideAboutModal(); return; }
});

async function init() {
    currentUser = await me();
    if (!currentUser) { window.location.href = '/login'; return; }
    if (currentUser.role !== 'admin') { window.location.href = '/'; return; }

    var ui = document.getElementById('user-info');
    ui.textContent = currentUser.username;
    ui.classList.add('user-admin');

    await loadUsers();
    loadAdminStats();
    setupDropZone();
}

function togglePassword(e) {
    var btn = e.currentTarget;
    var inputId = btn.getAttribute('data-input');
    var input = document.getElementById(inputId);
    var isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.innerHTML = isPassword
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function switchTab(e) {
    var tab = this.getAttribute('data-tab');
    document.querySelectorAll('.sidebar-btn[data-tab]').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function(c) { c.style.display = 'none'; });
    this.classList.add('active');
    document.getElementById('panel-' + tab).style.display = '';
}

async function loadAdminStats() {
    try {
        var res = await fetch('/api/db?action=stats');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var stats = await res.json();

        document.getElementById('kpi-users').textContent = stats.total_users || 0;
        document.getElementById('kpi-projects').textContent = stats.total_projects || 0;
        document.getElementById('kpi-scans').textContent = stats.total_scans || 0;
        document.getElementById('kpi-db-size').textContent = stats.db_size_pretty || '-';

        document.getElementById('stat-tables').textContent = stats.tables ? stats.tables.length : '-';
        document.getElementById('stat-rows').textContent = formatNum(stats.total_rows || 0);
        document.getElementById('stat-size').textContent = stats.db_size_pretty || '-';
    } catch (e) {
        document.getElementById('kpi-grid').innerHTML = '<div class="empty-state"><p>' + t('admin.error_loading_stats') + esc(e.message) + '</p></div>';
    }
}

async function loadUsers() {
    var tbody = document.getElementById('users-tbody');
    try {
        allUsers = await getUsers();
        renderUsers(allUsers);
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell" style="color:#ef4444;">' + t('admin.error_loading_users') + esc(e.message) + '</td></tr>';
    }
}

function renderUsers(users) {
    var tbody = document.getElementById('users-tbody');
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">' + t('admin.no_users_found') + '</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(function(u) {
        var row = '<tr><td>' + u.id + '</td><td><strong>' + esc(u.username) + '</strong></td><td><span class="role-badge">' + u.role + '</span></td><td style="color:var(--text-muted);font-size:0.85rem;">' + formatDate(u.created_at) + '</td><td>';
        if (u.username !== 'admin') {
            row += '<div style="display:flex;gap:4px;">' +
                '<button class="btn btn-secondary btn-sm" data-action="showEditModal" data-user-id="' + u.id + '" data-username="' + esc(u.username) + '" data-role="' + u.role + '" title="' + t('common.edit') + '">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                '</button>' +
                '<button class="btn btn-warning btn-sm" data-action="showResetModal" data-user-id="' + u.id + '" data-username="' + esc(u.username) + '" title="' + t('admin.reset_password') + '">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>' +
                '</button>' +
                '<button class="btn btn-danger btn-sm" data-action="deleteUserConfirm" data-user-id="' + u.id + '" data-username="' + esc(u.username) + '" title="' + t('app.delete') + '">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                '</button>' +
                '</div>';
        } else {
            row += '<span style="color:#64748b;font-size:0.8rem;">' + t('admin.protected') + '</span>';
        }
        row += '</td></tr>';
        return row;
    }).join('');
}

function filterUsers(e) {
    var val = typeof e === 'string' ? e : this.value;
    var q = val.toLowerCase();
    var filtered = allUsers.filter(function(u) {
        return (u.username || '').toLowerCase().indexOf(q) !== -1 ||
               (u.role || '').toLowerCase().indexOf(q) !== -1;
    });
    renderUsers(filtered);
}

function closeModalBackdrop(e) {
    if (e.target !== this) return;
    var id = this.id;
    if (id === 'create-modal') hideCreateModal();
    else if (id === 'edit-modal') hideEditModal();
    else if (id === 'reset-modal') hideResetModal();
}

function showCreateModal() {
    document.getElementById('create-modal').style.display = 'flex';
    document.getElementById('new-username').focus();
    document.getElementById('create-error').style.display = 'none';
}

function hideCreateModal() {
    document.getElementById('create-modal').style.display = 'none';
    document.getElementById('create-form').reset();
    document.getElementById('create-error').style.display = 'none';
}

function showEditModal(e) {
    var id = parseInt(this.getAttribute('data-user-id'));
    var username = this.getAttribute('data-username');
    var role = this.getAttribute('data-role');
    document.getElementById('edit-user-id').value = id;
    document.getElementById('edit-role').value = role;
    document.getElementById('edit-error').style.display = 'none';
    document.getElementById('edit-modal').style.display = 'flex';
}

function hideEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function saveEditUser() {
    var id = parseInt(document.getElementById('edit-user-id').value);
    var role = document.getElementById('edit-role').value;
    try {
        await updateUser(id, role);
        hideEditModal();
        await loadUsers();
        showToast(t('admin.user_updated'));
    } catch (e) {
        showToast(t('app.error') + ': ' + e.message, 'error');
    }
}

function showResetModal(e) {
    var id = parseInt(this.getAttribute('data-user-id'));
    var username = this.getAttribute('data-username');
    document.getElementById('reset-user-id').value = id;
    document.getElementById('reset-subtitle').textContent = username;
    document.getElementById('reset-password').value = '';
    document.getElementById('reset-error').style.display = 'none';
    document.getElementById('reset-modal').style.display = 'flex';
    document.getElementById('reset-password').focus();
}

function hideResetModal() {
    document.getElementById('reset-modal').style.display = 'none';
}

async function doResetPassword() {
    var id = parseInt(document.getElementById('reset-user-id').value);
    var password = document.getElementById('reset-password').value;
    if (password.length < 6) {
        document.getElementById('reset-error').textContent = t('admin.password_min_length');
        document.getElementById('reset-error').style.display = 'block';
        return;
    }
    try {
        await resetUserPassword(id, password);
        hideResetModal();
        showToast(t('admin.password_reset_success'));
    } catch (e) {
        showToast(t('app.error') + ': ' + e.message, 'error');
    }
}

document.getElementById('create-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var username = document.getElementById('new-username').value.trim();
    var password = document.getElementById('new-password').value;
    var role = document.getElementById('new-role').value;
    var errorEl = document.getElementById('create-error');

    if (!username || username.length < 3) {
        errorEl.textContent = t('admin.username_min_length');
        errorEl.style.display = 'block';
        return;
    }
    if (!password || password.length < 6) {
        errorEl.textContent = t('admin.password_min_length');
        errorEl.style.display = 'block';
        return;
    }

    try {
        await createUser(username, password, role);
        hideCreateModal();
        await loadUsers();
        showToast(t('admin.user_created').replace('{name}', username));
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
});

async function deleteUserConfirm(e) {
    var id = parseInt(this.getAttribute('data-user-id'));
    var name = this.getAttribute('data-username');
    if (confirm(t('admin.confirm_delete_user').replace('{name}', name))) {
        try {
            await deleteUser(id);
            await loadUsers();
            showToast(t('admin.user_deleted').replace('{name}', name));
        } catch (err) {
            showToast(err.message, 'error');
        }
    }
}



init();

document.addEventListener('tab:switch', function() {});

function loadActivityLog() {
    var container = document.getElementById('activity-log-container');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>' + t('app.loading') + '</p></div>';
    fetch('/api/db/activity?action=activity')
        .then(function(r) { return r.json(); })
        .then(function(data) {
        if (data.error) { container.innerHTML = '<div class="empty-state"><p style="color:#ef4444;">' + t('app.error') + ': ' + esc(data.error) + '</p></div>'; return; }
            var entries = data.entries || [];
            if (!entries.length) { container.innerHTML = '<div class="empty-state"><p>' + t('admin.no_activity') + '</p></div>'; return; }
            var html = '<div class="table-container"><table class="table"><thead><tr><th style="width:50px;">#</th><th style="width:100px;">' + t('table.action') + '</th><th>' + t('table.details') + '</th><th style="width:100px;">' + t('table.user') + '</th><th style="width:160px;">' + t('table.time') + '</th></tr></thead><tbody>';
            entries.forEach(function(e) {
                var color = e.action === 'vacuum' || e.action === 'prune' ? '#22c55e' : e.action.indexOf('delete') >= 0 || e.action.indexOf('reset') >= 0 ? '#ef4444' : e.action.indexOf('create') >= 0 ? '#3b82f6' : 'var(--text)';
                html += '<tr><td style="color:var(--text-muted);font-size:0.8rem;">' + e.id + '</td><td><span style="color:' + color + ';font-size:0.8rem;font-weight:500;">' + esc(e.action) + '</span></td><td style="font-size:0.85rem;">' + esc(e.details) + '</td><td style="font-size:0.8rem;color:var(--text-muted);">' + esc(e.username || '-') + '</td><td style="font-size:0.8rem;color:var(--text-muted);">' + e.created_at + '</td></tr>';
            });
            html += '</tbody></table></div><p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">' + t('admin.total_entries').replace('{count}', data.total) + '</p>';
            container.innerHTML = html;
        })
        .catch(function(err) { container.innerHTML = '<div class="empty-state"><p style="color:#ef4444;">' + t('app.error') + ': ' + esc(err.message) + '</p></div>'; });
}

function doPrune() {
    var days = parseInt(document.getElementById('prune-days').value);
    if (!days || days < 1) { showToast(t('admin.enter_valid_days'), 'error'); return; }
    if (!confirm(t('admin.confirm_prune').replace('{days}', days))) return;
    var el = document.getElementById('prune-result');
    el.innerHTML = '<div style="padding:10px;background:rgba(59,130,246,0.1);border-radius:8px;color:#3b82f6;font-size:0.85rem;">' + t('admin.pruning') + '</div>';
    fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prune', days: days }) })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) { el.innerHTML = '<div style="padding:10px;background:rgba(239,68,68,0.1);border-radius:8px;color:#ef4444;font-size:0.85rem;">' + t('app.error') + ': ' + esc(data.error) + '</div>'; return; }
            el.innerHTML = '<div style="padding:10px;background:rgba(34,197,94,0.1);border-radius:8px;color:#22c55e;font-size:0.85rem;">' + t('admin.prune_result').replace('{deleted}', data.deleted).replace('{days}', days) + '</div>';
            loadAdminStats();
        })
        .catch(function(err) { el.innerHTML = '<div style="padding:10px;background:rgba(239,68,68,0.1);border-radius:8px;color:#ef4444;font-size:0.85rem;">' + t('app.error') + ': ' + esc(err.message) + '</div>'; });
}

async function loadSystemHealth() {
    var container = document.getElementById('system-health-container');
    try {
        var res = await fetch('/api/db/health');
        var data = await res.json();
        if (data.error) { container.innerHTML = '<div class="empty-state"><p style="color:#ef4444;">' + t('app.error') + ': ' + esc(data.error) + '</p></div>'; return; }
        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">';
        var cards = [
            { label: t('admin.status'), value: data.status, color: data.status === 'ok' ? '#22c55e' : '#ef4444' },
            { label: t('admin.version'), value: data.version, color: 'var(--cyan)' },
            { label: t('admin.sqlite_version'), value: data.sqlite_version, color: 'var(--text)' }
        ];
        cards.forEach(function(c) {
            html += '<div class="db-stat-card"><div class="db-stat-value" style="color:' + c.color + ';">' + c.value + '</div><div class="db-stat-label">' + c.label + '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p style="color:#ef4444;">' + t('app.error') + ': ' + esc(e.message) + '</p></div>';
    }
}

var origSwitchTab = switchTab;
switchTab = function(e) {
    origSwitchTab.call(this, e);
    var tab = this.getAttribute('data-tab');
    if (tab === 'activity') { loadActivityLog(); }
    if (tab === 'system') { loadSystemHealth(); }
};

var origLoadStats = loadAdminStats;
loadAdminStats = function() {
    origLoadStats();
    fetch('/api/db/stats?action=stats')
        .then(function(r) { return r.json(); })
        .then(function(stats) {
            var rec = document.getElementById('vacuum-recommend');
            var text = document.getElementById('vacuum-recommend-text');
            if (stats.vacuum_size && stats.db_size_bytes && stats.vacuum_size > 0) {
                var pct = (stats.vacuum_size / stats.db_size_bytes * 100);
                if (pct > 5) {
                    rec.style.display = 'flex';
                    rec.style.background = 'rgba(251,191,36,0.08)';
                    rec.style.border = '1px solid rgba(251,191,36,0.2)';
                    text.innerHTML = '&#9888; ' + t('admin.database_fragmentation') + ': ~<strong>' + pct.toFixed(1) + '%</strong> ' + t('admin.reclaimable') + ' (<strong>' + formatFileSize(stats.vacuum_size) + '</strong>). <a href="#" data-action="vacuumDB" style="color:var(--accent);">' + t('admin.vacuum_now') + '</a>';
                    return;
                }
            }
            rec.style.display = 'none';
        })
        .catch(function() {});
};

async function vacuumDB() {
    if (!confirm(t('admin.confirm_vacuum'))) return;
    showDBResult(t('admin.vacuuming'), 'info');
    try {
        const res = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'vacuum' }) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const result = await res.json();
        showDBResult(t('admin.vacuum_complete').replace('{before}', result.before).replace('{after}', result.after).replace('{saved}', result.saved).replace('{pct}', result.saved_pct.toFixed(1)), 'success');
        loadAdminStats();
    } catch (e) {
        showDBResult(t('app.error') + ': ' + e.message, 'error');
    }
}

async function backupDB() {
    window.location.href = '/api/db/backup?action=backup';
}

async function resetDB() {
    if (!confirm(t('admin.confirm_reset_db'))) return;
    if (!confirm(t('admin.confirm_reset_last_chance'))) return;
    showDBResult(t('admin.resetting_db'), 'info');
    try {
        const res = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        showDBResult(t('admin.reset_db_complete'), 'success');
        setTimeout(function() { window.location.href = '/'; }, 1500);
    } catch (e) {
        showDBResult(t('app.error') + ': ' + e.message, 'error');
    }
}

async function factoryReset() {
    if (!confirm(t('admin.confirm_factory_reset'))) return;
    if (!confirm(t('admin.confirm_factory_reset_last'))) return;
    showDBResult(t('admin.factory_resetting'), 'info');
    try {
        const res = await fetch('/api/db/factory-reset', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        showDBResult(t('admin.factory_reset_complete'), 'success');
        setTimeout(function() { window.location.href = '/login'; }, 2000);
    } catch (e) {
        showDBResult(t('app.error') + ': ' + e.message, 'error');
    }
}

function showDBResult(msg, type) {
    var el = document.getElementById('db-action-result');
    var colors = { info: 'rgba(59,130,246,0.1)', success: 'rgba(34,197,94,0.1)', error: 'rgba(239,68,68,0.1)' };
    var textColors = { info: '#3b82f6', success: '#22c55e', error: '#ef4444' };
    el.style.padding = '10px';
    el.style.borderRadius = '8px';
    el.style.background = colors[type] || colors.info;
    el.style.color = textColors[type] || textColors.info;
    el.textContent = msg;
}

function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function clickImport() {
    document.getElementById('db-import-file').click();
}

function setupDropZone() {
    var zone = document.getElementById('db-import-drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor = 'var(--cyan)'; });
    zone.addEventListener('dragleave', function() { zone.style.borderColor = 'var(--border)'; });
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.style.borderColor = 'var(--border)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            var input = document.getElementById('db-import-file');
            input.files = e.dataTransfer.files;
            onDBImportFileSelect(input);
        }
    });
}

function onDBImportFileSelect(input) {
    if (input.files && input.files[0]) {
        dbImportFile = input.files[0];
        document.getElementById('db-import-file-name').textContent = dbImportFile.name;
        document.getElementById('db-import-file-size').textContent = formatFileSize(dbImportFile.size);
        document.getElementById('db-import-file-selected').style.display = '';
        document.getElementById('db-import-preview').style.display = 'none';
        document.getElementById('db-import-error').style.display = 'none';
        document.getElementById('db-import-actions').style.display = 'flex';
        document.getElementById('btn-preview-db-import').disabled = false;
        document.getElementById('btn-do-db-import').disabled = true;
    }
}

async function previewDBImport() {
    if (!dbImportFile) return;
    document.getElementById('db-import-preview').style.display = '';
    document.getElementById('db-import-preview').innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner" style="margin:0 auto;"></div><p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">' + t('admin.reading_db') + '</p></div>';
    document.getElementById('db-import-error').style.display = 'none';
    try {
        var fd = new FormData();
        fd.append('file', dbImportFile);
        var res = await fetch('/api/db/import?action=preview', { method: 'POST', body: fd });
        if (!res.ok) {
            var txt = await res.text();
            throw new Error('HTTP ' + res.status + ': ' + txt);
        }
        dbImportPreviewData = await res.json();
        var html = '<div class="import-preview-bar">';
        html += '<div class="import-preview-item"><div class="import-preview-value">' + formatNum(dbImportPreviewData.projects || 0) + '</div><div class="import-preview-label">' + t('admin.import_projects') + '</div></div>';
        html += '<div class="import-preview-item"><div class="import-preview-value">' + formatNum(dbImportPreviewData.scans || 0) + '</div><div class="import-preview-label">' + t('admin.import_scans') + '</div></div>';
        html += '<div class="import-preview-item"><div class="import-preview-value">' + formatNum(dbImportPreviewData.hosts || 0) + '</div><div class="import-preview-label">' + t('admin.import_hosts') + '</div></div>';
        html += '<div class="import-preview-item"><div class="import-preview-value">' + formatNum(dbImportPreviewData.ports || 0) + '</div><div class="import-preview-label">' + t('admin.import_ports') + '</div></div>';
        html += '</div>';
        document.getElementById('db-import-preview').innerHTML = html;
        document.getElementById('btn-do-db-import').disabled = false;
    } catch (e) {
        document.getElementById('db-import-preview').style.display = 'none';
        document.getElementById('db-import-error').textContent = e.message;
        document.getElementById('db-import-error').style.display = '';
    }
}

async function doDBImport() {
    if (!dbImportFile) return;
    if (!confirm(t('admin.confirm_import'))) return;
    document.getElementById('db-import-result').innerHTML = '<div style="padding:10px;background:rgba(59,130,246,0.1);border-radius:8px;color:#3b82f6;font-size:0.85rem;">' + t('admin.importing') + '</div>';
    try {
        var fd = new FormData();
        fd.append('file', dbImportFile);
        var res = await fetch('/api/db/import', { method: 'POST', body: fd });
        if (!res.ok) {
            var txt = await res.text();
            throw new Error('HTTP ' + res.status + ': ' + txt);
        }
        var result = await res.json();
        document.getElementById('db-import-result').innerHTML = '<div style="padding:10px;background:rgba(34,197,94,0.1);border-radius:8px;color:#22c55e;font-size:0.85rem;">' + t('admin.import_result').replace('{count}', formatNum(result.imported)) + '</div>';
        loadAdminStats();
        dbImportFile = null;
        document.getElementById('db-import-file').value = '';
        document.getElementById('db-import-file-selected').style.display = 'none';
        document.getElementById('db-import-preview').style.display = 'none';
        document.getElementById('db-import-actions').style.display = 'none';
        document.getElementById('btn-preview-db-import').disabled = true;
        document.getElementById('btn-do-db-import').disabled = true;
    } catch (e) {
        document.getElementById('db-import-result').innerHTML = '<div style="padding:10px;background:rgba(239,68,68,0.1);border-radius:8px;color:#ef4444;font-size:0.85rem;">' + t('app.error') + ': ' + e.message + '</div>';
    }
}

function backToProjects() { window.location.href = '/'; }
function goToSettings() { window.location.href = '/settings'; }
function showAboutModal() { document.getElementById('about-modal').style.display = 'flex'; }
function hideAboutModal() { document.getElementById('about-modal').style.display = 'none'; }