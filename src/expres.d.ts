// In your express.d.ts file
import { User } from '@prisma/client';

declare global {
    namespace Express {
        interface Request {
            user: User;
        }
    }
}