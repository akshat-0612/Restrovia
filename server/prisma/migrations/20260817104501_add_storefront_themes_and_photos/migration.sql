-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "heroStyle" TEXT NOT NULL DEFAULT 'banner',
ADD COLUMN     "menuTheme" TEXT NOT NULL DEFAULT 'midnight';

-- CreateTable
CREATE TABLE "storefront_photos" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storefront_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storefront_photos_restaurantId_sortOrder_idx" ON "storefront_photos"("restaurantId", "sortOrder");

-- AddForeignKey
ALTER TABLE "storefront_photos" ADD CONSTRAINT "storefront_photos_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storefront_photos" ADD CONSTRAINT "storefront_photos_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
