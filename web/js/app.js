const API = '';
let currentUser = null;
let csrfToken = '';

// Theme: auto-apply saved preference
(function() {
    var t = localStorage.getItem('nexusmap-theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
})();
function toggleTheme() {
    var html = document.documentElement;
    var cur = html.getAttribute('data-theme') || 'dark';
    var next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('nexusmap-theme', next);
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

function initCSRF() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    csrfToken = meta ? meta.getAttribute('content') : '';
}
initCSRF();

const _origFetch = window.fetch;
window.fetch = function(url, options) {
    if (!options) options = {};
    if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
        if (!options.headers) options.headers = {};
        if (csrfToken) {
            options.headers['X-CSRF-Token'] = csrfToken;
        }
    }
    return _origFetch.call(this, url, options);
};

// Auth
async function login(username, password) {
    const res = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) return data;
    throw new Error(data.error || 'Login failed');
}

async function logout() {
    await fetch(`${API}/api/logout`, { method: 'POST' });
    window.location.href = '/login';
}

async function me() {
    const res = await fetch(`${API}/api/me`);
    if (!res.ok) return null;
    return res.json();
}

// Projects
async function getProjects() {
    const res = await fetch(`${API}/api/projects`);
    if (!res.ok) throw new Error('Failed to load projects');
    return res.json();
}

async function createProject(name, description, status, priority, tags, client, owner_id, due_date) {
    const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status, priority, tags, client, owner_id, due_date })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create project');
    return data;
}

async function deleteProject(id) {
    const res = await fetch(`${API}/api/projects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete project');
    return data;
}

async function updateProject(id, name, description, status, priority, tags, client, owner_id, due_date) {
    const res = await fetch(`${API}/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status, priority, tags, client, owner_id, due_date })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update project');
    return data;
}

async function getGlobalStats() {
    const res = await fetch(`${API}/api/stats/global`);
    if (!res.ok) throw new Error('Failed to load global stats');
    return res.json();
}

async function getTagCloud() {
    const res = await fetch(`${API}/api/tags`);
    if (!res.ok) throw new Error('Failed to load tag cloud');
    return res.json();
}

// Scans
async function createScanAPI(projectId, profile, target, extraArgs, note) {
    const res = await fetch(`${API}/api/scans/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: Number(projectId), profile, target, extra_args: extraArgs || '', note: note || '' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create scan');
    return data;
}

async function runScanAPI(scanId) {
    const res = await fetch(`${API}/api/scans/${scanId}/run`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to run scan');
    return data;
}

async function stopScanAPI(scanId) {
    const res = await fetch(`${API}/api/scans/${scanId}/stop`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to stop scan');
    return data;
}

async function getScanLog(scanId) {
    const res = await fetch(`${API}/api/scans/${scanId}/log`);
    return res.json();
}

async function getScans(projectId) {
    const res = await fetch(`${API}/api/projects/${projectId}/scans`);
    if (!res.ok) throw new Error('Failed to load scans: ' + res.status);
    return res.json();
}

async function deleteScanAPI(id) {
    const res = await fetch(`${API}/api/scans/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete scan');
}

async function confirmScanAPI(scanId) {
    const res = await fetch(`${API}/api/scans/${scanId}/confirm`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to confirm scan');
    return data;
}

async function rejectScanAPI(scanId) {
    const res = await fetch(`${API}/api/scans/${scanId}/reject`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reject scan');
    return data;
}

// Results
async function getResults(scanId, page, limit) {
    var url = `${API}/api/scans/${scanId}/results`;
    var params = [];
    if (page) params.push('page=' + page);
    if (limit) params.push('limit=' + limit);
    if (params.length) url += '?' + params.join('&');
    const res = await fetch(url);
    return res.json();
}

async function updateResult(id, table, field, value) {
    const res = await fetch(`${API}/api/results/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, field, value })
    });
    return res.json();
}

async function revertResult(id, table, field) {
    await fetch(`${API}/api/results/${id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, field })
    });
}

async function addPort(hostId, port, protocol, state, service, version) {
    await fetch(`${API}/api/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: hostId, port, protocol, state, service, version })
    });
}

async function deleteResult(id, table) {
    await fetch(`${API}/api/results/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table })
    });
}

async function bulkUpdate(ids, field, value) {
    await fetch(`${API}/api/results/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, field, value })
    });
}

// Export
async function exportScan(scanId, format) {
    window.location.href = `${API}/api/export/${scanId}/${format}`;
}

async function deleteLiveHost(projectId, ip) {
    const res = await fetch(`${API}/api/projects/${projectId}/live/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete host');
    return data;
}

// Users (admin)
async function getUsers() {
    const res = await fetch(`${API}/api/users`);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
}

async function createUser(username, password, role) {
    const res = await fetch(`${API}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user');
    return data;
}

async function deleteUser(id) {
    const res = await fetch(`${API}/api/users/${id}`, {
        method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete user');
    return data;
}

async function updateUser(id, role) {
    const res = await fetch(`${API}/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update user');
    return data;
}

async function resetUserPassword(id, newPassword) {
    const res = await fetch(`${API}/api/users/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password', new_password: newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reset password');
    return data;
}

async function changePassword(oldPass, newPass) {
    await fetch(`${API}/api/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPass, new_password: newPass })
    });
}

