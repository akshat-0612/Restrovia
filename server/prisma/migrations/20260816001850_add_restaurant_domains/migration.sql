-- CreateTable
CREATE TABLE "restaurant_domains" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_domains_hostname_key" ON "restaurant_domains"("hostname");

-- CreateIndex
CREATE INDEX "restaurant_domains_restaurantId_idx" ON "restaurant_domains"("restaurantId");

-- AddForeignKey
ALTER TABLE "restaurant_domains" ADD CONSTRAINT "restaurant_domains_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
