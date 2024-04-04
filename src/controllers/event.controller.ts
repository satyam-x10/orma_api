import { Pricing } from "./../../node_modules/.prisma/client/index.d";

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { check, validationResult } from "express-validator";
import { generateRandomHash } from "../utils";
import { uploadFile } from "./photo.controller";
import Stripe from "stripe";
import { decode } from "jsonwebtoken";
import { sendMessageToSQS } from '../controllers/photo.controller'
import jwt from "jsonwebtoken";
interface MyJwtPayload {
  id: number,
  phone: string,
  name: string,
  // Add other properties you expect to be present in the JWT payload
  // For example: username: string;
}
const jwtSecret = process.env.JWT_SECRET; // this should be stored in environment variable

const STRIPE_SECRET_URL = process.env.STRIPE_KEY!;

// if (!process.env.STRIPE_SECRET_TEST) {
//   throw new Error(
//     "Stripe secret key is not defined in the environment variables."
//   );
// }
const stripe = new Stripe(STRIPE_SECRET_URL);

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

const prisma = new PrismaClient();

export const createEventValidation = [
  check("name").notEmpty().withMessage("Name is required"),
  check("user_id").notEmpty().withMessage("User ID is required"),
  check("event_date").notEmpty().withMessage("Event date is required"),
];
export const getEventValidation = [
  check("event_hash").notEmpty().withMessage("Event hash is required"),
];

export const updateEventValidation = [
  check('event_name').optional({ checkFalsy: true }).isString().withMessage('Event name must be a string.'),
  check('event_date').optional({ checkFalsy: true }).isISO8601().withMessage('Event date must be a valid date.'),
];


export const makePaymentValidation = [
  check("amount").notEmpty().withMessage("Amount is required"),
  check("price_id").notEmpty().withMessage("Pricing ID is required"),
  check("id").notEmpty().withMessage("ID is required"),
  check("event_hash").notEmpty().withMessage("Event hash is required"),
];

export const makePaymentIntentValidation = [
  check("amount").notEmpty().withMessage("Amount is required"),
  check("price_id").notEmpty().withMessage("Pricing ID is required"),
  check("status").notEmpty().withMessage("Status error"),
  check("event_hash").notEmpty().withMessage("Event hash is required"),
];

export const makePayment = async (req: Request, res: Response) => {
  let { amount, id, price_id, event_hash } = req.body;
  try {
    const payment = await stripe.paymentIntents.create({
      amount,
      currency: "USD",
      description: "Orma Event Payment",
      payment_method: id,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });
    pricingUpdate(price_id, event_hash);
    res.json({
      message: "Payment successful",
      success: true,
    });
  } catch (error) {
    console.log("Error", error);
    res.json({
      message: "Payment failed",
      success: false,
    });
  }
};

export const makePaymentIntent = async (req: Request, res: Response) => {
  let { amount, price_id, event_hash, status } = req.body;
  if (status == "paymentIntent") {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "USD",
        description: "Orma Event Payment",
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
        nextAction: paymentIntent.next_action,
      });
    } catch (error) {
      console.log("Error", error);
      res.json({
        message: "Payment failed",
        success: false,
      });
    }
  } else if (status == "confirmed") {
    pricingUpdate(price_id, event_hash);
  } else {
    res.json({
      message: "Payment failed",
      success: false,
    });
  }
};

export const pricingUpdate = async (price_id: number, event_hash: string) => {
  try {
    const event = await prisma.event.update({
      where: {
        event_hash: event_hash,
      },
      data: {
        priceId: Number(price_id),
      },
    });
  } catch (e) {
    console.log(e);
  } finally {
    await prisma.$disconnect();
  }
};

