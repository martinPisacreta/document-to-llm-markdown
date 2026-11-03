import { boundContent } from './content.mjs';

/** Dependencies are supplied explicitly so orchestration can be tested offline. */
export function createDocumentProcessor({ fetchDocument, extractHtml, extractPdf }) {
    return async function processDocument(url, { format, maxChars }) {
        const source = await fetchDocument(url);
        const mime = source.contentType;
        const pdfSignature = Buffer.from(source.bytes).subarray(0, 5).toString('ascii') === '%PDF-';
        let extracted;
        let documentType;
        if (mime === 'application/pdf' || pdfSignature) {
            documentType = 'pdf';
            extracted = await extractPdf(source.bytes);
        } else if (['text/html', 'application/xhtml+xml'].includes(mime)) {
            documentType = 'html';
            extracted = extractHtml(new TextDecoder('utf-8').decode(source.bytes), {
                url: source.finalUrl, format,
            });
        } else {
            throw new Error('Unsupported source content type; expected HTML or PDF');
        }
        const bounded = boundContent(extracted, maxChars);
        return {
            url,
            finalUrl: source.finalUrl,
            status: 'success',
            documentType,
            format,
            ...bounded,
            warnings: [...(extracted.warnings || []), ...bounded.warnings],
        };
    };
}
