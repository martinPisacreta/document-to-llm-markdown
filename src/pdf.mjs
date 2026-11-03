import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizeText } from './content.mjs';

export const MAX_PDF_PAGES = 200;
const MAX_EXTRACTED_CHARACTERS = 2000000;

/** Extract embedded PDF text without executing document actions or fetching resources. */
export async function extractPdf(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        throw new TypeError('PDF input must be a nonempty Uint8Array');
    }
    const task = getDocument({
        data: Uint8Array.from(bytes),
        isEvalSupported: false,
        useWorkerFetch: false,
        disableFontFace: true,
        useSystemFonts: true,
        stopAtErrors: true,
    });
    try {
        const document = await task.promise;
        if (document.numPages > MAX_PDF_PAGES) {
            throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page processing limit`);
        }
        let title = '';
        try {
            const metadata = await document.getMetadata();
            if (typeof metadata.info?.Title === 'string') title = normalizeText(metadata.info.Title);
        } catch {
            // Optional metadata does not determine whether page extraction succeeds.
        }
        const pages = [];
        let characterCount = 0;
        let emptyPages = 0;
        for (let number = 1; number <= document.numPages; number++) {
            const page = await document.getPage(number);
            try {
                const text = await page.getTextContent();
                const pieces = [];
                let previousY;
                for (const item of text.items) {
                    if (typeof item.str !== 'string') continue;
                    const y = item.transform?.[5];
                    if (previousY !== undefined && Number.isFinite(y) && Math.abs(y - previousY) > 2) {
                        pieces.push('\n');
                    }
                    pieces.push(item.str);
                    pieces.push(item.hasEOL ? '\n' : ' ');
                    previousY = y;
                }
                const content = normalizeText(pieces.join(''));
                characterCount += Array.from(content).length;
                if (characterCount > MAX_EXTRACTED_CHARACTERS) {
                    throw new Error('PDF exceeds the extracted-text processing limit');
                }
                if (!content) emptyPages++;
                pages.push(content);
            } finally {
                page.cleanup();
            }
        }
        const warnings = [];
        if (emptyPages) {
            warnings.push(`${emptyPages} page(s) contain no extractable embedded text. OCR is not included.`);
        }
        return { title, pages, warnings };
    } finally {
        await task.destroy();
    }
}
