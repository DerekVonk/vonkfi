import { describe, it, expect } from 'vitest';
import { 
  hashPassword, 
  verifyPassword, 
  validatePassword, 
  generateSecurePassword,
  needsRehash
} from '../server/utils/passwordSecurity';

describe('Password Security', () => {
  describe('Password Validation', () => {
    it('should accept strong passwords', () => {
      const strongPasswords = [
        'MyStr0ng!Pass',
        'Complex@Password123',
        'Secur3#P@ssw0rd',
        'V3ry$trong1234!'
      ];

      strongPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'password',    // too common
        '123456',      // too common
        'abc',         // too short
        'password123', // too common
        'PASSWORD',    // missing lowercase/numbers/special chars
        'password1',   // missing uppercase/special chars
        'Password1',   // missing special chars
        ''             // empty
      ];

      weakPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should require minimum length', () => {
      const shortPassword = 'Abc1!';
      const result = validatePassword(shortPassword);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(err => err.includes('8 characters'))).toBe(true);
    });

    it('should require all character types', () => {
      const passwordMissingUppercase = 'password123!';
      const passwordMissingLowercase = 'PASSWORD123!';
      const passwordMissingNumbers = 'Password!';
      const passwordMissingSpecial = 'Password123';

      const results = [
        validatePassword(passwordMissingUppercase),
        validatePassword(passwordMissingLowercase),
        validatePassword(passwordMissingNumbers),
        validatePassword(passwordMissingSpecial)
      ];

      results.forEach(result => {
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Password Hashing', () => {
    it('should hash passwords securely', async () => {
      const password = 'TestPass123!';
      const hashedPassword = await hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 chars
      expect(hashedPassword.startsWith('$2b$')).toBe(true); // bcrypt prefix
    });

    it('should verify passwords correctly', async () => {
      const password = 'TestPass123!';
      const hashedPassword = await hashPassword(password);

      const isValid = await verifyPassword(password, hashedPassword);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('WrongPassword123!', hashedPassword);
      expect(isInvalid).toBe(false);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'TestPass123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2); // Due to salt
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });

    it('should reject weak passwords during hashing', async () => {
      const weakPassword = 'password';
      
      await expect(hashPassword(weakPassword)).rejects.toThrow();
    });
  });

  describe('Password Generation', () => {
    it('should generate secure passwords', () => {
      const password = generateSecurePassword(16);
      
      expect(password).toBeDefined();
      expect(password.length).toBe(16);
      
      // Should contain all required character types
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[^a-zA-Z0-9]/.test(password)).toBe(true);
    });

    it('should generate passwords of specified length', () => {
      const lengths = [12, 16, 20, 32];
      
      lengths.forEach(length => {
        const password = generateSecurePassword(length);
        expect(password.length).toBe(length);
      });
    });

    it('should generate different passwords each time', () => {
      const password1 = generateSecurePassword(16);
      const password2 = generateSecurePassword(16);
      
      expect(password1).not.toBe(password2);
    });
  });

  describe('Hash Validation', () => {
    it('should detect when rehashing is needed', () => {
      // Mock old hash with lower rounds
      const oldHash = '$2b$04$someoldhashwithonlyfourounds'; // 4 rounds (very low)
      const newHash = '$2b$12$someoldhashwithtwelverounds'; // 12 rounds (current)
      
      expect(needsRehash(oldHash)).toBe(true);
      expect(needsRehash(newHash)).toBe(false);
    });

    it('should handle invalid hashes gracefully', () => {
      const invalidHash = 'not-a-valid-hash';
      
      expect(needsRehash(invalidHash)).toBe(true); // Should default to needing rehash
    });
  });
});