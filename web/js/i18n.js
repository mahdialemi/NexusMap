var _locale = 'en';
var _translations = {};
var _i18nReady = false;
var _i18nFallbacks = {};

function detectLang() {
    var stored = localStorage.getItem('nexusmap-lang');
    if (stored === 'fa' || stored === 'en') return stored;
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.startsWith('fa') ? 'fa' : 'en';
}

function t(key, fallback) {
    var val = _translations[key];
    if (val != null) return val;
    if (fallback != null) return fallback;
    var fb = _i18nFallbacks[key];
    if (fb != null) return fb;
    return key;
}

function applyRTL(locale) {
    // no layout changes — always LTR
}

function translateDOM(root) {
    if (!root) root = document;
    var els = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var key = el.getAttribute('data-i18n');
        if (!key) continue;
        var val = t(key);
        if (val !== key) {
            var attr = el.getAttribute('data-i18n-attr');
            if (attr) {
                el.setAttribute(attr, val);
            } else {
                el.textContent = val;
            }
        }
    }
    var placeholders = root.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) {
        var inp = placeholders[j];
        var pk = inp.getAttribute('data-i18n-placeholder');
        if (pk) inp.setAttribute('placeholder', t(pk));
    }
}

function loadLocale(locale, callback) {
    _locale = locale;
    localStorage.setItem('nexusmap-lang', locale);
    applyRTL(locale);
    if (locale === 'en') {
        fetch('/lang/en.json').then(function(r){return r.json();}).then(function(data){
            _translations = data;
            _i18nFallbacks = data;
            _i18nReady = true;
            translateDOM();
            if (callback) callback();
        }).catch(function(e){
            console.error('i18n: failed to load en.json', e);
            _i18nReady = true;
            if (callback) callback();
        });
    } else if (locale === 'fa') {
        fetch('/lang/fa.json').then(function(r){return r.json();}).then(function(data){
            _translations = data;
            fetch('/lang/en.json').then(function(r){return r.json();}).then(function(en){
                _i18nFallbacks = en;
                _i18nReady = true;
                translateDOM();
                if (callback) callback();
            }).catch(function(e){
                console.error('i18n: failed to load en fallback', e);
                _i18nReady = true;
                translateDOM();
                if (callback) callback();
            });
        }).catch(function(e){
            console.error('i18n: failed to load fa.json', e);
            _i18nReady = true;
            if (callback) callback();
        });
    } else {
        _i18nReady = true;
        if (callback) callback();
    }
}

function initI18n(callback) {
    if (_i18nReady) {
        translateDOM();
        if (callback) callback();
        return;
    }
    var lang = detectLang();
    loadLocale(lang, callback);
}
