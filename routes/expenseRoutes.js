const express = require('express');
const router = express.Router();
const { createExpense, getExpenses, deleteExpense } = require('../controllers/expenseController');

// Create a new expense
router.post('/', createExpense);

// Get all expenses
router.get('/', getExpenses);

// Delete an expense
router.delete('/:id', deleteExpense);

module.exports = router;
