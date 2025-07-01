const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Vip = require('../models/Vip');
const Expense = require('../models/Expense');

// Transaction controller methods will be added here

const Credit = require('../models/Credit'); // Make sure Credit model is imported
const createTransaction = async (req, res) => {
  console.log('[TransactionController] Entered createTransaction function.');
  try {
    const { 
      productsSold, 
      currency, 
      store, 
      amountReceivedLRD,
      amountReceivedUSD,
      change,
      changeCurrency,
      currencyRate,
      customerName, // Added for credit transactions
      // New discount fields
      discountType,
      discountValue,
      discountAmount,
      subtotal,
      // New VIP fields from frontend
      vipCigarDiscountAmountLRD,
      vipCigarDiscountAmountUSD,
      vipCreditUsedLRD,
      vipCreditUsedUSD,
      remainingVipCreditLRD,
      remainingVipCreditUSD,
      newVipCigarsDiscountedCount
    } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required' });
    }

    // Use the provided currency rate or default to 197 if not provided
    const EXCHANGE_RATE = currencyRate || 197;

    let vipCustomer = null;
    if (customerName) {
      vipCustomer = await Vip.findOne({ name: customerName });
      // Update VIP's monthlyCredit and cigarsDiscountCount based on frontend calculations
      if (vipCustomer) {
        vipCustomer.monthlyCredit = remainingVipCreditUSD; // Frontend sends remaining credit in USD
        vipCustomer.cigarsDiscountCount = newVipCigarsDiscountedCount;
        await vipCustomer.save();
      }
    }

    // Enhanced products with names and prices, applying VIP cigar discount
    const enhancedProductsSold = [];
    let calculatedTotalLRD = 0;
    let calculatedTotalUSD = 0;

    for (const item of productsSold) {
      const product = await Product.findOne({ _id: item.product, store });
      if (!product) {
        return res.status(404).json({ error: `Product ${item.product} not found in store ${store}` });
      }
      if (product.quantityInStock < item.quantity) {
        return res.status(400).json({ error: `Insufficient quantity for product ${product.item}` });
      }

      let itemSellingPriceLRD = product.sellingPriceLRD;
      let itemSellingPriceUSD = product.sellingPriceUSD;

      // Apply 20% discount for VIP cigar purchases (first 10 cigars)
      if (vipCustomer && vipCustomer.membershipStatus === 'active' && 
          product.category && product.category.toLowerCase() === 'cigar' && 
          vipCustomer.cigarsDiscountCount < 10) {
        
        const discountPercentage = 0.20; // 20% discount
        itemSellingPriceLRD = product.sellingPriceLRD * (1 - discountPercentage);
        itemSellingPriceUSD = product.sellingPriceUSD * (1 - discountPercentage);
        // Only increment if the discount is actually applied for this item
        vipCustomer.cigarsDiscountCount += item.quantity;
      }

      // Update product quantity
      product.quantityInStock -= item.quantity;
      await product.save();

      // Add enhanced product information
      enhancedProductsSold.push({
        ...item,
        productName: product.productName,
        priceAtSale: {
          USD: itemSellingPriceUSD,
          LRD: itemSellingPriceLRD
        }
      });

      calculatedTotalLRD += itemSellingPriceLRD * item.quantity;
      calculatedTotalUSD += itemSellingPriceUSD * item.quantity;
    }

    // Apply monthly credit for VIP customers
    if (vipCustomer && vipCustomer.monthlyCredit > 0) {
      // Convert USD total to LRD for consistent credit application
      const totalInLRDForCredit = calculatedTotalLRD + (calculatedTotalUSD * EXCHANGE_RATE);
      let creditToApplyLRD = Math.min(totalInLRDForCredit, vipCustomer.monthlyCredit * EXCHANGE_RATE); // Convert credit to LRD

      vipCustomer.monthlyCredit -= (creditToApplyLRD / EXCHANGE_RATE); // Deduct credit in USD equivalent
      calculatedTotalLRD -= creditToApplyLRD;

      // Ensure totals don't go below zero
      if (calculatedTotalLRD < 0) {
        calculatedTotalUSD += (calculatedTotalLRD / EXCHANGE_RATE); // Adjust USD if LRD goes negative
        calculatedTotalLRD = 0;
      }
      if (calculatedTotalUSD < 0) {
        calculatedTotalUSD = 0;
      }
    }

    // Validate payment information based on currency
    if (currency === 'LRD') {
      if (typeof amountReceivedLRD !== 'number' || amountReceivedLRD < calculatedTotalLRD) {
        return res.status(400).json({ error: 'Amount received in LRD must be greater than or equal to the total' });
      }
    } else if (currency === 'USD') {
      if (typeof amountReceivedUSD !== 'number' || amountReceivedUSD < calculatedTotalUSD) {
        return res.status(400).json({ error: 'Amount received in USD must be greater than or equal to the total' });
      }
    } else if (currency === 'BOTH') {
      if (typeof amountReceivedLRD !== 'number' || typeof amountReceivedUSD !== 'number') {
        return res.status(400).json({ error: 'Both LRD and USD amounts must be provided for split payment' });
      }
      
      // Check if combined payment is sufficient using the dynamic exchange rate
      const totalPaymentValueLRD = amountReceivedLRD + (amountReceivedUSD * EXCHANGE_RATE);
      
      if (totalPaymentValueLRD < calculatedTotalLRD) {
        return res.status(400).json({ error: 'Combined payment amount is insufficient' });
      }
    } else if (currency === 'CREDIT') {
      if (!customerName) {
        return res.status(400).json({ error: 'Customer name is required for credit transactions' });
      }
      // For CREDIT, no cash is received upfront, so no amount validation here.
      // Actual credit limit/balance check would go here if implemented.
    }

    // Create transaction with the appropriate payment details
    const transactionData = {
      productsSold: enhancedProductsSold,
      currency,
      store,
      customerName,
      amountReceivedLRD: currency === 'CREDIT' ? 0 : (currency === 'USD' ? 0 : amountReceivedLRD),
      amountReceivedUSD: currency === 'CREDIT' ? 0 : (currency === 'LRD' ? 0 : amountReceivedUSD),
      change: currency === 'CREDIT' ? 0 : change,
      totalLRD: calculatedTotalLRD,
      totalUSD: calculatedTotalUSD,
      // Add discount information
      discountType: discountType || 'none',
      discountValue: discountValue || 0,
      discountAmount: discountAmount || 0,
      subtotal: subtotal || 0, // This subtotal might need recalculation based on discounts
      // VIP specific transaction details
      vipCigarDiscountAmountLRD: vipCigarDiscountAmountLRD || 0,
      vipCigarDiscountAmountUSD: vipCigarDiscountAmountUSD || 0,
      vipCreditUsedLRD: vipCreditUsedLRD || 0,
      vipCreditUsedUSD: vipCreditUsedUSD || 0,
      newVipCigarsDiscountedCount: newVipCigarsDiscountedCount || 0,
      // If VIP customer, include their updated credit and cigar count
      ...(vipCustomer && { monthlyCredit: vipCustomer.monthlyCredit, cigarsDiscountCount: vipCustomer.cigarsDiscountCount })
    };

    // Only include changeCurrency for non-credit transactions
    if (currency !== 'CREDIT') {
      transactionData.changeCurrency = currency === 'BOTH' ? changeCurrency : currency;
    }

    const transaction = new Transaction(transactionData);

    await transaction.save();

    // Save updated VIP customer data if applicable
    if (vipCustomer) {
      await vipCustomer.save();
    }

    if (transaction.currency === 'CREDIT') {
      const creditProductsSold = enhancedProductsSold.map(p => ({
        product: p.product, // ObjectId of the product
        productName: p.productName,
        quantity: p.quantity,
        priceAtSale: p.priceAtSale
      }));

      const creditSale = new Credit({
        customerName: transaction.customerName,
        store: transaction.store,
        productsSold: creditProductsSold,
        totalLRD: transaction.totalLRD,
        totalUSD: transaction.totalUSD,
        status: 'pending',
        preferredCurrency: transaction.store === 'store1' ? 'LRD' : 'USD', // Example default
        transactionId: transaction._id
      });
      await creditSale.save();

      const updatedTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        { $set: { creditId: creditSale._id } },
        { new: true }
      );
      res.status(201).json(updatedTransaction || transaction);
    } else {
      res.status(201).json(transaction);
    }
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(400).json({ error: error.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const { store } = req.query;
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const transactions = await Transaction.find({ store })
      .sort({ date: -1 })
      .limit(50);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { store } = req.query;

    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const transaction = await Transaction.findOne({ _id: id, store });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionsByDate = async (req, res) => {
  try {
    const { date, store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
      store,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionsByProduct = async (req, res) => {
  try {
    const { productId, store } = req.params;
    const transactions = await Transaction.find({
      'productsSold.product': productId,
      store,
      type: 'sale'
    }).populate('productsSold.product');

    // Calculate totals
    const totals = transactions.reduce((acc, transaction) => {
      if (transaction.currency === 'LRD') {
        acc.totalLRD += transaction.totalLRD;
      } else {
        acc.totalUSD += transaction.totalUSD;
      }
      acc.totalQuantity += transaction.productsSold[0].quantity;
      return acc;
    }, { totalLRD: 0, totalUSD: 0, totalQuantity: 0 });

    res.json({ 
      transactions,
      totals
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
      store,
      date: {
        $gte: start,
        $lte: end
      }
    }).sort({ date: -1 });

    // Calculate totals
    let totalLRD = 0;
    let totalUSD = 0;
    let totalItems = 0;

    transactions.forEach(transaction => {
      if (transaction.currency === 'LRD') {
        totalLRD += transaction.totalLRD || 0;
      } else {
        totalUSD += transaction.totalUSD || 0;
      }
      transaction.productsSold.forEach(product => {
        totalItems += product.quantity;
      });
    });

    res.json({
      transactions,
      summary: {
        totalLRD,
        totalUSD,
        totalItems,
        transactionCount: transactions.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, store, allStores } = req.query;

    if (!allStores && !store) {
      return res.status(400).json({ error: 'Either store parameter or allStores flag is required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const baseQuery = {
      date: { $gte: start, $lte: end },
    };
    if (!allStores) {
      baseQuery.store = store;
    }

    // --- Transaction Processing ---
    const salesTransactions = await Transaction.find({ ...baseQuery, type: 'sale' });
    const returnTransactions = await Transaction.find({ ...baseQuery, type: 'return' });
    const recentTransactions = await Transaction.find({ ...baseQuery, type: { $in: ['sale', 'return'] } })
      .sort({ date: -1 })
      .limit(50)
      .select('_id date store currency totalLRD totalUSD amountReceivedLRD amountReceivedUSD change productsSold type');

    let dailyTotals = {};
    let productTotals = {};
    let storeTotals = {};
    let overallTotals = {
      totalRevenueLRD: 0,
      totalRevenueUSD: 0,
      totalCostLRD: 0, 
      totalCostUSD: 0,
      totalItems: 0,
      totalTransactions: 0,
      totalReturns: 0,
    };

    const processTransaction = (transaction, isReturn = false) => {
      const factor = isReturn ? -1 : 1;
      const dateKey = transaction.date.toISOString().split('T')[0];

      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = { date: dateKey, totalLRD: 0, totalUSD: 0, transactions: 0, returns: 0, items: 0 };
      }
      if (!storeTotals[transaction.store]) {
        storeTotals[transaction.store] = { store: transaction.store, totalLRD: 0, totalUSD: 0, transactions: 0, returns: 0, items: 0 };
      }

      dailyTotals[dateKey][isReturn ? 'returns' : 'transactions'] += 1;
      storeTotals[transaction.store][isReturn ? 'returns' : 'transactions'] += 1;
      overallTotals[isReturn ? 'totalReturns' : 'totalTransactions'] += 1;

      transaction.productsSold.forEach(p => {
        const quantity = p.quantity || 0;
        const revenueLRD = (p.priceAtSale?.LRD || 0) * quantity;
        const revenueUSD = (p.priceAtSale?.USD || 0) * quantity;
        const costLRD = (p.costAtSale?.LRD || 0) * quantity;
        const costUSD = (p.costAtSale?.USD || 0) * quantity;

        dailyTotals[dateKey].totalLRD += revenueLRD * factor;
        dailyTotals[dateKey].totalUSD += revenueUSD * factor;
        dailyTotals[dateKey].items += quantity * factor;

        storeTotals[transaction.store].totalLRD += revenueLRD * factor;
        storeTotals[transaction.store].totalUSD += revenueUSD * factor;
        storeTotals[transaction.store].items += quantity * factor;

        overallTotals.totalRevenueLRD += revenueLRD * factor;
        overallTotals.totalRevenueUSD += revenueUSD * factor;
        overallTotals.totalCostLRD += costLRD * factor;
        overallTotals.totalCostUSD += costUSD * factor;
        overallTotals.totalItems += quantity * factor;

        const productKey = `${p.productName}_${transaction.store}`;
        if (!productTotals[productKey]) {
          productTotals[productKey] = { name: p.productName, store: transaction.store, quantitySold: 0, quantityReturned: 0, totalLRD: 0, totalUSD: 0 };
        }
        productTotals[productKey][isReturn ? 'quantityReturned' : 'quantitySold'] += quantity;
        productTotals[productKey].totalLRD += revenueLRD * factor;
        productTotals[productKey].totalUSD += revenueUSD * factor;
      });
    };

    salesTransactions.forEach(t => processTransaction(t, false));
    returnTransactions.forEach(t => processTransaction(t, true));

    // --- Expense Processing ---
    const expenses = await Expense.find(baseQuery).sort({ date: -1 });
    const totalExpensesLRD = expenses.reduce((sum, e) => sum + (e.amountLRD || 0), 0);
    const totalExpensesUSD = expenses.reduce((sum, e) => sum + (e.amountUSD || 0), 0);

    // --- Credit Processing ---
    const creditQuery = { ...baseQuery, status: 'pending' };
    const pendingCredits = await Credit.find(creditQuery);
    const pendingBalanceLRD = pendingCredits.reduce((sum, c) => sum + (c.totalLRD || 0), 0);
    const pendingBalanceUSD = pendingCredits.reduce((sum, c) => sum + (c.totalUSD || 0), 0);
    const recentCredits = await Credit.find(baseQuery).sort({ date: -1 }).limit(50);

    // --- Final Assembly ---
    const summary = {
      ...overallTotals,
      totalNetRevenueLRD: overallTotals.totalRevenueLRD,
      totalNetRevenueUSD: overallTotals.totalRevenueUSD,
      totalProfitLRD: overallTotals.totalRevenueLRD - overallTotals.totalCostLRD - totalExpensesLRD,
      totalProfitUSD: overallTotals.totalRevenueUSD - overallTotals.totalCostUSD - totalExpensesUSD,
      totalExpensesLRD,
      totalExpensesUSD,
      storeCount: Object.keys(storeTotals).length,
    };

    res.json({
      summary,
      dailyTotals: Object.values(dailyTotals).sort((a, b) => new Date(b.date) - new Date(a.date)),
      productTotals: Object.values(productTotals).sort((a, b) => b.quantitySold - a.quantitySold),
      storeTotals: Object.values(storeTotals).sort((a, b) => b.transactions - a.transactions),
      recentTransactions,
      expenses,
      creditBalance: {
        pendingBalanceLRD,
        pendingBalanceUSD,
        recentCredits,
      },
    });
  } catch (error) {
    console.error('Error generating sales report:', error);
    res.status(500).json({ error: error.message });
  }
};

const getTopProducts = async (req, res) => {
  try {
    const { startDate, endDate, store } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const topProducts = await Transaction.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          store,
          type: 'sale'
        }
      },
      { $unwind: '$productsSold' },
      {
        $group: {
          _id: '$productsSold.product',
          totalQuantity: { $sum: '$productsSold.quantity' },
          totalSalesLRD: { $sum: '$totalLRD' },
          totalSalesUSD: { $sum: '$totalUSD' },
          transactions: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          item: '$product.productName',
          totalQuantity: 1,
          totalSalesLRD: 1,
          totalSalesUSD: 1,
          transactions: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    res.json(topProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Handle product returns
const createReturnTransaction = async (req, res) => {
  try {
    const { 
      productsReturned, 
      currency, 
      store, 
      returnReason,
      originalTransactionId
    } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required' });
    }

    if (!productsReturned || !Array.isArray(productsReturned) || productsReturned.length === 0) {
      return res.status(400).json({ error: 'At least one product must be returned' });
    }

    const enhancedProductsReturned = [];
    let totalLRD = 0;
    let totalUSD = 0;

    for (const item of productsReturned) {
      const product = await Product.findOne({ _id: item.product, store });
      if (!product) {
        return res.status(404).json({ error: `Product ${item.product} not found in store ${store}` });
      }

      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: `Invalid quantity for product ${product.productName}` });
      }

      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { pieces: item.quantity } }
      );

      const itemTotalLRD = product.sellingPriceLRD * item.quantity;
      const itemTotalUSD = product.sellingPriceUSD * item.quantity;
      totalLRD += itemTotalLRD;
      totalUSD += itemTotalUSD;

      enhancedProductsReturned.push({
        product: item.product,
        productName: product.productName,
        quantity: item.quantity,
        priceAtSale: {
          USD: product.sellingPriceUSD,
          LRD: product.sellingPriceLRD
        }
      });
    }

    const transaction = new Transaction({
      type: 'return',
      productsSold: enhancedProductsReturned,
      currency,
      store,
      totalLRD: totalLRD,
      totalUSD: totalUSD,
      returnReason: returnReason || 'No reason provided',
      originalTransaction: originalTransactionId || null
    });

    await transaction.save();
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Return transaction error:', error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  getTransactionsByDate,
  getTransactionsByProduct,
  getTransactionsByDateRange,
  getSalesReport,
  getTopProducts,
  createReturnTransaction
};
