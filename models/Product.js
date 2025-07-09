const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  itemID: { type: String, required: true, unique: true },
  productName: { type: String, required: true },
  category: { type: String },
  brand: { type: String },
  quantityInStock: { type: Number, default: 0 },
  unitCost: { type: Number },
  sellingPriceLRD: { type: Number },
  sellingPriceUSD: { type: Number },
  restockLevel: { type: Number, default: 0 },
  supplier: { type: String },
  notes: { type: String },
  barcode: { type: String },
  totalLRD: { type: Number },
  totalUSD: { type: Number },
  barcode: { type: String },
  store: {
    type: String,
    required: true,
    trim: true
  },
  image: { type: String }
}, { timestamps: true });

// Create a compound index for item and store to ensure unique items per store
productSchema.index({ itemID: 1, store: 1 }, { unique: true });

// Pre-save middleware to calculate totals
productSchema.pre('save', function(next) {
  if (this.quantityInStock && this.sellingPriceLRD) {
    this.totalLRD = this.quantityInStock * this.sellingPriceLRD;
  }
  
  if (this.quantityInStock && this.sellingPriceUSD) {
    this.totalUSD = this.quantityInStock * this.sellingPriceUSD;
  }
  
  next();
});

module.exports = mongoose.model('Product', productSchema);
