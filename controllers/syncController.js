const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const CurrencyRate = require('../models/CurrencyRate');
const Credit = require('../models/Credit');

// Map model names to their actual model objects for easier dynamic access
const modelMap = {
  'User': User, // User is already imported
  'Product': Product,
  'Transaction': Transaction,
  'CurrencyRate': CurrencyRate,
  'Credit': Credit,
};

const COLLECTIONS_TO_SYNC = [
  { modelName: 'Product', collectionName: 'products' },
  { modelName: 'Transaction', collectionName: 'transactions' },
  { modelName: 'User', collectionName: 'users' },
  { modelName: 'CurrencyRate', collectionName: 'currencyrates' }, // Or 'currencyRates' - check actual model/collection name
  { modelName: 'Credit', collectionName: 'credits' },
];

const PRODUCT_COLLECTION_TO_PULL = [
  { modelName: 'Product', collectionName: 'products' }
];

const TRANSACTION_CREDITS_TO_PULL = [
  { modelName: 'Transaction', collectionName: 'transactions' },
  { modelName: 'Credit', collectionName: 'credits' }
];

// Helper function to send SSE messages
const sendSSE = (res, eventName, data) => {
  if (res.writableEnded) {
    console.warn(`SSE stream already ended, cannot write event: ${eventName}`, data);
    return;
  }
  // Ensure headers are sent before writing, though flushHeaders should handle this.
  // This is more of a safeguard for logic errors.
  if (!res.headersSent) {
    console.error("SSE headers not sent before trying to write event:", eventName, ". This indicates a logic flaw.");
    // Attempt to set headers and flush if it's the very first event, though this state is ideally avoided.
    // For robustness, could throw or simply return if this state is unexpected.
    // res.setHeader('Content-Type', 'text/event-stream'); // etc.
    // res.flushHeaders();
    return; 
  }
  try {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    console.error(`Error writing to SSE stream for event ${eventName}:`, e);
    // If writing fails, the stream might be broken. Consider ending it.
    if (!res.writableEnded) {
        // res.end(); // Potentially too aggressive, depends on error type.
    }
  }
};

