import { PAYMENT_METHOD_LABELS, type AdminOrder } from '../api/client';
import { COMPANY } from '../config/company';
import { formatPrice } from './formatPrice';

const TEAL: [number, number, number] = [8, 127, 114];
const INK: [number, number, number] = [23, 36, 45];
const MUTED: [number, number, number] = [100, 115, 124];
const LINE: [number, number, number] = [222, 229, 232];

const STATUS_LABELS: Record<string, string> = {
  pending: 'À traiter',
  processing: 'En préparation',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

/**
 * The built-in PDF fonts only know Latin-1 / WinAnsi characters: replace the special spaces
 * produced by the French number format and drop characters the font cannot draw.
 */
function pdfText(value: string) {
  return value
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, '\'')
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—…€Œœ]/g, '');
}

const money = (value: number) => pdfText(formatPrice(value));

export function invoiceNumber(order: AdminOrder) {
  return `FA-${order.orderId.replace(/^3A-/, '')}`;
}

/** Builds the invoice of an order as a PDF file (jsPDF is loaded only when needed). */
export async function buildInvoicePdf(order: AdminOrder): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const right = pageWidth - margin;
  const date = order.createdAt ? new Date(order.createdAt) : new Date();

  // Header band
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageWidth, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text(pdfText(COMPANY.name), margin, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const companyLines = [
    COMPANY.tagline,
    [COMPANY.address, COMPANY.city].filter(Boolean).join(', '),
    [COMPANY.phone, COMPANY.email].filter(Boolean).join(' · '),
    COMPANY.website,
  ].filter(Boolean).map(pdfText);
  doc.text(companyLines, margin, 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...TEAL);
  doc.text('FACTURE', right, 22, { align: 'right' });
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(pdfText(`N° ${invoiceNumber(order)}`), right, 29, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(
    [
      pdfText(`Date : ${date.toLocaleDateString('fr-FR')}`),
      pdfText(`Commande : ${order.orderId}`),
      pdfText(`Statut : ${STATUS_LABELS[order.status] ?? order.status}`),
    ],
    right,
    35,
    { align: 'right' },
  );

  // Customer and delivery boxes
  const boxTop = 54;
  const boxWidth = (pageWidth - margin * 2 - 6) / 2;
  const drawBox = (x: number, title: string, lines: string[]) => {
    doc.setDrawColor(...LINE);
    doc.setFillColor(247, 250, 250);
    doc.roundedRect(x, boxTop, boxWidth, 34, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEAL);
    doc.text(title, x + 4, boxTop + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const wrapped = lines.filter(Boolean).map(pdfText)
      .flatMap((line) => doc.splitTextToSize(line, boxWidth - 8) as string[])
      .slice(0, 5);
    doc.text(wrapped, x + 4, boxTop + 12);
  };
  drawBox(margin, 'FACTURÉ À', [
    order.customer.name,
    order.customer.address ?? '',
    order.customer.city ?? '',
    order.customer.email,
    order.customer.phone ?? '',
  ]);
  drawBox(margin + boxWidth + 6, 'LIVRAISON ET PAIEMENT', [
    order.shipping ? `Transporteur : ${order.shipping.carrierName}` : 'Transporteur : à définir',
    order.shipping?.delay ? `Délai : ${order.shipping.delay}` : '',
    order.paymentMethod ? `Paiement : ${PAYMENT_METHOD_LABELS[order.paymentMethod]}` : '',
  ]);

  // Lines
  const body = order.items.map((item) => {
    const customization = item.customization;
    const details = [
      customization?.color,
      customization?.size,
      customization?.text,
      ...(customization?.options ?? []).map((option) => (
        `${option.categoryTitle} : ${option.value}${option.price ? ` (+${formatPrice(option.price)})` : ''}`
      )),
    ].filter(Boolean).join(' · ');
    return [
      details ? `${pdfText(item.name)}\n${pdfText(details)}` : pdfText(item.name),
      String(item.quantity),
      money(item.price),
      money(item.price * item.quantity),
    ];
  });

  autoTable(doc, {
    startY: boxTop + 42,
    margin: { left: margin, right: margin },
    head: [['Désignation', 'Qté', 'Prix unitaire', 'Total']].map((row) => row.map(pdfText)),
    body,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 16 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 32 },
    },
    alternateRowStyles: { fillColor: [247, 250, 250] },
    didParseCell: (data) => {
      // Column titles aligned like their values.
      if (data.section === 'head') data.cell.styles.halign = (['left', 'center', 'right', 'right'] as const)[data.column.index];
    },
  });

  // Totals
  const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingPrice = order.shipping?.price ?? 0;
  const tableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = tableEnd + 8;
  const labelX = right - 70;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11.5 : 9.5);
    doc.setTextColor(...(bold ? INK : MUTED));
    doc.text(pdfText(label), labelX, y);
    doc.setTextColor(...INK);
    doc.text(value, right, y, { align: 'right' });
    y += bold ? 8 : 6;
  };
  totalRow('Sous-total', money(subtotal));
  totalRow(
    order.shipping ? `Livraison (${order.shipping.carrierName})` : 'Livraison',
    order.shipping ? (shippingPrice === 0 ? 'Offerte' : money(shippingPrice)) : '-',
  );
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.4);
  doc.line(labelX, y - 3, right, y - 3);
  y += 2;
  totalRow('Total à payer', money(order.total), true);

  // Note and footer
  if (order.customer.note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(pdfText(`Note du client : ${order.customer.note}`), pageWidth - margin * 2) as string[], margin, y + 4);
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  const legal = [
    COMPANY.ice && `ICE : ${COMPANY.ice}`,
    COMPANY.rc && `RC : ${COMPANY.rc}`,
    COMPANY.taxId && `IF : ${COMPANY.taxId}`,
  ].filter(Boolean).join(' · ');
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 22, right, pageHeight - 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(pdfText('Merci pour votre commande !'), pageWidth / 2, pageHeight - 16, { align: 'center' });
  doc.text(pdfText([COMPANY.name, legal].filter(Boolean).join(' · ')), pageWidth / 2, pageHeight - 11, { align: 'center' });

  doc.setProperties({ title: `Facture ${invoiceNumber(order)}`, author: COMPANY.name });
  return doc.output('blob');
}
