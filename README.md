# Metaobject and Metafield Reference Copy Tool

## Setup

- For both stores, go to https://[STORE].myshopify.com/admin/apps/development
- Get the API password and store this as the app_api_key in .env file
- Add read access to products, articles, blogs, collections, pages
- write_product_listings
- write_products
- write_content
- write_online_store_pages
- write_metaobject_definitions
- write_metaobjects

## Install packages

- npm install

### Copy from

- SHOPIFY_PRODUCTION_PASS=
- SHOPIFY_PRODUCTION_STORE=[FROM].myshopify.com

### Copy To

- SHOPIFY_COPY_PRODUCTION_PASS=
- SHOPIFY_COPY_PRODUCTION_STORE=[TO].myshopify.com

Commands are as follows (and can be run multiple times - they will only ever create definitions and fail if they already exist)

- `npm run copy:metaobjects -- --env=production` -> Copy all metaobject defintitions from [FROM] -> [TO] site - if a metaobject refers to a metaobject may need running twice
- `npm run copy:metafields -- --env=production` -> Copy all metafield definitions from [FROM] -> [TO] site - if a metafield refers to a metaobject - run the above first
