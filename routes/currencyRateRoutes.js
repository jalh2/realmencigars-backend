const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const CurrencyRate = require('../models/CurrencyRate');

// Middleware to provide fallback currency rate after timeout
const provideFallbackCurrencyRate = (res, message) => {
  if (res.headersSent) {
    console.error('Headers already sent, cannot provide fallback. Reason:', message);
    return;
  }
  console.log('Providing fallback currency rate. Reason:', message);
  res.status(200).json({ rate: 1.0, fallback: true });
};



// Get current currency rate
router.get('/', async (req, res) => {
  try {
    // Check MongoDB connection state
    if (mongoose.connection.readyState !== 1) {
      return provideFallbackCurrencyRate(res, 'MongoDB not connected');
    }
    
    let rateDoc = await CurrencyRate.findOne().sort({ updatedAt: -1 });
    
    if (!rateDoc) {
      console.log('[CurrencyRate GET] No currency rate found in DB, creating default.');
      rateDoc = await CurrencyRate.create({ lrdToUsd: 1.0, updatedAt: new Date() });
      console.log('[CurrencyRate GET] Default rate created:', JSON.stringify(rateDoc));
    } else {
      console.log('[CurrencyRate GET] Found rate in DB:', JSON.stringify(rateDoc));
    }
    
    // Ensure the field exists before accessing it
    const responseRate = rateDoc && rateDoc.lrdToUsd !== undefined ? rateDoc.lrdToUsd : null;
    if (responseRate === null && rateDoc) {
      console.warn('[CurrencyRate GET] lrdToUsd is missing or undefined on fetched/created document. Document:', JSON.stringify(rateDoc));
    } else if (responseRate === null && !rateDoc) {
      console.warn('[CurrencyRate GET] rateDoc is null, cannot determine rate.');
    }

    res.status(200).json({ rate: responseRate, updatedAt: rateDoc ? rateDoc.updatedAt : new Date() });
  } catch (error) {
    console.error('Error fetching currency rate:', error);
    provideFallbackCurrencyRate(res, error.message);
  }
});

// Update currency rate
router.put('/', async (req, res) => {
  try {
    const { rate } = req.body;
    
    if (!rate || isNaN(rate)) {
      return res.status(400).json({ error: 'Valid rate is required' });
    }
    
    const newRateDoc = await CurrencyRate.create({ 
      lrdToUsd: parseFloat(rate), // Use lrdToUsd
      updatedAt: new Date()
    });
    
    res.status(201).json({ rate: newRateDoc.lrdToUsd, updatedAt: newRateDoc.updatedAt });
  } catch (error) {
    console.error('Error updating currency rate:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;