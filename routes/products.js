import express from 'express';
const router = express.Router();
import pool from "../config/database.js";

// GET /api/products - Get all products with their relationships
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.product_id AS id,
        p.product_title AS title,
        p.product_description AS description,
        p.product_main_img_url AS image,
        p.product_price AS price,
        p.product_rating AS rating,

        pt.product_type_id AS type_id,
        pt.product_type_name AS type,

        p.product_created_at AS createdAt,
        p.product_updated_at AS updatedAt,

        ARRAY_AGG(DISTINCT ac.age_category_name) AS ageCategories,
        ARRAY_AGG(DISTINCT e.event_name) AS events,
        ARRAY_AGG(DISTINCT i.image_url) AS additionalImages

      FROM products p
      JOIN producttypes pt ON pt.product_type_id = p.product_type_id

      LEFT JOIN productagecategories pac ON p.product_id = pac.product_id
      LEFT JOIN agecategories ac ON pac.age_category_id = ac.age_category_id
      LEFT JOIN productevents pe ON p.product_id = pe.product_id
      LEFT JOIN events e ON pe.event_id = e.event_id
      LEFT JOIN productimages pi ON p.product_id = pi.product_id
      LEFT JOIN images i ON pi.image_id = i.image_id

      GROUP BY 
        p.product_id,
        pt.product_type_id,
        pt.product_type_name,
        p.product_title,
        p.product_description,
        p.product_main_img_url,
        p.product_price,
        p.product_rating,
        p.product_created_at,
        p.product_updated_at

      ORDER BY p.product_id
    `;

    const result = await pool.query(query);
    
    const products = result.rows.map(product => ({
      id: product.id,
      title: product.title,
      price: parseFloat(product.price),
      rating: parseFloat(product.rating),
      type: product.type,
      image: product.image,
      ageCategory: product.agecategories.filter(age => age !== null),
      events: product.events.filter(event => event !== null),
      description: product.description,
      createdAt: product.createdat,
      updatedAt: product.updatedat,
      additionalImages: product.additionalimages.filter(img => img !== null)
    }));

    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/:id - Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const query = `
      SELECT 
        p.product_id AS id,
        p.product_title AS title,
        p.product_description AS description,
        p.product_main_img_url AS image,
        p.product_price AS price,
        p.product_rating AS rating,

        pt.product_type_id AS type_id,
        pt.product_type_name AS type,

        p.product_created_at AS createdAt,
        p.product_updated_at AS updatedAt,

        ARRAY_AGG(DISTINCT ac.age_category_name) AS ageCategories,
        ARRAY_AGG(DISTINCT e.event_name) AS events,
        ARRAY_AGG(DISTINCT i.image_url) AS additionalImages

      FROM products p
      JOIN producttypes pt ON pt.product_type_id = p.product_type_id

      LEFT JOIN productagecategories pac ON p.product_id = pac.product_id
      LEFT JOIN agecategories ac ON pac.age_category_id = ac.age_category_id
      LEFT JOIN productevents pe ON p.product_id = pe.product_id
      LEFT JOIN events e ON pe.event_id = e.event_id
      LEFT JOIN productimages pi ON p.product_id = pi.product_id
      LEFT JOIN images i ON pi.image_id = i.image_id

      WHERE p.product_id = $1

      GROUP BY 
        p.product_id,
        pt.product_type_id,
        pt.product_type_name,
        p.product_title,
        p.product_description,
        p.product_main_img_url,
        p.product_price,
        p.product_rating,
        p.product_created_at,
        p.product_updated_at
    `;

    const result = await pool.query(query, [productId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    const transformedProduct = {
      id: product.id,
      title: product.title,
      price: parseFloat(product.price),
      rating: parseFloat(product.rating),
      type: product.type,
      image: product.image,
      ageCategory: product.agecategories.filter(age => age !== null),
      events: product.events.filter(event => event !== null),
      description: product.description,
      createdAt: product.createdat,
      updatedAt: product.updatedat,
      additionalImages: product.additionalimages.filter(img => img !== null)
    };

    res.json(transformedProduct);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products
router.post('/', async (req, res) => {
  // Implementation for creating a new product
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  // Implementation for updating a product by ID
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  // Implementation for deleting a product by ID
});

export default router;