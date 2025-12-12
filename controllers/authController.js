import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { generateToken } from '../utils/jwt.js';
import axios from 'axios';

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Basic validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = await query(
      'SELECT user_id FROM Users WHERE user_email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await query(
      'INSERT INTO Users (user_email, user_password, user_name, user_auth_provider) VALUES ($1, $2, $3, $4) RETURNING user_id, user_email, user_name, user_created_at',
      [email, hashedPassword, name, 'email']
    );

    const user = result.rows[0];
    const token = generateToken(user.user_id);

    res.status(201).json({
      user: {
        id: user.user_id,
        email: user.user_email,
        name: user.user_name,
        created_at: user.user_created_at
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, loginType } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await query(
      'SELECT * FROM Users WHERE user_email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.user_password) {
      return res.status(400).json({ error: 'Invalid credentials. Please use social login if you registered via Google or Facebook' });
    }

    const validPassword = await bcrypt.compare(password, user.user_password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Server-side validation based on login type
    if (loginType === 'admin' && !user.is_admin) {
      return res.status(403).json({ 
        error: 'Access denied. You do not have administrator privileges.' 
      });
    }

    if (loginType === 'regular' && user.is_admin) {
      return res.status(403).json({ 
        error: 'Адміністратор має заходити через сторінку /admin.' 
      });
    }

    const token = generateToken(user.user_id);

    res.json({
      user: {
        id: user.user_id,
        email: user.user_email,
        name: user.user_name,
        auth_provider: user.user_auth_provider,
        created_at: user.user_created_at,
        is_admin: user.is_admin
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const googleAuth = async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    // Verify Google access token and get user info
    try {
      const googleResponse = await axios.get(
        `https://www.googleapis.com/oauth2/v3/userinfo`,
        {
          headers: { 
            Authorization: `Bearer ${accessToken}` 
          },
          timeout: 10000 // 10 second timeout
        }
      );

      const { sub: googleId, email, name, picture } = googleResponse.data;

      // Validate required fields from Google
      if (!googleId || !email) {
        return res.status(400).json({ error: 'Invalid Google user data' });
      }

      // Find or create user
      let userResult = await query(
        'SELECT * FROM Users WHERE user_google_id = $1 OR user_email = $2',
        [googleId, email]
      );

      let user;

      if (userResult.rows.length === 0) {
        // Create new user
        const result = await query(
          `INSERT INTO Users (user_email, user_name, user_google_id, user_auth_provider, user_avatar_url) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING user_id, user_email, user_name, user_avatar_url, user_auth_provider, user_created_at`,
          [email, name, googleId, 'google', picture]
        );
        user = result.rows[0];
      } else {
        user = userResult.rows[0];
        
        // Update google_id if user exists but doesn't have it
        if (!user.user_google_id) {
          await query(
            'UPDATE Users SET user_google_id = $1, user_auth_provider = $2 WHERE user_id = $3',
            [googleId, 'google', user.user_id]
          );
          user.user_google_id = googleId;
          user.user_auth_provider = 'google';
        }
      }

      const token = generateToken(user.user_id);

      res.json({
        user: {
          id: user.user_id,
          email: user.user_email,
          name: user.user_name,
          avatar_url: user.user_avatar_url,
          auth_provider: user.user_auth_provider,
          created_at: user.user_created_at
        },
        token
      });

    } catch (googleError) {
      console.error('Google API error:', googleError.response?.data || googleError.message);
      
      if (googleError.response?.status === 401) {
        return res.status(401).json({ error: 'Invalid Google access token' });
      } else if (googleError.response?.status === 400) {
        return res.status(400).json({ error: 'Invalid Google token format' });
      } else if (googleError.code === 'ECONNABORTED') {
        return res.status(408).json({ error: 'Google API timeout' });
      } else {
        return res.status(502).json({ error: 'Google API unavailable' });
      }
    }

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
};

export const facebookAuth = async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    try {      
      const debugResponse = await axios.get(
        `https://graph.facebook.com/debug_token`,
        {
          params: {
            input_token: accessToken,
            access_token: `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`
          },
          timeout: 10000
        }
      );

      const tokenData = debugResponse.data.data;
      
      if (!tokenData.is_valid) {
        return res.status(401).json({ 
          error: `Invalid Facebook access token: ${tokenData.error?.message || 'Token is not valid'}` 
        });
      }

      if (tokenData.app_id !== process.env.FACEBOOK_APP_ID) {
        return res.status(401).json({ 
          error: 'Token was issued for a different Facebook app' 
        });
      }

      const userResponse = await axios.get(
        `https://graph.facebook.com/${tokenData.user_id}`,
        {
          params: {
            fields: 'id,name,email,first_name,last_name,picture.type(large)',
            access_token: accessToken
          },
          timeout: 10000
        }
      );

      const { id: facebookId, email, name, first_name, last_name, picture } = userResponse.data;

      // Handle missing email
      let userEmail = email;
      if (!userEmail) {
        userEmail = `fb_${facebookId}@placeholder.facebook`;
      }

      let userResult = await query(
        'SELECT * FROM Users WHERE user_facebook_id = $1 OR user_email = $2',
        [facebookId, userEmail]
      );

      let user;

      if (userResult.rows.length === 0) {
        const userName = name || `${first_name} ${last_name}`.trim() || `Facebook User ${facebookId}`;
        const result = await query(
          `INSERT INTO Users (user_email, user_name, user_facebook_id, user_auth_provider, user_avatar_url) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING user_id, user_email, user_name, user_avatar_url, user_auth_provider, user_created_at`,
          [userEmail, userName, facebookId, 'facebook', picture?.data?.url]
        );
        user = result.rows[0];
      } else {
        user = userResult.rows[0];
        
        // Update facebook_id if user exists but doesn't have it
        if (!user.user_facebook_id) {
          await query(
            'UPDATE Users SET user_facebook_id = $1, user_auth_provider = $2 WHERE user_id = $3',
            [facebookId, 'facebook', user.user_id]
          );
          user.user_facebook_id = facebookId;
          user.user_auth_provider = 'facebook';
        }
      }

      const token = generateToken(user.user_id);

      res.json({
        user: {
          id: user.user_id,
          email: user.user_email,
          name: user.user_name,
          avatar_url: user.user_avatar_url,
          auth_provider: user.user_auth_provider,
          created_at: user.user_created_at
        },
        token
      });

    } catch (facebookError) {
      
      if (facebookError.response?.status === 400) {
        const errorData = facebookError.response.data;
        if (errorData.error?.code === 190) {
          return res.status(401).json({ 
            error: 'Expired or invalid Facebook access token. Please try logging in again.' 
          });
        }
        return res.status(400).json({ 
          error: `Facebook API error: ${errorData.error?.message || 'Invalid request'}` 
        });
      } else if (facebookError.code === 'ECONNABORTED') {
        return res.status(408).json({ error: 'Facebook API timeout. Please try again.' });
      } else if (facebookError.response?.status === 401) {
        return res.status(401).json({ 
          error: 'Facebook authentication failed. The access token is invalid or has expired.' 
        });
      } else {
        return res.status(502).json({ 
          error: 'Unable to connect to Facebook. Please try again later.' 
        });
      }
    }

  } catch (error) {
    console.error('Unexpected Facebook auth error:', error);
    res.status(500).json({ 
      error: 'An unexpected error occurred during Facebook authentication.' 
    });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const result = await query(
      'SELECT user_id, user_email, user_name, user_avatar_url, user_auth_provider, user_created_at, is_admin FROM Users WHERE user_id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    res.json({ 
      user: {
        id: user.user_id,
        email: user.user_email,
        name: user.user_name,
        avatar_url: user.user_avatar_url,
        auth_provider: user.user_auth_provider,
        created_at: user.user_created_at,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};