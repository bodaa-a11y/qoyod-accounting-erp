'use strict';
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Find QRCode library in html
const hasQRCode = html.includes('qrcode') || html.includes('QRCode');
console.log('Includes QRCode:', hasQRCode);

// Check if QRCode is loaded via CDN or inline
const qrMatches = html.match(/<script[^>]*src=[^>]*qrcode[^>]*>/gi);
console.log('QRCode script tag:', qrMatches);

const newQrCodeMatches = html.match(/new QRCode\(/g);
console.log('new QRCode calls:', newQrCodeMatches ? newQrCodeMatches.length : 0);
