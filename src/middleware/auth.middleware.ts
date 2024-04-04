import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET; // this should be stored in environment variable

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!jwtSecret) {
        console.error('JWT_SECRET is not defined');
        return res.status(500).send({ error: 'Server error' });
    }


    try {
        const decoded = jwt.verify(token, jwtSecret);
        // Type check here
        if (typeof decoded === 'object' && 'id' in decoded) {
            const user = await prisma.user.findUnique({ where: { id: (decoded as JwtPayload).id } });

            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            req.user = user;
            next();
        } else {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    } catch (error) {

        return res.status(401).json({ error: 'Unauthorized' });
    }
};

export const authenticateMachiene = async (req: Request, res: Response, next: NextFunction) => {
    const publicKey = process.env.PUBLIC_KEY ?? "";
    const token = req.headers.authorization ?? "";


    if (!token && !publicKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!jwtSecret) {
        console.error('JWT_SECRET is not defined');
        return res.status(500).send({ error: 'Server error' });
    }

    try {
        jwt.verify(token, publicKey, { algorithms: ['RS256'] }, (err, decoded) => {
            if (err) {
                return res.status(401).send('Invalid token');
            }
            // Token is valid
            next();
        });

    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}
