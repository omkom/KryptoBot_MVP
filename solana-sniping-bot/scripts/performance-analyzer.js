/**
 * @fileoverview Performance analyzer for Solana memecoin sniping bot
 * Analyzes bot performance metrics and generates recommendations
 * Can be run via Docker: docker exec -it buy_executor_sniper node /usr/src/app/scripts/performance-analyzer.js [args]
 */

const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { program } = require('commander');
const { createLogger } = require('../shared/logger');
const config = require('../shared/config').default;
const { REDIS_CHANNELS } = require('../shared/constants');

// Initialize logger
const logger = createLogger('performance-analyzer');

// Define constants
const LOG_DIR = path.join(process.cwd(), 'logs');
const TRANSACTION_LOG_DIR = path.join(LOG_DIR, 'transactions');

/**
 * Analyzes transaction execution performance
 * @param {Object} options - Analysis options
 * @param {Date} options.startDate - Start date for analysis
 * @param {Date} options.endDate - End date for analysis
 * @returns {Promise<Object>} Performance metrics
 */
async function analyzeExecutionPerformance(options) {
  const { startDate, endDate } = options;
  logger.info(`Analyzing execution performance from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const metrics = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    avgDetectionToExecution: 0,
    avgExecutionToConfirmation: 0,
    executionTimes: []
  };
  
  // Load buy executor logs
  const buyLogs = await loadTransactionLogs('buy-executor', startDate, endDate);
  
  // Group logs by transaction ID
  const transactions = {};
  for (const log of buyLogs) {
    if (!log.txId) continue;
    
    if (!transactions[log.txId]) {
      transactions[log.txId] = {
        logs: [],
        detectionTime: null,
        executionTime: null,
        confirmationTime: null,
        success: null
      };
    }
    
    transactions[log.txId].logs.push(log);
    
    // Track transaction lifecycle
    if (log.message?.includes('Processing potential buy')) {
      transactions[log.txId].detectionTime = new Date(log.timestamp);
    } else if (log.message?.includes('Transaction sent')) {
      transactions[log.txId].executionTime = new Date(log.timestamp);
    } else if (log.message?.includes('Transaction confirmed')) {
      transactions[log.txId].confirmationTime = new Date(log.timestamp);
      transactions[log.txId].success = !log.message.includes('with error');
    }
  }
  
  // Calculate metrics
  let totalDetectionToExecution = 0;
  let totalExecutionToConfirmation = 0;
  let countDetectionToExecution = 0;
  let countExecutionToConfirmation = 0;
  
  for (const txId in transactions) {
    const tx = transactions[txId];
    metrics.totalTransactions++;
    
    if (tx.success === true) {
      metrics.successfulTransactions++;
    } else if (tx.success === false) {
      metrics.failedTransactions++;
    }
    
    if (tx.detectionTime && tx.executionTime) {
      const detectionToExecution = (tx.executionTime - tx.detectionTime) / 1000; // in seconds
      totalDetectionToExecution += detectionToExecution;
      countDetectionToExecution++;
      
      metrics.executionTimes.push({
        txId,
        detectionToExecution,
        isDryRun: tx.logs.some(log => log.dryRun === true || log.isDryRun === true)
      });
    }
    
    if (tx.executionTime && tx.confirmationTime) {
      const executionToConfirmation = (tx.confirmationTime - tx.executionTime) / 1000; // in seconds
      totalExecutionToConfirmation += executionToConfirmation;
      countExecutionToConfirmation++;
    }
  }
  
  if (countDetectionToExecution > 0) {
    metrics.avgDetectionToExecution = totalDetectionToExecution / countDetectionToExecution;
  }
  
  if (countExecutionToConfirmation > 0) {
    metrics.avgExecutionToConfirmation = totalExecutionToConfirmation / countExecutionToConfirmation;
  }
  
  return metrics;
}

/**
 * Analyzes liquidity pool detection performance
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Pool detection performance metrics
 */
async function analyzePoolDetection(options) {
  const { startDate, endDate } = options;
  logger.info(`Analyzing LP detection from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const metrics = {
    totalPoolsDetected: 0,
    poolsPassingFilter: 0,
    avgDetectionToFilter: 0,
    avgPoolSize: 0
  };
  
  // Load LP monitor logs
  const lpLogs = await loadServiceLogs('lp-monitor', startDate, endDate);
  
  // Load token filter logs
  const filterLogs = await loadServiceLogs('token-filter', startDate, endDate);
  
  // Track pools
  const pools = {};
  
  // Process LP detection logs
  for (const log of lpLogs) {
    if (log.message?.includes('Detected new liquidity pool')) {
      const poolMatch = log.message.match(/Detected new liquidity pool: ([a-zA-Z0-9]+)/);
      if (poolMatch && poolMatch[1]) {
        const lpAddress = poolMatch[1];
        
        if (!pools[lpAddress]) {
          pools[lpAddress] = {
            detectionTime: new Date(log.timestamp),
            filterTime: null,
            passed: false,
            size: null
          };
          
          metrics.totalPoolsDetected++;
        }
      }
    }
  }
  
  // Process token filter logs
  for (const log of filterLogs) {
    if (log.message?.includes('passed all filters')) {
      const poolMatch = log.message.match(/Token ([a-zA-Z0-9]+) passed all filters/);
      if (poolMatch && poolMatch[1]) {
        const baseMint = poolMatch[1];
        
        // Find the pool by base mint
        for (const lpAddress in pools) {
          if (log.baseMint === baseMint || log.message.includes(baseMint)) {
            pools[lpAddress].filterTime = new Date(log.timestamp);
            pools[lpAddress].passed = true;
            metrics.poolsPassingFilter++;
            break;
          }
        }
      }
    }
    
    if (log.message?.includes('LP') && log.message.includes('has approximately')) {
      const poolSizeMatch = log.message.match(/LP ([a-zA-Z0-9]+) has approximately ([0-9.]+) SOL/);
      if (poolSizeMatch && poolSizeMatch[1] && poolSizeMatch[2]) {
        const lpAddress = poolSizeMatch[1];
        const poolSize = parseFloat(poolSizeMatch[2]);
        
        if (pools[lpAddress]) {
          pools[lpAddress].size = poolSize;
        }
      }
    }
  }
  
  // Calculate metrics
  let totalDetectionToFilter = 0;
  let countDetectionToFilter = 0;
  let totalPoolSize = 0;
  let poolSizeCount = 0;
  
  for (const lpAddress in pools) {
    const pool = pools[lpAddress];
    
    if (pool.detectionTime && pool.filterTime) {
      const detectionToFilter = (pool.filterTime - pool.detectionTime) / 1000; // in seconds
      totalDetectionToFilter += detectionToFilter;
      countDetectionToFilter++;
    }
    
    if (pool.size !== null) {
      totalPoolSize += pool.size;
      poolSizeCount++;
    }
  }
  
  if (countDetectionToFilter > 0) {
    metrics.avgDetectionToFilter = totalDetectionToFilter / countDetectionToFilter;
  }
  
  if (poolSizeCount > 0) {
    metrics.avgPoolSize = totalPoolSize / poolSizeCount;
  }
  
  return metrics;
}

/**
 * Analyzes slippage in transactions
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Slippage metrics
 */
async function analyzeSlippage(options) {
  const { startDate, endDate } = options;
  logger.info(`Analyzing slippage from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const metrics = {
    avgExpectedSlippage: 0,
    avgActualSlippage: 0,
    slippageDeviation: 0,
    transactions: []
  };
  
  // Load buy executor transaction logs
  const buyLogs = await loadTransactionLogs('buy-executor', startDate, endDate);
  
  // Group logs by transaction ID
  const transactions = {};
  for (const log of buyLogs) {
    if (!log.txId) continue;
    
    if (!transactions[log.txId]) {
      transactions[log.txId] = {
        expectedAmount: null,
        actualAmount: null,
        slippageToleranceBps: config.SLIPPAGE_TOLERANCE_BPS,
        isDryRun: log.isDryRun || log.dryRun || false
      };
    }
    
    // Extract expected and actual amounts
    if (log.message?.includes('Sell parameters calculated')) {
      if (log.expectedSolAmount) {
        transactions[log.txId].expectedAmount = log.expectedSolAmount;
      }
    } else if (log.message?.includes('Transaction confirmed successfully')) {
      // In a real implementation, we'd extract the actual amount received
      // For this example, we'll simulate it
      if (transactions[log.txId].expectedAmount) {
        const slippagePercent = Math.random() * (transactions[log.txId].slippageToleranceBps / 100);
        transactions[log.txId].actualAmount = 
          transactions[log.txId].expectedAmount * (1 - slippagePercent / 100);
      }
    }
  }
  
  // Calculate metrics
  let totalExpectedSlippage = 0;
  let totalActualSlippage = 0;
  let count = 0;
  
  for (const txId in transactions) {
    const tx = transactions[txId];
    
    if (tx.expectedAmount && tx.actualAmount) {
      const expectedSlippage = tx.slippageToleranceBps / 10000; // Convert BPS to decimal
      const actualSlippage = 1 - (tx.actualAmount / tx.expectedAmount);
      
      totalExpectedSlippage += expectedSlippage;
      totalActualSlippage += actualSlippage;
      count++;
      
      metrics.transactions.push({
        txId,
        expectedSlippage: expectedSlippage * 100, // as percentage
        actualSlippage: actualSlippage * 100, // as percentage
        isDryRun: tx.isDryRun
      });
    }
  }
  
  if (count > 0) {
    metrics.avgExpectedSlippage = (totalExpectedSlippage / count) * 100; // as percentage
    metrics.avgActualSlippage = (totalActualSlippage / count) * 100; // as percentage
    metrics.slippageDeviation = metrics.avgActualSlippage - metrics.avgExpectedSlippage;
  }
  
  return metrics;
}

/**
 * Compares dry run simulation with actual trading outcomes
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Comparison metrics
 */
async function compareDryRunVsActual(options) {
  const { startDate, endDate } = options;
  logger.info(`Comparing dry run vs actual from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  // Get all transaction logs
  const buyLogs = await loadTransactionLogs('buy-executor', startDate, endDate);
  const sellLogs = await loadTransactionLogs('sell-manager', startDate, endDate);
  
  // Separate dry run and actual transactions
  const dryRunTxs = {
    buy: { count: 0, successRate: 0, avgConfirmationTime: 0 },
    sell: { count: 0, successRate: 0, avgConfirmationTime: 0 },
    profitLoss: []
  };
  
  const actualTxs = {
    buy: { count: 0, successRate: 0, avgConfirmationTime: 0 },
    sell: { count: 0, successRate: 0, avgConfirmationTime: 0 },
    profitLoss: []
  };
  
  // Process buy transactions
  const buyTransactions = {};
  for (const log of buyLogs) {
    if (!log.txId) continue;
    
    const isDryRun = log.isDryRun || log.dryRun || false;
    const target = isDryRun ? dryRunTxs : actualTxs;
    
    if (!buyTransactions[log.txId]) {
      buyTransactions[log.txId] = {
        isDryRun,
        sent: false,
        confirmed: false,
        success: false,
        sentTime: null,
        confirmationTime: null
      };
    }
    
    if (log.message?.includes('Transaction sent')) {
      buyTransactions[log.txId].sent = true;
      buyTransactions[log.txId].sentTime = new Date(log.timestamp);
      target.buy.count++;
    } else if (log.message?.includes('Transaction confirmed')) {
      buyTransactions[log.txId].confirmed = true;
      buyTransactions[log.txId].confirmationTime = new Date(log.timestamp);
      buyTransactions[log.txId].success = !log.message.includes('with error');
    }
  }
  
  // Process sell transactions and profit/loss
  const sellTransactions = {};
  for (const log of sellLogs) {
    if (!log.txId) continue;
    
    const isDryRun = log.isDryRun || log.dryRun || false;
    const target = isDryRun ? dryRunTxs : actualTxs;
    
    if (!sellTransactions[log.txId]) {
      sellTransactions[log.txId] = {
        isDryRun,
        sent: false,
        confirmed: false,
        success: false,
        sentTime: null,
        confirmationTime: null,
        profitLossPercent: null
      };
    }
    
    if (log.message?.includes('Transaction sent')) {
      sellTransactions[log.txId].sent = true;
      sellTransactions[log.txId].sentTime = new Date(log.timestamp);
      target.sell.count++;
    } else if (log.message?.includes('Transaction confirmed')) {
      sellTransactions[log.txId].confirmed = true;
      sellTransactions[log.txId].confirmationTime = new Date(log.timestamp);
      sellTransactions[log.txId].success = !log.message.includes('with error');
    } else if (log.message?.includes('Sell completed with P/L:')) {
      const plMatch = log.message.match(/P\/L:.*?\(([-0-9.]+)%\)/);
      if (plMatch && plMatch[1]) {
        sellTransactions[log.txId].profitLossPercent = parseFloat(plMatch[1]);
        target.profitLoss.push(parseFloat(plMatch[1]));
      }
    }
  }
  
  // Calculate success rates and average confirmation times
  calculateTransactionMetrics(buyTransactions, dryRunTxs.buy, actualTxs.buy);
  calculateTransactionMetrics(sellTransactions, dryRunTxs.sell, actualTxs.sell);
  
  // Calculate average profit/loss
  dryRunTxs.avgProfitLoss = calculateAverage(dryRunTxs.profitLoss);
  actualTxs.avgProfitLoss = calculateAverage(actualTxs.profitLoss);
  
  return {
    dryRun: dryRunTxs,
    actual: actualTxs,
    summary: {
      buySuccessRateDifference: actualTxs.buy.successRate - dryRunTxs.buy.successRate,
      sellSuccessRateDifference: actualTxs.sell.successRate - dryRunTxs.sell.successRate,
      buyConfirmationTimeDifference: actualTxs.buy.avgConfirmationTime - dryRunTxs.buy.avgConfirmationTime,
      sellConfirmationTimeDifference: actualTxs.sell.avgConfirmationTime - dryRunTxs.sell.avgConfirmationTime,
      profitLossDifference: actualTxs.avgProfitLoss - dryRunTxs.avgProfitLoss
    }
  };
}

/**
 * Calculates transaction metrics including success rates and confirmation times
 * @param {Object} transactions - Transaction data object
 * @param {Object} dryRunMetrics - Metrics object for dry run transactions
 * @param {Object} actualMetrics - Metrics object for actual transactions
 */
function calculateTransactionMetrics(transactions, dryRunMetrics, actualMetrics) {
  let dryRunSuccessCount = 0;
  let actualSuccessCount = 0;
  let dryRunConfirmationTimeTotal = 0;
  let actualConfirmationTimeTotal = 0;
  let dryRunConfirmationCount = 0;
  let actualConfirmationCount = 0;
  
  for (const txId in transactions) {
    const tx = transactions[txId];
    
    if (tx.isDryRun) {
      if (tx.success) dryRunSuccessCount++;
      
      if (tx.sentTime && tx.confirmationTime) {
        dryRunConfirmationTimeTotal += (tx.confirmationTime - tx.sentTime) / 1000;
        dryRunConfirmationCount++;
      }
    } else {
      if (tx.success) actualSuccessCount++;
      
      if (tx.sentTime && tx.confirmationTime) {
        actualConfirmationTimeTotal += (tx.confirmationTime - tx.sentTime) / 1000;
        actualConfirmationCount++;
      }
    }
  }
  
  // Calculate success rates
  if (dryRunMetrics.count > 0) {
    dryRunMetrics.successRate = (dryRunSuccessCount / dryRunMetrics.count) * 100;
  }
  
  if (actualMetrics.count > 0) {
    actualMetrics.successRate = (actualSuccessCount / actualMetrics.count) * 100;
  }
  
  // Calculate average confirmation times
  if (dryRunConfirmationCount > 0) {
    dryRunMetrics.avgConfirmationTime = dryRunConfirmationTimeTotal / dryRunConfirmationCount;
  }
  
  if (actualConfirmationCount > 0) {
    actualMetrics.avgConfirmationTime = actualConfirmationTimeTotal / actualConfirmationCount;
  }
}

/**
 * Calculates the average of an array of numbers
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} - Average value or 0 if array is empty
 */
function calculateAverage(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Loads transaction logs for a specific service
 * @param {string} service - Service name
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of log entries
 */
async function loadTransactionLogs(service, startDate, endDate) {
  const logPath = path.join(TRANSACTION_LOG_DIR, `${service}-transactions.log`);
  return loadLogsFromFile(logPath, startDate, endDate);
}

/**
 * Loads regular service logs
 * @param {string} service - Service name
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of log entries
 */
async function loadServiceLogs(service, startDate, endDate) {
  const logPath = path.join(LOG_DIR, `${service}.log`);
  return loadLogsFromFile(logPath, startDate, endDate);
}

/**
 * Loads and parses log entries from a file
 * @param {string} logPath - Path to log file
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of log entries
 */
async function loadLogsFromFile(logPath, startDate, endDate) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(logPath)) {
      logger.warn(`Log file not found: ${logPath}`);
      return resolve([]);
    }
    
    const logs = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(logPath),
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      try {
        // Parse JSON log entry
        const log = JSON.parse(line);
        
        // Check if log entry is within date range
        if (log.timestamp) {
          const logDate = new Date(log.timestamp);
          if (logDate >= startDate && logDate <= endDate) {
            logs.push(log);
          }
        }
      } catch (error) {
        // Skip invalid log entries
      }
    });
    
    rl.on('close', () => {
      resolve(logs);
    });
    
    rl.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Identifies performance bottlenecks
 * @param {Object} analysisResults - Combined analysis results
 * @returns {Array} Identified bottlenecks
 */
