import { parentPort, workerData } from 'worker_threads';
import { randomBytes } from 'crypto';
import { computeAddress } from 'ethers';

const { excludeDigits, onlyDigits, suffix } = workerData;

// Build the set of forbidden digits
const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const disallowedDigits = onlyDigits && onlyDigits.length > 0
  ? allDigits.filter(d => !onlyDigits.includes(d))
  : [];

const forbiddenDigitsSet = new Set([
  ...(excludeDigits || []),
  ...disallowedDigits
]);
const forbiddenDigits = Array.from(forbiddenDigitsSet);

// Determine the optimized check function
let checkAddress;
if (suffix) {
  const lowercaseSuffix = suffix.toLowerCase();
  const suffixLen = suffix.length;
  const suffixRegex = new RegExp(`^[${lowercaseSuffix}]{${suffixLen}}$`);
  if (forbiddenDigits.length > 0) {
    const forbiddenRegex = new RegExp(`[${forbiddenDigits.join('')}]`);
    checkAddress = (addr) => suffixRegex.test(addr.slice(-suffixLen)) && !forbiddenRegex.test(addr);
  } else {
    checkAddress = (addr) => suffixRegex.test(addr.slice(-suffixLen));
  }
} else if (forbiddenDigits.length > 0) {
  const forbiddenRegex = new RegExp(`[${forbiddenDigits.join('')}]`);
  checkAddress = (addr) => !forbiddenRegex.test(addr);
} else {
  checkAddress = () => true;
}

const BATCH_SIZE = 1000;
let attempts = 0;

function run() {
  while (true) {
    // Generate private key securely
    const privateKey = '0x' + randomBytes(32).toString('hex');
    try {
      const address = computeAddress(privateKey);
      // Remove '0x' prefix for matching
      const addrLower = address.slice(2).toLowerCase();

      if (checkAddress(addrLower)) {
        parentPort.postMessage({
          type: 'match',
          data: {
            address,
            privateKey
          }
        });
      }
    } catch (err) {
      // Ignore conversion errors, though they shouldn't happen with randomBytes(32)
    }

    attempts++;
    if (attempts >= BATCH_SIZE) {
      parentPort.postMessage({
        type: 'stats',
        data: {
          attempts
        }
      });
      attempts = 0;
    }
  }
}

run();
