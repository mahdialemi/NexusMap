        let selectedProfile = 'default';
        let selectedProfileId = null;
        let profileManagerData = [];
        let pfNseScripts = [];

        function selectProfile(el) {
            document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            selectedProfile = el.dataset.profile;
            selectedProfileId = parseInt(el.dataset.id);
            updateCmdPreview(el.dataset.cmd || '');
            document.getElementById('cmd-source').textContent = t('profiles.source_profile');
            showProfileInfo(el.dataset.profile, el.dataset.desc, parseInt(el.dataset.id));
        }

        function showProfileInfo(name, desc, id) {
            const info = document.getElementById('profile-info');
            if (!name) { info.style.display = 'none'; return; }
            document.getElementById('profile-info-name').textContent = name;
            document.getElementById('profile-info-desc').textContent = desc || t('profiles.nmap_command_profile');
            document.getElementById('profile-info-edit-btn').onclick = function() {
                showProfileManager(id);
            };
            info.style.display = '';
        }

        function getQuickFlags() {
            const flags = [];
            document.querySelectorAll('.qf-checkbox:checked').forEach(el => {
                flags.push(el.dataset.flag);
            });
            return flags.join(' ');
        }

        function updateQuickFlags() {
            document.querySelectorAll('.qf-checkbox').forEach(el => {
                el.closest('.qf-checkbox-label').classList.toggle('active', el.checked);
            });
            const cmdText = document.getElementById('cmd-text');
            let base = cmdText.dataset.baseCmd || cmdText.textContent;
            const qf = getQuickFlags();
            if (qf) {
                cmdText.textContent = base;
                cmdText.textContent = base + ' ' + qf;
            } else {
                cmdText.textContent = base;
            }
        }

        function updateCmdPreview(profileCmd) {
            const cmdText = document.getElementById('cmd-text');
            if (profileCmd) {
                cmdText.textContent = profileCmd;
            } else {
                cmdText.textContent = 'nmap -sS -sV -T4 --top-ports 1000 <TARGET>';
            }
            cmdText.dataset.baseCmd = cmdText.textContent;
            updateQuickFlags();
        }

        function filterProfiles() {
            const query = document.getElementById('profile-search').value.toLowerCase();
            document.querySelectorAll('.profile-card').forEach(card => {
                const name = card.querySelector('h4').textContent.toLowerCase();
                const desc = card.querySelector('p').textContent.toLowerCase();
                const match = name.includes(query) || desc.includes(query);
                card.style.display = match ? '' : 'none';
            });
            document.querySelectorAll('.profile-section').forEach(section => {
                const visibleCards = section.querySelectorAll('.profile-card[style=""], .profile-card:not([style])');
                const hasVisible = Array.from(visibleCards).some(c => c.style.display !== 'none');
                section.style.display = hasVisible ? '' : 'none';
            });
        }

        function toggleProfileSection(header) {
            const content = header.nextElementSibling;
            const arrow = header.querySelector('.profile-section-arrow');
            if (content.classList.contains('collapsed')) {
                document.querySelectorAll('.profile-section-content').forEach(c => c.classList.add('collapsed'));
                document.querySelectorAll('.profile-section-arrow').forEach(a => a.classList.remove('rotated'));
                content.classList.remove('collapsed');
                arrow.classList.add('rotated');
            } else {
                content.classList.add('collapsed');
                arrow.classList.remove('rotated');
            }
        }

        async function loadScanProfiles() {
            try {
                const res = await fetch('/api/scan/profiles');
                if (!res.ok) throw new Error('Failed to load');
                const data = await res.json();
                const container = document.getElementById('profiles-container');
                const profiles = data.profiles || [];
                const categories = {};
                profiles.forEach(p => {
                    if (!categories[p.category]) categories[p.category] = [];
                    categories[p.category].push(p);
                });
                let html = '';
                const catOrder = ['Network Discovery', 'Port Scanning', 'UDP Scanning', 'IDS/IPS Evasion', 'Common'];
                const sortedCats = Object.keys(categories).sort((a, b) => {
                    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
                    if (ai === -1 && bi === -1) return a.localeCompare(b);
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                });
                let firstCard = null;
                sortedCats.forEach((cat, catIdx) => {
                    const profs = categories[cat];
                    html += '<div class="profile-section">';
                    html += '<div class="profile-section-header" onclick="toggleProfileSection(this)">';
                    html += '<span class="profile-section-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>';
                    html += '<span>' + esc(cat) + '</span>';
                    html += '<span class="profile-section-count">' + profs.length + '</span>';
                    html += '</div>';
                    html += '<div class="profile-section-content collapsed">';
                    profs.forEach(p => {
                        html += '<div class="profile-card" data-id="' + p.id + '" data-profile="' + esc(p.name) + '" data-desc="' + esc(p.description) + '" data-cmd="' + esc(p.command) + '" onclick="selectProfile(this)">';
                        html += '<h4>' + esc(p.name) + '</h4>';
                        html += '<p>' + esc(p.description) + '</p>';
                        html += '</div>';
                        if (!firstCard) firstCard = p;
                    });
                    html += '</div></div>';
                });
                container.innerHTML = html;

                if (firstCard) {
                    selectedProfile = firstCard.name;
                    selectedProfileId = firstCard.id;
                    updateCmdPreview(firstCard.command);
                    document.getElementById('cmd-source').textContent = t('profiles.source_profile');
                    showProfileInfo(firstCard.name, firstCard.description, firstCard.id);
                    const firstEl = container.querySelector('.profile-card');
                    if (firstEl) firstEl.classList.add('selected');
                }
            } catch (e) {
                document.getElementById('profiles-container').innerHTML = '<div class="empty-state"><p style="color:var(--red);">' + t('profiles.failed_to_load') + '</p></div>';
            }
        }

        async function loadImportProfiles() {
            try {
                const res = await fetch('/api/scan/profiles');
                if (!res.ok) return;
                const data = await res.json();
                const sel = document.getElementById('import-profile');
                sel.innerHTML = '';
                const def = document.createElement('option');
                def.value = 'imported';
                def.textContent = t('profiles.imported');
                def.selected = true;
                sel.appendChild(def);
                (data.profiles || []).forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    sel.appendChild(opt);
                });
            } catch (e) {
                console.error('Failed to load profiles:', e);
            }
        }

        async function showProfileManager(editId) {
            document.getElementById('profile-manager-modal').style.display = 'flex';
            resetProfileForm();
            await loadProfileManagerList();
            if (editId && typeof editId === 'number') selectProfileToEdit(editId);
        }

        function closeProfileManager() {
            document.getElementById('profile-manager-modal').style.display = 'none';
            loadScanProfiles();
        }

        async function loadProfileManagerList() {
            try {
                const res = await fetch('/api/scan/profiles');
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                profileManagerData = data.profiles || [];
                const list = document.getElementById('profile-manager-list');
                const categories = {};
                profileManagerData.forEach(p => {
                    if (!categories[p.category]) categories[p.category] = [];
                    categories[p.category].push(p);
                });
                const cats = Object.keys(categories).sort((a, b) => {
                    const order = ['Network Discovery', 'Port Scanning', 'UDP Scanning', 'IDS/IPS Evasion', 'Common'];
                    const ai = order.indexOf(a), bi = order.indexOf(b);
                    if (ai === -1 && bi === -1) return a.localeCompare(b);
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                });
                let html = '<div style="padding:12px;border-bottom:1px solid var(--border);">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
                html += '<span style="font-size:0.85rem;color:var(--text-muted);">' + t('profiles.profiles_count').replace('{count}', profileManagerData.length) + '</span>';
                html += '<button class="btn btn-primary btn-sm" onclick="newProfile()">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
                html += ' ' + t('profiles.new') + '</button></div></div>';
                html += '<div style="overflow-y:auto;flex:1;min-height:0;padding:8px;">';
                cats.forEach(cat => {
                    html += '<div style="margin-bottom:12px;">';
                    html += '<div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;padding:6px 8px 4px;">' + esc(cat) + ' (' + categories[cat].length + ')</div>';
                    categories[cat].forEach(p => {
                        html += '<div class="profile-list-item" onclick="selectProfileToEdit(' + p.id + ')" data-id="' + p.id + '" style="display:block;padding:8px 10px;border-radius:var(--radius-input);cursor:pointer;transition:background 0.15s;margin-bottom:2px;">';
                        html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
                        html += '<div style="font-size:0.85rem;font-weight:500;display:flex;align-items:center;gap:6px;">' + esc(p.name);
                        if (p.is_builtin) html += '<span class="badge badge-filtered" style="font-size:0.6rem;padding:1px 5px;">' + t('profiles.built_in') + '</span>';
                        html += '</div>';
                        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><polyline points="9 18 15 12 9 6"/></svg>';
                        html += '</div>';
                        html += '<div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(p.command) + '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                });
                html += '</div>';
                list.innerHTML = html;
            } catch (e) {
                document.getElementById('profile-manager-list').innerHTML = '<p style="color:var(--red);padding:20px;">' + t('profiles.failed_to_load_list') + '</p>';
            }
        }

        function togglePfSection() {
            var header = this;
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.pf-arrow');
            const opening = body.classList.contains('collapsed');
            if (opening) {
                document.querySelectorAll('#profile-form-panel .pf-section-body').forEach(b => {
                    b.classList.add('collapsed');
                    const h = b.previousElementSibling;
                    if (h && h.classList.contains('pf-section-header')) {
                        const a = h.querySelector('.pf-arrow');
                        if (a) a.classList.remove('open');
                    }
                });
            }
            body.classList.toggle('collapsed');
            arrow.classList.toggle('open');
        }

        function onPfChange() {
            const cmd = buildProfileCommand();
            document.getElementById('pf-cmd-preview').textContent = cmd;
            document.getElementById('profile-form-cmd-hidden').value = cmd;
        }

        function buildProfileCommand() {
            const parts = [];

            const extra = document.getElementById('pf-extra').value.trim();

            if (extra.startsWith('sudo ')) {
                parts.push('sudo');
                parts.push('nmap');
                const rest = extra.substring(5).trim();
                if (rest) parts.push(rest);
            } else {
                parts.push('nmap');
                if (extra) parts.push(extra);
            }

            const tcp = document.getElementById('pf-tcp-scan').value;
            if (tcp) parts.push(tcp);

            const nonTcp = document.getElementById('pf-non-tcp').value;
            if (nonTcp) parts.push(nonTcp);

            const timing = document.getElementById('pf-timing').value;
            if (timing) parts.push(timing);

            if (document.getElementById('pf-A').checked) parts.push('-A');
            if (document.getElementById('pf-O').checked) parts.push('-O');
            if (document.getElementById('pf-sV').checked) parts.push('-sV');
            if (document.getElementById('pf-n').checked) parts.push('-n');
            if (document.getElementById('pf-6').checked) parts.push('-6');

            if (document.getElementById('pf-enable-sl').checked) {
                const ip = document.getElementById('pf-sl-ip').value.trim();
                if (ip) parts.push('-sI ' + ip);
                else parts.push('-sI');
            }

            if (document.getElementById('pf-enable-b').checked) {
                const ip = document.getElementById('pf-b-ip').value.trim();
                if (ip) parts.push('-b ' + ip);
                else parts.push('-b');
            }

            if (document.getElementById('pf-Pn').checked) parts.push('-Pn');
            if (document.getElementById('pf-PE').checked) parts.push('-PE');
            if (document.getElementById('pf-PP').checked) parts.push('-PP');
            if (document.getElementById('pf-PM').checked) parts.push('-PM');

            ['PA', 'PS', 'PU', 'PO', 'PY'].forEach(p => {
                if (document.getElementById('pf-enable-' + p).checked) {
                    const ports = document.getElementById('pf-' + p + '-ports').value.trim();
                    if (ports) parts.push('-P' + p + ' ' + ports);
                    else parts.push('-P' + p);
                }
            });

            const exclude = document.getElementById('pf-exclude').value.trim();
            if (exclude) parts.push('--exclude ' + exclude);

            const excludefile = document.getElementById('pf-excludefile').value.trim();
            if (excludefile) parts.push('--excludefile ' + excludefile);

            const iL = document.getElementById('pf-iL').value.trim();
            if (iL) parts.push('-iL ' + iL);

            const iR = document.getElementById('pf-iR').value.trim();
            if (iR) parts.push('-iR ' + iR);

            const p = document.getElementById('pf-p').value.trim();
            if (p) parts.push('-p ' + p);

            if (document.getElementById('pf-F').checked) parts.push('-F');

            const D = document.getElementById('pf-D').value.trim();
            if (D) parts.push('-D ' + D);

            const S = document.getElementById('pf-S').value.trim();
            if (S) parts.push('-S ' + S);

            const srcPort = document.getElementById('pf-source-port').value.trim();
            if (srcPort) parts.push('--source-port ' + srcPort);

            const e = document.getElementById('pf-e').value.trim();
            if (e) parts.push('-e ' + e);

            const ttl = document.getElementById('pf-ttl').value.trim();
            if (ttl) parts.push('--ttl ' + ttl);

            if (document.getElementById('pf-f').checked) parts.push('-f');
            if (document.getElementById('pf-packet-trace').checked) parts.push('--packet-trace');
            if (document.getElementById('pf-r').checked) parts.push('-r');
            if (document.getElementById('pf-traceroute').checked) parts.push('--traceroute');

            const maxRetries = document.getElementById('pf-max-retries').value.trim();
            if (maxRetries) parts.push('--max-retries ' + maxRetries);

            const hostTimeout = document.getElementById('pf-host-timeout').value.trim();
            if (hostTimeout) parts.push('--host-timeout ' + hostTimeout);

            const maxRtt = document.getElementById('pf-max-rtt-timeout').value.trim();
            if (maxRtt) parts.push('--max-rtt-timeout ' + maxRtt);

            const minRtt = document.getElementById('pf-min-rtt-timeout').value.trim();
            if (minRtt) parts.push('--min-rtt-timeout ' + minRtt);

            const initRtt = document.getElementById('pf-initial-rtt-timeout').value.trim();
            if (initRtt) parts.push('--initial-rtt-timeout ' + initRtt);

            const maxHostgroup = document.getElementById('pf-max-hostgroup').value.trim();
            if (maxHostgroup) parts.push('--max-hostgroup ' + maxHostgroup);

            const minHostgroup = document.getElementById('pf-min-hostgroup').value.trim();
            if (minHostgroup) parts.push('--min-hostgroup ' + minHostgroup);

            const maxPar = document.getElementById('pf-max-parallelism').value.trim();
            if (maxPar) parts.push('--max-parallelism ' + maxPar);

            const minPar = document.getElementById('pf-min-parallelism').value.trim();
            if (minPar) parts.push('--min-parallelism ' + minPar);

            const maxScanDelay = document.getElementById('pf-max-scan-delay').value.trim();
            if (maxScanDelay) parts.push('--max-scan-delay ' + maxScanDelay);

            const scanDelay = document.getElementById('pf-scan-delay').value.trim();
            if (scanDelay) parts.push('--scan-delay ' + scanDelay);

            if (pfNseScripts.length > 0) {
                parts.push('--script ' + pfNseScripts.join(','));
            }

            const nseArgs = document.getElementById('pf-nse-args').value.trim();
            if (nseArgs) {
                const lines = nseArgs.split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length > 0) parts.push('--script-args \'' + lines.join(',') + '\'');
            }

            parts.push('<TARGET>');
            return parts.join(' ');
        }

        function parseProfileCommand(cmd) {
            pfNseScripts = [];

            const s = cmd.replace(/\s+/g, ' ').trim();

            const has = (flag) => s.indexOf(' ' + flag) >= 0 || s.startsWith(flag + ' ') || s === flag;

            const setCheck = (id, flag) => {
                const el = document.getElementById(id);
                if (el) el.checked = has(flag);
            };

            const setSelect = (id, flag) => {
                const el = document.getElementById(id);
                if (el && flag) el.value = flag;
                else if (el) el.value = '';
            };

            const tcpFlags = ['-sA', '-sF', '-sM', '-sN', '-sS', '-sT', '-sW', '-sX'];
            let foundTcp = '';
            tcpFlags.forEach(f => { if (s.indexOf(f) >= 0) foundTcp = f; });
            setSelect('pf-tcp-scan', foundTcp);

            const nonTcpFlags = ['-sU', '-sO', '-sL', '-sn', '-sY', '-sZ'];
            let foundNon = '';
            nonTcpFlags.forEach(f => { if (s.indexOf(f) >= 0) foundNon = f; });
            setSelect('pf-non-tcp', foundNon);

            const timingFlags = ['-T0', '-T1', '-T2', '-T3', '-T4', '-T5'];
            let foundT = '';
            timingFlags.forEach(f => { if (s.indexOf(f) >= 0) foundT = f; });
            setSelect('pf-timing', foundT);

            setCheck('pf-A', '-A');
            setCheck('pf-O', '-O');
            setCheck('pf-sV', '-sV');
            setCheck('pf-n', '-n');
            setCheck('pf-6', '-6');

            const valAfter = (flag) => {
                const idx = s.indexOf(flag);
                if (idx < 0) return '';
                const after = s.substring(idx + flag.length).trim();
                const parts = after.split(' ');
                return parts[0] || '';
            };

            const slIdx = s.indexOf('-sI');
            if (slIdx >= 0) {
                document.getElementById('pf-enable-sl').checked = true;
                const rest = s.substring(slIdx + 3).trim();
                const ip = rest.split(' ')[0];
                if (ip && ip !== '-A' && ip !== '-O' && ip !== '-sV' && !ip.startsWith('-')) {
                    document.getElementById('pf-sl-ip').value = ip;
                }
            }

            const bIdx = s.indexOf('-b ');
            if (bIdx >= 0) {
                document.getElementById('pf-enable-b').checked = true;
                const rest = s.substring(bIdx + 3).trim();
                const ip = rest.split(' ')[0];
                if (ip && !ip.startsWith('-')) {
                    document.getElementById('pf-b-ip').value = ip;
                }
            }

            setCheck('pf-Pn', '-Pn');
            setCheck('pf-PE', '-PE');
            setCheck('pf-PP', '-PP');
            setCheck('pf-PM', '-PM');

            ['PA', 'PS', 'PU', 'PO', 'PY'].forEach(p => {
                const flag = '-P' + p;
                const idx = s.indexOf(flag);
                if (idx >= 0) {
                    document.getElementById('pf-enable-' + p).checked = true;
                    const rest = s.substring(idx + flag.length).trim();
                    const val = rest.split(' ')[0];
                    if (val && !val.startsWith('-')) {
                        document.getElementById('pf-' + p + '-ports').value = val;
                    }
                }
            });

            const extractVal = (flag) => {
                const idx = s.indexOf(flag);
                if (idx < 0) return '';
                const rest = s.substring(idx + flag.length).trim();
                const parts = rest.split(' ');
                const v = [];
                for (const p of parts) {
                    if (p.startsWith('-') || p === '<TARGET>') break;
                    if (p) v.push(p);
                }
                return v.join(' ');
            };

            const setVal = (id, flag) => {
                const el = document.getElementById(id);
                if (el) el.value = extractVal(flag);
            };

            setVal('pf-exclude', '--exclude');
            setVal('pf-excludefile', '--excludefile');
            setVal('pf-iL', '-iL');
            setVal('pf-iR', '-iR');
            setVal('pf-p', '-p');
            setCheck('pf-F', '-F');

            setVal('pf-D', '-D');
            setVal('pf-S', '-S');
            setVal('pf-source-port', '--source-port');
            setVal('pf-e', '-e');

            setVal('pf-ttl', '--ttl');
            setVal('pf-max-retries', '--max-retries');
            setCheck('pf-f', '-f');
            setCheck('pf-packet-trace', '--packet-trace');
            setCheck('pf-r', '-r');
            setCheck('pf-traceroute', '--traceroute');

            setVal('pf-host-timeout', '--host-timeout');
            setVal('pf-max-rtt-timeout', '--max-rtt-timeout');
            setVal('pf-min-rtt-timeout', '--min-rtt-timeout');
            setVal('pf-initial-rtt-timeout', '--initial-rtt-timeout');
            setVal('pf-max-hostgroup', '--max-hostgroup');
            setVal('pf-min-hostgroup', '--min-hostgroup');
            setVal('pf-max-parallelism', '--max-parallelism');
            setVal('pf-min-parallelism', '--min-parallelism');
            setVal('pf-max-scan-delay', '--max-scan-delay');
            setVal('pf-scan-delay', '--scan-delay');

            const scriptIdx = s.indexOf('--script ');
            if (scriptIdx >= 0) {
                const rest = s.substring(scriptIdx + 9).trim();
                const scEnd = rest.indexOf(' ');
                const scStr = scEnd >= 0 ? rest.substring(0, scEnd) : rest;
                pfNseScripts = scStr.split(',').filter(Boolean);
                renderPfNseChips();
            }

            const argsIdx = s.indexOf('--script-args ');
            if (argsIdx >= 0) {
                let rest = s.substring(argsIdx + 13).trim();
                if (rest.startsWith("'") || rest.startsWith('"')) {
                    const quote = rest[0];
                    rest = rest.substring(1);
                    const end = rest.indexOf(quote);
                    if (end >= 0) rest = rest.substring(0, end);
                }
                const argsEl = document.getElementById('pf-nse-args');
                if (argsEl) argsEl.value = rest.replace(/,/g, '\n');
            }

            const known = new Set([
                '-A','-O','-sV','-n','-6','-f','--packet-trace','-r','--traceroute',
                '-Pn','-PE','-PP','-PM','-F',
                '-sA','-sF','-sM','-sN','-sS','-sT','-sW','-sX',
                '-sU','-sO','-sL','-sn','-sY','-sZ',
                '-T0','-T1','-T2','-T3','-T4','-T5',
                '-sI','-b',
                '-PA','-PS','-PU','-PO','-PY',
                '--exclude','--excludefile','-iL','-iR','-p',
                '-D','-S','--source-port','-e',
                '--ttl','--max-retries',
                '--host-timeout','--max-rtt-timeout','--min-rtt-timeout','--initial-rtt-timeout',
                '--max-hostgroup','--min-hostgroup','--max-parallelism','--min-parallelism',
                '--max-scan-delay','--scan-delay',
                '--script','--script-args'
            ]);
            const withArg = new Set([
                '-sI','-b',
                '-PA','-PS','-PU','-PO','-PY',
                '--exclude','--excludefile','-iL','-iR','-p',
                '-D','-S','--source-port','-e',
                '--ttl','--max-retries',
                '--host-timeout','--max-rtt-timeout','--min-rtt-timeout','--initial-rtt-timeout',
                '--max-hostgroup','--min-hostgroup','--max-parallelism','--min-parallelism',
                '--max-scan-delay','--scan-delay',
                '--script','--script-args'
            ]);
            const tokens = s.split(/\s+/);
            const extraParts = [];
            let i = 0;
            while (i < tokens.length) {
                const t = tokens[i];
                if (t === 'nmap' || t === '<TARGET>' || t === 'sudo') { i++; continue; }
                if (known.has(t)) { i++; if (withArg.has(t)) i++; continue; }
                extraParts.push(t);
                i++;
            }
            const sudoPrefix = tokens[0] === 'sudo' ? 'sudo ' : '';
            document.getElementById('pf-extra').value = sudoPrefix + extraParts.join(' ');
        }

        function newProfile() {
            document.getElementById('profile-form-title').textContent = t('profiles.new_profile');
            document.getElementById('profile-edit-id').value = '';
            document.getElementById('profile-form-name').value = '';
            document.getElementById('profile-form-desc').value = '';
            document.getElementById('profile-form-cat').value = 'Custom';
            document.getElementById('profile-save-btn').textContent = t('profiles.create');
            document.getElementById('profile-delete-area').style.display = 'none';
            document.querySelectorAll('.profile-list-item').forEach(el => el.style.background = '');

            document.getElementById('pf-cmd-preview').textContent = 'nmap <TARGET>';
            document.getElementById('profile-form-cmd-hidden').value = '';
            pfNseScripts = [];
            renderPfNseChips();

            ['pf-tcp-scan', 'pf-non-tcp', 'pf-timing'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

            document.querySelectorAll('#profile-form-panel .pf-checkbox').forEach(el => el.checked = false);
            document.querySelectorAll('#profile-form-panel .pf-input').forEach(el => {
                if (el.type !== 'hidden') el.value = '';
            });
            document.getElementById('pf-nse-args').value = '';
            document.getElementById('pf-nse-results').innerHTML = '';
            document.getElementById('pf-nse-search').value = '';

            document.getElementById('profile-form-name').focus();
        }

        function resetProfileForm() {
            newProfile();
        }

        function selectProfileToEdit(id) {
            const p = profileManagerData.find(x => x.id === id);
            if (!p) return;
            document.querySelectorAll('.profile-list-item').forEach(el => el.style.background = '');
            const el = document.querySelector('.profile-list-item[data-id="' + p.id + '"]');
            if (el) el.style.background = 'var(--bg-input)';
            document.getElementById('profile-form-title').textContent = p.name;
            document.getElementById('profile-edit-id').value = p.id;
            document.getElementById('profile-form-name').value = p.name;
            document.getElementById('profile-form-desc').value = p.description || '';
            const catSelect = document.getElementById('profile-form-cat');
            let found = false;
            for (let i = 0; i < catSelect.options.length; i++) {
                if (catSelect.options[i].value === p.category) { catSelect.selectedIndex = i; found = true; break; }
            }
            if (!found) {
                catSelect.options[catSelect.options.length] = new Option(p.category, p.category);
                catSelect.value = p.category;
            }
            document.getElementById('profile-save-btn').textContent = t('profiles.update');
            document.getElementById('profile-delete-area').style.display = '';

            parseProfileCommand(p.command);
            onPfChange();
        }

        function searchProfileNse() {
            clearTimeout(window.pfNseTimeout);
            const q = document.getElementById('pf-nse-search').value.trim();
            if (!q) { document.getElementById('pf-nse-results').innerHTML = ''; return; }
            window.pfNseTimeout = setTimeout(async () => {
                try {
                    const res = await fetch('/api/scan/nse?q=' + encodeURIComponent(q));
                    if (!res.ok) return;
                    const data = await res.json();
                    const container = document.getElementById('pf-nse-results');
                    if (!data.scripts || data.scripts.length === 0) {
                        container.innerHTML = '<div style="padding:6px;color:var(--text-muted);font-size:0.75rem;">' + t('profiles.no_scripts') + '</div>';
                        return;
                    }
                    container.innerHTML = data.scripts.map(s =>
                        '<div style="display:flex;justify-content:space-between;padding:4px 8px;cursor:pointer;border-radius:4px;font-size:0.78rem;" ' +
                        'onmouseover="this.style.background=\'var(--bg-input)\'" onmouseout="this.style.background=\'\'" ' +
                        'onclick="insertProfileNse(\'' + esc(s.name) + '\')">' +
                        '<span style="font-family:var(--font-mono);">' + esc(s.name) + '</span>' +
                        '<span style="color:var(--text-muted);font-size:0.7rem;">' + esc(s.size||'') + '</span></div>'
                    ).join('');
                } catch (e) {}
            }, 300);
        }

        function insertProfileNse(name) {
            if (pfNseScripts.includes(name)) return;
            pfNseScripts.push(name);
            renderPfNseChips();
            document.getElementById('pf-nse-search').value = '';
            document.getElementById('pf-nse-results').innerHTML = '';
            onPfChange();
        }

        function removeProfileNse(name) {
            pfNseScripts = pfNseScripts.filter(s => s !== name);
            renderPfNseChips();
            onPfChange();
        }

        function renderPfNseChips() {
            const container = document.getElementById('pf-nse-chips');
            if (!container) return;
            if (pfNseScripts.length === 0) {
                container.innerHTML = '';
                return;
            }
            container.innerHTML = pfNseScripts.map(s =>
                '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;font-size:0.72rem;background:rgba(59,130,246,0.15);color:var(--accent);border-radius:10px;border:1px solid rgba(59,130,246,0.3);">' +
                esc(s) +
                '<span onclick="removeProfileNse(\'' + esc(s) + '\')" style="cursor:pointer;opacity:0.6;font-size:0.85rem;line-height:1;">&times;</span></span>'
            ).join('');
        }

        async function saveProfile() {
            onPfChange();
            const id = document.getElementById('profile-edit-id').value;
            const name = document.getElementById('profile-form-name').value.trim();
            const desc = document.getElementById('profile-form-desc').value.trim();
            const cmd = document.getElementById('profile-form-cmd-hidden').value.trim();
            const cat = document.getElementById('profile-form-cat').value.trim();
            if (!name || !cmd || !cat) { showToast(t('profiles.name_cmd_cat_required'), 'error'); return; }
            try {
                const method = id ? 'PUT' : 'POST';
                const body = JSON.stringify({ id: id ? parseInt(id) : 0, name, description: desc, command: cmd, category: cat });
                const res = await fetch('/api/scan/profiles', { method, headers: { 'Content-Type': 'application/json' }, body });
                if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
                showToast(id ? t('profiles.profile_updated') : t('profiles.profile_created'));
                resetProfileForm();
                await loadProfileManagerList();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function deleteProfileFromForm() {
            const id = parseInt(document.getElementById('profile-edit-id').value);
            if (!id) return;
            const p = profileManagerData.find(x => x.id === id);
            if (!p) return;
            if (!confirm(t('profiles.confirm_delete').replace('{name}', p.name))) return;
            try {
                const res = await fetch('/api/scan/profiles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
                showToast(t('profiles.profile_deleted'));
                resetProfileForm();
                await loadProfileManagerList();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function loadImportMergeScans() {
            const sel = document.getElementById('import-merge-scan');
            if (!sel) return;
            try {
                const res = await fetch(`/api/projects/${projectId}/scans`);
                const scans = await res.json();
                sel.innerHTML = '<option value="">' + t('profiles.create_new_scan') + '</option>';
                (scans || []).forEach(s => {
                    if (s.status === 'completed') {
                        const label = esc(s.target || '#') + ' (' + esc(s.profile) + ' - ' + new Date(s.created_at).toLocaleDateString() + ')';
                        sel.innerHTML += `<option value="${s.id}">${label}</option>`;
                    }
                });
            } catch (e) {}
        }