const pushToOnline = async (req, res) => {
  console.log(`[SyncController] ENTERING pushToOnline for user: ${req.query.username}, store: ${req.query.store} - Timestamp: ${new Date().toISOString()}`);
  const { username, store } = req.query; // Changed from req.body to support SSE GET requests
  let sseStarted = false; // Flag to track if SSE stream has begun
  let remoteDb; // Declare remoteDb here to access in finally block

  if (!username || !store) {
    return res.status(400).json({ error: 'Username and store are required.' });
  }

  try {
    // 1. Verify admin user
    const adminUser = await User.findOne({ username, store });
    if (!adminUser) {
      return res.status(404).json({ error: 'Admin user not found in the specified store.' });
    }
    // if (adminUser.userType !== 'admin') {
    //   return res.status(403).json({ error: 'User is not authorized to perform this action.' });
    // }

    // 2. Get remote MongoDB URI
    const remoteMongoUri = process.env.REMOTE_MONGODB_URI;
    if (!remoteMongoUri) {
      console.error('[SyncController] REMOTE_MONGODB_URI not set in .env file.');
      return res.status(500).json({ error: 'Remote database configuration is missing.' });
    }

    // 3. Connect to remote database & Start SSE
    try {
      remoteDb = await mongoose.createConnection(remoteMongoUri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      }).asPromise();
      console.log('[SyncController] Successfully connected to remote MongoDB.');

      // ---- SSE STARTS HERE ----
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // res.setHeader('X-Accel-Buffering', 'no'); // Useful for Nginx environments
      res.flushHeaders(); // Important: send headers to client to establish SSE connection
      sseStarted = true;

      sendSSE(res, 'syncStatus', { type: 'info', status: 'connected', message: 'Successfully connected to remote MongoDB. Initializing sync...' });

      let successfulSyncs = 0;
      const errors = [];
      const totalCollections = COLLECTIONS_TO_SYNC.length;
      let collectionsProcessed = 0;

      // 4. Sync each collection
      for (const syncItem of COLLECTIONS_TO_SYNC) {
        collectionsProcessed++;
        // Progress before this collection's main work
        const progressPercentageBefore = Math.round(((collectionsProcessed - 1) / totalCollections) * 100);

        sendSSE(res, 'syncProgress', {
          type: 'collectionStart',
          collectionName: syncItem.collectionName,
          message: `Starting sync for ${syncItem.collectionName} (${collectionsProcessed}/${totalCollections})...`,
          progress: progressPercentageBefore,
          currentCollectionNum: collectionsProcessed,
          totalCollections: totalCollections
        });

        try {
          const LocalModel = modelMap[syncItem.modelName];
          if (!LocalModel) {
            const errorMsg = `Model ${syncItem.modelName} not found in modelMap during push. Ensure it's imported and added to modelMap.`;
            console.error(`[SyncController-Push] ${errorMsg}`);
            sendSSE(res, 'syncError', { type: 'critical', collectionName: syncItem.collectionName, message: errorMsg });
            errors.push({ collectionName: syncItem.collectionName, error: errorMsg });
            collectionsProcessed++;
            continue;
          }
          const RemoteModel = remoteDb.model(syncItem.modelName, LocalModel.schema, syncItem.collectionName);

          const localData = await LocalModel.find().lean();
          sendSSE(res, 'syncProgress', {
            type: 'collectionFetch',
            collectionName: syncItem.collectionName,
            count: localData.length,
            message: `Fetched ${localData.length} documents from local '${syncItem.collectionName}'.`,
            progress: progressPercentageBefore, 
            currentCollectionNum: collectionsProcessed,
            totalCollections: totalCollections
          });
          console.log(`[SyncController] Fetched ${localData.length} documents from local '${syncItem.collectionName}'.`);

          if (localData.length > 0) {
            const operations = localData.map(doc => {
              const { _id, ...docToUpdate } = doc; // Exclude _id from document to be $set
              return {
                updateOne: {
                  filter: syncItem.collectionName === 'products'
                    ? { item: doc.item, store: doc.store } // Use compound key for products
                    : { _id: doc._id }, // Use _id for other collections
                  update: { $set: docToUpdate },
                  upsert: true,
                },
              };
            });
            const result = await RemoteModel.bulkWrite(operations);
            sendSSE(res, 'syncProgress', {
              type: 'collectionSuccess',
              collectionName: syncItem.collectionName,
              upsertedCount: result.upsertedCount,
              modifiedCount: result.modifiedCount,
              message: `Synced to remote '${syncItem.collectionName}': ${result.upsertedCount} upserted, ${result.modifiedCount} modified.`,
              progress: Math.round((collectionsProcessed / totalCollections) * 100), // Progress after this collection
              currentCollectionNum: collectionsProcessed,
              totalCollections: totalCollections
            });
            console.log(`[SyncController] Synced to remote '${syncItem.collectionName}': ${result.upsertedCount} upserted, ${result.modifiedCount} modified.`);
          } else {
             sendSSE(res, 'syncProgress', {
              type: 'collectionSkipped',
              collectionName: syncItem.collectionName,
              message: `No documents to sync for '${syncItem.collectionName}'. Skipped.`,
              progress: Math.round((collectionsProcessed / totalCollections) * 100),
              currentCollectionNum: collectionsProcessed,
              totalCollections: totalCollections
            });
          }
          successfulSyncs++;
        } catch (collectionError) {
          console.error(`[SyncController] Error syncing collection '${syncItem.collectionName}':`, collectionError);
          const errorDetail = { 
            collection: syncItem.collectionName, 
            message: collectionError.message, 
            code: collectionError.code, 
            stack: process.env.NODE_ENV === 'development' ? collectionError.stack : undefined
          };
          errors.push(errorDetail);
          sendSSE(res, 'syncError', { // Distinct event name for errors
            type: 'collectionError',
            ...errorDetail,
            progress: Math.round((collectionsProcessed / totalCollections) * 100),
            currentCollectionNum: collectionsProcessed,
            totalCollections: totalCollections
          });
        }
      }

      // 5. Overall sync completion message
      if (errors.length > 0) {
        sendSSE(res, 'syncComplete', {
          status: 'error',
          message: `Sync process completed with ${errors.length} error(s). ${successfulSyncs} of ${totalCollections} collections attempted.`,
          errors,
          successfulSyncs,
          totalCollections,
          progress: 100
        });
      } else {
        sendSSE(res, 'syncComplete', {
          status: 'success',
          message: 'Data synchronization to online database completed successfully. All collections synced.',
          successfulSyncs,
          totalCollections,
          progress: 100
        });
      }

    } catch (dbOrInitialSSEError) { 
      console.error('[SyncController] Error connecting to remote DB or during initial SSE setup:', dbOrInitialSSEError);
      if (sseStarted && !res.writableEnded) {
        sendSSE(res, 'syncError', { type: 'critical', status: 'error', message: 'Failed during sync initialization: ' + dbOrInitialSSEError.message, code: dbOrInitialSSEError.code });
      } else if (!res.headersSent) {
        const status = dbOrInitialSSEError.name === 'MongoServerSelectionError' ? 503 : 500;
        res.status(status).json({ error: 'Failed to connect to the remote database or initialize sync. ' + dbOrInitialSSEError.message });
      }
      // If headers sent but stream ended, or other state, it's logged. res.end() will be called in finally if stream is still open.
    } finally {
      if (remoteDb) {
        try {
          await remoteDb.close();
          console.log('[SyncController] Closed connection to remote MongoDB.');
          if (sseStarted && !res.writableEnded) {
             sendSSE(res, 'syncStatus', { type: 'info', status: 'disconnected', message: 'Remote database connection closed.' });
          }
        } catch (closeError) {
            console.error('[SyncController] Error closing remote DB connection:', closeError);
            if (sseStarted && !res.writableEnded) {
                sendSSE(res, 'syncError', { type: 'info', status: 'error', message: 'Error closing remote DB connection: ' + closeError.message });
            }
        }
      }
      if (sseStarted && !res.writableEnded) {
        res.end(); // Ensure the stream is closed if it was started and not already ended
      }
    }

  } catch (error) { 
    console.error('[SyncController] General unhandled error in pushToOnline:', error);
    if (sseStarted && !res.writableEnded) {
      try {
        sendSSE(res, 'syncError', { type: 'fatal', status: 'error', message: 'An unexpected critical error occurred: ' + error.message });
      } catch (sseWriteError) {
        console.error("[SyncController] Failed to write final SSE error message:", sseWriteError);
      }
      if (!res.writableEnded) res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: 'An unexpected error occurred: ' + error.message });
    }
    // If headersSent and writableEnded, nothing more to do with response.
  }
};

