const fs = require('fs');
const htmlToRtf = require('html-to-rtf');

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function writeRtfFile(filePath, beautified, summary) {
  const html = `<p>Beautified Note:</p><p>${escapeHtml(beautified || '')}</p><p>Summary:</p><p>${escapeHtml(summary || '')}</p>`;
  const rtf = htmlToRtf.convertHtmlToRtf(html);
  fs.writeFileSync(filePath, rtf);
}

module.exports = { writeRtfFile };
