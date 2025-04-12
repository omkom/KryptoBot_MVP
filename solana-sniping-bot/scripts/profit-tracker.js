/**
 * @fileoverview Profit Tracker for Solana Memecoin Sniping Bot
 * Analyzes trading performance by retrieving historical transaction data,
 * calculating profit/loss metrics, and generating summary statistics.
 * 
 * Usage: node profit-tracker.js [options]
 * Docker: docker exec -it sell_manager_sniper node /usr/src/app/scripts/profit-tracker.js [options]
 */

const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { createLogger } = require('../shared/logger');
const config = require('../shared/config').default;
const { REDIS_CHANNELS } = require('../shared/constants');
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Initialize logger
const logger = createLogger('profit-tracker');

// Parse command line arguments
const args = parseCommandLineArgs(process.argv.slice(2));

// Main function
async function main() {
  try {
    logger.info('Starting profit tracker analysis', { args });
    console.log(chalk.bold.blue('\n===== SOLANA MEMECOIN SNIPING BOT PROFIT TRACKER =====\n'));
    
    // Connect to Redis
    const redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || '',
      retryStrategy: times => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis connection attempt ${times} failed. Retrying in ${delay}ms`);
        return delay;
      }
    });

    // Check Redis connection
    try {
      await redis.ping();
    } catch (error) {
      logger.error(`Failed to connect to Redis: ${error.message}`);
      console.error(chalk.red(`Error: Could not connect to Redis at ${config.REDIS_HOST}:${config.REDIS_PORT}`));
      process.exit(1);
    }

    // Retrieve transaction data
    const { transactions, buys, sells } = await retrieveTransactionData(redis, args);
    
    // Calculate metrics and generate reports
    const metrics = calculateMetrics(transactions);
    const timeAnalysis = generateTimeAnalysis(transactions);
    
    // Display results
    displayResults(transactions, metrics, timeAnalysis, args);
    
    // Output JSON if requested
    if (args.output) {
      outputJSON(transactions, metrics, timeAnalysis, args.output);
    }
    
    // Close Redis connection
    await redis.quit();
    
    logger.info('Profit tracker analysis complete');
  } catch (error) {
    logger.error(`Error in profit tracker: ${error.message}`, { stack: error.stack });
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Parses command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {Object} - Parsed arguments
 */
function parseCommandLineArgs(args) {
  const options = {
    startDate: null,
    endDate: null,
    token: null,
    profitable: false,
    loss: false,
    output: null,
    days: 7,
    includeDryRun: false,
    detailed: false,
    help: false
  };

  // Simple argument parser
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--start-date':
      case '-s':
        options.startDate = new Date(args[++i]);
        break;
      case '--end-date':
      case '-e':
        options.endDate = new Date(args[++i]);
        break;
      case '--token':
      case '-t':
        options.token = args[++i];
        break;
      case '--profitable':
      case '-p':
        options.profitable = true;
        break;
      case '--loss':
      case '-l':
        options.loss = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--days':
      case '-d':
        options.days = parseInt(args[++i], 10);
        break;
      case '--include-dry-run':
        options.includeDryRun = true;
        break;
      case '--detailed':
        options.detailed = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        displayHelp();
        process.exit(0);
        break;
    }
  }

  // Set default date range if not specified
  if (!options.endDate) {
    options.endDate = new Date();
  }
  
  if (!options.startDate) {
    options.startDate = new Date(options.endDate.getTime() - (options.days * 24 * 60 * 60 * 1000));
  }

  return options;
}

/**
 * Displays help information
 */
function displayHelp() {
  console.log(`
${chalk.bold('Solana Memecoin Sniping Bot Profit Tracker')}

${chalk.cyan('Usage:')} node profit-tracker.js [options]
${chalk.cyan('Docker:')} docker exec -it sell_manager_sniper node /usr/src/app/scripts/profit-tracker.js [options]

${chalk.cyan('Options:')}
  -s, --start-date <date>   Start date (YYYY-MM-DD)
  -e, --end-date <date>     End date (YYYY-MM-DD)
  -d, --days <number>       Number of days to analyze (default: 7)
  -t, --token <address>     Filter by token address
  -p, --profitable          Show only profitable trades
  -l, --loss                Show only unprofitable trades
  -o, --output <path>       Output path for JSON report
  --include-dry-run         Include dry run transactions in analysis
  --detailed                Show detailed trade information
  -h, --help                Display this help information
  `);
}

/**
 * Retrieves transaction data from Redis and logs
 * @param {Redis} redis - Redis client
 * @param {Object} args - Command line arguments
 * @returns {Promise<{transactions: Array, buys: Array, sells: Array}>} - Transaction data
 */
async function retrieveTransactionData(redis, args) {
  logger.info(`Retrieving transactions from ${args.startDate.toISOString()} to ${args.endDate.toISOString()}`);
  
  const transactions = [];
  const buys = [];
  const sells = [];
  
  // 1. Get all position keys from Redis
  const positionKeys = await redis.keys('positions:*');
  logger.info(`Found ${positionKeys.length} position keys in Redis`);
  
  // 2. Process each position
  for (const key of positionKeys) {
    try {
      const position = await redis.hgetall(key);
      
      // Skip if not valid position data
      if (!position.baseMint || !position.buyTimestamp) {
        continue;
      }
      
      // Skip dry run transactions if not included
      if (position.isDryRun === 'true' && !args.includeDryRun) {
        continue;
      }
      
      // Skip if outside date range
      const timestamp = parseInt(position.buyTimestamp, 10);
      const date = new Date(timestamp);
      
      if (date < args.startDate || date > args.endDate) {
        continue;
      }
      
      // Skip if filtering by token and not matching
      if (args.token && position.baseMint !== args.token) {
        continue;
      }
      
      // Process position data
      const buyData = {
        baseMint: position.baseMint,
        lpAddress: position.lpAddress || 'unknown',
        timestamp,
        signature: position.signature || 'unknown',
        amountInSol: parseFloat(position.amountInSol || '0'),
        tokenAmount: position.tokenAmount ? BigInt(position.tokenAmount) : 0n,
        buyPrice: parseFloat(position.buyPrice || '0'),
        isDryRun: position.isDryRun === 'true'
      };
      
      buys.push(buyData);
      
      // Check if there is a matching sell
      let sellData = null;
      
      // Try to find a matching sell from Redis
      // This would be more robust in a production system with a proper database
      const sellKey = `sell:${position.baseMint}`;
      const sellExists = await redis.exists(sellKey);
      
      if (sellExists) {
        const sell = await redis.hgetall(sellKey);
        
        if (sell.timestamp && sell.soldForSol) {
          sellData = {
            baseMint: position.baseMint,
            timestamp: parseInt(sell.timestamp, 10),
            signature: sell.signature || 'unknown',
            soldForSol: parseFloat(sell.soldForSol || '0'),
            boughtForSol: parseFloat(sell.boughtForSol || position.amountInSol || '0'),
            profitLossSol: parseFloat(sell.profitLossSol || '0'),
            profitLossPercent: parseFloat(sell.profitLossPercent || '0'),
            isDryRun: (sell.isDryRun === 'true') || (position.isDryRun === 'true')
          };
          
          sells.push(sellData);
        }
      }
      
      // Create transaction object
      const transaction = {
        baseMint: position.baseMint,
        lpAddress: position.lpAddress || 'unknown',
        buyTimestamp: timestamp,
        buySignature: position.signature || 'unknown',
        amountInSol: parseFloat(position.amountInSol || '0'),
        tokenAmount: position.tokenAmount ? position.tokenAmount.toString() : '0',
        isDryRun: position.isDryRun === 'true'
      };
      
      if (sellData) {
        // Closed position
        transaction.sellTimestamp = sellData.timestamp;
        transaction.sellSignature = sellData.signature;
        transaction.soldForSol = sellData.soldForSol;
        transaction.profitLossSol = sellData.profitLossSol;
        transaction.profitLossPercent = sellData.profitLossPercent;
        transaction.holdTimeMs = sellData.timestamp - timestamp;
        transaction.isOpen = false;
      } else {
        // Open position
        transaction.isOpen = true;
      }
      
      // Apply profitability filters
      if ((args.profitable && !transaction.isOpen && transaction.profitLossSol <= 0) ||
          (args.loss && !transaction.isOpen && transaction.profitLossSol > 0)) {
        continue;
      }
      
      transactions.push(transaction);
    } catch (error) {
      logger.warn(`Error processing position ${key}: ${error.message}`);
    }
  }
  
  // 3. Look for transaction logs to supplement Redis data
  // This is a simplified approach - in production, you would have a more robust system
  try {
    const logsPath = path.join(process.cwd(), 'logs', 'transactions');
    
    if (fs.existsSync(logsPath)) {
      // Read sell manager transaction logs
      const sellManagerLogsPath = path.join(logsPath, 'sell-manager-transactions.log');
      
      if (fs.existsSync(sellManagerLogsPath)) {
        const logs = fs.readFileSync(sellManagerLogsPath, 'utf8').split('\n').filter(Boolean);
        
        for (const log of logs) {
          try {
            const logData = JSON.parse(log);
            
            // Look for successful sells
            if (logData.message && logData.message.includes('Sell completed with P/L')) {
              // Extract data from log
              const baseMint = logData.baseMint;
              const sellTimestamp = logData.timestamp || logData.time;
              const sellDate = new Date(sellTimestamp);
              
              // Skip if outside date range
              if (sellDate < args.startDate || sellDate > args.endDate) {
                continue;
              }
              
              // Skip if filtering by token
              if (args.token && baseMint !== args.token) {
                continue;
              }
              
              // Skip dry run if not included
              if (logData.isDryRun && !args.includeDryRun) {
                continue;
              }
              
              // Look for matching transaction
              const matchingIndex = transactions.findIndex(t => 
                t.baseMint === baseMint && t.isOpen && !t.sellTimestamp);
              
              if (matchingIndex >= 0) {
                // Update existing transaction
                const tx = transactions[matchingIndex];
                tx.isOpen = false;
                tx.sellTimestamp = sellTimestamp;
                tx.sellSignature = logData.signature || 'unknown';
                tx.soldForSol = logData.soldForSol || 0;
                tx.profitLossSol = logData.profitLossSol || 0;
                tx.profitLossPercent = logData.profitLossPercent || 0;
                tx.holdTimeMs = sellTimestamp - tx.buyTimestamp;
                
                // Apply profitability filters
                if ((args.profitable && tx.profitLossSol <= 0) ||
                    (args.loss && tx.profitLossSol > 0)) {
                  transactions.splice(matchingIndex, 1);
                }
              }
            }
          } catch (error) {
            // Skip invalid log entries
          }
        }
      }
    }
  } catch (error) {
    logger.warn(`Error processing transaction logs: ${error.message}`);
  }
  
  logger.info(`Retrieved ${transactions.length} transactions (${transactions.filter(t => !t.isOpen).length} closed, ${transactions.filter(t => t.isOpen).length} open)`);
  
  return { transactions, buys, sells };
}

/**
 * Calculates performance metrics from transactions
 * @param {Array} transactions - All transactions
 * @returns {Object} - Performance metrics
 */
function calculateMetrics(transactions) {
  const closedTxs = transactions.filter(tx => !tx.isOpen);
  const profitableTxs = closedTxs.filter(tx => tx.profitLossSol > 0);
  
  const totalInvested = transactions.reduce((sum, tx) => sum + tx.amountInSol, 0);
  const totalProfit = closedTxs.reduce((sum, tx) => sum + tx.profitLossSol, 0);
  const totalFees = closedTxs.length * 0.001; // Example fee calculation - adjust for actual fee structure
  
  const metrics = {
    totalTxs: transactions.length,
    closedTxs: closedTxs.length,
    openPositions: transactions.length - closedTxs.length,
    profitableTxs: profitableTxs.length,
    unprofitableTxs: closedTxs.length - profitableTxs.length,
    winRate: closedTxs.length > 0 ? (profitableTxs.length / closedTxs.length) * 100 : 0,
    totalInvested,
    totalProfit,
    totalFees,
    netProfit: totalProfit - totalFees,
    roi: totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0,
    avgProfitPercent: profitableTxs.length > 0 
      ? profitableTxs.reduce((sum, tx) => sum + tx.profitLossPercent, 0) / profitableTxs.length 
      : 0,
    avgLossPercent: (closedTxs.length - profitableTxs.length) > 0
      ? closedTxs.filter(tx => tx.profitLossSol <= 0)
          .reduce((sum, tx) => sum + tx.profitLossPercent, 0) / 
          (closedTxs.length - profitableTxs.length)
      : 0,
    avgHoldTimeMs: closedTxs.length > 0
      ? closedTxs.reduce((sum, tx) => sum + tx.holdTimeMs, 0) / closedTxs.length
      : 0,
    dryRunCount: transactions.filter(tx => tx.isDryRun).length,
    liveCount: transactions.filter(tx => !tx.isDryRun).length,
    largestProfit: profitableTxs.length > 0
      ? Math.max(...profitableTxs.map(tx => tx.profitLossSol))
      : 0,
    largestLoss: closedTxs.filter(tx => tx.profitLossSol < 0).length > 0
      ? Math.min(...closedTxs.filter(tx => tx.profitLossSol < 0).map(tx => tx.profitLossSol))
      : 0
  };
  
  return metrics;
}

/**
 * Generates time-based analysis of trading performance
 * @param {Array} transactions - All transactions
 * @returns {Object} - Time-based analysis
 */
function generateTimeAnalysis(transactions) {
  const closedTxs = transactions.filter(tx => !tx.isOpen);
  
  // Group transactions by day, week, and month
  const dailyPerformance = {};
  const weeklyPerformance = {};
  const monthlyPerformance = {};
  
  for (const tx of closedTxs) {
    const date = new Date(tx.sellTimestamp);
    
    // Format date strings
    const dayStr = date.toISOString().split('T')[0];
    const weekStr = getWeekString(date);
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // Initialize if not exists
    if (!dailyPerformance[dayStr]) {
      dailyPerformance[dayStr] = { count: 0, profit: 0, invested: 0 };
    }
    if (!weeklyPerformance[weekStr]) {
      weeklyPerformance[weekStr] = { count: 0, profit: 0, invested: 0 };
    }
    if (!monthlyPerformance[monthStr]) {
      monthlyPerformance[monthStr] = { count: 0, profit: 0, invested: 0 };
    }
    
    // Add transaction data
    dailyPerformance[dayStr].count++;
    dailyPerformance[dayStr].profit += tx.profitLossSol;
    dailyPerformance[dayStr].invested += tx.amountInSol;
    
    weeklyPerformance[weekStr].count++;
    weeklyPerformance[weekStr].profit += tx.profitLossSol;
    weeklyPerformance[weekStr].invested += tx.amountInSol;
    
    monthlyPerformance[monthStr].count++;
    monthlyPerformance[monthStr].profit += tx.profitLossSol;
    monthlyPerformance[monthStr].invested += tx.amountInSol;
  }
  
  // Calculate ROI for each period
  for (const day in dailyPerformance) {
    dailyPerformance[day].roi = dailyPerformance[day].invested > 0
      ? (dailyPerformance[day].profit / dailyPerformance[day].invested) * 100
      : 0;
  }
  
  for (const week in weeklyPerformance) {
    weeklyPerformance[week].roi = weeklyPerformance[week].invested > 0
      ? (weeklyPerformance[week].profit / weeklyPerformance[week].invested) * 100
      : 0;
  }
  
  for (const month in monthlyPerformance) {
    monthlyPerformance[month].roi = monthlyPerformance[month].invested > 0
      ? (monthlyPerformance[month].profit / monthlyPerformance[month].invested) * 100
      : 0;
  }
  
  return {
    daily: dailyPerformance,
    weekly: weeklyPerformance,
    monthly: monthlyPerformance
  };
}

/**
 * Gets ISO week string (YYYY-WW) from date
 * @param {Date} date - Input date
 * @returns {string} - Week string (YYYY-WW)
 */
function getWeekString(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Displays formatted results in the console
 * @param {Array} transactions - All transactions
 * @param {Object} metrics - Performance metrics
 * @param {Object} timeAnalysis - Time-based analysis
 * @param {Object} args - Command line arguments
 */
function displayResults(transactions, metrics, timeAnalysis, args) {
  // 1. Display overall metrics
  console.log(chalk.yellow('▶ SUMMARY METRICS'));
  console.log(`Total Transactions: ${chalk.bold(metrics.totalTxs)}`);
  console.log(`Closed Transactions: ${chalk.bold(metrics.closedTxs)}`);
  console.log(`Open Positions: ${chalk.bold(metrics.openPositions)}`);
  console.log(`Profitable Trades: ${chalk.bold.green(metrics.profitableTxs)}`);
  console.log(`Unprofitable Trades: ${chalk.bold.red(metrics.unprofitableTxs)}`);
  console.log(`Win Rate: ${chalk.bold(metrics.winRate.toFixed(2))}%`);
  console.log(`Total Invested: ${chalk.bold(metrics.totalInvested.toFixed(4))} SOL (${(metrics.totalInvested * LAMPORTS_PER_SOL).toLocaleString()} lamports)`);
  
  // Display profit/loss with color
  const profitColor = metrics.netProfit >= 0 ? chalk.bold.green : chalk.bold.red;
  console.log(`Net Profit: ${profitColor(metrics.netProfit.toFixed(4))} SOL (${profitColor(metrics.roi.toFixed(2))}%)`);
  
  // Average metrics
  console.log(`Average Profit: ${chalk.green(metrics.avgProfitPercent.toFixed(2))}%`);
  console.log(`Average Loss: ${chalk.red(metrics.avgLossPercent.toFixed(2))}%`);
  console.log(`Average Hold Time: ${formatHoldTime(metrics.avgHoldTimeMs)}`);
  
  // Extremes
  console.log(`Largest Profit: ${chalk.green(metrics.largestProfit.toFixed(4))} SOL`);
  console.log(`Largest Loss: ${chalk.red(metrics.largestLoss.toFixed(4))} SOL`);
  
  // Live vs Dry Run statistics
  if (args.includeDryRun && metrics.dryRunCount > 0) {
    console.log(`\n${chalk.cyan('Mode Breakdown:')}`);
    console.log(`Live Transactions: ${chalk.bold(metrics.liveCount)}`);
    console.log(`Dry Run Transactions: ${chalk.bold(metrics.dryRunCount)}`);
  }
  
  // 2. Time-based analysis
  if (Object.keys(timeAnalysis.daily).length > 0) {
    console.log(chalk.yellow('\n▶ TIME-BASED ANALYSIS'));
    
    // Daily performance (show last 7 days)
    console.log(chalk.cyan('\nDaily Performance (recent):'));
    Object.keys(timeAnalysis.daily)
      .sort()
      .slice(-7)
      .forEach(day => {
        const data = timeAnalysis.daily[day];
        const roiColor = data.roi >= 0 ? chalk.green : chalk.red;
        console.log(`${chalk.bold(day)}: ${data.count} trades, Profit: ${roiColor(data.profit.toFixed(4))} SOL (${roiColor(data.roi.toFixed(2))}%)`);
      });
    
    // Weekly performance
    console.log(chalk.cyan('\nWeekly Performance:'));
    Object.keys(timeAnalysis.weekly)
      .sort()
      .forEach(week => {
        const data = timeAnalysis.weekly[week];
        const roiColor = data.roi >= 0 ? chalk.green : chalk.red;
        console.log(`${chalk.bold(week)}: ${data.count} trades, Profit: ${roiColor(data.profit.toFixed(4))} SOL (${roiColor(data.roi.toFixed(2))}%)`);
      });
    
    // Monthly performance
    console.log(chalk.cyan('\nMonthly Performance:'));
    Object.keys(timeAnalysis.monthly)
      .sort()
      .forEach(month => {
        const data = timeAnalysis.monthly[month];
        const roiColor = data.roi >= 0 ? chalk.green : chalk.red;
        console.log(`${chalk.bold(month)}: ${data.count} trades, Profit: ${roiColor(data.profit.toFixed(4))} SOL (${roiColor(data.roi.toFixed(2))}%)`);
      });
  }
  
  // 3. Display transactions if detailed view is requested or fewer than 10
  if (args.detailed || transactions.length <= 10) {
    console.log(chalk.yellow('\n▶ TRANSACTIONS'));
    
    const sortedTxs = [...transactions].sort((a, b) => b.buyTimestamp - a.buyTimestamp);
    
    sortedTxs.forEach((tx, index) => {
      const buyDate = new Date(tx.buyTimestamp).toISOString().replace('T', ' ').substring(0, 19);
      const mintShort = `${tx.baseMint.substring(0, 6)}...${tx.baseMint.substring(tx.baseMint.length - 4)}`;
      
      if (tx.isOpen) {
        console.log(`${chalk.dim(buyDate)} ${chalk.yellow(mintShort)} ${chalk.blue('OPEN')} - ${chalk.dim(tx.amountInSol.toFixed(4))} SOL${tx.isDryRun ? ' ' + chalk.dim('(DRY RUN)') : ''}`);
      } else {
        const sellDate = new Date(tx.sellTimestamp).toISOString().replace('T', ' ').substring(0, 19);
        const holdTime = formatHoldTime(tx.holdTimeMs);
        const profitColor = tx.profitLossSol >= 0 ? chalk.green : chalk.red;
        
        console.log(
          `${chalk.dim(buyDate)} ${chalk.yellow(mintShort)} ${profitColor(tx.profitLossPercent.toFixed(2))}% ` +
          `(${profitColor(tx.profitLossSol.toFixed(4))} SOL) ${chalk.dim(`- held for ${holdTime}`)}${tx.isDryRun ? ' ' + chalk.dim('(DRY RUN)') : ''}`
        );
      }
    });
  } else {
    // Just display recent transactions
    console.log(chalk.yellow('\n▶ RECENT TRANSACTIONS'));
    
    const recentTxs = [...transactions]
      .sort((a, b) => b.buyTimestamp - a.buyTimestamp)
      .slice(0, 10);
    
    recentTxs.forEach(tx => {
      const buyDate = new Date(tx.buyTimestamp).toISOString().replace('T', ' ').substring(0, 19);
      const mintShort = `${tx.baseMint.substring(0, 6)}...${tx.baseMint.substring(tx.baseMint.length - 4)}`;
      
      if (tx.isOpen) {
        console.log(`${chalk.dim(buyDate)} ${chalk.yellow(mintShort)} ${chalk.blue('OPEN')} - ${chalk.dim(tx.amountInSol.toFixed(4))} SOL${tx.isDryRun ? ' ' + chalk.dim('(DRY RUN)') : ''}`);
      } else {
        const sellDate = new Date(tx.sellTimestamp).toISOString().replace('T', ' ').substring(0, 19);
        const holdTime = formatHoldTime(tx.holdTimeMs);
        const profitColor = tx.profitLossSol >= 0 ? chalk.green : chalk.red;
        
        console.log(
          `${chalk.dim(buyDate)} ${chalk.yellow(mintShort)} ${profitColor(tx.profitLossPercent.toFixed(2))}% ` +
          `(${profitColor(tx.profitLossSol.toFixed(4))} SOL) ${chalk.dim(`- held for ${holdTime}`)}${tx.isDryRun ? ' ' + chalk.dim('(DRY RUN)') : ''}`
        );
      }
    });
  }
  
  // Display filter information
  if (args.token) {
    console.log(chalk.dim(`\nFiltering by token: ${args.token}`));
  }
  
  if (args.profitable) {
    console.log(chalk.dim('\nShowing only profitable trades'));
  } else if (args.loss) {
    console.log(chalk.dim('\nShowing only unprofitable trades'));
  }
  
  if (args.includeDryRun) {
    console.log(chalk.dim('\nIncluding dry run transactions'));
  }
  
  console.log(chalk.bold.blue('\n=====================================================\n'));
}

/**
 * Formats hold time in a human-readable format
 * @param {number} ms - Hold time in milliseconds
 * @returns {string} - Formatted hold time
 */
function formatHoldTime(ms) {
  if (!ms) return 'unknown';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Outputs results to a JSON file
 * @param {Array} transactions - All transactions
 * @param {Object} metrics - Performance metrics
 * @param {Object} timeAnalysis - Time-based analysis
 * @param {string} outputPath - Output file path
 */
function outputJSON(transactions, metrics, timeAnalysis, outputPath) {
  try {
    const result = {
      generatedAt: new Date().toISOString(),
      metrics,
      timeAnalysis,
      transactions: transactions.map(tx => ({
        ...tx,
        buyDate: new Date(tx.buyTimestamp).toISOString(),
        sellDate: tx.isOpen ? null : new Date(tx.sellTimestamp).toISOString(),
        holdTime: tx.isOpen ? null : formatHoldTime(tx.holdTimeMs)
      }))
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(chalk.green(`\nResults saved to ${outputPath}`));
  } catch (error) {
    logger.error(`Error outputting JSON: ${error.message}`);
    console.error(chalk.red(`Error saving results: ${error.message}`));
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`, { stack: error.stack });
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  process.exit(1);
});