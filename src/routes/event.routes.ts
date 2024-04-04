import * as eventController from '../controllers/event.controller';
import * as photoController from '../controllers/photo.controller';
import * as post from '../controllers/post.controller';

import { authenticate } from '../middleware/auth.middleware';
import express from 'express';
import multer from 'multer';

const router = express.Router();

//authenticate, photoController.uploadValidation,

// const uploadErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
//     if (err instanceof multer.MulterError) {
//         return res.status(500).json({ error: err.message });
//     }
//     next(err);
// }

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const fileUploadMiddleware = upload.fields([
    { name: 'banner', maxCount: 1 },
    { name: 'profile_image', maxCount: 1 }
]);

router.post('/create', authenticate, fileUploadMiddleware, eventController.createEventValidation, eventController.createEvent);
router.put('/:event_hash/update', authenticate, fileUploadMiddleware, eventController.updateEventValidation, eventController.updateEvent);//

// router.get('/:event_hash', eventController.getEventValidation, eventController.getEvent);
router.get('/:event_hash', eventController.getEvent);
router.get('/:event_hash/checkLimit', authenticate, eventController.getEventValidation, eventController.checkLimit);

router.get('/:event_hash/post/:id', post.getEachPostValidation, post.getEventPost);
router.delete('/:event_hash/post/:id', post.getEachPostValidation, authenticate, post.deletePostById)
router.get('/:event_hash/ormafeed', post.getPostValidation, post.getOrmaFeed);
router.get('/:event_hash/ormafeed/memories', post.getPostValidation, post.getMemories);
router.get('/:event_hash/ormafeed/:timeslot', post.getPostValidation, post.getOrmaFeedByTimeslot);

router.get('/photo/categories', eventController.getPhotoCategories);
router.get('/photo/pricing', eventController.getPricing);
router.post('/photo/pricingupdate', eventController.makePayment);
router.post('/payment', eventController.makePaymentValidation, eventController.makePayment);
router.post('/paymentIntent', eventController.makePaymentIntentValidation, eventController.makePaymentIntent);

router.post('/:event_hash/post/like', authenticate, post.likePostValidation, post.likePost);
router.get('/:event_hash/post/like', post.likePostValidation, post.getLikePost);
router.get('/:event_hash/post/like/user', authenticate, post.likePostValidation, post.getLikePostByUser);

router.post('/:event_hash/post/unlike', authenticate, post.unlikePostValidation, post.unlikePost);
router.post('/:event_hash/post/getlikes', authenticate, post.getLikePost);


router.put('/:event_hash/getfailedbynudity/:id', authenticate, post.getEachPostValidation, post.updateGetFailedByNudityPostStatus)
router.post('/:event_hash/upload', authenticate, eventController.checkEventExpiration, eventController.checkLimit, upload.single('image'), photoController.uploadToEvent);

router.get('/:event_hash/posts/:page', post.getEventPosts);
router.get('/:event_hash/pending_posts', authenticate, post.getPendingPosts);
router.get('/:event_hash/getfailedbynudity', authenticate, post.getPostValidation, post.getPostsFailedByNudity);
router.get('/:event_hash/signed', photoController.getUrlSigned);

router.post('/:event_hash/post/:post_id/comment', authenticate, post.addComment);
router.get('/:event_hash/post/:post_id/comments/all', post.getAllComments);
router.post('/:event_hash/post/:post_id/comment/:comment_id', authenticate, post.removeCommentValidation, post.removeComment);
router.put('/:event_hash/post/:post_id/comment/:comment_id', authenticate, post.removeCommentValidation, post.editComment);

export default router;
