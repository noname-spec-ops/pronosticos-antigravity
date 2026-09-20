/**
 * Redirects all persistent data writes to a throwaway directory for the duration
 * of the test run, so the suite can exercise persistence without ever mutating
 * the project's real data/ directory.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flashstat-test-data-'));
process.env.FLASHSTAT_DATA_DIR = scratchDir;
