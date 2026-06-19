var notifOpen = false;
var filterTimer;
var selectedTags = [];
var allProjects = [];
var selectedIds = [];
var selectAllMode = false;
var ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
var tagColors = [
    {bg:'#dbeafe',fg:'#1d4ed8',border:'#93c5fd'},
    {bg:'#dcfce7',fg:'#15803d',border:'#86efac'},
    {bg:'#f3e8ff',fg:'#7e22ce',border:'#c4b5fd'},
    {bg:'#fef3c7',fg:'#b45309',border:'#fcd34d'},
    {bg:'#cffafe',fg:'#0e7490',border:'#67e8f9'},
    {bg:'#fce7f3',fg:'#be185d',border:'#f9a8d4'},
    {bg:'#ccfbf1',fg:'#0f766e',border:'#5eead4'},
    {bg:'#ffedd5',fg:'#c2410c',border:'#fdba74'},
    {bg:'#ede9fe',fg:'#6d28d9',border:'#c4b5fd'},
    {bg:'#e0e7ff',fg:'#4338ca',border:'#a5b4fc'}
];

async function indexInit() {
    initCSRF();
    currentUser = await me();
    if (!currentUser) {
        window.location.href = '/login';
        return;
    }
    document.getElementById('user-info').textContent = currentUser.username;

    if (currentUser.role === 'admin') {
        var al = document.getElementById('admin-link');
        if (al) al.style.display = '';
        var ui = document.getElementById('user-info');
        if (ui) ui.classList.add('user-admin');
    }
    await populateOwners();
    await loadProjects();
    setInterval(async function() {
        if (document.visibilityState === 'visible') {
            try {
                var res = await fetch('/api/projects');
                if (!res.ok) throw new Error('Failed to refresh project count');
                var fresh = await res.json();
                var countEl = document.getElementById('project-count');
                if (countEl) countEl.textContent = '(' + fresh.length + ')';
            } catch(e) {}
        }
    }, 30000);
}

async function loadProjects() {
    try {
        allProjects = await getProjects();
        sortProjects();
    } catch (e) {
        document.getElementById('projects-list').innerHTML = '<div class="empty-state"><p>Error loading projects</p></div>';
    }
}

function showCreateModal() {
    document.getElementById('create-modal').style.display = 'flex';
    document.getElementById('project-name').focus();
}

function hideCreateModal() {
    document.getElementById('create-modal').style.display = 'none';
    document.getElementById('create-form').reset();
}

function goToProject(e) {
    window.location.href = '/project/' + this.getAttribute('data-id');
}

function handleDeleteProject(e) {
    e.stopPropagation();
    var id = parseInt(this.getAttribute('data-id'));
    var name = this.getAttribute('data-name');
    deleteProjectConfirm(id, name);
}

async function populateOwners() {
    try {
        var users = await getUsers();
        var opts = users.map(function(u){ return '<option value="'+u.id+'">'+esc(u.username)+'</option>'; }).join('');
        document.getElementById('create-owner').innerHTML = '<option value="">Select owner</option>' + opts;
        document.getElementById('edit-owner').innerHTML = '<option value="">Select owner</option>' + opts;
        document.getElementById('filter-owner').innerHTML = '<option value="">All Owners</option>' + opts;
    } catch(e) {}
}

function showDeleteModal(id, name) {
    document.getElementById('delete-project-name').textContent = name;
    document.getElementById('delete-confirm-btn').setAttribute('data-id', id);
    document.getElementById('delete-modal').style.display = 'flex';
}

function hideDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
}

async function confirmDeleteProject(e) {
    var id = parseInt(this.getAttribute('data-id'));
    try {
        await deleteProject(id);
        hideDeleteModal();
        await loadProjects();
        showToast('Project deleted');
    } catch (e) {
        showToast('Failed to delete project');
    }
}

async function deleteProjectConfirm(id, name) {
    showDeleteModal(id, name);
}

function showAboutModal() {
    document.getElementById('about-modal').style.display = 'flex';
}

