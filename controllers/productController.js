const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const Credit = require('../models/Credit');

const createProduct = async (req, res) => {
  try {
    const productData = {
      ...req.body,
      image: req.file ? `/uploads/${req.file.filename}` : null
    };

    // Ensure store is provided
    if (!productData.store) {
      throw new Error('Store is required');
    }

    // Calculate totals manually in case they're not provided
    if (productData.quantityInStock && productData.sellingPriceLRD) {
      productData.totalLRD = productData.quantityInStock * productData.sellingPriceLRD;
    }
    
    if (productData.quantityInStock && productData.sellingPriceUSD) {
      productData.totalUSD = productData.quantityInStock * productData.sellingPriceUSD;
    }

    const product = new Product(productData);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const bulkCreateProducts = async (req, res) => {
  try {
    const productsData = req.body; // Array of product objects

    if (!Array.isArray(productsData) || productsData.length === 0) {
      return res.status(400).json({ error: 'Request body must be an array of products.' });
    }

    const createdProducts = [];
    for (const productData of productsData) {
      // Ensure store is provided for each product
      if (!productData.store) {
        throw new Error('Store is required for all products');
      }

      // Create a new product instance and save
      const product = new Product(productData);
      await product.save();
      createdProducts.push(product);
    }

    res.status(201).json({
      message: 'Products created successfully',
      successCount: createdProducts.length,
      products: createdProducts,
    });
  } catch (error) {
    console.error('Error in bulkCreateProducts:', error);
    res.status(400).json({ error: error.message || 'Failed to create products in bulk.' });
  }
};

const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const store = req.query.store;
    const lowStock = req.query.lowStock === 'true';
    const barcode = req.query.barcode;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const query = { store };

    if (lowStock) {
      query.quantityInStock = { $lte: 7 };
    }

    if (barcode) {
      query.barcode = barcode;
    }

    if (search) {
      query.$or = [
        { itemID: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }

    const totalCount = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(lowStock || barcode ? 0 : skip)
      .limit(lowStock || barcode ? 100 : limit);

    res.json({
      products: products,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error in getProducts:', error);
    res.status(500).json({ error: 'Failed to get products', details: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get transactions for this product
    const transactions = await Transaction.find({
      'productsSold.product': product._id,
      type: 'sale'
    });

    let totalSalesLRD = 0;
    let totalSalesUSD = 0;
    let totalQuantitySold = 0;

    transactions.forEach(transaction => {
      const productSold = transaction.productsSold.find(
        p => p.product.toString() === product._id.toString()
      );
      if (productSold) {
        totalQuantitySold += productSold.quantity;
        if (transaction.currency === 'LRD') {
          totalSalesLRD += productSold.quantity * productSold.sellingPriceLRD;
        } else {
          totalSalesUSD += productSold.quantity * productSold.sellingPriceUSD;
        }
      }
    });

    res.json({
      ...product.toObject(),
      totalSalesLRD,
      totalSalesUSD,
      totalQuantitySold
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Calculate totals if pieces or prices are being updated
    if ((updates.quantityInStock || updates.sellingPriceLRD) && (updates.quantityInStock !== undefined || updates.sellingPriceLRD !== undefined)) {
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      const quantityInStock = updates.quantityInStock !== undefined ? updates.quantityInStock : product.quantityInStock;
      const sellingPriceLRD = updates.sellingPriceLRD !== undefined ? updates.sellingPriceLRD : product.sellingPriceLRD;
      
      if (quantityInStock && sellingPriceLRD) {
        updates.totalLRD = quantityInStock * sellingPriceLRD;
      }
    }
    
    if ((updates.quantityInStock || updates.sellingPriceUSD) && (updates.quantityInStock !== undefined || updates.sellingPriceUSD !== undefined)) {
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      const quantityInStock = updates.quantityInStock !== undefined ? updates.quantityInStock : product.quantityInStock;
      const sellingPriceUSD = updates.sellingPriceUSD !== undefined ? updates.sellingPriceUSD : product.sellingPriceUSD;
      
      if (quantityInStock && sellingPriceUSD) {
        updates.totalUSD = quantityInStock * sellingPriceUSD;
      }
    }
    
    const product = await Product.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateProductInventory = async (req, res) => {
  try {
    const updateData = {
      ...req.body
    };

    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }

    // Calculate totals if pieces or prices are being updated
    if ((updateData.quantityInStock || updateData.sellingPriceLRD) && (updateData.quantityInStock !== undefined || updateData.sellingPriceLRD !== undefined)) {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const quantityInStock = updateData.quantityInStock !== undefined ? updateData.quantityInStock : product.quantityInStock;
      const sellingPriceLRD = updateData.sellingPriceLRD !== undefined ? updateData.sellingPriceLRD : product.sellingPriceLRD;
      
      if (quantityInStock && sellingPriceLRD) {
        updateData.totalLRD = quantityInStock * sellingPriceLRD;
      }
    }
    
    if ((updateData.quantityInStock || updateData.sellingPriceUSD) && (updateData.quantityInStock !== undefined || updateData.sellingPriceUSD !== undefined)) {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const quantityInStock = updateData.quantityInStock !== undefined ? updateData.quantityInStock : product.quantityInStock;
      const sellingPriceUSD = updateData.sellingPriceUSD !== undefined ? updateData.sellingPriceUSD : product.sellingPriceUSD;
      
      if (quantityInStock && sellingPriceUSD) {
        updateData.totalUSD = quantityInStock * sellingPriceUSD;
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAllProducts = async (req, res) => {
  try {
    const { store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    // Delete all products for the specified store
    const result = await Product.deleteMany({ store });
    
    res.status(200).json({ 
      message: 'All products deleted successfully', 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error deleting all products:', error);
    res.status(500).json({ error: 'Failed to delete products' });
  }
};

const getInventorySummary = async (req, res) => {
  try {
    const store = req.query.store ? req.query.store.trim() : null;
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    // Fetch all data in parallel
    const [products, transactions, pendingCredits] = await Promise.all([
      Product.find({ store: { $regex: new RegExp(`^${store}$`, 'i') } }),
      Transaction.find({ store, type: 'sale' }),
      Credit.find({ store, status: 'Pending' })
    ]);

    // Calculate inventory summary
    const totalProducts = products.length;
    let totalInventoryValueLRD = 0;
    let totalInventoryValueUSD = 0;
    products.forEach(product => {
      const quantity = product.quantityInStock || 0;
      const priceLRD = product.sellingPriceLRD || 0;
      const priceUSD = product.sellingPriceUSD || 0;
      totalInventoryValueLRD += quantity * priceLRD;
      totalInventoryValueUSD += quantity * priceUSD;
    });

    // Calculate total sales
    let totalSalesLRD = 0;
    let totalSalesUSD = 0;
    transactions.forEach(transaction => {
      totalSalesLRD += transaction.totalLRD || 0;
      totalSalesUSD += transaction.totalUSD || 0;
    });

    // Calculate pending credit
    let pendingCreditLRD = 0;
    let pendingCreditUSD = 0;
    pendingCredits.forEach(credit => {
      pendingCreditLRD += credit.totalLRD || 0;
      pendingCreditUSD += credit.totalUSD || 0;
    });
    const pendingCreditCount = pendingCredits.length;

    res.json({
      totalInventoryValueLRD,
      totalInventoryValueUSD,
      totalSalesLRD,
      totalSalesUSD,
      totalProducts,
      pendingCreditLRD,
      pendingCreditUSD,
      pendingCreditCount,
    });
  } catch (error) {
    console.error('Error in getInventorySummary:', error);
    res.status(500).json({ error: 'Failed to get inventory summary', details: error.message });
  }
};

// Bulk update products from Excel upload
const bulkUpdateProducts = async (req, res) => {
  try {
    const { products } = req.body;
    
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty products array' });
    }

    const results = {
      updated: 0,
      created: 0,
      errors: 0,
      details: []
    };

    for (const item of products) {
      const productName = item.item || item.productName;
      try {
        if (!productName) {
          throw new Error('Product name is missing');
        }

        // Data to be saved in the database, mapping old fields to new schema
        const dbData = { ...item, productName };
        if (dbData.item) delete dbData.item; // remove legacy field

        if (dbData.pieces !== undefined) {
          dbData.quantityInStock = dbData.pieces;
          delete dbData.pieces;
        }
        if (dbData.priceLRD !== undefined) {
          dbData.sellingPriceLRD = dbData.priceLRD;
          delete dbData.priceLRD;
        }
        if (dbData.priceUSD !== undefined) {
          dbData.sellingPriceUSD = dbData.priceUSD;
          delete dbData.priceUSD;
        }

        const existingProduct = await Product.findOne({ 
          productName, 
          store: item.store 
        });

        if (existingProduct) {
          // Update existing product
          const updatedProduct = await Product.findByIdAndUpdate(
            existingProduct._id,
            dbData,
            { new: true, runValidators: true }
          );
          results.updated++;
          results.details.push({ item: productName, status: 'updated', id: updatedProduct._id });
        } else {
          // Create new product
          const newProduct = new Product(dbData);
          await newProduct.save();
          results.created++;
          results.details.push({ item: productName, status: 'created', id: newProduct._id });
        }
      } catch (error) {
        results.errors++;
        results.details.push({ item: productName || 'Unknown', status: 'error', error: error.message });
      }
    }

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  updateProductInventory,
  deleteProduct,
  deleteAllProducts,
  getInventorySummary,
  bulkUpdateProducts,
  bulkCreateProducts
};
