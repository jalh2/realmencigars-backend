// Load environment variables from .env file in the backend folder
const dotenv = require('dotenv');
// path is already required below, so don't redeclare it
const result = dotenv.config({ path: __dirname + '/.env' });
if (result.error) {
  console.error('Error loading .env file:', result.error);
} else {
  console.log('Successfully loaded .env file from backend folder');
  console.log('Environment variables:', {
    PORT: process.env.PORT,
    MONGODB_URI: process.env.MONGODB_URI
  });
}
 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import Mongoose models to ensure they are registered
require('./models/Product');
require('./models/Transaction');
require('./models/User');
require('./models/CurrencyRate');
require('./models/Credit');
const productRoutes = require('./routes/productRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const userRoutes = require('./routes/userRoutes');
const currencyRateRoutes = require('./routes/currencyRateRoutes');
const creditRoutes = require('./routes/creditRoutes');
const syncRoutes = require('./routes/syncRoutes');


  const app = express();

  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } 

  // General Request Logger Middleware
  app.use((req, res, next) => {
    console.log(`[Server.js General Logger] Received: ${req.method} ${req.originalUrl}`);
    next();
  });

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Serve static files from uploads directory
  app.use('/uploads', express.static(uploadsDir));

  // Serve static files from the frontend build directory
  // Note: In the integrated Electron app, electron.js might handle serving frontend files directly
  // or this server, when run standalone, will serve them.
  const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
  if (fs.existsSync(frontendBuildPath)) {
    console.log(`[Server.js] Serving frontend static files from: ${frontendBuildPath}`);
    app.use(express.static(frontendBuildPath, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
        }
        res.setHeader('Cache-Control', 'no-cache');
      }
    }));
  } else {
    console.warn(`[Server.js] Frontend build directory not found at: ${frontendBuildPath}`);
  }

  // API Routes
  app.use('/api/products', productRoutes);
  // Specific Logger for /api/transactions, placed before the transactionRoutes handler
  app.use('/api/transactions', (req, res, next) => {
    console.log(`[Server.js Transactions Logger] Path: ${req.path}, Method: ${req.method}, URL: ${req.originalUrl}`);
    console.log('[Server.js Transactions Logger] Headers:', JSON.stringify(req.headers, null, 2));
    // req.body should be populated here if express.json() has run and Content-Type was correct
    console.log('[Server.js Transactions Logger] Body:', JSON.stringify(req.body, null, 2)); 
    next();
  });
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/currency-rate', currencyRateRoutes);
  app.use('/api/credits', creditRoutes);
  app.use('/api/sync', syncRoutes);

  // Health check endpoint (critical for Electron integration)
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Backend is healthy' });
  });

  // Debug endpoint to check MongoDB connection
  app.get('/api/debug/mongodb', async (req, res) => {
    try {
      const state = mongoose.connection.readyState;
      const stateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };
      let collections = [];
      if (state === 1) {
        collections = await mongoose.connection.db.listCollections().toArray();
      }
      res.status(200).json({
        state: stateMap[state] || 'unknown',
        stateCode: state,
        collections: collections.map(c => c.name)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fallback route for client-side routing (must be after API routes)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      // This case should ideally be handled by specific API routes returning 404 if not found
      // but as a safeguard:
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    const indexPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Frontend not built or index.html missing.');
    }
  });


 // Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });
})
.catch((error) => {
  console.log(error);
});
