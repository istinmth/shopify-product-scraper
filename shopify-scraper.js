const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const mkdirp = require('mkdirp');
const readline = require('readline');

/**
 * Shopify Store Scraper
 *
 * This script scrapes product information from a Shopify store including:
 * - Product name
 * - Product price
 * - Product description
 * - Product images
 *
 * It tries two methods:
 * 1. First attempts to use the Shopify API (products.json)
 * 2. Falls back to HTML scraping if the API is not accessible
 */

class ShopifyScraper {
  constructor(storeUrl, outputDir = './products') {
    // Normalize the store URL
    this.storeUrl = storeUrl.trim();
    if (this.storeUrl.endsWith('/')) {
      this.storeUrl = this.storeUrl.slice(0, -1);
    }
    if (!this.storeUrl.startsWith('https://') && !this.storeUrl.startsWith('http://')) {
      this.storeUrl = 'https://' + this.storeUrl;
    }

    this.outputDir = outputDir;
    this.productsData = [];

    // Create output directory if it doesn't exist
    mkdirp.sync(this.outputDir);

    // Configure axios with longer timeout and user agent
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
  }

  /**
   * Main method to start scraping
   */
  async scrape() {
    console.log(`Starting to scrape: ${this.storeUrl}`);

    try {
      // First attempt: Try to use the Shopify API
      const apiSuccess = await this.scrapeViaApi();

      // Second attempt: If API fails, use HTML scraping
      if (!apiSuccess) {
        console.log('API method failed, falling back to HTML scraping...');
        await this.scrapeViaHtml();
      }

      // Save the scraped data to JSON file
      this.saveProductsData();

      console.log(`Scraping completed! Data saved to ${this.outputDir}`);
      return this.productsData;
    } catch (error) {
      console.error('Error during scraping:', error.message);
      return [];
    }
  }

  /**
   * Method to scrape using Shopify's products.json API with pagination
   */
  async   /**
   * Method to scrape using Shopify's products.json API with pagination
   */
  async scrapeViaApi() {
    try {
      let page = 1;
      let limit = 250; // Maximum allowed by Shopify API
      let hasMoreProducts = true;
      let totalProducts = 0;

      while (hasMoreProducts) {
        console.log(`Fetching page ${page} of products (limit: ${limit})...`);
        const response = await this.axiosInstance.get(
          `${this.storeUrl}/products.json?page=${page}&limit=${limit}`
        );

        if (response.data && response.data.products && response.data.products.length > 0) {
          const products = response.data.products;
          totalProducts += products.length;
          console.log(`Retrieved ${products.length} products from page ${page}`);

          for (const product of products) {
            const productData = {
              id: product.id,
              handle: product.handle,
              title: product.title,
              description: this.cleanDescription(product.body_html),
              price: this.getProductPrice(product),
              images: product.images.map(img => img.src),
              url: `${this.storeUrl}/products/${product.handle}`,
              variants: product.variants,
              timestamp: new Date().toISOString()
            };

            // Normalize the image URLs
            this.normalizeImageUrls(productData);

            this.productsData.push(productData);

            // Throttle requests to avoid hitting rate limits
            await this.sleep(500);
          }

          // Check if we need to fetch more pages
          if (products.length < limit) {
            hasMoreProducts = false;
            console.log('Reached the last page of products.');
          } else {
            page++;
            // Throttle between page requests
            await this.sleep(2000);
          }
        } else {
          hasMoreProducts = false;
          if (page === 1) {
            console.log('No products found via API.');
            return false;
          }
        }
      }

      console.log(`Total products fetched via API: ${totalProducts}`);
      return totalProducts > 0;
    } catch (error) {
      console.log('API method failed:', error.message);
      return false;
    }
  }

  /**
   * Method to scrape by parsing HTML pages
   */
  async scrapeViaHtml() {
    try {
      // Get the collection or catalog page
      const response = await this.axiosInstance.get(`${this.storeUrl}/collections/all`);
      const $ = cheerio.load(response.data);

      // Find product links
      const productLinks = [];

      // Shopify typically uses one of these common patterns for product links
      $('a[href*="/products/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (href && href.includes('/products/')) {
          const fullUrl = href.startsWith('http')
            ? href
            : this.storeUrl + (href.startsWith('/') ? href : '/' + href);

          if (!productLinks.includes(fullUrl)) {
            productLinks.push(fullUrl);
          }
        }
      });

      console.log(`Found ${productLinks.length} product links`);

      // Visit each product page and extract data
      for (const productUrl of productLinks) {
        await this.scrapeProductPage(productUrl);

        // Throttle requests
        await this.sleep(2000);
      }

