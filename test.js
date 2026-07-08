import { computeAddress } from 'ethers';
import { randomBytes } from 'crypto';

// Minimal testing framework
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [✔] ${message}`);
}

console.log('Running EVM Vanity Wallet Generator tests...\n');

// 1. Verify Cryptographic Derivation
console.log('Testing Wallet derivation correctness:');
const privateKey = '0x' + randomBytes(32).toString('hex');
const address = computeAddress(privateKey);
assert(address.startsWith('0x'), 'Address should start with 0x');
assert(address.length === 42, 'Address should be 42 characters long (including 0x)');
console.log(`  Generated Address: ${address}`);
console.log(`  Private Key: ${privateKey}\n`);

// 2. Test matching filters logic (similar to worker.js implementation)
console.log('Testing matching filters logic:');

function simulateMatchCheck(addr, config) {
  const { excludeDigits, onlyDigits, suffix } = config;
  const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const disallowedDigits = onlyDigits && onlyDigits.length > 0
    ? allDigits.filter(d => !onlyDigits.includes(d))
    : [];

  const forbiddenDigitsSet = new Set([
    ...(excludeDigits || []),
    ...disallowedDigits
  ]);
  const forbiddenDigits = Array.from(forbiddenDigitsSet);

  let checkAddress;
  if (forbiddenDigits.length > 0 && suffix) {
    const regex = new RegExp(`[${forbiddenDigits.join('')}]`);
    const lowercaseSuffix = suffix.toLowerCase();
    checkAddress = (a) => a.endsWith(lowercaseSuffix) && !regex.test(a);
  } else if (forbiddenDigits.length > 0) {
    const regex = new RegExp(`[${forbiddenDigits.join('')}]`);
    checkAddress = (a) => !regex.test(a);
  } else if (suffix) {
    const lowercaseSuffix = suffix.toLowerCase();
    checkAddress = (a) => a.endsWith(lowercaseSuffix);
  } else {
    checkAddress = () => true;
  }

  // Address format inside matching is slice(2).toLowerCase()
  return checkAddress(addr.slice(2).toLowerCase());
}

// Test case A: Exclude 4 and 9
const configA = { excludeDigits: ['4', '9'], onlyDigits: [], suffix: '' };
assert(simulateMatchCheck('0x1111111111111111111111111111111111111111', configA) === true, 'Allows address without 4 or 9');
assert(simulateMatchCheck('0x1111111111111111111111111111111111111114', configA) === false, 'Rejects address with 4');
assert(simulateMatchCheck('0x1111111111111111111111111111111111111119', configA) === false, 'Rejects address with 9');

// Test case B: Only allow 1, 3, 6, 8 as digits
const configB = { excludeDigits: [], onlyDigits: ['1', '3', '6', '8'], suffix: '' };
assert(simulateMatchCheck('0x11336688aaaaabbbbbcccccdddddeeeeefffff', configB) === true, 'Allows address with only digits 1,3,6,8 and hex letters');
assert(simulateMatchCheck('0x1133668800000000000000000000000000000000', configB) === false, 'Rejects address with digit 0');
assert(simulateMatchCheck('0x1133668822222222222222222222222222222222', configB) === false, 'Rejects address with digit 2');

// Test case C: Suffix match '1368'
const configC = { excludeDigits: [], onlyDigits: [], suffix: '1368' };
assert(simulateMatchCheck('0x1111111111111111111111111111111111111368', configC) === true, 'Allows address ending in 1368');
assert(simulateMatchCheck('0x1111111111111111111111111111111111111369', configC) === false, 'Rejects address ending in 1369');

// Test case D: Combined filters (exclude 4,9; only allow 1,3,6,8; ends in 1368)
const configD = { excludeDigits: ['4', '9'], onlyDigits: ['1', '3', '6', '8'], suffix: '1368' };
// Valid address: all digits are in 1,3,6,8; no 4,9; ends in 1368
assert(simulateMatchCheck('0x13681368aaaaabbbbbcccccdddddeeeeeff1368', configD) === true, 'Allows valid address matching all filters');
// Invalid: contains digit 5
assert(simulateMatchCheck('0x13685368aaaaabbbbbcccccdddddeeeeeff1368', configD) === false, 'Rejects address with disallowed digit 5');
// Invalid: doesn't end with 1368
assert(simulateMatchCheck('0x13681368aaaaabbbbbcccccdddddeeeeeff1366', configD) === false, 'Rejects address not ending in 1368');

console.log('\nAll tests passed successfully!');
