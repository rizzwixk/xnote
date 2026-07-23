const sharp = require('sharp');
const fs = require('fs');

const svg = fs.readFileSync('build/icon.svg', 'utf-8');
sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer().then(pngBuf => {
  fs.writeFileSync('build/icon.png', pngBuf);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir.writeUInt8(0, 0); dir.writeUInt8(0, 1); dir.writeUInt8(0, 2); dir.writeUInt8(0, 3);
  dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(pngBuf.length, 8);
  dir.writeUInt32LE(22, 12);
  fs.writeFileSync('build/icon.ico', Buffer.concat([header, dir, pngBuf]));
  console.log('done');
});
