const fs = require('fs');

let idxHtml = fs.readFileSync('index.html', 'utf8');

// 1. Update the Hero heading
idxHtml = idxHtml.replace(
    '<h1>The <span class="gr">$3,500 Scan Tool</span><br>From $9.99.</h1>',
    '<h1><span class="gr">Better than a $5,500 Scan Tool.</span><br>From $9.99.</h1>'
);

// 2. Update the crossed-out price in hero-price and make it look better
idxHtml = idxHtml.replace(
    '<span class="was">$3,500</span>',
    '<span class="was" style="color:rgba(255,255,255,0.3); text-decoration-color:rgba(239,68,68,0.7); font-size:24px">$5,500</span>'
);

// 3. Update the CTA button to remove emoji
// It looks like: <a href="https://lumeauto.tech/order" class="cta-btn">dY"  Get Lume Scan</a>
// We will just match the class="cta-btn"> part up to Get Lume Scan
idxHtml = idxHtml.replace(
    /<a href="https:\/\/lumeauto\.tech\/order" class="cta-btn">[^<]+Get Lume Scan<\/a>/,
    '<a href="https://lumeauto.tech/order" class="cta-btn">Get Lume Scan</a>'
);

// 4. Update the hero-trust emojis
// We will replace all <span>o" with <span>
idxHtml = idxHtml.replace(/<span>[^<]+Software is yours to keep<\/span>/, '<span>Software is yours to keep</span>');
idxHtml = idxHtml.replace(/<span>[^<]+Updates included<\/span>/, '<span>Updates included</span>');
idxHtml = idxHtml.replace(/<span>[^<]+7-day satisfaction guarantee<\/span>/, '<span>7-day satisfaction guarantee</span>');

// 5. Update the $180+ savings to $2,880+
idxHtml = idxHtml.replace(
    '<div class="stat"><div class="stat-val">$180+</div><div class="stat-lbl">Annual Savings</div></div>',
    '<div class="stat"><div class="stat-val">$2,880+</div><div class="stat-lbl">Annual Savings</div></div>'
);

// 6. Update the $1.99/mo service to note First 100 Founders
idxHtml = idxHtml.replace(
    '<div class="stat"><div class="stat-val">$1.99</div><div class="stat-lbl">/mo Service</div></div>',
    '<div class="stat"><div class="stat-val" style="position:relative">$1.99<span style="position:absolute;top:-10px;right:-5px;font-size:9px;color:var(--accent);background:rgba(6,182,212,0.15);padding:2px 4px;border-radius:4px;font-weight:700">FOUNDERS</span></div><div class="stat-lbl">/mo Service</div></div>'
);

// 7. Update the Features heading
idxHtml = idxHtml.replace(
    '<h2>Everything a $3,500 scan tool does.<br>For less than a tank of gas.</h2>',
    '<h2>Better than a $5,500 scan tool.<br>For less than a tank of gas.</h2>'
);

// 8. Find any remaining instances of 3,500 and replace with 5,500 (like in the comparison table)
idxHtml = idxHtml.replace(/\$3,500\+/g, '$5,500+');

fs.writeFileSync('index.html', idxHtml, 'utf8');
console.log('Successfully applied textual edits to index.html');
