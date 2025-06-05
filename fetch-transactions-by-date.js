const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
const TARGET_DATE_STRING = '2025-06-03'; // YYYY-MM-DD format
// Choose the appropriate MongoDB URI (local or remote)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/firestonestor'; // Fallback to a default
// --- End Configuration ---

// Minimal Transaction Schema
const transactionSchema = new mongoose.Schema({
  date: Date,
  type: String, // 'sale', 'return', 'restock'
  totalLRD: Number,
  totalUSD: Number,
  productsSold: [
    {
      product: mongoose.Schema.Types.ObjectId,
      productName: String,
      quantity: Number,
      priceAtSale: {
        LRD: Number,
        USD: Number,
      },
      category: String,
    },
  ],
  discountType: String,
  discountValue: Number,
  discountAmount: Number,

  store: String,
  cashierName: String,
});

const Transaction = mongoose.model('Transaction', transactionSchema);

async function fetchTransactions() {
  try {
    console.log(`Connecting to MongoDB at ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Successfully connected to MongoDB.');

    const startDate = new Date(TARGET_DATE_STRING);
    startDate.setHours(0, 0, 0, 0); // Start of the day

    const endDate = new Date(TARGET_DATE_STRING);
    endDate.setHours(23, 59, 59, 999); // End of the day

    console.log(`Fetching all 'sale' or 'return' transactions between ${startDate.toISOString()} and ${endDate.toISOString()}...`);

    const transactions = await Transaction.find({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      type: { $in: ['sale', 'return'] } // Only sales and returns
    })
    .sort({ date: -1 })
    .select([
        'date',
        'type',
        'totalLRD',
        'totalUSD',
        'productsSold.productName',
        'productsSold.quantity',
        'productsSold.priceAtSale',
        'discountType',
        'discountValue',
        'discountAmount',
        'store',
        'cashierName'
    ])
    .lean(); // .lean() for plain JavaScript objects

    console.log(`Found ${transactions.length} transactions.`);
    console.log('--- TRANSACTIONS DATA (JSON) ---');
    console.log(JSON.stringify(transactions, null, 2));
    console.log('--- END TRANSACTIONS DATA ---');

  } catch (error) {
    console.error('Error fetching transactions:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

fetchTransactions();
