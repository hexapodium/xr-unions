/* expando.js
   Copy this into Squarespace Code Injection (Footer) or paste into a Code Block.
*/
(function () {
  try {
    console.info('expando.js starting');
    function updateStatus(msg) {
      try {
        const s = document.getElementById('expando-status');
        if (s) s.textContent = msg;
      } catch (e) { /* ignore */ }
    }
    updateStatus('expando.js loaded');
  const ROOT = document.getElementById('expando-root') || document.body;
  const GROUPS_URL = ROOT.getAttribute('data-groups-url') || '/groups.json';
  const CASESTUDIES_URL = ROOT.getAttribute('data-casestudies-url') || '/casestudies.json';
  let groupsCache = null;
  let caseStudiesCache = null;

  async function loadGroups() {
    if (groupsCache) return groupsCache;
    const attempts = [];
    const candidates = [GROUPS_URL, '/public/groups.json', 'public/groups.json', '/groups.json', 'groups.json'];

    for (const url of candidates) {
      if (!url) continue;
      try {
        attempts.push(url);
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('Failed to load groups JSON: ' + url + ' (' + res.status + ')');
  groupsCache = await res.json();
  console.info('Loaded groups.json from', url);
  updateStatus('Loaded groups.json (' + groupsCache.length + ' groups) from ' + url);
  return groupsCache;
      } catch (err) {
        console.warn('groups.json load attempt failed for', url, err && err.message);
        // try next
      }
    }

  console.error('All attempts to load groups.json failed. Tried:', attempts.join(', '));
  updateStatus('Failed to load groups.json. See console for details.');
    groupsCache = null;
    return null;
  }

  async function loadCaseStudies() {
    if (caseStudiesCache) return caseStudiesCache;
    const attempts = [];
    const candidates = [CASESTUDIES_URL, '/public/casestudies.json', 'public/casestudies.json', '/casestudies.json', 'casestudies.json'];

    for (const url of candidates) {
      if (!url) continue;
      try {
        attempts.push(url);
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('Failed to load case studies JSON: ' + url + ' (' + res.status + ')');
        caseStudiesCache = await res.json();
        console.info('Loaded casestudies.json from', url);
        updateStatus('Loaded casestudies.json (' + caseStudiesCache.length + ' case studies) from ' + url);
        return caseStudiesCache;
      } catch (err) {
        console.warn('casestudies.json load attempt failed for', url, err && err.message);
        // try next
      }
    }

    console.error('All attempts to load casestudies.json failed. Tried:', attempts.join(', '));
    updateStatus('Failed to load casestudies.json. See console for details.');
    caseStudiesCache = null;
    return null;
  }


  function findBlockParent(el) {
    let p = el.parentElement;
    while (p && !['P','DIV','SECTION','ARTICLE','LI','FIGURE','HEADER','MAIN','ASIDE'].includes(p.tagName)) {
      p = p.parentElement;
    }
    return p || el.parentElement || document.createElement('div');
  }

  function buildCard(group) {
    const docs = (group.documents || []).map(d => {
      const md = d.match(/^\s*\[(.+?)\]\((.+?)\)/);
      if (md) return `<li><a href="${md[2]}" target="_blank" rel="noopener noreferrer">${md[1]}</a></li>`;
      return `<li>${d}</li>`;
    }).join('');

    const activities = (group.activities || []).map(a => `<span>${escapeHtml(a)}</span>`).join('');

    return `
      <div class="expando-card" data-group-id="${escapeHtml(group.id || '')}">
        <h3>${escapeHtml(group.name || 'Untitled')}</h3>
        <div class="intro">${escapeHtml(group.intro || '')}</div>
        ${activities ? `<div class="activities">${activities}</div>` : ''}
        ${docs ? `<ul class="docs">${docs}</ul>` : ''}
        ${group.additionalInfo ? `<div class="cite">${escapeHtml(group.additionalInfo)}</div>` : ''}
      </div>
    `;
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function buildCaseStudyCard(item) {
    const tags = (item.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join('');
    const links = (item.links || []).map(d => {
      const md = d.match(/^\s*\[(.+?)\]\((.+?)\)/);
      if (md) return `<li><a href="${md[2]}" target="_blank" rel="noopener noreferrer">${md[1]}</a></li>`;
      return `<li>${d}</li>`;
    }).join('');

    return `
      <div class="expando-card" data-casestudy-id="${escapeHtml(item.id || '')}">
        <h3>${escapeHtml(item.title || 'Untitled')}</h3>
        ${item.org ? `<div class="meta">${escapeHtml(item.org)}</div>` : ''}
        <div class="intro">${escapeHtml(item.summary || '')}</div>
        ${item.story ? `<div class="story">${escapeHtml(item.story)}</div>` : ''}
        ${tags ? `<div class="activities">${tags}</div>` : ''}
        ${links ? `<ul class="docs">${links}</ul>` : ''}
      </div>
    `;
  }

  /* Build a small info panel used by the gallery expando */
  function buildInfoPanel(group) {
    return `
      <div class="expando-info-panel" data-group-id="${escapeHtml(group.id || '')}">
        <div class="expando-card">
          <button class="expando-close" aria-label="Close details">x</button>
          <h3>${escapeHtml(group.name || 'Untitled')}</h3>
          <div class="intro">${escapeHtml(group.intro || '')}</div>
          ${group.additionalInfo ? `<div class="cite">${escapeHtml(group.additionalInfo)}</div>` : ''}
        </div>
      </div>
    `;
  }

  /* Gallery expando: render grid items and handle clicks; supports group.iconUrl */
  function renderGalleryFromGroups(container, groups) {
    console.debug('renderGalleryFromGroups', container, !!groups && groups.length);
  if (typeof updateStatus === 'function') updateStatus('Rendering gallery (' + ((groups && groups.length) || 0) + ' groups)');
    const idsAttr = container.getAttribute('data-groups');
    let ids = [];
    if (!groups || !groups.length) {
      container.innerHTML = `<div class="expando-error">Unable to load groups data. Please check your <code>data-groups-url</code> or ensure <code>groups.json</code> is available.</div>`;
      return;
    }
    if (idsAttr) ids = idsAttr.split(/[,\s]+/).filter(Boolean);
    if (!ids.length) ids = groups.map(g => String(g.id));

  // If data-cols is provided, set a CSS variable so the snippet CSS can switch to a fixed-column layout
  const colsAttr = container.getAttribute('data-cols');
  if (colsAttr) container.style.setProperty('--cols', parseInt(colsAttr, 10) || 4);

    container.innerHTML = ids.map(id => {
      const g = groups.find(x => String(x.id) === String(id)) || { id, name: id };
      const caption = escapeHtml(g.name || g.id);
      const iconHtml = g.iconUrl
        ? `<div class="icon"><img class="icon-img" src="${escapeHtml(g.iconUrl)}" alt="${caption}"></div>`
        : `<div class="icon">${escapeHtml((g.name || '').trim().charAt(0).toUpperCase() || '?')}</div>`;
      return `
        <div class="expando-item" data-group-id="${escapeHtml(g.id)}" role="button" tabindex="0">
          ${iconHtml}
          <div class="caption">${caption}</div>
        </div>
      `;
    }).join('');

    const items = container.querySelectorAll('.expando-item');
    items.forEach((it, i) => {
      it.addEventListener('click', () => onGalleryItemClick(container, i, groups));
      it.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onGalleryItemClick(container, i, groups); } });
    });
  }

  function onGalleryItemClick(container, index, groups) {
  console.debug('onGalleryItemClick', index);
    const items = Array.from(container.querySelectorAll('.expando-item'));
    const clicked = items[index];
    if (!clicked) return;
    const id = clicked.getAttribute('data-group-id');
    const group = groups.find(g => String(g.id) === String(id)) || { id, name: id, intro: 'Not found' };

    const existing = container.querySelector('.expando-info-panel');
    if (existing) {
      const existingId = existing.getAttribute('data-group-id');
      if (String(existingId) === String(id)) {
        existing.remove();
        return;
      }
      existing.remove();
    }

    const insertAfterIndex = index;

  const panelWrapper = document.createElement('div');
  panelWrapper.innerHTML = buildInfoPanel(group);
  const panel = panelWrapper.firstElementChild;
  // mark gallery panels with the common expando-panel class so they span full width
  panel.classList.add('expando-panel');

    const closeBtn = panel.querySelector('.expando-close');
    if (closeBtn) closeBtn.addEventListener('click', () => panel.remove());

    // insert panel immediately after the clicked element in the DOM
    if (clicked && clicked.parentElement) {
      clicked.insertAdjacentElement('afterend', panel);
    } else {
      container.appendChild(panel);
    }

    if (window.innerWidth < 700) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function onExpandoClick(e) {
    e.preventDefault();
    const link = e.currentTarget;
    const isCaseStudy = link.hasAttribute('data-casestudy-id');
    const idsRaw = (link.getAttribute(isCaseStudy ? 'data-casestudy-id' : 'data-group-id') || '').trim();
    if (!idsRaw) return;

    const ids = idsRaw.split(/[\s,]+/).filter(Boolean);
    const block = findBlockParent(link);

    if (block.classList.contains('expando-container') && block.classList.contains('expanded')) {
      block.classList.remove('expanded');
      const panel = block.querySelector('.expando-panel');
      if (panel) panel.remove();
      return;
    }

    block.classList.add('expando-container');

    const dataset = isCaseStudy ? await loadCaseStudies() : await loadGroups();
    const buildFn = isCaseStudy ? buildCaseStudyCard : buildCard;
    const label = isCaseStudy ? 'title' : 'name';

    const items = ids.map(id => {
      return (dataset || []).find(x => String(x.id) === String(id)) || { id, [label]: id, intro: 'Not found' };
    });

    const panel = document.createElement('div');
    panel.className = 'expando-panel';
    panel.innerHTML = items.map(buildFn).join('<hr style="border:none;border-top:1px solid #eee;margin: .75rem 0;">');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'expando-close';
    closeBtn.setAttribute('aria-label','Close details');
    closeBtn.innerHTML = 'x';
    closeBtn.addEventListener('click', () => {
      block.classList.remove('expanded');
      panel.remove();
    });

    panel.style.position = 'relative';
    panel.appendChild(closeBtn);
    block.appendChild(panel);
    void block.offsetWidth;
    block.classList.add('expanded');

    if (window.innerWidth < 700) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  function init() {
  console.info('expando init');
    const links = document.querySelectorAll('a.expando-link');
    links.forEach(a => {
      a.addEventListener('click', onExpandoClick);
      if (a.getAttribute('href')) a.setAttribute('data-href-fallback', a.getAttribute('href'));
      a.removeAttribute('href');
    });

    // render any galleries on the page
    const galleries = document.querySelectorAll('.expando-gallery');
    if (galleries.length) {
      // ensure groups are loaded, then render each gallery
      (async () => {
        const groups = groupsCache || await loadGroups();
        galleries.forEach(g => renderGalleryFromGroups(g, groups));
      })();
    }
  }

  function start() {
    try {
      init();
      loadGroups();
      loadCaseStudies();
    } catch (err) {
      console.error('init error', err);
    }
  }

  // Inject minimal fallback styles when the external CSS is missing or stripped
  function ensureFallbackStyles() {
    if (document.getElementById('expando-inline-styles')) return;
    const css = `
      .expando-card{background:#fff;border-radius:8px;padding:1rem;box-shadow:0 6px 18px rgba(0,0,0,0.08);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial;color:#111}
      .expando-card h3{margin:0 0 .5rem;font-size:1.05rem}
      .expando-card .intro{color:#444;margin-bottom:.75rem;font-size:.95rem}
      .expando-card .cite{margin-top:.75rem;font-size:.8rem;color:#666}
      .expando-gallery .expando-item{background:#fff;border-radius:6px;padding:.6rem;text-align:center;box-shadow:0 4px 10px rgba(0,0,0,0.06);cursor:pointer}
      .expando-gallery .expando-item .icon{width:48px;height:48px;margin:0 auto .5rem;background:#f0f4f8;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:600;color:#0b3a66}
      .expando-gallery .expando-item .icon img.icon-img{width:100%;height:100%;border-radius:6px;object-fit:cover;display:block}
      .expando-gallery .expando-item .caption{margin-top:.25rem;font-size:.95rem;color:#111}
      .expando-info-panel{grid-column:1/-1;opacity:1;transform:none}
    `;
    const s = document.createElement('style');
    s.id = 'expando-inline-styles';
    s.textContent = css;
    document.head.appendChild(s);
    console.info('Expando fallback styles injected');
  }

  // always ensure fallback styles early
  try { ensureFallbackStyles(); } catch (e) { /* ignore */ }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    // document already loaded (script injected late) — run immediately
    start();
  }
  } catch (err) {
    console.error('expando.js fatal error', err);
  }
})();
