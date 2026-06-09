var notifOpen = false;
var filterTimer;
var dashboardProjectId = null;
var selectedTags = [];
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
}

async function loadProjects() {
    try {
        var projects = await getProjects();
        renderProjects(projects);
    } catch (e) {
        document.getElementById('projects-grid').innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>Error loading projects</p></div>';
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

async function showProjectDashboard(e) {
    e.stopPropagation();
    dashboardProjectId = parseInt(this.getAttribute('data-id'));
    document.getElementById('dashboard-modal').style.display = 'flex';
    document.getElementById('dashboard-body').innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        var res = await fetch('/api/projects/'+dashboardProjectId);
        var p = await res.json();
        if (!res.ok) throw new Error('Failed to load project');
        document.getElementById('dashboard-title').textContent = esc(p.name) + ' - Dashboard';
        document.getElementById('dashboard-subtitle').textContent = p.description ? esc(p.description) : 'Project overview';

        var statusColors = { active: '#22c55e', archived: '#64748b', completed: '#3b82f6' };
        var sc = statusColors[p.status] || '#64748b';
        var priorityColors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#64748b' };
        var pc = priorityColors[p.priority] || '#eab308';

        var tags = p.tags ? p.tags.split(',').filter(Boolean) : [];
        var tagHtml = tags.map(function(t){ return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.7rem;background:var(--bg-input);color:var(--text-muted);border:1px solid var(--border);margin-right:4px;">#'+esc(t.trim())+'</span>'; }).join('');

        document.getElementById('dashboard-body').innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;">' +
                '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:0.8rem;font-weight:600;background:'+sc+'22;color:'+sc+';">'+esc(p.status||'active')+'</span>' +
                '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:0.8rem;font-weight:600;background:'+pc+'22;color:'+pc+';">'+esc(p.priority||'medium')+'</span>' +
                tagHtml +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="stat-card" style="text-align:left;padding:12px;"><div style="font-size:0.7rem;color:var(--text-muted);">Client</div><div style="font-weight:600;margin-top:2px;">'+(p.client ? esc(p.client) : '\u2014')+'</div></div>' +
                '<div class="stat-card" style="text-align:left;padding:12px;"><div style="font-size:0.7rem;color:var(--text-muted);">Owner</div><div style="font-weight:600;margin-top:2px;">'+(p.owner_name ? esc(p.owner_name) : '\u2014')+'</div></div>' +
                '<div class="stat-card" style="text-align:left;padding:12px;"><div style="font-size:0.7rem;color:var(--text-muted);">Due Date</div><div style="font-weight:600;margin-top:2px;">'+(p.due_date ? p.due_date.split('T')[0] : '\u2014')+'</div></div>' +
                '<div class="stat-card" style="text-align:left;padding:12px;"><div style="font-size:0.7rem;color:var(--text-muted);">Scans</div><div style="font-weight:600;margin-top:2px;">'+(p.scan_count||0)+'</div></div>' +
                '<div class="stat-card" style="text-align:left;padding:12px;"><div style="font-size:0.7rem;color:var(--text-muted);">Last Scan</div><div style="font-weight:600;margin-top:2px;">'+(p.last_scan_at ? formatDate(p.last_scan_at) : '\u2014')+'</div></div>' +
                '<div class="stat-card" style="text-align:left;padding:12px;"><div style="font-size:0.7rem;color:var(--text-muted);">Updated</div><div style="font-weight:600;margin-top:2px;">'+(p.updated_at ? formatDate(p.updated_at) : '\u2014')+'</div></div>' +
                '<div class="stat-card" style="text-align:left;padding:12px;"><div style="font-size:0.7rem;color:var(--text-muted);">Created</div><div style="font-weight:600;margin-top:2px;">'+formatDate(p.created_at)+'</div></div>' +
            '</div>' +
            '<div style="margin-top:16px;display:flex;gap:8px;">' +
                '<button class="btn btn-primary btn-sm" style="flex:1;" data-action="openProjectFromDashboard"> Open Project</button>' +
            '</div>';
    } catch(e) {
        document.getElementById('dashboard-body').innerHTML = '<div class="empty-state"><p>Error loading project details</p></div>';
    }
}

function hideProjectDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
}

function openProjectFromDashboard(e) {
    if (dashboardProjectId) window.location.href = '/project/' + dashboardProjectId;
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
        var q = [];
        if (status) q.push('status='+encodeURIComponent(status));
        if (priority) q.push('priority='+encodeURIComponent(priority));
        if (search) q.push('search='+encodeURIComponent(search));
        var url = '/api/projects' + (q.length ? '?'+q.join('&') : '');
        try {
            var res = await fetch(url);
            var data = await res.json();
            renderProjects(data);
        } catch(e) {}
    }, 300);
}

