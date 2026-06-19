var savedTimeout = null;
var _settingsLangChanging = false;

function syncThemeButtons(val) {
    var btns = document.querySelectorAll('.settings-toggle-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-theme-val') === val);
    }
}

async function initSettings() {
    initCSRF();
    currentUser = await me();
    if (!currentUser) { window.location.href = '/login'; return; }
    document.getElementById('user-info').textContent = currentUser.username;
    if (currentUser.role === 'admin') {
        var al = document.getElementById('admin-link');
        if (al) al.style.display = '';
    }

    document.getElementById('settings-username').textContent = currentUser.username;
    document.getElementById('settings-role').textContent = currentUser.role;
    document.getElementById('settings-created').textContent = currentUser.created_at ? formatDate(currentUser.created_at) : '-';

    var theme = currentUser.theme || 'dark';
    document.getElementById('settings-theme').value = theme;
    document.getElementById('settings-lang').value = currentUser.lang || 'en';
    syncThemeButtons(theme);

    initI18n(function() {
        translateDOM();
    });
}

function saveSettings() {
    var theme = document.getElementById('settings-theme').value;
    var lang = document.getElementById('settings-lang').value;

    fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme, lang: lang })
    }).then(function(res) {
        return res.json();
    }).then(function(data) {
        if (data.error) { showToast(t('app.error') + ': ' + data.error, 'error'); return; }
        var saved = document.getElementById('settings-saved');
        saved.style.display = 'inline-flex';
        if (savedTimeout) clearTimeout(savedTimeout);
        savedTimeout = setTimeout(function() { saved.style.display = 'none'; }, 2000);
        if (data.theme) {
            document.documentElement.setAttribute('data-theme', data.theme);
            localStorage.setItem('nexusmap-theme', data.theme);
        }
        if (data.lang && data.lang !== _locale) {
            loadLocale(data.lang, function() {
                translateDOM();
            });
        }
        showToast(t('app.saved'), 'success');
    }).catch(function(e) {
        showToast(t('app.error') + ': ' + e.message, 'error');
    });
}

function goToProjects() { window.location.href = '/'; }
function goToDashboard() { window.location.href = '/dashboard'; }
function goToAdmin() { window.location.href = '/admin'; }
function goToChangePassword() { window.location.href = '/change-password'; }

document.addEventListener('click', function(e) {
    var tb = e.target.closest('.settings-toggle-btn[data-theme-val]');
    if (tb) {
        var val = tb.getAttribute('data-theme-val');
        document.getElementById('settings-theme').value = val;
        syncThemeButtons(val);
    }
});

document.addEventListener('change', function(e) {
    var sel = e.target.closest('#settings-lang');
    if (sel && !_settingsLangChanging) {
        _settingsLangChanging = true;
        var val = sel.value;
        loadLocale(val, function() {
            translateDOM();
            _settingsLangChanging = false;
        });
    }
});

document.addEventListener('DOMContentLoaded', initSettings);
document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var a = btn.getAttribute('data-action');
    if (a === 'saveSettings') saveSettings();
    else if (a === 'goToProjects') goToProjects();
    else if (a === 'goToDashboard') goToDashboard();
    else if (a === 'goToAdmin') goToAdmin();
    else if (a === 'goToChangePassword') goToChangePassword();
    else if (a === 'logout') logout();
    else if (a === 'toggleTheme') toggleTheme();
    else if (a === 'showAboutModal') document.getElementById('about-modal').style.display = 'flex';
    else if (a === 'hideAboutModal') document.getElementById('about-modal').style.display = 'none';
});
document.addEventListener('click', function(e) {
    if (e.target.closest('#about-modal.modal-overlay') && e.target === e.target.closest('#about-modal')) {
        document.getElementById('about-modal').style.display = 'none';
    }
});
