import * as crypto from 'crypto';

export class EncryptionUtil {
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static readonly IV_LENGTH = 16;
  
  // In production, this should come from environment variables
  // For now, using a placeholder - will be configured via env
  private static getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY || 'YOUR_32_BYTE_ENCRYPTION_KEY_HERE_CHANGE_THIS';
    return Buffer.from(key.padEnd(32, '0').substring(0, 32));
  }

  static encrypt(text: string): string {
    if (!text) return '';
    
    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(
        this.ALGORITHM,
        this.getEncryptionKey(),
        iv
      );
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  static decrypt(encryptedText: string): string {
    if (!encryptedText) return '';
    
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted text format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(
        this.ALGORITHM,
        this.getEncryptionKey(),
        iv
      );
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  static isEncrypted(text: string): boolean {
    if (!text) return false;
    // Check if the text matches the encrypted format (iv:encrypted)
    const parts = text.split(':');
    return parts.length === 2 && parts[0].length === this.IV_LENGTH * 2;
  }
}
