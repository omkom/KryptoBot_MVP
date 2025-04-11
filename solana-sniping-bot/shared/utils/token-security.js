/**
 * @fileoverview Token security utilities for Solana memecoin sniping bot
 * Provides functions for validating tokens, checking for risk factors,
 * and detecting potential scams or honeypot tokens
 */

const { PublicKey, Connection } = require('@solana/web3.js');
const { Account, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { createLogger } = require('../logger');
const { KNOWN_TOKENS } = require('../constants');

// Initialize context-specific logger
const logger = createLogger('token-security');

// Blacklisted token creators/authorities (example addresses)
const BLACKLISTED_AUTHORITIES = [
  'B2PufuMG1Vgc7WNxuiJ9VXeVgKv8sfaNuWdvJ7KnTVP3',
  '4fGqcP77GXzyCPULn8oBQfFxwQ8DvnZx7xEWsKueuEeE',
  // Add more known scam token creators
];

/**
 * Validates that a string is a valid Solana address
 * @param {string} address - The address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidSolanaAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a token is a known trusted token
 * @param {string} mintAddress - Token mint address
 * @returns {boolean} - True if trusted, false otherwise
 */
function isKnownToken(mintAddress) {
  return !!KNOWN_TOKENS[mintAddress];
}

/**
 * Analyzes token risk factors by examining mint account and authorities
 * @param {Connection} connection - Solana RPC connection
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<Object>} - Risk assessment results
 */
async function analyzeTokenRisk(connection, mintAddress) {
  try {
    // Validate input
    if (!isValidSolanaAddress(mintAddress)) {
      throw new Error('Invalid mint address');
    }
    
    // Check if it's a known token first
    if (isKnownToken(mintAddress)) {
      return {
        isRisky: false,
        riskLevel: 'safe',
        riskFactors: [],
        isTrusted: true,
        knownName: KNOWN_TOKENS[mintAddress]
      };
    }
    
    const mintPubkey = new PublicKey(mintAddress);
    
    // Fetch the token mint account
    const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
    if (!mintAccountInfo) {
      return {
        isRisky: true,
        riskLevel: 'extreme',
        riskFactors: ['Mint account does not exist'],
        isTrusted: false
      };
    }
    
    // Parse mint account data to extract risk factors
    // This is simplified - in a real implementation, you'd use proper SPL Token layouts
    const dataView = new DataView(mintAccountInfo.data.buffer);
    
    // Extract authorities from the data
    // (Real implementation would use proper layout parsing)
    const hasMintAuthority = !mintAccountInfo.data.slice(0, 32).every(byte => byte === 0);
    const hasFreezeAuthority = mintAccountInfo.data[36] !== 0;
    
    // Calculate decimals
    const decimals = mintAccountInfo.data[44];
    
    // Prepare risk assessment
    const riskFactors = [];
    
    if (hasMintAuthority) {
      riskFactors.push('Has mint authority (can create unlimited tokens)');
    }
    
    if (hasFreezeAuthority) {
      riskFactors.push('Has freeze authority (can freeze token accounts)');
    }
    
    if (decimals < 6) {
      riskFactors.push(`Low decimal places (${decimals}), may indicate non-standard token`);
    }
    
    // Check blacklisted authorities (simplified)
    const isBlacklisted = BLACKLISTED_AUTHORITIES.some(blacklisted => {
      const authorityData = mintAccountInfo.data.slice(0, 32);
      const authorityString = new PublicKey(authorityData).toString();
      return authorityString === blacklisted;
    });
    
    if (isBlacklisted) {
      riskFactors.push('Mint authority is blacklisted');
    }
    
    // Determine overall risk level
    let riskLevel = 'low';
    if (riskFactors.length > 2 || isBlacklisted) {
      riskLevel = 'extreme';
    } else if (riskFactors.length > 1) {
      riskLevel = 'high';
    } else if (riskFactors.length > 0) {
      riskLevel = 'medium';
    }
    
    return {
      isRisky: riskLevel !== 'low',
      riskLevel,
      riskFactors,
      isTrusted: false,
      hasMintAuthority,
      hasFreezeAuthority,
      decimals
    };
  } catch (error) {
    logger.error(`Error analyzing token risk for ${mintAddress}: ${error.message}`);
    return {
      isRisky: true,
      riskLevel: 'unknown',
      riskFactors: [`Error during analysis: ${error.message}`],
      isTrusted: false,
      error: error.message
    };
  }
}

/**
 * Checks for signs that a token might be a honeypot
 * (prevents selling, rug pulls, etc.)
 * @param {Connection} connection - Solana RPC connection
 * @param {string} mintAddress - Token mint address
 * @param {string} lpAddress - Liquidity pool address
 * @returns {Promise<Object>} - Honeypot detection results
 */
async function detectHoneypot(connection, mintAddress, lpAddress) {
  try {
    // This is a simplified implementation.
    // A real honeypot detector would:
    // 1. Analyze token program for sell restrictions
    // 2. Check if LP is locked or can be drained
    // 3. Analyze token transfer fees
    // 4. Check past transactions for successful sells
    
    const riskAssessment = await analyzeTokenRisk(connection, mintAddress);
    
    // If the token already has concerning risk factors, it might be a honeypot
    if (riskAssessment.riskLevel === 'extreme' || riskAssessment.riskLevel === 'high') {
      return {
        isPotentialHoneypot: true,
        confidence: 'medium',
        reasons: riskAssessment.riskFactors,
        details: 'High risk token detected'
      };
    }
    
    // Check LP account ownership and permissions
    const lpPubkey = new PublicKey(lpAddress);
    const lpAccountInfo = await connection.getAccountInfo(lpPubkey);
    
    if (!lpAccountInfo) {
      return {
        isPotentialHoneypot: true,
        confidence: 'high',
        reasons: ['LP account does not exist'],
        details: 'Invalid LP address'
      };
    }
    
    // In a full implementation, you would analyze the LP account data
    // and check if the LP tokens are locked, if there are admin controls, etc.
    
    return {
      isPotentialHoneypot: false,
      confidence: 'medium',
      reasons: [],
      details: 'No obvious honeypot indicators found'
    };
  } catch (error) {
    logger.error(`Error detecting honeypot for ${mintAddress}: ${error.message}`);
    return {
      isPotentialHoneypot: true,
      confidence: 'low',
      reasons: [`Error during analysis: ${error.message}`],
      details: 'Could not complete honeypot detection'
    };
  }
}

/**
 * Performs comprehensive token validation including security checks
 * @param {Object} params - Validation parameters
 * @param {Connection} params.connection - Solana RPC connection
 * @param {string} params.mintAddress - Token mint address
 * @param {string} params.lpAddress - Liquidity pool address
 * @param {Object} params.options - Optional validation options
 * @returns {Promise<Object>} - Validation results
 */
async function validateToken(params) {
  const { connection, mintAddress, lpAddress, options = {} } = params;
  
  try {
    logger.debug(`Validating token: ${mintAddress}`);
    
    // Check for valid addresses
    if (!isValidSolanaAddress(mintAddress) || !isValidSolanaAddress(lpAddress)) {
      return {
        isValid: false,
        reason: 'Invalid addresses provided',
        details: {
          validMint: isValidSolanaAddress(mintAddress),
          validLp: isValidSolanaAddress(lpAddress)
        }
      };
    }
    
    // Check if token is known
    if (isKnownToken(mintAddress)) {
      return {
        isValid: true,
        isTrusted: true,
        knownName: KNOWN_TOKENS[mintAddress],
        details: {
          validMint: true,
          validLp: true,
          riskAssessment: {
            isRisky: false,
            riskLevel: 'safe',
            riskFactors: []
          }
        }
      };
    }
    
    // Run token risk analysis
    const riskAssessment = await analyzeTokenRisk(connection, mintAddress);
    
    // Run honeypot detection if specified
    let honeypotAssessment = null;
    if (options.detectHoneypot) {
      honeypotAssessment = await detectHoneypot(connection, mintAddress, lpAddress);
    }
    
    // Combine all validations to determine overall validity
    const isValid = 
      !riskAssessment.isRisky || 
      (options.allowRisky && riskAssessment.riskLevel !== 'extreme');
    
    const isPotentialHoneypot = 
      honeypotAssessment && honeypotAssessment.isPotentialHoneypot;
    
    // If honeypot detection was requested and it's a potential honeypot, mark as invalid
    const finalIsValid = isValid && (!options.detectHoneypot || !isPotentialHoneypot);
    
    return {
      isValid: finalIsValid,
      isTrusted: riskAssessment.isTrusted,
      reason: !finalIsValid ? 
        (isPotentialHoneypot ? 'Potential honeypot detected' : 'Token failed risk assessment') : 
        null,
      details: {
        validMint: true,
        validLp: true,
        riskAssessment,
        honeypotAssessment: honeypotAssessment || undefined
      }
    };
  } catch (error) {
    logger.error(`Error validating token ${mintAddress}: ${error.message}`);
    return {
      isValid: false,
      reason: `Validation error: ${error.message}`,
      details: {
        error: error.message
      }
    };
  }
}

module.exports = {
  isValidSolanaAddress,
  isKnownToken,
  analyzeTokenRisk,
  detectHoneypot,
  validateToken
};