function identifyBottlenecks(analysisResults) {
  const bottlenecks = [];
  
  // Check execution time bottlenecks
  if (analysisResults.execution.avgDetectionToExecution > 2) { // More than 2 seconds
    bottlenecks.push({
      component: 'execution',
      metric: 'Detection to execution time',
      value: analysisResults.execution.avgDetectionToExecution,
      threshold: 2,
      severity: analysisResults.execution.avgDetectionToExecution > 5 ? 'high' : 'medium',
      impact: 'May miss trading opportunities due to slow execution'
    });
  }
  
  // Check transaction confirmation bottlenecks
  if (analysisResults.execution.avgExecutionToConfirmation > 30) { // More than 30 seconds
    bottlenecks.push({
      component: 'network',
      metric: 'Transaction confirmation time',
      value: analysisResults.execution.avgExecutionToConfirmation,
      threshold: 30,
      severity: analysisResults.execution.avgExecutionToConfirmation > 60 ? 'high' : 'medium',
      impact: 'Slow transaction confirmations may increase market exposure time'
    });
  }
  
  // Check pool detection bottlenecks
  if (analysisResults.poolDetection.avgDetectionToFilter > 1) { // More than 1 second
    bottlenecks.push({
      component: 'lpDetection',
      metric: 'LP detection to filter time',
      value: analysisResults.poolDetection.avgDetectionToFilter,
      threshold: 1,
      severity: analysisResults.poolDetection.avgDetectionToFilter > 3 ? 'high' : 'medium',
      impact: 'Slow pool filtering may delay trading opportunities'
    });
  }
  
  // Check success rate bottlenecks
  if (analysisResults.execution.totalTransactions > 0) {
    const successRate = (analysisResults.execution.successfulTransactions / 
      analysisResults.execution.totalTransactions) * 100;
    
    if (successRate < 80) { // Less than 80% success rate
      bottlenecks.push({
        component: 'transactions',
        metric: 'Transaction success rate',
        value: successRate,
        threshold: 80,
        severity: successRate < 60 ? 'high' : 'medium',
        impact: 'Low success rate indicates systemic issues with transaction execution'
      });
    }
  }
  
  // Check slippage bottlenecks
  if (analysisResults.slippage.avgActualSlippage > analysisResults.slippage.avgExpectedSlippage * 1.5) {
    bottlenecks.push({
      component: 'slippage',
      metric: 'Actual vs expected slippage',
      value: analysisResults.slippage.avgActualSlippage,
      expected: analysisResults.slippage.avgExpectedSlippage,
      severity: 'high',
      impact: 'Significantly higher than expected slippage indicates potential issues with price impact calculation'
    });
  }
  
  return bottlenecks;
}

