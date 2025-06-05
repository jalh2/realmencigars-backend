const Credit = require('../models/Credit');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');

// Create a new credit transaction
const createCredit = async (req, res) => {
  console.log('[DEBUG] createCredit: Received request to /api/credits');
  console.log('[DEBUG] createCredit: Request body:', JSON.stringify(req.body, null, 2));
  try {
    const { 
      productsSold, 
      store, 
      customerName,
      totalLRD,
      totalUSD,
      currencyRate,
      preferredCurrency,
      cashierName, // Added
      isTestTransaction = false // Added with default
    } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required' });
    }

    if (!customerName || customerName.trim() === '') {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Enhanced products with names and prices
    const enhancedProductsSold = [];

    // Validate products and update inventory
    for (const item of productsSold) {
      const product = await Product.findOne({ _id: item.product, store });
      if (!product) {
        return res.status(404).json({ error: `Product ${item.product} not found in store ${store}` });
      }
      if (product.pieces < item.quantity) {
        return res.status(400).json({ error: `Insufficient quantity for product ${product.item}` });
      }

      // Update product quantity
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { pieces: -item.quantity } }
      );

      // Add enhanced product information
      enhancedProductsSold.push({
        ...item,
        productName: product.item,
        priceAtSale: {
          USD: product.priceUSD,
          LRD: product.priceLRD
        }
      });
    }
    console.log('[DEBUG] createCredit: Enhanced products sold:', JSON.stringify(enhancedProductsSold, null, 2));

    // Create a new Transaction document for the credit sale
    const newTransaction = new Transaction({
      productsSold: enhancedProductsSold,
      store,
      customerName,
      paymentMethod: 'CREDIT',
      currency: 'CREDIT', // Indicates the nature of the transaction, not necessarily payment currency
      totalAmount: 0, // For credit transactions, actual debt is in Credit doc
      amountReceived: 0,
      changeGiven: 0,
      currencyRate: currencyRate || 0, // Ensure currencyRate is present
      cashierName: cashierName || 'N/A',
      isTestTransaction,
      // creditId will be added after Credit doc is saved
    });
    await newTransaction.save();
    console.log('[DEBUG] createCredit: Linked Transaction document saved:', JSON.stringify(newTransaction, null, 2));

    // Create credit with the appropriate details, linking the transaction
    const credit = new Credit({
      productsSold: enhancedProductsSold, 
      store,
      customerName,
      totalLRD: totalLRD || 0,
      totalUSD: totalUSD || 0,
      status: 'pending',
      preferredCurrency: preferredCurrency || 'LRD',
      transactionId: newTransaction._id 
    });

    console.log('[DEBUG] createCredit: Credit document to be saved:', JSON.stringify(credit, null, 2));
    await credit.save();
    console.log('[DEBUG] createCredit: Successfully created credit:', JSON.stringify(credit, null, 2));

    // Update the transaction with the creditId
    newTransaction.creditId = credit._id;
    await newTransaction.save();
    console.log('[DEBUG] createCredit: Linked Transaction document updated with creditId:', JSON.stringify(newTransaction, null, 2));

    res.status(201).json(credit); // Respond with the credit document as before
  } catch (error) {
    console.error('Credit creation error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get all credits for a store
const getCredits = async (req, res) => {
  try {
    const { store, status } = req.query;
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const query = { store };
    
    // Add status filter if provided
    if (status && ['pending', 'paid'].includes(status)) {
      query.status = status;
    }

    const credits = await Credit.find(query)
      .sort({ date: -1 });
    res.json(credits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a specific credit
const getCreditById = async (req, res) => {
  try {
    const { id } = req.params;
    const { store } = req.query;

    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const credit = await Credit.findOne({ _id: id, store });
    if (!credit) {
      return res.status(404).json({ error: 'Credit not found' });
    }
    res.json(credit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get credits by customer name
const getCreditsByCustomer = async (req, res) => {
  try {
    const { customerName, store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    if (!customerName) {
      return res.status(400).json({ error: 'Customer name parameter is required' });
    }

    // Use regex for partial matching of customer name (case insensitive)
    const credits = await Credit.find({
      store,
      customerName: { $regex: customerName, $options: 'i' }
    }).sort({ date: -1 });

    res.json(credits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Pay for a credit
const payCredit = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      currency, 
      store, 
      amountReceivedLRD,
      amountReceivedUSD,
      change,
      changeCurrency,
      currencyRate 
    } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required' });
    }

    // Find the credit
    const credit = await Credit.findOne({ _id: id, store, status: 'pending' });
    if (!credit) {
      return res.status(404).json({ error: 'Pending credit not found' });
    }

    // Validate payment information based on currency
    if (currency === 'LRD') {
      if (typeof amountReceivedLRD !== 'number' || amountReceivedLRD < credit.totalLRD) {
        return res.status(400).json({ error: 'Amount received in LRD must be greater than or equal to the total' });
      }
    } else if (currency === 'USD') {
      if (typeof amountReceivedUSD !== 'number' || amountReceivedUSD < credit.totalUSD) {
        return res.status(400).json({ error: 'Amount received in USD must be greater than or equal to the total' });
      }
    } else if (currency === 'BOTH') {
      if (typeof amountReceivedLRD !== 'number' || typeof amountReceivedUSD !== 'number') {
        return res.status(400).json({ error: 'Both LRD and USD amounts must be provided for split payment' });
      }
      
      // Check if combined payment is sufficient using the dynamic exchange rate
      const EXCHANGE_RATE = currencyRate || 197;
      const totalPaymentValueLRD = amountReceivedLRD + (amountReceivedUSD * EXCHANGE_RATE);
      
      if (totalPaymentValueLRD < credit.totalLRD) {
        return res.status(400).json({ error: 'Combined payment amount is insufficient' });
      }
    }

    // Create a transaction for the payment
    const transaction = new Transaction({
      productsSold: credit.productsSold,
      currency,
      store,
      amountReceivedLRD: currency === 'USD' ? 0 : amountReceivedLRD,
      amountReceivedUSD: currency === 'LRD' ? 0 : amountReceivedUSD,
      change,
      changeCurrency: currency === 'BOTH' ? changeCurrency : currency,
      totalLRD: credit.totalLRD,
      totalUSD: credit.totalUSD,
      type: 'sale'
    });

    await transaction.save();

    // Update the credit to paid
    credit.status = 'paid';
    credit.paidAt = new Date();
    credit.paymentTransaction = transaction._id;
    await credit.save();

    res.status(200).json({ 
      credit,
      transaction
    });
  } catch (error) {
    console.error('Credit payment error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get credits by date range
const getCreditsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, store, status } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const query = {
      store,
      date: {
        $gte: start,
        $lte: end
      }
    };

    // Add status filter if provided
    if (status && ['pending', 'paid'].includes(status)) {
      query.status = status;
    }

    const credits = await Credit.find(query).sort({ date: -1 });

    // Calculate totals
    const totals = credits.reduce((acc, credit) => {
      acc.totalLRD += credit.totalLRD;
      acc.totalUSD += credit.totalUSD;
      acc.count += 1;
      return acc;
    }, { totalLRD: 0, totalUSD: 0, count: 0 });

    res.json({
      credits,
      totals
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get credit balance summary for a store
const getCreditBalance = async (req, res) => {
  try {
    const { store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    // Get pending credits
    const pendingCredits = await Credit.find({ store, status: 'pending' });
    
    // Calculate totals for pending credits
    const pendingTotals = pendingCredits.reduce((acc, credit) => {
      acc.totalLRD += credit.totalLRD;
      acc.totalUSD += credit.totalUSD;
      acc.count += 1;
      
      // Count by preferred currency
      if (credit.preferredCurrency === 'LRD') {
        acc.lrdCount += 1;
        acc.lrdTotal += credit.totalLRD;
      } else {
        acc.usdCount += 1;
        acc.usdTotal += credit.totalUSD;
      }
      
      return acc;
    }, { totalLRD: 0, totalUSD: 0, count: 0, lrdCount: 0, usdCount: 0, lrdTotal: 0, usdTotal: 0 });

    // Get paid credits
    const paidCredits = await Credit.find({ store, status: 'paid' });
    
    // Calculate totals for paid credits
    const paidTotals = paidCredits.reduce((acc, credit) => {
      acc.totalLRD += credit.totalLRD;
      acc.totalUSD += credit.totalUSD;
      acc.count += 1;
      
      // Count by preferred currency
      if (credit.preferredCurrency === 'LRD') {
        acc.lrdCount += 1;
        acc.lrdTotal += credit.totalLRD;
      } else {
        acc.usdCount += 1;
        acc.usdTotal += credit.totalUSD;
      }
      
      return acc;
    }, { totalLRD: 0, totalUSD: 0, count: 0, lrdCount: 0, usdCount: 0, lrdTotal: 0, usdTotal: 0 });

    // Get recent credits (both pending and paid)
    const recentCredits = await Credit.find({ store })
      .sort({ date: -1 })
      .limit(20);

    res.json({
      pending: pendingTotals,
      paid: paidTotals,
      total: {
        totalLRD: pendingTotals.totalLRD + paidTotals.totalLRD,
        totalUSD: pendingTotals.totalUSD + paidTotals.totalUSD,
        count: pendingTotals.count + paidTotals.count,
        lrdCount: pendingTotals.lrdCount + paidTotals.lrdCount,
        usdCount: pendingTotals.usdCount + paidTotals.usdCount,
        lrdTotal: pendingTotals.lrdTotal + paidTotals.lrdTotal,
        usdTotal: pendingTotals.usdTotal + paidTotals.usdTotal
      },
      recentCredits
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createCredit,
  getCredits,
  getCreditById,
  getCreditsByCustomer,
  payCredit,
  getCreditsByDateRange,
  getCreditBalance
};