function hideAboutModal() {
    document.getElementById('about-modal').style.display = 'none';
}

function goToAdmin() { window.location.href = '/admin'; }
function goToDashboard() { window.location.href = '/dashboard'; }
function goToSettings() { window.location.href = '/settings'; }

async function ensureProjectActionOK(res, fallbackMessage) {
    if (res.ok) return;
    var message = fallbackMessage;
    try {
        var data = await res.json();
        if (data && data.error) message = data.error;
    } catch (e) {}
    throw new Error(message);
}

function showEditProjectModal(e) {
    e.stopPropagation();
    document.getElementById('edit-project-id').value = this.getAttribute('data-id');
    document.getElementById('edit-project-name').value = this.getAttribute('data-name');
    document.getElementById('edit-project-desc').value = this.getAttribute('data-desc');
    document.getElementById('edit-status').value = this.getAttribute('data-status') || 'active';
    document.getElementById('edit-priority').value = this.getAttribute('data-priority') || 'medium';
    document.getElementById('edit-tags').value = this.getAttribute('data-tags') || '';
    document.getElementById('edit-client').value = this.getAttribute('data-client') || '';
    var oid = this.getAttribute('data-owner-id');
    if (oid) document.getElementById('edit-owner').value = oid;
    else document.getElementById('edit-owner').value = '';
    document.getElementById('edit-due').value = this.getAttribute('data-due') || '';
    document.getElementById('edit-modal').style.display = 'flex';
    document.getElementById('edit-project-name').focus();
    document.getElementById('edit-error').style.display = 'none';
}

function hideEditProjectModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function saveEditProject() {
    var id = parseInt(document.getElementById('edit-project-id').value);
    var name = document.getElementById('edit-project-name').value.trim();
    var desc = document.getElementById('edit-project-desc').value.trim();
    var status = document.getElementById('edit-status').value;
    var priority = document.getElementById('edit-priority').value;
    var tags = document.getElementById('edit-tags').value.trim();
    var client = document.getElementById('edit-client').value.trim();
    var owner = document.getElementById('edit-owner').value;
    var due = document.getElementById('edit-due').value;
    if (!name) {
        document.getElementById('edit-error').textContent = 'Project name is required';
        document.getElementById('edit-error').style.display = 'block';
        return;
    }
    try {
        await updateProject(id, name, desc, status, priority, tags, client, owner ? parseInt(owner) : null, due || null);
        hideEditProjectModal();
        await loadProjects();
        showToast('Project updated');
    } catch (e) {
        document.getElementById('edit-error').textContent = e.message;
        document.getElementById('edit-error').style.display = 'block';
    }
}

function filterProjects() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(async function() {
        var search = document.getElementById('search-projects').value.trim();
        var status = document.getElementById('filter-status').value;
        var priority = document.getElementById('filter-priority').value;
        var owner = document.getElementById('filter-owner').value;
        var q = [];
        if (status) q.push('status='+encodeURIComponent(status));
        if (priority) q.push('priority='+encodeURIComponent(priority));
        if (owner) q.push('owner_id='+encodeURIComponent(owner));
        if (search) q.push('search='+encodeURIComponent(search));
        var url = '/api/projects' + (q.length ? '?'+q.join('&') : '');
        try {
            var res = await fetch(url);
            if (!res.ok) throw new Error('Failed to load projects');
            allProjects = await res.json();
            sortProjects();
        } catch(e) {}
    }, 300);
}

function clearProjectSearch() {
    document.getElementById('search-projects').value = '';
    filterProjects();
}

function sortProjects() {
    renderProjects(allProjects);
}

function groupProjects() {
    sortProjects();
}

