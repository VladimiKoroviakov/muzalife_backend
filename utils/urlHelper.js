export const constructFullUrl = (req, imagePath) => {
  if (!imagePath) return null;
  
  // If it's already a full URL (http:// or https://), return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // If it's a relative path, construct the full URL
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}${imagePath}`;
};