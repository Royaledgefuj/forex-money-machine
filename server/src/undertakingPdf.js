const PDFDocument = require('pdfkit');

const NAVY = '#0A0D14';
const MUTED = '#5A5240';
const GOLD = '#B8901F';

const CLAUSES = [
  ['Understanding of Risk', 'I understand that forex, commodities, cryptocurrencies, and other financial markets are highly volatile and involve substantial risk. Trading may result in partial or total loss of my invested capital.'],
  ['No Guaranteed Returns', 'I acknowledge that no guarantees, promises, or assurances have been made regarding profits, returns on investment, or preservation of capital. Past performance is not indicative of future results.'],
  ['Independent Decision', 'I confirm that I am voluntarily choosing to participate in the AI Copy Trading service after conducting my own research (DYOR). I understand that all trading decisions ultimately remain my responsibility.'],
  ['Acceptance of Losses', 'I understand that losses are a normal part of trading and accept full responsibility for any financial losses incurred while using the AI Copy Trading service.'],
  ['No Refund Policy', 'I acknowledge and agree that all payments made for AI Copy Trading services, subscriptions, setup fees, or related services are final and non-refundable, regardless of trading performance, profits, losses, market conditions, or my decision to discontinue the service.'],
  ['No Liability', 'I agree not to hold VR Money Magnet, its founder, employees, affiliates, partners, or representatives liable for any financial loss, missed opportunities, indirect damages, or any other consequences arising from participation in the AI Copy Trading service.'],
  ['Financial Responsibility', 'I confirm that I am using funds that I can afford to risk and that participation in AI Copy Trading will not cause financial hardship.'],
  ['Educational Purpose', 'I understand that the information, support, and guidance provided are for educational and informational purposes only and do not constitute financial, investment, or legal advice.'],
  ['Agreement', 'By signing this undertaking, I confirm that I have read, understood, and voluntarily accepted all the above terms and conditions without coercion.'],
];

// Renders the signed AI Copy Trading undertaking as a PDF to the given
// writable stream (e.g. an HTTP response) — the exact text shown to the
// student when they accepted it, with their name/email and the real
// acceptance timestamp standing in for a signature.
function renderUndertakingPdf(stream, { studentName, studentEmail, acceptedAt }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
  doc.pipe(stream);

  doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD).text('FOREX MONEY MACHINE ACADEMY', { align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text('AI Copy Trading Risk Acknowledgement and No-Refund Agreement', { align: 'center' });
  doc.moveDown(1);

  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
    .text('By joining the AI Copy Trading service, the undersigned acknowledges, understands, and agrees to the following terms and conditions:');
  doc.moveDown(0.8);

  CLAUSES.forEach(([title, body], i) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(`${i + 1}. ${title}`, { continued: false });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(body, { indent: 14 });
    doc.moveDown(0.5);
  });

  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
    .text('The undersigned declares that they have read this undertaking in full, understand the risks associated with AI Copy Trading, and voluntarily agree to participate. There are no guaranteed returns, capital is at risk, and no refunds will be provided under any circumstances.');
  doc.moveDown(1.2);

  const acceptedDate = new Date(acceptedAt);
  const tableY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
  doc.text('Full Name:', 54, tableY, { continued: true }).font('Helvetica').fillColor(MUTED).text(`  ${studentName}`);
  doc.font('Helvetica-Bold').fillColor(NAVY).text('Email:', 54, doc.y, { continued: true }).font('Helvetica').fillColor(MUTED).text(`  ${studentEmail}`);
  doc.font('Helvetica-Bold').fillColor(NAVY).text('Accepted:', 54, doc.y, { continued: true }).font('Helvetica').fillColor(MUTED)
    .text(`  ${acceptedDate.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} (digitally accepted via checkbox confirmation on the student dashboard — no handwritten signature was collected)`);

  doc.moveDown(2);
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
    .text('This document was generated automatically from the student\'s digital acceptance record and reflects the exact terms presented to them at the time of acceptance.', { align: 'center' });

  doc.end();
  return doc;
}

module.exports = { renderUndertakingPdf };
