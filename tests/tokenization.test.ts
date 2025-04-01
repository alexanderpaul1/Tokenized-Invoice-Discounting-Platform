import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Clarity contract environment
const mockBlockHeight = 100;
const mockTxSender = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
const mockRecipient = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG';

// Mock storage
let mockInvoiceTokens = {};
let mockInvoiceToToken = {};
let mockTokenTransfers = {};
let mockAdmin = mockTxSender;
let mockTokenCounter = 0;

// Mock contract functions
const contractFunctions = {
  'is-admin': () => mockTxSender === mockAdmin,
  
  'tokenize-invoice': (invoiceId, faceValue, discountRate, maturityDate) => {
    if (invoiceId.length === 0) return { err: 2 };
    if (faceValue <= 0) return { err: 2 };
    if (discountRate > 100) return { err: 2 };
    if (maturityDate <= mockBlockHeight) return { err: 2 };
    if (mockInvoiceToToken[invoiceId]) return { err: 4 };
    
    const tokenId = mockTokenCounter;
    mockTokenCounter++;
    
    mockInvoiceTokens[tokenId] = {
      'invoice-id': invoiceId,
      owner: mockTxSender,
      'face-value': faceValue,
      'discount-rate': discountRate,
      'maturity-date': maturityDate,
      status: 'active',
      'created-at': mockBlockHeight
    };
    
    mockInvoiceToToken[invoiceId] = { 'token-id': tokenId };
    
    return { ok: tokenId };
  },
  
  'transfer-token': (tokenId, recipient) => {
    const token = mockInvoiceTokens[tokenId];
    if (!token) return { err: 3 };
    if (token.owner !== mockTxSender) return { err: 5 };
    
    mockInvoiceTokens[tokenId] = {
      ...token,
      owner: recipient
    };
    
    mockTokenTransfers[mockTokenCounter] = {
      'token-id': tokenId,
      from: mockTxSender,
      to: recipient,
      amount: token['face-value'],
      timestamp: mockBlockHeight
    };
    
    mockTokenCounter++;
    
    return { ok: true };
  },
  
  'get-token': (tokenId) => {
    return mockInvoiceTokens[tokenId] || null;
  },
  
  'get-token-for-invoice': (invoiceId) => {
    return mockInvoiceToToken[invoiceId] || null;
  },
  
  'calculate-current-value': (tokenId) => {
    const token = mockInvoiceTokens[tokenId];
    if (!token) return 0;
    
    const faceValue = token['face-value'];
    const discountRate = token['discount-rate'];
    const maturityDate = token['maturity-date'];
    const timeToMaturity = maturityDate > mockBlockHeight ? maturityDate - mockBlockHeight : 0;
    
    if (timeToMaturity === 0) {
      return faceValue;
    } else {
      return faceValue - Math.floor((faceValue * discountRate * timeToMaturity) / 10000);
    }
  },
  
  'set-token-status': (tokenId, newStatus) => {
    const token = mockInvoiceTokens[tokenId];
    if (!token) return { err: 3 };
    if (mockTxSender !== mockAdmin && mockTxSender !== token.owner) return { err: 1 };
    
    mockInvoiceTokens[tokenId] = {
      ...token,
      status: newStatus
    };
    
    return { ok: true };
  },
  
  'set-admin': (newAdmin) => {
    if (mockTxSender !== mockAdmin) return { err: 1 };
    mockAdmin = newAdmin;
    return { ok: true };
  }
};

