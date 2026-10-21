// pageWorld.js - Runs in MAIN execution world of contributor.stock.adobe.com
(function () {
  'use strict';

  let blockAnalytics = true; // Block tracking beacons (VisitorAPI, Sentry, demdex) during bot operation

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');

    // 1. Block analytics / telemetry flood from tile clicks if blockAnalytics is enabled
    if (blockAnalytics && url) {
      if (url.includes('d_visid_ver') ||
          url.includes('d_fieldgroup=AAM') ||
          url.includes('demdex.net') ||
          url.includes('omtrdc.net') ||
          url.includes('/envelope/?sentry_version') ||
          url.includes('sentry.io')) {
        // Return dummy response immediately without hitting external servers
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const response = await originalFetch.apply(this, args);

    // 2. Intercept content / rejected items data
    try {
      if (url && (url.includes('/content') || url.includes('/rejected') || url.includes('/api/'))) {
        const clone = response.clone();
        clone.json().then(data => {
          processInterceptedData(data, url);
        }).catch(() => { });
      }
    } catch (e) {
      // ignore
    }
    return response;
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (blockAnalytics && this._url) {
      if (this._url.includes('d_visid_ver') ||
          this._url.includes('d_fieldgroup=AAM') ||
          this._url.includes('demdex.net') ||
          this._url.includes('/envelope/?sentry_version') ||
          this._url.includes('omtrdc.net')) {
        // Abort analytics tracking request
        return;
      }
    }

    this.addEventListener('load', function () {
      try {
        if (this._url && (this._url.includes('/content') || this._url.includes('/rejected') || this._url.includes('/api/'))) {
          const data = JSON.parse(this.responseText);
          processInterceptedData(data, this._url);
        }
      } catch (e) {
        // ignore
      }
    });
    return originalSend.apply(this, arguments);
  };

  function processInterceptedData(data, sourceUrl) {
    if (!data) return;

    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (Array.isArray(data.content)) {
      items = data.content;
    } else if (Array.isArray(data.items)) {
      items = data.items;
    } else if (data.reduxState && Array.isArray(data.reduxState.content)) {
      items = data.reduxState.content;
    }

    const extracted = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const fileId = item.id ? String(item.id) : null;
      const originalName = item.originalName || item.original_name || null;
      if (originalName) {
        extracted.push({
          fileId: fileId || '',
          originalName: originalName,
          title: item.title || '',
          status: item.status || item.state_label || '',
          reason: item.rejection_reason || item.rejectionReason || item.reason || '',
          thumbnailUrl: item.thumbnailUrl || item.thumbnail_url || ''
        });
      }
    }

    if (extracted.length > 0) {
      window.postMessage({
        type: 'ADOBE_STOCK_PAGE_ITEMS',
        source: 'network',
        url: sourceUrl,
        items: extracted
      }, '*');
    }
  }

  // Scan Redux Store directly from React Fiber tree (INSTANT & 0 CLICKS!)
  function scanReduxAndReactFibers() {
    let extracted = [];

    // Attempt 1: Search Redux store from DOM elements
    try {
      const rootCandidates = [
        document.querySelector('.App__AppWrapper-sc-8ca9b9f3-0'),
        document.querySelector('.wrapper-logged'),
        document.querySelector('#header'),
        document.querySelector('.upload-tile'),
        document.body
      ].filter(Boolean);

      for (const el of rootCandidates) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = el[fiberKey];
          let depth = 0;
          while (fiber && depth < 30) {
            // Check stateNode or memoizedProps for store
            const store = (fiber.stateNode && fiber.stateNode.store) ||
                          (fiber.memoizedProps && fiber.memoizedProps.store);
            if (store && typeof store.getState === 'function') {
              const state = store.getState();
              if (state && Array.isArray(state.content) && state.content.length > 0) {
                state.content.forEach(it => {
                  const name = it.originalName || it.original_name;
                  if (name) {
                    extracted.push({
                      fileId: it.id ? String(it.id) : '',
                      originalName: name,
                      reason: it.rejection_reason || it.rejectionReason || '',
                      title: it.title || ''
                    });
                  }
                });
                if (extracted.length > 0) {
                  window.postMessage({
                    type: 'ADOBE_STOCK_PAGE_ITEMS',
                    source: 'redux_store',
                    items: extracted
                  }, '*');
                  return;
                }
              }
            }
            fiber = fiber.return;
            depth++;
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // Attempt 2: Extract directly from each .upload-tile React Fiber props
    try {
      const tiles = document.querySelectorAll('.upload-tile');
      tiles.forEach(tile => {
        const targets = [tile, tile.querySelector('[role="option"]'), tile.querySelector('.upload-tile__wrapper'), tile.querySelector('img')].filter(Boolean);
        for (const el of targets) {
          const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          if (fiberKey) {
            let f = el[fiberKey];
            let depth = 0;
            while (f && depth < 10) {
              const props = f.memoizedProps;
              if (props) {
                const candidate = props.item || props.content || props.asset || props.data;
                if (candidate && (candidate.originalName || candidate.original_name)) {
                  extracted.push({
                    fileId: candidate.id ? String(candidate.id) : '',
                    originalName: candidate.originalName || candidate.original_name,
                    reason: candidate.rejection_reason || candidate.rejectionReason || ''
                  });
                  break;
                }
              }
              f = f.return;
              depth++;
            }
          }
        }
      });

      if (extracted.length > 0) {
        window.postMessage({
          type: 'ADOBE_STOCK_PAGE_ITEMS',
          source: 'tile_fibers',
          items: extracted
        }, '*');
        return;
      }
    } catch (e) {
      // ignore
    }

    // Attempt 3: Initial React context if still on first render
    try {
      if (window.__react_context__) {
        const decoded = decodeURIComponent(window.__react_context__);
        const json = JSON.parse(decoded);
        processInterceptedData(json, 'react_context');
      }
    } catch (e) {
      // ignore
    }
  }

  // Listen for control messages from content script
  window.addEventListener('message', function (event) {
    if (!event.data) return;
    if (event.data.type === 'ADOBE_STOCK_TRIGGER_SCAN') {
      scanReduxAndReactFibers();
    } else if (event.data.type === 'ADOBE_STOCK_SET_BLOCK_ANALYTICS') {
      blockAnalytics = !!event.data.enabled;
    }
  });

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanReduxAndReactFibers);
  } else {
    scanReduxAndReactFibers();
  }
})();
