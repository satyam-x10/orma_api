-- CreateTable
CREATE TABLE "Otp" (
    "id" SERIAL NOT NULL,
    "request_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" CHAR(4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Otp_request_id_key" ON "Otp"("request_id");
