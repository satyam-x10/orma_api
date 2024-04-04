import crypto from 'crypto';

export const generateRandomHash = (length: number = 20): string => {
    return crypto.randomBytes(length).toString('hex');
}
