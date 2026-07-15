// Forex Money Machine Academy — homepage interactions

document.getElementById('year').textContent = new Date().getFullYear();

// ---- Next batch date (always the 1st of the upcoming month) ----
const nextBatchBadge = document.getElementById('nextBatchBadge');
if (nextBatchBadge) {
  const now = new Date();
  const nextBatch = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  nextBatchBadge.textContent = `Next batch starts ${nextBatch.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

// ---- Mobile nav toggle ----
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

// ---- Animated stat counters ----
const stats = document.querySelectorAll('.stat-num');
const animateStat = (el) => {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.dataset.suffix || '';
  const duration = 1600;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString() + suffix;
  };
  requestAnimationFrame(step);
};
const statObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      animateStat(entry.target);
      statObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });
stats.forEach((s) => statObserver.observe(s));

// ---- Reveal on scroll ----
const revealTargets = document.querySelectorAll('.about-card, .program-card, .broker-card, .testimonial, .tool-item, .community-item');
revealTargets.forEach((el) => { el.style.opacity = 0; el.style.transform = 'translateY(18px)'; el.style.transition = 'opacity .6s ease, transform .6s ease'; });
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = 1;
      entry.target.style.transform = 'translateY(0)';
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
revealTargets.forEach((el) => revealObserver.observe(el));

// ---- Hero animated candlestick chart ----
(function heroChart() {
  const canvas = document.getElementById('chartCanvas');
  const ctx = canvas.getContext('2d');
  let width, height, dpr;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Generate candle data (random walk)
  const candleCount = 70;
  let candles = [];
  let price = 100;
  for (let i = 0; i < candleCount; i++) {
    const open = price;
    const change = (Math.random() - 0.48) * 6;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    candles.push({ open, close, high, low });
    price = close;
  }

  // Line series (smooth market line drawn above candles)
  function drawLinePath(offsetY, points) {
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y + offsetY);
      else ctx.lineTo(p.x, p.y + offsetY);
    });
  }

  let frame = 0;

  function draw() {
    frame += 1;
    ctx.clearRect(0, 0, width, height);

    const gap = width / candleCount;
    const candleW = Math.max(gap * 0.5, 2);

    // normalize prices to canvas height
    const prices = candles.flatMap((c) => [c.high, c.low]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const padTop = height * 0.18;
    const padBottom = height * 0.3;
    const usable = height - padTop - padBottom;
    const scaleY = (v) => padTop + usable - ((v - min) / range) * usable;

    const drift = (frame * 0.15) % gap;

    // gridlines
    ctx.strokeStyle = 'rgba(212,175,55,0.06)';
    ctx.lineWidth = 1;
    for (let gy = 0; gy < 5; gy++) {
      const y = (height / 5) * gy;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const linePoints = [];

    candles.forEach((c, i) => {
      const x = i * gap - drift;
      if (x < -gap || x > width + gap) return;
      const yOpen = scaleY(c.open);
      const yClose = scaleY(c.close);
      const yHigh = scaleY(c.high);
      const yLow = scaleY(c.low);
      const up = c.close >= c.open;
      ctx.strokeStyle = up ? 'rgba(55,201,138,0.55)' : 'rgba(226,85,79,0.55)';
      ctx.fillStyle = up ? 'rgba(55,201,138,0.28)' : 'rgba(226,85,79,0.28)';
      ctx.lineWidth = 1;

      // wick
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(Math.abs(yClose - yOpen), 1.5);
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);

      linePoints.push({ x, y: (yHigh + yLow) / 2 });
    });

    // glowing market line overlay
    if (linePoints.length > 1) {
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, 'rgba(212,175,55,0)');
      grad.addColorStop(0.5, 'rgba(212,175,55,0.9)');
      grad.addColorStop(1, 'rgba(212,175,55,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(212,175,55,0.6)';
      ctx.shadowBlur = 8;
      drawLinePath(0, linePoints);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // occasionally advance the random walk to keep chart alive
    if (frame % 90 === 0) {
      candles.shift();
      const last = candles[candles.length - 1];
      const open = last.close;
      const change = (Math.random() - 0.48) * 6;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 3;
      const low = Math.min(open, close) - Math.random() * 3;
      candles.push({ open, close, high, low });
    }

    requestAnimationFrame(draw);
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion) requestAnimationFrame(draw);
  else draw();
})();

// ---- Live market ticker ----
async function loadTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  try {
    const quotes = await (await fetch(`${API_BASE}/market-quotes`)).json();
    const itemsHtml = quotes.map((q) => {
      if (q.price == null) return `<span>${q.label} <em>—</em></span>`;
      const priceStr = q.price.toLocaleString(undefined, { minimumFractionDigits: q.decimals, maximumFractionDigits: q.decimals });
      const arrow = q.up ? '▲' : '▼';
      const cls = q.up ? 'up' : 'down';
      return `<span>${q.label} <em class="${cls}">${priceStr} ${arrow}</em></span>`;
    }).join('');
    track.innerHTML = itemsHtml + itemsHtml;
  } catch (err) {
    console.error('Ticker load failed:', err);
  }
}
loadTicker();
setInterval(loadTicker, 30000);

// ---- Sticky header shadow on scroll ----
const header = document.getElementById('siteHeader');
window.addEventListener('scroll', () => {
  if (window.scrollY > 12) header.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';
  else header.style.boxShadow = 'none';
});
