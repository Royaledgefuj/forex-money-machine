const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(base) {
  let slug = base || 'post';
  let i = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.blogPost.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

// Public — powers the /blog listing page.
router.get('/', async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, excerpt: true, authorName: true, publishedAt: true },
    });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Could not load blog posts' });
  }
});

// Admin — full list including drafts, used by the admin dashboard.
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Could not load blog posts' });
  }
});

// Public — single published post by slug, powers /blog/:slug.
router.get('/:slug', async (req, res) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post || !post.published) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Could not load this post' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, excerpt, content, metaDescription, authorName, published } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });

    const slug = await uniqueSlug(slugify(title));
    const isPublished = !!published;
    const post = await prisma.blogPost.create({
      data: {
        slug,
        title,
        excerpt: excerpt || content.slice(0, 160),
        content,
        metaDescription: metaDescription || excerpt || content.slice(0, 160),
        authorName: authorName || undefined,
        published: isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
    });
    await logActivity(`Created blog post "${post.title}"${isPublished ? ' (published)' : ' (draft)'}`);
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: 'Could not create blog post' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Post not found' });

    const { title, excerpt, content, metaDescription, authorName, published } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (excerpt !== undefined) data.excerpt = excerpt;
    if (content !== undefined) data.content = content;
    if (metaDescription !== undefined) data.metaDescription = metaDescription;
    if (authorName !== undefined) data.authorName = authorName;
    if (published !== undefined) {
      data.published = !!published;
      if (published && !existing.published) data.publishedAt = new Date();
      if (!published) data.publishedAt = null;
    }

    const post = await prisma.blogPost.update({ where: { id }, data });
    await logActivity(`Updated blog post "${post.title}"`);
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Could not update blog post' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await prisma.blogPost.delete({ where: { id } });
    await logActivity(`Deleted blog post "${post.title}"`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete blog post' });
  }
});

module.exports = router;
