# Shopify Store Scraper

A Node.js based web scraper designed specifically for Shopify e-commerce stores. This tool extracts product information including names, descriptions, prices, and image URLs from shopify stores and downloads them into a json format for later use.

## Features

It handles pagination to retrieve all products (currently retrieves 250 per page, which is the maximum available, and goes through all pages). Uses Shopify's API to collect product names, descriptions, prices, image URLs, and variants.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v12 or higher)
- npm

### Setup

1. Clone this repository or download the source code:

```bash
git clone https://github.com/istinmth/shopify-product-scraper.git
cd shopify-product-scraper
```

2. Install the required dependencies:

```bash
npm install
```

## Usage

Run the scraper directly from the command line:

```bash
node shopify-scraper.js
```

The script will:
1. Prompt you to enter a Shopify store URL
2. Create a folder named after the store's domain
3. Scrape all product information
4. Save the results as a JSON file

### Example

```
$ node shopify-scraper.js
Enter the Shopify store URL (e.g., https://example.com): https://store.shopify.com
Data will be saved to: ./store.shopify.com_products
Fetching page 1 of products (limit: 250)...
Retrieved 108 products from page 1
Reached the last page of products.
Total products fetched via API: 108
Saved product data to ./store.shopify.com_products/products_data.json
Scraping completed! Data saved to ./store.shopify.com_products/products_data.json
Total products found: 108

Scraping completed successfully!
```

## Output Format

The scraper generates a JSON file with a structure similar to this:

```json
[
  {
    "id": 123456789,
    "handle": "product-name",
    "title": "Product Name",
    "description": "<p>This is a product description.</p>",
    "price": 29.99,
    "images": [
      "https://cdn.shopify.com/s/files/1/0000/0000/products/image1.jpg",
      "https://cdn.shopify.com/s/files/1/0000/0000/products/image2.jpg"
    ],
    "url": "https://store.shopify.com/products/product-name",
    "variants": [
      {
        "id": 12345678901,
        "title": "Small / Blue",
        "price": "29.99",
        "sku": "SKU-1234"
      }
    ],
    "timestamp": "2025-03-16T12:00:00.000Z"
  }
]
```
Always check a website's Terms of Service before scraping.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is provided for educational purposes only. The developers are not responsible for any misuse or for any damages that might result from using this software.
