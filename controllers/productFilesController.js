import { query } from '../config/database.js';
import fs from 'fs';

// Upload files for a product
const uploadFiles = async (req, res) => {
  try {
    const productId = req.params.productId;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Insert file records into database
    const fileRecords = [];
    for (const file of files) {
      const result = await query(
        `INSERT INTO product_files (product_id, file_name, file_url, file_size) 
         VALUES ($1, $2, $3, $4) RETURNING id, file_name, file_url, file_size`,
        [productId, file.originalname, file.path, file.size]
      );
      fileRecords.push(result.rows[0]);
    }

    res.status(201).json({
      success: true,
      files: fileRecords
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
};

// Get all files for a product
const getProductFiles = async (req, res) => {
  try {
    const productId = req.params.productId;
    
    const result = await query(
      `SELECT id, file_name, file_url, file_size, created_at 
       FROM product_files 
       WHERE product_id = $1 
       ORDER BY created_at DESC`,
      [productId]
    );

    res.json({
      success: true,
      files: result.rows
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
};

// Delete a file
const deleteFile = async (req, res) => {
  try {
    const fileId = req.params.fileId;
    
    // First get file info to delete from filesystem
    const fileResult = await query(
      'SELECT file_url FROM product_files WHERE id = $1',
      [fileId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileUrl = fileResult.rows[0].file_url;

    // Delete from database
    await query('DELETE FROM product_files WHERE id = $1', [fileId]);

    // Delete from filesystem
    if (fs.existsSync(fileUrl)) {
      fs.unlinkSync(fileUrl);
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};

export { uploadFiles, getProductFiles, deleteFile };