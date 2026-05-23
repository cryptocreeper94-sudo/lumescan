const fs = require('fs');

// 1. UPDATE CSS
let css = fs.readFileSync('styles.css', 'utf8');

// Add modal CSS at the end
const modalCss = `
/* MODAL SYSTEM */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  padding: 24px;
}
.modal-overlay.active {
  opacity: 1;
  pointer-events: auto;
}
.modal-box {
  background: rgba(12, 16, 24, 0.9);
  border: 1px solid rgba(6, 182, 212, 0.2);
  border-radius: 16px;
  max-width: 500px;
  width: 100%;
  padding: 32px;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  position: relative;
}
.modal-overlay.active .modal-box {
  transform: translateY(0) scale(1);
}
.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
  transition: color 0.2s;
}
.modal-close:hover {
  color: var(--accent);
}
.modal-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--accent);
  margin-bottom: 12px;
}
.modal-body {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
}
`;

if (!css.includes('.modal-overlay')) {
    css += '\n' + modalCss;
}

// Adjust hero-content padding
css = css.replace('.hero-content{position:relative;z-index:2;text-align:center;max-width:700px;padding:0 24px}', '.hero-content{position:relative;z-index:2;text-align:center;max-width:700px;padding:80px 24px 0}');

fs.writeFileSync('styles.css', css, 'utf8');

// 2. UPDATE HTML
let idxHtml = fs.readFileSync('index.html', 'utf8');

// Remove nav CTA
idxHtml = idxHtml.replace('<a href="https://lumeauto.tech/order" class="nav-cta">Get Lume Scan</a>\n  </nav>', '</nav>');

// Insert Diagnostics + Keys badge below h1
idxHtml = idxHtml.replace(
    '<h1><span class="gr">Better than a $5,500 Scan Tool.</span><br>From $9.99.</h1>',
    '<h1><span class="gr">Better than a $5,500 Scan Tool.</span><br>From $9.99.</h1>\n      <span class="tag" style="background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.25);color:var(--accent);padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:24px">Diagnostics + Keys</span>'
);

// Remove .hero-price completely
idxHtml = idxHtml.replace(
    /      <div class="hero-price">\s*<span class="now">From \$9\.99<\/span>\s*<span class="was" style="color:rgba\(255,255,255,0\.3\); text-decoration-color:rgba\(239,68,68,0\.7\); font-size:24px">\$5,500<\/span>\s*<span class="tag">Diagnostics \+ Keys<\/span>\s*<\/div>\n/,
    ''
);

// Modify .hero-trust to be clickable
idxHtml = idxHtml.replace(
    '<span>Software is yours to keep</span>',
    '<span style="cursor:pointer;border-bottom:1px dashed rgba(255,255,255,0.3);padding-bottom:2px" onclick="openModal(\'modal-software\')">Software is yours to keep</span>'
);
idxHtml = idxHtml.replace(
    '<span>Updates included</span>',
    '<span style="cursor:pointer;border-bottom:1px dashed rgba(255,255,255,0.3);padding-bottom:2px" onclick="openModal(\'modal-updates\')">Updates included</span>'
);
idxHtml = idxHtml.replace(
    '<span>7-day satisfaction guarantee</span>',
    '<span style="cursor:pointer;border-bottom:1px dashed rgba(255,255,255,0.3);padding-bottom:2px" onclick="openModal(\'modal-guarantee\')">7-day satisfaction guarantee</span>'
);

// Add Modals HTML and JS before </body>
const modalsHtml = `
  <!-- MODAL SYSTEM -->
  <div class="modal-overlay" id="global-modal" onclick="closeModal(event)">
    <div class="modal-box" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div class="modal-title" id="modal-title"></div>
      <div class="modal-body" id="modal-body"></div>
    </div>
  </div>

  <script>
    const modalData = {
      'modal-software': {
        title: 'Perpetual License',
        body: 'When you purchase Lume Scan, the core 42-signal diagnostic engine is yours forever. No arbitrary lockouts, no forced upgrades. We believe professional tools should be owned, not just rented.'
      },
      'modal-updates': {
        title: 'Continuous Evolution',
        body: 'The automotive landscape changes rapidly. Your Lume Scan software includes over-the-air (OTA) payload updates, ensuring your diagnostic definitions, predictive algorithms, and Mode 06 capabilities are always state-of-the-art.'
      },
      'modal-guarantee': {
        title: 'Risk-Free Trial',
        body: 'We are confident in our engineering. Try Lume Scan for 7 days on your own vehicles. If the 42-signal engine doesn\\'t immediately prove its value over generic code readers, we will refund your software purchase—no questions asked.'
      }
    };

    function openModal(id) {
      const data = modalData[id];
      if (data) {
        document.getElementById('modal-title').innerText = data.title;
        document.getElementById('modal-body').innerText = data.body;
        document.getElementById('global-modal').classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeModal(event) {
      document.getElementById('global-modal').classList.remove('active');
      document.body.style.overflow = '';
    }
  </script>
`;

if (!idxHtml.includes('global-modal')) {
    idxHtml = idxHtml.replace('</body>', modalsHtml + '\n</body>');
}

fs.writeFileSync('index.html', idxHtml, 'utf8');

console.log('Successfully updated HTML and CSS for modals and hero cleanup');
