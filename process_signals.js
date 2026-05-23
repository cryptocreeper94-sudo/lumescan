const fs = require('fs');

let idxHtml = fs.readFileSync('index.html', 'utf8');

// Find the most recent PNG file names in case they have timestamps
const imgDir = fs.readdirSync('img');
const tpImg = imgDir.find(f => f.startsWith('signal_throughput'));
const prImg = imgDir.find(f => f.startsWith('signal_process'));
const fsImg = imgDir.find(f => f.startsWith('signal_flow'));
const slImg = imgDir.find(f => f.startsWith('signal_lifecycle'));

const oldCard1 = /<div style="padding:28px;border-radius:16px;background:rgba\(6,182,212,0\.04\);border:1px solid \s*rgba\(6,182,212,0\.12\);position:relative;overflow:hidden">\s*<div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient\(circle,rgba\(6\s*,182,212,0\.15\),transparent 70%\);pointer-events:none"><\/div>\s*<div style="font-size:2rem;margin-bottom:12px">[^<]+<\/div>\s*<h3 style="color:var\(--accent2\);font-size:1\.1rem;margin-bottom:8px">Throughput Base<\/h3>/m;

const newCard1 = `<div style="padding:28px;border-radius:16px;background:rgba(6,182,212,0.04);border:1px solid rgba(6,182,212,0.12);position:relative;overflow:hidden;display:flex;flex-direction:column;height:100%">
            <div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient(circle,rgba(6,182,212,0.15),transparent 70%);pointer-events:none"></div>
            <img src="img/${tpImg}" alt="Throughput Base" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3 style="color:var(--accent2);font-size:1.1rem;margin-bottom:8px">Throughput Base</h3>`;

const oldCard2 = /<div style="padding:28px;border-radius:16px;background:rgba\(6,182,212,0\.04\);border:1px solid \s*rgba\(6,182,212,0\.12\);position:relative;overflow:hidden">\s*<div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient\(circle,rgba\(6\s*,182,212,0\.15\),transparent 70%\);pointer-events:none"><\/div>\s*<div style="font-size:2rem;margin-bottom:12px">[^<]+<\/div>\s*<h3 style="color:var\(--accent\);font-size:1\.1rem;margin-bottom:8px">Process Rate<\/h3>/m;

const newCard2 = `<div style="padding:28px;border-radius:16px;background:rgba(6,182,212,0.04);border:1px solid rgba(6,182,212,0.12);position:relative;overflow:hidden;display:flex;flex-direction:column;height:100%">
            <div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient(circle,rgba(6,182,212,0.15),transparent 70%);pointer-events:none"></div>
            <img src="img/${prImg}" alt="Process Rate" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3 style="color:var(--accent);font-size:1.1rem;margin-bottom:8px">Process Rate</h3>`;

const oldCard3 = /<div style="padding:28px;border-radius:16px;background:rgba\(56,189,248,0\.04\);border:1px solid \s*rgba\(56,189,248,0\.12\);position:relative;overflow:hidden">\s*<div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient\(circle,rgba\(5\s*6,189,248,0\.15\),transparent 70%\);pointer-events:none"><\/div>\s*<div style="font-size:2rem;margin-bottom:12px">[^<]+<\/div>\s*<h3 style="color:#38bdf8;font-size:1\.1rem;margin-bottom:8px">Flow State<\/h3>/m;

const newCard3 = `<div style="padding:28px;border-radius:16px;background:rgba(56,189,248,0.04);border:1px solid rgba(56,189,248,0.12);position:relative;overflow:hidden;display:flex;flex-direction:column;height:100%">
            <div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient(circle,rgba(56,189,248,0.15),transparent 70%);pointer-events:none"></div>
            <img src="img/${fsImg}" alt="Flow State" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3 style="color:#38bdf8;font-size:1.1rem;margin-bottom:8px">Flow State</h3>`;

const oldCard4 = /<div style="padding:28px;border-radius:16px;background:rgba\(245,158,11,0\.04\);border:1px solid \s*rgba\(245,158,11,0\.12\);position:relative;overflow:hidden">\s*<div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient\(circle,rgba\(2\s*45,158,11,0\.15\),transparent 70%\);pointer-events:none"><\/div>\s*<div style="font-size:2rem;margin-bottom:12px">[^<]+<\/div>\s*<h3 style="color:#f59e0b;font-size:1\.1rem;margin-bottom:8px">System Lifecycle<\/h3>/m;

const newCard4 = `<div style="padding:28px;border-radius:16px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.12);position:relative;overflow:hidden;display:flex;flex-direction:column;height:100%">
            <div style="position:absolute;top:0;right:0;width:60px;height:60px;background:radial-gradient(circle,rgba(245,158,11,0.15),transparent 70%);pointer-events:none"></div>
            <img src="img/${slImg}" alt="System Lifecycle" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3 style="color:#f59e0b;font-size:1.1rem;margin-bottom:8px">System Lifecycle</h3>`;

// Run replaces. In JS replace without global flag replaces the first occurrence, which is perfect.
// The regexes are designed to be robust against newlines.
let cleanHtml = idxHtml.replace(/\r\n/g, '\n');

if(oldCard1.test(cleanHtml)) cleanHtml = cleanHtml.replace(oldCard1, newCard1); else console.log("Failed to match card 1");
if(oldCard2.test(cleanHtml)) cleanHtml = cleanHtml.replace(oldCard2, newCard2); else console.log("Failed to match card 2");
if(oldCard3.test(cleanHtml)) cleanHtml = cleanHtml.replace(oldCard3, newCard3); else console.log("Failed to match card 3");
if(oldCard4.test(cleanHtml)) cleanHtml = cleanHtml.replace(oldCard4, newCard4); else console.log("Failed to match card 4");

fs.writeFileSync('index.html', cleanHtml, 'utf8');
console.log('Successfully updated 42 Signals cards in index.html');
