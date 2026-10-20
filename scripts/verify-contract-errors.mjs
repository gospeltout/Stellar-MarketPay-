#!/usr/bin/env node
/**
 * scripts/verify-contract-errors.mjs
 *
 * Verifies that contract error codes and panic messages are completely in sync
 * across three sources:
 *  1. contracts/marketpay-contract/src/errors.rs (Canonical Source of Truth)
 *  2. docs/contract-errors.md                   (Documentation Reference)
 *  3. frontend/lib/contractErrors.ts            (Frontend Error Mapping & Localization)
 *
 * Fails with exit code 1 if any drift or mismatch is detected.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const errorsRsPath = path.join(
  root,
  "contracts/marketpay-contract/src/errors.rs",
);
const docsMdPath = path.join(root, "docs/contract-errors.md");
const feTsPath = path.join(root, "frontend/lib/contractErrors.ts");

function fail(message) {
  console.error(`\x1b[31m✖ ${message}\x1b[0m`);
}

function pass(message) {
  console.log(`\x1b[32m✔ ${message}\x1b[0m`);
}

function info(message) {
  console.log(`\x1b[36mℹ ${message}\x1b[0m`);
}

// ─── 1. Parse contracts/marketpay-contract/src/errors.rs ───────────────────────
if (!fs.existsSync(errorsRsPath)) {
  fail(`Missing errors.rs at ${errorsRsPath}`);
  process.exit(1);
}
const errorsRs = fs.readFileSync(errorsRsPath, "utf8");

// Parse enum ContractError
const enumMatch = errorsRs.match(/pub enum ContractError\s*\{([\s\S]*?)\n\}/);
if (!enumMatch) {
  fail("Could not find `pub enum ContractError` in errors.rs");
  process.exit(1);
}
const rustVariants = [];
const rustByCode = new Map();
const rustByName = new Map();

for (const line of enumMatch[1].split("\n")) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(\d+),/);
  if (m) {
    const name = m[1];
    const code = parseInt(m[2], 10);
    rustVariants.push({ name, code });
    if (rustByCode.has(code)) {
      fail(
        `Duplicate error code in errors.rs: ${code} used by both ${rustByCode.get(code).name} and ${name}`,
      );
    }
    rustByCode.set(code, { name, code });
    rustByName.set(name, code);
  }
}

// Parse panic_message(&self)
const pmStart = errorsRs.indexOf("pub const fn panic_message");
const pmEnd = errorsRs.indexOf("pub const fn code");
if (pmStart === -1 || pmEnd === -1) {
  fail("Could not locate `panic_message` implementation in errors.rs");
  process.exit(1);
}
const panicMsgBlock = errorsRs.slice(pmStart, pmEnd);

for (const variant of rustVariants) {
  const pmRegex = new RegExp(
    "Self::" + variant.name + '\\s*=>\\s*(?:\\{\\s*)?"([^"]+)"',
  );
  const pmMatch = panicMsgBlock.match(pmRegex);
  if (!pmMatch) {
    fail(
      `Variant ContractError::${variant.name} missing from panic_message() in errors.rs`,
    );
  } else {
    variant.panicMessage = pmMatch[1];
  }
}

// Parse error_code_from_panic(msg: &str)
const ecStart = errorsRs.indexOf("pub fn error_code_from_panic");
const ecEnd = errorsRs.indexOf("#[cfg(test)]");
if (ecStart === -1 || ecEnd === -1) {
  fail("Could not locate `error_code_from_panic` implementation in errors.rs");
  process.exit(1);
}
const errorCodeBlock = errorsRs.slice(ecStart, ecEnd);

// ─── 2. Parse docs/contract-errors.md ──────────────────────────────────────────
if (!fs.existsSync(docsMdPath)) {
  fail(`Missing documentation at ${docsMdPath}`);
  process.exit(1);
}
const docsMd = fs.readFileSync(docsMdPath, "utf8");
const docRows = new Map();
const docTableRegex = /^\|\s*(\d{4})\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\s*\|/gm;
let docMatch;
while ((docMatch = docTableRegex.exec(docsMd)) !== null) {
  const code = parseInt(docMatch[1], 10);
  const panic = docMatch[2].trim();
  const desc = docMatch[3].trim();
  if (docRows.has(code)) {
    fail(`Duplicate code ${code} documented in docs/contract-errors.md`);
  }
  docRows.set(code, { code, panic, desc });
}

// ─── 3. Parse frontend/lib/contractErrors.ts ──────────────────────────────────
if (!fs.existsSync(feTsPath)) {
  fail(`Missing frontend mapping at ${feTsPath}`);
  process.exit(1);
}
const feTs = fs.readFileSync(feTsPath, "utf8");

// Parse CONTRACT_ERROR_CODES
const feCodesMatch = feTs.match(
  /export const CONTRACT_ERROR_CODES\s*=\s*\{([\s\S]*?)\n\}\s*as const;/,
);
if (!feCodesMatch) {
  fail("Could not find CONTRACT_ERROR_CODES in frontend/lib/contractErrors.ts");
  process.exit(1);
}
const feCodes = new Map();
for (const line of feCodesMatch[1].split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*:\s*(\d+)/);
  if (m) {
    feCodes.set(parseInt(m[2], 10), m[1]);
  }
}

function getObjectMapKeys(mapName) {
  const start = feTs.indexOf("const " + mapName);
  if (start === -1) {
    fail(`Could not find ${mapName} in frontend/lib/contractErrors.ts`);
    return new Set();
  }
  const braceStart = feTs.indexOf("{", start);
  let depth = 1;
  let idx = braceStart + 1;
  while (depth > 0 && idx < feTs.length) {
    if (feTs[idx] === "{") depth++;
    else if (feTs[idx] === "}") depth--;
    idx++;
  }
  const body = feTs.slice(braceStart + 1, idx - 1);
  const keys = new Set();
  const r = /\[CONTRACT_ERROR_CODES\.([A-Z0-9_]+)\]/g;
  let m;
  while ((m = r.exec(body)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

const enKeys = getObjectMapKeys("CONTRACT_ERROR_MESSAGES_EN");
const esKeys = getObjectMapKeys("CONTRACT_ERROR_MESSAGES_ES");
const frKeys = getObjectMapKeys("CONTRACT_ERROR_MESSAGES_FR");

// Parse PANIC_TO_CODE
const ptcStart = feTs.indexOf("const PANIC_TO_CODE");
const ptcBraceStart = feTs.indexOf("{", ptcStart);
let ptcDepth = 1;
let ptcIdx = ptcBraceStart + 1;
while (ptcDepth > 0 && ptcIdx < feTs.length) {
  if (feTs[ptcIdx] === "{") ptcDepth++;
  else if (feTs[ptcIdx] === "}") ptcDepth--;
  ptcIdx++;
}
const ptcBody = feTs.slice(ptcBraceStart + 1, ptcIdx - 1);
const fePanicMap = new Map();
const ptcRegex = /(?:["']([^"']+)["']|([A-Za-z0-9_]+))\s*:\s*CONTRACT_ERROR_CODES\.([A-Z0-9_]+)/g;
let ptcMatch;
while ((ptcMatch = ptcRegex.exec(ptcBody)) !== null) {
  const panic = ptcMatch[1] || ptcMatch[2];
  const constName = ptcMatch[3];
  fePanicMap.set(panic, constName);
}

// ─── 4. Cross-Verification ─────────────────────────────────────────────────────
let hasErrors = false;

info(`Auditing ${rustVariants.length} contract error codes from errors.rs...`);

// Check 1: errors.rs internal round-trip
for (const v of rustVariants) {
  if (!v.panicMessage) continue;
  const escaped = v.panicMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `"(?:[^"]*"\\s*\\|\\s*")*` +
      escaped +
      `"(?:\\s*\\|\\s*"[^"]*")*\\s*=>\\s*(?:\\{\\s*)?Some\\(` +
      v.code +
      `\\)`,
  );
  if (!pattern.test(errorCodeBlock)) {
    fail(
      `errors.rs: error_code_from_panic does not map "${v.panicMessage}" to Some(${v.code}) for variant ${v.name}`,
    );
    hasErrors = true;
  }
}

// Check 2: docs/contract-errors.md sync
for (const v of rustVariants) {
  const docEntry = docRows.get(v.code);
  if (!docEntry) {
    fail(
      `docs/contract-errors.md: Missing documentation for error ${v.code} (${v.name})`,
    );
    hasErrors = true;
  } else if (docEntry.panic !== v.panicMessage) {
    fail(
      `docs/contract-errors.md: Panic message mismatch for code ${v.code}. Expected \`${v.panicMessage}\`, found \`${docEntry.panic}\``,
    );
    hasErrors = true;
  }
}

for (const [code, entry] of docRows.entries()) {
  if (!rustByCode.has(code)) {
    fail(
      `docs/contract-errors.md: Documented code ${code} ("${entry.panic}") does not exist in errors.rs`,
    );
    hasErrors = true;
  }
}

// Check 3: frontend/lib/contractErrors.ts sync
for (const v of rustVariants) {
  const constName = feCodes.get(v.code);
  if (!constName) {
    fail(
      `frontend/lib/contractErrors.ts: Missing code ${v.code} (${v.name}) in CONTRACT_ERROR_CODES`,
    );
    hasErrors = true;
    continue;
  }

  // Check translation maps
  if (!enKeys.has(constName)) {
    fail(
      `frontend/lib/contractErrors.ts: Missing English translation for CONTRACT_ERROR_CODES.${constName} (${v.code})`,
    );
    hasErrors = true;
  }
  if (!esKeys.has(constName)) {
    fail(
      `frontend/lib/contractErrors.ts: Missing Spanish translation for CONTRACT_ERROR_CODES.${constName} (${v.code})`,
    );
    hasErrors = true;
  }
  if (!frKeys.has(constName)) {
    fail(
      `frontend/lib/contractErrors.ts: Missing French translation for CONTRACT_ERROR_CODES.${constName} (${v.code})`,
    );
    hasErrors = true;
  }

  // Check PANIC_TO_CODE
  const mappedConst = fePanicMap.get(v.panicMessage);
  if (!mappedConst) {
    fail(
      `frontend/lib/contractErrors.ts: Missing PANIC_TO_CODE entry for panic message "${v.panicMessage}" (${v.code})`,
    );
    hasErrors = true;
  } else if (mappedConst !== constName) {
    fail(
      `frontend/lib/contractErrors.ts: PANIC_TO_CODE for "${v.panicMessage}" maps to ${mappedConst} instead of ${constName}`,
    );
    hasErrors = true;
  }
}

// Check orphaned frontend codes
for (const [code, constName] of feCodes.entries()) {
  if (code !== 0 && !rustByCode.has(code)) {
    fail(
      `frontend/lib/contractErrors.ts: CONTRACT_ERROR_CODES contains orphaned code ${code} (${constName}) not in errors.rs`,
    );
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error(
    "\n❌ Contract error synchronization check failed! Fix the mismatches above.\n",
  );
  process.exit(1);
} else {
  pass(
    `All ${rustVariants.length} contract error codes are synchronized across errors.rs, docs/contract-errors.md, and contractErrors.ts.`,
  );
  process.exit(0);
}
