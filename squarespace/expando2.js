/* expando2.js
   Inline "expando" cards + a source icon gallery, built for the *current*
   raw Airtable JSON shape cached by this repo:
     public/articles.json      -> { id, "Article", "Article Link",
                                     "Edition / Title", "Priority (Article)",
                                     "Publication": [sourceId,...],
                                     "Case Studies": [caseStudyId,...],
                                     "Article Doc Link", ... }
     public/case-studies.json  -> { id, "Name", "Tags": [...],
                                     "Start Date", "End Date",
                                     "Date of case study",
                                     "Quotes from articles",
                                     "Articles": [articleId,...], ... }
     public/sources.json       -> { id, "Publication", "Org Type",
                                     "Publication type", "Articles": [...],
                                     "Editions (Count)",
                                     "Priority (Source)", ... }

   Two features, both driven by the same script:
     1. Inline expando links: <a class="expando-link" data-article-id="recXXX">
        or data-casestudy-id="recXXX" — clicking fetches the relevant JSON
        and renders a card in-place (split view), same UX as the legacy
        expando.js.
     2. Source icon gallery: <div class="expando-gallery" data-sources
        data-cols="6"></div> — renders every (or a filtered list of)
        source(s) as an icon tile; clicking a tile expands a panel with
        that source's details and a list of its articles (each of which is
        itself an expando-link into the article card).

   Copy this into Squarespace Code Injection (Footer), or paste directly
   into a Code Block above the content that references it.
*/
(function () {
  try {
    console.info('expando2.js starting');

    function updateStatus(msg) {
      try {
        const s = document.getElementById('expando-status');
        if (s) s.textContent = msg;
      } catch (e) { /* ignore */ }
    }
    updateStatus('expando2.js loaded');

    const ROOT = document.getElementById('expando-root') || document.body;
    const ARTICLES_URL = ROOT.getAttribute('data-articles-url') || '/articles.json';
    const CASESTUDIES_URL = ROOT.getAttribute('data-casestudies-url') || '/case-studies.json';
    const SOURCES_URL = ROOT.getAttribute('data-sources-url') || '/sources.json';

    let articlesCache = null;
    let caseStudiesCache = null;
    let sourcesCache = null;

    async function loadJson(primaryUrl, candidates, cacheSetter, label) {
      const urls = [primaryUrl, ...candidates].filter(Boolean);
      const attempts = [];
      for (const url of urls) {
        try {
          attempts.push(url);
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`Failed to load ${label} (${res.status})`);
          const data = await res.json();
          console.info(`Loaded ${label} from`, url);
          updateStatus(`Loaded ${label} (${data.length} records) from ${url}`);
          cacheSetter(data);
          return data;
        } catch (err) {
          console.warn(`${label} load attempt failed for`, url, err && err.message);
        }
      }
      console.error(`All attempts to load ${label} failed. Tried:`, attempts.join(', '));
      updateStatus(`Failed to load ${label}. See console for details.`);
      return null;
    }

    async function loadArticles() {
      if (articlesCache) return articlesCache;
      return loadJson(
        ARTICLES_URL,
        ['/public/articles.json', 'public/articles.json', 'articles.json'],
        (d) => (articlesCache = d),
        'articles.json'
      );
    }

    async function loadCaseStudies() {
      if (caseStudiesCache) return caseStudiesCache;
      return loadJson(
        CASESTUDIES_URL,
        ['/public/case-studies.json', 'public/case-studies.json', 'case-studies.json'],
        (d) => (caseStudiesCache = d),
        'case-studies.json'
      );
    }

    async function loadSources() {
      if (sourcesCache) return sourcesCache;
      return loadJson(
        SOURCES_URL,
        ['/public/sources.json', 'public/sources.json', 'sources.json'],
        (d) => (sourcesCache = d),
        'sources.json'
      );
    }

    function escapeHtml(s) {
      if (s === undefined || s === null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function findBlockParent(el) {
      let p = el.parentElement;
      while (p && !['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'FIGURE', 'HEADER', 'MAIN', 'ASIDE'].includes(p.tagName)) {
        p = p.parentElement;
      }
      return p || el.parentElement || document.createElement('div');
    }

    /* ---------- Card builders (raw Airtable field names) ---------- */

    function findById(collection, id) {
      return (collection || []).find((x) => String(x.id) === String(id));
    }

    function sourceNameFor(sourceId, sources) {
      const s = findById(sources, sourceId);
      return s ? s['Publication'] : sourceId;
    }

    function buildArticleCard(article, sources) {
      const title = article['Article'] || article['Edition / Title'] || 'Untitled article';
      const pubIds = article['Publication'] || [];
      const pubNames = pubIds.map((id) => sourceNameFor(id, sources)).filter(Boolean);
      const link = article['Article Link'];
      const docLink = article['Article Doc Link'];
      const priority = article['Priority (Article)'];
      const caseStudyIds = article['Case Studies'] || [];

      return `
        <div class="expando-card" data-article-id="${escapeHtml(article.id || '')}">
          <h3>${escapeHtml(title)}</h3>
          ${pubNames.length ? `<div class="meta">${escapeHtml(pubNames.join(', '))}</div>` : ''}
          ${priority ? `<div class="activities"><span>${escapeHtml(priority)}</span></div>` : ''}
          <ul class="docs">
            ${link ? `<li><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Read the article</a></li>` : ''}
            ${docLink ? `<li><a href="${escapeHtml(docLink)}" target="_blank" rel="noopener noreferrer">Research notes</a></li>` : ''}
          </ul>
          ${caseStudyIds.length ? `<div class="cite">Linked case ${caseStudyIds.length > 1 ? 'studies' : 'study'}: ${caseStudyIds
            .map((id) => `<a class="expando-link" data-casestudy-id="${escapeHtml(id)}">${escapeHtml(id)}</a>`)
            .join(', ')}</div>` : ''}
        </div>
      `;
    }

    function buildCaseStudyCard(item, articles) {
      const title = item['Name'] || 'Untitled case study';
      const tags = (item['Tags'] || []).map((t) => `<span>${escapeHtml(t)}</span>`).join('');
      const dateLabel = item['Date of case study'] || [item['Start Date'], item['End Date']].filter(Boolean).join(' – ');
      const quotes = item['Quotes from articles'];
      const articleIds = item['Articles'] || [];
      const articleTitles = item['Article (from Articles)'] || [];

      const articleLinks = articleIds.length
        ? articleIds
            .map((id, i) => {
              const known = findById(articles, id);
              const label = (known && (known['Article'] || known['Edition / Title'])) || articleTitles[i] || id;
              return `<li><a class="expando-link" data-article-id="${escapeHtml(id)}">${escapeHtml(label)}</a></li>`;
            })
            .join('')
        : '';

      return `
        <div class="expando-card" data-casestudy-id="${escapeHtml(item.id || '')}">
          <h3>${escapeHtml(title)}</h3>
          ${dateLabel ? `<div class="meta">${escapeHtml(dateLabel)}</div>` : ''}
          ${quotes ? `<div class="story">${escapeHtml(quotes)}</div>` : ''}
          ${tags ? `<div class="activities">${tags}</div>` : ''}
          ${articleLinks ? `<ul class="docs">${articleLinks}</ul>` : ''}
        </div>
      `;
    }

    /* ---------- Source icon gallery ---------- */

    function initialsFor(name) {
      const words = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return '?';
      if (words.length === 1) return words[0].charAt(0).toUpperCase();
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }

    function buildSourceInfoPanel(source, articles) {
      const name = source['Publication'] || 'Untitled source';
      const orgType = source['Org Type'];
      const pubType = source['Publication type'];
      const editions = source['Editions (Count)'];
      const priority = source['Priority (Source)'];
      const articleIds = source['Articles'] || [];

      const articleLinks = articleIds.length
        ? articleIds
            .map((id) => {
              const known = findById(articles, id);
              const label = (known && (known['Article'] || known['Edition / Title'])) || id;
              return `<li><a class="expando-link" data-article-id="${escapeHtml(id)}">${escapeHtml(label)}</a></li>`;
            })
            .join('')
        : '';

      return `
        <div class="expando-info-panel" data-source-id="${escapeHtml(source.id || '')}">
          <div class="expando-card">
            <button class="expando-close" aria-label="Close details">x</button>
            <h3>${escapeHtml(name)}</h3>
            <div class="meta">${[orgType, pubType].filter(Boolean).map(escapeHtml).join(' &middot; ')}</div>
            ${priority ? `<div class="activities"><span>${escapeHtml(priority)}</span></div>` : ''}
            ${editions !== undefined ? `<div class="cite">${escapeHtml(editions)} edition${editions === 1 ? '' : 's'} tracked</div>` : ''}
            ${articleLinks ? `<ul class="docs">${articleLinks}</ul>` : ''}
          </div>
        </div>
      `;
    }

    function renderSourceGallery(container, sources) {
      if (!sources || !sources.length) {
        container.innerHTML = `<div class="expando-error">Unable to load sources data. Please check your <code>data-sources-url</code> or ensure <code>sources.json</code> is available.</div>`;
        return;
      }

      const idsAttr = container.getAttribute('data-sources');
      let ids = idsAttr ? idsAttr.split(/[,\s]+/).filter(Boolean) : sources.map((s) => String(s.id));

      const colsAttr = container.getAttribute('data-cols');
      if (colsAttr) container.style.setProperty('--cols', parseInt(colsAttr, 10) || 4);

      container.innerHTML = ids
        .map((id) => {
          const s = findById(sources, id) || { id, Publication: id };
          const caption = escapeHtml(s['Publication'] || s.id);
          return `
            <div class="expando-item" data-source-id="${escapeHtml(s.id)}" role="button" tabindex="0">
              <div class="icon">${escapeHtml(initialsFor(s['Publication']))}</div>
              <div class="caption">${caption}</div>
            </div>
          `;
        })
        .join('');

      const items = container.querySelectorAll('.expando-item');
      items.forEach((it, i) => {
        it.addEventListener('click', () => onSourceGalleryItemClick(container, i, sources));
        it.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            onSourceGalleryItemClick(container, i, sources);
          }
        });
      });
    }

    async function onSourceGalleryItemClick(container, index, sources) {
      const items = Array.from(container.querySelectorAll('.expando-item'));
      const clicked = items[index];
      if (!clicked) return;
      const id = clicked.getAttribute('data-source-id');

      const existing = container.querySelector('.expando-info-panel');
      if (existing) {
        const existingId = existing.getAttribute('data-source-id');
        existing.remove();
        if (String(existingId) === String(id)) return; // toggle off
      }

      const source = findById(sources, id) || { id, Publication: id };
      const articles = await loadArticles();

      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildSourceInfoPanel(source, articles);
      const panel = wrapper.firstElementChild;
      panel.classList.add('expando-panel');

      const closeBtn = panel.querySelector('.expando-close');
      if (closeBtn) closeBtn.addEventListener('click', () => panel.remove());

      // wire up any nested expando-links (to article cards) inside the panel
      panel.querySelectorAll('a.expando-link').forEach((a) => {
        a.addEventListener('click', onExpandoClick);
        if (a.getAttribute('href')) a.setAttribute('data-href-fallback', a.getAttribute('href'));
        a.removeAttribute('href');
      });

      clicked.insertAdjacentElement('afterend', panel);
      if (window.innerWidth < 700) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ---------- Inline expando links (article / case study) ---------- */

    async function onExpandoClick(e) {
      e.preventDefault();
      const link = e.currentTarget;
      const isCaseStudy = link.hasAttribute('data-casestudy-id');
      const isArticle = link.hasAttribute('data-article-id');
      if (!isCaseStudy && !isArticle) return;

      const idsRaw = (link.getAttribute(isCaseStudy ? 'data-casestudy-id' : 'data-article-id') || '').trim();
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

      let html;
      if (isCaseStudy) {
        const [caseStudies, articles] = await Promise.all([loadCaseStudies(), loadArticles()]);
        html = ids
          .map((id) => {
            const item = findById(caseStudies, id) || { id, Name: id };
            return buildCaseStudyCard(item, articles);
          })
          .join('<hr style="border:none;border-top:1px solid #eee;margin: .75rem 0;">');
      } else {
        const [articles, sources] = await Promise.all([loadArticles(), loadSources()]);
        html = ids
          .map((id) => {
            const item = findById(articles, id) || { id, Article: id };
            return buildArticleCard(item, sources);
          })
          .join('<hr style="border:none;border-top:1px solid #eee;margin: .75rem 0;">');
      }

      const panel = document.createElement('div');
      panel.className = 'expando-panel';
      panel.innerHTML = html;

      // wire up any nested expando-links (article <-> case study cross refs)
      panel.querySelectorAll('a.expando-link').forEach((a) => {
        a.addEventListener('click', onExpandoClick);
        if (a.getAttribute('href')) a.setAttribute('data-href-fallback', a.getAttribute('href'));
        a.removeAttribute('href');
      });

      const closeBtn = document.createElement('button');
      closeBtn.className = 'expando-close';
      closeBtn.setAttribute('aria-label', 'Close details');
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
      console.info('expando2 init');
      const links = document.querySelectorAll('a.expando-link');
      links.forEach((a) => {
        a.addEventListener('click', onExpandoClick);
        if (a.getAttribute('href')) a.setAttribute('data-href-fallback', a.getAttribute('href'));
        a.removeAttribute('href');
      });

      const galleries = document.querySelectorAll('.expando-gallery[data-sources], .expando-gallery');
      if (galleries.length) {
        (async () => {
          const sources = sourcesCache || (await loadSources());
          galleries.forEach((g) => renderSourceGallery(g, sources));
        })();
      }
    }

    function start() {
      try {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init);
        } else {
          init();
        }
      } catch (e) {
        console.error('expando2 start failed', e);
      }
    }

    start();
  } catch (e) {
    console.error('expando2.js failed to initialise', e);
  }
})();