function renderProjects(projects) {
    var list = document.getElementById('projects-list');
    var countEl = document.getElementById('project-count');
    if (!projects || projects.length === 0) {
        if (countEl) countEl.textContent = '';
        var hasFilters = document.getElementById('filter-status').value || document.getElementById('filter-priority').value || document.getElementById('filter-owner').value || document.getElementById('search-projects').value;
        if (hasFilters) {
            list.innerHTML = '<div class="empty-state"><h3>No projects found</h3><p>Try adjusting your filters</p></div>';
        } else {
            list.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-folder-plus"/></svg></div><h3>No projects yet</h3><p>Create your first project to start scanning</p><div class="empty-state-cta"><button class="btn btn-primary" data-action="showCreateModal"> Create Project</button></div></div>';
        }
        updateBulkBar();
        return;
    }
    if (countEl) countEl.textContent = '(' + projects.length + ')';
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    var today = new Date(todayStr + 'T00:00:00');
    var threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    var thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    var groupBy = document.getElementById('group-projects').value;
    var sorted = projects.slice();
    sorted.sort(function(a, b) {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        var sort = document.getElementById('sort-projects').value;
        var priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
        switch(sort) {
            case 'oldest': return new Date(a.created_at) - new Date(b.created_at);
            case 'name': return (a.name||'').localeCompare(b.name||'');
            case 'name_desc': return (b.name||'').localeCompare(a.name||'');
            case 'priority': return (priorityRank[a.priority] || 2) - (priorityRank[b.priority] || 2);
            case 'scans': return (b.scan_count||0) - (a.scan_count||0);
            case 'due': return (a.due_date||'') < (b.due_date||'') ? -1 : (a.due_date||'') > (b.due_date||'') ? 1 : 0;
            default: return new Date(b.created_at) - new Date(a.created_at);
        }
    });
    var groups = {};
    if (groupBy) {
        for (var i = 0; i < sorted.length; i++) {
            var key = '';
            if (groupBy === 'status') key = sorted[i].status || 'active';
            else if (groupBy === 'priority') key = sorted[i].priority || 'medium';
            else if (groupBy === 'owner') key = sorted[i].owner_name || 'Unassigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(sorted[i]);
        }
    } else {
        groups['_all'] = sorted;
    }
    var groupOrder = groupBy === 'priority' ? ['critical','high','medium','low'] : null;
    var groupLabels = { active: 'Active', archived: 'Archived', completed: 'Completed', critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
    if (groupBy === 'status') {
        groupOrder = ['active', 'archived', 'completed'];
    }
    var html = '';
    var keys = Object.keys(groups);
    if (groupOrder) {
        var orderedKeys = [];
        for (var gi = 0; gi < groupOrder.length; gi++) {
            if (groups[groupOrder[gi]]) orderedKeys.push(groupOrder[gi]);
        }
        for (var gi = 0; gi < keys.length; gi++) {
            if (orderedKeys.indexOf(keys[gi]) === -1) orderedKeys.push(keys[gi]);
        }
        keys = orderedKeys;
    }
    for (var gi = 0; gi < keys.length; gi++) {
        var gKey = keys[gi];
        var gProjects = groups[gKey];
        if (groupBy) {
            var label = groupLabels[gKey] || gKey;
            html += '<div class="pli-group-header">' + esc(label) + ' <span class="pli-group-count">' + gProjects.length + '</span></div>';
        }
        for (var pi = 0; pi < gProjects.length; pi++) {
            var p = gProjects[pi];
            html += renderProjectItem(p, today, threeDaysMs, thirtyDaysMs);
        }
    }
    list.innerHTML = html;
    updateBulkBar();
}

function renderProjectItem(p, today, threeDaysMs, thirtyDaysMs) {
    var statusColor = p.status === 'active' ? '#22c55e' : p.status === 'archived' ? '#64748b' : '#3b82f6';
    var priorityColor = p.priority === 'critical' ? '#ef4444' : p.priority === 'high' ? '#f97316' : p.priority === 'medium' ? '#eab308' : '#64748b';
    var tags = p.tags ? p.tags.split(',').filter(Boolean) : [];
    var tagHtml = tags.map(function(t){ return '<span class="pli-chip" data-tag="'+esc(t.trim())+'">#'+esc(t.trim())+'</span>'; }).join('');
    var dueHtml = '';
    if (p.due_date) {
        var dueStr = p.due_date.split('T')[0];
        var dueDate = new Date(dueStr + 'T00:00:00');
        var diff = dueDate - today;
        if (diff < 0) {
            dueHtml = '<span>Due: '+dueStr+' <span class="due-badge due-badge-overdue">Overdue</span></span>';
        } else if (diff < threeDaysMs) {
            dueHtml = '<span>Due: '+dueStr+' <span class="due-badge due-badge-soon">Due soon</span></span>';
        } else {
            dueHtml = '<span>Due: '+dueStr+'</span>';
        }
    }
    // Health dot
    var healthColor = '#ef4444';
    if (p.scan_count > 0 && p.last_scan_at) {
        var lastScanDate = new Date(p.last_scan_at);
        var age = today - lastScanDate;
        if (p.confirmed_count > 0 && age < thirtyDaysMs) {
            healthColor = '#22c55e';
        } else if (age < ninetyDaysMs) {
            healthColor = '#eab308';
        }
    } else if (p.scan_count > 0) {
        healthColor = '#eab308';
    }
    var healthDot = '<span class="pli-health-dot" style="background:'+healthColor+';" title="'+(healthColor==='#22c55e'?'Healthy':healthColor==='#eab308'?'Needs attention':'No scans')+'"></span>';
    // Last scan info
    var lastScanHtml = '';
    if (p.last_scan_at) {
        var lsDate = formatDate(p.last_scan_at);
        var lsStatus = p.last_scan_status || '';
        lastScanHtml = '<span>Last scan: '+lsDate+(lsStatus ? ' ('+esc(lsStatus)+')' : '')+'</span>';
    }
    // Progress
    var progressHtml = '';
    if (p.scan_count > 0) {
        var pct = Math.round((p.confirmed_count||0)/p.scan_count*100);
        progressHtml = '<div class="pli-progress"><div class="scan-progress scan-progress-sm"><div class="scan-progress-bar" style="width:'+pct+'%"></div></div><span class="pli-progress-label">'+(p.confirmed_count||0)+'/'+p.scan_count+' confirmed</span></div>';
    }
    // Pin button
    var pinClass = p.is_pinned ? 'pinned' : '';
    var pinIcon = p.is_pinned ? '\u2605' : '\u2606';
    var pinBtn = currentUser.role === 'admin' ? '<button class="pli-pin-btn '+pinClass+'" data-action="handleTogglePin" data-id="'+p.id+'" title="'+(p.is_pinned?'Unpin':'Pin')+'">'+pinIcon+'</button>' : '';
    // Action buttons
    var archiveBtn = '';
    var duplicateBtn = '';
    var editBtn = '';
    var deleteBtn = '';
    if (currentUser.role === 'admin') {
        var archiveLabel = p.status === 'archived' ? 'Activate' : 'Archive';
        var newStatus = p.status === 'archived' ? 'active' : 'archived';
        archiveBtn = '<button class="btn btn-ghost btn-sm" data-action="handleQuickArchive" data-id="'+p.id+'" data-status="'+newStatus+'" title="'+archiveLabel+'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>';
        duplicateBtn = '<button class="btn btn-ghost btn-sm" data-action="handleDuplicateProject" data-id="'+p.id+'" data-name="'+esc(p.name)+'" title="Duplicate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
        editBtn = '<button class="btn btn-ghost btn-sm" data-action="showEditProjectModal" data-id="'+p.id+'" data-name="'+esc(p.name)+'" data-desc="'+esc(p.description||'')+'" data-status="'+esc(p.status||'active')+'" data-priority="'+esc(p.priority||'medium')+'" data-tags="'+esc(p.tags||'')+'" data-client="'+esc(p.client||'')+'" data-owner-id="'+(p.owner_id!=null?p.owner_id:'')+'" data-due="'+(p.due_date?p.due_date.split('T')[0]:'')+'" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
        deleteBtn = '<button class="btn btn-ghost btn-sm btn-delete" data-action="handleDeleteProject" data-id="'+p.id+'" data-name="'+esc(p.name)+'" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
    }
    var selected = selectedIds.indexOf(p.id) !== -1;
    var checked = selected ? ' checked' : '';
    return '<div class="project-list-item" style="border-left-color:'+priorityColor+';" data-id="'+p.id+'">' +
        '<div class="pli-header">' +
            '<input type="checkbox" class="pli-checkbox" data-id="'+p.id+'"'+checked+'>' +
            '<div class="pli-header-left" data-action="goToProject" data-id="'+p.id+'">' +
                healthDot +
                '<span class="pli-name">'+esc(p.name)+'</span>' +
            '</div>' +
            '<div class="pli-header-right">' +
                '<span class="pli-badge" style="background:'+statusColor+'22;color:'+statusColor+';">'+esc(p.status||'active')+'</span>' +
                '<span class="pli-badge" style="background:'+priorityColor+'22;color:'+priorityColor+';">'+esc(p.priority||'medium')+'</span>' +
                (tagHtml ? '<div class="pli-tags">'+tagHtml+'</div>' : '') +
                pinBtn +
            '</div>' +
        '</div>' +
        (p.description ? '<div class="pli-desc" data-action="goToProject" data-id="'+p.id+'">'+esc(p.description)+'</div>' : '') +
        '<div class="pli-meta" data-action="goToProject" data-id="'+p.id+'">' +
            (p.client ? '<span>Client: '+esc(p.client)+'</span>' : '') +
            (p.owner_name ? '<span>Owner: '+esc(p.owner_name)+'</span>' : '') +
            dueHtml +
            lastScanHtml +
        '</div>' +
        progressHtml +
        '<div class="pli-footer">' +
            '<div class="pli-footer-left" data-action="goToProject" data-id="'+p.id+'">Scans: '+(p.scan_count||0)+' &middot; Created: '+formatDate(p.created_at)+'</div>' +
            '<div class="pli-actions">' +
                archiveBtn +
                duplicateBtn +
                editBtn +
                deleteBtn +
            '</div>' +
        '</div>' +
    '</div>';
}

function updateBulkBar() {
    var bar = document.getElementById('bulk-bar');
    var countEl = document.getElementById('bulk-count');
    var archiveBtn = document.getElementById('bulk-archive-btn');
    var activateBtn = document.getElementById('bulk-activate-btn');
    var deleteBtn = document.getElementById('bulk-delete-btn');
    if (!bar) return;
    var count = selectedIds.length;
    countEl.textContent = count + ' selected';
    if (count > 0) {
        bar.classList.add('visible');
        archiveBtn.style.display = '';
        activateBtn.style.display = '';
        deleteBtn.style.display = '';
    } else {
        bar.classList.remove('visible');
        archiveBtn.style.display = 'none';
        activateBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
    }
}

function handleBulkSelectAll() {
    var cb = document.getElementById('bulk-select-all');
    selectAllMode = cb.checked;
    if (selectAllMode) {
        selectedIds = allProjects.map(function(p){ return p.id; });
    } else {
        selectedIds = [];
    }
    var checkboxes = document.querySelectorAll('#projects-list .pli-checkbox');
    checkboxes.forEach(function(c){ c.checked = selectAllMode; });
    updateBulkBar();
}

function handleBulkArchive() { bulkStatusAction('archived'); }
function handleBulkActivate() { bulkStatusAction('active'); }
function handleBulkDelete() {
    if (!selectedIds.length) return;
    if (!confirm('Delete ' + selectedIds.length + ' projects? This cannot be undone.')) return;
    (async function() {
        try {
            var res = await fetch('/api/projects/bulk/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ ids: selectedIds }) });
            await ensureProjectActionOK(res, 'Failed to delete projects');
            showToast(selectedIds.length + ' projects deleted');
            selectedIds = [];
            selectAllMode = false;
            document.getElementById('bulk-select-all').checked = false;
            await loadProjects();
        } catch(e) {
            showToast(e.message || 'Failed to delete projects');
        }
    })();
}

function bulkStatusAction(status) {
    if (!selectedIds.length) return;
    (async function() {
        try {
            var res = await fetch('/api/projects/bulk/status', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ ids: selectedIds, status: status }) });
            await ensureProjectActionOK(res, 'Failed to update projects');
            showToast(selectedIds.length + ' projects updated');
            selectedIds = [];
            selectAllMode = false;
            document.getElementById('bulk-select-all').checked = false;
            await loadProjects();
        } catch(e) {
            showToast(e.message || 'Failed to update projects');
        }
    })();
}

