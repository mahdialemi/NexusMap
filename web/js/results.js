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

function getColumns() {
    return [
        { label: t('results.col_ip'), key: 'ip' },
        { label: t('results.col_mac'), key: 'mac' },
        { label: t('results.col_hostname'), key: 'hostname' },
        { label: t('results.col_os'), key: 'os' },
        { label: t('results.col_status'), key: 'host_status' },
        { label: t('results.col_port'), key: 'port' },
        { label: t('results.col_proto'), key: 'protocol' },
        { label: t('results.col_state'), key: 'state' },
        { label: t('results.col_service'), key: 'service' },
        { label: t('results.col_version'), key: 'version' },
        { label: t('results.col_product'), key: 'product' },
        { label: t('results.col_extra'), key: 'extra_info' },
    ];
}

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

    document.getElementById('page-size-select').addEventListener('change', function() { changePageSize(this.value); });

    document.getElementById('breadcrumb-scan').textContent = t('results.scan_id').replace('{id}', scanId);

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
        container.innerHTML = '<div class="empty-state"><p>' + t('results.error_loading') + '</p></div>';
    }
}

function renderTable() {
    var container = document.getElementById('results-container');
    var data = currentData;

    var hasPorts = data.some(function(r) { return r.port > 0 || r.service; });
    var cols = getColumns();
    var activeCols = hasPorts ? cols : cols.slice(0, 5);

    if (searchQuery) {
        data = currentData.filter(function(r) {
            return Object.values(r).some(function(v) { return String(v).toLowerCase().indexOf(searchQuery) !== -1; });
        });
    }

    if (data.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>' + t('results.no_results_header') + '</h3><p>' + (totalResults > 0 ? t('results.no_matches') : t('results.no_data')) + '</p></div>';
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

    document.getElementById('page-info').textContent = t('results.page_info').replace('{current}', currentPage).replace('{total}', totalPages);
    document.getElementById('total-info').textContent = t('results.total_results').replace('{n}', totalResults);

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

function debounceSearchResults() {
    clearTimeout(window._searchTimer);
    var val = this.value;
    window._searchTimer = setTimeout(function() { globalSearch(val); }, 300);
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

function toggleGlobalSearch() {
    var wrap = document.getElementById('global-search-wrap');
    var toggle = document.getElementById('global-search-toggle');
    if (!wrap || !toggle) return;
    wrap.style.display = 'flex';
    toggle.style.display = 'none';
    var input = document.getElementById('global-search');
    if (input) { input.focus(); input.select(); }
}

function clearGlobalSearch() {
    document.getElementById('global-search').value = '';
    var wrap = document.getElementById('global-search-wrap');
    var toggle = document.getElementById('global-search-toggle');
    if (wrap) wrap.style.display = 'none';
    if (toggle) toggle.style.display = '';
    globalSearch('');
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        var wrap = document.getElementById('global-search-wrap');
        if (wrap && wrap.style.display !== 'none') clearGlobalSearch();
    }
});

function goBackToProject() { window.location.href = '/project/' + projectId; }
function backToProjects() { window.location.href = '/'; }
function goToSettings() { window.location.href = '/settings'; }
function goToAdmin() { window.location.href = '/admin'; }
function showAboutModal() { document.getElementById('about-modal').style.display = 'flex'; }
function hideAboutModal() { document.getElementById('about-modal').style.display = 'none'; }
function refreshResults() { loadResults(currentPage); }
function toggleResultsExportDropdown() {
    var d = document.getElementById('results-export-dropdown');
    d.style.display = d.style.display === 'none' ? '' : 'none';
}

init();
