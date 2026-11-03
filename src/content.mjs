/** Character counts use Unicode code points. maxChars applies to content only. */
export function normalizeText(value) {
    return String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\t\u00a0 ]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function validateMaxChars(value = 20000) {
    if (!Number.isInteger(value) || value < 1 || value > 200000) {
        throw new TypeError('maxChars must be an integer between 1 and 200000');
    }
    return value;
}

/**
 * Apply one document-wide budget. PDF pages remain represented even after
 * the budget is exhausted, so missing text is distinguishable from empty pages.
 * Extraction must finish before this function: counts describe extracted
 * content, never the original HTML markup or a PDF byte length.
 */
export function boundContent({ title = '', content, pages }, maxChars = 20000) {
    validateMaxChars(maxChars);
    const isPdf = pages !== undefined;
    if (isPdf && (!Array.isArray(pages) || pages.some(page => typeof page !== 'string'))) {
        throw new TypeError('pages must be an array of strings');
    }
    if (!isPdf && typeof content !== 'string') {
        throw new TypeError('content must be a string');
    }

    const source = isPdf ? pages : [content];
    let remaining = maxChars;
    let fullTextCharacters = 0;
    let outputCharacters = 0;
    const retained = source.map((text, index) => {
        const characters = Array.from(text);
        const kept = characters.slice(0, remaining);
        remaining -= kept.length;
        fullTextCharacters += characters.length;
        outputCharacters += kept.length;
        return {
            pageNumber: index + 1,
            content: kept.join(''),
            fullTextCharacters: characters.length,
            outputCharacters: kept.length,
            textTruncated: kept.length < characters.length,
        };
    });

    const textTruncated = outputCharacters < fullTextCharacters;
    const result = {
        title: normalizeText(title),
        fullTextCharacters,
        outputCharacters,
        textTruncated,
        warnings: textTruncated
            ? ['Content was truncated to the document-wide maxChars limit.']
            : [],
    };
    if (isPdf) {
        result.pageCount = pages.length;
        result.pages = retained;
    } else {
        result.content = retained[0].content;
    }
    return result;
}