describe('Tokenization Contract', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockInvoiceTokens = {};
    mockInvoiceToToken = {};
    mockTokenTransfers = {};
    mockAdmin = mockTxSender;
    mockTokenCounter = 0;
  });
  
  describe('tokenize-invoice', () => {
    it('should tokenize a valid invoice', () => {
      const result = contractFunctions['tokenize-invoice'](
          'INV-001',
          10000,
          5, // 5% discount rate
          mockBlockHeight + 90 // 90 blocks until maturity
      );
      
      expect(result).toEqual({ ok: 0 });
      expect(mockInvoiceTokens[0]).toBeDefined();
      expect(mockInvoiceTokens[0]['face-value']).toBe(10000);
      expect(mockInvoiceTokens[0].status).toBe('active');
      expect(mockInvoiceToToken['INV-001']).toEqual({ 'token-id': 0 });
    });
    
    it('should reject tokenization with invalid data', () => {
      const result = contractFunctions['tokenize-invoice'](
          'INV-002',
          0, // Invalid face value
          5,
          mockBlockHeight + 90
      );
      
      expect(result).toEqual({ err: 2 });
      expect(mockInvoiceTokens[0]).toBeUndefined();
    });
    
    it('should reject tokenization with past maturity date', () => {
      const result = contractFunctions['tokenize-invoice'](
          'INV-003',
          10000,
          5,
          mockBlockHeight - 1 // Past maturity date
      );
      
      expect(result).toEqual({ err: 2 });
      expect(mockInvoiceTokens[0]).toBeUndefined();
    });
    
    it('should reject tokenization of already tokenized invoice', () => {
      // First tokenization
      contractFunctions['tokenize-invoice'](
          'INV-004',
          10000,
          5,
          mockBlockHeight + 90
      );
      
      // Second tokenization attempt
      const result = contractFunctions['tokenize-invoice'](
          'INV-004',
          12000,
          6,
          mockBlockHeight + 120
      );
      
      expect(result).toEqual({ err: 4 });
      expect(mockInvoiceTokens[0]['face-value']).toBe(10000); // Original value should remain
    });
  });
  
  describe('transfer-token', () => {
    beforeEach(() => {
      // Create a test token
      contractFunctions['tokenize-invoice'](
          'INV-TRANSFER',
          15000,
          7,
          mockBlockHeight + 60
      );
    });
    
    it('should transfer token to a new owner', () => {
      const result = contractFunctions['transfer-token'](
          0, // token ID
          mockRecipient
      );
      
      expect(result).toEqual({ ok: true });
      expect(mockInvoiceTokens[0].owner).toBe(mockRecipient);
      expect(mockTokenTransfers[1]).toBeDefined();
      expect(mockTokenTransfers[1].from).toBe(mockTxSender);
      expect(mockTokenTransfers[1].to).toBe(mockRecipient);
    });
    
    it('should reject transfer of non-existent token', () => {
      const result = contractFunctions['transfer-token'](
          999, // non-existent token ID
          mockRecipient
      );
      
      expect(result).toEqual({ err: 3 });
    });
    
    it('should reject transfer from non-owner', () => {
      // First transfer to recipient
      contractFunctions['transfer-token'](0, mockRecipient);
      
      // Attempt to transfer again from original sender
      const result = contractFunctions['transfer-token'](0, 'ST3AMFB2C5BDZ0X11P55H3KQRN9WBXSC7QZFMSD9K');
      
      expect(result).toEqual({ err: 5 });
      expect(mockInvoiceTokens[0].owner).toBe(mockRecipient); // Owner should not change
    });
  });
  
  describe('get-token and get-token-for-invoice', () => {
    beforeEach(() => {
      // Create a test token
      contractFunctions['tokenize-invoice'](
          'INV-GET',
          20000,
          8,
          mockBlockHeight + 120
      );
    });
    
    it('should get token details by token ID', () => {
      const token = contractFunctions['get-token'](0);
      
      expect(token).toBeDefined();
      expect(token['invoice-id']).toBe('INV-GET');
      expect(token['face-value']).toBe(20000);
      expect(token['discount-rate']).toBe(8);
    });
    
    it('should get token ID by invoice ID', () => {
      const tokenInfo = contractFunctions['get-token-for-invoice']('INV-GET');
      
      expect(tokenInfo).toBeDefined();
      expect(tokenInfo['token-id']).toBe(0);
    });
    
    it('should return null for non-existent token', () => {
      const token = contractFunctions['get-token'](999);
      expect(token).toBeNull();
    });
    
    it('should return null for non-tokenized invoice', () => {
      const tokenInfo = contractFunctions['get-token-for-invoice']('NON-EXISTENT');
      expect(tokenInfo).toBeNull();
    });
  });
  
  describe('calculate-current-value', () => {
    beforeEach(() => {
      // Create a test token with 10% discount rate and 100 blocks to maturity
      contractFunctions['tokenize-invoice'](
          'INV-VALUE',
          10000, // 10,000 value
          10,    // 10% discount rate
          mockBlockHeight + 100 // 100 blocks until maturity
      );
    });
    
    it('should calculate current value based on time to maturity', () => {
      const value = contractFunctions['calculate-current-value'](0);
      
      // 10,000 - (10,000 * 10 * 100) / 10000 = 10,000 - 10,000 * 0.1 = 9,000
      expect(value).toBe(9000);
    });
  });
  
  describe('set-token-status', () => {
    beforeEach(() => {
      // Create a test token
      contractFunctions['tokenize-invoice'](
          'INV-STATUS',
          25000,
          6,
          mockBlockHeight + 150
      );
    });
    
    it('should allow owner to set token status', () => {
      const result = contractFunctions['set-token-status'](
          0,
          'redeemed'
      );
      
      expect(result).toEqual({ ok: true });
      expect(mockInvoiceTokens[0].status).toBe('redeemed');
    });
    
    it('should allow admin to set token status', () => {
      // Transfer token to another user
      contractFunctions['transfer-token'](0, mockRecipient);
      
      const result = contractFunctions['set-token-status'](
          0,
          'expired'
      );
      
      expect(result).toEqual({ ok: true });
      expect(mockInvoiceTokens[0].status).toBe('expired');
    });
    
  });
});
