// SVG sprite loader
(function() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/static/icons/sprite.svg', true);
    xhr.overrideMimeType('image/svg+xml');
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 400) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(xhr.responseText, 'image/svg+xml');
            var svg = doc.documentElement;
            if (svg && svg.tagName === 'svg') {
                svg.style.display = 'none';
                document.body.insertBefore(svg, document.body.firstChild);
            }
        }
    };
    xhr.send();
})();

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

async function getTagCloud() {
    const res = await fetch(`${API}/api/tags`);
    if (!res.ok) throw new Error('Failed to load tag cloud');
    const data = await res.json();
    return data.tags || [];
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
    if (!res.ok) throw new Error('Failed to load scan log: ' + res.status);
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

async function getSchedules(projectId) {
    const res = await fetch(`/api/projects/${projectId}/schedules`);
    if (!res.ok) throw new Error('Failed to load schedules: ' + res.status);
    return res.json();
}

// Results
async function getResults(scanId, page, limit) {
    var url = `${API}/api/scans/${scanId}/results`;
    var params = [];
    if (page) params.push('page=' + page);
    if (limit) params.push('limit=' + limit);
    if (params.length) url += '?' + params.join('&');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load results: ' + res.status);
    return res.json();
}

async function updateResult(id, table, field, value) {
    const res = await fetch(`${API}/api/results/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, field, value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update result');
    return data;
}

async function revertResult(id, table, field) {
    const res = await fetch(`${API}/api/results/${id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, field })
    });
    if (!res.ok) throw new Error('Failed to revert result: ' + res.status);
}

async function addPort(hostId, port, protocol, state, service, version) {
    const res = await fetch(`${API}/api/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: hostId, port, protocol, state, service, version })
    });
    if (!res.ok) throw new Error('Failed to add port: ' + res.status);
}

async function deleteResult(id, table) {
    const res = await fetch(`${API}/api/results/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table })
    });
    if (!res.ok) throw new Error('Failed to delete result: ' + res.status);
}

async function bulkUpdate(ids, field, value) {
    const res = await fetch(`${API}/api/results/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, field, value })
    });
    if (!res.ok) throw new Error('Failed to bulk update: ' + res.status);
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

async function changePassword(oldPass, newPass, confirmPass) {
    var res = await fetch(`${API}/api/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPass, new_password: newPass, confirm_password: confirmPass })
    });
    if (!res.ok) {
        var data = await res.json().catch(function() { return {error: 'request failed'}; });
        throw new Error(data.error || 'password change failed');
    }
}

// Toast notifications
function showToast(message, type = 'success') {
    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => toast.remove());
    toast.appendChild(closeBtn);
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    const progress = document.createElement('div');
    progress.className = 'toast-progress';
    progress.style.animationDuration = '3s';
    toast.appendChild(progress);
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3000);
}

// Format helpers
function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
}

var _escMap = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function(c) { return _escMap[c]; });
}