const pullFromOnline = async (req, res) => {
  console.log(`[SyncController] ENTERING pullFromOnline for user: ${req.query.username}, store: ${req.query.store} - Timestamp: ${new Date().toISOString()}`);
  const { username, store } = req.query;
  let sseStarted = false;
  let remoteDb;

  if (!username || !store) {
    return res.status(400).json({ error: 'Username and store are required for pull operation.' });
  }

  try {
    // 1. Verify user (similar to pushToOnline, adapt as needed)
    const localUser = await User.findOne({ username, store }); // Check against local user db
    if (!localUser) {
      return res.status(404).json({ error: 'User not found in the specified store locally.' });
    }
    // Add role/permission checks if necessary, e.g.:
    // if (localUser.userType !== 'admin') {
    //   return res.status(403).json({ error: 'User is not authorized to perform this action.' });
    // }

    const remoteMongoUri = process.env.REMOTE_MONGODB_URI;
    if (!remoteMongoUri) {
      console.error('[SyncController-Pull] REMOTE_MONGODB_URI not set in .env file.');
      return res.status(500).json({ error: 'Remote database configuration is missing.' });
    }

    try {
      remoteDb = await mongoose.createConnection(remoteMongoUri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      }).asPromise();
      console.log('[SyncController-Pull] Successfully connected to remote MongoDB for pull operation.');

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      sseStarted = true;

      sendSSE(res, 'syncStatus', { type: 'info', status: 'connected_remote', message: 'Successfully connected to remote MongoDB. Initializing download...' });

      let successfulSyncs = 0;
      const errors = [];
      // Check if this is a product pull or transactions/credits pull
      const isProductPull = req.query.type === 'products';
      const collectionsToProcessForPull = isProductPull ? PRODUCT_COLLECTION_TO_PULL : TRANSACTION_CREDITS_TO_PULL;
      const totalCollections = collectionsToProcessForPull.length;
      let collectionsProcessed = 0;

      for (const syncItem of collectionsToProcessForPull) {
        collectionsProcessed++;
        sendSSE(res, 'collectionProgress', {
          type: 'info',
          collectionName: syncItem.collectionName,
          message: `Starting download for ${syncItem.collectionName}...`,
          progress: Math.round(((collectionsProcessed - 1) / totalCollections) * 100),
          currentCollectionNum: collectionsProcessed,
          totalCollections: totalCollections
        });
        
        try {
          const LocalModel = modelMap[syncItem.modelName];
          if (!LocalModel) {
            const errorMsg = `Model ${syncItem.modelName} not found in modelMap for pull (other collections). Ensure it's imported and added to modelMap.`;
            console.error(`[SyncController-Pull] ${errorMsg}`);
            sendSSE(res, 'syncError', { type: 'critical', direction: 'pull', collectionName: syncItem.collectionName, message: errorMsg });
            errors.push({ collectionName: syncItem.collectionName, error: errorMsg });
            collectionsProcessed++;
            continue;
          }
          // Ensure RemoteModel is defined using the LocalModel's schema
          const RemoteModel = remoteDb.model(syncItem.modelName, LocalModel.schema);

          sendSSE(res, 'collectionProgress', {
            type: 'info',
            collectionName: syncItem.collectionName,
            message: `Fetching data from remote ${syncItem.collectionName}...`
          });

          // Find the most recent document in local DB to only pull newer records
          const mostRecentDoc = await LocalModel.findOne({})
            .sort({ createdAt: -1 })
            .select('createdAt')
            .lean();
            
          const query = mostRecentDoc ? { createdAt: { $gt: mostRecentDoc.createdAt } } : {};
          
          const documentsToSync = await RemoteModel.find(query).lean(); // Only get newer records

          sendSSE(res, 'collectionProgress', {
            type: 'info',
            collectionName: syncItem.collectionName,
            message: `Fetched ${documentsToSync.length} documents from remote ${syncItem.collectionName}. Preparing local upsert...`
          });

          if (documentsToSync.length > 0) {
            const operations = documentsToSync.map(doc => ({
              updateOne: {
                filter: { _id: doc._id }, // Assumes _id is the unique key
                update: { $set: doc },
                upsert: true,
              },
            }));
            await LocalModel.bulkWrite(operations, { ordered: false }); // ordered:false to continue on errors
            sendSSE(res, 'collectionProgress', {
              type: 'success',
              collectionName: syncItem.collectionName,
              message: `Successfully upserted ${documentsToSync.length} documents into local ${syncItem.collectionName}.`,
              count: documentsToSync.length
            });
          } else {
            sendSSE(res, 'collectionProgress', {
              type: 'info',
              collectionName: syncItem.collectionName,
              message: `No documents found in remote ${syncItem.collectionName} to download.`
            });
          }

          successfulSyncs++;
        } catch (collectionError) {
          console.error(`[SyncController-Pull] Error syncing collection '${syncItem.collectionName}' from remote to local:`, collectionError);
          const errorDetail = {
            collection: syncItem.collectionName,
            message: collectionError.message,
            code: collectionError.code,
            stack: process.env.NODE_ENV === 'development' ? collectionError.stack : undefined
          };
          errors.push(errorDetail);
          sendSSE(res, 'syncError', { // Distinct event name for errors
            type: 'collectionError',
            direction: 'pull',
            ...errorDetail,
            progress: Math.round((collectionsProcessed / totalCollections) * 100),
            currentCollectionNum: collectionsProcessed,
            totalCollections: totalCollections
          });
        }
        sendSSE(res, 'collectionProgress', {
            type: 'info',
            collectionName: syncItem.collectionName,
            message: `Finished processing ${syncItem.collectionName}.`,
            progress: Math.round((collectionsProcessed / totalCollections) * 100),
            currentCollectionNum: collectionsProcessed,
            totalCollections: totalCollections
        });
      }

      if (errors.length > 0) {
        sendSSE(res, 'syncComplete', {
          status: 'error',
          direction: 'pull',
          message: `Download process completed with ${errors.length} error(s). ${successfulSyncs} of ${totalCollections} collections attempted.`,
          errors,
          successfulSyncs,
          totalCollections,
          progress: 100
        });
      } else {
        sendSSE(res, 'syncComplete', {
          status: 'success',
          direction: 'pull',
          message: 'Data download from online database completed successfully. All collections synced to local.',
          successfulSyncs,
          totalCollections,
          progress: 100
        });
      }

    } catch (dbOrInitialSSEError) {
      console.error('[SyncController-Pull] Error connecting to remote DB or during initial SSE setup for pull:', dbOrInitialSSEError);
      if (sseStarted && !res.writableEnded) {
        sendSSE(res, 'syncError', { type: 'critical', direction: 'pull', status: 'error', message: 'Failed during download initialization: ' + dbOrInitialSSEError.message, code: dbOrInitialSSEError.code });
      } else if (!res.headersSent) {
        const status = dbOrInitialSSEError.name === 'MongoServerSelectionError' ? 503 : 500;
        res.status(status).json({ error: 'Failed to connect to the remote database or initialize download. ' + dbOrInitialSSEError.message });
      }
    } finally {
      if (remoteDb) {
        try {
          await remoteDb.close();
          console.log('[SyncController-Pull] Closed connection to remote MongoDB after pull.');
          if (sseStarted && !res.writableEnded) {
             sendSSE(res, 'syncStatus', { type: 'info', direction: 'pull', status: 'disconnected_remote', message: 'Remote database connection closed.' });
          }
        } catch (closeError) {
            console.error('[SyncController-Pull] Error closing remote DB connection after pull:', closeError);
            if (sseStarted && !res.writableEnded) {
                sendSSE(res, 'syncError', { type: 'info', direction: 'pull', status: 'error', message: 'Error closing remote DB connection: ' + closeError.message });
            }
        }
      }
      if (sseStarted && !res.writableEnded) {
        res.end();
      }
    }

  } catch (error) {
    console.error('[SyncController-Pull] General unhandled error in pullFromOnline:', error);
    if (sseStarted && !res.writableEnded) {
      try {
        sendSSE(res, 'syncError', { type: 'fatal', direction: 'pull', status: 'error', message: 'An unexpected critical error occurred during download: ' + error.message });
      } catch (sseWriteError) {
        console.error("[SyncController-Pull] Failed to write final SSE error message:", sseWriteError);
      }
      if (!res.writableEnded) res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: 'An unexpected error occurred during download: ' + error.message });
    }
  }
};

module.exports = {
  pushToOnline,
  pullFromOnline, // Added pullFromOnline
};
