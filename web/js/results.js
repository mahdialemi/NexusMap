var pathParts = window.location.pathname.split('/');
var projectId = pathParts[2];
var scanId = parseInt(pathParts[4]);
var currentData = [];
var currentPage = 1;
var pageSize = 100;
var totalResults = 0;
var totalPages = 1;
var sortCol = 0;
var sortAsc = true;
var searchQuery = '';

var columns = [
    { label: 'IP', key: 'ip' },
    { label: 'MAC', key: 'mac' },
    { label: 'Hostname', key: 'hostname' },
    { label: 'OS', key: 'os' },
    { label: 'Status', key: 'host_status' },
    { label: 'Port', key: 'port' },
    { label: 'Proto', key: 'protocol' },
    { label: 'State', key: 'state' },
    { label: 'Service', key: 'service' },
    { label: 'Version', key: 'version' },
    { label: 'Product', key: 'product' },
    { label: 'Extra', key: 'extra_info' },
];

document.addEventListener('click', function(e) {
    var el = e.target.closest('#about-modal.modal-overlay');
    if (el && el === e.target) { hideAboutModal(); return; }
});

async function init() {
    currentUser = await me();
    if (!currentUser) { window.location.href = '/login'; return; }
    document.getElementById('user-info').textContent = currentUser.username;

    if (currentUser.role === 'admin') {
        var al = document.getElementById('admin-link');
        if (al) al.style.display = '';
        var ui = document.getElementById('user-info');
        if (ui) ui.classList.add('user-admin');
    }

    var searchTimer;
    document.getElementById('global-search').addEventListener('input', function() {
        clearTimeout(searchTimer);
        var val = this.value;
        searchTimer = setTimeout(function() { globalSearch(val); }, 300);
    });
    document.getElementById('page-size-select').addEventListener('change', function() { changePageSize(this.value); });

    try {
        var projects = await getProjects();
        var project = projects.find(function(p) { return p.id == projectId; });
        if (project) {
            document.getElementById('breadcrumb-project').textContent = project.name;
            document.getElementById('breadcrumb-project').href = '/project/' + projectId;
        }
    } catch (e) {}

    document.getElementById('breadcrumb-scan').textContent = 'Scan #' + scanId;

    await loadResults(1);
}

async function loadResults(page) {
    var container = document.getElementById('results-container');
    try {
        var data = await getResults(scanId, page, pageSize);
        if (Array.isArray(data)) {
            currentData = data;
            totalResults = data.length;
            currentPage = 1;
            totalPages = 1;
        } else {
            currentData = data.results || [];
            totalResults = data.total || 0;
            currentPage = data.page || page;
            pageSize = data.limit || pageSize;
            totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
        }
        renderTable();
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>Error loading results</p></div>';
    }
}

function renderTable() {
    var container = document.getElementById('results-container');
    var data = currentData;

    var hasPorts = data.some(function(r) { return r.port > 0 || r.service; });
    var activeCols = hasPorts ? columns : columns.slice(0, 5);

    if (searchQuery) {
        data = currentData.filter(function(r) {
            return Object.values(r).some(function(v) { return String(v).toLowerCase().indexOf(searchQuery) !== -1; });
        });
    }

    if (data.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No results</h3><p>' + (totalResults > 0 ? 'No matches on this page' : 'Scan returned no data') + '</p></div>';
    } else {
        var html = '<table id="results-table"><thead><tr>';
        activeCols.forEach(function(col, i) {
            var sortIcon = sortCol === i ? (sortAsc ? '&uarr;' : '&darr;') : '&#x2195;';
            var sorted = sortCol === i ? ' class="sorted"' : '';
            html += '<th' + sorted + ' data-action="sortTable" data-col="' + i + '">' + col.label + ' <span class="sort-icon">' + sortIcon + '</span></th>';
        });
        html += '</tr></thead><tbody>';

        data.forEach(function(r) {
            html += '<tr>';
            html += '<td>' + esc(r.ip) + '</td>';
            html += '<td>' + (esc(r.mac) || '-') + '</td>';
            html += '<td>' + (esc(r.hostname) || '-') + '</td>';
            html += '<td>' + (esc(r.os) || '-') + '</td>';
            html += '<td>' + stateBadge(r.host_status) + '</td>';
            if (hasPorts) {
                html += '<td>' + r.port + '</td>';
                html += '<td>' + esc(r.protocol) + '</td>';
                html += '<td>' + stateBadge(r.state) + '</td>';
                html += '<td>' + (esc(r.service) || '-') + '</td>';
                html += '<td>' + (esc(r.version) || '-') + '</td>';
                html += '<td>' + (esc(r.product) || '-') + '</td>';
                html += '<td>' + (esc(r.extra_info) || '-') + '</td>';
            }
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    updatePagination();
}

function updatePagination() {
    var el = document.getElementById('pagination');
    if (totalResults <= pageSize && !searchQuery) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'flex';

    document.getElementById('page-info').textContent = 'Page ' + currentPage + ' of ' + totalPages;
    document.getElementById('total-info').textContent = totalResults + ' total';

    document.getElementById('page-first').disabled = currentPage <= 1;
    document.getElementById('page-prev').disabled = currentPage <= 1;
    document.getElementById('page-next').disabled = currentPage >= totalPages;
    document.getElementById('page-last').disabled = currentPage >= totalPages;

    document.getElementById('page-size-select').value = String(pageSize);
}

function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadResults(page);
}

function changePageSize(size) {
    size = parseInt(size);
    if (size === pageSize) return;
    pageSize = size;
    currentPage = 1;
    loadResults(1);
}

function globalSearch(query) {
    searchQuery = query.toLowerCase();
    renderTable();
}

function doGoToPage(e) {
    var cmd = this.getAttribute('data-page');
    if (cmd === 'first') goToPage(1);
    else if (cmd === 'prev') goToPage(currentPage - 1);
    else if (cmd === 'next') goToPage(currentPage + 1);
    else if (cmd === 'last') goToPage(totalPages);
}

function doExport(e) {
    exportScan(scanId, this.getAttribute('data-format'));
}

function sortTable(e) {
    sortCol = parseInt(this.getAttribute('data-col'));
    sortAsc = !sortAsc;
    renderTable();
}

function goBackToProject() { window.location.href = '/project/' + projectId; }
function backToProjects() { window.location.href = '/'; }
function showAboutModal() { document.getElementById('about-modal').style.display = 'flex'; }
function hideAboutModal() { document.getElementById('about-modal').style.display = 'none'; }

init();