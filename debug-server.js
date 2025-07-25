// Enhanced debug version of server.js with more verbose logging
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Set up logging
const logFile = path.join(logsDir, `server-${new Date().toISOString().replace(/:/g, '-')}.log`);
const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
};

log('Starting debug server...');

// Load environment variables
log('Loading environment variables...');
const result = dotenv.config({ path: path.join(__dirname, '.env') });
if (result.error) {
  log(`Error loading .env file: ${result.error.message}`);
} else {
  log('Successfully loaded .env file');
  log(`Environment variables: PORT=${process.env.PORT}, MONGODB_URI=${process.env.MONGODB_URI}`);
}

// Load required modules
log('Loading required modules...');
try {
  const express = require('express');
  const mongoose = require('mongoose');
  const cors = require('cors');
  log('All required modules loaded successfully');
} catch (error) {
  log(`Error loading modules: ${error.message}`);
  process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Initialize Express app
log('Initializing Express app...');
const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  log(`Created uploads directory at ${uploadsDir}`);
} else {
  log(`Uploads directory exists at ${uploadsDir}`);
}

// Set up middleware
log('Setting up middleware...');
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Set up frontend static files
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(frontendBuildPath)) {
  log(`Frontend build directory found at ${frontendBuildPath}`);
  
  // Check if index.html exists
  const indexPath = path.join(frontendBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    log(`Found index.html at ${indexPath}`);
  } else {
    log(`ERROR: index.html not found at ${indexPath}`);
  }
  
  // List files in the build directory
  try {
    const files = fs.readdirSync(frontendBuildPath);
    log(`Files in build directory: ${files.join(', ')}`);
  } catch (err) {
    log(`Error reading build directory: ${err.message}`);
  }
  
  // Serve static files
  app.use(express.static(frontendBuildPath, {
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
      res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  log('Set up static file serving for frontend build');
} else {
  log(`ERROR: Frontend build directory not found at ${frontendBuildPath}`);
}

// Set up basic routes for testing
log('Setting up routes...');

// Health check route
app.get('/api/health', (req, res) => {
  log('Health check endpoint called');
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MongoDB debug route
app.get('/api/debug/mongodb', async (req, res) => {
  log('MongoDB debug endpoint called');
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
      try {
        collections = await mongoose.connection.db.listCollections().toArray();
        log(`Found ${collections.length} collections`);
      } catch (error) {
        log(`Error listing collections: ${error.message}`);
      }
    }
    
    const response = {
      state: stateMap[state] || 'unknown',
      stateCode: state,
      collections: collections.map(c => c.name)
    };
    
    log(`MongoDB status: ${JSON.stringify(response)}`);
    res.status(200).json(response);
  } catch (error) {
    log(`Error in MongoDB debug endpoint: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Currency rate endpoint for testing
app.get('/api/currency-rate', (req, res) => {
  log('Currency rate endpoint called');
  // Return a mock currency rate
  res.status(200).json({ lrdToUsd: 197 });
});

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    log(`API endpoint not found: ${req.path}`);
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Serve the index.html for all other routes
  const indexPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
  if (fs.existsSync(indexPath)) {
    log(`Serving index.html for path: ${req.path}`);
    res.sendFile(indexPath);
  } else {
    log(`ERROR: Cannot serve frontend - index.html not found at ${indexPath}`);
    res.status(404).send('Frontend not built. Please run npm run build-frontend first.');
  }
});

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
log(`Attempting to connect to MongoDB at: ${mongoUri}`);

mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
})
  .then(() => {
    log('Connected to MongoDB successfully');
    return mongoose.connection.db.listCollections().toArray();
  })
  .then((collections) => {
    log(`Available MongoDB collections: ${collections.map(c => c.name).join(', ')}`);
    
    // Set up MongoDB connection error handlers
    mongoose.connection.on('error', (err) => {
      log(`MongoDB connection error: ${err.message}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      log('MongoDB disconnected. Attempting to reconnect...');
    });
    
    // Start the server
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      log(`Server running on port ${port}`);
      log(`API available at http://localhost:${port}/api/health`);
    });
  })
  .catch((error) => {
    log(`Failed to connect to MongoDB: ${error.message}`);
    log('Starting server without MongoDB connection to enable fallback mechanisms');
    
    // Start the server anyway to allow frontend to load
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      log(`Server running on port ${port} (without MongoDB connection)`);
      log(`API available at http://localhost:${port}/api/health`);
    });
  });

// Handle process termination
process.on('SIGINT', () => {
  log('Received SIGINT. Shutting down gracefully...');
  mongoose.connection.close(() => {
    log('MongoDB connection closed. Exiting process...');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`);
  log(error.stack);
});
