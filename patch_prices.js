const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const before = html.length;

// 1. Price cards — add Founders Club tier badge to $9.99 and $1.99 cards
html = html.replace(
  /(<div style="padding:16px 24px;border-radius:12px;background:rgba\(6,182,212,0\.06\);border:1px solid rgba\(6,182,212,0\.12\)">\s*<div style="font-size:1\.8rem;font-weight:800;color:var\(--accent2\);font-family:var\(--mono\)">\$9\.99<\/div>\s*<div style="font-size:0\.7rem;color:rgba\(255,255,255,0\.35\);margin-top:4px">Founders price<\/div>\s*<\/div>\s*<div style="padding:16px 24px;border-radius:12px;background:rgba\(6,182,212,0\.06\);border:1px solid rgba\(6,182,212,0\.12\)">\s*<div style="font-size:1\.8rem;font-weight:800;color:var\(--accent\);font-family:var\(--mono\)">\$1\.99<\/div>\s*<div style="font-size:0\.7rem;color:rgba\(255,255,255,0\.35\);margin-top:4px">\/mo for diagnostics<\/div>\s*<\/div>)/,
  `<div style="padding:16px 24px;border-radius:12px;background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.12);position:relative">
            <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(6,182,212,0.2);border:1px solid rgba(6,182,212,0.3);border-radius:4px;font-size:9px;font-weight:700;color:var(--accent);padding:2px 8px;letter-spacing:0.05em">FOUNDERS CLUB &middot; Users 1&ndash;100</div>
            <div style="font-size:1.8rem;font-weight:800;color:var(--accent2);font-family:var(--mono)">$9.99</div>
            <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);margin-top:4px">one-time license</div>
          </div>
          <div style="padding:16px 24px;border-radius:12px;background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.12);position:relative">
            <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(6,182,212,0.2);border:1px solid rgba(6,182,212,0.3);border-radius:4px;font-size:9px;font-weight:700;color:var(--accent);padding:2px 8px;letter-spacing:0.05em">FOUNDERS CLUB &middot; Users 1&ndash;100</div>
            <div style="font-size:1.8rem;font-weight:800;color:var(--accent);font-family:var(--mono)">$1.99</div>
            <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);margin-top:4px">/mo service fee</div>
          </div>`
);

// 2. Add tier footnote before the "Proudly made" paragraph
html = html.replace(
  `<p style="font-size:0.8rem;color:rgba(255,255,255,0.25);font-style:italic">`,
  `<p style="font-size:0.68rem;color:rgba(255,255,255,0.2);margin-bottom:12px">*Founders Club: $9.99 + $1.99/mo (users 1&ndash;100) &middot; Early Adopter: $19.99 + $2.49/mo (101&ndash;500) &middot; Standard: $39.99 + $4.99/mo &middot; Own Outright: $249 one-time. Tier locked at signup.</p>\n        <p style="font-size:0.8rem;color:rgba(255,255,255,0.25);font-style:italic">`
);

// 3. CTA — update subtext and add footnote
html = html.replace(
  `<p class="sec-sub" style="margin:16px auto 40px">42 signals. Predictive maintenance. Fuel coaching. From $9.99 + $1.99/mo. All updates included.</p>
    <a href="https://lumeauto.tech/order" class="cta-btn">🔧 Get Lume Scan — From $9.99</a>
    <div class="hero-trust" style="margin-top:20px"><span>✓ Software is yours to keep</span><span>✓ 7-day satisfaction guarantee</span><span>✓ Updates included</span></div>`,
  `<p class="sec-sub" style="margin:16px auto 24px">42 signals. Predictive maintenance. Fuel coaching. All updates included.</p>
    <a href="https://lumeauto.tech/order" class="cta-btn">🔧 Get Lume Scan — From $9.99*</a>
    <div class="hero-trust" style="margin-top:20px"><span>✓ Software is yours to keep</span><span>✓ 7-day satisfaction guarantee</span><span>✓ Updates included</span></div>
    <p style="font-size:0.68rem;color:rgba(255,255,255,0.25);margin-top:16px">*Founders Club $9.99 + $1.99/mo (users 1&ndash;100) &middot; Early Adopter $19.99 + $2.49/mo (101&ndash;500) &middot; Standard $39.99 + $4.99/mo &middot; Own Outright $249 one-time</p>`
);

fs.writeFileSync('index.html', html, 'utf8');
console.log(`Done. File went from ${before} to ${html.length} bytes (+${html.length - before}).`);
