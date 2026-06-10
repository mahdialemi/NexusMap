        let hideClosedPorts = false;
        let consolidatedSearchTimeout = null;
        function debounceSearchConsolidated() {
            if (consolidatedSearchTimeout) clearTimeout(consolidatedSearchTimeout);
            const el = document.getElementById('consolidated-search');
            const clearBtn = document.getElementById('consolidated-search-clear');
            if (clearBtn) clearBtn.style.display = el.value ? '' : 'none';
            consolidatedSearchTimeout = setTimeout(() => loadConsolidated(1), 400);
        }

        function toggleHideClosed() {
            hideClosedPorts = !hideClosedPorts;
            const btn = document.getElementById('hide-closed-toggle');
            if (btn) {
                const dot = btn.querySelector('.toggle-dot');
                if (hideClosedPorts) {
                    btn.classList.add('btn-secondary');
                    if (dot) { dot.style.borderColor = 'var(--accent)'; dot.style.background = 'var(--accent)'; }
                } else {
                    btn.classList.remove('btn-secondary');
                    if (dot) { dot.style.borderColor = 'var(--text-muted)'; dot.style.background = 'transparent'; }
                }
            }
            loadConsolidated(1);
        }

        function updateConsolidatedStats() {
            const stat = document.getElementById('asset-stat');
            if (!stat || !consolidatedPortsData || !consolidatedPortsData.ports) return;
            const totalPorts = consolidatedPortsData.total || consolidatedPortsData.ports.length;
            const hosts = [...new Set(consolidatedPortsData.ports.map(p => p.ip))].length;
            if (hideClosedPorts) {
                stat.textContent = `${totalPorts} ports on ${hosts} hosts (closed hidden)`;
            } else {
                stat.textContent = `${totalPorts} ports on ${hosts} hosts`;
            }
        }

        function changeConsolidatedLimit() {
            loadConsolidated(1);
        }

        async function loadConsolidated(page) {
            if (typeof page !== 'number') page = parseInt(this && this.getAttribute('data-page')) || 1;
            try {
                page = page || 1;
                const q = document.getElementById('consolidated-search')?.value || '';
                const state = document.getElementById('consolidated-filter-state')?.value || '';
                const service = document.getElementById('consolidated-filter-service')?.value || '';
                const limit = parseInt(document.getElementById('consolidated-limit')?.value || '50');
                // Fetch filter options once
                await fetchConsolidatedFilterOptions();

                let portsRes;
                const activeGroups = consolidatedFilterGroups.map(g => ({
                    group_mode: g.group_mode || 'and',
                    filters: (g.filters || []).filter(f => f.field)
                })).filter(g => g.filters.length > 0);
                const hasFilters = activeGroups.length > 0;
                if (hasFilters) {
                    const body = {
                        page, limit,
                        search: q || undefined,
                        filter_mode: consolidatedFilterMode || 'and',
                        groups: activeGroups,
                        hide_closed: hideClosedPorts || undefined
                    };
                    portsRes = await fetch(`/api/projects/${projectId}/consolidated/ports/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                } else {
                    let url = `/api/projects/${projectId}/consolidated/ports?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`;
                    if (state) url += `&state=${encodeURIComponent(state)}`;
                    if (service) url += `&service=${encodeURIComponent(service)}`;
                    if (hideClosedPorts) url += `&hide_closed=1`;
                    portsRes = await fetch(url);
                }
                const [raw] = await Promise.all([
                    portsRes.json(),
                    loadConsolidatedScripts(1, 100000)
                ]);
                if (!portsRes.ok) throw new Error(`HTTP ${portsRes.status}: ${raw.error || JSON.stringify(raw)}`);
                consolidatedPortsData = Array.isArray(raw) ? { ports: raw, total: raw.length, page: 1, limit: raw.length } : raw;
                if (consolidatedPortsData.error) throw new Error(consolidatedPortsData.error);
                if (!consolidatedPortsData.ports) consolidatedPortsData = { ports: [], total: 0, page: 1, limit: 50 };
                hostEditsData = {};
                const ips = [...new Set(consolidatedPortsData.ports.map(p => p.ip))];
                await Promise.all(ips.map(ip => loadHostEdits(ip)));

                // Populate service filter dropdown (always refresh when hideClosed is active)
                const svcSelect = document.getElementById('consolidated-filter-service');
                if (svcSelect) {
                    const selected = svcSelect.value;
                    while (svcSelect.options.length > 1) svcSelect.remove(1);
                    const services = [...new Set(consolidatedPortsData.ports.map(p => p.service).filter(Boolean))];
                    services.sort();
                    for (const s of services) {
                        const opt = document.createElement('option');
                        opt.value = s;
                        opt.textContent = s;
                        svcSelect.appendChild(opt);
                    }
                    if (services.includes(selected)) svcSelect.value = selected;
                }

                updateConsolidatedStats();
                renderConsolidatedPorts();
                renderPaginationControls();
            } catch (e) {
                console.error('loadConsolidated error:', e);
                document.getElementById('cports-table').innerHTML = '<div class="empty-state"><p>Error loading: ' + esc(e.message) + '</p></div>';
            }
        }

        let scriptsSearchTimeout = null;
        function debounceSearchScripts() {
            if (scriptsSearchTimeout) clearTimeout(scriptsSearchTimeout);
            scriptsSearchTimeout = setTimeout(() => loadConsolidatedScripts(1), 400);
        }

        async function loadConsolidatedScripts(page, limit) {
            try {
                page = page || 1;
                limit = limit || 50;
                const q = document.getElementById('script-search-tab')?.value || '';
                const res = await fetch(`/api/projects/${projectId}/consolidated/scripts?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`);
                const raw = await res.json();
                consolidatedScriptsData = Array.isArray(raw) ? { scripts: raw, total: raw.length, page: 1, limit: raw.length } : raw;
            } catch (e) {
                consolidatedScriptsData = { scripts: [], total: 0, page: 1, limit: 50 };
            }
        }

        function getPortNSEScripts(ip, port, protocol) {
            return (consolidatedScriptsData.scripts || []).filter(s => s.ip === ip && s.port === port && s.protocol === protocol);
        }

        function toggleNSERow(btn, ip, port, protocol) {
            const tr = btn.closest('tr');
            const nseRow = tr.nextElementSibling;
            if (nseRow && nseRow.classList.contains('nse-row') && nseRow.dataset.parentIp === ip) {
                const isHidden = nseRow.style.display === 'none';
                nseRow.style.display = isHidden ? '' : 'none';
                btn.classList.toggle('active', isHidden);
            }
        }

        let consolidatedSelected = new Set();
        let consolidatedGroupMode = false;
        let consolidatedFilterGroups = [{ group_mode: 'and', filters: [] }];
        let consolidatedFilterMode = 'and';
        let consolidatedFilterOptions = null;
        let consolidatedFilterGroupsBackup = [];

        const FILTER_FIELD_LABELS = {
            ip:'IP',mac:'MAC',hostname:'Hostname',os:'OS',
            host_status:'Status',port:'Port',protocol:'Proto',
            state:'State',service:'Service',version:'Version',
            product:'Product',extra_info:'Extra',change_count:'Changes',
            last_seen:'Last Seen',note:'Note'
        };
        const FILTER_OP_LABELS = {
            eq:'=',neq:'\u2260',contains:'Contains',begins_with:'Starts With',
            ends_with:'Ends With',gt:'>',gte:'\u2265',lt:'<',lte:'\u2264',
            in:'In',not_in:'Not In',between:'Between',
            is_empty:'Is Empty',is_not_empty:'Is Not Empty'
        };

        async function fetchConsolidatedFilterOptions() {
            if (consolidatedFilterOptions) return consolidatedFilterOptions;
            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/filter-options`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                consolidatedFilterOptions = data.fields || {};
                return consolidatedFilterOptions;
            } catch (e) {
                console.error('fetch filter options error:', e);
                consolidatedFilterOptions = {};
                return {};
            }
        }

        function getDefaultOps(fieldType) {
            if (fieldType === 'string') return ['contains','eq','neq','begins_with','ends_with','is_empty','is_not_empty'];
            if (fieldType === 'number') return ['eq','neq','gt','gte','lt','lte','between'];
            if (fieldType === 'date') return ['eq','neq','gt','gte','lt','lte','between'];
            if (fieldType === 'enum') return ['eq','neq','in','not_in','is_empty','is_not_empty'];
            return ['eq','neq','contains'];
        }

        // --- Advanced filter groups ---
        function toggleAdvancedFilterModal() {
            const modal = document.getElementById('advanced-filter-modal');
            if (modal.style.display === 'flex') { closeModal('advanced-filter-modal'); return; }
            consolidatedFilterGroupsBackup = JSON.parse(JSON.stringify(consolidatedFilterGroups));
            document.getElementById('adv-filter-mode').value = consolidatedFilterMode;
            renderAllFilterGroups();
            modal.style.display = 'flex';
        }

        function addFilterGroup() {
            consolidatedFilterGroups.push({ group_mode: 'and', filters: [] });
            renderAllFilterGroups();
        }

        function removeFilterGroup(gi) {
            consolidatedFilterGroups.splice(gi, 1);
            if (consolidatedFilterGroups.length === 0) consolidatedFilterGroups.push({ group_mode: 'and', filters: [] });
            renderAllFilterGroups();
        }

        function addFilterRow() {
            var groupIdx = parseInt(this.getAttribute('data-idx')) || 0;
            if (!consolidatedFilterGroups[groupIdx]) {
                consolidatedFilterGroups.push({ group_mode: 'and', filters: [] });
                groupIdx = consolidatedFilterGroups.length - 1;
            }
            consolidatedFilterGroups[groupIdx].filters.push({ field: '', op: 'contains', value: '' });
            renderAllFilterGroups();
        }

        function removeFilterRow(gi, fi) {
            if (!consolidatedFilterGroups[gi]) return;
            consolidatedFilterGroups[gi].filters.splice(fi, 1);
            renderAllFilterGroups();
        }

        function setGroupMode(gi, mode) {
            if (consolidatedFilterGroups[gi]) consolidatedFilterGroups[gi].group_mode = mode;
        }

        function renderAllFilterGroups() {
            const container = document.getElementById('adv-filter-rows');
            if (!container) return;
            let hasAny = consolidatedFilterGroups.some(g => g.filters.length > 0);
            if (!hasAny) {
                container.innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:0.85rem;">No filters added. Click "+ Add Group" or "+ Add Filter" to get started.</div>';
                return;
            }
            let html = '';
            for (let gi = 0; gi < consolidatedFilterGroups.length; gi++) {
                const g = consolidatedFilterGroups[gi];
                html += `<div class="filter-group" style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">Group ${gi+1}</span>
                        <select class="form-control" style="width:auto;font-size:0.75rem;padding:2px 8px;" onchange="setGroupMode(${gi},this.value);renderAllFilterGroups();">
                            <option value="and" ${g.group_mode==='and'?'selected':''}>AND</option>
                            <option value="or" ${g.group_mode==='or'?'selected':''}>OR</option>
                        </select>
                        <span style="flex:1;"></span>
                        ${consolidatedFilterGroups.length > 1 ? `<button class="btn btn-danger btn-sm" onclick="removeFilterGroup(${gi})" title="Remove group" style="padding:2px 6px;font-size:0.7rem;">&times;</button>` : ''}
                    </div>`;
                for (let fi = 0; fi < g.filters.length; fi++) {
                    html += renderFilterRow(gi, fi);
                }
                html += `<button class="btn btn-secondary btn-sm" onclick="addFilterRow(${gi})" style="font-size:0.75rem;padding:2px 10px;margin-top:4px;">+ Add Filter</button>`;
                html += `</div>`;
            }
            html += `<button class="btn btn-secondary btn-sm" onclick="addFilterGroup()" style="margin-top:4px;">+ Add Group</button>`;
            container.innerHTML = html;
        }

        function renderFilterRow(gi, fi) {
            const g = consolidatedFilterGroups[gi];
            if (!g || !g.filters[fi]) return '';
            const f = g.filters[fi];
            const field = f.field || '';
            const op = f.op || 'contains';
            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';
            const ops = getDefaultOps(fieldType);

            let fieldOptions = '';
            for (const [key, label] of Object.entries(FILTER_FIELD_LABELS)) {
                const sel = key === field ? 'selected' : '';
                fieldOptions += `<option value="${key}" ${sel}>${label}</option>`;
            }
            let opOptions = '';
            for (const o of ops) {
                const sel = o === op ? 'selected' : '';
                opOptions += `<option value="${o}" ${sel}>${FILTER_OP_LABELS[o]||o}</option>`;
            }
            let valueHtml = buildFilterValueInput(gi, fi);

            return `<div class="filter-row" style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">
                <select class="form-control" style="width:130px;font-size:0.8rem;padding:4px 8px;" onchange="onFilterFieldChange(${gi},${fi})">
                    ${fieldOptions}
                </select>
                <select class="form-control" style="width:110px;font-size:0.8rem;padding:4px 8px;" onchange="onFilterOpChange(${gi},${fi})">
                    ${opOptions}
                </select>
                ${valueHtml}
                <button class="btn btn-danger btn-sm" onclick="removeFilterRow(${gi},${fi})" title="Remove" style="padding:4px 8px;font-size:0.8rem;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;
        }

        function onFilterFieldChange(gi, fi) {
            const groupEl = document.querySelectorAll('#adv-filter-rows .filter-group')[gi];
            if (!groupEl) return;
            const rows = groupEl.querySelectorAll('.filter-row');
            const row = rows[fi];
            if (!row) return;
            const selects = row.querySelectorAll('select');
            const field = selects[0].value;
            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';
            const ops = getDefaultOps(fieldType);
            const opSelect = selects[1];
            const defaultOp = ops[0];
            opSelect.innerHTML = ops.map(o => `<option value="${o}" ${o === defaultOp ? 'selected' : ''}>${FILTER_OP_LABELS[o]||o}</option>`).join('');
            opSelect.value = defaultOp;
            // Update stored filter
            const f = consolidatedFilterGroups[gi].filters[fi];
            if (f) { f.field = field; f.op = defaultOp; f.value = ''; delete f.values; delete f.min; delete f.max; }
            // Update value input
            updateFilterValueInput(gi, fi);
        }

        function onFilterOpChange(gi, fi) {
            const groupEl = document.querySelectorAll('#adv-filter-rows .filter-group')[gi];
            if (!groupEl) return;
            const rows = groupEl.querySelectorAll('.filter-row');
            const row = rows[fi];
            if (!row) return;
            const selects = row.querySelectorAll('select');
            const op = selects[1].value;
            const f = consolidatedFilterGroups[gi].filters[fi];
            if (f) f.op = op;
            updateFilterValueInput(gi, fi);
        }

        function updateFilterValueInput(gi, fi) {
            const groupEl = document.querySelectorAll('#adv-filter-rows .filter-group')[gi];
            if (!groupEl) return;
            const rows = groupEl.querySelectorAll('.filter-row');
            const row = rows[fi];
            if (!row) return;
            const container = row.querySelector('.filter-value-container');
            if (!container) return;
            const g = consolidatedFilterGroups[gi];
            if (!g || !g.filters[fi]) return;
            const f = g.filters[fi];
            const field = f.field || '';
            const op = f.op || 'contains';
            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';

            const needsFullReplace = op === 'is_empty' || op === 'is_not_empty' ||
                (fieldType === 'enum' && (op === 'in' || op === 'not_in')) ||
                op === 'between' || fieldType === 'date';

            if (needsFullReplace) { container.outerHTML = buildFilterValueInput(gi, fi); return; }

            let acInput = container.querySelector('.filter-ac-input');
            if (!acInput) { container.outerHTML = buildFilterValueInput(gi, fi); return; }
            acInput.dataset.field = field;
            acInput.value = '';
            acInput.dataset.gi = gi;
            acInput.dataset.fi = fi;
            const oldDd = document.getElementById('ac-dd-' + gi + '-' + fi);
            if (oldDd) oldDd.style.display = 'none';
        }

        function buildFilterValueInput(gi, fi) {
            const g = consolidatedFilterGroups[gi];
            if (!g || !g.filters[fi]) return '<span class="filter-value-container"></span>';
            const f = g.filters[fi];
            const field = f.field || '';
            const op = f.op || 'contains';
            if (op === 'is_empty' || op === 'is_not_empty') return '<span class="filter-value-container" style="font-size:0.8rem;color:var(--text-muted);">(no value needed)</span>';

            const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            const fieldType = fieldMeta ? fieldMeta.type : 'string';
            const acId = gi + '-' + fi;

            if (fieldType === 'enum' && (op === 'in' || op === 'not_in')) {
                const values = fieldMeta.values || [];
                const selected = f.values || [];
                let html = '<span class="filter-value-container" style="display:flex;flex-direction:column;gap:2px;max-height:100px;overflow-y:auto;border:1px solid var(--border);padding:4px 8px;border-radius:4px;width:150px;font-size:0.8rem;">';
                for (const v of values) {
                    const checked = selected.includes(v) ? 'checked' : '';
                    html += `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" ${checked} onchange="updateFilterValues(${gi},${fi},'${escAttr(v)}',this.checked)">${esc(v)}</label>`;
                }
                html += '</span>'; return html;
            }
            if (op === 'between') {
                if (fieldType === 'date') {
                    return `<span class="filter-value-container" style="display:flex;gap:4px;align-items:center;">
                        <input type="date" class="form-control" style="width:120px;font-size:0.8rem;padding:4px 8px;" value="${escAttr(f.min||'')}" onchange="updateFilterMin(${gi},${fi},this.value)">
                        <span style="color:var(--text-muted);font-size:0.8rem;">-</span>
                        <input type="date" class="form-control" style="width:120px;font-size:0.8rem;padding:4px 8px;" value="${escAttr(f.max||'')}" onchange="updateFilterMax(${gi},${fi},this.value)">
                    </span>`;
                }
                return `<span class="filter-value-container" style="display:flex;gap:4px;align-items:center;">
                    <input type="number" class="form-control" style="width:70px;font-size:0.8rem;padding:4px 8px;" placeholder="Min" value="${escAttr(f.min||'')}" onchange="updateFilterMin(${gi},${fi},this.value)">
                    <span style="color:var(--text-muted);font-size:0.8rem;">-</span>
                    <input type="number" class="form-control" style="width:70px;font-size:0.8rem;padding:4px 8px;" placeholder="Max" value="${escAttr(f.max||'')}" onchange="updateFilterMax(${gi},${fi},this.value)">
                </span>`;
            }
            if (fieldType === 'date') {
                return `<span class="filter-value-container"><input type="date" class="form-control" style="width:150px;font-size:0.8rem;padding:4px 8px;" value="${escAttr(f.value||'')}" onchange="updateFilterValue(${gi},${fi},this.value)"></span>`;
            }
            const val = acEscapeHtml(f.value||'');
            return `<span class="filter-value-container">
                <div class="filter-ac-wrap">
                    <input type="text" class="form-control filter-ac-input" style="width:150px;font-size:0.8rem;padding:4px 8px;" value="${val}" placeholder="Type..." autocomplete="off" data-idx="${acId}" data-field="${field}" data-gi="${gi}" data-fi="${fi}" onfocus="acShow(this)" oninput="acInput(this)" onchange="updateFilterValue(${gi},${fi},this.value)">
                </div>
            </span>`;
        }

        function updateFilterValue(gi, fi, val) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.value = val;
        }
        function updateFilterMin(gi, fi, val) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.min = val;
        }
        function updateFilterMax(gi, fi, val) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.max = val;
        }
        function updateFilterValues(gi, fi, val, checked) {
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (!f) return;
            if (!f.values) f.values = [];
            if (checked) f.values.push(val); else f.values = f.values.filter(v => v !== val);
        }

        // --- Autocomplete (uses acId = "gi-fi") ---
        let acTimers = {};
        function acFetch(field, query, callback) {
            const meta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
            if (meta && meta.type === 'enum' && meta.values) {
                let vals = meta.values;
                if (query) { const q = query.toLowerCase(); vals = vals.filter(v => v.toLowerCase().includes(q)); }
                callback(vals); return;
            }
            fetch(`/api/projects/${projectId}/consolidated/field-values?field=${encodeURIComponent(field)}&q=${encodeURIComponent(query)}`)
                .then(r => r.json()).then(d => callback(d.values || [])).catch(() => callback([]));
        }
        function acShow(input) {
            const field = input.dataset.field;
            if (!field) return;
            const acId = input.dataset.idx;
            const dd = acGetDropdown(acId);
            const query = input.value;
            const rect = input.getBoundingClientRect();
            dd.style.left = rect.left + 'px';
            dd.style.top = (rect.bottom + 2) + 'px';
            dd.style.width = Math.max(rect.width, 150) + 'px';
            acFetch(field, query, (values) => acRender(dd, values, query));
            dd.style.display = 'block';
        }

        function acInput(input) {
            const acId = input.dataset.idx;
            // Save to state immediately
            const gi = parseInt(input.dataset.gi);
            const fi = parseInt(input.dataset.fi);
            const f = consolidatedFilterGroups[gi]?.filters[fi];
            if (f) f.value = input.value;
            clearTimeout(acTimers[acId]);
            acTimers[acId] = setTimeout(() => {
                const field = input.dataset.field;
                const query = input.value;
                if (!field) return;
                const dd = acGetDropdown(acId);
                const rect = input.getBoundingClientRect();
                dd.style.left = rect.left + 'px';
                dd.style.top = (rect.bottom + 2) + 'px';
                dd.style.width = Math.max(rect.width, 150) + 'px';
                acFetch(field, query, (values) => acRender(dd, values, query));
            }, 150);
        }

        function acGetDropdown(acId) {
            let dd = document.getElementById('ac-dd-' + acId);
            if (!dd) {
                dd = document.createElement('div');
                dd.id = 'ac-dd-' + acId;
                dd.className = 'filter-ac-dd';
                dd.style.position = 'fixed';
                dd.style.zIndex = '10000';
                document.body.appendChild(dd);
            }
            return dd;
        }

        function acRender(dd, values, query) {
            const acId = dd.id.replace('ac-dd-', '');
            if (!values || values.length === 0) {
                dd.innerHTML = '<div class="filter-ac-item ac-disabled">No matches</div>'; return;
            }
            dd.innerHTML = values.map(v =>
                `<div class="filter-ac-item" onmousedown="event.preventDefault(); acSelect('${acId}','${escAttr(v)}')">${acHighlight(v, query)}</div>`
            ).join('');
        }

        function acSelect(acId, val) {
            const input = document.querySelector(`.filter-ac-input[data-idx="${acId}"]`);
            if (input) { input.value = val; input.dispatchEvent(new Event('change', { bubbles: true })); }
            document.querySelectorAll('[id^="ac-dd-"]').forEach(d => d.style.display = 'none');
        }

        function acHighlight(text, query) {
            if (!query) return acEscapeHtml(text);
            const idx = text.toLowerCase().indexOf(query.toLowerCase());
            if (idx === -1) return acEscapeHtml(text);
            return acEscapeHtml(text.slice(0,idx)) + '<strong>' + acEscapeHtml(text.slice(idx, idx+query.length)) + '</strong>' + acEscapeHtml(text.slice(idx+query.length));
        }

        function acEscapeHtml(str) {
            if (typeof str !== 'string') return str;
            return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.filter-ac-wrap') && !e.target.closest('.filter-ac-dd')) {
                document.querySelectorAll('[id^="ac-dd-"]').forEach(d => d.style.display = 'none');
            }
        });

        function applyAdvancedFilters() {
            const groups = document.querySelectorAll('#adv-filter-rows .filter-group');
            const newGroups = [];
            for (let gi = 0; gi < groups.length; gi++) {
                const modeSelect = groups[gi].querySelector('select[onchange*="setGroupMode"]');
                const groupMode = modeSelect ? modeSelect.value : 'and';
                const filters = [];
                const rows = groups[gi].querySelectorAll('.filter-row');
                for (let fi = 0; fi < rows.length; fi++) {
                    const selects = rows[fi].querySelectorAll('select');
                    if (!selects || selects.length < 2) continue;
                    const field = selects[0].value;
                    const op = selects[1].value;
                    if (!field) continue;
                    const f = { field, op, value: '' };
                    const fieldMeta = consolidatedFilterOptions ? consolidatedFilterOptions[field] : null;
                    const fieldType = fieldMeta ? fieldMeta.type : 'string';
                    const valContainer = rows[fi].querySelector('.filter-value-container');
                    if (valContainer) {
                        if (op === 'is_empty' || op === 'is_not_empty') {}
                        else if (fieldType === 'enum' && (op === 'in' || op === 'not_in')) {
                            const cbs = valContainer.querySelectorAll('input[type="checkbox"]:checked');
                            f.values = Array.from(cbs).map(cb => cb.value);
                        } else if (op === 'between') {
                            const inputs = valContainer.querySelectorAll('input');
                            const minVal = parseInt(inputs[0]?.value);
                            const maxVal = parseInt(inputs[1]?.value);
                            if (!isNaN(minVal)) f.min = minVal;
                            if (!isNaN(maxVal)) f.max = maxVal;
                        } else {
                            const input = valContainer.querySelector('input, select');
                            if (input) f.value = input.value;
                        }
                    }
                    filters.push(f);
                }
                if (filters.length > 0) newGroups.push({ group_mode: groupMode, filters });
            }
            consolidatedFilterGroups = newGroups.length > 0 ? newGroups : [{ group_mode: 'and', filters: [] }];
            consolidatedFilterMode = document.getElementById('adv-filter-mode').value;
            closeModal('advanced-filter-modal');
            updateFilterBadges();
            loadConsolidated(1);
        }

        function cancelAdvancedFilters() {
            consolidatedFilterGroups = consolidatedFilterGroupsBackup.length > 0 ? consolidatedFilterGroupsBackup : [{ group_mode: 'and', filters: [] }];
            closeModal('advanced-filter-modal');
        }

        function clearAdvancedFilters() {
            consolidatedFilterGroups = [{ group_mode: 'and', filters: [] }];
            consolidatedFilterMode = 'and';
            document.getElementById('adv-filter-mode').value = 'and';
            renderAllFilterGroups();
            updateFilterBadges();
            closeModal('advanced-filter-modal');
            loadConsolidated(1);
        }

        function updateFilterBadges() {
            const container = document.getElementById('consolidated-filter-badges');
            if (!container) return;
            const flatCount = consolidatedFilterGroups.reduce((sum,g) => sum + g.filters.filter(f => f.field).length, 0);
            if (flatCount === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }
            container.style.display = 'flex';
            let html = '';
            for (let gi = 0; gi < consolidatedFilterGroups.length; gi++) {
                const g = consolidatedFilterGroups[gi];
                const hasFilters = g.filters.some(f => f.field);
                if (!hasFilters) continue;
                let groupHtml = '';
                let badgeIdx = 0;
                for (let fi = 0; fi < g.filters.length; fi++) {
                    const f = g.filters[fi];
                    if (!f.field) continue;
                    const fieldLabel = FILTER_FIELD_LABELS[f.field] || f.field;
                    const opLabel = FILTER_OP_LABELS[f.op] || f.op;
                    let valLabel = '';
                    if (f.op === 'is_empty') valLabel = '(empty)';
                    else if (f.op === 'is_not_empty') valLabel = '(not empty)';
                    else if (f.op === 'between') valLabel = `${f.min||''} - ${f.max||''}`;
                    else if (f.op === 'in' || f.op === 'not_in') valLabel = (f.values||[]).join(', ');
                    else valLabel = f.value;
                    groupHtml += `<span class="filter-badge" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;font-size:0.75rem;margin:2px;">
                        <strong>${fieldLabel}</strong> ${opLabel} <span style="color:var(--accent);">${valLabel}</span>
                        <span class="filter-badge-remove" onclick="removeFilterBadge(${gi},${fi})" style="cursor:pointer;color:var(--text-muted);font-size:0.8rem;line-height:1;margin-left:2px;">&times;</span>
                    </span>`;
                    badgeIdx++;
                }
                if (groupHtml) {
                    if (html) html += `<span style="font-size:0.75rem;color:var(--accent);margin:0 4px;font-weight:600;">${consolidatedFilterMode.toUpperCase()}</span>`;
                    html += `<span style="display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border:1px dashed var(--border);border-radius:4px;margin:2px;">
                        <span style="font-size:0.65rem;color:var(--text-muted);margin-right:4px;">G${gi+1} ${g.group_mode.toUpperCase()}</span>${groupHtml}</span>`;
                }
            }
            html += `<span class="filter-badge-clear" onclick="clearAdvancedFilters()" style="cursor:pointer;color:var(--danger);font-size:0.75rem;margin-left:6px;">Clear all</span>`;
            container.innerHTML = html;
        }

        function removeFilterBadge(gi, fi) {
            if (consolidatedFilterGroups[gi]) {
                consolidatedFilterGroups[gi].filters.splice(fi, 1);
            }
            updateFilterBadges();
            loadConsolidated(1);
        }


        function toggleConsolidatedSelect(key, checked) {
            if (checked) consolidatedSelected.add(key); else consolidatedSelected.delete(key);
            updateConsolidatedBulkBtn();
        }

        function toggleConsolidatedSelectAll(checked) {
            const ports = (consolidatedPortsData.ports || []);
            if (checked) ports.forEach(p => consolidatedSelected.add(p.ip + '|' + p.port + '|' + p.protocol));
            else consolidatedSelected.clear();
            updateConsolidatedBulkBtn();
            // Update individual checkboxes
            document.querySelectorAll('#cports-table .cons-cb').forEach(cb => cb.checked = checked);
        }

        function updateConsolidatedBulkBtn() {
            const btn = document.getElementById('consolidated-bulk-delete-btn');
            const count = document.getElementById('consolidated-bulk-count');
            if (!btn) return;
            if (consolidatedSelected.size > 0) {
                btn.style.display = '';
                count.textContent = '(' + consolidatedSelected.size + ')';
            } else {
                btn.style.display = 'none';
            }
        }

        function renderConsolidatedPorts() {
            const d = consolidatedPortsData;
            const container = document.getElementById('cports-table');
            const ports = consolidatedGroupMode && consolidatedAllPorts ? consolidatedAllPorts : (d.ports || []);
            if (!d || d.ports.length === 0) {
                consolidatedSelected.clear();
                updateConsolidatedBulkBtn();
            }
            if (consolidatedGroupMode) {
                if (!consolidatedAllPorts) {
                    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>Loading all data for group view...</p></div>';
                    return;
                }
                renderConsolidatedPortsGrouped(container, ports);
                return;
            }
            let html = '<table><thead><tr>';
            html += '<th style="width:36px"><input type="checkbox" onchange="toggleConsolidatedSelectAll(this.checked)" title="Select all"></th>';
            html += '<th>IP</th><th>MAC</th><th>Hostname</th><th>OS</th><th>Status</th><th>Port</th><th>Proto</th><th>State</th><th>Service</th><th>Version</th><th>Product</th><th>Extra</th><th>Changes</th><th>Last Seen</th><th>Note</th><th>Label</th><th class="sticky-right-2">NSE</th><th class="sticky-right"></th>';
            html += '</tr></thead><tbody>';
            for (const p of ports) {
                const key = p.ip + '|' + p.port + '|' + p.protocol;
                const histBtn = '<button class="btn btn-secondary btn-sm btn-history" onclick="event.stopPropagation();openPortHistory(\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View scan history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>';
                const nseScripts = getPortNSEScripts(p.ip, p.port, p.protocol);
                const nseBtn = nseScripts.length > 0 ? '<button class="btn btn-secondary btn-sm btn-nse" onclick="event.stopPropagation();toggleNSERow(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View NSE scripts"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><span class="nse-count">' + nseScripts.length + '</span></button>' : '<span style="color:var(--text-muted);font-size:0.7rem;">-</span>';
                const checked = consolidatedSelected.has(key) ? 'checked' : '';
                html += '<tr data-ip="' + esc(p.ip) + '" data-port="' + p.port + '" data-proto="' + esc(p.protocol) + '">';
                html += '<td><input type="checkbox" class="cons-cb" data-key="' + esc(key) + '" ' + checked + ' onchange="toggleConsolidatedSelect(\'' + esc(key) + '\', this.checked)"></td>';
                html += '<td class="mono">' + esc(p.ip) + '</td>';
                html += '<td class="mono editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'mac\',\'' + esc(p.mac || '') + '\')">' + (esc(p.mac) || '-') + getHostEditRevertHtml(p.ip) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'hostname\',\'' + esc(p.hostname || '') + '\')">' + (esc(p.hostname) || '-') + getHostEditRevertHtml(p.ip) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'os\',\'' + esc(p.os || '') + '\')">' + (esc(p.os) || '-') + getHostEditRevertHtml(p.ip) + '</td>';
                html += '<td>' + stateBadge(p.host_status) + '</td>';
                html += '<td>' + p.port + '</td>';
                html += '<td>' + esc(p.protocol) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'state\',\'' + esc(p.state) + '\')">' + stateBadge(p.state) + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'service\',\'' + esc(p.service || '') + '\')">' + (esc(p.service) || '-') + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'version\',\'' + esc(p.version || '') + '\')">' + (esc(p.version) || '-') + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'product\',\'' + esc(p.product || '') + '\')">' + (esc(p.product) || '-') + '</td>';
                html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'extra_info\',\'' + esc(p.extra_info || '') + '\')" title="' + esc(p.extra_info || '') + '">' + (esc(p.extra_info) || '-') + '</td>';
                html += '<td style="text-align:center;">' + p.change_count + '</td>';
                html += '<td>' + formatDate(p.last_seen) + '</td>';
                html += '<td class="editable-cell" onclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'note\',\'' + esc(p.note_preview || '') + '\')" title="' + esc(p.note_preview || '') + '">' + (esc(p.note_preview) || '-') + '</td>';
                html += '<td>' + renderLabelDropdown(p) + '</td>';
                html += '<td class="sticky-right-2">' + nseBtn + '</td>';
                html += '<td class="sticky-right">' + histBtn + '</td>';
                html += '</tr>';
                if (nseScripts.length > 0) {
                    html += '<tr class="nse-row" style="display:none;" data-parent-ip="' + esc(p.ip) + '" data-parent-port="' + p.port + '" data-parent-proto="' + esc(p.protocol) + '">';
                    html += '<td colspan="19"><div class="nse-content">';
                    for (const s of nseScripts) {
                        html += '<div class="nse-item"><div class="nse-left"><span class="nse-id">' + esc(s.script_id) + '</span><pre class="nse-output">' + esc(s.output) + '</pre></div><span class="nse-eye" onclick="showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View full output"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span></div>';
                    }
                    html += '</div></td></tr>';
                }
            }
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        const LABEL_OPTIONS = [
            {value: '', label: 'None', color: ''},
            {value: 'critical', label: 'Critical', color: '#ef4444'},
            {value: 'high', label: 'High', color: '#f97316'},
            {value: 'medium', label: 'Medium', color: '#eab308'},
            {value: 'low', label: 'Low', color: '#22c55e'},
            {value: 'info', label: 'Info', color: '#3b82f6'},
            {value: 'interesting', label: 'Interesting', color: '#a855f7'}
        ];

        function renderLabelDropdown(p) {
            const current = (p.label || '').toLowerCase();
            const opt = LABEL_OPTIONS.find(o => o.value === current);
            const color = opt ? opt.color : '';
            const displayLabel = opt && opt.value ? opt.label : '';
            let html = `<div class="label-dd" style="position:relative;display:inline-block;">`;
            html += `<button class="label-btn" onclick="event.stopPropagation();this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'" style="padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;text-transform:uppercase;border:1px solid ${color || 'var(--border)'};background:${color ? color+'22' : 'transparent'};color:${color || 'var(--text-muted)'};cursor:pointer;white-space:nowrap;">${displayLabel || '-'}</button>`;
            html += `<div class="label-menu" style="display:none;position:absolute;top:100%;left:0;z-index:50;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;min-width:110px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">`;
            for (const o of LABEL_OPTIONS) {
                const sel = o.value === current ? ' style="background:var(--accent);color:white;"' : '';
                html += `<div class="label-menu-item"${sel} onclick="event.stopPropagation();setPortLabel('${esc(p.ip)}',${p.port},'${esc(p.protocol)}','${o.value}');this.closest('.label-menu').style.display='none';" style="padding:5px 10px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:6px;">`;
                if (o.color) html += `<span style="width:8px;height:8px;border-radius:50%;background:${o.color};display:inline-block;"></span>`;
                html += `${o.label}</div>`;
            }
            html += '</div></div>';
            return html;
        }

        async function setPortLabel(ip, port, protocol, label) {
            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/ports/update`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken},
                    body: JSON.stringify({ip, port, protocol, field: 'label', value: label})
                });
                if (!res.ok) throw new Error((await res.json()).error);
                // Update local data
                const p = consolidatedPortsData.ports.find(x => x.ip === ip && x.port === port && x.protocol === protocol);
                if (p) p.label = label;
                // Re-render
                renderConsolidatedPorts();
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        function renderPaginationControls() {
            const d = consolidatedPortsData;
            const container = document.getElementById('cports-pagination');
            if (!container) return;
            if (!d || !d.ports || d.total === 0) {
                container.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(d.total / d.limit);
            const currentPage = d.page;
            const limitSelect = document.getElementById('consolidated-limit');
            if (limitSelect && limitSelect.value !== String(d.limit)) {
                const opts = ['10','25','50','100','200','500','100000'];
                const closest = opts.reduce((a, b) => Math.abs(b - d.limit) < Math.abs(a - d.limit) ? b : a);
                limitSelect.value = String(d.limit);
            }
            let html = '<div class="pagination">';
            html += '<span class="pagination-info">Showing ' + ((currentPage - 1) * d.limit + 1) + '-' + Math.min(currentPage * d.limit, d.total) + ' of ' + d.total + '</span>';
            if (currentPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(' + (currentPage - 1) + ')">&laquo; Prev</button>';
            }
            const maxButtons = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            if (endPage - startPage + 1 < maxButtons) {
                startPage = Math.max(1, endPage - maxButtons + 1);
            }
            if (startPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(1)">1</button>';
                if (startPage > 2) html += '<span class="pagination-dots">...</span>';
            }
            for (let i = startPage; i <= endPage; i++) {
                html += '<button class="btn btn-sm ' + (i === currentPage ? 'btn-primary' : 'btn-secondary') + '" onclick="loadConsolidated(' + i + ')">' + i + '</button>';
            }
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += '<span class="pagination-dots">...</span>';
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(' + totalPages + ')">' + totalPages + '</button>';
            }
            if (currentPage < totalPages) {
                html += '<button class="btn btn-secondary btn-sm" onclick="loadConsolidated(' + (currentPage + 1) + ')">Next &raquo;</button>';
            }
            html += '</div>';
            container.innerHTML = html;
        }

        let consolidatedAllPorts = null;

        function toggleConsolidatedGroup() {
            consolidatedGroupMode = !consolidatedGroupMode;
            const btn = document.getElementById('consolidated-group-btn');
            if (btn) { btn.classList.toggle('btn-primary', consolidatedGroupMode); btn.classList.toggle('btn-secondary', !consolidatedGroupMode); }
            if (consolidatedGroupMode) {
                fetchAllConsolidated().then(() => renderConsolidatedPorts());
            } else {
                consolidatedAllPorts = null;
                renderConsolidatedPorts();
            }
        }

        async function fetchAllConsolidated() {
            try {
                const q = document.getElementById('consolidated-search')?.value || '';
                const state = document.getElementById('consolidated-filter-state')?.value || '';
                const service = document.getElementById('consolidated-filter-service')?.value || '';
                const activeGroups = consolidatedFilterGroups.map(g => ({
                    group_mode: g.group_mode || 'and',
                    filters: (g.filters || []).filter(f => f.field)
                })).filter(g => g.filters.length > 0);
                const hasFilters = activeGroups.length > 0;
                let res;
                if (hasFilters) {
                    const body = { page: 1, limit: 100000, search: q || undefined, filter_mode: consolidatedFilterMode || 'and', groups: activeGroups };
                    res = await fetch(`/api/projects/${projectId}/consolidated/ports/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                } else {
                    let url = `/api/projects/${projectId}/consolidated/ports?page=1&limit=100000&q=${encodeURIComponent(q)}`;
                    if (state) url += `&state=${encodeURIComponent(state)}`;
                    if (service) url += `&service=${encodeURIComponent(service)}`;
                    res = await fetch(url);
                }
                const raw = await res.json();
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.error || JSON.stringify(raw)}`);
                consolidatedAllPorts = Array.isArray(raw) ? raw : (raw.ports || []);
            } catch (e) {
                showToast('Error loading all data: ' + e.message, 'error');
                consolidatedAllPorts = null;
            }
        }

        function toggleConsolidatedHostGroup(header) {
            const key = header.getAttribute('data-key');
            const rows = document.querySelectorAll('#cports-table tr[data-group-key="' + key + '"]:not(.nse-row)');
            const nseRows = document.querySelectorAll('#cports-table tr.nse-row[data-group-key="' + key + '"]');
            const arrow = header.querySelector('.group-arrow');
            const isOpen = arrow && arrow.classList.contains('open');
            rows.forEach(r => r.style.display = isOpen ? 'none' : '');
            if (!isOpen) nseRows.forEach(r => r.style.display = 'none');
            if (arrow) arrow.classList.toggle('open', !isOpen);
        }

        function selectConsolidatedHostGroup(header, checked) {
            const ip = header.getAttribute('data-key');
            const src = consolidatedGroupMode && consolidatedAllPorts ? consolidatedAllPorts : (consolidatedPortsData.ports || []);
            const hostPorts = src.filter(p => p.ip === ip);
            for (const p of hostPorts) {
                const key = p.ip + '|' + p.port + '|' + p.protocol;
                if (checked) consolidatedSelected.add(key); else consolidatedSelected.delete(key);
            }
            const rows = document.querySelectorAll('#cports-table tr[data-group-key="' + esc(ip) + '"]');
            rows.forEach(r => {
                const cb = r.querySelector('.cons-cb');
                if (cb) cb.checked = checked;
            });
            updateConsolidatedBulkBtn();
        }

        function renderConsolidatedPortsGrouped(container, ports) {
            // Group ports by IP
            const groups = {};
            for (const p of ports) {
                if (!groups[p.ip]) groups[p.ip] = [];
                groups[p.ip].push(p);
            }
            const sortedIPs = Object.keys(groups).sort((a, b) => {
                const pa = a.split('.').map(Number);
                const pb = b.split('.').map(Number);
                for (let i = 0; i < 4; i++) {
                    if (pa[i] !== pb[i]) return pa[i] - pb[i];
                }
                return 0;
            });

            const nCols = 19; // checkbox + 18 data columns
            let html = '<table><thead><tr>';
            html += '<th style="width:36px"><input type="checkbox" onchange="toggleConsolidatedSelectAll(this.checked)" title="Select all"></th>';
            html += '<th>IP</th><th>MAC</th><th>Hostname</th><th>OS</th><th>Status</th><th>Port</th><th>Proto</th><th>State</th><th>Service</th><th>Version</th><th>Product</th><th>Extra</th><th>Changes</th><th>Last Seen</th><th>Note</th><th>Label</th><th class="sticky-right-2">NSE</th><th class="sticky-right"></th>';
            html += '</tr></thead><tbody>';

            for (const ip of sortedIPs) {
                const hostPorts = groups[ip];
                const first = hostPorts[0];
                const key = ip;
                const hostChecked = hostPorts.every(p => consolidatedSelected.has(p.ip + '|' + p.port + '|' + p.protocol));

                // Group header row
                html += '<tr class="group-header" data-key="' + esc(key) + '" onclick="toggleConsolidatedHostGroup(this)">';
                html += '<td onclick="event.stopPropagation();"><input type="checkbox" class="cons-cb" ' + (hostChecked ? 'checked' : '') + ' onchange="selectConsolidatedHostGroup(this.closest(\'tr\'), this.checked)"></td>';
                html += '<td class="mono"><span class="group-arrow">&#9654;</span>' + esc(ip) + '</td>';
                html += '<td class="mono">' + (esc(first.mac) || '-') + '</td>';
                html += '<td>' + (esc(first.hostname) || '-') + '</td>';
                html += '<td>' + (esc(first.os) || '-') + '</td>';
                html += '<td>' + stateBadge(first.host_status) + '</td>';
                html += '<td colspan="12"><span class="badge badge-hosts">' + hostPorts.length + ' port' + (hostPorts.length > 1 ? 's' : '') + '</span></td>';
                html += '</tr>';

                // Sub-rows (hidden by default)
                for (const p of hostPorts) {
                    const pkey = p.ip + '|' + p.port + '|' + p.protocol;
                    const histBtn = '<button class="btn btn-secondary btn-sm btn-history" onclick="event.stopPropagation();openPortHistory(\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View scan history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>';
                    const nseScripts = getPortNSEScripts(p.ip, p.port, p.protocol);
                    const nseBtn = nseScripts.length > 0 ? '<button class="btn btn-secondary btn-sm btn-nse" onclick="event.stopPropagation();toggleNSERow(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View NSE scripts" style="display:inline-flex;align-items:center;gap:2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg><span class="nse-count">' + nseScripts.length + '</span></button>' : '<span style="color:var(--text-muted);font-size:0.7rem;">-</span>';
                    const checked = consolidatedSelected.has(pkey) ? 'checked' : '';
                    html += '<tr data-group-key="' + esc(key) + '" style="display:none;" data-ip="' + esc(p.ip) + '" data-port="' + p.port + '" data-proto="' + esc(p.protocol) + '">';
                    html += '<td><input type="checkbox" class="cons-cb" data-key="' + esc(pkey) + '" ' + checked + ' onchange="toggleConsolidatedSelect(\'' + esc(pkey) + '\', this.checked)"></td>';
                    html += '<td class="mono" style="opacity:0.4;">' + esc(p.ip) + '</td>';
                    html += '<td class="mono" style="opacity:0.4;">-</td>';
                    html += '<td style="opacity:0.4;">-</td>';
                    html += '<td style="opacity:0.4;">-</td>';
                    html += '<td style="opacity:0.4;">-</td>';
                    html += '<td>' + p.port + '</td>';
                    html += '<td>' + esc(p.protocol) + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'state\',\'' + esc(p.state) + '\')">' + stateBadge(p.state) + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'service\',\'' + esc(p.service || '') + '\')">' + (esc(p.service) || '-') + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'version\',\'' + esc(p.version || '') + '\')">' + (esc(p.version) || '-') + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'product\',\'' + esc(p.product || '') + '\')">' + (esc(p.product) || '-') + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'extra_info\',\'' + esc(p.extra_info || '') + '\')" title="' + esc(p.extra_info || '') + '">' + (esc(p.extra_info) || '-') + '</td>';
                    html += '<td style="text-align:center;">' + p.change_count + '</td>';
                    html += '<td>' + formatDate(p.last_seen) + '</td>';
                    html += '<td class="editable-cell" ondblclick="editConsolidatedCell(this,\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\',\'note\',\'' + esc(p.note_preview || '') + '\')" title="' + esc(p.note_preview || '') + '">' + (esc(p.note_preview) || '-') + '</td>';
                    html += '<td>' + renderLabelDropdown(p) + '</td>';
                    html += '<td class="sticky-right-2">' + nseBtn + '</td>';
                    html += '<td class="sticky-right">' + histBtn + '</td>';
                    html += '</tr>';
                    if (nseScripts.length > 0) {
                        html += '<tr class="nse-row" style="display:none;" data-group-key="' + esc(key) + '" data-parent-ip="' + esc(p.ip) + '" data-parent-port="' + p.port + '" data-parent-proto="' + esc(p.protocol) + '">';
                        html += '<td colspan="' + nCols + '"><div class="nse-content">';
                        for (const s of nseScripts) {
                            html += '<div class="nse-item"><div class="nse-left"><span class="nse-id">' + esc(s.script_id) + '</span><pre class="nse-output">' + esc(s.output) + '</pre></div><span class="nse-eye" onclick="showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View full output"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span></div>';
                        }
                        html += '</div></td></tr>';
                    }
                }
            }
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        async function openPortNote(ip, port, protocol) {
            const mid = 'port-note-modal';
            const old = document.getElementById(mid);
            if (old) old.remove();
            const label = esc(ip) + ':' + port + '/' + esc(protocol || 'tcp');
            let noteText = '';
            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/notes?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`);
                const data = await res.json();
                noteText = data.note || '';
            } catch (e) {}
            const body = '<div style="margin-bottom:15px;">' +
                '<label style="display:block;margin-bottom:6px;color:var(--text-muted);font-size:0.85rem;">Port: <strong>' + label + '</strong></label>' +
                '<textarea id="port-note-textarea" class="form-control" style="min-height:100px;resize:vertical;" placeholder="Enter note for this port...">' + esc(noteText) + '</textarea></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button class="btn btn-secondary" id="port-note-delete" style="margin-right:auto;">Delete</button> ' +
                '<button class="btn btn-secondary" id="port-note-cancel">Cancel</button> ' +
                '<button class="btn btn-primary" id="port-note-save">Save</button></div>';
            const modal = showModal(mid, 'Port Note', body, 'modal-small');
            const ta = modal.querySelector('#port-note-textarea');
            modal.querySelector('#port-note-save').addEventListener('click', async function() {
                const note = ta.value.trim();
                try {
                    await fetch(`/api/projects/${projectId}/consolidated/notes/set`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ip, port, protocol, note })
                    });
                    showToast(note ? 'Note saved' : 'Note cleared');
                    closeModal(mid);
                } catch (e) {
                    showToast('Error saving note: ' + e.message, 'error');
                }
            });
            modal.querySelector('#port-note-delete').addEventListener('click', async function() {
                try {
                    await fetch(`/api/projects/${projectId}/consolidated/notes/delete?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`, { method: 'DELETE' });
                    showToast('Note deleted');
                    closeModal(mid);
                } catch (e) {
                    showToast('Error: ' + e.message, 'error');
                }
            });
            modal.querySelector('#port-note-cancel').addEventListener('click', function() { closeModal(mid); });
        }

        async function editConsolidatedCell(cell, ip, port, protocol, field, original) {
            if (cell.querySelector('input')) return;
            const current = cell.textContent.trim() === '-' ? '' : cell.textContent.trim();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = current;
            input.className = 'form-control';
            input.style.fontSize = '0.85rem';
            input.style.padding = '4px 6px';
            cell.textContent = '';
            cell.appendChild(input);
            input.focus();
            input.select();

            const save = async () => {
                const newVal = input.value.trim();
                if (newVal !== current) {
                    try {
                        await fetch(`/api/projects/${projectId}/consolidated/ports/update`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ip, port, protocol, field, value: newVal })
                        });
                        if (field === 'mac' || field === 'hostname' || field === 'os') {
                            await loadConsolidated(1);
                            await loadHostEdits(ip);
                            renderConsolidatedPorts();
                        } else {
                            cell.textContent = newVal || '-';
                        }
                        showToast('Updated');
                    } catch (e) {
                        cell.textContent = current || '-';
                        showToast('Update failed: ' + e.message, 'error');
                    }
                } else {
                    cell.textContent = current || '-';
                }
            };

            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') { cell.textContent = current || '-'; }
            });
        }

        async function revertEdit(editId, ip, port, protocol) {
            if (!confirm('Revert this manual edit?')) return;
            try {
                await fetch(`/api/projects/${projectId}/consolidated/ports/edits/${editId}/revert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, port, protocol })
                });
                showToast('Edit reverted');
                await loadHostEdits(ip);
                renderConsolidatedPorts();
            } catch (e) {
                showToast('Revert failed: ' + e.message, 'error');
            }
        }

        async function applyEdit(editId, ip, port, protocol) {
            if (!confirm('Re-apply this manual edit?')) return;
            try {
                await fetch(`/api/projects/${projectId}/consolidated/ports/edits/${editId}/apply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, port, protocol })
                });
                showToast('Edit re-applied');
                await loadConsolidated(1);
                openPortHistory(ip, port, protocol);
            } catch (e) {
                showToast('Re-apply failed: ' + e.message, 'error');
            }
        }

        async function revertHostEdit(editId, ip) {
            try {
                await fetch(`/api/projects/${projectId}/consolidated/hosts/edits/${editId}/revert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip })
                });
                showToast('Reverted');
                await loadConsolidated(1);
                await loadHostEdits(ip);
                renderConsolidatedPorts();
            } catch (e) {
                showToast('Revert failed: ' + e.message, 'error');
            }
        }

        function safeLower(s) { return (s || '').toString().toLowerCase(); }

        async function bulkDeleteConsolidatedPorts() {
            const items = [...consolidatedSelected];
            if (items.length === 0) return;
            const mid = 'confirm-bulk-del-consolidated';
            const old = document.getElementById(mid);
            if (old) old.remove();
            const label = items.length + ' port' + (items.length > 1 ? 's' : '');
            const body = '<p style="margin-bottom:15px;color:var(--text-muted);">Delete ' + label + ' from consolidated assets?</p>' +
                '<div style="max-height:200px;overflow-y:auto;margin-bottom:15px;font-size:0.8rem;color:var(--text-muted);">' +
                items.map(k => '<div>' + esc(k.replace(/\|/g, ':')) + '</div>').join('') + '</div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button class="btn btn-secondary" id="bulk-del-cons-cancel">Cancel</button> ' +
                '<button class="btn btn-danger" id="bulk-del-cons-ok">Delete ' + label + '</button></div>';
            const modal = showModal(mid, 'Bulk Delete', body, 'modal-small');
            modal.querySelector('#bulk-del-cons-ok').addEventListener('click', async function() {
                closeModal(mid);
                try {
                    const payload = items.map(k => {
                        const parts = k.split('|');
                        return { ip: parts[0], port: parseInt(parts[1]), protocol: parts[2] };
                    });
                    await fetch(`/api/projects/${projectId}/consolidated/ports/bulk-delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ports: payload })
                    });
                    showToast(label + ' deleted');
                    consolidatedSelected.clear();
                    await loadConsolidated(1);
                } catch (e) {
                    showToast('Error: ' + e.message, 'error');
                }
            });
            modal.querySelector('#bulk-del-cons-cancel').addEventListener('click', function() { closeModal(mid); });
        }

        function filterAssets() {
            loadConsolidated(1);
        }

        function clearConsolidatedSearch() {
            document.getElementById('consolidated-search').value = '';
            document.getElementById('consolidated-search-clear').style.display = 'none';
            loadConsolidated(1);
        }

        function toggleAssetExportDropdown(e) {
            e.stopPropagation();
            const dd = document.getElementById('asset-export-dropdown');
            const isOpen = dd.style.display !== 'none';
            dd.style.display = isOpen ? 'none' : '';
            if (!isOpen) {
                setTimeout(() => document.addEventListener('click', closeAssetExportDropdown, { once: true }), 0);
            }
        }
        function closeAssetExportDropdown() { document.getElementById('asset-export-dropdown').style.display = 'none'; }
        function exportAsset() {
            var fmt = this.getAttribute('data-format');
            closeAssetExportDropdown();
            var q = document.getElementById('consolidated-search')?.value || '';
            var state = document.getElementById('consolidated-filter-state')?.value || '';
            var service = document.getElementById('consolidated-filter-service')?.value || '';
            var url = `/api/projects/${projectId}/consolidated/export/${fmt}?q=${encodeURIComponent(q)}`;
            if (state) url += `&state=${encodeURIComponent(state)}`;
            if (service) url += `&service=${encodeURIComponent(service)}`;
            if (hideClosedPorts) url += `&hide_closed=1`;
            var activeGroups = consolidatedFilterGroups.map(function(g) {
                return { group_mode: g.group_mode || 'and', filters: (g.filters || []).filter(function(f) { return f.field; }) };
            }).filter(function(g) { return g.filters.length > 0; });
            if (activeGroups.length > 0) {
                url += `&filter_mode=${encodeURIComponent(consolidatedFilterMode || 'and')}`;
                url += `&filters=${encodeURIComponent(JSON.stringify(activeGroups))}`;
            }
            window.location.href = url;
        }

        function copyConsolidatedIPs() {
            const ports = consolidatedPortsData.ports || [];
            const ips = [...new Set(ports.map(p => p.ip))];
            if (ips.length === 0) { showToast('No IPs to copy', 'error'); return; }
            const text = ips.join(',');
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            });
        }

        // Scripts Tab

        let scriptsFiltered = [];
        let scriptsCurrentPage = 1;
        let scriptsPerPage = 50;
        let scriptGroupMode = 'flat';
        let scriptSortField = '';
        let scriptSortDir = 'asc';

        function loadScriptsTab() {
            scriptsCurrentPage = 1;
            loadConsolidatedScripts(1, 100000).then(() => {
                populateScriptFilter();
                populateScriptServiceFilter();
                applyScriptFilters();
            }).catch(() => {
                document.getElementById('scripts-table').innerHTML = '<div class="empty-state"><h3>No scripts</h3><p>No NSE scripts found</p></div>';
            });
        }

        function sortScriptsData() {
            if (!scriptSortField) return;
            scriptsFiltered.sort((a, b) => {
                let va = a[scriptSortField], vb = b[scriptSortField];
                if (typeof va === 'string') va = va.toLowerCase();
                if (typeof vb === 'string') vb = vb.toLowerCase();
                if (scriptSortField === 'port') { va = Number(va); vb = Number(vb); }
                if (va < vb) return scriptSortDir === 'asc' ? -1 : 1;
                if (va > vb) return scriptSortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        function applyScriptFilters() {
            const sid = document.getElementById('script-filter').value;
            const stateVal = document.getElementById('script-filter-state').value;
            const protoVal = document.getElementById('script-filter-proto').value;
            const svcVal = document.getElementById('script-filter-service').value;
            const q = document.getElementById('script-search-tab')?.value?.toLowerCase() || '';
            scriptsFiltered = (consolidatedScriptsData.scripts || []).filter(s => {
                if (sid && s.script_id !== sid) return false;
                if (stateVal && s.state !== stateVal) return false;
                if (protoVal && s.protocol !== protoVal) return false;
                if (svcVal && (s.service || '') !== svcVal) return false;
                if (q) {
                    return safeLower(s.ip).includes(q) ||
                           safeLower(s.script_id).includes(q) ||
                           safeLower(s.output).includes(q) ||
                           safeLower(s.service).includes(q) ||
                           String(s.port).includes(q);
                }
                return true;
            });
            sortScriptsData();
            scriptsCurrentPage = 1;
            renderScriptsPage();
            renderScriptPagination();
        }

        function sortScripts(field) {
            if (scriptSortField === field) {
                scriptSortDir = scriptSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                scriptSortField = field;
                scriptSortDir = 'asc';
            }
            sortScriptsData();
            renderScriptsPage();
            renderScriptPagination();
        }

        function scriptSortArrow(field) {
            if (scriptSortField !== field) return '';
            return scriptSortDir === 'asc' ? ' \u25B2' : ' \u25BC';
        }

        function renderScriptsPage() {
            if (scriptGroupMode !== 'flat') {
                renderScriptsGrouped();
                return;
            }
            const start = (scriptsCurrentPage - 1) * scriptsPerPage;
            const end = Math.min(start + scriptsPerPage, scriptsFiltered.length);
            const pageData = scriptsFiltered.slice(start, end);
            const container = document.getElementById('scripts-table');
            if (pageData.length === 0) {
                container.innerHTML = '<div class="empty-state"><h3>No results</h3><p>No scripts match the current filter</p></div>';
                return;
            }
            let html = '<table><thead><tr>';
            html += '<th onclick="sortScripts(\'ip\')" style="cursor:pointer;">IP' + scriptSortArrow('ip') + '</th>';
            html += '<th onclick="sortScripts(\'port\')" style="cursor:pointer;">Port' + scriptSortArrow('port') + '</th>';
            html += '<th onclick="sortScripts(\'protocol\')" style="cursor:pointer;">Proto' + scriptSortArrow('protocol') + '</th>';
            html += '<th onclick="sortScripts(\'service\')" style="cursor:pointer;">Service' + scriptSortArrow('service') + '</th>';
            html += '<th onclick="sortScripts(\'state\')" style="cursor:pointer;">State' + scriptSortArrow('state') + '</th>';
            html += '<th>Extra</th>';
            html += '<th onclick="sortScripts(\'script_id\')" style="cursor:pointer;">Script ID' + scriptSortArrow('script_id') + '</th>';
            html += '<th>Output</th><th></th>';
            html += '</tr></thead><tbody>';
            for (const s of pageData) {
                const key = esc(s.script_id) + '-' + esc(s.ip) + '-' + s.port;
                html += '<tr style="cursor:pointer;" onclick="toggleScriptExpand(this)" data-key="' + key + '">';
                html += '<td class="mono">' + esc(s.ip) + '</td>';
                html += '<td>' + s.port + '</td>';
                html += '<td>' + esc(s.protocol) + '</td>';
                html += '<td>' + (esc(s.service) || '-') + '</td>';
                html += '<td>' + stateBadge(s.state) + '</td>';
                html += '<td title="' + esc(s.extra_info || '') + '">' + (esc(s.extra_info) || '-') + '</td>';
                html += '<td><span class="nse-id" style="font-family:var(--font-mono);color:var(--cyan);font-size:0.85rem;">' + esc(s.script_id) + '</span></td>';
                html += '<td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><pre style="margin:0;font-size:0.75rem;color:var(--text-muted);">' + esc(s.output).substring(0, 120) + (s.output.length > 120 ? '...' : '') + '</pre></td>';
                html += '<td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View output"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
                html += ' <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();goToConsolidatedPort(\'' + esc(s.ip) + '\',' + s.port + ')" title="View in Assets"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></td>';
                html += '</tr>';
                html += '<tr class="script-expand-row" style="display:none;" data-key="' + key + '"><td colspan="9"><div style="padding:8px;"><pre style="white-space:pre-wrap;font-size:0.75rem;background:var(--bg-input);padding:8px;border-radius:4px;margin:0;max-height:300px;overflow-y:auto;">' + esc(s.output) + '</pre></div></td></tr>';
            }
            html += '</tbody></table>';
            container.innerHTML = html;
        }

        function goToConsolidatedPort(ip, port) {
            showTab('consolidated', document.querySelector('.sidebar-btn[data-tab="consolidated"]'));
            const search = document.getElementById('consolidated-search');
            if (search) { search.value = ''; document.getElementById('consolidated-search-clear').style.display = 'none'; }
            document.getElementById('consolidated-filter-state').value = '';
            document.getElementById('consolidated-filter-service').value = '';
            consolidatedFilterGroups = [{ group_mode: 'and', filters: [
                { field: 'ip', op: 'eq', value: ip },
                { field: 'port', op: 'eq', value: String(port) }
            ]}];
            updateFilterBadges();
            loadConsolidated(1);
        }

        function toggleScriptGroup() {
            var mode = this.getAttribute('data-mode');
            scriptGroupMode = mode;
            const groupBtns = document.querySelectorAll('#tab-scripts .btn-group [data-mode]');
            groupBtns.forEach(b => {
                b.classList.toggle('btn-primary', b.dataset.mode === mode);
                b.classList.toggle('btn-secondary', b.dataset.mode !== mode);
            });
            renderScriptsPage();
            renderScriptPagination();
        }

        function renderScriptsGrouped() {
            const container = document.getElementById('scripts-table');
            if (scriptsFiltered.length === 0) {
                container.innerHTML = '<div class="empty-state"><h3>No results</h3><p>No scripts match the current filter</p></div>';
                return;
            }
            const groupField = scriptGroupMode === 'script' ? 'script_id' : 'ip';
            const groups = {};
            for (const s of scriptsFiltered) {
                const key = s[groupField] || '(unknown)';
                if (!groups[key]) groups[key] = [];
                groups[key].push(s);
            }
            const sortedKeys = Object.keys(groups).sort();
            let html = '<table><thead><tr>';
            html += '<th>' + (groupField === 'script_id' ? 'Script ID' : 'Host') + '</th>';
            html += '<th onclick="sortScripts(\'ip\')" style="cursor:pointer;">IP' + scriptSortArrow('ip') + '</th>';
            html += '<th onclick="sortScripts(\'port\')" style="cursor:pointer;">Port' + scriptSortArrow('port') + '</th>';
            html += '<th onclick="sortScripts(\'protocol\')" style="cursor:pointer;">Proto' + scriptSortArrow('protocol') + '</th>';
            html += '<th onclick="sortScripts(\'service\')" style="cursor:pointer;">Service' + scriptSortArrow('service') + '</th>';
            html += '<th onclick="sortScripts(\'state\')" style="cursor:pointer;">State' + scriptSortArrow('state') + '</th>';
            html += '<th>Extra</th>';
            html += '<th onclick="sortScripts(\'script_id\')" style="cursor:pointer;">Script ID' + scriptSortArrow('script_id') + '</th>';
            html += '<th>Output</th><th></th>';
            html += '</tr></thead>';
            for (const gkey of sortedKeys) {
                const entries = groups[gkey].sort((a, b) => a.ip.localeCompare(b.ip) || a.port - b.port);
                const safeGkey = esc(gkey);
                html += '<tbody class="script-group" data-group="' + safeGkey + '">';
                html += '<tr class="script-group-header" onclick="toggleScriptGroupBody(this)">';
                html += '<td colspan="10"><span class="group-toggle-icon">&#9654;</span> <strong>' + safeGkey + '</strong> <span class="group-count">' + entries.length + ' ' + (entries.length === 1 ? 'entry' : 'entries') + '</span></td>';
                html += '</tr>';
                for (const s of entries) {
                    const key = esc(s.script_id) + '-' + esc(s.ip) + '-' + s.port;
                    html += '<tr class="script-group-row" style="display:none;" onclick="toggleScriptExpand(this)" data-key="' + key + '">';
                    html += '<td></td>';
                    html += '<td class="mono">' + esc(s.ip) + '</td>';
                    html += '<td>' + s.port + '</td>';
                    html += '<td>' + esc(s.protocol) + '</td>';
                    html += '<td>' + (esc(s.service) || '-') + '</td>';
                    html += '<td>' + stateBadge(s.state) + '</td>';
                    html += '<td title="' + esc(s.extra_info || '') + '">' + (esc(s.extra_info) || '-') + '</td>';
                    html += '<td><span class="nse-id" style="font-family:var(--font-mono);color:var(--cyan);font-size:0.85rem;">' + esc(s.script_id) + '</span></td>';
                    html += '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><pre style="margin:0;font-size:0.75rem;color:var(--text-muted);">' + esc(s.output).substring(0, 80) + (s.output.length > 80 ? '...' : '') + '</pre></td>';
                    html += '<td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();showScriptModalFromData(\'' + esc(s.script_id) + '\',\'' + esc(s.ip) + '\',' + s.port + ')" title="View output"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
                    html += ' <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();goToConsolidatedPort(\'' + esc(s.ip) + '\',' + s.port + ')" title="View in Assets"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></td>';
                    html += '</tr>';
                    html += '<tr class="script-expand-row" style="display:none;" data-key="' + key + '"><td colspan="10"><div style="padding:8px;"><pre style="white-space:pre-wrap;font-size:0.75rem;background:var(--bg-input);padding:8px;border-radius:4px;margin:0;max-height:300px;overflow-y:auto;">' + esc(s.output) + '</pre></div></td></tr>';
                }
                html += '</tbody>';
            }
            html += '</table>';
            container.innerHTML = html;
        }

        function toggleScriptGroupBody(header) {
            const tbody = header.closest('tbody');
            if (!tbody) return;
            const dataRows = tbody.querySelectorAll('.script-group-row');
            if (dataRows.length === 0) return;
            const isHidden = dataRows[0].style.display === 'none';
            dataRows.forEach(r => r.style.display = isHidden ? '' : 'none');
            if (!isHidden) {
                tbody.querySelectorAll('.script-expand-row').forEach(r => r.style.display = 'none');
            }
            header.querySelector('.group-toggle-icon').innerHTML = isHidden ? '&#9660;' : '&#9654;';
        }

        function renderScriptPagination() {
            const container = document.getElementById('scripts-pagination');
            if (!container) return;
            if (scriptGroupMode !== 'flat') { container.innerHTML = ''; return; }
            if (scriptsFiltered.length === 0) {
                container.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(scriptsFiltered.length / scriptsPerPage);
            const currentPage = scriptsCurrentPage;
            let html = '<div class="pagination">';
            html += '<span class="pagination-info">Showing ' + ((currentPage - 1) * scriptsPerPage + 1) + '-' + Math.min(currentPage * scriptsPerPage, scriptsFiltered.length) + ' of ' + scriptsFiltered.length + '</span>';
            if (currentPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(' + (currentPage - 1) + ')">&laquo; Prev</button>';
            }
            const maxButtons = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);
            if (startPage > 1) {
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(1)">1</button>';
                if (startPage > 2) html += '<span class="pagination-dots">...</span>';
            }
            for (let i = startPage; i <= endPage; i++) {
                html += '<button class="btn btn-sm ' + (i === currentPage ? 'btn-primary' : 'btn-secondary') + '" onclick="scriptsGoTo(' + i + ')">' + i + '</button>';
            }
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += '<span class="pagination-dots">...</span>';
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(' + totalPages + ')">' + totalPages + '</button>';
            }
            if (currentPage < totalPages) {
                html += '<button class="btn btn-secondary btn-sm" onclick="scriptsGoTo(' + (currentPage + 1) + ')">Next &raquo;</button>';
            }
            html += '</div>';
            container.innerHTML = html;
        }

        function scriptsGoTo(page) {
            scriptsCurrentPage = page;
            renderScriptsPage();
            renderScriptPagination();
        }

        function changeScriptsLimit() {
            const sel = document.getElementById('scripts-limit');
            scriptsPerPage = parseInt(sel?.value || '50');
            scriptsCurrentPage = 1;
            renderScriptsPage();
            renderScriptPagination();
        }

        function getUniqueScriptIDs() {
            const ids = new Set();
            (consolidatedScriptsData.scripts || []).forEach(s => {
                if (s.script_id) ids.add(s.script_id);
            });
            return Array.from(ids).sort();
        }

        function populateScriptFilter() {
            const sel = document.getElementById('script-filter');
            const current = sel.value;
            sel.innerHTML = '<option value="">All Scripts</option>';
            getUniqueScriptIDs().forEach(s => {
                sel.innerHTML += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
            });
            if (current) sel.value = current;
        }

        function populateScriptServiceFilter() {
            const sel = document.getElementById('script-filter-service');
            const current = sel.value;
            const svcs = new Set();
            (consolidatedScriptsData.scripts || []).forEach(s => {
                if (s.service) svcs.add(s.service);
            });
            sel.innerHTML = '<option value="">Service</option>';
            Array.from(svcs).sort().forEach(s => {
                sel.innerHTML += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
            });
            if (current) sel.value = current;
        }

        function showScriptModal(scriptId, ip, port, output) {
            if (!output) {
                const scripts = getPortNSEScripts(ip, port, 'tcp');
                const found = scripts.find(s => s.script_id === scriptId);
                output = found ? found.output : 'No output available';
            }
            var title = scriptId + ' - ' + ip + (port ? ':' + port : '');
            var body = '<div class="script-modal-output"><pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:0.8rem;background:var(--bg-input);padding:16px;border-radius:var(--radius-card);max-height:60vh;overflow-y:auto;margin:0;">' + esc(output) + '</pre></div>';
            showModal('script-modal', title, body, 'modal-large');
        }

        function showScriptModalFromData(scriptId, ip, port) {
            const found = (consolidatedScriptsData.scripts || []).find(s => s.script_id === scriptId && s.ip === ip && s.port === port);
            const output = found ? found.output : 'No output available';
            showScriptModal(scriptId, ip, port, output);
        }

        function closeScriptModal() { closeModal('script-modal'); }

        function toggleScriptExportDropdown(e) {
            e.stopPropagation();
            const dd = document.getElementById('script-export-dropdown');
            if (!dd) return;
            const isOpen = dd.style.display !== 'none';
            dd.style.display = isOpen ? 'none' : '';
            if (!isOpen) {
                setTimeout(() => document.addEventListener('click', closeScriptExportDropdown, { once: true }), 0);
            }
        }
        function closeScriptExportDropdown() {
            const dd = document.getElementById('script-export-dropdown');
            if (dd) dd.style.display = 'none';
        }
        function exportScript() {
            var fmt = this.getAttribute('data-format');
            closeScriptExportDropdown();
            if (fmt === 'json') {
                const data = scriptsFiltered.map(s => ({
                    ip: s.ip, port: s.port, protocol: s.protocol,
                    service: s.service, state: s.state,
                    script_id: s.script_id, output: s.output
                }));
                downloadJSON(data, 'scripts-export.json');
            } else {
                const url = `/api/projects/${projectId}/consolidated/export/scripts/${fmt}`;
                window.location.href = url;
            }
            showToast('Exporting scripts (' + fmt + ')');
        }

        function copyScriptIPs() {
            const scripts = consolidatedScriptsData.scripts || [];
            const ips = [...new Set(scripts.map(s => s.ip))];
            if (ips.length === 0) { showToast('No IPs to copy', 'error'); return; }
            const text = ips.join(',');
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('Copied ' + ips.length + ' IPs to clipboard');
            });
        }

        function toggleScriptExpand(btn) {
            const tr = btn.tagName === 'TR' ? btn : btn.closest('tr');
            const expandRow = tr.nextElementSibling;
            if (expandRow && expandRow.classList.contains('script-expand-row')) {
                expandRow.style.display = expandRow.style.display === 'none' ? '' : 'none';
            }
        }

        function downloadJSON(data, filename) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }

        async function openPortHistory(ip, port, protocol) {
            var body = '<div id="port-history-content"><div class="empty-state"><div class="spinner"></div><p>Loading history...</p></div></div>';
            showModal('port-history-modal', ip + ':' + port + '/' + protocol + ' - History', body, 'modal-large');
            var content = document.getElementById('port-history-content');

            let currentPort = (consolidatedPortsData.ports || []).find(p => p.ip === ip && p.port === port && p.protocol === protocol);
            if (!currentPort) {
                currentPort = { state: 'unknown', service: '', version: '', product: '', extra_info: '', os: '', hostname: '', mac: '' };
            }

            try {
                const [scanRes, editRes] = await Promise.all([
                    fetch(`/api/projects/${projectId}/consolidated/ports/history?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`),
                    fetch(`/api/projects/${projectId}/consolidated/ports/edits?ip=${encodeURIComponent(ip)}&port=${port}&protocol=${encodeURIComponent(protocol)}`)
                ]);
                const scanHistory = await scanRes.json();
                let edits = [];
                try { edits = await editRes.json(); } catch (e2) {}

                function fmt(d) { return new Date(d).toLocaleString(); }

                let html = '<div class="ph">';

                // current state
                html += '<div class="ph-current">';
                html += '<div class="ph-current-body">';
                html += stateBadge(esc(currentPort.state));
                if (currentPort.service) html += '<span class="ph-tag">' + esc(currentPort.service) + '</span>';
                if (currentPort.version) html += '<span class="ph-tag">' + esc(currentPort.version) + '</span>';
                if (currentPort.product) html += '<span class="ph-tag">' + esc(currentPort.product) + '</span>';
                if (currentPort.extra_info) html += '<span class="ph-tag">' + esc(currentPort.extra_info) + '</span>';
                html += '</div></div>';

                let hasAny = false;

                // scans
                if (scanHistory && scanHistory.length > 0) {
                    hasAny = true;
                    html += '<div class="ph-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Scan History</div>';
                    for (let i = 0; i < scanHistory.length; i++) {
                        const h = scanHistory[i];
                        const isCurrent = i === 0;
                        html += '<div class="ph-row' + (isCurrent ? ' ph-row-current' : '') + '">';
                        html += '<div class="ph-row-main">';
                        html += '<div class="ph-row-top">';
                        html += '<a href="/project/' + projectId + '/scan/' + h.scan_id + '" class="ph-link">#' + h.scan_id + '</a>';
                        html += '<span class="ph-profile">' + esc(h.profile) + '</span>';
                        if (isCurrent) html += '<span class="ph-cur-tag">Current</span>';
                        html += '<span class="ph-date">' + fmt(h.started_at) + '</span>';
                        html += '</div>';
                        html += '<div class="ph-row-mid">';
                        html += stateBadge(esc(h.state));
                        if (h.service) html += '<span class="ph-val">' + esc(h.service) + '</span>';
                        if (h.version) html += '<span class="ph-val ph-val-muted">' + esc(h.version) + '</span>';
                        if (h.product) html += '<span class="ph-val ph-val-muted">' + esc(h.product) + '</span>';
                        html += '</div></div>';
                        if (!isCurrent) {
                            html += '<button class="btn btn-secondary btn-sm" onclick="revertPort(\'' + esc(ip) + '\',' + port + ',\'' + esc(protocol) + '\',\'' + esc(h.state) + '\',\'' + esc(h.service || '') + '\',\'' + esc(h.version || '') + '\',\'' + esc(h.product || '') + '\',\'' + esc(h.extra_info || '') + '\', ' + h.scan_id + ')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Restore</button>';
                        }
                        html += '</div>';
                    }
                }

                // edits
                if (edits && edits.length > 0) {
                    hasAny = true;
                    html += '<div class="ph-title" style="margin-top:24px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Manual Edits</div>';
                    for (const e of edits) {
                        const isApplied = e.applied !== 0;
                        html += '<div class="ph-row' + (isApplied ? '' : ' ph-row-reverted') + '">';
                        html += '<div class="ph-row-main">';
                        html += '<div class="ph-row-top">';
                        html += '<span class="ph-edit-tag' + (isApplied ? '' : ' ph-edit-tag-reverted') + '">' + (isApplied ? 'Edit' : 'Reverted') + '</span>';
                        html += '<span class="ph-field">' + esc(e.field) + '</span>';
                        html += '<span class="ph-date">' + fmt(e.edited_at) + '</span>';
                        html += '</div>';
                        const oldV = esc(e.old_value) || '<span class="ph-empty">empty</span>';
                        const newV = esc(e.new_value) || '<span class="ph-empty">empty</span>';
                        html += '<div class="ph-row-mid" style="gap:0;font-size:0.85rem;color:var(--text);">';
                        html += '<span style="color:var(--text-muted);">' + oldV + '</span>';
                        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 6px;flex-shrink:0;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
                        html += '<span style="color:var(--text);font-weight:500;">' + newV + '</span>';
                        html += '</div></div>';
                        if (isApplied) {
                            html += '<button class="btn btn-secondary btn-sm" onclick="revertEdit(' + e.edit_id + ',\'' + esc(ip) + '\',' + port + ',\'' + esc(protocol) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Revert</button>';
                        } else {
                            html += '<button class="btn btn-secondary btn-sm" onclick="applyEdit(' + e.edit_id + ',\'' + esc(ip) + '\',' + port + ',\'' + esc(protocol) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Re-apply</button>';
                        }
                        html += '</div>';
                    }
                }

                if (!hasAny) html += '<div class="empty-state" style="margin-top:20px;"><p>No history found for this port</p></div>';
                html += '</div>';
                content.innerHTML = html;
            } catch (e) {
                content.innerHTML = '<div class="empty-state"><p>Error loading history: ' + esc(e.message) + '</p></div>';
            }
        }

        async function revertPort(ip, port, protocol, state, service, version, product, extraInfo, scanId) {
            if (!confirm('Use state from scan #' + scanId + ' for ' + ip + ':' + port + '?\n\nOnly this port in the consolidated table will change. Original scan data is not modified.\n\nNew state: ' + state + (service ? ', service: ' + service : ''))) return;
            try {
                await fetch(`/api/projects/${projectId}/consolidated/ports/revert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, port, protocol, state, service, version, product, extra_info: extraInfo })
                });
                showToast('Port reverted to scan #' + scanId + ' state');
                await loadConsolidated(1);
                openPortHistory(ip, port, protocol);
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        let currentConsolidatedPort = null;

        function closePortHistoryModal() { closeModal('port-history-modal'); }

        async function openHostPorts(ip) {
            var body = '<div id="host-ports-content" class="table-container"><div class="empty-state"><div class="spinner"></div><p>Loading ports...</p></div></div>';
            showModal('host-ports-modal', ip + ' - Open Ports', body, 'modal-large');
            var content = document.getElementById('host-ports-content');

            try {
                const res = await fetch(`/api/projects/${projectId}/consolidated/ports`);
                const data = await res.json();
                const ports = Array.isArray(data) ? data : (data.ports || []);
                const hostPorts = ports.filter(p => p.ip === ip);

                if (!hostPorts || hostPorts.length === 0) {
                    content.innerHTML = '<div class="empty-state"><h3>No ports found</h3><p>No consolidated port data for this host</p></div>';
                    return;
                }

                let html = '<table><thead><tr>';
                html += '<th>Port</th><th>Protocol</th><th>State</th><th>Service</th><th>Version</th><th>Product</th><th>Changes</th><th>Last Seen</th><th></th>';
                html += '</tr></thead><tbody>';
                for (const p of hostPorts) {
                    const histBtn = '<button class="btn btn-secondary btn-sm btn-history" onclick="event.stopPropagation();closeHostPortsModal();openPortHistory(\'' + esc(p.ip) + '\',' + p.port + ',\'' + esc(p.protocol) + '\')" title="View scan history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>';
                    html += '<tr>';
                    html += '<td class="mono">' + p.port + '</td>';
                    html += '<td>' + esc(p.protocol) + '</td>';
                    html += '<td>' + stateBadge(p.state) + '</td>';
                    html += '<td>' + (esc(p.service) || '-') + '</td>';
                    html += '<td>' + (esc(p.version) || '-') + '</td>';
                    html += '<td>' + (esc(p.product) || '-') + '</td>';
                    html += '<td>' + p.change_count + '</td>';
                    html += '<td>' + formatDate(p.last_seen) + '</td>';
                    html += '<td>' + histBtn + '</td>';
                    html += '</tr>';
                }
                html += '</tbody></table>';
                content.innerHTML = html;
            } catch (e) {
                content.innerHTML = '<div class="empty-state"><p>Error loading ports: ' + esc(e.message) + '</p></div>';
            }
        }

        function closeHostPortsModal() { closeModal('host-ports-modal'); }
