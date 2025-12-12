import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME, 
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const setupDatabase = async () => {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Create database if it doesn't exist
    await client.query(`SELECT 'CREATE DATABASE ${process.env.DB_NAME}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${process.env.DB_NAME}')`);
    console.log(`Database '${process.env.DB_NAME}' ensured`);

    // Connect to the specific database
    await client.end();
    
    const dbClient = new Client({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });
    
    await dbClient.connect();

    // Execute the complete schema from above
    const schemaSQL = `
      -- Creating tables in proper order to handle dependencies
      -- Users table (independent)
      CREATE TABLE Users (
          user_id SERIAL PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL UNIQUE,
          user_password VARCHAR(255),
          user_name VARCHAR(255) NOT NULL,
          user_google_id VARCHAR(255) UNIQUE,
          user_facebook_id VARCHAR(255) UNIQUE,
          user_auth_provider VARCHAR(50) NOT NULL DEFAULT 'email',
          user_avatar_url TEXT,
          user_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          user_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Events table (independent)
      CREATE TABLE Events (
          event_id SERIAL PRIMARY KEY,
          event_name VARCHAR(150) NOT NULL
      );

      -- AgeCategories table (independent)
      CREATE TABLE AgeCategories (
          age_category_id SERIAL PRIMARY KEY,
          age_category_name VARCHAR(150) NOT NULL
      );

      -- Images table (independent)
      CREATE TABLE Images (
          image_id SERIAL PRIMARY KEY,
          image_url VARCHAR(500) NOT NULL
      );

      -- FAQ table (independent)
      CREATE TABLE FAQs (
          faq_id SERIAL PRIMARY KEY,
          question VARCHAR(255) NOT NULL,
          answer VARCHAR(500) NOT NULL
      );

      -- Products table
      CREATE TABLE Products (
          product_id SERIAL PRIMARY KEY,
          product_title VARCHAR(255) NOT NULL,
          product_description VARCHAR(500) NOT NULL,
          product_main_img_url VARCHAR(500) NOT NULL,
          product_price DECIMAL(10,2) NOT NULL,
          product_rating INTEGER NOT NULL CHECK (product_rating >= 0 AND product_rating <= 5),
          product_type VARCHAR(100) NOT NULL,
          product_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          product_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Reviews table
      CREATE TABLE Reviews (
          review_id SERIAL PRIMARY KEY,
          review_text VARCHAR(500) NOT NULL,
          review_rating INTEGER NOT NULL CHECK (review_rating >= 1 AND review_rating <= 5)
      );

      -- ProductFiles table
      CREATE TABLE ProductFiles (
          file_id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_url VARCHAR(500) NOT NULL,
          file_size BIGINT NOT NULL,
          file_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
      );

      -- Junction tables for many-to-many relationships

      -- ProductReviews (junction table between Products and Reviews with User)
      CREATE TABLE ProductReviews (
          review_id INTEGER,
          user_id INTEGER,
          product_id INTEGER,
          PRIMARY KEY (review_id, user_id, product_id),
          FOREIGN KEY (review_id) REFERENCES Reviews(review_id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
      );

      -- SavedUserProducts (junction table between Users and Products)
      CREATE TABLE SavedUserProducts (
          product_id INTEGER,
          user_id INTEGER,
          saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (product_id, user_id),
          FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
      );

      -- BoughtUserProducts (junction table between Users and Products)
      CREATE TABLE BoughtUserProducts (
          product_id INTEGER,
          user_id INTEGER,
          bought_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (product_id, user_id),
          FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
      );

      -- ProductEvents (junction table between Products and Events)
      CREATE TABLE ProductEvents (
          product_id INTEGER,
          event_id INTEGER,
          PRIMARY KEY (product_id, event_id),
          FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
          FOREIGN KEY (event_id) REFERENCES Events(event_id) ON DELETE CASCADE
      );

      -- ProductAgeCategories (junction table between Products and AgeCategories)
      CREATE TABLE ProductAgeCategories (
          product_id INTEGER,
          age_category_id INTEGER,
          PRIMARY KEY (product_id, age_category_id),
          FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
          FOREIGN KEY (age_category_id) REFERENCES AgeCategories(age_category_id) ON DELETE CASCADE
      );

      -- ProductImages (junction table between Products and Images)
      CREATE TABLE ProductImages (
          product_id INTEGER,
          image_id INTEGER,
          PRIMARY KEY (product_id, image_id),
          FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
          FOREIGN KEY (image_id) REFERENCES Images(image_id) ON DELETE CASCADE
      );


      -- Creating indexes for better performance
      CREATE INDEX idx_users_email ON Users(user_email);
      CREATE INDEX idx_users_google_id ON Users(user_google_id);
      CREATE INDEX idx_users_facebook_id ON Users(user_facebook_id);

      CREATE INDEX idx_products_title ON Products(product_title);
      CREATE INDEX idx_products_price ON Products(product_price);
      CREATE INDEX idx_products_rating ON Products(product_rating);
      CREATE INDEX idx_products_type ON Products(product_type);

      CREATE INDEX idx_product_files_product_id ON ProductFiles(product_id);
      CREATE INDEX idx_reviews_rating ON Reviews(review_rating);

      -- Junction table indexes
      CREATE INDEX idx_saved_user_products_user_id ON SavedUserProducts(user_id);
      CREATE INDEX idx_bought_user_products_user_id ON BoughtUserProducts(user_id);
      CREATE INDEX idx_product_events_product_id ON ProductEvents(product_id);
      CREATE INDEX idx_product_age_categories_product_id ON ProductAgeCategories(product_id);
      CREATE INDEX idx_product_images_product_id ON ProductImages(product_id);
      CREATE INDEX idx_product_reviews_product_id ON ProductReviews(product_id);
      CREATE INDEX idx_product_reviews_user_id ON ProductReviews(user_id);

    `;
    
    // Split by semicolon and execute each statement
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await dbClient.query(statement);
      }
    }

    console.log('Complete database schema created successfully');
    
    // Create uploads directory
    const uploadsDir = path.join(__dirname, '..', 'uploads', 'products');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('Uploads directory created:', uploadsDir);
    }
    
    await dbClient.end();
    
  } catch (error) {
    console.error('Database setup error:', error);
  }
};

setupDatabase();