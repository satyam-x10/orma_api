import { Request, Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import moment from 'moment-timezone';
import { ExifParserFactory } from "ts-exif-parser";

interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
}

const spacesEndpoint = process.env.S3_URL_ENDPOINT ?? '';
const spacesRegion = 'nyc3'; // update this to your Spaces region

const s3 = new S3Client({
    endpoint: spacesEndpoint,
    region: spacesRegion, // specify the region
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? ''
    },
});


const prisma = new PrismaClient();

export const uploadToEvent = async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    //Need to update this with validation
    const maxsizeinBytes = 7 * 1024 * 1024;
    if (req.file.size > maxsizeinBytes) {
        console.log("Limit exceeded unable to upload");
        return res.status(400).json({ error: "File exceeds the 7MB limit" });
    }

    if (!req.params.event_hash) {
        return res.status(400).json({ error: "Invalid event hash" });
    }
    if (!req.user) {
        return res.status(401).json({ error: "Invalid Token, please login again" });
    }
    if (!req.body.description) {
        return res.status(500).json({ error: "Invalid category, please add a category." });
    }
    if (!req.body.original_date) {
        return res.status(500).json({ error: "Invalid Date, please add photo date." });
    }
    if (!req.body.timezone) {
        return res.status(500).json({ error: "Invalid Timezone, please add timezone." });
    }

    const parser = ExifParserFactory.create(req.file.buffer);
    const result = parser.parse();
    let creationDate;

    if (result?.tags?.DateTimeOriginal) {
        //this is local time -> we need to know which timezone it is.

        creationDate = new Date(result.tags.DateTimeOriginal * 1000);

        const year = creationDate.getUTCFullYear();
        const month = String(creationDate.getUTCMonth() + 1).padStart(2, '0'); // Add leading zero for single-digit months
        const day = String(creationDate.getUTCDate()).padStart(2, '0'); // Add leading zero for single-digit days
        const hour = String(creationDate.getUTCHours()).padStart(2, '0'); // Add leading zero for single-digit hours
        const minute = String(creationDate.getUTCMinutes()).padStart(2, '0'); // Add leading zero for single-digit minutes

        const formattedCreationDate = `${year}-${month}-${day} ${hour}:${minute}`;

        const localTimezone = req?.body?.timezone ?? "America/New_York"; // Example timezone

        const utcTime = moment.tz(formattedCreationDate, "YYYY-MM-DD HH:mm", localTimezone).utc().toDate();
        creationDate = utcTime;


    } else {
        creationDate = new Date(req?.body?.original_date);
    }




    //Generate a unique IDS
    const uniqueID = uuidv4();

    // Append the unique ID to the original filename
    const newFileName = `${uniqueID}-${req.file.originalname}`;

    const command = new PutObjectCommand({
        Bucket: process.env.BUCKET,
        Key: `uploads/${req.params.event_hash}/${newFileName}`, // Use the new filename here
        Body: req.file.buffer,
        ACL: 'public-read',
        CacheControl: 'public, max-age=86400'
    });

    try {
        await s3.send(command);
        let uploadData = await prisma.post.create({
            data: {
                upload_url: `${req.params.event_hash}/${newFileName}`,
                event_category: Number(req?.body?.description),
                userId: req?.user?.id,
                event_hash: req.params.event_hash,
                original_photo_date: creationDate
            },
        });
        let post_id_string = uploadData?.id?.toString();
        await sendMessageToSQS(post_id_string, `uploads/${req.params.event_hash}/${newFileName}`)
        await updatePostContext(uploadData?.id, Number(req?.body?.description), req.params.event_hash, creationDate);
        res.json({
            post: {
                id: uploadData?.id,
                description: req?.body?.description,
                image_url: process.env.S3_URL + `${req.params.event_hash}/${newFileName}`
            },
            message: 'File uploaded successfully'
        });
    } catch (error: any) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
    finally {
        await prisma.$disconnect();
    }
}


