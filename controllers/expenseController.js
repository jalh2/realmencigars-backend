const Expense = require('../models/Expense');

// Create a new expense
const createExpense = async (req, res) => {
  try {
    const { category, description, amount, currency, exchangeRate, date, store } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required for an expense' });
    }

    let amountUSD, amountLRD;

    if (currency === 'USD') {
      amountUSD = amount;
      amountLRD = amount * exchangeRate;
    } else if (currency === 'LRD') {
      amountLRD = amount;
      amountUSD = amount / exchangeRate;
    } else {
      return res.status(400).json({ error: 'Invalid currency specified' });
    }

    const expense = new Expense({
      category,
      description,
      amountUSD,
      amountLRD,
      originalCurrency: currency,
      exchangeRate,
      date,
      store,
    });

    await expense.save();
    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all expenses
const getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, store, allStores } = req.query;
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (store && !allStores) {
        filter.store = store;
    }

    const expenses = await Expense.find(filter).sort({ date: -1 });
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete an expense
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    await Expense.findByIdAndDelete(id);
    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createExpense,
  getExpenses,
  deleteExpense,
};
