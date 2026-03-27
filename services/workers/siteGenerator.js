// paste this FULL file into services/workers/siteGenerator.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = '/var/www/dmf7';
const OUTPUT_DIR = path.join(ROOT_DIR, 'generated');
const TOPICS_DIR = path.join(ROOT_DIR, 'topics');
const ROOT_URL = 'https://dmf7.ai';
const API_URL = 'https://api.dmf7.ai';
const SITEMAP_SCRIPT = '/root/DMF7-NextGen/scripts/build-sitemap.js';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(TOPICS_DIR)) fs.mkdirSync(TOPICS_DIR, { recursive: true });

const topicMap = {
  'AI automation business': 'ai-automation',
  'make money online': 'monetization',
  'task orchestration systems': 'automation-systems',
  'scaling backend systems': 'engineering-scale',
  'passive income systems': 'monetization',
  'AI SaaS ideas': 'ai-saas',
  'workflow automation tools': 'automation-systems',
  'online business models': 'monetization',
  'programmatic SEO systems': 'programmatic-seo',
  'content automation strategy': 'programmatic-seo',
  'growth systems for founders': 'growth-systems',
  'digital asset scaling': 'growth-systems'
};

const categoryDescriptions = {
  'ai-automation': 'Guides on AI automation, workflows, business systems, and execution leverage.',
  'monetization': 'Guides on online income systems, monetization models, and scalable revenue assets.',
  'automation-systems': 'Guides on orchestration, workflow design, automation tools, and system operations.',
  'engineering-scale': 'Guides on backend systems, scaling architecture, and infrastructure resilience.',
  'ai-saas': 'Guides on AI SaaS concepts, product opportunities, and launch structures.',
  'programmatic-seo': 'Guides on SEO systems, content automation, indexing, and growth infrastructure.',
  'growth-systems': 'Guides on scalable business systems, founder workflows, and digital asset expansion.'
};

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function titleCase(text) {
  return text.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function getCategory(topic) {
  return topicMap[topic] || 'general';
}

function getAllGeneratedFiles() {
  return fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR).filter(name => name.endsWith('.html')).sort()
    : [];
}

function getRecentLinks(currentSlug, limit = 8) {
  return getAllGeneratedFiles()
    .reverse()
    .filter(name => name !== `${currentSlug}.html`)
    .slice(0, limit)
    .map(name => {
      const slug = name.replace(/\.html$/, '');
      const label = titleCase(slug.replace(/-\d+$/, '').replace(/-/g, ' '));
      return `<li><a href="/generated/${slug}.html">${label}</a></li>`;
    })
    .join('\n');
}

function getCategoryLinks(category, currentSlug, limit = 8) {
  return getAllGeneratedFiles()
    .reverse()
    .filter(name => name !== `${currentSlug}.html`)
    .filter(name => {
      const clean = titleCase(
        name.replace(/\.html$/, '').replace(/-\d+$/, '').replace(/-/g, ' ')
      ).toLowerCase();
      return Object.entries(topicMap).some(([topic, cat]) => cat === category && clean.includes(topic.toLowerCase()));
    })
    .slice(0, limit)
    .map(name => {
      const slug = name.replace(/\.html$/, '');
      const label = titleCase(slug.replace(/-\d+$/, '').replace(/-/g, ' '));
      return `<li><a href="/generated/${slug}.html">${label}</a></li>`;
    })
    .join('\n');
}

function articleSections(topic) {
  return [
    {
      title: `What ${topic} means in practice`,
      body: `${topic} refers to the systems, workflows, and tools used to turn repeatable effort into scalable output. In practical terms, it means replacing fragmented manual work with structured execution, automation, and measurement.`
    },
    {
      title: `Why ${topic} matters now`,
      body: `The combination of AI, automation, and low-cost infrastructure has made ${topic} accessible to operators, founders, and small teams. What previously required large budgets can now be built with software, templates, and process discipline.`
    },
    {
      title: `Core building blocks of ${topic}`,
      body: `Most successful implementations of ${topic} rely on the same foundations: clear workflows, reusable content or process modules, stable infrastructure, measurement loops, and a distribution layer that keeps output compounding over time.`
    },
    {
      title: `How to implement ${topic} step by step`,
      body: `Start by defining a narrow outcome. Build one repeatable workflow. Turn the workflow into a documented system. Add automation only after the manual version works. Then measure performance, refine weak points, and scale gradually.`
    },
    {
      title: `Common mistakes with ${topic}`,
      body: `The biggest mistakes are overcomplicating the stack, skipping measurement, publishing thin content, and automating chaos instead of process. ${topic} works best when the underlying system is simple, observable, and repeatable.`
    },
    {
      title: `The long-term opportunity in ${topic}`,
      body: `${topic} is part of a broader shift toward systemized digital production. Operators who build durable assets, distribution systems, and high-quality content around ${topic} are better positioned to grow traffic, revenue, and operational leverage.`
    }
  ];
}