function escAttr(s) {
    return (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function checkForUpdatesBadge() {
    try {
        const res = await fetch('/api/check-update');
        const data = await res.json();
        if (data.update_available) {
            const btn = document.querySelector('[data-action="showAboutModal"]');
            if (btn && !btn.querySelector('.update-badge')) {
                const badge = document.createElement('span');
                badge.className = 'update-badge';
                btn.appendChild(badge);
            }
        }
    } catch (e) {}
}
checkForUpdatesBadge();

async function loadVersion() {
    try {
        const res = await fetch('/api/version');
        const data = await res.json();
        if (data.version) {
            document.querySelectorAll('.app-version').forEach(function(el) { el.textContent = data.version; });
        }
    } catch (e) {}
}
loadVersion();

async function checkForUpdates() {
    const btn = document.querySelector('[data-action="checkForUpdates"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }
    try {
        const res = await fetch('/api/check-update');
        const data = await res.json();
        if (data.update_available) {
            showToast('Update ' + data.latest + ' available — opening releases page...', 'info', 5000);
            setTimeout(function () { window.open('https://github.com/mahdialemi/NexusMap/releases/latest', '_blank'); }, 800);
        } else if (data.latest) {
            showToast('You are up to date (' + data.current + ')', 'success');
        } else {
            showToast('Could not check for updates', 'error');
        }
    } catch (e) {
        showToast('Update check failed: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Check for Updates'; }
    }
}

function stateBadge(state) {
    const cls = state === 'open' || state === 'up' ? 'badge-open' :
                state === 'closed' || state === 'down' ? 'badge-closed' : 'badge-filtered';
    return `<span class="badge ${cls}">${esc(state)}</span>`;
}

// i18n: auto-init on all pages if i18n.js is loaded
if (typeof initI18n === 'function') {
    document.addEventListener('DOMContentLoaded', function() {
        initI18n(function() {
            translateDOM();
        });
    });
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
    if (typeof id !== 'string') {
        if (typeof this !== 'undefined' && this && this.getAttribute) id = this.getAttribute('data-modal');
        else return;
    }
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

document.addEventListener('change', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var fn = typeof window[action] === 'function' ? window[action] : null;
    if (fn) fn.call(el, e);
});

document.addEventListener('input', function(e) {
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
    var notifInterval = setInterval(fetchNotifications, NOTIF_POLL_INTERVAL);
    if (typeof EventSource !== 'undefined') {
        var es = new EventSource('/api/events');
        es.addEventListener('message', function() { fetchNotifications(); });
        es.addEventListener('error', function() {});
        window.addEventListener('beforeunload', function() { es.close(); });
    }
    window.addEventListener('beforeunload', function() { clearInterval(notifInterval); });
}

// Inject shortcuts CSS (available on every page)
(function() {
    var style = document.createElement('style');
    style.textContent =
        '.shortcuts-body{padding:4px 0}' +
        '.sc-group{margin-bottom:20px}' +
        '.sc-group:last-child{margin-bottom:0}' +
        '.sc-group-header{font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:10px;padding:6px 10px;background:var(--bg-input);border-radius:6px}' +
        '.sc-items{display:grid;grid-template-columns:1fr 1fr;gap:4px}@media(max-width:600px){.sc-items{grid-template-columns:1fr}}' +
        '.sc-item{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;transition:background 0.12s;cursor:default}' +
        '.sc-item:hover{background:var(--bg-input)}' +
        '.sc-item kbd{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:26px;padding:0 9px;font-size:0.72rem;font-family:var(--font-mono);font-weight:700;background:var(--bg-card);border:1px solid var(--border);border-radius:5px;border-bottom:3px solid var(--border);color:var(--text);line-height:1}' +
        '.sc-item span{font-size:0.83rem;color:var(--text)}' +
        '.sc-footer{text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--border);font-size:0.75rem;color:var(--text-muted)}' +
        '.sc-footer kbd{display:inline;padding:1px 7px 2px;font-size:0.7rem;font-family:var(--font-mono);font-weight:700;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;border-bottom:2px solid var(--border);color:var(--text)}';
    document.head.appendChild(style);
})();

// ----- Keyboard Shortcuts -----
var SHORTCUTS = [
    { key: '?', label: 'Show keyboard shortcuts', global: true, fn: showShortcutsHelp },
    { key: 'n', label: 'New Scan', global: false, fn: function() {
        var btn = document.querySelector('.sidebar-btn[data-tab="new-scan"]');
        if (btn && typeof showTab === 'function') { btn.click(); }
    }},
    { key: 's', label: 'Focus scan search', global: false, fn: function() {
        var wrap = document.getElementById('scan-search-wrap');
        if (wrap) {
            wrap.style.display = 'flex';
            var inp = document.getElementById('scan-search');
            if (inp) { inp.focus(); inp.select(); }
            var toggle = document.getElementById('scan-search-toggle');
            if (toggle) toggle.style.display = 'none';
        } else {
            var gs = document.getElementById('search-projects');
            if (gs) { gs.focus(); gs.select(); }
        }
    }},
    { key: 'a', label: 'Go to Assets', global: false, fn: function() {
        var btn = document.querySelector('.sidebar-btn[data-tab="consolidated"]');
        if (btn && typeof showTab === 'function') { btn.click(); }
    }},
    { key: 'l', label: 'Go to Live Hosts', global: false, fn: function() {
        var btn = document.querySelector('.sidebar-btn[data-tab="live"]');
        if (btn && typeof showTab === 'function') { btn.click(); }
    }},
    { key: 't', label: 'Go to Topology', global: false, fn: function() {
        var btn = document.querySelector('.sidebar-btn[data-tab="topology"]');
        if (btn && typeof showTab === 'function') { btn.click(); }
    }},
    { key: 'o', label: 'Go to Notes', global: false, fn: function() {
        var btn = document.querySelector('.sidebar-btn[data-tab="notes"]');
        if (btn && typeof showTab === 'function') { btn.click(); }
    }},
    { key: 'i', label: 'Go to Import', global: false, fn: function() {
        var btn = document.querySelector('.sidebar-btn[data-tab="import"]');
        if (btn && typeof showTab === 'function') { btn.click(); }
    }},
    { key: 'b', label: 'Back to projects', global: false, fn: function() {
        var btn = document.querySelector('[data-action="backToProjects"]');
        if (btn) { btn.click(); }
    }},
    { key: 'Escape', label: 'Close modal / search', global: true, fn: function() {
        // Close any open modal via overlay clicks
        var modals = document.querySelectorAll('.modal[style*="flex"], .modal-overlay[style*="block"], .modal-overlay[style*="flex"]');
        modals.forEach(function(m) {
            if (m.id === 'about-modal' && typeof hideAboutModal === 'function') hideAboutModal();
            else if (typeof closeModal === 'function') closeModal(m.id);
            m.style.display = 'none';
        });
        // Close search wrappers
        var wraps = document.querySelectorAll('.search-wrapper[style*="flex"]');
        wraps.forEach(function(w) {
            var close = w.querySelector('.search-close');
            if (close && typeof close.click === 'function') close.click();
        });
    }},
];

function showShortcutsHelp() {
    var globalItems = [];
    var pageItems = [];
    for (var i = 0; i < SHORTCUTS.length; i++) {
        var s = SHORTCUTS[i];
        var keyDisplay = s.key === 'Escape' ? 'Esc' : s.key;
        var icon = '';
        if (s.key === '?') icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        else if (s.key === 'Escape') icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        var item = '<div class="sc-item">' + icon + '<kbd>' + esc(keyDisplay) + '</kbd><span>' + esc(s.label) + '</span></div>';
        if (s.global) { globalItems.push(item); } else { pageItems.push(item); }
    }

    var html = '';
    if (globalItems.length) {
        html += '<div class="sc-group"><div class="sc-group-header"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Global</div><div class="sc-items">' + globalItems.join('') + '</div></div>';
    }
    if (pageItems.length) {
        html += '<div class="sc-group"><div class="sc-group-header"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg> Project Page</div><div class="sc-items">' + pageItems.join('') + '</div></div>';
    }
    html += '<div class="sc-footer">Press <kbd>?</kbd> anytime to show this help</div>';

    showModal('shortcuts-help-modal', 'Keyboard Shortcuts', '<div class="shortcuts-body">' + html + '</div>', 'modal-medium');
}

function isEditable(el) {
    if (!el) return true;
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

document.addEventListener('keydown', function(e) {
    // Ignore when typing in editable fields (except Escape and enter key combos that are global)
    if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && isEditable(e.target)) return;

    var key = e.key === '?' || e.key === '§' ? '?' : e.key;
    var i, s;
    for (i = 0; i < SHORTCUTS.length; i++) {
        s = SHORTCUTS[i];
        if (s.key === key && (s.global || !isEditable(e.target))) {
            // Don't trigger single letters while typing
            if (s.key.length === 1 && s.key !== '?' && isEditable(e.target)) continue;
            e.preventDefault();
            s.fn();
            return;
        }
    }
});
