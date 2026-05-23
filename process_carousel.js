const fs = require('fs');

// 1. UPDATE CSS
let css = fs.readFileSync('styles.css', 'utf8');
css = css.replace('.carousel-card{', '.carousel-card{display:flex; flex-direction:column; height:100%; ');
fs.writeFileSync('styles.css', css, 'utf8');

// 2. UPDATE HTML
let idxHtml = fs.readFileSync('index.html', 'utf8');

const imgDir = fs.readdirSync('img');
const feImg = imgDir.find(f => f.startsWith('feat_engine'));
const frImg = imgDir.find(f => f.startsWith('feat_repair'));
const fpImg = imgDir.find(f => f.startsWith('feat_predictive'));
const ffImg = imgDir.find(f => f.startsWith('feat_fuel'));
const fsImg = imgDir.find(f => f.startsWith('feat_score'));

// Replaces using regex matching
let cleanHtml = idxHtml.replace(/\r\n/g, '\n');

// Card 1
const card1Regex = /<div class="carousel-card">\s*<div class="icon" style="background:rgba\(6,182,212,0\.1\)">[^<]+<\/div>\s*<h3>42-Signal Diagnostic Engine<\/h3>/m;
const card1New = `<div class="carousel-card">
            <img src="img/${feImg}" alt="42-Signal Engine" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3>42-Signal Diagnostic Engine</h3>`;

// Card 2
const card2Regex = /<div class="carousel-card">\s*<div class="icon" style="background:rgba\(6,182,212,0\.1\)">[^<]+<\/div>\s*<h3>Skip the \$150 Shop Visit<\/h3>/m;
const card2New = `<div class="carousel-card">
            <img src="img/${frImg}" alt="Shop Visit" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3>Skip the $150 Shop Visit</h3>`;

// Card 3
const card3Regex = /<div class="carousel-card">\s*<div class="icon" style="background:rgba\(245,158,11,0\.1\)">[^<]+<\/div>\s*<h3>Predictive Maintenance<\/h3>/m;
const card3New = `<div class="carousel-card">
            <img src="img/${fpImg}" alt="Predictive Maintenance" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3>Predictive Maintenance</h3>`;

// Card 4
const card4Regex = /<div class="carousel-card">\s*<div class="icon" style="background:rgba\(239,68,68,0\.1\)">[^<]+<\/div>\s*<h3>Fuel Governance Engine<\/h3>/m;
const card4New = `<div class="carousel-card">
            <img src="img/${ffImg}" alt="Fuel Governance" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3>Fuel Governance Engine</h3>`;

// Card 5
const card5Regex = /<div class="carousel-card">\s*<div class="icon" style="background:rgba\(99,102,241,0\.1\)">[^<]+<\/div>\s*<h3>Dashboard \+ Driver Score<\/h3>/m;
const card5New = `<div class="carousel-card">
            <img src="img/${fsImg}" alt="Dashboard Score" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:16px">
            <h3>Dashboard + Driver Score</h3>`;

if(card1Regex.test(cleanHtml)) cleanHtml = cleanHtml.replace(card1Regex, card1New); else console.log("Failed card 1");
if(card2Regex.test(cleanHtml)) cleanHtml = cleanHtml.replace(card2Regex, card2New); else console.log("Failed card 2");
if(card3Regex.test(cleanHtml)) cleanHtml = cleanHtml.replace(card3Regex, card3New); else console.log("Failed card 3");
if(card4Regex.test(cleanHtml)) cleanHtml = cleanHtml.replace(card4Regex, card4New); else console.log("Failed card 4");
if(card5Regex.test(cleanHtml)) cleanHtml = cleanHtml.replace(card5Regex, card5New); else console.log("Failed card 5");

fs.writeFileSync('index.html', cleanHtml, 'utf8');
console.log('Successfully updated carousel cards');