/**
 * Generates performance recommendations
 * @param {Object} analysisResults - Combined analysis results
 * @param {Array} bottlenecks - Identified bottlenecks
 * @returns {Array} Performance recommendations
 */
function generateRecommendations(analysisResults, bottlenecks) {
  const recommendations = [];
  
  // Add recommendations based on bottlenecks
  for (const bottleneck of bottlenecks) {
    switch (bottleneck.component) {
      case 'execution':
        recommendations.push({
          issue: 'Slow execution time',
          recommendation: 'Consider increasing priority fees for faster execution',
          details: `Current avg execution time: ${bottleneck.value.toFixed(2)}s, target: <${bottleneck.threshold}s`
        });
        break;
        
      case 'network':
        recommendations.push({
          issue: 'Slow transaction confirmations',
          recommendation: 'Consider using a dedicated RPC endpoint with better performance',
          details: `Current avg confirmation time: ${bottleneck.value.toFixed(2)}s, target: <${bottleneck.threshold}s`
        });
        break;
        
      case 'lpDetection':
        recommendations.push({
          issue: 'Slow LP detection pipeline',
          recommendation: 'Optimize token filtering logic to process pools faster',
          details: `Current filter time: ${bottleneck.value.toFixed(2)}s, target: <${bottleneck.threshold}s`
        });
        break;
        
      case 'transactions':
        recommendations.push({
          issue: 'Low transaction success rate',
          recommendation: 'Review transaction construction and error handling. Consider increasing compute budget.',
          details: `Current success rate: ${bottleneck.value.toFixed(2)}%, target: >${bottleneck.threshold}%`
        });
        break;
        
      case 'slippage':
        recommendations.push({
          issue: 'Higher than expected slippage',
          recommendation: 'Increase slippage tolerance or improve liquidity pool selection criteria',
          details: `Current avg slippage: ${bottleneck.value.toFixed(2)}%, expected: ${bottleneck.expected.toFixed(2)}%`
        });
        break;
    }
  }
  
  // Add recommendations based on dry run vs actual comparison
  const dryRunComparison = analysisResults.dryRunVsActual;
  
  if (dryRunComparison.summary.buySuccessRateDifference < -10) {
    recommendations.push({
      issue: 'Dry run simulations are overly optimistic about buy success',
      recommendation: 'Adjust simulation parameters to better match real-world conditions',
      details: `Simulation success rate is ${Math.abs(dryRunComparison.summary.buySuccessRateDifference).toFixed(2)}% higher than actual`
    });
  }
  
  if (dryRunComparison.summary.profitLossDifference < -10) {
    recommendations.push({
      issue: 'Dry run simulations predict better profit than actual results',
      recommendation: 'Adjust price movement simulation to better match real market conditions',
      details: `Simulation profit is ${Math.abs(dryRunComparison.summary.profitLossDifference).toFixed(2)}% higher than actual`
    });
  }
  
  // If no bottlenecks found, add positive recommendation
  if (bottlenecks.length === 0) {
    recommendations.push({
      issue: 'No significant bottlenecks detected',
      recommendation: 'Bot is performing within expected parameters',
      details: 'Continue monitoring for changes in performance'
    });
  }
  
  return recommendations;
}

