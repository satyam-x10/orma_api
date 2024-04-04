import express from 'express';
// import * as eventController from '../controllers/event.controller';
// import * as photoController from '../controllers/photo.controller';
import * as post from '../controllers/post.controller';
// import { authenticate } from '../middleware/auth.middleware';
import { authenticateMachiene } from '../middleware/auth.middleware';
// import multer from 'multer';
const router = express.Router();

router.get('/getpost', authenticateMachiene, post.getPost);
router.post('/updatePost', authenticateMachiene, post?.updatePostStatus);

export default router;