export const createEvent = async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: MulterFile[] };
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const validateImage = (file: MulterFile, fieldName: string) => {
    if (!file.mimetype.startsWith("image/")) {
      return `${fieldName} must be an image file.`;
    }

    if (file.size > 5 * 1024 * 1024) {
      return `${fieldName} size exceeds the limit of 5MB.`;
    }

    return null;
  };

  const bannerValidationResult =
    files.banner && files.banner.length > 0
      ? validateImage(files.banner[0], "Banner image")
      : "Banner image is required";

  const profileImageValidationResult =
    files.profile_image && files.profile_image.length > 0
      ? validateImage(files.profile_image[0], "Profile image")
      : "Profile image is required";

  if (bannerValidationResult) {
    return res.status(400).json({ error: bannerValidationResult });
  }

  if (profileImageValidationResult) {
    return res.status(400).json({ error: profileImageValidationResult });
  }

  const { name, user_id, event_date } = req.body;

  const price_id = await getFreePricing();

  //NEEDS TO FIX THIS IN THE FUTURE
  // Retry up to 10 times in the unlikely event of a hash collision
  for (let attempt = 0; attempt < 10; attempt++) {
    const event_hash = generateRandomHash();

    try {
      const folder = `uploads/${event_hash}`;

      const bannerPath = `${folder}/banner/${files.banner[0].originalname}`;
      const profileImagePath = `${folder}/profile_image/${files.profile_image[0].originalname}`;

      const uploadBanner = await uploadFile(files.banner[0], bannerPath);
      const uploadProfile = await uploadFile(
        files.profile_image[0],
        profileImagePath
      );

      await sendMessageToSQS('', bannerPath);
      await sendMessageToSQS('', profileImagePath);


      const event_date_formatted: Date = new Date(event_date);

      if (uploadProfile !== null) {
        if (uploadBanner !== null) {
          const event = await prisma.event.create({
            data: {
              name: name,
              userId: Number(user_id),
              event_hash: event_hash,
              event_date: event_date_formatted,
              event_banner_url: process.env.S3_URL + "" + bannerPath,
              event_profile_image_url:
                process.env.S3_URL + "" + profileImagePath,
              priceId: Number(price_id),
            },
          });
          return res.status(200).json(event);
        } else {
          return res.status(500).json({ error: "Error uploading banner" });
        }
      } else {
        return res.status(500).json({ error: "Error uploading profile image" });
      }
    } catch (error: any) {
      // Check if error is due to a hash collision
      if (error.code === "P2002" && error.meta.target.includes("id")) {
        continue; // Retry with a new hash
      }
      console.log(error);
      // If error is due to something else, respond with an error
      return res.status(500).json({ error: "Something went wrong" });
    } finally {
      await prisma.$disconnect();
      return;
    }
  }

  // If we got here, we failed to create an event after 10 attempts due to hash collisions
  res
    .status(500)
    .json({ error: "Failed to create event due to hash collisions" });
};

export const updateEvent = async (req: Request, res: Response) => {
  const current_user_id = req.user.id;
  const { event_hash } = req.params;

  if (event_hash) {
    try {

      const event = await prisma.event.findUnique({
        where: { event_hash: event_hash },
      });
      // Only the event owner can update the eventDetails
      if (event?.userId !== current_user_id) {
        return res.status(400).json({ error: "You are not authorized to access this page" })
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const validateImage = (file: MulterFile, fieldName: string) => {
        if (!file.mimetype.startsWith("image/")) {
          return `${fieldName} must be an image file.`;
        }

        if (file.size > 5 * 1024 * 1024) {
          return `${fieldName} size exceeds the limit of 5MB.`;
        }

        return null;
      };

      let updateData: any = {};
      const { name, event_date } = req.body;

      if (name) updateData.name = name;
      if (event_date) updateData.event_date = new Date(event_date);

      const rand = Math.floor(Math.random() * 100);

      if (files) {
        if (files.banner && files.banner.length > 0) {
          const bannerValidationResult = validateImage(files.banner[0], "Banner image");
          if (bannerValidationResult) {
            return res.status(400).json({ error: bannerValidationResult });
          }
          const bannerPath = `uploads/${event_hash}/banner/${rand}_${files.banner[0].originalname}`;
          await uploadFile(files.banner[0], bannerPath);
          await sendMessageToSQS('', bannerPath);

          updateData.event_banner_url = process.env.S3_URL + bannerPath;
        }
        if (files.profile_image && files.profile_image.length > 0) {
          const profileImageValidationResult = validateImage(files.profile_image[0], "Profile image");
          if (profileImageValidationResult) {
            return res.status(400).json({ error: profileImageValidationResult });
          }
          const profileImagePath = `uploads/${event_hash}/profile_image/${rand}_${files.profile_image[0].originalname}`;
          await uploadFile(files.profile_image[0], profileImagePath);
          await sendMessageToSQS('', profileImagePath);
          updateData.event_profile_image_url = process.env.S3_URL + profileImagePath;
        }
      }
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'At least one field must be provided for update.' });
      }
      try {
        const updatedEvent = await prisma.event.update({
          where: { event_hash: event_hash },
          data: updateData,
        });
        return res.status(200).json({ updatedEvent });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Something went wrong while updating the event.' });
      } finally {
        await prisma.$disconnect();
      }
    } catch {
      return res.status(400).json({ error: 'There was an error updating event.' });
    }
  } else {
    return res.status(400).json({ error: 'Invalid event hash' });
  }
}