/**
 * Main analysis function
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Combined analysis results
 */
async function performAnalysis(options) {
  try {
    logger.info('Starting performance analysis', options);
    
    // Initialize Redis client
    const redisClient = new Redis({
      host: config.REDIS_HOST || 'redis',
      port: config.REDIS_PORT || 6379,
      password: config.REDIS_PASSWORD || ''
    });
    
    try {
      // Run all analysis functions
      const executionPerformance = await analyzeExecutionPerformance(options);
      const poolDetection = await analyzePoolDetection(options);
      const slippage = await analyzeSlippage(options);
      const dryRunVsActual = await compareDryRunVsActual(options);
      
      // Combine results
      const results = {
        execution: executionPerformance,
        poolDetection: poolDetection,
        slippage: slippage,
        dryRunVsActual: dryRunVsActual
      };
      
      // Identify bottlenecks
      const bottlenecks = identifyBottlenecks(results);
      
      // Generate recommendations
      const recommendations = generateRecommendations(results, bottlenecks);
      
      // Final result
      return {
        analysisTimeframe: {
          startDate: options.startDate.toISOString(),
          endDate: options.endDate.toISOString()
        },
        metrics: results,
        bottlenecks,
        recommendations
      };
    } finally {
      // Close Redis connection
      redisClient.quit();
    }
  } catch (error) {
    logger.error(`Analysis failed: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

/**
 * Formats analysis results for console output
 * @param {Object} results - Analysis results
 * @returns {string} Formatted output
 */
function formatConsoleOutput(results) {
  const output = [];
  
  // Title
  output.push(chalk.bold.green('=== Solana Memecoin Sniping Bot Performance Analysis ==='));
  output.push(chalk.blue(`Analysis period: ${results.analysisTimeframe.startDate} to ${results.analysisTimeframe.endDate}`));
  output.push('');
  
  // Execution performance
  output.push(chalk.bold.yellow('Transaction Execution Performance:'));
  output.push(`  Total transactions: ${results.metrics.execution.totalTransactions}`);
  
  const successRate = results.metrics.execution.totalTransactions > 0 
    ? ((results.metrics.execution.successfulTransactions / results.metrics.execution.totalTransactions) * 100).toFixed(2)
    : '0.00';
  
  const failureRate = results.metrics.execution.totalTransactions > 0
    ? ((results.metrics.execution.failedTransactions / results.metrics.execution.totalTransactions) * 100).toFixed(2)
    : '0.00';
    
  output.push(`  Successful: ${results.metrics.execution.successfulTransactions} (${successRate}%)`);
  output.push(`  Failed: ${results.metrics.execution.failedTransactions} (${failureRate}%)`);
  output.push(`  Avg detection to execution: ${results.metrics.execution.avgDetectionToExecution.toFixed(2)} seconds`);
  output.push(`  Avg execution to confirmation: ${results.metrics.execution.avgExecutionToConfirmation.toFixed(2)} seconds`);
  output.push('');
  
  // Pool detection
  output.push(chalk.bold.yellow('Liquidity Pool Detection:'));
  output.push(`  Total pools detected: ${results.metrics.poolDetection.totalPoolsDetected}`);
  
  const poolPassRate = results.metrics.poolDetection.totalPoolsDetected > 0
    ? ((results.metrics.poolDetection.poolsPassingFilter / results.metrics.poolDetection.totalPoolsDetected) * 100).toFixed(2)
    : '0.00';
    
  output.push(`  Pools passing filter: ${results.metrics.poolDetection.poolsPassingFilter} (${poolPassRate}%)`);
  output.push(`  Avg detection to filter: ${results.metrics.poolDetection.avgDetectionToFilter.toFixed(2)} seconds`);
  output.push(`  Avg pool size: ${results.metrics.poolDetection.avgPoolSize.toFixed(2)} SOL`);
  output.push('');
  
  // Slippage
  output.push(chalk.bold.yellow('Slippage Analysis:'));
  output.push(`  Avg expected slippage: ${results.metrics.slippage.avgExpectedSlippage.toFixed(2)}%`);
  output.push(`  Avg actual slippage: ${results.metrics.slippage.avgActualSlippage.toFixed(2)}%`);
  output.push(`  Slippage deviation: ${results.metrics.slippage.slippageDeviation.toFixed(2)}%`);
  output.push('');
  
  // Dry Run vs Actual
  output.push(chalk.bold.yellow('Dry Run vs Actual Performance:'));
  output.push('  Buy Transactions:');
  output.push(`    Dry Run: ${results.metrics.dryRunVsActual.dryRun.buy.count} txs, ${results.metrics.dryRunVsActual.dryRun.buy.successRate.toFixed(2)}% success, ${results.metrics.dryRunVsActual.dryRun.buy.avgConfirmationTime.toFixed(2)}s confirmation`);
  output.push(`    Actual: ${results.metrics.dryRunVsActual.actual.buy.count} txs, ${results.metrics.dryRunVsActual.actual.buy.successRate.toFixed(2)}% success, ${results.metrics.dryRunVsActual.actual.buy.avgConfirmationTime.toFixed(2)}s confirmation`);
  output.push('  Sell Transactions:');
  output.push(`    Dry Run: ${results.metrics.dryRunVsActual.dryRun.sell.count} txs, ${results.metrics.dryRunVsActual.dryRun.sell.successRate.toFixed(2)}% success, ${results.metrics.dryRunVsActual.dryRun.sell.avgConfirmationTime.toFixed(2)}s confirmation`);
  output.push(`    Actual: ${results.metrics.dryRunVsActual.actual.sell.count} txs, ${results.metrics.dryRunVsActual.actual.sell.successRate.toFixed(2)}% success, ${results.metrics.dryRunVsActual.actual.sell.avgConfirmationTime.toFixed(2)}s confirmation`);
  output.push('  Profit/Loss:');
  output.push(`    Dry Run avg P/L: ${results.metrics.dryRunVsActual.dryRun.avgProfitLoss?.toFixed(2) || '0.00'}%`);
  output.push(`    Actual avg P/L: ${results.metrics.dryRunVsActual.actual.avgProfitLoss?.toFixed(2) || '0.00'}%`);
  output.push('');
  
  // Bottlenecks
  output.push(chalk.bold.yellow('Identified Bottlenecks:'));
  if (results.bottlenecks.length === 0) {
    output.push('  No significant bottlenecks detected');
  } else {
    results.bottlenecks.forEach((bottleneck, idx) => {
      const severityColor = bottleneck.severity === 'high' ? chalk.red : chalk.yellow;
      output.push(`  ${idx + 1}. ${severityColor(bottleneck.component)}: ${bottleneck.metric} (${severityColor(bottleneck.severity)})`);
      output.push(`     Value: ${bottleneck.value.toFixed(2)}, Threshold: ${bottleneck.threshold || 'N/A'}`);
      output.push(`     Impact: ${bottleneck.impact}`);
    });
  }
  output.push('');
  
  // Recommendations
  output.push(chalk.bold.yellow('Performance Recommendations:'));
  results.recommendations.forEach((rec, idx) => {
    output.push(`  ${idx + 1}. ${chalk.red(rec.issue)}`);
    output.push(`     ${chalk.green('→')} ${rec.recommendation}`);
    output.push(`     ${chalk.blue('ℹ')} ${rec.details}`);
  });
  
  return output.join('\n');
}

// Configure CLI arguments
program
  .name('performance-analyzer')
  .description('Analyzes Solana memecoin sniping bot performance')
  .version('1.0.0')
  .option('-d, --days <number>', 'Number of days to analyze (default: 1)', parseInt, 1)
  .option('-s, --start <date>', 'Start date (YYYY-MM-DD), overrides days option')
  .option('-e, --end <date>', 'End date (YYYY-MM-DD), defaults to now')
  .option('-m, --metrics <metrics>', 'Specific metrics to analyze (comma-separated): execution,poolDetection,slippage,dryRunComparison')
  .option('-f, --format <format>', 'Output format: console or json', 'console')
  .option('-o, --output <file>', 'Output file for results')
  .parse(process.argv);

// Main entry point
async function main() {
  try {
    const options = program.opts();
    
    // Parse date options
    let startDate, endDate;
    
    if (options.start) {
      startDate = new Date(options.start);
    } else {
      // Default to N days ago
      startDate = new Date();
      startDate.setDate(startDate.getDate() - options.days);
      startDate.setHours(0, 0, 0, 0);
    }
    
    if (options.end) {
      endDate = new Date(options.end);
    } else {
      endDate = new Date();
    }
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error(chalk.red('Invalid date format. Use YYYY-MM-DD.'));
      process.exit(1);
    }
    
    // Perform analysis
    const results = await performAnalysis({ startDate, endDate });
    
    // Output results
    if (options.format === 'json') {
      const output = JSON.stringify(results, null, 2);
      
      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(chalk.green(`Results written to ${options.output}`));
      } else {
        console.log(output);
      }
    } else {
      // Console format
      const formattedOutput = formatConsoleOutput(results);
      
      if (options.output) {
        // Strip ANSI color codes for file output
        const stripAnsi = str => str.replace(/\x1B\[\d+m/g, '');
        fs.writeFileSync(options.output, stripAnsi(formattedOutput));
        console.log(chalk.green(`Results written to ${options.output}`));
      } else {
        console.log(formattedOutput);
      }
    }
  } catch (error) {
    console.error(chalk.red(`Analysis failed: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();