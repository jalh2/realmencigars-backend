const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function updateIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the User collection
    const userCollection = mongoose.connection.collection('users');
    
    // List all indexes
    const indexes = await userCollection.indexes();
    console.log('Current indexes:', indexes);
    
    // Drop the old username index if it exists
    const usernameIndex = indexes.find(index => 
      index.key && index.key.username === 1 && Object.keys(index.key).length === 1
    );
    
    if (usernameIndex) {
      console.log('Dropping old username index:', usernameIndex.name);
      await userCollection.dropIndex(usernameIndex.name);
      console.log('Old username index dropped successfully');
    } else {
      console.log('No standalone username index found');
    }
    
    // Create the compound index if it doesn't exist
    const compoundIndex = indexes.find(index => 
      index.key && index.key.username === 1 && index.key.store === 1
    );
    
    if (!compoundIndex) {
      console.log('Creating new compound index on username and store');
      await userCollection.createIndex({ username: 1, store: 1 }, { unique: true });
      console.log('New compound index created successfully');
    } else {
      console.log('Compound index already exists');
    }
    
    // List updated indexes
    const updatedIndexes = await userCollection.indexes();
    console.log('Updated indexes:', updatedIndexes);
    
    console.log('Index update completed successfully');
  } catch (error) {
    console.error('Error updating indexes:', error);
  } finally {
    // Close the MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the update function
updateIndexes();
