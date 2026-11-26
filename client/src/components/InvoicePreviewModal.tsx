import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import type { AdminOrder } from '../api/client';
import { buildInvoicePdf, invoiceNumber } from '../utils/invoicePdf';

interface Props {
  order: AdminOrder | null;
  onHide: () => void;
}

/** PDF preview of an order's invoice, with download and print. */
export function InvoicePreviewModal({ order, onHide }: Props) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setUrl(undefined);
    setError('');
    buildInvoicePdf(order)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de générer la facture.');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [order]);

  const fileName = order ? `facture-${invoiceNumber(order)}.pdf` : 'facture.pdf';

  return (
    <Modal show={Boolean(order)} onHide={onHide} size="xl" centered className="invoice-modal">
      <Modal.Header closeButton>
        <Modal.Title>Facture {order ? invoiceNumber(order) : ''}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        {error && <Alert variant="warning" className="m-3">{error}</Alert>}
        {!error && !url && <p className="text-secondary m-4">Génération de la facture…</p>}
        {url && (
          <iframe ref={frameRef} className="invoice-frame" src={url} title={`Aperçu de la facture ${order ? invoiceNumber(order) : ''}`} />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Fermer</Button>
        <Button
          variant="outline-secondary"
          disabled={!url}
          onClick={() => frameRef.current?.contentWindow?.print()}
        >
          Imprimer
        </Button>
        <Button as="a" className="btn-brand" href={url} download={fileName} disabled={!url}>
          Télécharger le PDF
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
