/**
 * @fileoverview Winston-based logger utility for Solana memecoin sniping bot
 * Provides structured JSON logging to stdout (for Docker) and rotating files
 * Includes Chalk formatting for console output when DEBUG=true
 */

const winston = require('winston');
const { format, transports, createLogger } = winston;
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create transaction logs directory
const transactionLogsDir = path.join(logsDir, 'transactions');
if (!fs.existsSync(transactionLogsDir)) {
  fs.mkdirSync(transactionLogsDir, { recursive: true });
}

// Create error logs directory
const errorLogsDir = path.join(logsDir, 'errors');
if (!fs.existsSync(errorLogsDir)) {
  fs.mkdirSync(errorLogsDir, { recursive: true });
}

// Custom format for console output with Chalk coloring
const consoleFormat = format.printf(({ timestamp, level, message, context, ...rest }) => {
  const ts = chalk.gray(`[${timestamp}]`);
  const ctx = context ? chalk.yellow(`[${context}]`) : '';
  
  let levelOutput;
  switch (level) {
    case 'error':
      levelOutput = chalk.red.bold(`[${level.toUpperCase()}]`);
      break;
    case 'warn':
      levelOutput = chalk.yellow.bold(`[${level.toUpperCase()}]`);
      break;
    case 'info':
      levelOutput = chalk.green(`[${level.toUpperCase()}]`);
      break;
    case 'debug':
      levelOutput = chalk.blue(`[${level.toUpperCase()}]`);
      break;
    default:
      levelOutput = chalk.gray(`[${level.toUpperCase()}]`);
  }
  
  const meta = Object.keys(rest).length ? 
    chalk.gray(` ${JSON.stringify(rest)}`) : '';
  
  return `${ts} ${levelOutput} ${ctx} ${message} ${meta}`;
});

/**
 * Creates a context-specific logger instance
 * @param {string} context - The context (service/component name)
 * @returns {winston.Logger} - A configured Winston logger
 */
function createContextLogger(context) {
  // Base logger configuration
  const logger = createLogger({
    level: config.LOG_LEVEL,
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
      format.json()
    ),
    defaultMeta: { context },
    transports: [
      // Always log to console in JSON format (for Docker)
      new transports.Console({
        format: config.DEBUG
          ? format.combine(format.timestamp({ format: 'HH:mm:ss.SSS' }), consoleFormat)
          : format.combine(format.timestamp(), format.json())
      }),
      
      // Main rotating file transport
      new transports.File({
        filename: path.join(logsDir, `${context}.log`),
        maxsize: config.LOG_FILE_MAX_SIZE,
        maxFiles: config.LOG_MAX_FILES,
        tailable: true
      }),
      
      // Error-specific transport
      new transports.File({
        filename: path.join(errorLogsDir, `${context}-error.log`),
        level: 'error',
        maxsize: config.LOG_FILE_MAX_SIZE,
        maxFiles: config.LOG_MAX_FILES
      })
    ]
  });

  return logger;
}

/**
 * Creates a transaction-specific logger for detailed tx logging
 * @param {string} context - The context (service name)
 * @returns {winston.Logger} - A transaction-focused logger instance
 */
function createTransactionLogger(context) {
  return createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      format.json()
    ),
    defaultMeta: { context },
    transports: [
      // Console with specialized format for transactions
      new transports.Console({
        format: config.DEBUG
          ? format.combine(
              format.timestamp({ format: 'HH:mm:ss.SSS' }),
              format.printf(({ timestamp, level, message, signature, ...rest }) => {
                const ts = chalk.gray(`[${timestamp}]`);
                const sigOutput = signature 
                  ? chalk.cyan(`[${signature.slice(0, 8)}...${signature.slice(-8)}]`) 
                  : '';
                const msg = chalk.white(message);
                
                const meta = Object.keys(rest).length && rest.context !== context
                  ? chalk.gray(` ${JSON.stringify(rest)}`) 
                  : '';
                
                return `${ts} ${chalk.magenta('[TX]')} ${sigOutput} ${msg} ${meta}`;
              })
            )
          : format.combine(format.timestamp(), format.json())
      }),
      
      // Transaction-specific file
      new transports.File({
        filename: path.join(transactionLogsDir, `${context}-transactions.log`),
        maxsize: config.LOG_FILE_MAX_SIZE,
        maxFiles: config.LOG_MAX_FILES
      })
    ]
  });
}

module.exports = {
  createLogger: createContextLogger,
  createTransactionLogger
};