export const getEvent = async (req: Request, res: Response) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { event_hash } = req.params;
  try {
    const event = await prisma.event.findUnique({
      where: { event_hash: event_hash },
      include: {
        User: {
          select: {
            id: true,
            name: true,
          }
        },
      }
    });
    if (event) {
      res.json({
        event: event,
        error: null,
      });
    } else {
      res.status(404).json({ event: null, error: "Event not found" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ event: null, error: "Something went wrong" });
  } finally {
    await prisma.$disconnect();
  }
};

export const getPhotoCategories = async (req: Request, res: Response) => {
  try {
    const event = await prisma.event_Category.findMany();
    if (event) {
      res.json({
        categories: event,
        error: null,
      });
    } else {
      res.status(404).json({ categories: null, error: "Categories not found" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ categories: null, error: "Something went wrong" });
  } finally {
    await prisma.$disconnect();
  }
};

export const getPricing = async (req: Request, res: Response) => {
  try {
    const event = await prisma.pricing.findMany({
      include: {
        Feature: true,
      },
    });
    if (event) {
      res.json({
        pricing: event,
        error: null,
      });
    } else {
      res.status(404).json({ pricing: null, error: "Pricing not found" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ pricing: null, error: "Something went wrong" });
  } finally {
    await prisma.$disconnect();
  }
};

export const getFreePricing = async () => {
  try {
    const event = await prisma.pricing.findFirst({
      where: {
        cost: "0",
      },
      include: {
        Feature: true,
      },
    });
    if (event) {
      return event.id;
    } else {
      console.log("Cannot fetch free pricing");
    }
  } catch (error) {
    console.log(error);
  } finally {
    await prisma.$disconnect();
  }
};
export const checkLimit = async (req: Request, res: Response, next: NextFunction) => {
  const event_hash = req.params.event_hash;
  try {
    const event = await prisma.event.findFirst({
      where: {
        event_hash: event_hash,
      },
    });

    if (event) {
      const currentPosts = await prisma.post.count({
        where: {
          event_hash: event_hash,
        },
      });


      const pricing = await prisma.pricing.findFirst({
        where: {
          id: event.priceId,
        },
      });
      if (pricing) {
        const limit = pricing.guest_count * 20;
        if (currentPosts >= limit) {
          res.json({
            limitReached: true,
            error: null,
          });
          return; // Exit function without calling next()
        } else {
          next(); // Proceed to the next middleware
          return;
        }
      } else {
        res.status(404).json({ limitReached: null, error: "Limit not found" });
        return;
      }
    } else {
      console.log("Cannot fetch event limit");
      return res.status(404).json({ limitReached: null, error: "Event not found" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ limitReached: null, error: "Internal server error" });
    return;
  } finally {
    await prisma.$disconnect();
  }
};

export const checkEventExpiration = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const event_hash = req.params.event_hash;
  const { authorization } = req.headers;
  if (authorization && jwtSecret) {
    try {
      let decode = jwt.verify(authorization, jwtSecret) as MyJwtPayload;
      const event = await prisma.event.findFirst({
        where: {
          event_hash: event_hash,
        },
      });

      if (!event) {
        console.log("Event not found");
        return res
          .status(404)
          .json({ expired: false, error: "Event not found" });
      }
      const user_id = decode?.id;
      const isAdmin = user_id === event.userId; // Assuming admin_id is stored in the event object

      if (isAdmin) {
        return next(); // Admin can access event regardless of expiration
      }

      if (!event?.event_date) {
        return res
          .status(500)
          .json({ error: "Invalid Event Date, Can't upload. Contact admin" })
      }

      const creationTime = new Date(event?.event_date);
      const currentTime = new Date();
      const timeDifference = currentTime.getTime() - creationTime.getTime();
      const hoursDifference = Math.floor(timeDifference / (1000 * 60 * 60)); // Convert difference to hours

      if (hoursDifference > 112) {

        return res.json({ expired: true, error: null });
      } else {
        if (user_id) {
          return next(); // Event is not expired and user is logged in, proceed to the next middleware          
        }
        return res
          .status(401)
          .json({ expired: true, error: "User not logged in" });
      }
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ expired: true, error: "Internal server error" });
    } finally {
      await prisma.$disconnect();
    }
  }
};
