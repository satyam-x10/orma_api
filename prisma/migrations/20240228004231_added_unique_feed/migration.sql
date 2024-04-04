/*
  Warnings:

  - A unique constraint covering the columns `[post_id]` on the table `OrmaFeed` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "OrmaFeed_post_id_key" ON "OrmaFeed"("post_id");
