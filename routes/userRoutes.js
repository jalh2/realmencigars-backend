const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  getUsers, 
  updateUserType, 
  getStores,
  changePassword,
  deleteUser,
  getUsersByStore,
  deleteStore
} = require('../controllers/userController');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/stores', getStores);
router.get('/stores/:store/users', getUsersByStore);

// Protected routes (should be admin only)
router.get('/users', getUsers);
router.put('/users/:userId/type', updateUserType);
router.put('/users/:userId/password', changePassword);
router.delete('/users/:userId', deleteUser);
router.delete('/stores/:store', deleteStore);

module.exports = router;
