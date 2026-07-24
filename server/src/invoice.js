const PDFDocument = require('pdfkit');

const GOLD = '#9C7A1E';
const INK = '#1a1a1a';
const MUTED = '#666666';
const LINE = '#dddddd';

// Renders a simple invoice PDF to the given writable stream.
function renderInvoice(stream, { invoiceNumber, date, studentName, studentEmail, description, method, reference, amount, status }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  doc.fontSize(20).fillColor(INK).font('Helvetica-Bold').text('Forex Money Machine Academy', { continued: false });
  doc.fontSize(10).fillColor(MUTED).font('Helvetica').text('www.vrcommercesolutions.com');
  doc.moveDown(1.5);

  doc.fontSize(16).fillColor(GOLD).font('Helvetica-Bold').text('INVOICE');
  doc.fontSize(10).fillColor(MUTED).font('Helvetica');
  doc.text(`Invoice #: ${invoiceNumber}`);
  doc.text(`Date: ${date}`);
  doc.moveDown();

  doc.fontSize(11).fillColor(INK).font('Helvetica-Bold').text('Billed To');
  doc.fontSize(10).fillColor(MUTED).font('Helvetica').text(studentName);
  doc.text(studentEmail);
  doc.moveDown(1.5);

  const tableTop = doc.y;
  doc.fontSize(10).fillColor(INK).font('Helvetica-Bold');
  doc.text('Description', 50, tableTop, { width: 220 });
  doc.text('Method', 270, tableTop, { width: 100 });
  doc.text('Reference', 370, tableTop, { width: 100 });
  doc.text('Amount', 480, tableTop, { width: 70, align: 'right' });
  doc.moveTo(50, tableTop + 16).lineTo(550, tableTop + 16).strokeColor(LINE).stroke();

  const rowY = tableTop + 24;
  doc.font('Helvetica').fillColor(INK);
  doc.text(description, 50, rowY, { width: 220 });
  doc.text(method || '—', 270, rowY, { width: 100 });
  doc.text(reference || '—', 370, rowY, { width: 100 });
  doc.text(amount, 480, rowY, { width: 70, align: 'right' });
  doc.moveTo(50, rowY + 24).lineTo(550, rowY + 24).strokeColor(LINE).stroke();

  doc.fontSize(11).font('Helvetica-Bold').text('Total', 370, rowY + 36, { width: 100 });
  doc.text(amount, 480, rowY + 36, { width: 70, align: 'right' });

  doc.fontSize(10).font('Helvetica-Bold').fillColor(status === 'Paid' ? '#1a7a3c' : status === 'Refunded' ? '#a3312a' : '#9c7a1e');
  doc.text(`Status: ${status}`, 50, rowY + 36);

  doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(
    'This invoice reflects a payment record submitted and verified for Forex Money Machine Academy. For questions, contact us on Telegram.',
    50, rowY + 90, { width: 500 },
  );

  doc.end();
}

module.exports = { renderInvoice };
