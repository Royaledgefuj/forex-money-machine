const PDFDocument = require('pdfkit');
const path = require('path');

const SCRIPT_FONT = path.join(__dirname, '..', 'assets', 'fonts', 'GreatVibes-Regular.ttf');

const GOLD = '#B8901F';
const GOLD_LIGHT = '#D4AF37';
const NAVY = '#0A0D14';
const CREAM = '#FBF8F0';
const MUTED = '#5A5240';

function drawStar(doc, cx, cy, outerR, innerR, color) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  doc.polygon(...points).fill(color);
}

// Renders a certificate PDF to the given writable stream (e.g. an HTTP response) and returns the PDFDocument.
function renderCertificate(stream, { studentName, programName, batchName, completionDate, certificateNumber }) {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0 });
  doc.pipe(stream);
  doc.registerFont('Script', SCRIPT_FONT);

  const W = doc.page.width;
  const H = doc.page.height;

  doc.rect(0, 0, W, H).fill(CREAM);

  const margin = 32;
  doc.lineWidth(2.2).strokeColor(GOLD).rect(margin, margin, W - 2 * margin, H - 2 * margin).stroke();
  doc.lineWidth(0.7).rect(margin + 8, margin + 8, W - 2 * margin - 16, H - 2 * margin - 16).stroke();

  [[margin, margin, 1, 1], [W - margin, margin, -1, 1], [margin, H - margin, 1, -1], [W - margin, H - margin, -1, -1]].forEach(([cx, cy, sx, sy]) => {
    doc.lineWidth(1.6).strokeColor(GOLD)
      .moveTo(cx, cy).lineTo(cx + sx * 26, cy).stroke()
      .moveTo(cx, cy).lineTo(cx, cy + sy * 26).stroke();
  });

  doc.font('Helvetica-Bold').fontSize(11).fillColor(GOLD)
    .text('F O R E X   M O N E Y   M A C H I N E   A C A D E M Y', 0, 78, { width: W, align: 'center' });

  doc.font('Times-Bold').fontSize(34).fillColor(NAVY)
    .text('Certificate of Completion', 0, 100, { width: W, align: 'center' });

  doc.lineWidth(1).strokeColor(GOLD).moveTo(W / 2 - 130, 152).lineTo(W / 2 + 130, 152).stroke();

  doc.font('Helvetica').fontSize(13).fillColor(MUTED)
    .text('This certifies that', 0, 176, { width: W, align: 'center' });

  doc.font('Script').fontSize(52).fillColor(NAVY)
    .text(studentName, 0, 198, { width: W, align: 'center' });

  doc.lineWidth(0.6).strokeColor(GOLD).moveTo(W / 2 - 170, 262).lineTo(W / 2 + 170, 262).stroke();

  doc.font('Helvetica').fontSize(13).fillColor(MUTED)
    .text('has successfully completed all coursework and requirements of the', 0, 274, { width: W, align: 'center' });

  doc.font('Times-Bold').fontSize(19).fillColor(GOLD)
    .text(programName, 0, 298, { width: W, align: 'center' });

  doc.font('Helvetica').fontSize(11.5).fillColor(MUTED)
    .text(`Batch: ${batchName}    ·    Completion Date: ${completionDate}    ·    Certificate No. ${certificateNumber}`, 0, 326, { width: W, align: 'center' });

  // Signature block (bottom-left)
  const sigX = margin + 100;
  const sigY = H - margin - 90;
  doc.font('Script').fontSize(30).fillColor(NAVY)
    .text('Ahmad Hassan', sigX - 95, sigY - 22, { width: 190, align: 'center' });
  doc.lineWidth(0.8).strokeColor(NAVY).moveTo(sigX - 85, sigY + 12).lineTo(sigX + 85, sigY + 12).stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY)
    .text('AHMAD HASSAN', sigX - 95, sigY + 18, { width: 190, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text('Founder, Forex Money Machine Academy', sigX - 95, sigY + 30, { width: 190, align: 'center' });

  // Embossed seal (bottom-right)
  const sealX = W - margin - 100;
  const sealY = H - margin - 90;
  const rOuter = 52, rInner = 44, rInner2 = 38;

  doc.fillOpacity(0.06).circle(sealX + 2, sealY + 3, rOuter).fill('#000000');
  doc.fillOpacity(0.14).circle(sealX, sealY, rOuter).fill(GOLD_LIGHT);
  doc.fillOpacity(1);
  doc.lineWidth(2).strokeColor(GOLD).circle(sealX, sealY, rOuter).stroke();
  doc.lineWidth(0.8).circle(sealX, sealY, rInner).stroke();

  doc.font('Helvetica-Bold').fontSize(6.4).fillColor(GOLD)
    .text('FOREX MONEY', sealX - rInner2, sealY - 34, { width: rInner2 * 2, align: 'center' })
    .text('MACHINE ACADEMY', sealX - rInner2, sealY - 25, { width: rInner2 * 2, align: 'center' });

  drawStar(doc, sealX, sealY - 2, 9, 3.6, GOLD);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY)
    .text('CERTIFIED', sealX - rInner2, sealY + 12, { width: rInner2 * 2, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(6).fillColor(GOLD)
    .text('OF COMPLETION', sealX - rInner2, sealY + 22, { width: rInner2 * 2, align: 'center' });

  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
    .text(`Verify this certificate at vrcommercesolutions.com/verify · ${certificateNumber}`, 0, H - margin - 22, { width: W, align: 'center' });

  doc.end();
  return doc;
}

module.exports = { renderCertificate };