function handleTogglePin(e) {
    e.stopPropagation();
    var id = parseInt(this.getAttribute('data-id'));
    (async function() {
        try {
            var res = await fetch('/api/projects/' + id + '/pin', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } });
            if (!res.ok) throw new Error('Failed');
            await loadProjects();
        } catch(e) {
            showToast('Failed to toggle pin');
        }
    })();
}

function handleQuickArchive(e) {
    e.stopPropagation();
    var id = parseInt(this.getAttribute('data-id'));
    var status = this.getAttribute('data-status');
    (async function() {
        try {
            var res = await fetch('/api/projects/' + id + '/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ status: status }) });
            await ensureProjectActionOK(res, 'Failed to update project');
            showToast('Project ' + (status === 'archived' ? 'archived' : 'activated'));
            await loadProjects();
        } catch(e) {
            showToast(e.message || 'Failed to update project');
        }
    })();
}

function handleDuplicateProject(e) {
    e.stopPropagation();
    var id = parseInt(this.getAttribute('data-id'));
    var name = this.getAttribute('data-name');
    var newName = prompt('Duplicate project name:', name + ' (Copy)');
    if (!newName) return;
    (async function() {
        try {
            var res = await fetch('/api/projects/' + id + '/duplicate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ name: newName }) });
            await ensureProjectActionOK(res, 'Failed to duplicate project');
            showToast('Project duplicated');
            await loadProjects();
        } catch(e) {
            showToast(e.message || 'Failed to duplicate project');
        }
    })();
}

function handleChipTagClick(e) {
    var chip = e.target.closest('.pli-chip');
    if (!chip) return;
    var tag = chip.getAttribute('data-tag');
    if (!tag) return;
    var idx = selectedTags.indexOf(tag);
    if (idx === -1) {
        selectedTags.push(tag);
    } else {
        selectedTags.splice(idx, 1);
    }
    updateTagChips();
    document.getElementById('search-projects').value = selectedTags.join(' ');
    filterProjects();
}

function handleCheckboxChange(e) {
    var cb = e.target;
    if (!cb.classList.contains('pli-checkbox')) return;
    var id = parseInt(cb.getAttribute('data-id'));
    var idx = selectedIds.indexOf(id);
    if (cb.checked) {
        if (idx === -1) selectedIds.push(id);
    } else {
        if (idx !== -1) selectedIds.splice(idx, 1);
        document.getElementById('bulk-select-all').checked = false;
        selectAllMode = false;
    }
    updateBulkBar();
}

function showAllProjects() {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-owner').value = '';
    document.getElementById('search-projects').value = '';
    document.getElementById('sort-projects').value = 'newest';
    selectedTags = [];
    updateTagChips();
    filterProjects();
}

async function showTagCloud() {
    selectedTags = [];
    document.getElementById('tag-cloud-modal').style.display = 'flex';
    document.getElementById('tag-cloud-body').innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        var tags = await getTagCloud();
        if (!tags.length) {
            document.getElementById('tag-cloud-body').innerHTML = '<div class="empty-state"><p>No tags found</p></div>';
            return;
        }
        renderTagCloud(tags);
    } catch(e) {
        document.getElementById('tag-cloud-body').innerHTML = '<div class="empty-state"><p>Error loading tags</p></div>';
    }
}

function renderTagCloud(tags) {
    var html = '<div style="margin-bottom:12px;text-align:center;font-size:0.8rem;color:var(--text-muted);" id="tag-cloud-status">'+(selectedTags.length ? 'Selected: '+selectedTags.length : 'Click tags to select')+'</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:20px;" id="tag-cloud-list">';
    tags.forEach(function(t, i) {
        var c = tagColors[i % tagColors.length];
        var safeTag = esc(t.name);
        var sel = selectedTags.indexOf(t.name) !== -1;
        html += '<div class="tag-chip" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:20px;font-size:0.82rem;font-weight:500;cursor:pointer;transition:all 0.15s;box-shadow:'+(sel?'0 2px 6px rgba(0,0,0,0.15)':'0 1px 2px rgba(0,0,0,0.05)')+';user-select:none;'+(sel?'background:'+c.fg+';color:#fff;border:2px solid '+c.fg:'background:'+c.bg+';color:'+c.fg+';border:2px solid '+c.border)+';"'+
            ' data-tag="'+safeTag+'" data-raw="'+(t.name||'').replace(/"/g,'&quot;')+'" title="Click to toggle">' +
            (sel?'<span style="font-size:0.65rem;">&#10003;</span> ':'') +
            '<span>#'+safeTag+'</span>' +
            '<span style="font-size:0.65rem;margin-left:2px;">'+t.count+'</span>' +
        '</div>';
    });
    html += '</div>';
    html += '<div style="display:flex;gap:10px;justify-content:center;">';
    html += '<button class="btn btn-secondary btn-sm" id="tag-cloud-clear-btn" style="padding:7px 24px;border-radius:8px;">Show All</button>';
    html += '<button class="btn btn-primary btn-sm" id="tag-cloud-apply-btn" style="padding:7px 24px;border-radius:8px;">Apply Filter</button>';
    html += '</div>';
    document.getElementById('tag-cloud-body').innerHTML = html;
}

function toggleTagCloudTag(tagEl) {
    var raw = tagEl.getAttribute('data-tag');
    var idx = selectedTags.indexOf(raw);
    if (idx === -1) {
        selectedTags.push(raw);
    } else {
        selectedTags.splice(idx, 1);
    }
    try {
        var listEl = document.getElementById('tag-cloud-list');
        var chips = listEl.querySelectorAll('[data-tag]');
        chips.forEach(function(chip) {
            var t = chip.getAttribute('data-tag');
            var sel = selectedTags.indexOf(t) !== -1;
            var i = Array.from(chips).indexOf(chip);
            var c = tagColors[i % tagColors.length];
            chip.style.background = sel ? c.fg : c.bg;
            chip.style.color = sel ? '#fff' : c.fg;
            chip.style.borderColor = sel ? c.fg : c.border;
            chip.style.boxShadow = sel ? '0 2px 6px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.05)';
            var check = chip.querySelector('span:first-child');
            if (sel && !check) {
                var mark = document.createElement('span');
                mark.style.cssText = 'font-size:0.65rem;';
                mark.textContent = '\u2713';
                chip.insertBefore(mark, chip.firstChild);
            } else if (!sel && check && check.textContent === '\u2713') {
                check.remove();
            }
        });
        var status = document.getElementById('tag-cloud-status');
        if (status) status.textContent = selectedTags.length ? 'Selected: '+selectedTags.length : 'Click tags to select';
    } catch(e) {}
}

function hideTagCloud() {
    document.getElementById('tag-cloud-modal').style.display = 'none';
}

function applyTagFilter() {
    hideTagCloud();
    updateTagChips();
    if (selectedTags.length) {
        document.getElementById('search-projects').value = selectedTags.join(' ');
    } else {
        document.getElementById('search-projects').value = '';
    }
    filterProjects();
}

function clearTagFilter() {
    selectedTags = [];
    hideTagCloud();
    updateTagChips();
    document.getElementById('search-projects').value = '';
    filterProjects();
}

function updateTagChips() {
    var container = document.getElementById('tag-chips');
    if (!selectedTags || !selectedTags.length) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = selectedTags.map(function(t) {
        return '<span class="tag-chip-sel">#'+esc(t)+' <span class="tag-chip-remove" data-tag="'+esc(t)+'">&times;</span></span>';
    }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('edit-form').addEventListener('submit', function(e) { e.preventDefault(); saveEditProject(); });
    document.getElementById('create-form').addEventListener('submit', function(e) {
        e.preventDefault();
        document.getElementById('create-error').style.display = 'none';
        var name = document.getElementById('project-name').value.trim();
        var desc = document.getElementById('project-desc').value.trim();
        var status = document.getElementById('create-status').value;
        var priority = document.getElementById('create-priority').value;
        var tags = document.getElementById('create-tags').value.trim();
        var client = document.getElementById('create-client').value.trim();
        var owner = document.getElementById('create-owner').value;
        var due = document.getElementById('create-due').value;
        if (!name) return;
        (async function() {
            try {
                await createProject(name, desc, status, priority, tags, client, owner ? parseInt(owner) : null, due || null);
                hideCreateModal();
                await loadProjects();
                showToast('Project created');
            } catch (e) {
                document.getElementById('create-error').textContent = e.message;
                document.getElementById('create-error').style.display = 'block';
            }
        })();
    });
    document.getElementById('search-projects').addEventListener('input', filterProjects);
    document.getElementById('filter-status').addEventListener('change', filterProjects);
    document.getElementById('filter-priority').addEventListener('change', filterProjects);
    document.getElementById('sort-projects').addEventListener('change', sortProjects);
    document.getElementById('group-projects').addEventListener('change', groupProjects);
    document.getElementById('bulk-select-all').addEventListener('change', handleBulkSelectAll);
    document.getElementById('projects-list').addEventListener('click', handleChipTagClick);
    document.getElementById('projects-list').addEventListener('change', handleCheckboxChange);
    (function() {
        var closeBtn = document.querySelector('[data-action="clearProjectSearch"]');
        if (closeBtn) closeBtn.addEventListener('click', clearProjectSearch);
    })();
    document.getElementById('tag-chips').addEventListener('click', function(e) {
        var removeBtn = e.target.closest('.tag-chip-remove');
        if (removeBtn) {
            var tag = removeBtn.getAttribute('data-tag');
            var idx = selectedTags.indexOf(tag);
            if (idx !== -1) {
                selectedTags.splice(idx, 1);
                updateTagChips();
                document.getElementById('search-projects').value = selectedTags.join(' ');
                filterProjects();
            }
        }
    });
    document.getElementById('tag-cloud-body').addEventListener('click', function(e) {
        var tagEl = e.target.closest('[data-tag]');
        if (tagEl) {
            toggleTagCloudTag(tagEl);
            return;
        }
        if (e.target.closest('#tag-cloud-clear-btn')) {
            clearTagFilter();
            return;
        }
        if (e.target.closest('#tag-cloud-apply-btn')) {
            applyTagFilter();
            return;
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target.closest('#delete-modal.modal-overlay') && e.target === e.target.closest('#delete-modal')) {
            hideDeleteModal();
        }
        if (e.target.closest('#tag-cloud-modal.modal-overlay') && e.target === e.target.closest('#tag-cloud-modal')) {
            hideTagCloud();
        }
        if (e.target.closest('#about-modal.modal-overlay') && e.target === e.target.closest('#about-modal')) {
            hideAboutModal();
        }
        if (e.target.closest('#edit-modal.modal-overlay') && e.target === e.target.closest('#edit-modal')) {
            hideEditProjectModal();
        }
        if (e.target.closest('#create-modal.modal-overlay') && e.target === e.target.closest('#create-modal')) {
            hideCreateModal();
        }
    });

    indexInit();
});