export const uploadFile = async (file: any, key: string) => {

    const command = new PutObjectCommand({
        Bucket: process.env.BUCKET,
        Key: key, // Use the new filename here
        Body: file.buffer,
        ACL: 'public-read',
        CacheControl: 'public, max-age=86400',
    });
    try {
        await s3.send(command);
        return key;
    } catch (e) {
        console.log(e);
        return null;
    }
}

export const getUrlSigned = async (url: string) => {
    const command = new GetObjectCommand({
        Bucket: process.env.BUCKET,
        Key: `uploads/${url}`, // Use the new filename here
    });

    try {
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiration
        return url;
    } catch (error: any) {
        return null;
    }

}
export const sendMessageToSQS = async (post_id: string, image_url: string) => {

    let queueUrl = process.env.QUEUE_URL
    const accessKeyId = process.env.ACCESSKEYID ?? "";
    const secretAccessKey = process.env.SECRETACCESSKEY ?? "";
    let messageBody;

    if (post_id) {
        messageBody = { "post_id": post_id, "image_url": image_url };
    } else {
        messageBody = { "image_url": image_url };
    }
    // Configure AWS credentials and region
    const sqsClient = new SQSClient({
        region: 'us-east-1',
        credentials: {
            accessKeyId,
            secretAccessKey,
        }
    });

    // Create the command to send the message
    const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody),
    });

    try {
        // Send the message to the SQS queue
        const response = await sqsClient.send(command);
        return true;
    } catch (error) {
        console.error('Error sending message to SQS:', error);
        return false;
    }
};

// const roundToNearestHalfHour = (time: any) => {
//     const minutes = time.minutes();
//     const remainder = minutes % 30;
//     if (remainder <= 15) {
//         time.subtract(remainder, 'minutes');
//     } else {
//         time.add(30 - remainder, 'minutes');
//     }
//     return time;
// }
const roundToNearestHalfHour = (date: any) => {
    //nearest hour-> updated
    // const minutes = time.minutes();
    // const remainder = minutes % 60; // Change the modulus to 60 for an hour
    // if (remainder <= 30) { // If less than or equal to 30 minutes, subtract to the nearest hour
    //     time.subtract(remainder, 'minutes');
    // } else {
    //     time.add(60 - remainder, 'minutes'); // Otherwise, add to the next nearest hour
    // }
    // return time;
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const milliseconds = date.getMilliseconds();

    // If the minutes are 30 or more, round up
    if (minutes >= 30) {
        date.setHours(date.getHours() + 1);
    }

    // Regardless of whether we rounded up, reset minutes, seconds, and milliseconds
    date.setMinutes(0, 0, 0); // setMinutes(min, sec, millisec)

    return date;
}

const getProperTimeStamp = async (event_hash: string) => {
    try {
        let getLastTimestamp = await prisma.ormaFeed.findFirst({
            where: {
                event_hash: event_hash
            },
            orderBy: {
                timeslot: 'desc'
            }
        });

        let lastTimeStamp = getLastTimestamp?.timeslot
        if (lastTimeStamp) {
            let checkCount = await prisma.ormaFeed.count({
                where: {
                    timeslot: lastTimeStamp,
                    event_hash: event_hash
                }
            });
            if (checkCount > 3) {
                return true;
            } else {
                //last time stamp has to be under 10 hours
                return false;
            }

        } else {
            return false;
        }
    } catch (e) {
        return false;
    }
}


export const updatePostContext = async (post_id: number, category_id: number, event_hash: string, date: Date) => {
    try {
        const timeslot = roundToNearestHalfHour(date);
        console.log(timeslot, "Creation Date", date)

        let getPhotoCategories = await prisma.event_Category.findUnique({
            where: {
                id: category_id
            }
        });
        let score = getPhotoCategories?.score ? getPhotoCategories?.score : 0;

        await prisma.ormaFeed.create({
            data: {
                timeslot: timeslot,
                post_id: post_id,
                category_id: category_id,
                event_hash: event_hash
            }
        });

        await prisma.ormaPostScore.upsert({
            where: { post_id: post_id },
            update: {
                score: score,
            },
            create: {
                post_id: post_id,
                score: score
            }
        });

        return true;
    } catch (err) {
        console.log(err);
        return false;
    }
}