function faqItems(topic) {
  return [
    {
      q: `What is ${topic}?`,
      a: `${topic} is the use of systems, automation, and repeatable workflows to create scalable output and more efficient execution.`
    },
    {
      q: `Why is ${topic} important?`,
      a: `It reduces manual bottlenecks, improves consistency, and creates a foundation for scaling content, operations, and revenue.`
    },
    {
      q: `How do beginners start with ${topic}?`,
      a: `Start small, define one repeatable process, document it, improve it manually, and only then automate the highest-friction steps.`
    }
  ];
}

function buildJsonLd(topic, slug, description) {
  const faq = faqItems(topic);

  return `
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: `${titleCase(topic)} Guide`,
  description,
  url: `${ROOT_URL}/generated/${slug}.html`,
  author: { '@type': 'Organization', name: 'DMF7' },
  publisher: { '@type': 'Organization', name: 'DMF7' },
  mainEntityOfPage: `${ROOT_URL}/generated/${slug}.html`
}, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a
    }
  }))
}, null, 2)}
</script>`;
}

function rebuildSitemap() {
  try {
    execFileSync('/usr/bin/node', [SITEMAP_SCRIPT], { stdio: 'ignore' });
  } catch (_) {}
}

function buildCategoryHub(category) {
  const files = getAllGeneratedFiles().filter(name => {
    const clean = titleCase(
      name.replace(/\.html$/, '').replace(/-\d+$/, '').replace(/-/g, ' ')
    ).toLowerCase();
    return Object.entries(topicMap).some(([topic, cat]) => cat === category && clean.includes(topic.toLowerCase()));
  }).reverse();

  const list = files.slice(0, 60).map(name => {
    const slug = name.replace(/\.html$/, '');
    const label = titleCase(slug.replace(/-\d+$/, '').replace(/-/g, ' '));
    return `<li><a href="/generated/${slug}.html">${label}</a></li>`;
  }).join('\n');

  const title = `${titleCase(category.replace(/-/g, ' '))} Hub | DMF7`;
  const desc = categoryDescriptions[category] || 'Curated topic hub.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="canonical" href="${ROOT_URL}/topics/${category}.html">
  <style>
    body { font-family: Inter, system-ui, sans-serif; background:#0a0a0f; color:#e6e8f2; margin:0; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
    .hero, .card { background:#12121a; border:1px solid #25253a; border-radius:18px; padding:24px; margin-top:18px; }
    h1, h2 { margin-top:0; }
    p, li { color:#a6abc2; line-height:1.7; }
    a { color:#7c82ff; text-decoration:none; }
    ul { padding-left:20px; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1>${titleCase(category.replace(/-/g, ' '))}</h1>
      <p>${desc}</p>
    </section>
    <section class="card">
      <h2>Latest Articles</h2>
      <ul>${list}</ul>
    </section>
  </main>
</body>
</html>`;

  fs.writeFileSync(path.join(TOPICS_DIR, `${category}.html`), html);
}

function buildAllCategoryHubs() {
  const categories = [...new Set(Object.values(topicMap))];
  for (const category of categories) {
    buildCategoryHub(category);
  }
}

function generatePage(topic) {
  const ts = Date.now();
  const slug = slugify(`${topic} ${ts}`);
  const category = getCategory(topic);
  const title = `${titleCase(topic)} Guide (2026) | DMF7`;
  const description = `${titleCase(topic)} explained with strategy, systems, implementation steps, common mistakes, and practical opportunities.`;

  const sections = articleSections(topic).map(section => `
    <section class="card">
      <h2>${section.title}</h2>
      <p>${section.body}</p>
    </section>
  `).join('\n');

  const faq = faqItems(topic).map(item => `
    <details class="faq-item">
      <summary>${item.q}</summary>
      <p>${item.a}</p>
    </details>
  `).join('\n');

  const recentLinks = getRecentLinks(slug, 8);
  const categoryLinks = getCategoryLinks(category, slug, 8);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="canonical" href="${ROOT_URL}/generated/${slug}.html">

  <meta property="og:title" content="${title}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${ROOT_URL}/generated/${slug}.html">
  <meta property="og:description" content="${description}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">

  ${buildJsonLd(topic, slug, description)}

  <style>
    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --surface-2: #171724;
      --border: #25253a;
      --text: #e6e8f2;
      --muted: #a6abc2;
      --accent: #7c82ff;
      --accent-2: #9b6bff;
      --max: 880px;
      --radius: 16px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(124,130,255,0.14), transparent 32%),
        radial-gradient(circle at top right, rgba(155,107,255,0.12), transparent 28%),
        var(--bg);
      color: var(--text);
      line-height: 1.75;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: var(--max); margin: 0 auto; padding: 32px 20px 72px; }
    .hero {
      background: linear-gradient(135deg, rgba(124,130,255,0.16), rgba(155,107,255,0.10));
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 36px 28px;
      margin-bottom: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.22);
    }
    .eyebrow {
      display: inline-block;
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 12px;
    }
    h1 {
      font-size: clamp(2rem, 5vw, 3.4rem);
      line-height: 1.08;
      margin: 0 0 14px;
      letter-spacing: -0.03em;
    }
    .hero p {
      font-size: 1.05rem;
      color: var(--muted);
      margin: 0;
      max-width: 720px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 18px;
      color: var(--muted);
      font-size: 0.92rem;
    }
    .card {
      background: rgba(18,18,26,0.94);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 26px 24px;
      margin-top: 18px;
    }
    h2 {
      font-size: 1.35rem;
      line-height: 1.2;
      margin: 0 0 12px;
      color: #f0f2ff;
    }
    h3 { margin: 0 0 10px; }
    p, li { color: var(--muted); }
    ul { padding-left: 20px; margin: 0; }
    .related-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    .faq-item {
      border-top: 1px solid var(--border);
      padding: 14px 0;
    }
    .faq-item:first-child { border-top: 0; padding-top: 0; }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--text);
      list-style: none;
    }
    summary::-webkit-details-marker { display: none; }
    details p { margin: 10px 0 0; }
    .cta {
      display: grid;
      gap: 12px;
    }
    .capture {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
    }
    .capture input {
      flex: 1 1 220px;
      min-width: 220px;
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 14px;
      font-size: 0.96rem;
    }
    .capture button {
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: white;
      border: 0;
      border-radius: 12px;
      padding: 14px 18px;
      font-weight: 700;
      cursor: pointer;
    }
    .footer-note {
      margin-top: 18px;
      font-size: 0.9rem;
      color: var(--muted);
    }
    @media (max-width: 760px) {
      .related-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="eyebrow">DMF7 Knowledge Layer</div>
      <h1>${titleCase(topic)}</h1>
      <p>${description}</p>
      <div class="meta">
        <span>Published: ${new Date(ts).toISOString()}</span>
        <span>Category: <a href="/topics/${category}.html">${titleCase(category.replace(/-/g, ' '))}</a></span>
        <span>Format: Long-form guide</span>
      </div>
    </section>

    ${sections}

    <section class="card">
      <h2>Explore More</h2>
      <div class="related-grid">
        <div>
          <h3>Recent Pages</h3>
          <ul>${recentLinks}</ul>
        </div>
        <div>
          <h3>More in This Category</h3>
          <ul>${categoryLinks || `<li><a href="/topics/${category}.html">View category hub</a></li>`}</ul>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Frequently Asked Questions</h2>
      ${faq}
    </section>

    <section class="card cta">
      <h2>Get New Strategy Drops</h2>
      <p>Join the DMF7 list to get new system guides, automation ideas, and execution frameworks.</p>
      <form class="capture" onsubmit="return subscribeEmail(event)">
        <input id="emailCapture" type="email" placeholder="Enter your email" required>
        <button type="submit">Subscribe</button>
      </form>
      <div id="subscribeStatus" class="footer-note">This page is part of the DMF7 generated knowledge network.</div>
    </section>
  </main>

  <script>
    async function subscribeEmail(event) {
      event.preventDefault();
      const input = document.getElementById('emailCapture');
      const status = document.getElementById('subscribeStatus');
      try {
        const res = await fetch('${API_URL}/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: input.value,
            source: window.location.pathname
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'subscribe failed');
        status.textContent = 'Subscribed: ' + data.email;
        input.value = '';
      } catch (err) {
        status.textContent = 'Subscription failed';
      }
      return false;
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, `${slug}.html`), html);
  buildAllCategoryHubs();
  rebuildSitemap();
  console.log(`Generated: ${slug}`);
}

const topics = [
  'AI automation business',
  'make money online',
  'task orchestration systems',
  'scaling backend systems',
  'passive income systems',
  'AI SaaS ideas',
  'workflow automation tools',
  'online business models',
  'programmatic SEO systems',
  'content automation strategy',
  'growth systems for founders',
  'digital asset scaling'
];

buildAllCategoryHubs();
rebuildSitemap();

setInterval(() => {
  const topic = topics[Math.floor(Math.random() * topics.length)];
  generatePage(topic);
}, 3000);
