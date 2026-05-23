const fs = require('fs');

// 1. Process download.html (keep only the download section)
let dlHtml = fs.readFileSync('download.html', 'utf8');

// Find the start and end of the download section
const dlStartStr = '<section class="sec" id="download"';
const dlStartIndex = dlHtml.indexOf(dlStartStr);
const dlEndIndex = dlHtml.indexOf('</section>', dlStartIndex) + '</section>'.length;

// Get everything before the first section (the nav and hero)
// Actually we don't want the hero in download.html. We want just the nav.
const heroStartStr = '<section class="hero" id="top">';
const heroStartIndex = dlHtml.indexOf(heroStartStr);

const headAndNav = dlHtml.substring(0, heroStartIndex);

// Get the footer
const footerStartStr = '<section class="sec eco"';
const footerStartIndex = dlHtml.indexOf(footerStartStr);
const footer = dlHtml.substring(footerStartIndex);

// The download section
const downloadSection = dlHtml.substring(dlStartIndex, dlEndIndex);

// Add a bit of spacing so it's not hidden behind the fixed nav
const newDlHtml = headAndNav + '\n<div style="padding-top: 100px;"></div>\n' + downloadSection + '\n' + footer;

// Update the navigation links in download.html
let finalDlHtml = newDlHtml.replace(/href="#/g, 'href="/#');
// But the download link should stay as-is or go to "#"
finalDlHtml = finalDlHtml.replace('href="/#download"', 'href="#"');
finalDlHtml = finalDlHtml.replace(/<title>.*?<\/title>/, '<title>Download Lume Scan App</title>');

fs.writeFileSync('download.html', finalDlHtml, 'utf8');


// 2. Process index.html (remove the download section)
let idxHtml = fs.readFileSync('index.html', 'utf8');
const idxDlStart = idxHtml.indexOf(dlStartStr);
const idxDlEnd = idxHtml.indexOf('</section>', idxDlStart) + '</section>'.length;

idxHtml = idxHtml.substring(0, idxDlStart) + idxHtml.substring(idxDlEnd);

// Update nav link
idxHtml = idxHtml.replace('href="#download"', 'href="/download.html"');

// 3. Update the cards in index.html
// Replace Emojis with the newly generated images and add uniform layout classes/styles
const cardBlockTarget = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px">`;
const oldCard1 = `<div style="padding:20px;background:rgba(6,182,212,0.04);border:1px solid rgba(6,182,212,0.08);border-radius:14px">
            <div style="font-size:1.4rem;margin-bottom:8px">dY?</div>
            <h4 style="font-size:0.9rem;margin-bottom:6px">Consumer Mode</h4>`;
const newCard1 = `<div style="padding:20px;background:rgba(6,182,212,0.04);border:1px solid rgba(6,182,212,0.08);border-radius:14px;display:flex;flex-direction:column;height:100%">
            <img src="img/mode-consumer.png" alt="Consumer Mode" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:16px">
            <h4 style="font-size:0.9rem;margin-bottom:6px">Consumer Mode</h4>`;

const oldCard2 = `<div style="padding:20px;background:rgba(6,182,212,0.04);border:1px solid rgba(6,182,212,0.08);border-radius:14px">
            <div style="font-size:1.4rem;margin-bottom:8px">dY" </div>
            <h4 style="font-size:0.9rem;margin-bottom:6px">Mechanic Mode</h4>`;
const newCard2 = `<div style="padding:20px;background:rgba(6,182,212,0.04);border:1px solid rgba(6,182,212,0.08);border-radius:14px;display:flex;flex-direction:column;height:100%">
            <img src="img/mode-mechanic.png" alt="Mechanic Mode" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:16px">
            <h4 style="font-size:0.9rem;margin-bottom:6px">Mechanic Mode</h4>`;

const oldCard3 = `<div style="padding:20px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.08);border-radius:14px">
            <div style="font-size:1.4rem;margin-bottom:8px">dY",</div>
            <h4 style="font-size:0.9rem;margin-bottom:6px">Print &amp; Download</h4>`;
const newCard3 = `<div style="padding:20px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.08);border-radius:14px;display:flex;flex-direction:column;height:100%">
            <img src="img/mode-print.png" alt="Print & Download" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:16px">
            <h4 style="font-size:0.9rem;margin-bottom:6px">Print &amp; Download</h4>`;

// Apply relaxed regex replacements for the cards to bypass terminal encoding garbage
idxHtml = idxHtml.replace(/<div style="padding:20px;background:rgba\(6,182,212,0\.04\);border:1px solid rgba\(6,182,212,0\.08\);border-radius:14px">\s*<div style="font-size:1\.4rem;margin-bottom:8px">[^<]+<\/div>\s*<h4 style="font-size:0\.9rem;margin-bottom:6px">Consumer Mode<\/h4>/, newCard1);

idxHtml = idxHtml.replace(/<div style="padding:20px;background:rgba\(6,182,212,0\.04\);border:1px solid rgba\(6,182,212,0\.08\);border-radius:14px">\s*<div style="font-size:1\.4rem;margin-bottom:8px">[^<]+<\/div>\s*<h4 style="font-size:0\.9rem;margin-bottom:6px">Mechanic Mode<\/h4>/, newCard2);

idxHtml = idxHtml.replace(/<div style="padding:20px;background:rgba\(245,158,11,0\.04\);border:1px solid rgba\(245,158,11,0\.08\);border-radius:14px">\s*<div style="font-size:1\.4rem;margin-bottom:8px">[^<]+<\/div>\s*<h4 style="font-size:0\.9rem;margin-bottom:6px">Print &amp; Download<\/h4>/, newCard3);

fs.writeFileSync('index.html', idxHtml, 'utf8');
console.log('Successfully processed download.html and index.html');
