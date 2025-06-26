const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  amountUSD: {
    type: Number,
    required: true,
  },
  amountLRD: {
    type: Number,
    required: true,
  },
  originalCurrency: {
    type: String,
    required: true,
    enum: ['USD', 'LRD'],
  },
  exchangeRate: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  store: {
    type: String,
    required: true,
  },
});

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
