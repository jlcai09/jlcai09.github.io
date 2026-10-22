(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'kai-bento-theme';

  function syncThemeButtons() {
    var isDark = root.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(isDark));
    });
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* ignore */
      }
      syncThemeButtons();
    });
  });
  syncThemeButtons();

  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  document.querySelectorAll('[data-kbd]').forEach(function (el) {
    el.textContent = isMac ? '⌘K' : 'Ctrl K';
  });

  /* Reading progress */
  var progressBar = document.getElementById('reading-progress-bar');
  if (progressBar) {
    var updateProgress = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progressBar.style.transform = 'scaleX(' + ratio + ')';
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    updateProgress();
  }

  /* Table of contents */
  function initToc() {
    var grid = document.getElementById('article-grid');
    var content = document.querySelector('.article-content');
    var toc = document.getElementById('toc');
    if (!grid || !content || !toc) return;

    var headings = Array.prototype.slice.call(content.querySelectorAll('h1, h2, h3'))
      .filter(function (heading) {
        return heading.textContent.trim() && !heading.closest('.highlight');
      });
    if (!headings.length) return;

    var used = {};
    headings.forEach(function (heading, index) {
      var id = heading.id;
      if (!id) {
        id = 'heading-' + (index + 1);
        heading.id = id;
      }
      while (used[id]) {
        id = heading.id + '-' + (index + 1);
        heading.id = id;
      }
      used[id] = true;

      var link = document.createElement('a');
      link.href = '#' + id;
      link.className = 'toc-' + heading.tagName.toLowerCase();
      link.textContent = heading.textContent.trim();
      link.addEventListener('click', function (event) {
        event.preventDefault();
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      toc.appendChild(link);
    });

    grid.classList.add('has-toc');

    var links = {};
    toc.querySelectorAll('a').forEach(function (link) {
      links[link.getAttribute('href').slice(1)] = link;
    });

    var setActive = function (id) {
      Object.keys(links).forEach(function (key) {
        links[key].classList.toggle('active', key === id);
      });
    };

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      }, { rootMargin: '-12% 0px -72% 0px', threshold: 0 });

      headings.forEach(function (heading) {
        observer.observe(heading);
      });
    }
  }
  initToc();

  /* Collapse long code blocks */
  function initCodeFold() {
    var content = document.querySelector('.article-content');
    if (!content) return;
    var visibleLines = 20;

    content.querySelectorAll('figure.highlight').forEach(function (figure) {
      if (figure.closest('.code-fold')) return;

      var codePre = figure.querySelector('.code pre') || figure.querySelector('pre');
      var lineCount = figure.querySelectorAll('.code .line').length;
      if (!lineCount && codePre) {
        var text = codePre.textContent.replace(/\n+$/, '');
        lineCount = text ? text.split('\n').length : 0;
      }
      if (lineCount <= visibleLines) return;

      var style = window.getComputedStyle(codePre);
      var lineHeight = parseFloat(style.lineHeight);
      if (!isFinite(lineHeight)) lineHeight = parseFloat(style.fontSize) * 1.7;
      var padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      var collapsedHeight = Math.ceil(lineHeight * visibleLines + padding);

      var fold = document.createElement('div');
      fold.className = 'code-fold is-collapsed';
      fold.style.setProperty('--code-fold-height', collapsedHeight + 'px');

      var body = document.createElement('div');
      body.className = 'code-fold-body';

      var bar = document.createElement('div');
      bar.className = 'code-fold-bar';

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'code-fold-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<span class="code-fold-label">展开全部</span>'
        + '<span class="code-fold-count">共 ' + lineCount + ' 行</span>'
        + '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">'
        + '<path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" '
        + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      var label = toggle.querySelector('.code-fold-label');
      toggle.addEventListener('click', function () {
        var expanded = fold.classList.toggle('is-expanded');
        fold.classList.toggle('is-collapsed', !expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        label.textContent = expanded ? '收起代码' : '展开全部';
      });

      figure.parentNode.insertBefore(fold, figure);
      body.appendChild(figure);
      bar.appendChild(toggle);
      fold.appendChild(body);
      fold.appendChild(bar);
    });
  }
  initCodeFold();

  /* Local search */
  var searchUrl = document.body ? document.body.getAttribute('data-search-url') : null;
  var searchIndex = null;
  var searchPromise = null;

  function htmlToText(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style').forEach(function (el) {
      el.remove();
    });
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function loadIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    if (searchPromise) return searchPromise;
    if (!searchUrl) return Promise.reject(new Error('Missing search index URL'));

    searchPromise = fetch(searchUrl, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Search index request failed');
        return response.text();
      })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('Search index parse failed');

        var entries = Array.prototype.slice.call(doc.querySelectorAll('entry'));
        searchIndex = entries.map(function (entry) {
          var titleNode = entry.querySelector('title');
          var urlNode = entry.querySelector('url');
          var linkNode = entry.querySelector('link');
          var contentNode = entry.querySelector('content');
          var title = titleNode ? titleNode.textContent.trim() : '';
          var url = urlNode ? urlNode.textContent.trim() : '';
          if (!url && linkNode) url = linkNode.getAttribute('href') || '';
          var plain = contentNode ? htmlToText(contentNode.textContent) : '';
          return {
            title: title,
            url: url,
            text: plain,
            titleLower: title.toLowerCase(),
            textLower: plain.toLowerCase()
          };
        }).filter(function (item) {
          return item.title && item.url;
        });
        return searchIndex;
      })
      .catch(function (error) {
        searchPromise = null;
        throw error;
      });

    return searchPromise;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function appendHighlighted(el, text, terms) {
    if (!terms.length) {
      el.appendChild(document.createTextNode(text));
      return;
    }
    var regex = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'gi');
    var last = 0;
    var match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) {
        el.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      var mark = document.createElement('mark');
      mark.textContent = match[0];
      el.appendChild(mark);
      last = match.index + match[0].length;
      if (match[0].length === 0) regex.lastIndex += 1;
    }
    if (last < text.length) {
      el.appendChild(document.createTextNode(text.slice(last)));
    }
  }

  function snippetFor(text, terms) {
    if (!text) return '';
    var lower = text.toLowerCase();
    var pos = -1;
    terms.forEach(function (term) {
      var index = lower.indexOf(term);
      if (index !== -1 && (pos === -1 || index < pos)) pos = index;
    });
    if (pos === -1) pos = 0;
    var start = Math.max(0, pos - 48);
    var end = Math.min(text.length, start + 160);
    if (start === 0 && end === text.length) return text;
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  function queryIndex(query) {
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    return searchIndex.map(function (item) {
      var score = 0;
      for (var i = 0; i < terms.length; i += 1) {
        var term = terms[i];
        var inTitle = item.titleLower.indexOf(term) !== -1;
        var inText = item.textLower.indexOf(term) !== -1;
        if (!inTitle && !inText) return null;
        if (inTitle) score += 10;
        if (inText) {
          var count = item.textLower.split(term).length - 1;
          score += Math.min(count, 6);
        }
      }
      return { item: item, score: score };
    }).filter(Boolean).sort(function (a, b) {
      return b.score - a.score;
    }).slice(0, 20).map(function (hit) {
      return hit.item;
    });
  }

  function renderMessage(container, countEl, message) {
    container.textContent = '';
    var p = document.createElement('p');
    p.className = 'search-empty';
    p.textContent = message;
    container.appendChild(p);
    if (countEl) countEl.textContent = '';
  }

  function renderResults(container, countEl, items, terms) {
    container.textContent = '';
    if (!items.length) {
      renderMessage(container, countEl, '没有找到匹配的文章。');
      if (countEl) countEl.textContent = '0 条结果';
      return;
    }

    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      var link = document.createElement('a');
      link.className = 'search-result';
      link.href = item.url;

      var title = document.createElement('h4');
      appendHighlighted(title, item.title, terms);

      var desc = document.createElement('p');
      appendHighlighted(desc, snippetFor(item.text, terms), terms);

      link.appendChild(title);
      link.appendChild(desc);
      fragment.appendChild(link);
    });
    container.appendChild(fragment);
    if (countEl) countEl.textContent = items.length + ' 条结果';
  }

  function renderSuggestions(container, countEl) {
    var items = searchIndex.slice(0, 5);
    renderResults(container, countEl, items, []);
    if (countEl && items.length) countEl.textContent = '最近 ' + items.length + ' 篇';
  }

  function runSearch(query, container, countEl) {
    if (!container) return;
    var trimmed = query.trim();
    var runId = (container.__searchRunId || 0) + 1;
    container.__searchRunId = runId;

    renderMessage(container, countEl, '正在加载搜索索引…');
    if (countEl) countEl.textContent = '';

    loadIndex().then(function () {
      if (container.__searchRunId !== runId) return;
      if (!trimmed) {
        renderSuggestions(container, countEl);
        return;
      }
      var terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
      renderResults(container, countEl, queryIndex(trimmed), terms);
    }).catch(function () {
      if (container.__searchRunId !== runId) return;
      renderMessage(container, countEl, '搜索索引加载失败，请稍后重试。');
    });
  }

  /* Overlay search */
  var overlay = document.getElementById('search-overlay');
  var overlayInput = document.getElementById('search-overlay-input');
  var overlayResults = document.getElementById('search-overlay-results');
  var overlayCount = document.getElementById('search-overlay-count');
  var lastTrigger = null;
  var searchTimer = null;

  function openOverlay(trigger) {
    if (!overlay || !overlayInput) return;
    lastTrigger = trigger || document.activeElement;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    window.setTimeout(function () {
      overlayInput.focus();
      overlayInput.select();
    }, 30);
    runSearch(overlayInput.value, overlayResults, overlayCount);
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
  }

  if (overlay && overlayInput) {
    document.querySelectorAll('[data-search-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        openOverlay(button);
      });
    });

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeOverlay();
    });

    overlayInput.addEventListener('input', function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        runSearch(overlayInput.value, overlayResults, overlayCount);
      }, 120);
    });

    document.addEventListener('keydown', function (event) {
      var isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isShortcut) {
        event.preventDefault();
        if (overlay.classList.contains('is-open')) {
          overlayInput.focus();
        } else {
          openOverlay(document.querySelector('[data-search-open]'));
        }
      } else if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
        event.preventDefault();
        closeOverlay();
      }
    });
  }

  /* Search page */
  var pageSearch = document.querySelector('[data-search-page]');
  if (pageSearch) {
    var pageInput = document.getElementById('search-page-input');
    var pageResults = document.getElementById('search-page-results');
    var pageCount = document.getElementById('search-page-count');
    if (pageInput) {
      runSearch('', pageResults, pageCount);
      pageInput.addEventListener('input', function () {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () {
          runSearch(pageInput.value, pageResults, pageCount);
        }, 120);
      });
    }
  }
})();
