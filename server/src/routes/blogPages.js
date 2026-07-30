const express = require('express');
const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');

const router = express.Router();

const SITE_URL = 'https://www.vrcommercesolutions.com';
const listTemplate = fs.readFileSync(path.join(__dirname, '..', 'templates', 'blog-list.html'), 'utf8');
const postTemplate = fs.readFileSync(path.join(__dirname, '..', 'templates', 'blog-post.html'), 'utf8');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Blank-line-separated paragraphs; each paragraph's own text is escaped, so
// posts can never inject markup into the surrounding page.
function contentToHtml(content) {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

router.get('/', async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, excerpt: true, authorName: true, publishedAt: true },
    });

    const postsHtml = posts.length
      ? posts.map((p) => `
        <a class="blog-post-card" href="/blog/${escapeHtml(p.slug)}">
          <h2>${escapeHtml(p.title)}</h2>
          <p>${escapeHtml(p.excerpt)}</p>
          <span class="blog-post-meta">By ${escapeHtml(p.authorName)} · ${formatDate(p.publishedAt)}</span>
        </a>`).join('\n')
      : '<p class="blog-empty">No posts published yet — check back soon.</p>';

    res.send(listTemplate.replace('{{POSTS_HTML}}', postsHtml));
  } catch (err) {
    res.status(500).send('Could not load the blog right now.');
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post || !post.published) return res.status(404).send('Post not found.');

    const canonicalUrl = `${SITE_URL}/blog/${post.slug}`;
    const html = postTemplate
      .replace(/{{TITLE}}/g, escapeHtml(post.title))
      .replace(/{{TITLE_JSON}}/g, JSON.stringify(post.title))
      .replace(/{{META_DESCRIPTION}}/g, escapeHtml(post.metaDescription))
      .replace(/{{META_DESCRIPTION_JSON}}/g, JSON.stringify(post.metaDescription))
      .replace(/{{CANONICAL_URL}}/g, canonicalUrl)
      .replace(/{{PUBLISHED_DATE_ISO}}/g, new Date(post.publishedAt).toISOString())
      .replace(/{{PUBLISHED_DATE_DISPLAY}}/g, formatDate(post.publishedAt))
      .replace(/{{AUTHOR}}/g, escapeHtml(post.authorName))
      .replace('{{CONTENT_HTML}}', contentToHtml(post.content));

    res.send(html);
  } catch (err) {
    res.status(500).send('Could not load this post right now.');
  }
});

module.exports = router;