      return true;
    } catch (error) {
      console.error('HTML scraping failed:', error.message);
      return false;
    }
  }

  /**
   * Scrape a single product page
   */
  async scrapeProductPage(url) {
    try {
      console.log(`Scraping product: ${url}`);
      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      // Extract structured data if available (more reliable)
      let structuredData = null;
      $('script[type="application/ld+json"]').each((_, element) => {
        try {
          const data = JSON.parse($(element).html());
          if (data['@type'] === 'Product') {
            structuredData = data;
          }
        } catch (e) {
          // Ignore parsing errors in JSON-LD
        }
      });

      // Use structured data if available
      if (structuredData) {
        const productData = {
          id: url.split('/').pop().split('?')[0],
          handle: url.split('/').pop().split('?')[0],
          title: structuredData.name,
          description: this.cleanDescription(structuredData.description),
          price: structuredData.offers?.price ||
                 structuredData.offers?.lowPrice ||
                 this.extractPrice($),
          images: Array.isArray(structuredData.image) ?
                  structuredData.image :
                  [structuredData.image],
          url: url,
          timestamp: new Date().toISOString()
        };

        this.productsData.push(productData);
        await this.downloadProductImages(productData);
        return;
      }

      // Fallback to HTML parsing if structured data isn't available
      const title = $('.product-single__title').text().trim() ||
                    $('h1').first().text().trim();

      const description = $('.product-single__description').html() ||
                         $('.product__description').html() ||
                         $('.description').html();

      const price = this.extractPrice($);

      const images = [];
      $('img[src*="/products/"]').each((_, element) => {
        const imgSrc = $(element).attr('src') || $(element).attr('data-src');
        if (imgSrc) {
          // Convert to full-size image URL if it's a thumbnail
          const fullSizeUrl = imgSrc.replace(/(\.[^.]+)(_[0-9]+x[0-9]+)(\.[^.]+)$/, '$1$3');
          images.push(fullSizeUrl.startsWith('http') ? fullSizeUrl : `https:${fullSizeUrl}`);
        }
      });

      const productData = {
        id: url.split('/').pop().split('?')[0],
        handle: url.split('/').pop().split('?')[0],
        title,
        description: this.cleanDescription(description),
        price,
        images: [...new Set(images)], // Remove duplicates
        url,
        timestamp: new Date().toISOString()
      };

      this.productsData.push(productData);

    } catch (error) {
      console.error(`Failed to scrape product ${url}:`, error.message);
    }
  }

  /**
   * Extract price from HTML using common Shopify selectors
   */
  extractPrice($) {
    const priceSelectors = [
      '.price__regular .price-item--regular',
      '.product__price',
      '.price-item--sale',
      '.product-single__price',
      '.price .money',
      '.product-price',
      '[data-product-price]'
    ];

    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      if (priceElement.length) {
        const priceText = priceElement.text().trim();
        // Extract numbers from the string (price might contain currency symbols)
        const matches = priceText.match(/[\d,.]+/);
        if (matches) {
          // Remove thousands separators and convert to float
          return parseFloat(matches[0].replace(/,/g, ''));
        }
      }
    }

    return null;
  }

  /**
   * Get product price from API data
   */
  getProductPrice(product) {
    if (product.variants && product.variants.length > 0) {
      const prices = product.variants
        .map(variant => parseFloat(variant.price))
        .filter(price => !isNaN(price));

      if (prices.length === 0) return null;

      // If there are multiple variants with different prices, return a range
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      if (minPrice === maxPrice) {
        return minPrice;
      } else {
        return {
          min: minPrice,
          max: maxPrice
        };
      }
    }

    return null;
  }

  /**
   * Clean HTML description
   */
  cleanDescription(html) {
    if (!html) return '';

    // Basic HTML cleaning
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .trim();
  }

  /**
   * Normalize image URLs to ensure they're complete
   */
  normalizeImageUrls(product) {
    if (!product.images || !Array.isArray(product.images)) return;

    product.images = product.images.map(imageUrl => {
      if (!imageUrl) return null;

      // Ensure URL starts with http
      if (!imageUrl.startsWith('http')) {
        imageUrl = 'https:' + imageUrl;
      }

      return imageUrl;
    }).filter(url => url); // Filter out any null/undefined
  }

  /**
   * Save all product data to a JSON file
   */
  saveProductsData() {
    const outputPath = path.join(this.outputDir, 'products_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(this.productsData, null, 2));
    console.log(`Saved product data to ${outputPath}`);
  }

  /**
   * Utility to sleep/delay execution
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Example usage
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Prompt for the store URL
    const storeUrl = await new Promise(resolve => {
      rl.question('Enter the Shopify store URL (e.g., https://example.com): ', (answer) => {
        resolve(answer.trim());
      });
    });

    if (!storeUrl) {
      console.error('Error: Store URL is required.');
      process.exit(1);
    }

    // Extract domain name for folder name
    let domain;
    try {
      const url = new URL(storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`);
      domain = url.hostname.replace(/^www\./, '');
    } catch (error) {
      console.error('Error: Invalid URL format.');
      process.exit(1);
    }

    // Create output directory based on domain name
    const outputDir = path.join('.', `${domain}_products`);
    console.log(`Data will be saved to: ${outputDir}`);

    const scraper = new ShopifyScraper(storeUrl, outputDir);
    await scraper.scrape();

    console.log('\nScraping completed successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ShopifyScraper;