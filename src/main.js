import { Actor } from 'apify';
import { parseInput } from './input.mjs';
import { fetchPublicDocument } from './network.mjs';
import { extractHtml } from './html.mjs';
import { extractPdf } from './pdf.mjs';
import { createDocumentProcessor } from './process.mjs';
import { runDocuments } from './run.mjs';

await Actor.init();
let exitCode = 0;
try {
    const options = parseInput(await Actor.getInput());
    const processDocument = createDocumentProcessor({
        fetchDocument: fetchPublicDocument, extractHtml, extractPdf,
    });
    const summary = await runDocuments(Actor, options, processDocument);
    console.log(JSON.stringify({ event: 'run-complete', ...summary }));
} catch (error) {
    exitCode = 1;
    console.error('Run stopped after an input, storage or charging failure. Inspect input and platform logs before starting another run; saved results may already have been charged.');
    // Name and message only: inputs are public URLs and no credentials are handled here.
    console.error(`Cause: ${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
} finally {
    await Actor.exit({ exitCode });
}
