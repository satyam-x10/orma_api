import { Request, Response } from 'express';
import { check, validationResult } from 'express-validator';

import { PrismaClient } from '@prisma/client';
import { getUserById } from '../controllers/user.controller';

import { error } from 'console';
const prisma = new PrismaClient();

export const getEachPostValidation = [
    check('event_hash').notEmpty().withMessage('Event hash is required'),
    check('id').notEmpty().withMessage('Post Id  is required'),
];

export const getPostValidation = [
    check('event_hash').notEmpty().withMessage('Event hash is required'),
];

export const likePostValidation = [
    check('post_id').notEmpty().withMessage('post id is required')
]

export const unlikePostValidation = [
    check('post_id').notEmpty().withMessage('post id is required')
]

export const createEventValidation = [
    check('event_hash').notEmpty().withMessage('Event hash is required'),
];

export const removeCommentValidation = [
    check('comment_id').notEmpty().withMessage('Comment ID is required'),
];

export const getEventPosts = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash, page } = req.params;
    let pageNumber = parseInt(page) ? parseInt(page) : 1;

    try {
        const posts: any = await prisma.post.findMany({
            where: { event_hash: event_hash, status: "COMPLETED", },
            orderBy: {
                id: 'desc',
            },
            include: {
                Likes: true,
                User: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
                Event: true,
                Comments: {
                    take: 5, // Limits the number of comments to 5 per post
                    orderBy: {
                        createdAt: 'desc', // Assuming you want the latest comments first
                    },
                    include: {
                        User: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                },
            },
            skip: (pageNumber - 1) * 9, // Determines the number of skipped items
            take: 9, // Determines the number of taken items per page

        });
        if (posts) {
            for (let i = 0; i < posts.length; i++) {
                let user = posts[i]?.User;
                posts[i].user = user;
                posts[i].image_url = process.env.S3_URL + 'uploads/' + posts[i].upload_url
                posts[i].compressed_url = process.env.S3_URL + posts[i].compressed_url
            }
            res.json(posts);
        } else {
            res.status(404).json({ error: 'Events not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }
};

export const getEventPost = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash, id } = req.params;
    let post_id = Number(id);
    try {
        const posts: any = await prisma.post.findFirst({
            where: { id: post_id, status: "COMPLETED", event_hash: event_hash },
            include: {
                Likes: true, User: {
                    select: {
                        id: true,
                        name: true,
                    }
                }, Event: true, Comments: {
                    take: 5, // Limits the number of comments to 5 per post
                    orderBy: {
                        createdAt: 'desc', // Assuming you want the latest comments first
                    },
                    include: {
                        User: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                },
            }
        });
        if (posts) {
            let user = posts?.User
            posts.user = user;
            posts.image_url = process.env.S3_URL + 'uploads/' + posts.upload_url
            posts.compressed_url = process.env.S3_URL + posts.compressed_url
            res.json(posts);
        } else {
            res.status(404).json({ error: 'Events not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }
};

export const getOrmaFeed = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash } = req.params;
    try {
        const events: any = await prisma.event.findUnique({
            where: {
                event_hash: event_hash
            }
        });

        let event_date = events?.event_date;
        const posts: any = await prisma.ormaFeed.findMany({
            select: {
                timeslot: true
            },
            where: {
                event_hash: event_hash,
                timeslot: {
                    gt: event_date
                }
            },
            distinct: ['timeslot'],
            orderBy: {
                timeslot: 'asc',
            }
            // Determines the number of taken items per page
        });
        if (posts) {
            res.json(posts);
        } else {
            res.status(404).json({ error: 'Events not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }

}

export const getMemories = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash } = req.params;
    const pageNo = req.query.pageNumber;
    try {
        const events: any = await prisma.event.findUnique({
            where: {
                event_hash: event_hash
            }
        });

        let event_date = events?.event_date;
        const posts: any = await prisma.post.findMany({
            where: {
                event_hash: event_hash,
                original_photo_date: {
                    lt: event_date
                },
                status: 'COMPLETED'
            },
            orderBy: {
                original_photo_date: 'desc'
            },
            include: {
                User: {
                    select: {
                        id: true,
                        name: true,
                    }
                }, Likes: true, Comments: true
            },
            skip: ((Number(pageNo) ?? 1) - 1) * 10,
            take: 10
            // Determines the number of taken items per page
        });

        if (posts) {
            for (let i = 0; i < posts.length; i++) {
                posts[i].user = posts[i]?.User;
                posts[i].image_url = process.env.S3_URL + 'uploads/' + posts[i].upload_url
                posts[i].compressed_url = process.env.S3_URL + posts[i].compressed_url
            }
            res.json(posts);
        } else {
            res.status(404).json({ error: 'Events not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }
}

export const getOrmaFeedByTimeslot = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash, timeslot } = req.params;
    const { pageNumber } = req.query;

    try {
        let page = typeof pageNumber === 'string' ? parseInt(pageNumber) : 1;
        const posts: any = await prisma.ormaFeed.findMany({
            where: {
                event_hash: event_hash,
                timeslot: timeslot,
                Post: {
                    status: 'COMPLETED'
                }
            },
            include: {
                Post: {
                    include: {
                        OrmaPostScore: true
                    }
                }
            },
            orderBy: {
                Post: {
                    OrmaPostScore: {
                        score: 'desc'
                    }
                }
            },
            skip: (page - 1) * 6, // Determines the number of skipped items
            take: 6, // Determines the number of taken items per page
        });

        if (posts) {

            // const grouped = posts.reduce((acc: any, item: any) => {
            //     let time = new Date(item.timeslot).toISOString();
            //     if (!acc[time]) {
            //         acc[time] = [];
            //     }

            //     item.Post.image_url = process.env.S3_URL + 'uploads/' + item.Post.upload_url;
            //     item.Post.compressed_url = process.env.S3_URL + item.Post.compressed_url
            //     if (item.Post.status === 'COMPLETED') acc[time].push(item);
            //     return acc;
            // }, {});

            for (let i = 0; i < posts.length; i++) {
                posts[i].Post.image_url = process.env.S3_URL + 'uploads/' + posts[i].Post.upload_url
                posts[i].Post.compressed_url = process.env.S3_URL + posts[i].Post.compressed_url
            }

            // for (let i = 0; i < posts.length; i++) {
            //     posts[i].image_url = process.env.S3_URL + 'uploads/' + posts[i].upload_url
            //     posts[i].compressed_url = process.env.S3_URL + posts[i].compressed_url
            //     // let event_category = posts[i]?.Event_Category?.category_title;

            //     // if (ormaFeed[event_category] && ormaFeed[event_category].length > 0) {
            //     //     if (ormaFeed[event_category].length < 5) {
            //     //         ormaFeed[event_category].push(posts[i]);
            //     //     }
            //     // } else {
            //     //     ormaFeed[event_category] = [posts[i]]; // initialize as an array
            //     // }
            // }
            //console.log(ormaFeed)
            res.json(posts);
        } else {
            res.status(404).json({ error: 'Events not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }

}

export const getPostsFailedByNudity = async (req: Request, res: Response) => {
    // Validate request parameters or body as needed
    const page = parseInt(req.query.page as string) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    // Ensure the user is authenticated
    if (!req.user) {
        return res.status(401).json({ errors: "Invalid token, please login again." });
    }

    const { event_hash } = req.params;
    if (!event_hash) return res.status(404).json({ errors: "Event hash not found" });
    const user = req.user;

    try {
        // Check if the authenticated user is the owner of the event
        // const event = await prisma.event.findUnique({
        //     where: { event_hash: event_hash },
        // });

        // if (!event) {
        //     return res.status(404).json({ error: 'Event not found.' });
        // }

        // if (event?.userId !== user.id) {
        //     return res.status(403).json({ error: 'Only owner of event can access this page.' });
        // }

        // Fetch posts with a status indicating failure due to nudity
        const posts: any = await prisma.post.findMany({
            where: {
                Event: {
                    event_hash: event_hash,
                    userId: user.id,
                },
                status: 'FAILEDBYNUDITY',
            },
            orderBy: {
                id: 'desc', // Order by descending order
            },
            take: limit, // Limit to 15 items at a time
            skip: skip,
            include: {
                User: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
        });
        if (!posts) {
            res.status(404).json({ message: 'Either there is no post or user is not the owner.' })
        }
        // Process posts if needed, e.g., append URLs
        if (posts) {
            for (let i = 0; i < posts.length; i++) {
                posts[i].image_url = process.env.S3_URL + 'uploads/' + posts[i].upload_url
                posts[i].compressed_url = process.env.S3_URL + posts[i].compressed_url
                posts[i].user = posts[i].User;
            }
            res.json({ data: posts, currentPage: page });
        } else {
            res.status(404).json({ error: 'Events not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    } finally {
        await prisma.$disconnect();
    }
};

export const updateGetFailedByNudityPostStatus = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!req.user) {
        return res.status(401).json({ errors: "Invalid token, please login again." });
    }
    const { event_hash, id } = req.params;
    const user = req.user;
    try {
        // Check if the event exists and if the current user is the owner
        // const event = await prisma.event.findUnique({
        //     where: { event_hash: event_hash },
        // });

        // if (!event) {
        //     return res.status(404).json({ error: 'Event not found' });
        // }

        // if (event.userId !== user?.id) {
        //     return res.status(403).json({ error: 'User is not the event owner' });
        // }

        // // Check if the post exists and its current status
        const post = await prisma.post.findUnique({
            where: { id: Number(id) },
        });

        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        if (post.status !== 'FAILEDBYNUDITY') {
            return res.status(400).json({ error: 'Post status is not FAILEDBYNUDITY' });
        }

        // // Update the post status to COMPLETED
        const updatedPost = await prisma.post.updateMany({
            where: {
                id: Number(id),
                Event: {
                    event_hash: event_hash,
                    userId: user.id,
                },
                status: 'FAILEDBYNUDITY',
            },
            data: { status: 'COMPLETED' },
        });
        if (updatedPost.count === 0) {
            return res.status(404).json({ error: 'No matching post found or user is not the event owner' });
        }
        res.json(updatedPost);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the post status' });
    }
}


export const getPendingPosts = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!req.user) {
        return res.status(401).json({ errors: "Invalid token, please login again." });
    }

    const { event_hash } = req.params;
    const user = req.user;

    try {
        const posts: any = await prisma.post.findMany({
            where: {
                event_hash: event_hash, userId: user?.id, OR: [
                    { status: "FAILEDUPLOAD" },
                    { status: "PROCESSING" },
                    { status: "READYFORPROCESSING" }
                ],
            }, orderBy: {
                id: 'desc',
            },
            include: {
                User: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
        });
        if (posts) {
            for (let i = 0; i < posts.length; i++) {
                posts[i].image_url = process.env.S3_URL + 'uploads/' + posts[i].upload_url
                posts[i].compressed_url = process.env.S3_URL + posts[i].compressed_url
                posts[i].user = posts[i].User;
            }
            res.json(posts);
        } else {
            res.status(404).json({ error: 'Events not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }
}


export const addEventPost = (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
};

export const likePost = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
        return res.status(401).json({ errors: "Invalid token, please login again." });
    }

    const { event_hash } = req.params;
    const { post_id } = req.body;
    const user = req.user;
    try {
        await prisma.likes.create({
            data: {
                post_id: Number(post_id),
                userId: user?.id,
                event_hash: event_hash
            },
        });
        res.status(200).json({
            sucess: true
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }


}

export const getLikePost = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash } = req.params;
    const { post_id } = req.body;

    try {
        const likeCount = await prisma.likes.count({
            where: {
                AND: [
                    { post_id: Number(post_id) },
                    { event_hash: event_hash }
                ]
            },
        });

        res.status(200).json({
            success: true,
            likeCount: likeCount
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    } finally {
        await prisma.$disconnect();
    }
}

export const unlikePost = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
        return res.status(401).json({ errors: "Invalid token, please login again." });
    }

    const { event_hash } = req.params;
    const { post_id } = req.body;
    const user = req.user;
    try {
        await prisma.likes.delete({
            where: {
                post_id_userId: {
                    post_id: Number(post_id),
                    userId: user?.id
                }
            },
        });
        res.status(200).json({
            sucess: true
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }

}

export const getLikePostByUser = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!req.user) {
        return res.status(401).json({ errors: "Invalid token, please login again." });
    }

    const { event_hash } = req.params;
    const { post_id } = req.body;
    const user = req.user;

    try {
        await prisma.likes.findMany({
            where: {
                AND: [
                    { post_id: Number(post_id) },
                    { event_hash: event_hash },
                    { userId: user?.id }
                ]
            },
        });
        res.status(200).json({
            sucess: true
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
    finally {
        await prisma.$disconnect();
        return;
    }


}

export const addComment = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }


    if (!req.user) {
        return res.status(401).json({ errors: 'Invalid token, please login again.' });
    }

    const { event_hash, post_id, content } = req.body;

    if (content?.length > 200) {
        return res.status(500).json({ errors: 'Comments must be under 100 chars' });
    }

    const user = req.user;

    try {
        const comment = await prisma.comment.create({

            data: {
                content: content,
                userId: user.id,
                postId: Number(post_id),
                event_hash: event_hash
            }

        },
        );

        res.status(201).json(comment);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong' });
    } finally {
        await prisma.$disconnect();
    }
};

export const getLast5Comments = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash, post_id } = req.params;

    try {
        const comments: any = await prisma.comment.findMany({
            where: {
                event_hash: event_hash,
                postId: Number(post_id),
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                User: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
            take: 5,
        });

        if (comments) {
            res.json(comments);
        } else {
            return res.status(404).json({ error: 'Comments not found' });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
};

export const getAllComments = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { event_hash, post_id } = req.params;
    try {
        const comments: any = await prisma.comment.findMany({
            where: {
                event_hash: event_hash,
                postId: Number(post_id),
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                User: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });

        if (comments) {
            return res.json({ comments: comments, totalPages: comments.length });;
        } else {
            return res.status(404).json({ error: 'Comments not found' });
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
};

export const removeComment = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    // if (req.user.id !== req.body.userId) {
    //     return res.status(400).json({ message: "not a valid user" })
    // }
    const commentId = req.params.comment_id

    try {
        const getComment = await prisma.comment.findFirst({
            where: {
                id: Number(commentId)
            }
        });

        if (getComment && getComment.userId === req?.user?.id) {
            const deletedComment = await prisma.comment.delete({
                where: {
                    id: Number(commentId),
                },
            });
            return res.status(200).json({ success: true, deletedComment })

        }

        const getEvent = await prisma.event.findFirst({
            where: {
                event_hash: getComment?.event_hash,
            }
        });

        if (getEvent && getEvent?.userId === req?.user?.id) {
            const deletedComment = await prisma.comment.delete({
                where: {
                    id: Number(commentId),
                },
            });

            return res.status(200).json({ success: true, deletedComment })
        }

        return res.status(401).json({ message: "not authorized" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
};
export const editComment = async (req: Request, res: Response) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    // //get the comment first-> Only owner of the comment and edit.
    // if()
    // //valid user
    // if (req.user.id !== req.body.userId) {
    //     return res.status(400).json({ message: "not a valid user" })
    // }
    // Check if the user is authenticated

    if (!req.user) {
        return res.status(401).json({ errors: 'Invalid token, please login again.' });
    }

    // Extract data from request
    const { comment_id } = req.params;
    const { content } = req.body;
    const user = req.user;

    // If the comment doesn't exist or the user is not the owner, return an error
    if (!comment_id || !user) {
        return res.status(404).json({ error: 'Comment not found or user not authorized.' });
    }

    try {

        const getComment = await prisma.comment.findFirst({
            where: {
                id: Number(comment_id)
            }
        });
        if (getComment && user?.id === getComment.userId) {
            // Update the comment with new content
            const updatedComment = await prisma.comment.update({
                where: {
                    id: Number(comment_id),
                },
                data: {
                    content: content,
                },
            });

            return res.status(200).json(updatedComment);
        } else {
            return res.status(404).json({ error: 'Comment not found' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
};

export const getPost = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { post_id } = req.query;
    if (post_id) {
        try {
            const posts: any = await prisma.post.findFirst({
                where: { id: Number(post_id) }
            });
            if (posts) {
                return res.json(posts);
            } else {
                return res.status(404).json({ error: 'Events not found' });
            }
        } catch (error) {
            console.log(error);
            return res.status(500).json({ error: 'Something went wrong' });
        }
    } else {
        return res.status(400).json({ error: 'Invalid Post Id' });

    }

};

export const updatePostStatus = async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { post_id, status, small_image_url, description, category } = req.body;
    if (post_id && status) {

        const status_data: any = status;
        const smallImageUrl: any = small_image_url;
        const descriptionType: any = description;

        try {
            if (small_image_url === null) {
                // Update the post status only
                await prisma.post.update({
                    where: {
                        id: Number(post_id),
                    },
                    data: {
                        status: status_data,
                    },
                });
            } else {
                // Update the post status, compressed_url, and description
                await prisma.post.update({
                    where: {
                        id: Number(post_id),
                    },
                    data: {
                        status: status_data,
                        compressed_url: smallImageUrl, // Assuming the field is named 'compressedUrl' in your Prisma schema
                        description: descriptionType,
                    },
                });
            }

            if (category) {
                const getCategoryId = await prisma.event_Category.findFirst({
                    where: {
                        category_name: {
                            contains: category,
                            mode: 'insensitive', // Optional for case-insensitive search
                        },
                    },
                });
                const category_id = getCategoryId?.id;
                if (category_id) {
                    await prisma?.ormaFeed?.update({
                        where: {
                            post_id: Number(post_id)
                        },
                        data: {
                            category_id: category_id
                        }
                    })
                }
            }

            return res?.status(200).json({
                success: true
            })
        } catch (error) {
            console.log(error);
            return res.status(500).json({ error: 'Something went wrong' });
        }
    } else {
        return res.status(400).json({ error: 'Invalid Post ID or Status' });
    }

};

export const deletePostById = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: null, errors: errors.array() });
    }

    if (!req.user) {
        return res.status(401).json({ errors: "Invalid token, please login again." });
    }

    const { event_hash, id } = req.params;
    let post_id = parseInt(id)
    const loggedUser = req.user;

    try {
        const event = await prisma.event.findUnique({ where: { event_hash } })
        const post = await prisma.post.findUnique({ where: { id: post_id } })

        if (!post || !event) {
            return res.status(404).json({ error: 'Post or event not found' });
        }

        if (post.userId === loggedUser.id || event.userId === loggedUser.id) {

            try {
                //foreign key constraint need to be deleted before deleting post
                await prisma.$transaction([
                    prisma.likes.deleteMany({ where: { post_id } }),
                    prisma.comment.deleteMany({ where: { postId: post_id } }),
                    prisma.ormaPostScore.delete({ where: { post_id } }),
                    prisma.ormaFeed.delete({ where: { post_id } }),
                    prisma.post.delete({ where: { id: post_id } })
                ])
                //204 code for successfull deletion
                return res.sendStatus(204);

            } catch (err) {
                console.log(err)
                return res.status(500).json({ error: "failed to delete post" })
            }
        } else {
            return res.status(401).json({ success: null, error: "You are not authorised for this action" })
        }
    } catch (error) {
        return res.status(500).json({ success: null, error: 'Something went wrong' })
    }
}