async function renderProjects(projects) {
    var grid = document.getElementById('projects-grid');
    if (!projects || projects.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><h3>No projects found</h3><p>Try adjusting your filters</p></div>';
        return;
    }
    grid.innerHTML = projects.map(function(p) {
        var statusColor = p.status === 'active' ? '#22c55e' : p.status === 'archived' ? '#64748b' : '#3b82f6';
        var priorityColor = p.priority === 'critical' ? '#ef4444' : p.priority === 'high' ? '#f97316' : p.priority === 'medium' ? '#eab308' : '#64748b';
        var tags = p.tags ? p.tags.split(',').filter(Boolean) : [];
        return '<div class="profile-card" data-action="goToProject" data-id="'+p.id+'">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
                '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;background:'+statusColor+'22;color:'+statusColor+';">'+esc(p.status||'active')+'</span>' +
                '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;background:'+priorityColor+'22;color:'+priorityColor+';">'+esc(p.priority||'medium')+'</span>' +
                tags.map(function(t){ return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.7rem;background:var(--bg-input);color:var(--text-muted);border:1px solid var(--border);">#'+esc(t.trim())+'</span>'; }).join('') +
            '</div>' +
            '<h4>'+esc(p.name)+'</h4>' +
            '<p>'+esc(p.description||'No description')+'</p>' +
            '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;">' +
                (p.client ? '<span>Client: '+esc(p.client)+'</span>' : '') +
                '<span>'+(p.owner_name ? esc(p.owner_name) : 'Owner: \u2014')+'</span>' +
                (p.due_date ? '<span>Due: '+p.due_date.split('T')[0]+'</span>' : '') +
                '<span>Scans: '+(p.scan_count||0)+'</span>' +
            '</div>' +
            '<div style="margin-top: 6px; font-size: 0.7rem; color: #94a3b8;">Created: '+formatDate(p.created_at)+'</div>' +
            '<div style="display:flex;gap:6px;margin-top:10px;">' +
                '<button class="btn btn-secondary btn-sm" style="flex:1;" data-action="showProjectDashboard" data-id="'+p.id+'" title="Dashboard"> Dashboard</button>' +
                (currentUser.role === 'admin' ?
                '<button class="btn btn-secondary btn-sm" style="flex:1;" data-action="showEditProjectModal" data-id="'+p.id+'" data-name="'+esc(p.name)+'" data-desc="'+esc(p.description||'')+'" data-status="'+esc(p.status||'active')+'" data-priority="'+esc(p.priority||'medium')+'" data-tags="'+esc(p.tags||'')+'" data-client="'+esc(p.client||'')+'" data-owner-id="'+(p.owner_id!=null?p.owner_id:'')+'" data-due="'+(p.due_date?p.due_date.split('T')[0]:'')+'" title="Edit"> Edit</button>' +
                '<button class="btn btn-danger btn-sm" style="flex:1;" data-action="handleDeleteProject" data-id="'+p.id+'" data-name="'+esc(p.name)+'" title="Delete"> Delete</button>' : '') +
            '</div>' +
            '</div>';
    }).join('');
}

function showAllProjects() {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('search-projects').value = '';
    filterProjects();
}

async function showGlobalStats() {
    document.getElementById('global-stats-modal').style.display = 'flex';
    document.getElementById('global-stats-body').innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        var stats = await getGlobalStats();
        var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div class="stat-card" style="text-align:center;padding:16px;grid-column:1/-1;background:rgba(59,130,246,0.08);"><div style="font-size:1.8rem;font-weight:700;color:var(--accent);">'+stats.total_projects+'</div><div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Total Projects</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;color:#22c55e;">'+stats.active_projects+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Active</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;color:#64748b;">'+stats.archived_projects+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Archived</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;color:#3b82f6;">'+stats.completed_projects+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Completed</div></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;">'+stats.total_scans+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Total Scans</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">'+stats.running_scans+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Running</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;color:#22c55e;">'+stats.completed_scans+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Completed</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;color:#ef4444;">'+stats.failed_scans+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Failed</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;">'+stats.total_hosts+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Total Hosts</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;">'+stats.total_live_hosts+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Live Hosts</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;"><div style="font-size:1.2rem;font-weight:700;">'+stats.total_ports+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Total Ports</div></div>' +
            '<div class="stat-card" style="text-align:center;padding:12px;grid-column:1/-1;"><div style="font-size:1.2rem;font-weight:700;">'+stats.unique_services+'</div><div style="font-size:0.7rem;color:var(--text-muted);">Unique Services</div></div>' +
        '</div>';
        document.getElementById('global-stats-body').innerHTML = html;
    } catch(e) {
        document.getElementById('global-stats-body').innerHTML = '<div class="empty-state"><p>Error loading global stats</p></div>';
    }
}

function hideGlobalStats() {
    document.getElementById('global-stats-modal').style.display = 'none';
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
    document.getElementById('search-projects').value = '';
    filterProjects();
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
        if (e.target.closest('#global-stats-modal.modal-overlay') && e.target === e.target.closest('#global-stats-modal')) {
            hideGlobalStats();
        }
        if (e.target.closest('#tag-cloud-modal.modal-overlay') && e.target === e.target.closest('#tag-cloud-modal')) {
            hideTagCloud();
        }
        if (e.target.closest('#about-modal.modal-overlay') && e.target === e.target.closest('#about-modal')) {
            hideAboutModal();
        }
        if (e.target.closest('#dashboard-modal.modal-overlay') && e.target === e.target.closest('#dashboard-modal')) {
            hideProjectDashboard();
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
