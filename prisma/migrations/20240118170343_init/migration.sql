-- CreateEnum
CREATE TYPE "STATUS" AS ENUM ('READYFORPROCESSING', 'PROCESSING', 'FAILEDUPLOAD', 'FAILEDBYNUDITY', 'COMPLETED');

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "event_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_profile_image_url" TEXT,
    "event_banner_url" TEXT,
    "event_date" TIMESTAMP(3),
    "priceId" INTEGER NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event_Category" (
    "id" SERIAL NOT NULL,
    "event_type_id" INTEGER NOT NULL,
    "category_name" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Event_Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event_Type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Event_Type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Likes" (
    "post_id" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "event_hash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "OrmaFeed" (
    "id" SERIAL NOT NULL,
    "timeslot" TIMESTAMP(3) NOT NULL,
    "post_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "event_hash" TEXT NOT NULL,

    CONSTRAINT "OrmaFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrmaPostScore" (
    "post_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "upload_url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "userId" INTEGER NOT NULL,
    "event_hash" TEXT NOT NULL,
    "compressed_url" TEXT NOT NULL DEFAULT '',
    "tiny_url" TEXT NOT NULL DEFAULT '',
    "status" "STATUS" NOT NULL DEFAULT 'READYFORPROCESSING',
    "event_category" INTEGER,
    "original_photo_date" TIMESTAMP(3),

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "phone" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL DEFAULT '',
    "Admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pricing" (
    "id" SERIAL NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "cost" TEXT NOT NULL,

    CONSTRAINT "Pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "pricingId" INTEGER NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_event_hash_key" ON "Event"("event_hash");

-- CreateIndex
CREATE UNIQUE INDEX "Likes_post_id_userId_key" ON "Likes"("post_id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrmaPostScore_post_id_key" ON "OrmaPostScore"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event_Category" ADD CONSTRAINT "Event_Category_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "Event_Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Likes" ADD CONSTRAINT "Likes_event_hash_fkey" FOREIGN KEY ("event_hash") REFERENCES "Event"("event_hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Likes" ADD CONSTRAINT "Likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Likes" ADD CONSTRAINT "Likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrmaFeed" ADD CONSTRAINT "OrmaFeed_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrmaPostScore" ADD CONSTRAINT "OrmaPostScore_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_event_hash_fkey" FOREIGN KEY ("event_hash") REFERENCES "Event"("event_hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "Pricing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
