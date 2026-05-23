const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const regex = /<div style="display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">[\s\S]*?<div style="font-size:2\.2rem;font-weight:800;font-family:var\(--mono\)"><span class="gr">\$2,739<\/span><\/div>\s*<\/div>\s*<\/div>/;

const replacement = `<div style="background:rgba(0,0,0,0.3); border-radius:12px; padding:16px; display:flex; align-items:center; justify-content:center; gap:12px; margin: 16px 0 24px; border:1px solid rgba(255,255,255,0.03);">
            <div style="text-align:center; flex:1;">
              <div style="font-size:0.7rem; color:rgba(255,255,255,0.4); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Fuel savings</div>
              <div style="font-size:1.5rem; font-weight:700; color:var(--accent2); font-family:var(--mono);">$328</div>
            </div>
            <div style="font-size:1.4rem; color:rgba(255,255,255,0.15); font-weight:300;">+</div>
            <div style="text-align:center; flex:1;">
              <div style="font-size:0.7rem; color:rgba(255,255,255,0.4); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Repair avoided</div>
              <div style="font-size:1.5rem; font-weight:700; color:var(--accent); font-family:var(--mono);">$2,411</div>
            </div>
          </div>

          <div style="position:relative; border-top:1px dashed rgba(6,182,212,0.25); padding-top:24px; margin-bottom:20px; text-align:center;">
            <div style="position:absolute; top:-16px; left:50%; transform:translateX(-50%); background:var(--bg); width:32px; height:32px; border-radius:50%; border:1px solid rgba(6,182,212,0.3); display:flex; align-items:center; justify-content:center; color:var(--accent); font-size:1.2rem; font-weight:700; box-shadow:0 0 10px rgba(0,0,0,0.5);">=</div>
            <div style="font-size:0.75rem; color:rgba(255,255,255,0.5); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Total Saved</div>
            <div style="font-size:2.8rem; font-weight:800; font-family:var(--mono); line-height:1;"><span class="gr">$2,739</span></div>
          </div>`;

if (regex.test(html)) {
    html = html.replace(regex, replacement);
    fs.writeFileSync('index.html', html, 'utf8');
    console.log('Successfully replaced layout.');
} else {
    console.log('Regex match failed.');
}