// Toast notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = '<button class="toast-close" onclick="this.parentElement.remove()">&times;</button><span>' + esc(message) + '</span><div class="toast-progress" style="animation-duration: 3s;"></div>';
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3000);
}

// Format helpers
function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function stateBadge(state) {
    const cls = state === 'open' || state === 'up' ? 'badge-open' :
                state === 'closed' || state === 'down' ? 'badge-closed' : 'badge-filtered';
    return `<span class="badge ${cls}">${state}</span>`;
}

// Modal helpers
function showModal(id, title, bodyHTML, sizeClass) {
    var old = document.getElementById(id);
    if (old) old.parentNode.removeChild(old);
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal';
    modal.style.display = 'flex';
    const size = sizeClass ? sizeClass + ' ' : '';
    modal.innerHTML = '<div class="modal-content ' + size + '">' +
        '<div class="modal-header">' +
            '<h3>' + esc(title) + '</h3>' +
            '<button class="modal-close" data-close="' + id + '" title="Close">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
                '</svg>' +
            '</button>' +
        '</div>' +
        '<div class="modal-body">' + bodyHTML + '</div>' +
    '</div>';
    modal.addEventListener('click', function(e) {
        if (e.target === modal || e.target.closest('[data-close]')) closeModal(id);
    });
    document.body.appendChild(modal);
    return modal;
}

function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

// Loading states
function showLoading(el) {
    if (!el) return;
    el.classList.add('btn-loading');
    el.disabled = true;
}

function hideLoading(el) {
    if (!el) return;
    el.classList.remove('btn-loading');
    el.disabled = false;
}

// Event delegation: handles data-action elements
document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var fn = typeof window[action] === 'function' ? window[action] : null;
    if (fn) fn.call(el, e);
});

// Notification bell
var NOTIF_POLL_INTERVAL = 30000;
var notifOpen = false;

function getLastSeen() { var v = localStorage.getItem('notif_last_seen'); return v ? parseInt(v, 10) : 0; }
function setLastSeen(t) { localStorage.setItem('notif_last_seen', String(t)); }

function toEpoch(s) { return new Date(s).getTime(); }

function fetchNotifications() {
    fetch('/api/db/activity?action=activity')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var entries = data.entries || [];
            var lastSeen = getLastSeen();
            var unread = 0;
            if (lastSeen) {
                entries.forEach(function(e) {
                    if (toEpoch(e.created_at) > lastSeen) unread++;
                });
            } else {
                if (entries.length > 0) setLastSeen(toEpoch(entries[0].created_at));
            }
            var badge = document.getElementById('notif-badge');
            if (badge) {
                if (unread > 0) {
                    badge.textContent = unread > 99 ? '99+' : unread;
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
            }
            if (notifOpen) renderNotifList(entries, lastSeen);
        })
        .catch(function() {});
}

function renderNotifList(entries, lastSeen) {
    var list = document.getElementById('notif-list');
    if (!list) return;
    var unread = lastSeen ? entries.filter(function(e) { return toEpoch(e.created_at) > lastSeen; }) : entries;
    if (!unread.length) {
        list.innerHTML = '<div class="notif-empty">No notifications</div>';
        return;
    }
    var html = '';
    unread.slice(0, 20).forEach(function(e) {
        html += '<div class="notif-item notif-item-unread">';
        html += '<div class="notif-item-action">' + esc(e.action) + '</div>';
        html += '<div class="notif-item-details">' + esc(e.details) + '</div>';
        html += '<div class="notif-item-time">' + esc(e.username || '-') + ' &middot; ' + esc(e.created_at) + '</div>';
        html += '</div>';
    });
    list.innerHTML = html;
}

function toggleNotifications() {
    var dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    notifOpen = !notifOpen;
    dd.style.display = notifOpen ? '' : 'none';
    if (notifOpen) {
        fetch('/api/db/activity?action=activity')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var lastSeen = getLastSeen();
                renderNotifList(data.entries || [], lastSeen);
            })
            .catch(function() {
                var list = document.getElementById('notif-list');
                if (list) list.innerHTML = '<div class="notif-empty">Failed to load</div>';
            });
    }
}

function markNotifsRead() {
    setLastSeen(Date.now());
    var badge = document.getElementById('notif-badge');
    if (badge) badge.style.display = 'none';
    var list = document.getElementById('notif-list');
    if (list) {
        var items = list.querySelectorAll('.notif-item-unread');
        items.forEach(function(i) { i.classList.remove('notif-item-unread'); });
    }
}

document.addEventListener('click', function(e) {
    if (notifOpen && !e.target.closest('.notif-wrap')) {
        notifOpen = false;
        var dd = document.getElementById('notif-dropdown');
        if (dd) dd.style.display = 'none';
    }
});

if (document.getElementById('notif-badge')) {
    fetchNotifications();
    setInterval(fetchNotifications, NOTIF_POLL_INTERVAL);
    if (typeof EventSource !== 'undefined') {
        var es = new EventSource('/api/events');
        es.addEventListener('message', function() { fetchNotifications(); });
        es.addEventListener('error', function() {});
    }
}
