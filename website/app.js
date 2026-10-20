// Header shadow on scroll
const header = document.querySelector('[data-header]');
const onScroll = () => {
  header.classList.toggle('scrolled', window.scrollY > 8);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Smooth-scroll offset for the sticky header
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href');
    if (id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const y = target.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top: y, behavior: 'smooth' });
  });
});

// ---------- Interactive Bento Grid ----------
// 1. Annotate chips
const annChips = document.querySelectorAll('#annChips .chip');
const annDemo = document.querySelector('#annDemo');
if (annChips.length && annDemo) {
  annChips.forEach((c) => {
    c.addEventListener('click', () => {
      annChips.forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      annDemo.querySelectorAll('span[data-k]').forEach((s) => s.classList.remove('show'));
      const t = annDemo.querySelector(`span[data-k="${c.dataset.k}"]`);
      if (t) t.classList.add('show');
    });
  });
}

// 2. Redaction toggle
const rdSeg = document.querySelectorAll('#rdSeg button');
const rdBars = [document.querySelector('#rdBar'), document.querySelector('#rdBar2')];
const rdTag = document.querySelector('#rdTag');
if (rdSeg.length && rdTag) {
  const setRedaction = (m) => {
    rdSeg.forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    rdBars.forEach((bar) => {
      if (bar) bar.className = m === 'true' ? 'bar' : 'ov';
    });
    rdTag.className = 'tag ' + (m === 'true' ? 'ok' : 'bad');
    rdTag.textContent = m === 'true' ? 'REMOVED' : 'RECOVERABLE';
  };
  rdSeg.forEach((b) => {
    b.addEventListener('click', () => setRedaction(b.dataset.m));
  });
  setRedaction('true');
}

// 3. Signature toggle
const sgBox = document.querySelector('#sgBox');
const sgButtons = document.querySelectorAll('#sgSeg button');
if (sgBox && sgButtons.length) {
  const drawSvg = '<svg viewBox="0 0 200 60" fill="none" stroke="#16255c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="p" d="M10 42c14-34 24-38 20-14-3 18 11 10 22-8 7-11 11-4 7 8s11 10 22-4c8-9 11 0 16 0s11-12 18-12c11 0 4 22 21 11 9-6 11-12 16-12"/></svg>';
  const setSig = (m) => {
    sgButtons.forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'draw') {
      sgBox.innerHTML = drawSvg;
    } else if (m === 'type') {
      sgBox.innerHTML = '<span class="sigtype">Alex Morgan</span>';
    } else {
      sgBox.innerHTML = '<span style="font-size:12.5px;font-weight:700;color:var(--muted)">Drop an image · background removed automatically</span>';
    }
  };
  sgButtons.forEach((b) => {
    b.addEventListener('click', () => setSig(b.dataset.m));
  });
  setSig('draw');
}

// 4. Convert format switcher
const cvButtons = document.querySelectorAll('#cvSeg button');
cvButtons.forEach((b) => {
  b.addEventListener('click', () => {
    cvButtons.forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  });
});
const cvChips = document.querySelectorAll('#cvChips .chip');
const cvFile = document.querySelector('#cvFile');
if (cvChips.length && cvFile) {
  cvChips.forEach((c) => {
    c.addEventListener('click', () => {
      cvChips.forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      const t = c.textContent.trim();
      cvFile.textContent = t;
      cvFile.className = 'file pick ' + (t === 'PPTX' ? 'pptx' : t === 'DOCX' ? 'docx' : 'png');
    });
  });
}
