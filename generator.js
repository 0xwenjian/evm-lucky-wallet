import { Worker } from 'worker_threads';
import { parseArgs } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Colors and styles for premium terminal UI
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Get current directory path for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printHelp() {
  console.log(`
${BOLD}${CYAN}EVM Vanity Wallet Generator${RESET}

${BOLD}Usage:${RESET}
  node generator.js [options]

${BOLD}Options:${RESET}
  -e, --exclude <digits>  Digits to exclude from the address (e.g. 4,9)
  -o, --only <digits>     Only allow these digits in the address (e.g. 1,3,6,8)
  -s, --suffix <string>   Allowed characters for the last N characters of the address (e.g. 1368 allows any combination/order of 1, 3, 6, 8)
  -c, --count <number>    Number of wallets to find (default: 1)
  -t, --threads <number>  Number of worker threads (default: CPU core count)
  -f, --output <file>     Output file to save the generated wallets (default: wallets.txt)
  -h, --help              Show this help message
`);
}

function parseCommandLine() {
  try {
    const { values } = parseArgs({
      options: {
        exclude: { type: 'string', short: 'e' },
        only: { type: 'string', short: 'o' },
        suffix: { type: 'string', short: 's' },
        count: { type: 'string', short: 'c', default: '1' },
        threads: { type: 'string', short: 't' },
        output: { type: 'string', short: 'f', default: 'wallets.txt' },
        help: { type: 'boolean', short: 'h' }
      },
      allowPositionals: false
    });

    if (values.help) {
      printHelp();
      process.exit(0);
    }

    // Process exclude digits
    const excludeDigits = values.exclude
      ? values.exclude.replace(/[^0-9]/g, '').split('')
      : [];

    // Process only digits
    const onlyDigits = values.only
      ? values.only.replace(/[^0-9]/g, '').split('')
      : [];

    // Process suffix
    const suffix = values.suffix || '';

    // Process count
    const count = parseInt(values.count, 10);
    if (isNaN(count) || count <= 0) {
      throw new Error('Count must be a positive integer');
    }

    // Process threads
    let threads = values.threads ? parseInt(values.threads, 10) : null;
    const maxThreads = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
    if (!threads || isNaN(threads) || threads <= 0) {
      threads = maxThreads;
    }

    return {
      excludeDigits,
      onlyDigits,
      suffix,
      count,
      threads,
      outputFile: values.output
    };
  } catch (err) {
    console.error(`${RED}Error: ${err.message}${RESET}`);
    printHelp();
    process.exit(1);
  }
}

function main() {
  const config = parseCommandLine();

  console.log(`
${BOLD}${CYAN}====================================================
      EVM Vanity Wallet Generator (Multi-threaded)
====================================================${RESET}`);
  console.log(`${BOLD}Configuration:${RESET}`);
  console.log(`  - Exclude digits:  ${config.excludeDigits.length > 0 ? config.excludeDigits.join(', ') : 'None'}`);
  console.log(`  - Allowed digits:  ${config.onlyDigits.length > 0 ? config.onlyDigits.join(', ') : 'All digits (0-9)'}`);
  console.log(`  - Address suffix:  ${config.suffix ? `${GREEN}${config.suffix.split('').join(', ')}${RESET} (last ${config.suffix.length} chars in any order)` : 'None'}`);
  console.log(`  - Target count:    ${config.count}`);
  console.log(`  - Active threads:  ${config.threads}`);
  console.log(`  - Output file:     ${config.outputFile}`);
  console.log(`${BOLD}${CYAN}====================================================${RESET}`);
  console.log(`Mining started. Press ${BOLD}Ctrl+C${RESET} to stop.\n`);

  let totalChecked = 0;
  let foundWallets = [];
  const startTime = Date.now();
  let lastCheckedTime = startTime;
  let lastCheckedCount = 0;
  let currentSpeed = 0;

  // Spawn Workers
  const workers = [];
  const workerScriptPath = path.join(__dirname, 'worker.js');

  const startWorker = (index) => {
    const worker = new Worker(workerScriptPath, {
      workerData: {
        excludeDigits: config.excludeDigits,
        onlyDigits: config.onlyDigits,
        suffix: config.suffix
      }
    });

    worker.on('message', (msg) => {
      if (msg.type === 'stats') {
        totalChecked += msg.data.attempts;
      } else if (msg.type === 'match') {
        handleMatch(msg.data);
      }
    });

    worker.on('error', (err) => {
      console.error(`\n${RED}Worker ${index} encountered error: ${err.message}${RESET}`);
    });

    workers.push(worker);
  };

  for (let i = 0; i < config.threads; i++) {
    startWorker(i);
  }

  // Handle a matched wallet
  function handleMatch({ address, privateKey }) {
    foundWallets.push({ address, privateKey });

    // Format output string
    const outputString = `Address: ${address}\nPrivate Key: ${privateKey}\n\n`;

    // Clear current progress line
    process.stdout.write('\r\x1b[K');

    console.log(`${GREEN}✔ Found Wallet #${foundWallets.length}!${RESET}`);
    console.log(`  ${BOLD}Address:${RESET}      ${GREEN}${address}${RESET}`);
    console.log(`  ${BOLD}Private Key:${RESET}  ${privateKey}`);
    console.log(`${DIM}----------------------------------------------------${RESET}`);

    // Append to file
    try {
      fs.appendFileSync(config.outputFile, outputString, 'utf8');
    } catch (err) {
      console.error(`${RED}Error writing to output file: ${err.message}${RESET}`);
    }

    if (foundWallets.length >= config.count) {
      // Stop all workers
      workers.forEach(w => w.terminate());
      clearInterval(statsInterval);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n${GREEN}${BOLD}Success!${RESET} Found ${config.count} matching wallet(s) in ${duration}s.`);
      console.log(`All wallets saved to: ${path.resolve(config.outputFile)}`);
      process.exit(0);
    }
  }

  // Progress reporter interval
  const statsInterval = setInterval(() => {
    const now = Date.now();
    const elapsedSeconds = (now - lastCheckedTime) / 1000;

    if (elapsedSeconds > 0) {
      const diffCount = totalChecked - lastCheckedCount;
      currentSpeed = Math.round(diffCount / elapsedSeconds);
      lastCheckedCount = totalChecked;
      lastCheckedTime = now;
    }

    const overallElapsed = ((now - startTime) / 1000).toFixed(1);
    
    // Clear line and print progress
    process.stdout.write(
      `\r${CYAN}Mining...${RESET} Speed: ${YELLOW}${currentSpeed.toLocaleString()}${RESET} keys/s | ` +
      `Checked: ${totalChecked.toLocaleString()} | ` +
      `Elapsed: ${overallElapsed}s | ` +
      `Found: ${GREEN}${foundWallets.length}/${config.count}${RESET}`
    );
  }, 250);

  // Clean shutdown on Ctrl+C
  process.on('SIGINT', () => {
    console.log(`\n\n${YELLOW}Mining stopped by user.${RESET}`);
    workers.forEach(w => w.terminate());
    clearInterval(statsInterval);
    process.exit(0);
  });
}

main();
