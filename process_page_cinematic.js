const fs = require('fs');

// ----------------------------------------------------
// 1. UPDATE index.html (Move FAQ)
// ----------------------------------------------------
let idxHtml = fs.readFileSync('index.html', 'utf8');

// Find FAQ section
const faqStart = idxHtml.indexOf('<section class="sec" id="faq"');
const faqEnd = idxHtml.indexOf('</section>', faqStart) + '</section>'.length;
const faqSection = idxHtml.substring(faqStart, faqEnd);

// Remove FAQ from current location
idxHtml = idxHtml.substring(0, faqStart) + idxHtml.substring(faqEnd);

// Find the FINAL CTA to insert FAQ before it
const ctaIndex = idxHtml.indexOf('<!-- FINAL CTA -->');
if (ctaIndex !== -1) {
    idxHtml = idxHtml.substring(0, ctaIndex) + faqSection + '\n  \n    ' + idxHtml.substring(ctaIndex);
}

fs.writeFileSync('index.html', idxHtml, 'utf8');


// ----------------------------------------------------
// 2. UPDATE download.html (Cinematic Redesign)
// ----------------------------------------------------
let dlHtml = fs.readFileSync('download.html', 'utf8');

// Find the download section body
const dlContentStart = dlHtml.indexOf('<div style="position:relative;z-index:1;max-width:600px;margin:0 auto;text-align:center">');
const dlContentEnd = dlHtml.indexOf('</section>', dlContentStart);
const dlContent = dlHtml.substring(dlContentStart, dlContentEnd);

// Find nav
const navStart = dlHtml.indexOf('<nav class="nav">');
const navEnd = dlHtml.indexOf('</nav>', navStart) + '</nav>'.length;
const nav = dlHtml.substring(navStart, navEnd);

// Find footer
const footerStart = dlHtml.indexOf('<section class="sec eco"');
const footer = dlHtml.substring(footerStart);

const cinematicHero = `
  <section class="hero" style="height:auto; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:120px 24px 60px; position:relative; overflow:hidden;">
    <div style="position:absolute; top:0; left:50%; transform:translateX(-50%); width:800px; height:800px; background:radial-gradient(circle,rgba(6,182,212,0.1) 0%,transparent 60%); pointer-events:none;"></div>
    
    <div style="text-align:center; max-width:800px; margin-bottom:60px; position:relative; z-index:2;">
      <div class="sec-label">Native Android Experience</div>
      <h1 style="font-size:3.5rem; font-weight:800; letter-spacing:-1px; line-height:1.1; margin-bottom:24px;">Your Hardware.<br><span style="color:var(--accent);">Unleashed.</span></h1>
      <p style="font-size:1.1rem; color:rgba(255,255,255,0.6); max-width:600px; margin:0 auto;">Download the official Lume Scan APK directly. No app store delays, no subscription bloatware. Pure, unadulterated diagnostic power.</p>
    </div>

    <div style="position:relative; z-index:2; width:100%; max-width:600px; background:rgba(12,16,24,0.8); backdrop-filter:blur(20px); border:1px solid rgba(6,182,212,0.2); border-radius:24px; padding:40px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
      ${dlContent.replace('<div class="sec-label">Download</div>', '').replace('<h2>Get the Android App.</h2>', '<h2 style="margin-bottom:8px;font-size:1.8rem;">Verify License</h2>').replace('<p class="sec-sub" style="margin-bottom:24px">Native BLE + WiFi OBD-II connectivity. Direct APK ?" no Play Store needed.</p>', '')}
    </div>
  </section>

  <section class="sec" style="border-top:1px solid var(--border); padding:80px 24px; background:linear-gradient(to bottom, var(--bg), #030408);">
    <div style="max-width:1100px; margin:0 auto;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:24px;">
        
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:16px; padding:24px; display:flex; flex-direction:column; height:100%;">
          <img src="img/dl_native.png" alt="Native Android" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:20px;">
          <h4 style="font-size:1.1rem; font-weight:700; margin-bottom:10px;">Hardware Native</h4>
          <p style="font-size:0.85rem; color:rgba(255,255,255,0.5); line-height:1.6;">Lume Scan is built from the ground up to communicate directly with your BLE or WiFi OBD-II hardware, bypassing slow generic drivers.</p>
        </div>

        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:16px; padding:24px; display:flex; flex-direction:column; height:100%;">
          <img src="img/dl_sideload.png" alt="Sideload Freedom" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:20px;">
          <h4 style="font-size:1.1rem; font-weight:700; margin-bottom:10px;">Absolute Freedom</h4>
          <p style="font-size:0.85rem; color:rgba(255,255,255,0.5); line-height:1.6;">No app store guidelines or regional restrictions. By sideloading the APK, you get raw, unfiltered access to your vehicle's systems.</p>
        </div>

        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:16px; padding:24px; display:flex; flex-direction:column; height:100%;">
          <img src="img/dl_signature.png" alt="Cryptographic Signature" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:20px;">
          <h4 style="font-size:1.1rem; font-weight:700; margin-bottom:10px;">Cryptographically Verified</h4>
          <p style="font-size:0.85rem; color:rgba(255,255,255,0.5); line-height:1.6;">Every APK payload is cryptographically signed by DarkWave Studios. If the hash doesn't match, Android will prevent installation.</p>
        </div>

      </div>
    </div>
  </section>
`;

// Find the most recent PNG file names in case they have timestamps
const imgDir = fs.readdirSync('img');
const nativeImg = imgDir.find(f => f.startsWith('dl_native'));
const sideloadImg = imgDir.find(f => f.startsWith('dl_sideload'));
const signatureImg = imgDir.find(f => f.startsWith('dl_signature'));

const finalCinematicHero = cinematicHero
    .replace('img/dl_native.png', `img/${nativeImg}`)
    .replace('img/dl_sideload.png', `img/${sideloadImg}`)
    .replace('img/dl_signature.png', `img/${signatureImg}`);

const newDlHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download Lume Scan | Professional OBD-II Engine</title>
  <link rel="stylesheet" href="styles.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
</head>
<body>
  ${nav}
  ${finalCinematicHero}
  ${footer}
</body>
</html>
`;

fs.writeFileSync('download.html', newDlHtml, 'utf8');

console.log('Successfully processed files');
