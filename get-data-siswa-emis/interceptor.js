/**
 * EMIS Data Siswa Scraper - API Interceptor (Main World Script)
 * Runs directly in the web page context (MAIN world) to intercept
 * fetch and XMLHttpRequest API responses carrying student detail data.
 */
(() => {
    'use strict';

    if (window.__EMIS_INTERCEPTOR_LOADED__) return;
    window.__EMIS_INTERCEPTOR_LOADED__ = true;

    console.log('[EMIS Scraper] API Interceptor initialized');

    /**
     * Check if a response JSON object contains student detail data
     */
    function isStudentDetailData(data) {
        if (!data || typeof data !== 'object') return false;
        
        // Structure check based on EMIS API response
        const res = data.results || data.data || data;
        if (!res || typeof res !== 'object') return false;

        // Must have core student fields
        const hasFullName = typeof res.full_name === 'string' && res.full_name.trim().length > 0;
        const hasIdOrNik = res.id !== undefined || res.siswa_id !== undefined || res.nik !== undefined;
        const hasLearningOrParents = res.learning_activity !== undefined || res.parents !== undefined || res.birth_date !== undefined;

        return hasFullName && (hasIdOrNik || hasLearningOrParents);
    }

    /**
     * Broadcast captured student detail data to Content Script
     */
    function notifyDetailData(data, source = 'api') {
        try {
            const res = data.results || data.data || data;
            const event = new CustomEvent('EMIS_STUDENT_DETAIL_CAPTURED', {
                detail: {
                    source: source,
                    timestamp: Date.now(),
                    data: res,
                    raw: data
                }
            });
            window.dispatchEvent(event);
            console.log('[EMIS Scraper] Detail data captured:', res.full_name);
        } catch (err) {
            console.error('[EMIS Scraper] Error broadcasting captured data:', err);
        }
    }

    // ==================== INTERCEPT FETCH ====================
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const clone = response.clone();
            const contentType = clone.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                clone.json().then(data => {
                    if (isStudentDetailData(data)) {
                        notifyDetailData(data, 'fetch');
                    }
                }).catch(() => {});
            }
        } catch (e) {
            // Ignore clone errors
        }
        return response;
    };

    // ==================== INTERCEPT XHR ====================
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    XHR.open = function (method, url, ...rest) {
        this._emis_url = url;
        return originalOpen.apply(this, [method, url, ...rest]);
    };

    XHR.send = function (...args) {
        this.addEventListener('load', function () {
            try {
                if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') {
                    let data = this.response;
                    if (typeof data === 'string' && data.trim().startsWith('{')) {
                        data = JSON.parse(data);
                    }
                    if (isStudentDetailData(data)) {
                        notifyDetailData(data, 'xhr');
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        });
        return originalSend.apply(this, args);
    };

})();
