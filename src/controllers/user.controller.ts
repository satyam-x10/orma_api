import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { check, validationResult } from 'express-validator';
require('dotenv').config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

interface VerifySearch {
    status: string,
    request_id: string,
    number: string,
    // Add other properties if present in the actual API response
}
interface MyJwtPayload {
    id: number,
    phone: string,
    name: string,
    // Add other properties you expect to be present in the JWT payload
    // For example: username: string;
}

const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET; // this should be stored in environment variable

export const registerValidation = [
    check('phone').notEmpty().withMessage('Must be a valid phone number'),
    check('phone').matches(/^[0-9]+$/).withMessage('Invalid phone number.'),
];

export const verfiedRegisterValidation = [
    check('request_id').notEmpty().withMessage('Must be a valid request id'),
    check('code').notEmpty().withMessage('Must be a valid code'),
    check('phone').notEmpty().withMessage('Must be a valid phone number'),
    check('phone').matches(/^[0-9]+$/).withMessage('Invalid phone number.'),
];

export const verifyAuthHeader = [
    check('Authorization', 'Authorization header is missing').notEmpty(),
    check('Authorization', 'Invalid authorization token').isJWT(),
];
const triggerVerify = async (phone: string) => {
    //For TWILIO Verify API
    if (process.env.AUTH_METHOD === "VERIFY") {
        const twilioVerifyAPI = await client.verify.v2
            .services(process.env.TWILIO_SERVICE_SID)
            .verifications.create({ to: '+' + phone, channel: 'sms' });
        return twilioVerifyAPI;
    }
    //For custom verification method
    const randomOTP = Math.floor(1000 + Math.random() * 9000).toString();
    const twilioResponse = await client.messages.create({
        body: `Your OTP for Orma AI is ${randomOTP}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: '+' + phone, //Twilio needs the phone number in E.164 format
    });

    return { ...twilioResponse, otp: randomOTP };
};

//For custom verification method
const subMinutes = (date: Date, minutes: number): Date => {
    const newDate = new Date(date.getTime());
    newDate.setMinutes(newDate.getMinutes() - minutes);
    return newDate;
};
const triggerVerifyCode = async (request_id: string, code: string) => {
    const response = await prisma.otp.findUnique({ where: { request_id } });
    return response?.code === code && response?.created_at >= subMinutes(new Date(Date.now()), 5) ? { status: '0' } : { status: '1' }; //returns 0 if the code is correct and it was generated within the last 5 minutes
};
const verifyPhoneByRequestID = async (request_id: string) => {
    return await prisma.otp.findUnique({ where: { request_id } });
};

//register function calls triggerVerify and saves the request_id and otp code in the database
export const register = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!jwtSecret) {
        console.error("JWT_SECRET is not defined");
        return res.status(500).send({ error: 'Server error' });
    }

    const { phone } = req.body;

    if (process.env.NODE_ENV === "development") {
        let user = await prisma.user.findUnique({ where: { phone } });

        return res.status(200).json({
            error: null,
            success: true,
            request_id: 'development',
            name: user?.name && user?.name?.length > 0 ? true : false,
            dev_code: '2024',
        });
    }
    //For TWILIO Verify API
    if (process.env.AUTH_METHOD === "VERIFY") {
        let user = await prisma.user.findUnique({ where: { phone } });
        let verify = await triggerVerify(phone);
        if (verify?.status === 'pending') {
            return res.status(200).json({
                error: null,
                success: true,
                sid: verify?.sid,
                request_id: verify?.sendCodeAttempts[0]?.attempt_sid,
                name: user?.name && user?.name?.length > 0 ? true : false,
            });
        }
    }
    //For custom verification method
    try {
        const recentOtps = await prisma.otp.findMany({
            where: {
                phone: phone,
                created_at: { gt: subMinutes(new Date(), 10) },
            },
        });
        if (recentOtps.length >= 2) {
            res.status(400).json({
                error: "Too many attempts, please try again after sometime",
                success: false,
            });
        }

        let verify = await triggerVerify(phone);
        //if the request is successful, save the request_id and otp code in the database
        if (verify?.errorCode === null) {
            await prisma.otp.create({
                data: {
                    request_id: verify?.sid,
                    phone: phone,
                    code: verify?.otp,
                    created_at: verify?.dateCreated,
                },
            });
            let user = await prisma.user.findUnique({ where: { phone } });
            res.status(200).json({
                error: null,
                success: true,
                request_id: verify?.sid,
                name: user?.name && user?.name?.length > 0 ? true : false,
            });
        } else {
            res.status(400).json({
                error: "There was an error processing the request",
                success: false,
            });
        }
    } catch (error) {
        res.status(400).json({
            error: "There was an error processing the request",
            errors: error,
        });
    } finally {
        await prisma.$disconnect();
        return;
    }
};
//it checks the request_id and code against the database and if it matches, it creates a user and returns a JWT token
export const registerVerify = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!jwtSecret) {
        console.error("JWT_SECRET is not defined");
        return res.status(500).send({ error: 'Server error' });
    }
    const { request_id, code, phone, name } = req.body;

    if (process.env.NODE_ENV === 'development') {
        if (request_id === 'development' && code === '2024') {
            let user = await prisma.user.findUnique({ where: { phone } });
            if (!user) {
                if (name) {
                    user = await prisma.user.create({
                        data: { phone, name },
                    });
                } else {
                    user = await prisma.user.create({
                        data: { phone },
                    });
                }
            }
            const token = jwt.sign({ id: user.id, phone: user.phone, name: user?.name }, jwtSecret, {
                expiresIn: '30d',
            });
            return res.status(200).json({
                success: true,
                error: null,
                token: token,
            });
        } else {
            return res.status(400).json({
                error: 'Failed to register user',
                success: false,
            });
        }
        return;
    }
    //For TWILIO Verify API
    if (process.env.AUTH_METHOD === 'VERIFY') {
        let twilioVerifyStatus = await client.verify.v2
            .services(process.env.TWILIO_SERVICE_SID)
            .verificationChecks.create({ to: '+' + phone, code: code });

        if (twilioVerifyStatus?.status === 'approved' && twilioVerifyStatus?.valid === true) {
            let user = await prisma.user.findUnique({ where: { phone } });
            if (!user) {
                if (name) {
                    user = await prisma.user.create({
                        data: { phone, name },
                    });
                } else {
                    user = await prisma.user.create({
                        data: { phone },
                    });
                }
            }
            const token = jwt.sign({ id: user.id, phone: user.phone, name: user?.name }, jwtSecret, {
                expiresIn: '30d',
            });
            return res.status(200).json({
                success: true,
                error: null,
                token: token,
                sid: twilioVerifyStatus?.sid,
            });
        } else {
            return res.status(400).json({
                error: 'Failed to register user',
                success: false,
            });
        }
    }
    //For custom verification method
    try {
        let check = await verifyPhoneByRequestID(request_id);

        if (check && check?.phone === phone) {
            let verify = await triggerVerifyCode(request_id, code);
            if (verify?.status === '0') {
                let user = await prisma.user.findUnique({ where: { phone } });
                if (!user) {
                    if (name) {
                        user = await prisma.user.create({
                            data: { phone, name },
                        });
                    } else {
                        user = await prisma.user.create({
                            data: { phone },
                        });
                    }
                }
                const token = jwt.sign({ id: user.id, phone: user.phone, name: user?.name }, jwtSecret, {
                    expiresIn: '30d',
                });
                let otpRequests = await prisma.otp.deleteMany({
                    where: { phone },
                });
                return res.json({
                    success: true,
                    error: null,
                    token: token,
                    previousOtpRequests: otpRequests,
                });
            } else {
                return res.status(400).json({
                    error: 'Failed to register user',
                    success: false,
                });
            }
        } else {
            return res.status(400).json({
                error: 'Invalid Phone Number',
                success: false,
            });
        }
    } catch (error) {
        console.log(error);
        return res.status(400).json({
            error: error,
            success: false,
        });
    } finally {
        await prisma.$disconnect();
        return;
    }
};
export const getUser = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { authorization } = req.headers;
    if (authorization && jwtSecret) {
        try {
            let decode = jwt.verify(authorization, jwtSecret) as MyJwtPayload;

            return res.status(200).json({
                error: null,
                success: true,
                user: {
                    id: decode?.id,
                    phone: decode?.phone,
                    name: decode?.name,
                },
            });
        } catch (error) {
            return res.status(401).json({ error: 'Invalid Authorization token', success: false });
        }
    } else {
        return res.status(400).json({ error: 'Empty Authorization token', success: false });
    }
};
export const getUserById = async (user_id: number) => {
    if (!user_id) return null;
    return await prisma.user.findFirst({
        where: { id: user_id },
    });
}

export const getProfile = async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { authorization } = req.headers;
    if (authorization && jwtSecret) {
        try {
            let decode = jwt.verify(authorization, jwtSecret) as MyJwtPayload;
            const userPhone = decode?.phone;
            const user = await prisma.user.findFirst({
                where: { phone: userPhone },
            });
            return res.status(200).json({
                error: null,
                success: true,
                user
            });
        } catch (error) {
            return res
                .status(401)
                .json({ error: "Invalid Authorization token", success: false });
        }
    } else {
        return res
            .status(400)
            .json({ error: "Empty Authorization token", success: false });
    }
};


export const updateUser = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { authorization } = req.headers;
        if (!authorization || !jwtSecret) {
            return res.status(400).json({ error: "Empty or invalid authorization token" });
        }

        let decode = jwt.verify(authorization, jwtSecret) as MyJwtPayload;
        const phone_no = decode?.phone;
        const newName = req.body.newName;
        const newEmail = req.body.email;

        // Find the user with the given phone number
        const user = await prisma.user.findFirst({
            where: { phone: phone_no },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Prepare the update data based on what is provided in the request body
        let updateData: any = {};
        if (newName) {
            updateData.name = newName;
        }
        if (newEmail) {
            updateData.email = newEmail;
        }

        // Update the user
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });

        res.status(200).json(updatedUser);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        await prisma.$disconnect();
    }
};

export const allevents = async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { authorization } = req.headers;
    if (authorization && jwtSecret) {
        try {
            let decode = jwt.verify(authorization, jwtSecret) as MyJwtPayload;
            const userid = decode?.id;
            const allevents = await prisma.event.findMany({
                where: { userId: userid },
                orderBy: {
                    event_date: 'desc'
                }
            });
            return res.status(200).json({
                error: null,
                success: true,
                allevents
            });
        } catch (error) {
            return res
                .status(401)
                .json({ error: "Invalid Authorization token", success: false });
        }
    } else {
        return res
            .status(400)
            .json({ error: "Empty Authorization token", success: false });
    }
};

export const getRecentlyViewed = async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { authorization } = req.headers;
    if (authorization && jwtSecret) {
        try {
            let decode = jwt.verify(authorization, jwtSecret) as MyJwtPayload;
            const userid = decode?.id;
            const recentlyViewed = await prisma.recentlyViewed.findMany({
                where: { userId: userid },
                include: {
                    Event: true
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 6
            });

            return res.status(200).json({
                error: null,
                success: true,
                recentlyViewed
            });
        } catch (error) {
            return res
                .status(401)
                .json({ error: "Invalid Authorization token", success: false });
        }
    } else {
        return res
            .status(400)
            .json({ error: "Empty Authorization token", success: false });
    }
};

export const updateRecentlyViewed = async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { authorization } = req.headers;
    if (authorization && jwtSecret) {
        try {
            let decode = jwt.verify(authorization, jwtSecret) as MyJwtPayload;
            const user_id = decode?.id;
            const event_hash = req.body.event_hash;

            const eventexist = await prisma.event.findFirst({
                where: { event_hash: event_hash },
            });
            if (!eventexist) {
                return res.status(400).json({ error: "Event does not exist", success: false });
            }
            const recentlyViewedexist = await prisma.recentlyViewed.findMany({
                where: { userId: user_id, event_hash: event_hash },
            });

            if (recentlyViewedexist.length !== 0) {
                return res.status(400).json({ error: "Event already exists in the recently viewed", success: false });
            }
            const addedtoRecentlyViewed = await prisma.recentlyViewed.create({
                data: {
                    userId: user_id,
                    event_hash: event_hash
                },
            });
            return res.status(200).json({
                error: null,
                success: true,
                recentlyviewed: addedtoRecentlyViewed
            });
        } catch (error) {
            return res
                .status(401)
                .json({ error: "Invalid Authorization token", success: false });
        }
    } else {
        return res
            .status(400)
            .json({ error: "Empty Authorization token", success: false });
    }
};
// export const getUserByIdRoute = async (req: Request, res: Response) => {
//     const user_id = Number(req.params.user_id);

//     if (isNaN(user_id)) {
//         res.status(400).json({ error: 'Invalid user ID' });
//         return;
//     }
//     return await prisma.user.findFirst({
//         where: { id: user_id }
//     });
// }